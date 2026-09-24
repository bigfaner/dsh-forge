// Task 6.4 (M3) — the migration fault-injection env seam (SC2's 失败重试 leg).
//
// Authorities: tasks/6.4-sc2-migration.md (AC-3 「失败注入经基座 stub 开关」
// — the 6.2 stub-switch env-seam family grows its migration member),
// tech-design §Interface 4 (rollback → retry idempotence: 失败后状态 ≡ 迁移前
// 态), session-channel-stub.ts (the env-seam family precedent: TEST-ONLY,
// control-file-backed, re-read per call, unset → production bytes untouched).
//
// Two contracts under test:
//   1. the host half (`migration/faults-stub.ts`): env unset → seam off;
//      control file re-read on EVERY resolve (the retry leg rewrites it
//      between attempts — a launch-time snapshot would make retry unfailable
//      or unfixable); malformed / invalid-typed fields never fault anything;
//   2. the pipeline's resolver support (`faults` may be a per-run resolver):
//      one service instance → attempt 1 fails (archive fault → wholesale
//      rollback, zero half-migration) → control cleared → attempt 2 (retry)
//      succeeds. That per-run re-evaluation is the kernel half of the SC2
//      retry journey.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import { registerProject } from '../src/main/workbench/repos/projects.ts'
import { scanForgeFiles } from '../src/main/workbench/indexer/scan.ts'
import type { Project, RepoDb } from '../src/main/workbench/repos/types.ts'
import { listTasks } from '../src/main/workbench/tasks/task-repo.ts'
import { createMigrationService, listMigrationEvents } from '../src/main/workbench/migration/pipeline.ts'
import {
  MIGRATION_FAULTS_ENV,
  createMigrationFaultsResolver,
  readMigrationFaultsFile,
} from '../src/main/workbench/migration/faults-stub.ts'

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-migfaults-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

// ---------------------------------------------------------------------------
// The host half: env → per-call control-file resolution
// ---------------------------------------------------------------------------

describe('migration faults env seam (faults-stub)', () => {
  it('env unset / empty → the resolver answers undefined (seam off)', () => {
    expect(createMigrationFaultsResolver({})()).toBeUndefined()
    expect(createMigrationFaultsResolver({ [MIGRATION_FAULTS_ENV]: '' })()).toBeUndefined()
    expect(createMigrationFaultsResolver({ [MIGRATION_FAULTS_ENV]: '   ' })()).toBeUndefined()
  })

  it('resolves the control file and re-reads it on EVERY call (retry-leg contract)', () => {
    const dir = makeScratch()
    const control = join(dir, 'control.json')
    const env = { [MIGRATION_FAULTS_ENV]: control }
    const resolve = createMigrationFaultsResolver(env)

    writeFileSync(control, JSON.stringify({ failArchiveForSlug: true }))
    expect(resolve()).toEqual({ failArchiveForSlug: true })

    writeFileSync(control, JSON.stringify({ failIngestAfterRows: 3 }))
    expect(resolve()).toEqual({ failIngestAfterRows: 3 })

    // The retry leg's clear step: absent control → no faults.
    rmSync(control, { force: true })
    expect(resolve()).toBeUndefined()
  })

  it('malformed / non-object / invalid-typed control content never faults', () => {
    const dir = makeScratch()
    const control = join(dir, 'control.json')
    expect(readMigrationFaultsFile(join(dir, 'absent.json'))).toBeUndefined()

    for (const bad of ['{ nope', '"a string"', '[1,2]', 'null', '']) {
      writeFileSync(control, bad)
      expect(readMigrationFaultsFile(control), `raw <${bad}> must resolve to no faults`).toBeUndefined()
    }

    // Field-level shape discipline: wrong types drop the field (never fault).
    writeFileSync(control, JSON.stringify({ failIngestAfterRows: 'three', failArchiveForSlug: 7, extra: 1 }))
    expect(readMigrationFaultsFile(control)).toBeUndefined()

    writeFileSync(control, JSON.stringify({ failIngestAfterRows: 2.5 }))
    expect(readMigrationFaultsFile(control)).toBeUndefined()

    writeFileSync(control, JSON.stringify({ failIngestAfterRows: -1 }))
    expect(readMigrationFaultsFile(control)).toBeUndefined()

    writeFileSync(control, JSON.stringify({ failArchiveForSlug: '' }))
    expect(readMigrationFaultsFile(control)).toBeUndefined()

    // Valid fields survive beside invalid ones.
    writeFileSync(control, JSON.stringify({ failIngestAfterRows: 'x', failArchiveForSlug: 'feat-b', nope: true }))
    expect(readMigrationFaultsFile(control)).toEqual({ failArchiveForSlug: 'feat-b' })
  })

  it('valid edge values resolve (0 rows, true, named slug)', () => {
    const dir = makeScratch()
    const control = join(dir, 'control.json')
    writeFileSync(control, JSON.stringify({ failIngestAfterRows: 0 }))
    expect(readMigrationFaultsFile(control)).toEqual({ failIngestAfterRows: 0 })
    writeFileSync(control, JSON.stringify({ failArchiveForSlug: true }))
    expect(readMigrationFaultsFile(control)).toEqual({ failArchiveForSlug: true })
  })
})

// ---------------------------------------------------------------------------
// The pipeline half: resolver re-evaluated per startMigration (fail → clear → retry ok)
// ---------------------------------------------------------------------------

