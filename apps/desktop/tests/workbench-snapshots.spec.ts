import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import { activateProject } from '../src/main/workbench/repos/app-state.ts'
import { registerProject } from '../src/main/workbench/repos/projects.ts'
import { recordSessionLink } from '../src/main/workbench/repos/session-links.ts'
import {
  getTaskSnapshot,
  listTaskSnapshots,
  listTaskSnapshotsByFeature,
  listTaskSnapshotsByStatus,
  upsertTaskSnapshot,
  upsertTaskSnapshots,
  type UpsertTaskBatchRow,
  type UpsertTaskSnapshotInput,
} from '../src/main/workbench/repos/task-snapshots.ts'
import {
  getFeatureSnapshot,
  listFeatureSnapshots,
  upsertFeatureSnapshot,
  type UpsertFeatureSnapshotInput,
} from '../src/main/workbench/repos/feature-snapshots.ts'
import { getSyncState, markScanFailed, markScanStarted, markScanSucceeded, resetSyncState } from '../src/main/workbench/repos/sync-state.ts'
import { rebuildDerivedSnapshots } from '../src/main/workbench/repos/snapshot-rebuild.ts'
import { WorkbenchRepoError, type ChangeSource, type FeatureStatus, type Project, type TaskStatus } from '../src/main/workbench/repos/types.ts'

// Task 2.3 — derived snapshot repos (task_snapshot / feature_snapshot /
// sync_state) over the 2.1 store and 2.2 repo layer. Design:
// docs/features/dsh-forge-m2/design/er-diagram.md (row contracts, derived-cache
// discipline) + tech-design.md §Interfaces Interface 1 (read-path DTOs).
//
// Hard Rule under test: the three tables are derived caches — every stored
// field is a passthrough of forge-file data (or scan bookkeeping); the rebuild
// entry may clear+replay them but must never touch owned SoT rows. Raw SQL
// below is evidence-only (EXPLAIN QUERY PLAN, storage-level verbatim checks,
// fault injection) — never a seeding path the repos should own.

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-workbench-snapshots-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

async function withDb(run: (db: DatabaseSyncLike) => void | Promise<void>): Promise<void> {
  const { db } = await openDatabase(makeScratch())
  try {
    await run(db)
  } finally {
    db.close()
  }
}

/** Capture a sync throw for structured assertions (2.1/2.2 spec pattern). */
function capture(fn: () => void): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

function expectRepoError(error: unknown, code: string, messagePattern: RegExp): void {
  expect(error).toBeInstanceOf(WorkbenchRepoError)
  const repoError = error as WorkbenchRepoError
  expect(repoError.code).toBe(code)
  expect(repoError.message).toMatch(messagePattern)
}

/** Distinct-timestamp helper for the repo-generated sync_state timestamps. */
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 3))

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

// Deterministic snapshot timestamps: snapshot updatedAt is caller-supplied
// (derived from forge files — Hard Rule), so tests pin constants instead of
// relying on wall-clock interleavings.
const T0 = '2026-09-22T00:00:00.000Z'
const T1 = '2026-09-22T00:00:01.000Z'
const T2 = '2026-09-22T00:00:02.000Z'
const T3 = '2026-09-22T00:00:03.000Z'

const SEVEN_STATES = ['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected'] as const

function registerInRepo(db: DatabaseSyncLike, codeRoot: string): Project {
  return registerProject(db, { codeRoot, docLocationType: 'in_repo' })
}

function makeTask(
  projectId: string,
  taskKey: string,
  overrides: Partial<Omit<UpsertTaskSnapshotInput, 'projectId' | 'taskKey'>> = {},
): UpsertTaskSnapshotInput {
  return {
    projectId,
    taskKey,
    featureSlug: 'dsh-forge-m2',
    title: `task ${taskKey}`,
    status: 'pending',
    blockers: [],
    branch: null,
    worktree: false,
    source: null,
    updatedAt: T0,
    ...overrides,
  }
}

function featureInput(
  projectId: string,
  overrides: Partial<Omit<UpsertFeatureSnapshotInput, 'projectId'>> = {},
): UpsertFeatureSnapshotInput {
  return {
    projectId,
    featureSlug: 'dsh-forge-m2',
    status: 'tasks',
    docKinds: ['manifest', 'tasks'],
    updatedAt: T1,
    ...overrides,
  }
}

