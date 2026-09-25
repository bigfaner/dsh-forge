import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { ShellLogFields } from '../src/main/log.ts'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import { registerProject } from '../src/main/workbench/repos/projects.ts'
import { upsertTaskSnapshot } from '../src/main/workbench/repos/task-snapshots.ts'
import type { Project, RepoDb } from '../src/main/workbench/repos/types.ts'
import { scanForgeFiles, type ScanOutcome, type ScanTarget } from '../src/main/workbench/indexer/scan.ts'
import type { WorkbenchEvent } from '../src/main/workbench/indexer/diff.ts'
import { listTasks } from '../src/main/workbench/tasks/task-repo.ts'
import {
  createMigrationService,
  listMigrationEvents,
  type MigrationEventRecord,
} from '../src/main/workbench/migration/pipeline.ts'
import { createReingestHook, type ReingestHook } from '../src/main/workbench/migration/reingest-watcher.ts'
import type { WatchOpener } from '../src/main/workbench/watcher/fallback.ts'
import { createWorkbenchWatcher, type WorkbenchWatcher } from '../src/main/workbench/watcher/watch.ts'
import { createWorkbenchIpcServices } from '../src/main/workbench/ipc/services.ts'

// Task 1.5 (M3) — external-write reingest + deviation marking (Interface 4
// step 7, T3): on migrated projects (data_authority='sqlite') the perception
// base (M2 watcher scan) detecting a reproduced/changed tasks/index.json runs
// an idempotent reingest (same 1.4 ingest mapping + parity verify) and marks
// projects.deviated=1 + deviation_detected event + migration_event(reingest)
// audit. Hard Rules: never blocks the external session (the reproduced
// index.json stays on disk — 双形态互不破坏); reingest failure is observable
// only (mark stays, event still fires, fail audit, log — no UI, no throw).
// Unmigrated (files) projects keep the pure M2 perception path (zero behavior
// change). Authorities: tech-design §Interface 4.7 / §Interface 1
// (deviation_detected) / §Error Handling·感知面, er-diagram §projects.deviated,
// prd-spec G8/Story 8.
//
// The corpus and tree builder mirror workbench-migration-pipeline.spec.ts
// (task 1.4); the reingest hook is driven both directly (afterScan) and through
// the two real perception paths (watcher scan seam, services rescan).

type DeviationEvent = Extract<WorkbenchEvent, { type: 'deviation_detected' }>
type ReingestProgress = Extract<WorkbenchEvent, { type: 'migration_progress' }>

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
const CHECKOUT_TASKS = corpus.features.find(feature => feature.slug === 'checkout-flow')!.tasks.length

const T_MIGRATE = new Date(Date.UTC(2026, 8, 24, 6, 0, 0))
const MIGRATE_STAMP = '2026-09-24T06-00-00-000Z'
const T_REINGEST = new Date(Date.UTC(2026, 8, 24, 7, 0, 0))
const T0 = Date.UTC(2026, 8, 20, 0, 0, 0)
const DAY = 86_400_000

const scratches: string[] = []
const openDbs: DatabaseSyncLike[] = []
const watchers: WorkbenchWatcher[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-reingest-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const watcher of watchers.splice(0)) watcher.stop()
  for (const db of openDbs.splice(0)) db.close()
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function touch(path: string, epochMs: number): void {
  const time = new Date(epochMs)
  utimesSync(path, time, time)
}

// ---------------------------------------------------------------------------
// Corpus → tmp forge tree (same dialect as the 1.4 pipeline spec)
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
    writeFileSync(join(tasksDir, 'index.json'), JSON.stringify({ feature: feature.slug, tasks: entries }, null, 1))
    touch(join(tasksDir, 'index.json'), T0)
  }
  return featuresRoot
}

// ---------------------------------------------------------------------------
// Harness: tmp tree + db + (optionally) migrated project + reingest hook
// ---------------------------------------------------------------------------

type IndexEntries = Record<string, Record<string, unknown>>

