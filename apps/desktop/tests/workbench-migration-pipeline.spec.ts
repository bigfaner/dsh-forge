import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import { registerProject } from '../src/main/workbench/repos/projects.ts'
import { upsertTaskSnapshot } from '../src/main/workbench/repos/task-snapshots.ts'
import type { Project, RepoDb } from '../src/main/workbench/repos/types.ts'
import { scanForgeFiles } from '../src/main/workbench/indexer/scan.ts'
import type { WorkbenchEvent } from '../src/main/workbench/indexer/diff.ts'
import { listTasks } from '../src/main/workbench/tasks/task-repo.ts'
import {
  createMigrationService,
  listMigrationEvents,
  MigrationDomainError,
  type MigrationEventRecord,
  type MigrationFaults,
  type MigrationService,
} from '../src/main/workbench/migration/pipeline.ts'
import { migrationBackupsRoot } from '../src/main/workbench/migration/backup.ts'

// Task 1.4 (M3) — the one-shot explicit migration pipeline (Interface 4 steps
// 1-6, kernel side): guard → backup → ingest → verify → switch → archive, with
// migration_event audit + migration_progress events and wholesale rollback on
// any injected failure. Authorities: tech-design §Interface 4 / §Interface 1
// (verb + event contracts), design/schema.sql §9 (migration_event), prd-spec
// G2/SC2 + Data Requirements (one-shot / atomic / auto-backup / rollback-
// retryable / md 原样), TECH-data-kernel-003 (qualified task keys).
//
// Fixtures: corpus.json materialized into a tmp forge project (deterministic
// mtimes), scanned once so task_snapshot carries the derived projection the
// verify phase compares against. Fault injection goes through the pipeline's
// test-only `faults` seam (ingest mid-row / archive rename); the verify-diff
// leg tampers a snapshot row directly (the natural drift source).

type ProgressEvent = Extract<WorkbenchEvent, { type: 'migration_progress' }>

interface CorpusTask {
  readonly id: string
  readonly stem: string
  readonly title: string
  readonly status: string
  readonly type?: string
  readonly dependencies?: readonly string[]
  readonly record?: boolean
}

interface CorpusFeature {
  readonly slug: string
  readonly manifestStatus: string
  readonly tasks: readonly CorpusTask[]
}

interface Corpus {
  readonly features: readonly CorpusFeature[]
}

const fixturesUrl = new URL('../src/main/workbench/migration/__fixtures__/', import.meta.url)
const corpus: Corpus = JSON.parse(readFileSync(new URL('corpus.json', fixturesUrl), 'utf8'))

const CORPUS_TASK_TOTAL = corpus.features.reduce((sum, feature) => sum + feature.tasks.length, 0)
const CORPUS_SLUGS = corpus.features.map(feature => feature.slug).sort()

// Deterministic clock: one fixed instant for stamps/audit timestamps.
const FIXED_NOW = new Date(Date.UTC(2026, 8, 24, 6, 0, 0))
const FIXED_STAMP = '2026-09-24T06-00-00-000Z'
const T0 = Date.UTC(2026, 8, 20, 0, 0, 0)
const DAY = 86_400_000

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-migration-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

function touch(path: string, epochMs: number): void {
  const time = new Date(epochMs)
  utimesSync(path, time, time)
}

// ---------------------------------------------------------------------------
// Corpus → tmp forge project (dialect: manifest.md / tasks/<stem>.md /
// records/<stem>.md / tasks/index.json; deterministic mtimes)
// ---------------------------------------------------------------------------

