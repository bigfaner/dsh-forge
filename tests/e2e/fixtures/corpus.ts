// tests/e2e/fixtures/corpus — 两类项目语料(任务 6.2 base;SC1/SC2/SC9 的数据半).
//
//   ① 未迁移语料(带 index.json + 任务 md)— the M2 6.1 writer verbatim
//      (`apps/desktop/e2e/fixtures/{task-generator,forge-project}.ts`,
//      deterministic seed → byte-stable tree in the live-repo dialect). The
//      registration wizard's 检出 chain + one-shot migration consume this
//      shape (SC1/SC9 legs register it; the SC2 leg migrates it live).
//
//   ② 已迁移语料(仅 SQLite + `.migrated` 归档)— built through the REAL
//      kernel chain, never hand-rolled SQLite: write tree ① → openDatabase
//      (the app's own `<userData>/workbench/workbench.db` placement) →
//      registerProject → scanForgeFiles (the snapshot projection the verify
//      phase compares against) → startMigration (Interface 4 steps 1-6:
//      guard → backup → ingest → verify → switch → archive). The returned
//      userData boots the app pre-migrated (`data_authority='sqlite'`,
//      index.json gone, `index.json.migrated-<ts>` in place, md bytes
//      untouched) — exactly the post-SC2 state later legs start from.
//
// Hard Rules: every tree lives under a caller-owned temp root (nothing
// committed, nothing written into this repo); the migrated userData is a
// per-fixture temp dir — never the dev machine's real userData.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateTaskSet, type GeneratedTaskSet } from '../../../apps/desktop/e2e/fixtures/task-generator.ts'
import { writeForgeProject, type WrittenForgeProject } from '../../../apps/desktop/e2e/fixtures/forge-project.ts'
import { openDatabase } from '../../../apps/desktop/src/main/workbench/store/db.ts'
import { registerProject } from '../../../apps/desktop/src/main/workbench/repos/projects.ts'
import { scanForgeFiles } from '../../../apps/desktop/src/main/workbench/indexer/scan.ts'
import { createMigrationService, listMigrationEvents, type MigrationEventRecord } from '../../../apps/desktop/src/main/workbench/migration/pipeline.ts'
import { listTasks } from '../../../apps/desktop/src/main/workbench/tasks/task-repo.ts'
import type { Project, RepoDb } from '../../../apps/desktop/src/main/workbench/repos/types.ts'

/** Corpus preset (deterministic; small for leg speed — SC1's 500-task leg passes its own options). */
export interface CorpusOptions {
  /** Generator seed (same seed ⇒ same tree bytes). */
  readonly seed?: string
  readonly taskCount?: number
  readonly featureCount?: number
  /** Separate docs root → the 仓外 doc_location shape (SC9). */
  readonly docsRoot?: string
}

/** The deterministic default corpus shape (24 tasks / 4 features). */
export const DEFAULT_CORPUS: Required<Pick<CorpusOptions, 'seed' | 'taskCount' | 'featureCount'>> = {
  seed: 'dsh-forge-m3-e2e-base',
  taskCount: 24,
  featureCount: 4,
}

function corpusSet(options: CorpusOptions): GeneratedTaskSet {
  return generateTaskSet({
    seed: options.seed ?? DEFAULT_CORPUS.seed,
    taskCount: options.taskCount ?? DEFAULT_CORPUS.taskCount,
    featureCount: options.featureCount ?? DEFAULT_CORPUS.featureCount,
  })
}

/** Task description .md paths of a written corpus (the SC2 md-原样 assertion set). */
function descriptionPaths(set: GeneratedTaskSet, docsRoot: string): string[] {
  return set.features.flatMap(feature =>
    feature.tasks.map(task => join(docsRoot, 'docs', 'features', feature.slug, 'tasks', `${task.stem}.md`)))
}

