import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import { createWorkbenchIpcServices } from '../src/main/workbench/ipc/services.ts'
import { authorizeExternalDocPath } from '../src/main/workbench/registry/authorize.ts'
import type { RepoDb } from '../src/main/workbench/repos/types.ts'

// Task 1.7 — the registration-facing reads the UF3 integration needs:
//   probeCodeRoot     the register wizard's REAL step-① probe (forge
//                     availability + task/feature totals) grown by
//                     indexJsonDetected — the conditional migration step's
//                     premise (Interface 4 §8: 注册向导检出 index.json);
//   getWorkbenchPaths the kernel-managed locations the flipped default rides
//                     (docsRoot = the 仓外应用管理路径 prefill, backupsRoot =
//                     the migration confirm's mono 备份位置);
//   getMigrationStatus.indexJsonDetected — the overview card's migratable
//                     判定 half (authority 'files' + index.json present);
//   registerProject app-managed provisioning — the flipped default's
//                     directory is CREATED by the verb assembly (userData
//                     space; user-supplied external paths stay read-only).
//
// Fixture discipline: real scratch trees (the probe's contract is read-only
// fs over the actual filesystem), real userData directories (the paths verb
// answers absolute kernel locations).

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-workbench-probe-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

/** Minimal index.json corpus: one feature, N tasks. */
function writeIndex(tasksRoot: string, entries: Record<string, { id: number; status: string }>): void {
  writeFileSync(join(tasksRoot, 'index.json'), JSON.stringify({ feature: 'demo', tasks: entries }, null, 1))
}

/** A code root carrying an in-repo forge docs tree with tasks/index.json. */
function makeIndexedRepo(taskCount = 2): string {
  const repo = join(makeScratch(), 'repo')
  const tasksRoot = join(repo, 'docs', 'features', 'demo', 'tasks')
  mkdirSync(tasksRoot, { recursive: true })
  const entries: Record<string, { id: number; status: string }> = {}
  for (let index = 1; index <= taskCount; index += 1) entries[`1.${index}-task`] = { id: index, status: 'pending' }
  writeIndex(tasksRoot, entries)
  return repo
}

/** A code root that is a forge checkout ONLY via `.forge/` (no tasks corpus). */
function makeDotForgeRepo(): string {
  const repo = join(makeScratch(), 'repo')
  mkdirSync(join(repo, '.forge'), { recursive: true })
  return repo
}

interface Assembly {
  readonly verbs: ReturnType<typeof createWorkbenchIpcServices>['verbs']
  readonly dispose: () => void
  readonly db: DatabaseSyncLike
  readonly userData: string
}

const openDbs: DatabaseSyncLike[] = []

async function withServices(run: (assembly: Assembly) => void | Promise<void>): Promise<void> {
  const root = makeScratch()
  const userData = join(root, 'userData')
  mkdirSync(userData, { recursive: true })
  const manifest = join(root, 'resources', 'plugin-bundles.json')
  mkdirSync(join(root, 'resources'), { recursive: true })
  writeFileSync(manifest, JSON.stringify({ bundles: [{ name: '@deepseek-ai/dsh-base', mandatory: true }] }))
  const { db } = await openDatabase(userData)
  openDbs.push(db)
  const assembly = createWorkbenchIpcServices({ db: db as RepoDb, pluginBundlesPath: manifest, userDataPath: userData })
  try {
    await run({ verbs: assembly.verbs, dispose: () => assembly.dispose(), db, userData })
  } finally {
    assembly.dispose()
    db.close()
    const idx = openDbs.indexOf(db)
    if (idx >= 0) openDbs.splice(idx, 1)
  }
}

afterEach(() => {
  for (const db of openDbs.splice(0)) db.close()
})

// ---------------------------------------------------------------------------
// probeCodeRoot — the wizard's real step-①/②-advance read
// ---------------------------------------------------------------------------