/** Two features × (3 + 1) tasks with distinct statuses/timestamps (query fixture). */
function seedBoard(db: DatabaseSyncLike, projectId: string): void {
  upsertTaskSnapshot(db, makeTask(projectId, '1.1', { featureSlug: 'feature-b', status: 'completed', updatedAt: T0 }))
  upsertTaskSnapshot(db, makeTask(projectId, '2.1', { featureSlug: 'feature-a', status: 'completed', updatedAt: T1 }))
  upsertTaskSnapshot(db, makeTask(projectId, '2.2', { featureSlug: 'feature-a', status: 'in_progress', updatedAt: T2, blockers: ['2.1'] }))
  upsertTaskSnapshot(db, makeTask(projectId, '3.1', { featureSlug: 'feature-b', status: 'blocked', updatedAt: T3, blockers: ['1.1', '2.2'] }))
}

/** Deterministic forge-projection replay set (rebuild 对拍 fixture). */
function seedSnapshotSet(db: DatabaseSyncLike, projectId: string): void {
  upsertTaskSnapshot(db, makeTask(projectId, '1.1', { featureSlug: 'feature-a', status: 'completed', updatedAt: T0 }))
  upsertTaskSnapshot(db, makeTask(projectId, '1.2', { featureSlug: 'feature-a', status: 'in_progress', updatedAt: T1, blockers: ['1.1'], branch: 'feat/one', source: 'session' }))
  upsertTaskSnapshot(db, makeTask(projectId, '1.3', { featureSlug: 'feature-a', status: 'pending', updatedAt: T2 }))
  upsertTaskSnapshot(db, makeTask(projectId, '2.1', { featureSlug: 'feature-b', status: 'blocked', updatedAt: T3, blockers: ['1.2', '1.3'], worktree: true, source: 'terminal' }))
  upsertFeatureSnapshot(db, featureInput(projectId, { featureSlug: 'feature-a', status: 'in-progress', docKinds: ['manifest', 'prd', 'tasks'], updatedAt: T2 }))
  upsertFeatureSnapshot(db, featureInput(projectId, { featureSlug: 'feature-b', status: 'tasks', docKinds: ['manifest', 'tasks'], updatedAt: T3 }))
}

function countRows(db: DatabaseSyncLike, table: 'task_snapshot' | 'feature_snapshot' | 'sync_state'): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }
  return row.c
}

/** EXPLAIN QUERY PLAN evidence: which index SQLite actually picks. */
function queryPlan(db: DatabaseSyncLike, sql: string, ...params: unknown[]): string {
  return JSON.stringify(db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params))
}

/** Owned-SoT fingerprint: every row of the three owned tables. */
function dumpOwnedTables(db: DatabaseSyncLike): Record<string, unknown[]> {
  return {
    projects: db.prepare('SELECT * FROM projects ORDER BY id').all(),
    appState: db.prepare('SELECT * FROM app_state ORDER BY key').all(),
    sessionLinks: db.prepare('SELECT * FROM session_links ORDER BY id').all(),
  }
}

/** Derived-cache content dump (sync_state excluded: bookkeeping with non-deterministic timestamps). */
function dumpDerivedTables(db: DatabaseSyncLike): Record<string, unknown[]> {
  return {
    taskSnapshot: db.prepare('SELECT * FROM task_snapshot ORDER BY project_id, task_key').all(),
    featureSnapshot: db.prepare('SELECT * FROM feature_snapshot ORDER BY project_id, feature_slug').all(),
  }
}