/** A two-feature / two-task forge tree (the minimal archive-loop shape). */
function buildTwoFeatureTree(codeRoot: string): string {
  const featuresRoot = join(codeRoot, 'docs', 'features')
  mkdirSync(featuresRoot, { recursive: true })
  for (const slug of ['feat-a', 'feat-b']) {
    const featureDir = join(featuresRoot, slug)
    const tasksDir = join(featureDir, 'tasks')
    mkdirSync(tasksDir, { recursive: true })
    writeFileSync(
      join(featureDir, 'manifest.md'),
      `---\nfeature: "${slug}"\ncreated: "2026-09-20"\nstatus: tasks\n---\n\n# Feature: ${slug}\n`,
    )
    const entries: Record<string, Record<string, unknown>> = {}
    for (const id of ['1.1', '1.2']) {
      const stem = `${id}-s`
      entries[stem] = { id, title: `${slug} ${id}`, priority: 'P0', status: 'pending', file: `${stem}.md` }
      writeFileSync(join(tasksDir, `${stem}.md`), `---\nid: "${id}"\ntitle: "${slug} ${id}"\n---\n\nbody\n`)
    }
    writeFileSync(join(tasksDir, 'index.json'), JSON.stringify({ feature: slug, tasks: entries }, null, 1))
  }
  return featuresRoot
}

describe('migration pipeline × resolver faults (SC2 retry kernel contract)', () => {
  it('attempt 1 fails at archive → wholesale rollback; clear → retry succeeds on the SAME service', async () => {
    const root = makeScratch()
    const userData = join(root, 'user-data')
    mkdirSync(userData, { recursive: true })
    const codeRoot = join(root, 'repo')
    const featuresRoot = buildTwoFeatureTree(codeRoot)
    const control = join(root, 'fault-control.json')

    const { db } = await openDatabase(userData)
    try {
      const project: Project = registerProject(db, { codeRoot, docLocationType: 'in_repo' })
      scanForgeFiles(db, { id: project.id, codeRoot, docLocationPath: null })

      const service = createMigrationService({
        db: db as RepoDb,
        userDataPath: userData,
        loadProject: id => (id === project.id ? project : null),
        onEvent: () => {},
        faults: createMigrationFaultsResolver({ [MIGRATION_FAULTS_ENV]: control }),
      })

      // Attempt 1: archive faults on the LAST feature (feat-b) — feat-a is
      // already renamed when the fault throws (the doc-tree half-migration
      // risk point the rollback must undo).
      writeFileSync(control, JSON.stringify({ failArchiveForSlug: 'feat-b' }))
      await expect(service.startMigration(project.id)).rejects.toThrow(/injected archive failure/)

      // Zero half-migration (the rolled-back state ≡ pre-migration):
      expect(listTasks(db as RepoDb, project.id)).toEqual([])
      const row = db
        .prepare('SELECT data_authority, migrated_at, backup_path FROM projects WHERE id = ?')
        .get(project.id) as { data_authority: string; migrated_at: string | null; backup_path: string | null }
      expect(row.data_authority).toBe('files')
      expect(row.migrated_at).toBeNull()
      expect(row.backup_path).toBeNull()
      for (const slug of ['feat-a', 'feat-b']) {
        expect(existsSync(join(featuresRoot, slug, 'tasks', 'index.json')), `${slug} index.json restored`).toBe(true)
        expect(readdirSync(join(featuresRoot, slug, 'tasks')).some(name => name.startsWith('index.json.migrated-')),
          `${slug} holds no archive leftover`).toBe(false)
      }
      const events = listMigrationEvents(db as RepoDb, project.id)
      expect(events.some(event => event.phase === 'archive' && event.result === 'fail')).toBe(true)
      expect(events.some(event => event.phase === 'rollback' && event.result === 'ok')).toBe(true)

      // The retry leg: clear the control file → the SAME service resolves no
      // faults on the next run → the full chain succeeds.
      rmSync(control, { force: true })
      await expect(service.startMigration(project.id)).resolves.toEqual({ started: true })
      expect(listTasks(db as RepoDb, project.id).length).toBe(4)
      const after = db
        .prepare('SELECT data_authority FROM projects WHERE id = ?')
        .get(project.id) as { data_authority: string }
      expect(after.data_authority).toBe('sqlite')
      for (const slug of ['feat-a', 'feat-b']) {
        expect(existsSync(join(featuresRoot, slug, 'tasks', 'index.json')), `${slug} index.json retired`).toBe(false)
        expect(readdirSync(join(featuresRoot, slug, 'tasks')).some(name => name.startsWith('index.json.migrated-'))).toBe(true)
      }
      // The audit keeps BOTH attempts (fail trail + the successful rerun).
      const trail = listMigrationEvents(db as RepoDb, project.id)
      expect(trail.filter(event => event.result === 'ok' && event.phase === 'archive').length).toBe(1)
      const archivedName = readdirSync(join(featuresRoot, 'feat-a', 'tasks')).find(name => name.startsWith('index.json.migrated-')) as string
      expect(readFileSync(join(featuresRoot, 'feat-a', 'tasks', archivedName), 'utf8'),
        'archived bytes are the rename of the original (no rewrite)').toContain('"feat-a"')
    } finally {
      ;(db as DatabaseSyncLike).close()
    }
  })
})