function buildForgeTree(codeRoot: string): string {
  const featuresRoot = join(codeRoot, 'docs', 'features')
  mkdirSync(featuresRoot, { recursive: true })
  let dayOffset = 1
  for (const feature of corpus.features) {
    const featureDir = join(featuresRoot, feature.slug)
    const tasksDir = join(featureDir, 'tasks')
    mkdirSync(join(tasksDir, 'records'), { recursive: true })
    writeFileSync(
      join(featureDir, 'manifest.md'),
      `---\nfeature: "${feature.slug}"\ncreated: "2026-09-20"\nstatus: ${feature.manifestStatus}\n---\n\n# Feature: ${feature.slug}\n`,
    )
    touch(join(featureDir, 'manifest.md'), T0)

    const entries: Record<string, Record<string, unknown>> = {}
    for (const task of feature.tasks) {
      entries[task.stem] = {
        id: task.id,
        title: task.title,
        priority: 'P0',
        status: task.status,
        file: `${task.stem}.md`,
        record: `records/${task.stem}.md`,
        ...(task.type !== undefined ? { type: task.type } : {}),
        ...(task.dependencies !== undefined && task.dependencies.length > 0
          ? { dependencies: [...task.dependencies] }
          : {}),
      }
      writeFileSync(
        join(tasksDir, `${task.stem}.md`),
        `---\nid: "${task.id}"\ntitle: "${task.title}"\npriority: "P0"\n---\n\n# ${task.id}: ${task.title}\n\n## Acceptance Criteria\n- [ ] works\n`,
      )
      touch(join(tasksDir, `${task.stem}.md`), T0 + dayOffset * DAY)
      if (task.record === true) {
        const recordPath = join(tasksDir, 'records', `${task.stem}.md`)
        writeFileSync(
          recordPath,
          `---\nstatus: "completed"\nstarted: "2026-09-21 09:00"\ncompleted: "2026-09-21 09:30"\ntime_spent: "~30m"\n---\n\n# Task Record: ${task.id}\n\n## Summary\nExecuted ${task.id}.\n`,
        )
        touch(recordPath, T0 + (dayOffset + 10) * DAY)
      }
      dayOffset += 1
    }
    const indexPath = join(tasksDir, 'index.json')
    writeFileSync(indexPath, JSON.stringify({ feature: feature.slug, tasks: entries }, null, 1))
    touch(indexPath, T0)
  }
  return featuresRoot
}

// ---------------------------------------------------------------------------
// Harness: db + scanned project + migration service (fault/clock seams)
// ---------------------------------------------------------------------------

interface Harness {
  readonly db: DatabaseSyncLike
  readonly project: Project
  readonly codeRoot: string
  readonly featuresRoot: string
  readonly userData: string
  readonly events: ProgressEvent[]
  /** Fresh service over the same db (per-call faults / event capture). */
  makeService(faults?: MigrationFaults): MigrationService
  /** Re-scan the doc tree (snapshot parity restoration for retry legs). */
  rescan(): void
}

async function withHarness(run: (harness: Harness) => void | Promise<void>): Promise<void> {
  const root = makeScratch()
  const userData = join(root, 'user-data')
  mkdirSync(userData, { recursive: true })
  const codeRoot = join(root, 'repo')
  const featuresRoot = buildForgeTree(codeRoot)
  const { db } = await openDatabase(userData)
  const project = registerProject(db, { codeRoot, docLocationType: 'in_repo' })
  scanForgeFiles(db, { id: project.id, codeRoot, docLocationPath: null })
  const events: ProgressEvent[] = []
  const makeService = (faults?: MigrationFaults): MigrationService =>
    createMigrationService({
      db: db as RepoDb,
      userDataPath: userData,
      loadProject: id => (id === project.id ? project : null),
      onEvent: (event) => {
        if (event.type === 'migration_progress') events.push(event)
      },
      now: () => FIXED_NOW,
      faults,
    })
  try {
    await run({
      db,
      project,
      codeRoot,
      featuresRoot,
      userData,
      events,
      makeService,
      rescan: () => {
        scanForgeFiles(db, { id: project.id, codeRoot, docLocationPath: null })
      },
    })
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

interface MdFingerprint {
  readonly content: string
  readonly mtimeMs: number
}

/** tasks/*.md + tasks/records/*.md fingerprint(md 纪律断言锚;index.json 不在面内)。 */
function fingerprintDocTree(featuresRoot: string): Map<string, MdFingerprint> {
  const prints = new Map<string, MdFingerprint>()
  for (const slug of readdirSync(featuresRoot, { withFileTypes: true }).filter(dirent => dirent.isDirectory()).map(dirent => dirent.name)) {
    const tasksDir = join(featuresRoot, slug, 'tasks')
    if (!existsSync(tasksDir)) continue
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(path)
        } else if (entry.name.endsWith('.md')) {
          prints.set(path.replaceAll('\\', '/'), {
            content: readFileSync(path, 'utf8'),
            mtimeMs: statSync(path).mtimeMs,
          })
        }
      }
    }
    walk(tasksDir)
  }
  return prints
}