describe('task_snapshot — 复合 PK upsert(AC1)', () => {
  it('inserts then re-upserts on (project_id, task_key): update in place, no UNIQUE blow-up, full-field replacement', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      const first = upsertTaskSnapshot(db, makeTask(project.id, '2.1', {
        blockers: ['1.1', '1.2'],
        branch: 'dsh-forge-m2',
        worktree: true,
        source: 'terminal',
        updatedAt: T1,
      }))
      expect(first).toMatchObject({
        projectId: project.id,
        taskKey: '2.1',
        featureSlug: 'dsh-forge-m2',
        title: 'task 2.1',
        status: 'pending',
        blockers: ['1.1', '1.2'],
        branch: 'dsh-forge-m2',
        worktree: true,
        source: 'terminal',
        updatedAt: T1,
      })

      const second = upsertTaskSnapshot(db, makeTask(project.id, '2.1', {
        status: 'completed',
        blockers: [],
        branch: null,
        source: 'session',
        updatedAt: T2,
      }))
      expect(countRows(db, 'task_snapshot')).toBe(1)
      expect(second).toMatchObject({ status: 'completed', blockers: [], branch: null, source: 'session', updatedAt: T2, worktree: false })
      expect(getTaskSnapshot(db, project.id, '2.1')).toEqual(second)
    })
  })

  it('unknown project → ERR_PROJECT_NOT_FOUND across all snapshot write paths', async () => {
    await withDb((db) => {
      expectRepoError(capture(() => upsertTaskSnapshot(db, makeTask('no-such-project', '2.1'))), 'ERR_PROJECT_NOT_FOUND', /does not exist/)
      expectRepoError(capture(() => upsertTaskSnapshots(db, 'no-such-project', [])), 'ERR_PROJECT_NOT_FOUND', /does not exist/)
      expectRepoError(capture(() => upsertFeatureSnapshot(db, featureInput('no-such-project'))), 'ERR_PROJECT_NOT_FOUND', /does not exist/)
      expectRepoError(capture(() => markScanStarted(db, 'no-such-project')), 'ERR_PROJECT_NOT_FOUND', /does not exist/)
      expectRepoError(capture(() => resetSyncState(db, 'no-such-project')), 'ERR_PROJECT_NOT_FOUND', /does not exist/)
    })
  })

  it('out-of-vocabulary status / source rejected by the SQL CHECK (rejected write leaves no row); all 7 states round-trip', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      const badStatus = capture(() => upsertTaskSnapshot(db, makeTask(project.id, '2.1', { status: 'done' as TaskStatus })))
      expect(badStatus).toBeInstanceOf(Error)
      expect(badStatus).not.toBeInstanceOf(WorkbenchRepoError)
      expect((badStatus as Error).message).toMatch(/CHECK constraint/i)
      expect(getTaskSnapshot(db, project.id, '2.1')).toBeNull()

      const badSource = capture(() => upsertTaskSnapshot(db, makeTask(project.id, '2.1', { source: 'browser' as ChangeSource })))
      expect((badSource as Error).message).toMatch(/CHECK constraint/i)
      expect(getTaskSnapshot(db, project.id, '2.1')).toBeNull()

      for (const status of SEVEN_STATES) {
        expect(upsertTaskSnapshot(db, makeTask(project.id, '2.1', { status })).status).toBe(status)
      }
      expect(countRows(db, 'task_snapshot')).toBe(1)
    })
  })

  it('blockers JSON round-trip (empty / multi / storage-verbatim) and defensive read of corrupt JSON', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      expect(upsertTaskSnapshot(db, makeTask(project.id, '1.1')).blockers).toEqual([])
      const withBlockers = upsertTaskSnapshot(db, makeTask(project.id, '1.2', { blockers: ['1.1', '1.0'] }))
      expect(withBlockers.blockers).toEqual(['1.1', '1.0'])
      // 存储层原样 JSON(TEXT 列无隐式改写)。
      const raw = db.prepare('SELECT blockers FROM task_snapshot WHERE project_id = ? AND task_key = ?').get(project.id, '1.2') as { blockers: string }
      expect(raw.blockers).toBe('["1.1","1.0"]')
      // 故障注入:损坏 JSON → 读取面回退空数组不炸(派生缓存可重建)。
      db.prepare('UPDATE task_snapshot SET blockers = ? WHERE project_id = ? AND task_key = ?').run('not-json', project.id, '1.2')
      expect(getTaskSnapshot(db, project.id, '1.2')?.blockers).toEqual([])
    })
  })
})