type LogSpy = {
  readonly info: Mock<(fields: ShellLogFields) => void>
  readonly warn: Mock<(fields: ShellLogFields) => void>
}

interface Harness {
  readonly db: DatabaseSyncLike
  readonly project: Project
  readonly codeRoot: string
  readonly featuresRoot: string
  readonly userData: string
  readonly target: ScanTarget
  readonly hook: ReingestHook
  readonly log: LogSpy
  /** Original index.json entries per slug, captured before migration. */
  readonly originalIndexes: ReadonlyMap<string, IndexEntries>
  /** Perception-round simulation: M2 scan then reingest hook (event order kept). */
  scan(): WorkbenchEvent[]
  /** External CLI write: (re)create <slug>/tasks/index.json. */
  writeExternalIndex(slug: string, entries: IndexEntries): void
  /** Corrupt external write (malformed JSON bytes). */
  writeCorruptIndex(slug: string): void
  deviated(): number
  reingestAudits(): MigrationEventRecord[]
}

async function withHarness(options: { migrate: boolean }, run: (harness: Harness) => void | Promise<void>): Promise<void> {
  const root = makeScratch()
  const userData = join(root, 'user-data')
  mkdirSync(userData, { recursive: true })
  const codeRoot = join(root, 'repo')
  const featuresRoot = buildForgeTree(codeRoot)
  const { db } = await openDatabase(userData)
  openDbs.push(db)
  const project = registerProject(db as RepoDb, { codeRoot, docLocationType: 'in_repo' })
  const target: ScanTarget = { id: project.id, codeRoot, docLocationPath: null }
  scanForgeFiles(db as RepoDb, target)

  const originalIndexes = new Map<string, IndexEntries>()
  for (const feature of corpus.features) {
    const raw = JSON.parse(readFileSync(join(featuresRoot, feature.slug, 'tasks', 'index.json'), 'utf8')) as {
      tasks: IndexEntries
    }
    originalIndexes.set(feature.slug, raw.tasks)
  }

  if (options.migrate) {
    const migration = createMigrationService({
      db: db as RepoDb,
      userDataPath: userData,
      loadProject: id => (id === project.id ? project : null),
      onEvent: () => {},
      now: () => T_MIGRATE,
    })
    await migration.startMigration(project.id)
  }

  const log: LogSpy = { info: vi.fn(), warn: vi.fn() }
  const hook = createReingestHook({ db: db as RepoDb, now: () => T_REINGEST, log })

  const scan = (): WorkbenchEvent[] => {
    const outcome = scanForgeFiles(db as RepoDb, target)
    return [...outcome.events, ...hook.afterScan(target)]
  }

  try {
    await run({
      db,
      project,
      codeRoot,
      featuresRoot,
      userData,
      target,
      hook,
      log,
      originalIndexes,
      scan,
      writeExternalIndex: (slug, entries) => {
        writeFileSync(join(featuresRoot, slug, 'tasks', 'index.json'), JSON.stringify({ feature: slug, tasks: entries }, null, 1))
      },
      writeCorruptIndex: (slug) => {
        writeFileSync(join(featuresRoot, slug, 'tasks', 'index.json'), '{ not json ][')
      },
      deviated: () =>
        (db.prepare('SELECT deviated FROM projects WHERE id = ?').get(project.id) as { deviated: number }).deviated,
      reingestAudits: () => listMigrationEvents(db as RepoDb, project.id).filter(row => row.phase === 'reingest'),
    })
  } finally {
    db.close()
    const idx = openDbs.indexOf(db)
    if (idx >= 0) openDbs.splice(idx, 1)
  }
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

interface MdFingerprint {
  readonly content: string
  readonly mtimeMs: number
}

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
          prints.set(path.replaceAll('\\', '/'), { content: readFileSync(path, 'utf8'), mtimeMs: statSync(path).mtimeMs })
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

function taskMap(db: DatabaseSyncLike, projectId: string): Map<string, { status: string; title: string; blockers: string[] }> {
  const rows = listTasks(db as RepoDb, projectId)
  return new Map(rows.map(row => [row.taskKey, { status: row.status, title: row.title, blockers: row.blockers }]))
}

function deviationsOf(events: readonly WorkbenchEvent[]): DeviationEvent[] {
  return events.filter((event): event is DeviationEvent => event.type === 'deviation_detected')
}

function reingestProgressOf(events: readonly WorkbenchEvent[]): ReingestProgress[] {
  return events.filter((event): event is ReingestProgress => event.type === 'migration_progress' && event.phase === 'reingest')
}

function indexStateOf(featuresRoot: string, slug: string): { indexExists: boolean; archived: string[] } {
  const names = readdirSync(join(featuresRoot, slug, 'tasks'))
  return {
    indexExists: names.includes('index.json'),
    archived: names.filter(name => /^index\.json\.migrated-/.test(name)),
  }
}

// ---------------------------------------------------------------------------
// AC-1 — reproduction / change on a migrated project → reingest + deviation
// ---------------------------------------------------------------------------

describe('workbench/migration reingest — reproduction + change (AC-1)', () => {
  it('reproduced index.json with external changes → idempotent reingest, deviated=1, deviation_detected, migration_event(reingest/ok)', async () => {
    await withHarness({ migrate: true }, (harness) => {
      const mdBefore = fingerprintDocTree(harness.featuresRoot)
      const entries = structuredClone(harness.originalIndexes.get('checkout-flow')!) as IndexEntries
      ;(entries['1.2-task'] as { status: string }).status = 'completed'
      ;(entries['2.1-task'] as { title: string }).title = 'Verify board parity (external fix)'
      harness.writeExternalIndex('checkout-flow', entries)

      const events = harness.scan()

      // SQLite 与文件一致:外部内容进权威表,无重复行。
      const tasks = taskMap(harness.db, harness.project.id)
      expect(tasks.size).toBe(CORPUS_TASK_TOTAL)
      expect(tasks.get('checkout-flow/1.2')?.status).toBe('completed')
      expect(tasks.get('checkout-flow/2.1')?.title).toBe('Verify board parity (external fix)')
      expect(tasks.get('checkout-flow/1.1')?.status).toBe('completed') // 未动条目原样
      expect(tasks.get('settings-panel/5.1')?.status).toBe('pending') // 未复现 feature 原样

      // projects.deviated=1 + 事件(deviation_detected + migration_progress reingest ok)。
      expect(harness.deviated()).toBe(1)
      expect(deviationsOf(events)).toEqual([{ type: 'deviation_detected', projectId: harness.project.id }])
      expect(reingestProgressOf(events)).toEqual([
        { type: 'migration_progress', projectId: harness.project.id, phase: 'reingest', result: 'ok' },
      ])

      // migration_event(reingest/ok) 留档:同一对拍校验(verifyReport ok)。
      const audits = harness.reingestAudits()
      expect(audits).toHaveLength(1)
      const okAudit = audits[0]!
      expect(okAudit.result).toBe('ok')
      expect(okAudit.at).toBe(T_REINGEST.toISOString())
      const detail = JSON.parse(okAudit.detailJson ?? '{}')
      expect(detail.features).toEqual([{ slug: 'checkout-flow', taskCount: CHECKOUT_TASKS }])
      expect(detail.rows).toBe(CHECKOUT_TASKS)
      expect(detail.verifyReport).toMatchObject({ ok: true, taskCount: CORPUS_TASK_TOTAL, snapshotCount: CORPUS_TASK_TOTAL })
      expect(detail.indexes).toEqual([{ slug: 'checkout-flow', sha256: expect.any(String) }])

      // 双形态互不破坏:外部 index.json 留在原位(不再次归档),其余归档件不动。
      const checkout = indexStateOf(harness.featuresRoot, 'checkout-flow')
      expect(checkout.indexExists).toBe(true)
      expect(checkout.archived).toEqual([`index.json.migrated-${MIGRATE_STAMP}`])
      expect(indexStateOf(harness.featuresRoot, 'settings-panel').indexExists).toBe(false)

      // md 纪律:任务/记录 md 不被触碰。
      expectMdUntouched(mdBefore, harness.featuresRoot)
    })
  })

  it('second external write (change + new task + second feature reproduced) → new reingest round absorbs both', async () => {
    await withHarness({ migrate: true }, (harness) => {
      const first = structuredClone(harness.originalIndexes.get('checkout-flow')!) as IndexEntries
      ;(first['1.2-task'] as { status: string }).status = 'completed'
      harness.writeExternalIndex('checkout-flow', first)
      harness.scan()

      // 变更:同 feature 追加任务 + 第二个 feature 复现(指纹集变化)。
      const second = structuredClone(first)
      second['9.9-task'] = {
        id: '9.9',
        title: 'External addition',
        priority: 'P1',
        status: 'pending',
        file: '9.9-task.md',
        dependencies: [],
      }
      harness.writeExternalIndex('checkout-flow', second)
      const settings = structuredClone(harness.originalIndexes.get('settings-panel')!) as IndexEntries
      ;(settings['5-gate'] as { status: string }).status = 'completed'
      harness.writeExternalIndex('settings-panel', settings)

      const events = harness.scan()

      const tasks = taskMap(harness.db, harness.project.id)
      expect(tasks.size).toBe(CORPUS_TASK_TOTAL + 1)
      expect(tasks.get('checkout-flow/9.9')).toMatchObject({ status: 'pending', title: 'External addition' })
      expect(tasks.get('settings-panel/5.gate')?.status).toBe('completed')

      expect(reingestProgressOf(events)).toHaveLength(1)
      expect(deviationsOf(events)).toHaveLength(1)
      const audits = harness.reingestAudits()
      expect(audits.map(row => row.result)).toEqual(['ok', 'ok'])
      const detail = JSON.parse(audits[1]!.detailJson ?? '{}')
      expect(detail.features).toEqual([
        { slug: 'checkout-flow', taskCount: CHECKOUT_TASKS + 1 },
        { slug: 'settings-panel', taskCount: 2 },
      ])
    })
  })
})

// ---------------------------------------------------------------------------
// AC-2 — idempotency: repeated triggers of the same external write
// ---------------------------------------------------------------------------

describe('workbench/migration reingest — idempotency (AC-2)', () => {
  it('the same external write perceived N times → exactly one reingest audit + one deviation event, zero duplicate rows', async () => {
    await withHarness({ migrate: true }, (harness) => {
      const entries = structuredClone(harness.originalIndexes.get('checkout-flow')!) as IndexEntries
      ;(entries['1.2-task'] as { status: string }).status = 'completed'
      harness.writeExternalIndex('checkout-flow', entries)

      const all: WorkbenchEvent[] = []
      for (let round = 0; round < 3; round += 1) all.push(...harness.scan())

      expect(harness.reingestAudits()).toHaveLength(1) // 单次留档
      expect(deviationsOf(all)).toHaveLength(1) // 单次偏离事件
      expect(reingestProgressOf(all)).toHaveLength(1)
      expect(taskMap(harness.db, harness.project.id).size).toBe(CORPUS_TASK_TOTAL) // 无重复行
      expect(harness.deviated()).toBe(1)
    })
  })

  it('reingest is all-or-nothing: a mid-run verify mismatch rolls the task table back wholesale (parity check runs on reingest)', async () => {
    await withHarness({ migrate: true }, (harness) => {
      const entries = structuredClone(harness.originalIndexes.get('checkout-flow')!) as IndexEntries
      ;(entries['1.2-task'] as { status: string }).status = 'completed'
      harness.writeExternalIndex('checkout-flow', entries)

      // 感知扫先落快照(外部内容),随后人为制造快照漂移(对拍差异源)。
      scanForgeFiles(harness.db as RepoDb, harness.target)
      upsertTaskSnapshot(harness.db as RepoDb, {
        projectId: harness.project.id,
        taskKey: 'checkout-flow/1.1',
        featureSlug: 'checkout-flow',
        title: 'DRIFTED TITLE',
        status: 'completed',
        blockers: [],
        branch: null,
        worktree: false,
        source: null,
        updatedAt: T_REINGEST.toISOString(),
      })

      const events = harness.hook.afterScan(harness.target) // 不得抛错(感知面纪律)

      // 整体回滚:权威表保持迁移时内容,零半摄入。
      const tasks = taskMap(harness.db, harness.project.id)
      expect(tasks.get('checkout-flow/1.2')?.status).toBe('in_progress')
      expect(tasks.get('checkout-flow/1.1')?.title).toBe('Spike: parity baseline')
      expect(tasks.size).toBe(CORPUS_TASK_TOTAL)

      // 偏离标记保持 + 事件照发 + fail 留档携带对拍报告。
      expect(harness.deviated()).toBe(1)
      expect(deviationsOf(events)).toHaveLength(1)
      expect(reingestProgressOf(events)).toEqual([
        { type: 'migration_progress', projectId: harness.project.id, phase: 'reingest', result: 'fail' },
      ])
      const audits = harness.reingestAudits()
      expect(audits).toHaveLength(1)
      expect(audits[0]!.result).toBe('fail')
      const detail = JSON.parse(audits[0]!.detailJson ?? '{}')
      expect(detail.reason).toMatch(/verify/i)
      expect(detail.verifyReport.mismatches[0]).toMatchObject({ taskKey: 'checkout-flow/1.1', field: 'title' })

      // 失败指纹已记:文件未再变 → 后续感知轮不重试不刷屏。
      harness.scan()
      expect(harness.reingestAudits()).toHaveLength(1)
    })
  })
})

// ---------------------------------------------------------------------------
// AC-3 — failure (corrupt corpus): observable only, never blocking
// ---------------------------------------------------------------------------

describe('workbench/migration reingest — failure containment (AC-3)', () => {
  it('corrupt reproduced index.json → deviation stays marked, events fire, reingest/fail audit, log only — no throw, no UI, table untouched', async () => {
    await withHarness({ migrate: true }, (harness) => {
      harness.writeCorruptIndex('checkout-flow')

      let events: WorkbenchEvent[] = []
      expect(() => {
        events = harness.scan()
      }).not.toThrow()

      // 权威表未被半摄入(迁移时内容原样)。
      const tasks = taskMap(harness.db, harness.project.id)
      expect(tasks.size).toBe(CORPUS_TASK_TOTAL)
      expect(tasks.get('checkout-flow/1.2')?.status).toBe('in_progress')

      // 偏离标记保持 + 事件照发(deviation_detected + reingest fail)。
      expect(harness.deviated()).toBe(1)
      expect(deviationsOf(events)).toHaveLength(1)
      expect(reingestProgressOf(events)).toEqual([
        { type: 'migration_progress', projectId: harness.project.id, phase: 'reingest', result: 'fail' },
      ])

      // migration_event(reingest/fail)留档 + 结构化日志(不弹 UI)。
      const audits = harness.reingestAudits()
      expect(audits).toHaveLength(1)
      expect(audits[0]!.result).toBe('fail')
      const detail = JSON.parse(audits[0]!.detailJson ?? '{}')
      expect(detail.reason).toMatch(/unreadable|malformed|corrupt/i)
      expect(detail.indexes).toHaveLength(1)
      expect(harness.log.warn).toHaveBeenCalledTimes(1)
      expect((harness.log.warn.mock.calls[0]![0] as { code: string }).code).toBe('ERR_WORKBENCH_REINGEST')

      // 外部文件不被清除(不阻断外部会话),损坏指纹留档 → 同态感知不重试。
      expect(indexStateOf(harness.featuresRoot, 'checkout-flow').indexExists).toBe(true)
      harness.scan()
      expect(harness.reingestAudits()).toHaveLength(1)

      // 外部修复后(指纹变化)→ 自动重摄入成功,SQLite 与文件一致。
      const repaired = structuredClone(harness.originalIndexes.get('checkout-flow')!) as IndexEntries
      ;(repaired['1.2-task'] as { status: string }).status = 'completed'
      harness.writeExternalIndex('checkout-flow', repaired)
      const repairEvents = harness.scan()
      expect(reingestProgressOf(repairEvents)).toEqual([
        { type: 'migration_progress', projectId: harness.project.id, phase: 'reingest', result: 'ok' },
      ])
      expect(taskMap(harness.db, harness.project.id).get('checkout-flow/1.2')?.status).toBe('completed')
      expect(harness.reingestAudits().map(row => row.result)).toEqual(['fail', 'ok'])
    })
  })
})

// ---------------------------------------------------------------------------
// AC-4 — unmigrated (files) projects: pure M2 perception path, zero change
// ---------------------------------------------------------------------------

describe('workbench/migration reingest — dual-form gating (AC-4)', () => {
  it('unmigrated project: index.json change flows through the M2 path only — no reingest, no deviation, no audit', async () => {
    await withHarness({ migrate: false }, (harness) => {
      const entries = structuredClone(harness.originalIndexes.get('checkout-flow')!) as IndexEntries
      ;(entries['1.2-task'] as { status: string }).status = 'completed'
      harness.writeExternalIndex('checkout-flow', entries)

      const events = harness.scan()

      // M2 感知路径照常:快照更新 + task_updated 事件。
      const snapshots = harness.db
        .prepare('SELECT status FROM task_snapshot WHERE project_id = ? AND task_key = ?')
        .all(harness.project.id, 'checkout-flow/1.2') as Array<{ status: string }>
      expect(snapshots).toEqual([{ status: 'completed' }])
      expect(events.some(event => event.type === 'task_updated' && event.taskKey === 'checkout-flow/1.2')).toBe(true)

      // 零重摄入痕迹:无权威行、无偏离、无审计、无偏离/迁移事件。
      expect(taskMap(harness.db, harness.project.id).size).toBe(0)
      expect(harness.deviated()).toBe(0)
      expect(listMigrationEvents(harness.db as RepoDb, harness.project.id)).toEqual([])
      expect(deviationsOf(events)).toEqual([])
      expect(events.filter(event => event.type === 'migration_progress')).toEqual([])
      expect(harness.log.warn).not.toHaveBeenCalled()
    })
  })

  it('migrated project with indexes still archived → perception round is a reingest no-op', async () => {
    await withHarness({ migrate: true }, (harness) => {
      const events = harness.scan()
      expect(deviationsOf(events)).toEqual([])
      expect(reingestProgressOf(events)).toEqual([])
      expect(harness.reingestAudits()).toEqual([])
      expect(harness.deviated()).toBe(0)
      expect(taskMap(harness.db, harness.project.id).size).toBe(CORPUS_TASK_TOTAL)
    })
  })

  it('unknown target (project not registered) → hook is inert', async () => {
    await withHarness({ migrate: true }, (harness) => {
      const events = harness.hook.afterScan({ id: '00000000-0000-0000-0000-000000000000', codeRoot: harness.codeRoot, docLocationPath: null })
      expect(events).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// AC-5 — perception-base attachment: watcher scan seam + services rescan
// ---------------------------------------------------------------------------

describe('workbench/migration reingest — perception wiring (AC-5)', () => {
  it('watcher scan seam: fs change → debounce → wrapped scan → batch carries deviation events', async () => {
    vi.useFakeTimers()
    await withHarness({ migrate: true }, async (harness) => {
      const handles: Array<{ readonly dir: string; closed: boolean; fire(): void }> = []
      const opener: WatchOpener = (dir, _options, listener) => {
        const handle = {
          dir,
          closed: false,
          fire: () => listener('change', 'index.json'),
        }
        handles.push(handle)
        return { close: () => { handle.closed = true } }
      }
      const batches: (readonly WorkbenchEvent[])[] = []
      const wrappedScan = (db: RepoDb, target: ScanTarget): ScanOutcome => {
        const outcome = scanForgeFiles(db, target)
        return { ...outcome, events: [...outcome.events, ...harness.hook.afterScan(target)] }
      }
      const watcher = createWorkbenchWatcher(harness.db as RepoDb, {
        scan: wrappedScan,
        onEvents: batch => batches.push(batch),
        tier: { openWatch: opener, pollIntervalMs: 2000 },
        log: harness.log,
      })
      watchers.push(watcher)
      watcher.rebuild(harness.target)
      expect(watcher.strategy).toBe('recursive')

      const entries = structuredClone(harness.originalIndexes.get('checkout-flow')!) as IndexEntries
      ;(entries['1.2-task'] as { status: string }).status = 'completed'
      harness.writeExternalIndex('checkout-flow', entries)

      handles[0]!.fire()
      await vi.advanceTimersByTimeAsync(400)
      await vi.advanceTimersByTimeAsync(1) // macrotask slice lands (scan ~t=401)
      await vi.advanceTimersByTimeAsync(501) // 事件批窗口(≤500ms)到点冲刷

      expect(batches.length).toBeGreaterThan(0)
      const flat = batches.flat()
      expect(deviationsOf(flat)).toEqual([{ type: 'deviation_detected', projectId: harness.project.id }])
      expect(reingestProgressOf(flat)).toEqual([
        { type: 'migration_progress', projectId: harness.project.id, phase: 'reingest', result: 'ok' },
      ])
      expect(harness.deviated()).toBe(1)
      expect(taskMap(harness.db, harness.project.id).get('checkout-flow/1.2')?.status).toBe('completed')
    })
  })

  it('services rescan path: real default perception carries reingest events to the onEvents sink', async () => {
    const root = makeScratch()
    const userData = join(root, 'user-data')
    mkdirSync(userData, { recursive: true })
    const manifest = join(root, 'resources', 'plugin-bundles.json')
    mkdirSync(join(root, 'resources'), { recursive: true })
    writeFileSync(manifest, JSON.stringify({ bundles: [{ name: '@deepseek-ai/dsh-base', mandatory: true }] }))
    const codeRoot = join(root, 'repo')
    const featuresRoot = buildForgeTree(codeRoot)
    const { db } = await openDatabase(userData)
    openDbs.push(db)

    const events: WorkbenchEvent[] = []
    const assembly = createWorkbenchIpcServices({
      db: db as RepoDb,
      pluginBundlesPath: manifest,
      userDataPath: userData,
      onEvents: batch => events.push(...batch),
    })
    try {
      const project = assembly.verbs.registerProject({ codeRoot, docLocationType: 'in_repo' })
      assembly.verbs.activateProject(project.id)
      await assembly.verbs.startMigration(project.id)
      events.length = 0

      // startMigration 在真实时钟下运行 → 从归档件(动态定位)取外部写的底稿。
      const tasksDir = join(featuresRoot, 'checkout-flow', 'tasks')
      const archived = readdirSync(tasksDir).find(name => /^index\.json\.migrated-/.test(name))!
      const entries = JSON.parse(readFileSync(join(tasksDir, archived), 'utf8')) as { tasks: IndexEntries }
      ;(entries.tasks['1.2-task'] as { status: string }).status = 'completed'
      writeFileSync(join(tasksDir, 'index.json'), JSON.stringify({ feature: 'checkout-flow', tasks: entries.tasks }, null, 1))

      // 重扫路径(激活触发)驱动同一 wrapped scan → 重摄入事件直达 sink。
      assembly.verbs.activateProject(project.id)

      expect(deviationsOf(events)).toEqual([{ type: 'deviation_detected', projectId: project.id }])
      expect(reingestProgressOf(events)).toEqual([
        { type: 'migration_progress', projectId: project.id, phase: 'reingest', result: 'ok' },
      ])
      expect(taskMap(db, project.id).get('checkout-flow/1.2')?.status).toBe('completed')
      const deviated = (db.prepare('SELECT deviated FROM projects WHERE id = ?').get(project.id) as { deviated: number }).deviated
      expect(deviated).toBe(1)
    } finally {
      assembly.dispose()
      db.close()
      const idx = openDbs.indexOf(db)
      if (idx >= 0) openDbs.splice(idx, 1)
    }
  })
})