function expectMdUntouched(before: Map<string, MdFingerprint>, featuresRoot: string): void {
  const after = fingerprintDocTree(featuresRoot)
  expect([...after.keys()].sort()).toEqual([...before.keys()].sort())
  for (const [path, print] of after) {
    const prior = before.get(path)
    expect(prior, `md file set must be stable (${path})`).toBeDefined()
    expect(print.content, `md content must be untouched (${path})`).toBe(prior?.content)
    expect(print.mtimeMs, `md mtime must be untouched (${path})`).toBe(prior?.mtimeMs)
  }
}

function authorityOf(db: DatabaseSyncLike, projectId: string): string {
  const row = db.prepare('SELECT data_authority FROM projects WHERE id = ?').get(projectId) as { data_authority: string }
  return row.data_authority
}

interface ProjectMigrationColumns {
  readonly data_authority: string
  readonly migrated_at: string | null
  readonly backup_path: string | null
}

function projectRowOf(db: DatabaseSyncLike, projectId: string): ProjectMigrationColumns {
  return db
    .prepare('SELECT data_authority, migrated_at, backup_path FROM projects WHERE id = ?')
    .get(projectId) as ProjectMigrationColumns
}

function taskRowCount(db: DatabaseSyncLike, projectId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM task WHERE project_id = ?').get(projectId) as { n: number | bigint }
  return Number(row.n)
}

/** 每 feature 的 index.json / .migrated-* 现状。 */
function indexStateOf(featuresRoot: string, slug: string): { indexExists: boolean; archived: string[] } {
  const tasksDir = join(featuresRoot, slug, 'tasks')
  const names = readdirSync(tasksDir)
  return {
    indexExists: names.includes('index.json'),
    archived: names.filter(name => /^index\.json\.migrated-/.test(name)),
  }
}

function eventsOfPhases(rows: readonly MigrationEventRecord[]): Array<[string, string]> {
  return rows.map(row => [row.phase, row.result] as [string, string])
}

function expectMigrationError(error: unknown, code: string, messagePattern?: RegExp): void {
  expect(error, `expected MigrationDomainError ${code}, got ${String(error)}`).toBeInstanceOf(MigrationDomainError)
  const migrationError = error as MigrationDomainError
  expect(migrationError.code).toBe(code)
  if (messagePattern !== undefined) expect(migrationError.message).toMatch(messagePattern)
}

function toCapture(fn: () => unknown): unknown {
  try {
    return fn()
  } catch (error) {
    return error
  }
}

// ---------------------------------------------------------------------------
// AC-1 — full chain over the tmp-tree fixture
// ---------------------------------------------------------------------------