describe('task_snapshot — 查询面与索引命中(AC2)', () => {
  it('by-feature aggregation hits idx_task_snapshot_feature (EXPLAIN evidence)', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      seedBoard(db, project.id)
      const byFeature = listTaskSnapshotsByFeature(db, project.id, 'feature-a')
      expect(byFeature.map(task => task.taskKey)).toEqual(['2.2', '2.1'])
      expect(byFeature.every(task => task.featureSlug === 'feature-a')).toBe(true)
      expect(queryPlan(db, 'SELECT * FROM task_snapshot WHERE project_id = ? AND feature_slug = ? ORDER BY updated_at DESC, task_key', project.id, 'feature-a'))
        .toContain('idx_task_snapshot_feature')
    })
  })

  it('by-status filter hits idx_task_snapshot_status (EXPLAIN evidence)', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      seedBoard(db, project.id)
      const completed = listTaskSnapshotsByStatus(db, project.id, 'completed')
      expect(completed.map(task => task.taskKey)).toEqual(['2.1', '1.1'])
      expect(listTaskSnapshotsByStatus(db, project.id, 'skipped')).toEqual([])
      expect(queryPlan(db, 'SELECT * FROM task_snapshot WHERE project_id = ? AND status = ? ORDER BY updated_at DESC, task_key', project.id, 'completed'))
        .toContain('idx_task_snapshot_status')
    })
  })

  it('board listing orders by updated_at DESC (recent first); composite-key read; missing → null', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      seedBoard(db, project.id)
      expect(listTaskSnapshots(db, project.id).map(task => task.taskKey)).toEqual(['3.1', '2.2', '2.1', '1.1'])
      expect(getTaskSnapshot(db, project.id, '9.9')).toBeNull()
      expect(listTaskSnapshots(db, 'no-such-project')).toEqual([])
    })
  })
})

describe('feature_snapshot — manifest 词表直通 + 派生计数(AC3)', () => {
  it('status passthrough keeps manifest vocabulary verbatim, incl. hyphenated in-progress (no rewrite)', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      const vocab: FeatureStatus[] = ['prd', 'design', 'tasks', 'in-progress', 'completed']
      for (const status of vocab) {
        expect(upsertFeatureSnapshot(db, featureInput(project.id, { status })).status).toBe(status)
        // 存储层逐词原样(连字符形不改写为下划线/枚举码)。
        expect(db.prepare('SELECT status FROM feature_snapshot WHERE project_id = ?').get(project.id)).toMatchObject({ status })
      }
      expect(countRows(db, 'feature_snapshot')).toBe(1)
    })
  })

  it('doc_kinds JSON round-trip and taskTotal/taskCompleted stay consistent with task_snapshot', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      upsertTaskSnapshot(db, makeTask(project.id, '1.1', { featureSlug: 'feat', status: 'completed', updatedAt: T0 }))
      upsertTaskSnapshot(db, makeTask(project.id, '1.2', { featureSlug: 'feat', status: 'completed', updatedAt: T1 }))
      upsertTaskSnapshot(db, makeTask(project.id, '1.3', { featureSlug: 'feat', status: 'pending', updatedAt: T2 }))
      upsertTaskSnapshot(db, makeTask(project.id, '9.9', { featureSlug: 'other', status: 'completed', updatedAt: T0 }))

      const feature = upsertFeatureSnapshot(db, featureInput(project.id, { featureSlug: 'feat', docKinds: ['manifest', 'prd', 'tasks'] }))
      expect(feature.taskTotal).toBe(3)
      expect(feature.taskCompleted).toBe(2)
      expect(feature.docKinds).toEqual(['manifest', 'prd', 'tasks'])
      const raw = db.prepare('SELECT doc_kinds FROM feature_snapshot WHERE project_id = ? AND feature_slug = ?').get(project.id, 'feat') as { doc_kinds: string }
      expect(raw.doc_kinds).toBe('["manifest","prd","tasks"]')

      // 任务集变化后重放 upsert → 计数跟随(维护一致);同键重写不炸、单行。
      upsertTaskSnapshot(db, makeTask(project.id, '1.3', { featureSlug: 'feat', status: 'completed', updatedAt: T3 }))
      const refreshed = upsertFeatureSnapshot(db, featureInput(project.id, { featureSlug: 'feat', updatedAt: T3 }))
      expect(refreshed.taskTotal).toBe(3)
      expect(refreshed.taskCompleted).toBe(3)
      expect(countRows(db, 'feature_snapshot')).toBe(1)
    })
  })

  it('listFeatureSnapshots orders by updated_at DESC hitting idx_feature_snapshot_updated; missing read → null', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      upsertFeatureSnapshot(db, featureInput(project.id, { featureSlug: 'older', updatedAt: T0 }))
      upsertFeatureSnapshot(db, featureInput(project.id, { featureSlug: 'newer', updatedAt: T2 }))
      expect(listFeatureSnapshots(db, project.id).map(feature => feature.featureSlug)).toEqual(['newer', 'older'])
      expect(queryPlan(db, 'SELECT * FROM feature_snapshot WHERE project_id = ? ORDER BY updated_at DESC, feature_slug', project.id))
        .toContain('idx_feature_snapshot_updated')
      expect(getFeatureSnapshot(db, project.id, 'no-such-feature')).toBeNull()
      expect(listFeatureSnapshots(db, 'no-such-project')).toEqual([])
    })
  })
})