describe('probeCodeRoot (task 1.7)', () => {
  it('indexed forge repo → available + counts + indexJsonDetected (the conditional step premise)', async () => {
    await withServices(({ verbs }) => {
      const result = verbs.probeCodeRoot({ codeRoot: makeIndexedRepo(3) })
      expect(result).toMatchObject({ available: true, taskTotal: 3, featureTotal: 1, indexJsonDetected: true })
    })
  })

  it('`.forge`-only repo → available, zero corpus, indexJsonDetected false (no spurious migration step)', async () => {
    await withServices(({ verbs }) => {
      const result = verbs.probeCodeRoot({ codeRoot: makeDotForgeRepo() })
      expect(result).toMatchObject({ available: true, taskTotal: 0, featureTotal: 0, indexJsonDetected: false })
    })
  })

  it('missing root → ERR_CODE_ROOT_UNREADABLE; readable non-forge root → ERR_FORGE_NOT_DETECTED', async () => {
    await withServices(({ verbs }) => {
      expect(verbs.probeCodeRoot({ codeRoot: join(makeScratch(), 'missing') }))
        .toMatchObject({ available: false, reasonCode: 'ERR_CODE_ROOT_UNREADABLE' })
      expect(verbs.probeCodeRoot({ codeRoot: makeScratch() }))
        .toMatchObject({ available: false, reasonCode: 'ERR_FORGE_NOT_DETECTED' })
    })
  })

  it('docLocationPath retargets the scan: an external tree with index.json flips the detection', async () => {
    await withServices(({ verbs }) => {
      const codeRoot = makeDotForgeRepo()
      // Repo tree has no corpus; the EXTERNAL doc tree carries one.
      expect(verbs.probeCodeRoot({ codeRoot })).toMatchObject({ indexJsonDetected: false })
      const externalDocs = join(makeScratch(), 'docs')
      const tasksRoot = join(externalDocs, 'docs', 'features', 'demo', 'tasks')
      mkdirSync(tasksRoot, { recursive: true })
      writeIndex(tasksRoot, { '1.1-task': { id: 1, status: 'pending' } })
      expect(verbs.probeCodeRoot({ codeRoot, docLocationPath: externalDocs }))
        .toMatchObject({ available: true, indexJsonDetected: true, taskTotal: 1 })
    })
  })
})

// ---------------------------------------------------------------------------
// getWorkbenchPaths — the flipped default's kernel locations
// ---------------------------------------------------------------------------

describe('getWorkbenchPaths (task 1.7)', () => {
  it('answers the kernel-managed docs/backups roots under <userData>/workbench', async () => {
    await withServices(({ verbs, userData }) => {
      const paths = verbs.getWorkbenchPaths()
      expect(paths.docsRoot).toBe(join(userData, 'workbench', 'docs'))
      expect(paths.backupsRoot).toBe(join(userData, 'workbench', 'backups'))
    })
  })
})

// ---------------------------------------------------------------------------
// getMigrationStatus.indexJsonDetected — the card's migratable judgment
// ---------------------------------------------------------------------------

describe('getMigrationStatus indexJsonDetected (task 1.7)', () => {
  it('files authority + index.json present → true; absent corpus → false; sqlite (migrated) → false', async () => {
    await withServices(({ verbs }) => {
      const indexed = verbs.registerProject({ codeRoot: makeIndexedRepo(1), docLocationType: 'in_repo' })
      expect(verbs.getMigrationStatus(indexed.id))
        .toMatchObject({ authority: 'files', indexJsonDetected: true })

      const bare = verbs.registerProject({ codeRoot: makeDotForgeRepo(), docLocationType: 'in_repo' })
      expect(verbs.getMigrationStatus(bare.id))
        .toMatchObject({ authority: 'files', indexJsonDetected: false })
    })
  })

  it('a completed migration flips authority to sqlite and retires the detection (archived index)', async () => {
    await withServices(async ({ verbs }) => {
      const project = verbs.registerProject({ codeRoot: makeIndexedRepo(1), docLocationType: 'in_repo' })
      await verbs.startMigration(project.id)
      const status = verbs.getMigrationStatus(project.id)
      expect(status).toMatchObject({ authority: 'sqlite', indexJsonDetected: false, migratedAt: expect.any(String) })
    })
  })
})

// ---------------------------------------------------------------------------
// registerProject app-managed provisioning — the flipped default's real chain
// ---------------------------------------------------------------------------

describe('app-managed doc root provisioning (task 1.7, G7/SC9)', () => {
  it('external path under the kernel docsRoot is created by the verb (no pre-existing dir needed)', async () => {
    await withServices(({ verbs, db, userData }) => {
      const codeRoot = makeDotForgeRepo()
      const managed = join(userData, 'workbench', 'docs', 'repo')
      expect(existsSync(managed)).toBe(false)
      authorizeExternalDocPath(db as RepoDb, managed)
      const project = verbs.registerProject({ codeRoot, docLocationType: 'external', docLocationPath: managed })
      expect(project.docLocationPath).toBe(managed.replaceAll('\\', '/'))
      expect(existsSync(managed)).toBe(true)
    })
  })

  it('user-supplied external paths keep the read-only chain: missing dir → ERR_EXTERNAL_PATH_UNREADABLE, nothing created', async () => {
    await withServices(({ verbs, db, userData }) => {
      const codeRoot = makeDotForgeRepo()
      // Outside the kernel docsRoot → never provisioned.
      const userPath = join(userData, 'elsewhere', 'docs')
      authorizeExternalDocPath(db as RepoDb, userPath)
      expect(() =>
        verbs.registerProject({ codeRoot, docLocationType: 'external', docLocationPath: userPath }),
      ).toThrowError(/not a readable directory/)
      expect(existsSync(userPath)).toBe(false)
    })
  })
})