describe('workbench/migration pipeline — full chain (AC-1, AC-4, AC-5)', () => {
  it('runs guard → backup → ingest → verify → switch → archive in order and ends sqlite-authoritative with archived indexes', async () => {
    await withHarness(async ({ db, project, featuresRoot, userData, events, makeService }) => {
      const mdBefore = fingerprintDocTree(featuresRoot)
      const before = makeService().getMigrationStatus(project.id)
      expect(before).toMatchObject({ authority: 'files', deviated: false, migratedAt: null, lastEvent: null })

      const outcome = await makeService().startMigration(project.id)
      expect(outcome).toEqual({ started: true })

      // 切读置位 + 迁移元数据(projects 增列)。
      const row = projectRowOf(db, project.id)
      expect(row.data_authority).toBe('sqlite')
      expect(row.migrated_at).toBe(FIXED_NOW.toISOString())
      expect(row.backup_path).not.toBeNull()
      expect(row.backup_path).toContain(join('workbench', 'backups'))
      expect(existsSync(row.backup_path as string)).toBe(true)

      // 归档:index.json 淘汰为 .migrated-<ts>(零内容改写 = 只改名)。
      for (const slug of CORPUS_SLUGS) {
        const state = indexStateOf(featuresRoot, slug)
        expect(state.indexExists, `${slug}/tasks/index.json must be gone`).toBe(false)
        expect(state.archived).toEqual([`index.json.migrated-${FIXED_STAMP}`])
      }

      // 备份内容:库文件 + 文档树 tasks/ 拷贝。
      const backupPath = row.backup_path as string
      expect(existsSync(join(backupPath, 'workbench.db'))).toBe(true)
      for (const slug of CORPUS_SLUGS) {
        expect(existsSync(join(backupPath, 'tasks', slug, 'index.json'))).toBe(true)
      }
      expect(userData).toContain('user-data') // 备份落 userData 默认权限路径

      // 摄入全集:限定地址/状态/依赖(悬空原词)/标题 + task_type/desc_path 推断。
      const tasks = listTasks(db as RepoDb, project.id)
      expect(tasks).toHaveLength(CORPUS_TASK_TOTAL)
      const byKey = new Map(tasks.map(task => [task.taskKey, task]))
      expect([...byKey.keys()].sort()).toEqual(
        corpus.features.flatMap(feature => feature.tasks.map(task => `${feature.slug}/${task.id}`)).sort(),
      )
      const gate = byKey.get('checkout-flow/1.gate')
      expect(gate).toMatchObject({ status: 'completed', title: 'Phase 1 gate', taskType: 'gate', blockers: ['1.1'], updatedBy: 'kernel' })
      expect(byKey.get('checkout-flow/2.1')?.blockers).toEqual(['1.2', '9.9']) // 悬空 blocker 原词
      expect(byKey.get('checkout-flow/2.2')?.blockers).toEqual(['2.x']) // 通配依赖原词
      expect(byKey.get('settings-panel/5.gate')?.status).toBe('pending')
      expect(byKey.get('checkout-flow/1.1')?.descPath).toBe('checkout-flow/tasks/1.1-spike.md')
      expect(byKey.get('checkout-flow/T-review-doc')?.taskType).toBe('doc')

      // migration_event 逐相留档:五相全 ok;verify detail 含对拍报告(零差异)。
      const audit = listMigrationEvents(db as RepoDb, project.id)
      expect(eventsOfPhases(audit)).toEqual([
        ['backup', 'ok'],
        ['ingest', 'ok'],
        ['verify', 'ok'],
        ['switch', 'ok'],
        ['archive', 'ok'],
      ])
      const verifyDetail = JSON.parse(audit.find(event => event.phase === 'verify')?.detailJson ?? '{}')
      expect(verifyDetail).toMatchObject({ ok: true, taskCount: CORPUS_TASK_TOTAL, snapshotCount: CORPUS_TASK_TOTAL, mismatches: [] })

      // migration_progress 事件按 phase 推送(成功路径五相)。
      expect(events.map(event => [event.phase, event.result] as [string, string])).toEqual([
        ['backup', 'ok'],
        ['ingest', 'ok'],
        ['verify', 'ok'],
        ['switch', 'ok'],
        ['archive', 'ok'],
      ])

      // 状态读取终态:lastEvent = archive ok。
      const after = makeService().getMigrationStatus(project.id)
      expect(after).toMatchObject({ authority: 'sqlite', deviated: false, migratedAt: FIXED_NOW.toISOString() })
      expect(after.lastEvent).toMatchObject({ phase: 'archive', result: 'ok' })

      // AC-4 md 纪律:任务/记录 md 全程不迁移不改动(mtime + 内容)。
      expectMdUntouched(mdBefore, featuresRoot)
    })
  })
})

// ---------------------------------------------------------------------------
// AC-2 — atomicity: injected failures roll back wholesale; retry succeeds
// ---------------------------------------------------------------------------