describe('sync_state — 1:1 读写 + 两种复位(AC4)', () => {
  it('lifecycle null → scanning → error(reason ≤120) → idle with cursor advanced; per-project 1:1 isolation', async () => {
    await withDb(async (db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      expect(getSyncState(db, project.id)).toBeNull()

      const scanning = markScanStarted(db, project.id)
      expect(scanning).toMatchObject({ projectId: project.id, status: 'scanning', lastScanAt: null, error: null })

      const failed = markScanFailed(db, project.id, 'watcher overload: '.repeat(20))
      expect(failed.status).toBe('error')
      expect(failed.error).toHaveLength(120)
      expect(failed.lastScanAt).toBeNull()

      const done = markScanSucceeded(db, project.id)
      expect(done).toMatchObject({ status: 'idle', error: null })
      expect(done.lastScanAt).toMatch(ISO_PATTERN)

      await tick()
      const doneAgain = markScanSucceeded(db, project.id)
      expect(new Date(doneAgain.lastScanAt ?? 0).getTime()).toBeGreaterThan(new Date(done.lastScanAt ?? 0).getTime())

      // scanning 置位不清既有游标(游标 = 最近一次「成功」扫描时点)。
      markScanStarted(db, project.id)
      expect(getSyncState(db, project.id)?.lastScanAt).toBe(doneAgain.lastScanAt)
      expect(getSyncState(db, project.id)?.status).toBe('scanning')

      // 项目间 1:1 隔离:另一项目不受波及。
      const other = registerInRepo(db, 'C:\\repos\\beta')
      expect(getSyncState(db, other.id)).toBeNull()
      expect(countRows(db, 'sync_state')).toBe(1)
    })
  })

  it('full-rebuild reset: resetSyncState removes the row back to the never-scanned initial state (idempotent)', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      markScanSucceeded(db, project.id)
      resetSyncState(db, project.id)
      expect(getSyncState(db, project.id)).toBeNull()
      expect(countRows(db, 'sync_state')).toBe(0)
      expect(() => resetSyncState(db, project.id)).not.toThrow()
    })
  })
})