/**
 * ① Write the UNMIGRATED corpus (index.json + task md present) into a fresh
 * subdirectory of `root`. Reuses the M2 writer byte-for-byte — the dialect
 * the indexer consumes — and returns its written-project facts plus the
 * generated set (stems for md-level assertions).
 */
export function writeUnmigratedCorpus(root: string, options: CorpusOptions = {}): WrittenForgeProject & { readonly set: GeneratedTaskSet } {
  const set = corpusSet(options)
  const written = writeForgeProject(set, { codeRoot: join(root, 'repo'), ...(options.docsRoot === undefined ? {} : { docsRoot: options.docsRoot }) })
  return { ...written, set }
}

/** Facts about a MIGRATED corpus (②) — what the legs assert against. */
export interface MigratedCorpusFacts {
  readonly project: Project
  readonly codeRoot: string
  readonly docsRoot: string
  /** Boot this as DSH_FORGE_USER_DATA → the app opens the pre-migrated kernel. */
  readonly userDataDir: string
  readonly dbPath: string
  /** `index.json.migrated-<ts>` per feature (the archive face of SC2). */
  readonly archivedIndexes: ReadonlyArray<{ readonly slug: string; readonly path: string }>
  /** md description bodies preserved verbatim (path → bytes at build time). */
  readonly markdownBodies: ReadonlyArray<{ readonly path: string; readonly bytes: string }>
  /** Authoritative task rows ingested (the SoT the board reads). */
  readonly taskCount: number
  /** migration_event audit trail (phase/result rows). */
  readonly events: readonly MigrationEventRecord[]
}

/** Locate the archived index of one feature after migration (`index.json.migrated-<ts>`). */
function archivedIndexOf(indexPath: string): { slug: string; path: string } | undefined {
  const tasksDir = join(indexPath, '..')
  const slug = basename(join(tasksDir, '..'))
  const candidate = readdirSync(tasksDir).find(name => name.startsWith('index.json.migrated-'))
  return candidate === undefined ? undefined : { slug, path: join(tasksDir, candidate) }
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(part => part !== '').pop() as string
}

/**
 * ② Build the MIGRATED corpus through the REAL kernel chain (write →
 * register → scan → migrate), leaving `userDataDir` holding a workbench.db
 * whose project is already `data_authority='sqlite'`. The db is CLOSED on
 * return — the app (or a later fixture) reopens it.
 */
export async function buildMigratedCorpus(userDataDir: string, root: string, options: CorpusOptions = {}): Promise<MigratedCorpusFacts> {
  const external = options.docsRoot !== undefined
  const written = writeUnmigratedCorpus(root, options)
  const markdownBodies = descriptionPaths(written.set, written.docsRoot)
    .filter(path => existsSync(path))
    .map(path => ({ path, bytes: readFileSync(path, 'utf8') }))

  const { db, path: dbPath } = await openDatabase(userDataDir)
  try {
    const project = registerProject(db, {
      codeRoot: written.codeRoot,
      docLocationType: external ? 'external' : 'in_repo',
      ...(external ? { docLocationPath: written.docsRoot } : {}),
    })
    scanForgeFiles(db, { id: project.id, codeRoot: written.codeRoot, docLocationPath: external ? written.docsRoot : null })
    const service = createMigrationService({
      db: db as RepoDb,
      userDataPath: userDataDir,
      loadProject: id => (id === project.id ? project : null),
      onEvent: () => {}, // no UI subscriber in the fixture process
    })
    await service.startMigration(project.id)

    const archivedIndexes = written.indexPaths
      .map(({ path }) => archivedIndexOf(path))
      .filter((entry): entry is { slug: string; path: string } => entry !== undefined)
    return {
      project,
      codeRoot: written.codeRoot,
      docsRoot: written.docsRoot,
      userDataDir,
      dbPath,
      archivedIndexes,
      markdownBodies,
      taskCount: listTasks(db as RepoDb, project.id).length,
      events: listMigrationEvents(db as RepoDb, project.id),
    }
  } finally {
    db.close()
  }
}