describe('workbench/migration pipeline — atomicity + rollback matrix (AC-2)', () => {
  it('mid-ingest failure → transaction rollback, doc tree untouched, audit keeps the failure; retry succeeds', async () => {
    await withHarness(async ({ db, project, featuresRoot, events, makeService }) => {
      const mdBefore = fingerprintDocTree(featuresRoot)
      const failing = makeService({ failIngestAfterRows: 1 })
      const captured = toCapture(() => failing.startMigration(project.id)) as Promise<unknown>
      await expect(captured).rejects.toThrow(/injected ingest failure/)

      // 库与文档树回到迁移前态:files 权威、零权威行、index.json 原位、零归档残留。
      expect(authorityOf(db, project.id)).toBe('files')
      expect(taskRowCount(db, project.id)).toBe(0)
      for (const slug of CORPUS_SLUGS) {
        const state = indexStateOf(featuresRoot, slug)
        expect(state.indexExists).toBe(true)
        expect(state.archived).toEqual([])
      }
      expectMdUntouched(mdBefore, featuresRoot)

      // 审计:backup ok + ingest fail + rollback ok(事务外补记,不被回滚吞掉)。
      expect(eventsOfPhases(listMigrationEvents(db as RepoDb, project.id))).toEqual([
        ['backup', 'ok'],
        ['ingest', 'fail'],
        ['rollback', 'ok'],
      ])
      const rollbackDetail = JSON.parse(
        listMigrationEvents(db as RepoDb, project.id).find(event => event.phase === 'rollback')?.detailJson ?? '{}',
      )
      expect(rollbackDetail).toMatchObject({ failedPhase: 'ingest' })
      expect(events.map(event => [event.phase, event.result] as [string, string])).toEqual([
        ['backup', 'ok'],
        ['ingest', 'fail'],
        ['rollback', 'ok'],
      ])

      // 重试幂等可成功(状态 ≡ 迁移前态,重跑全链)。
      await makeService().startMigration(project.id)
      expect(authorityOf(db, project.id)).toBe('sqlite')
      expect(taskRowCount(db, project.id)).toBe(CORPUS_TASK_TOTAL)
      for (const slug of CORPUS_SLUGS) {
        expect(indexStateOf(featuresRoot, slug).indexExists).toBe(false)
      }
    })
  })

  it('verify diff → ERR_MIGRATION_VERIFY with the report; rollback leaves pre-migration state; retry after rescan succeeds', async () => {
    await withHarness(async ({ db, project, featuresRoot, codeRoot, makeService }) => {
      const mdBefore = fingerprintDocTree(featuresRoot)
      // 快照标题漂移(index.json 未变)= 对拍差异源(摄入映射无损,差异在快照侧)。
      upsertTaskSnapshot(db as RepoDb, {
        projectId: project.id,
        taskKey: 'checkout-flow/1.1',
        featureSlug: 'checkout-flow',
        title: 'DRIFTED TITLE',
        status: 'completed',
        blockers: [],
        branch: null,
        worktree: false,
        source: null,
        updatedAt: FIXED_NOW.toISOString(),
      })

      const captured = toCapture(() => makeService().startMigration(project.id)) as Promise<unknown>
      const rejection = await captured.then(
        () => undefined,
        (error: unknown) => error,
      )
      expectMigrationError(rejection, 'ERR_MIGRATION_VERIFY', /title/)
      expect((rejection as MigrationDomainError).report?.mismatches).toEqual([
        expect.objectContaining({ taskKey: 'checkout-flow/1.1', field: 'title' }),
      ])

      expect(authorityOf(db, project.id)).toBe('files')
      expect(taskRowCount(db, project.id)).toBe(0)
      for (const slug of CORPUS_SLUGS) {
        expect(indexStateOf(featuresRoot, slug).indexExists).toBe(true)
      }
      expectMdUntouched(mdBefore, featuresRoot)

      // 审计:verify fail(detail 携带对拍差异)+ rollback ok(携带全报告)。
      const audit = listMigrationEvents(db as RepoDb, project.id)
      expect(eventsOfPhases(audit)).toEqual([
        ['backup', 'ok'],
        ['verify', 'fail'],
        ['rollback', 'ok'],
      ])
      const verifyFail = JSON.parse(audit.find(event => event.phase === 'verify')?.detailJson ?? '{}')
      expect(verifyFail.verifyReport.ok).toBe(false)
      expect(verifyFail.verifyReport.mismatches[0]).toMatchObject({ taskKey: 'checkout-flow/1.1', field: 'title' })
      const rollbackDetail = JSON.parse(audit.find(event => event.phase === 'rollback')?.detailJson ?? '{}')
      expect(rollbackDetail.failedPhase).toBe('verify')
      expect(rollbackDetail.verifyReport.mismatches.length).toBeGreaterThan(0)

      // 感知追平(重扫恢复快照一致)后重试 → 成功(失败回滚可重试)。
      scanForgeFiles(db as RepoDb, { id: project.id, codeRoot, docLocationPath: null })
      await makeService().startMigration(project.id)
      expect(authorityOf(db, project.id)).toBe('sqlite')
      expect(taskRowCount(db, project.id)).toBe(CORPUS_TASK_TOTAL)
    })
  })

  it('archive failure → rollback renames the archived index back; zero half-migration residue', async () => {
    await withHarness(async ({ db, project, featuresRoot, makeService }) => {
      const mdBefore = fingerprintDocTree(featuresRoot)
      const failing = makeService({ failArchiveForSlug: 'settings-panel' })
      const captured = toCapture(() => failing.startMigration(project.id)) as Promise<unknown>
      await expect(captured).rejects.toThrow(/injected archive failure for feature settings-panel/)

      // 归档失败 → 整体回滚:库回迁移前态;已改名的 index.json 改名回原位。
      expect(authorityOf(db, project.id)).toBe('files')
      expect(taskRowCount(db, project.id)).toBe(0)
      for (const slug of CORPUS_SLUGS) {
        const state = indexStateOf(featuresRoot, slug)
        expect(state.indexExists, `${slug} index.json must be back`).toBe(true)
        expect(state.archived, `${slug} must have no archive residue`).toEqual([])
      }
      expectMdUntouched(mdBefore, featuresRoot)

      const audit = listMigrationEvents(db as RepoDb, project.id)
      expect(eventsOfPhases(audit)).toEqual([
        ['backup', 'ok'],
        ['archive', 'fail'],
        ['rollback', 'ok'],
      ])
      // 字典序:checkout-flow 先改名 → 回滚改名回滚面覆盖它。
      const rollbackDetail = JSON.parse(audit.find(event => event.phase === 'rollback')?.detailJson ?? '{}')
      expect(rollbackDetail.failedPhase).toBe('archive')
      expect(rollbackDetail.docTree.renamedBack).toEqual(['checkout-flow'])
    })
  })
})