describe('rebuildDerivedSnapshots — 全量重建入口(AC5)', () => {
  it('clears the three derived tables and replays the rescan hook without touching any owned row', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      activateProject(db, project.id)
      recordSessionLink(db, { projectId: project.id, taskKey: '2.1', sessionId: 'session-a' })
      seedBoard(db, project.id)
      upsertFeatureSnapshot(db, featureInput(project.id))
      markScanSucceeded(db, project.id)
      const ownedBefore = dumpOwnedTables(db)

      rebuildDerivedSnapshots(db, (txn) => {
        upsertTaskSnapshot(txn, makeTask(project.id, '9.9', { featureSlug: 'feature-z', updatedAt: T2 }))
        upsertFeatureSnapshot(txn, featureInput(project.id, { featureSlug: 'feature-z', updatedAt: T2 }))
      })

      // 清空三表后仅剩钩子重放内容(旧快照不残留合并);sync_state 未被钩子重建。
      expect(countRows(db, 'task_snapshot')).toBe(1)
      expect(countRows(db, 'feature_snapshot')).toBe(1)
      expect(countRows(db, 'sync_state')).toBe(0)
      expect(getTaskSnapshot(db, project.id, '9.9')?.featureSlug).toBe('feature-z')
      // 自有 SoT 任何一行不动(projects / app_state 激活指针 / session_links)。
      expect(dumpOwnedTables(db)).toEqual(ownedBefore)
    })
  })

  it('rebuild equivalence (对拍): full-table content equals the incremental per-upsert path', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      seedSnapshotSet(db, project.id)
      const incremental = dumpDerivedTables(db)
      expect(incremental.taskSnapshot).toHaveLength(4)
      expect(incremental.featureSnapshot).toHaveLength(2)

      rebuildDerivedSnapshots(db, txn => seedSnapshotSet(txn, project.id))
      expect(dumpDerivedTables(db)).toEqual(incremental)
    })
  })

  it('a failing rescan hook rolls the whole rebuild back (no cleared/partial intermediate state)', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      seedBoard(db, project.id)
      upsertFeatureSnapshot(db, featureInput(project.id))
      const before = dumpDerivedTables(db)

      const error = capture(() => rebuildDerivedSnapshots(db, (txn) => {
        upsertTaskSnapshot(txn, makeTask(project.id, '8.8'))
        throw new Error('rescan exploded')
      }))
      expect((error as Error).message).toBe('rescan exploded')
      expect(dumpDerivedTables(db)).toEqual(before)
    })
  })
})

describe('upsertTaskSnapshots — 500 行单事务基线(AC6/SC1 内层保障)', () => {
  it('writes 500 rows in one transaction within the write-side baseline, all round-tripping', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      const rows: UpsertTaskBatchRow[] = Array.from({ length: 500 }, (_, i) => {
        const major = Math.floor(i / 50) + 1
        const minor = (i % 50) + 1
        return {
          taskKey: `${String(major)}.${String(minor)}`,
          featureSlug: `feature-${String(major).padStart(2, '0')}`,
          title: `task ${String(major)}.${String(minor)}`,
          status: SEVEN_STATES[i % 7]!,
          blockers: minor === 1 ? [] : [`${String(major)}.${String(minor - 1)}`],
          branch: i % 4 === 0 ? `feat/${String(major)}` : null,
          worktree: i % 3 === 0,
          source: i % 2 === 0 ? 'terminal' : 'session',
          updatedAt: T0,
        }
      })

      const startMs = performance.now()
      upsertTaskSnapshots(db, project.id, rows)
      const elapsedMs = performance.now() - startMs

      expect(countRows(db, 'task_snapshot')).toBe(500)
      // SC1(≤2s 首屏)的内层保障:此处只断言写入侧数百 ms 量级;首屏整体断言归 6.2。
      expect(elapsedMs).toBeLessThan(500)
      // 抽查往返(i=499 → major 10 / minor 50)。
      expect(getTaskSnapshot(db, project.id, '10.50')).toMatchObject({
        featureSlug: 'feature-10',
        status: 'completed',
        blockers: ['10.49'],
        branch: null,
        worktree: false,
        source: 'session',
      })
      expect(listTaskSnapshotsByFeature(db, project.id, 'feature-03')).toHaveLength(50)
    })
  })

  it('a bad row mid-batch rolls the whole batch back (single transaction: all-or-nothing)', async () => {
    await withDb((db) => {
      const project = registerInRepo(db, 'C:\\repos\\alpha')
      const batch: UpsertTaskBatchRow[] = Array.from({ length: 50 }, (_, i) => makeTask(project.id, `7.${String(i + 1)}`, { featureSlug: 'feature-07' }))
      batch[25] = { ...batch[25]!, status: 'bogus' as TaskStatus }

      const error = capture(() => upsertTaskSnapshots(db, project.id, batch))
      expect((error as Error).message).toMatch(/CHECK constraint/i)
      expect(countRows(db, 'task_snapshot')).toBe(0)
    })
  })
})