// ---------------------------------------------------------------------------
// AC-3 — guards
// ---------------------------------------------------------------------------

describe('workbench/migration pipeline — guards (AC-3)', () => {
  it('running dispatches block startMigration with ERR_MIGRATION_GUARD and leave zero side effects', async () => {
    await withHarness(async ({ db, project, featuresRoot, userData, makeService }) => {
      db
        .prepare(
          `INSERT INTO dispatch (id, batch_id, project_id, feature_slug, task_key, state, session_id, prompt_hash, actor, dispatched_at, ended_at, error)
           VALUES (?, ?, ?, ?, ?, 'running', NULL, 'deadbeef', 'tester', ?, NULL, NULL)`,
        )
        .run('d-1', 'b-1', project.id, 'checkout-flow', 'checkout-flow/1.1', FIXED_NOW.toISOString())

      const captured = toCapture(() => makeService().startMigration(project.id)) as Promise<unknown>
      const rejection = await captured.then(
        () => undefined,
        (error: unknown) => error,
      )
      expectMigrationError(rejection, 'ERR_MIGRATION_GUARD', /running dispatch/)

      // 零副作用:无备份、无审计、库与文档树原样。
      expect(authorityOf(db, project.id)).toBe('files')
      expect(taskRowCount(db, project.id)).toBe(0)
      expect(existsSync(migrationBackupsRoot(userData))).toBe(false)
      expect(listMigrationEvents(db as RepoDb, project.id)).toEqual([])
      for (const slug of CORPUS_SLUGS) {
        expect(indexStateOf(featuresRoot, slug).indexExists).toBe(true)
      }
    })
  })

  it('repeat startMigration while in flight → ERR_MIGRATION_IN_PROGRESS; the original run completes', async () => {
    await withHarness(async ({ db, project, makeService }) => {
      const service = makeService()
      const first = service.startMigration(project.id)
      // 第二发起进入异步 IO 窗口(首个 await 已挂起)→ 在跑拒绝。
      const captured = toCapture(() => service.startMigration(project.id)) as Promise<unknown>
      const rejection = await captured.then(
        () => undefined,
        (error: unknown) => error,
      )
      expectMigrationError(rejection, 'ERR_MIGRATION_IN_PROGRESS', /in flight/)
      await expect(first).resolves.toEqual({ started: true })
      expect(authorityOf(db, project.id)).toBe('sqlite')
      expect(taskRowCount(db, project.id)).toBe(CORPUS_TASK_TOTAL)
    })
  })

  it('already-migrated project → ERR_MIGRATION_GUARD (one-shot semantics)', async () => {
    await withHarness(async ({ project, makeService }) => {
      await makeService().startMigration(project.id)
      const captured = toCapture(() => makeService().startMigration(project.id)) as Promise<unknown>
      const rejection = await captured.then(
        () => undefined,
        (error: unknown) => error,
      )
      expectMigrationError(rejection, 'ERR_MIGRATION_GUARD', /already migrated/)
    })
  })

  it('getMigrationStatus on an unknown project → ERR_PROJECT_NOT_FOUND', async () => {
    await withHarness(async ({ makeService }) => {
      const error = toCapture(() => makeService().getMigrationStatus('ghost')) as Error
      expect(error).toBeInstanceOf(Error)
      expect((error as { code?: string }).code).toBe('ERR_PROJECT_NOT_FOUND')
    })
  })
})
