import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createProjectionReconcileService,
  mapUpstreamProjectionError,
} from '../src/main/workbench/projection/service.ts'
import {
  getWorkspaceProjectionRow,
  insertExpectationPlaceholder,
  recordSuccessfulPush,
} from '../src/main/workbench/projection/expectation-repo.ts'
import type { WorkspaceSnapshotEntry } from '../src/main/workbench/projection/plan.ts'
import {
  listProjects,
  registerProject,
  setProjectArchived,
} from '../src/main/workbench/repos/projects.ts'
import { WorkbenchRepoError, type RepoDb } from '../src/main/workbench/repos/types.ts'
import type { WorkbenchEvent } from '../src/main/workbench/indexer/diff.ts'
import { createProjectLifecycleService } from '../src/main/workbench/projects/lifecycle-service.ts'
import { openDatabase } from '../src/main/workbench/store/db.ts'

// 任务 3.2 — 投影对账 service(tech-design §Interface 1 v3·P3 批四动词 +
// §Interface 2 relay 语义)。矩阵:对账(一致 healthy / 三类偏差 deviation
// + DeviationRow)/ outcome 回填(ok 回写 / 错误码映射)/ relay 不在场
// (重试一次 → degraded ERR_PROJECTION_CHANNEL_UNAVAILABLE,plan 保留)/
// 注册 hook(期望占位 + 真实 plan;动词不因投影失败 reject)/ T1-T2 Hard
// Rules(reorder 仅 forge 子集;快照 log-only 零写放大)。

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-projection-svc-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

/** 注册用绝对 codeRoot(tmp 下唯一目录;正斜杠形态 = 规范化存储值)。 */
function projPath(name: string): string {
  return join(tmpdir(), `dsh-forge-projection-svc-p-${name}`).replaceAll('\\', '/')
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

async function withDb(run: (db: RepoDb) => void | Promise<void>): Promise<void> {
  const { db } = await openDatabase(makeScratch())
  try {
    await run(db as RepoDb)
  } finally {
    db.close()
  }
}

function ws(workspaceId: string, path: string, title: string, orderIdx: number): WorkspaceSnapshotEntry {
  return { workspaceId, path, title, orderIdx }
}

interface Harness {
  readonly events: WorkbenchEvent[]
  /** relayPresence 缺省恒真(在场);absent = 恒假。 */
  service: ReturnType<typeof createProjectionReconcileService>
  setRelay(present: boolean): void
  stdout: string[]
}

function makeHarness(db: RepoDb): Harness {
  const events: WorkbenchEvent[] = []
  let relay = true
  const service = createProjectionReconcileService({
    db,
    onEvents: batch => events.push(...batch),
    relayPresence: () => relay,
    now: () => '2026-09-29T12:00:00.000Z',
  })
  const stdout: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    stdout.push(String(chunk))
    return true
  }) as typeof process.stdout.write)
  return { events, service, setRelay: present => (relay = present), stdout }
}

/** 快进 debounce 窗口(默认 250ms)触发对账重算。 */
function settleReconcile(): void {
  vi.advanceTimersByTime(250)
}

/** 快进通道缺席重试窗口(默认 500ms)。 */
function settleChannelRetry(): void {
  vi.advanceTimersByTime(500)
}

function projectionUpdated(events: readonly WorkbenchEvent[]): WorkbenchEvent[] {
  return events.filter(event => event.type === 'projection_updated')
}

function pushRequired(events: readonly WorkbenchEvent[]): WorkbenchEvent[] {
  return events.filter(event => event.type === 'projection_push_required')
}

// ---------------------------------------------------------------------------
// AC-2:对账矩阵(submitWorkspaceSnapshot → 3.1 diff → 状态迁移)
// ---------------------------------------------------------------------------

describe('projection reconcile — snapshot → diff → state transitions (AC-2)', () => {
  it('一致(从未推送,实况同名在场):pending 收数 adopted → healthy + projection_updated(无偏差明细)', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const h = makeHarness(db)
      h.service.submitSnapshot([ws('ws-1', projPath('a'), 'A', 0)])
      expect(projectionUpdated(h.events)).toEqual([]) // debounce 窗口内零事件
      settleReconcile()
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('healthy')
      expect(projectionUpdated(h.events)).toEqual([
        { type: 'projection_updated', projectId: a.id, state: 'healthy' },
      ])
      // 稳态自旋:重复上报一致快照零新事件(幂等自旋零噪音)。
      h.service.submitSnapshot([ws('ws-1', projPath('a'), 'A', 0)])
      settleReconcile()
      expect(projectionUpdated(h.events)).toHaveLength(1)
    })
  })

  it('renamed 偏差(已推送 title 被 dsh 侧手改)→ deviation + DeviationRow 明细随事件', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      recordSuccessfulPush(db, { projectId: a.id, workspaceId: 'ws-1', path: projPath('a'), title: 'A', orderIdx: 0, pushedAt: '2026-09-28T00:00:00.000Z' })
      const h = makeHarness(db)
      h.service.submitSnapshot([ws('ws-1', projPath('a'), 'A-hacked', 0)])
      settleReconcile()
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('deviation')
      expect(projectionUpdated(h.events)).toEqual([{
        type: 'projection_updated',
        projectId: a.id,
        state: 'deviation',
        deviations: [{ type: 'renamed', detail: expect.stringContaining("pushed 'A' vs dsh 'A-hacked'") }],
      }])
    })
  })

  it('deleted 偏差(已推送 workspace 从实况消失)→ deviation + ensure 重建 plan 保留', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      recordSuccessfulPush(db, { projectId: a.id, workspaceId: 'ws-1', path: projPath('a'), title: 'A', orderIdx: 0, pushedAt: '2026-09-28T00:00:00.000Z' })
      const h = makeHarness(db)
      h.service.submitSnapshot([])
      settleReconcile()
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('deviation')
      expect(projectionUpdated(h.events)[0]).toMatchObject({
        projectId: a.id,
        state: 'deviation',
        deviations: [{ type: 'deleted' }],
      })
    })
  })

  it('reordered 偏差(已推送子集相对序漂移)→ 子集成员各 deviation 各一行明细', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const b = registerProject(db, { codeRoot: projPath('b'), docLocationType: 'in_repo', displayName: 'B' })
      recordSuccessfulPush(db, { projectId: a.id, workspaceId: 'ws-a', path: projPath('a'), title: 'A', orderIdx: 0, pushedAt: '2026-09-28T00:00:00.000Z' })
      recordSuccessfulPush(db, { projectId: b.id, workspaceId: 'ws-b', path: projPath('b'), title: 'B', orderIdx: 1, pushedAt: '2026-09-28T00:00:00.000Z' })
      const h = makeHarness(db)
      // 实况:b 在 a 前;用户自有 workspace 混排其间(不参与、不受扰)。
      h.service.submitSnapshot([ws('ws-b', projPath('b'), 'B', 0), ws('ws-user', '/own', 'User', 1), ws('ws-a', projPath('a'), 'A', 2)])
      settleReconcile()
      const updated = projectionUpdated(h.events)
      expect(updated).toHaveLength(2)
      for (const event of updated) {
        expect(event).toMatchObject({ type: 'projection_updated', state: 'deviation' })
        if (event.type === 'projection_updated') {
          expect(event.deviations).toEqual([{ type: 'reordered', detail: expect.stringContaining('order drift') }])
        }
      }
      expect(new Set(updated.map(event => (event as { projectId: string }).projectId))).toEqual(new Set([a.id, b.id]))
    })
  })

  it('unprojected(待收敛 op 无偏差)不迁移;偏差与未投影并存互不串扰', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const pushed = registerProject(db, { codeRoot: projPath('pushed'), docLocationType: 'in_repo', displayName: 'P' })
      const fresh = registerProject(db, { codeRoot: projPath('fresh'), docLocationType: 'in_repo', displayName: 'F' })
      recordSuccessfulPush(db, { projectId: pushed.id, workspaceId: 'ws-p', path: projPath('pushed'), title: 'P', orderIdx: 0, pushedAt: '2026-09-28T00:00:00.000Z' })
      const h = makeHarness(db)
      // pushed 被手改(偏差);fresh 实况未命中(待收敛 op,无从「被手改」)。
      h.service.submitSnapshot([ws('ws-p', projPath('pushed'), 'P-hacked', 0)])
      settleReconcile()
      const byId = new Map(listProjects(db).map(p => [p.id, p.projectionState]))
      expect(byId.get(pushed.id)).toBe('deviation')
      expect(byId.get(fresh.id)).toBe('pending')
      expect(projectionUpdated(h.events).map(event => (event as { projectId: string }).projectId)).toEqual([pushed.id])
    })
  })

  it('上报 debounce:窗口内多次上报只触发一次对账重算(事件计数 = 状态变更数)', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const h = makeHarness(db)
      h.service.submitSnapshot([])
      h.service.submitSnapshot([ws('ws-x', '/elsewhere', 'X', 0)])
      h.service.submitSnapshot([ws('ws-1', projPath('a'), 'A', 0)])
      expect(projectionUpdated(h.events)).toEqual([]) // 三连报合并为一窗
      settleReconcile()
      expect(projectionUpdated(h.events)).toEqual([{ type: 'projection_updated', projectId: a.id, state: 'healthy' }])
    })
  })

  it('T2:快照上报 = 主进程结构化 log + 零写放大(workspace_projection 行不动)', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      insertExpectationPlaceholder(db, a.id)
      const before = getWorkspaceProjectionRow(db, a.id)
      const h = makeHarness(db)
      h.service.submitSnapshot([ws('ws-1', projPath('a'), 'A', 0)])
      expect(h.stdout.some(line => line.includes('WORKBENCH_PROJECTION_SNAPSHOT'))).toBe(true)
      expect(getWorkspaceProjectionRow(db, a.id)).toEqual(before) // 快照不落库、不写表
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('pending') // 窗口内未迁移
      settleReconcile() // 迁移只动 projection_state(状态机位),期望快照列原样
      expect(getWorkspaceProjectionRow(db, a.id)).toEqual({ ...before, lastError: null })
    })
  })
})

// ---------------------------------------------------------------------------
// AC-1:getProjectionStatus(状态行 + 偏差明细)
// ---------------------------------------------------------------------------

describe('getProjectionStatus — 状态行 + 偏差明细物化 (AC-1)', () => {
  it('全量行:期望基线 + 状态机现值 + 偏差重算物化;drift 行携带明细', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const b = registerProject(db, { codeRoot: projPath('b'), docLocationType: 'in_repo', displayName: 'B' })
      recordSuccessfulPush(db, { projectId: b.id, workspaceId: 'ws-b', path: projPath('b'), title: 'B', orderIdx: 1, pushedAt: '2026-09-28T00:00:00.000Z' })
      const h = makeHarness(db)
      h.service.submitSnapshot([ws('ws-b', projPath('b'), 'B-hacked', 0)])
      const rows = h.service.getProjectionStatus({})
      expect(rows.map(row => row.projectId)).toEqual([a.id, b.id])
      expect(rows[0]).toMatchObject({
        displayName: 'A',
        path: projPath('a'),
        orderIdx: 0,
        archived: false,
        state: 'pending',
        workspaceId: null,
        pushedAt: null,
        lastError: null,
        deviations: [],
      })
      expect(rows[1]).toMatchObject({
        state: 'pending',
        workspaceId: 'ws-b',
        pushedAt: '2026-09-28T00:00:00.000Z',
        deviations: [{ type: 'renamed', detail: expect.stringContaining('B-hacked') }],
      })
    })
  })

  it('单项目过滤 + 未知 projectId → ERR_PROJECT_NOT_FOUND;归档行零偏差(不对账)', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      setProjectArchived(db, a.id, true)
      recordSuccessfulPush(db, { projectId: a.id, workspaceId: 'ws-1', path: projPath('a'), title: 'A', orderIdx: 0, pushedAt: '2026-09-28T00:00:00.000Z' })
      const h = makeHarness(db)
      h.service.submitSnapshot([]) // 实况全空:归档项目不判 deleted
      const rows = h.service.getProjectionStatus({ projectId: a.id })
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ archived: true, deviations: [] })

      const error = (() => {
        try {
          h.service.getProjectionStatus({ projectId: 'ghost' })
        } catch (caught) {
          return caught
        }
        return undefined
      })()
      expect(error).toBeInstanceOf(WorkbenchRepoError)
      expect((error as WorkbenchRepoError).code).toBe('ERR_PROJECT_NOT_FOUND')
    })
  })
})

// ---------------------------------------------------------------------------
// AC-3:reportProjectionOutcome(relay 回填 ok / error + 上游错误码映射)
// ---------------------------------------------------------------------------

describe('reportProjectionOutcome — 回填矩阵 (AC-3)', () => {
  it('ok:期望 repo 回写(全列 + last_error 清位 + projects.workspace_id 镜像)+ push_succeeded → healthy', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      recordProjectionDegradedForTest(db, a.id)
      const h = makeHarness(db)
      h.service.submitSnapshot([ws('ws-1', projPath('a'), 'A', 0)])
      h.service.reportOutcome({ projectId: a.id, ok: true })
      const row = getWorkspaceProjectionRow(db, a.id)
      expect(row).toMatchObject({
        workspaceId: 'ws-1',
        path: projPath('a'),
        title: 'A',
        orderIdx: 0,
        pushedAt: '2026-09-29T12:00:00.000Z',
        lastError: null,
      })
      const mirror = db.prepare('SELECT workspace_id FROM projects WHERE id = ?').get(a.id) as { workspace_id: string | null }
      expect(mirror.workspace_id).toBe('ws-1')
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('healthy')
      expect(projectionUpdated(h.events)).toEqual([{ type: 'projection_updated', projectId: a.id, state: 'healthy' }])
    })
  })

  it('ok(实况未知,从未推送):workspaceId 落占位哨兵(DTO 面 null),pushed_at 落位', async () => {
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const h = makeHarness(db)
      h.service.reportOutcome({ projectId: a.id, ok: true })
      expect(getWorkspaceProjectionRow(db, a.id)).toMatchObject({ workspaceId: null, pushedAt: '2026-09-29T12:00:00.000Z' })
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('healthy')
    })
  })

  it('error(workspace/invalid-path)→ degraded + last_error = ERR_PROJECTION_OP_FAILED 携原码', async () => {
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const h = makeHarness(db)
      h.service.reportOutcome({ projectId: a.id, ok: false, error: { code: 'workspace/invalid-path', message: 'anchor path rejected' } })
      expect(getWorkspaceProjectionRow(db, a.id)?.lastError)
        .toBe('ERR_PROJECTION_OP_FAILED (upstream workspace/invalid-path): anchor path rejected')
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('degraded')
      expect(projectionUpdated(h.events)).toEqual([{ type: 'projection_updated', projectId: a.id, state: 'degraded' }])
    })
  })

  it('三上游码全映射 ERR_PROJECTION_OP_FAILED detail 携原码;未列举码原样透传(纯函数)', () => {
    expect(mapUpstreamProjectionError('workspace/invalid-path', 'm')).toBe('ERR_PROJECTION_OP_FAILED (upstream workspace/invalid-path): m')
    expect(mapUpstreamProjectionError('name-conflict', 'm')).toBe('ERR_PROJECTION_OP_FAILED (upstream name-conflict): m')
    expect(mapUpstreamProjectionError('move-invalid', 'm')).toBe('ERR_PROJECTION_OP_FAILED (upstream move-invalid): m')
    expect(mapUpstreamProjectionError('upstream/unknown-code', 'm')).toBe('upstream/unknown-code: m')
  })

  it('error 后重试成功 → degraded 恢复 healthy(push_succeeded 恢复路径)', async () => {
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const h = makeHarness(db)
      h.service.reportOutcome({ projectId: a.id, ok: false, error: { code: 'name-conflict', message: 'taken' } })
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('degraded')
      h.service.reportOutcome({ projectId: a.id, ok: true })
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('healthy')
      expect(getWorkspaceProjectionRow(db, a.id)?.lastError).toBeNull()
      expect(projectionUpdated(h.events).map(event => (event as { state: string }).state)).toEqual(['degraded', 'healthy'])
    })
  })

  it('未知 projectId → ERR_PROJECT_NOT_FOUND(动词唯一 reject 面)', async () => {
    await withDb((db) => {
      const h = makeHarness(db)
      expect(() => h.service.reportOutcome({ projectId: 'ghost', ok: true })).toThrowError(WorkbenchRepoError)
      expect(() => h.service.retryProjection({ projectId: 'ghost' })).toThrowError(WorkbenchRepoError)
    })
  })
})

/** error 前置:落一段 degraded 历史验证 ok 路径的 last_error 清位。 */
function recordProjectionDegradedForTest(db: RepoDb, projectId: string): void {
  db.exec('BEGIN IMMEDIATE')
  db.prepare(
    'INSERT INTO workspace_projection (project_id, workspace_id, path, title, order_idx, pushed_at, last_error) '
      + "VALUES (?, '', '', '', 0, '', 'stale error') "
      + 'ON CONFLICT (project_id) DO UPDATE SET last_error = ?',
  ).run(projectId, 'stale error')
  db.exec('COMMIT')
}

// ---------------------------------------------------------------------------
// AC-4:relay 不在场语义(重试一次 → degraded;plan 保留;禁静默丢弃)
// ---------------------------------------------------------------------------

describe('relay absent semantics — plan preserved + degraded (AC-4)', () => {
  it('缺席:重试一次仍缺席 → degraded(ERR_PROJECTION_CHANNEL_UNAVAILABLE 落 last_error);期望在库保留', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const h = makeHarness(db)
      h.setRelay(false)
      h.service.retryProjection({ projectId: a.id })
      expect(projectionUpdated(h.events)).toEqual([]) // 重试窗口内不降级
      settleChannelRetry()
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('degraded')
      expect(getWorkspaceProjectionRow(db, a.id)?.lastError).toContain('ERR_PROJECTION_CHANNEL_UNAVAILABLE')
      expect(pushRequired(h.events)).toEqual([]) // 从未静默丢弃到无人监听的通道外
      // plan 保留:期望在库 —— relay 回场后 retryProjection 即幂等全量重推。
      h.setRelay(true)
      const result = h.service.retryProjection({ projectId: a.id })
      expect(result.state).toBe('degraded') // 现态返回(恢复待 outcome 回填)
      expect(pushRequired(h.events)).toHaveLength(1)
      h.service.reportOutcome({ projectId: a.id, ok: true })
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('healthy')
    })
  })

  it('启动竞态:缺席一次后回场 → 重试腿直发 projection_push_required,不降级', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const h = makeHarness(db)
      h.setRelay(false)
      h.service.retryProjection({ projectId: a.id })
      h.setRelay(true) // 竞态窗口内渲染订阅到位
      settleChannelRetry()
      expect(pushRequired(h.events)).toEqual([{
        type: 'projection_push_required',
        projectId: a.id,
        plan: { projectId: a.id, ops: [{ kind: 'ensure', canonicalPath: projPath('a'), title: 'A' }] },
      }])
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('pending')
      expect(getWorkspaceProjectionRow(db, a.id)?.lastError ?? null).toBeNull()
    })
  })

  it('retryProjection = 幂等全量重推:自包含 plan(ensure+reorder);重复调用同 plan;T1 = orderedIds 仅 forge 所属子集', async () => {
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const b = registerProject(db, { codeRoot: projPath('b'), docLocationType: 'in_repo', displayName: 'B' })
      recordSuccessfulPush(db, { projectId: a.id, workspaceId: 'ws-a', path: projPath('a'), title: 'A', orderIdx: 0, pushedAt: '2026-09-28T00:00:00.000Z' })
      recordSuccessfulPush(db, { projectId: b.id, workspaceId: 'ws-b', path: projPath('b'), title: 'B', orderIdx: 1, pushedAt: '2026-09-28T00:00:00.000Z' })
      const h = makeHarness(db)
      h.service.submitSnapshot([ws('ws-b', projPath('b'), 'B-renamed', 0), ws('ws-user', '/own', 'User', 1), ws('ws-a', projPath('a'), 'A', 2)])
      const first = h.service.retryProjection({ projectId: b.id })
      expect(first.state).toBe('pending')
      const second = h.service.retryProjection({ projectId: b.id })
      expect(second).toEqual(first)
      const pushes = pushRequired(h.events)
      expect(pushes).toHaveLength(2)
      const plan = (pushes[0] as { plan: { ops: unknown[] } }).plan
      // 自包含全量:单 plan 收敛 B 的 rename + forge 子集相对序(ensure 序
      // 内嵌);用户自有 workspace 永不入 orderedIds(T1 Hard Rule)。
      expect(plan.ops).toEqual([
        { kind: 'rename', workspaceId: 'ws-b', title: 'B' },
        { kind: 'reorder', orderedIds: ['ws-a', 'ws-b'] },
      ])
      expect((pushes[1] as { plan: { ops: unknown[] } }).plan.ops).toEqual(plan.ops) // 幂等:同输入同 plan
    })
  })

  it('归档项目 retryProjection:零 op 不推送,现态原样返回(必答⑤)', async () => {
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      setProjectArchived(db, a.id, true)
      const h = makeHarness(db)
      const result = h.service.retryProjection({ projectId: a.id })
      expect(result).toEqual({ state: 'pending' })
      expect(pushRequired(h.events)).toEqual([])
    })
  })

  it('dispose 冲刷 pending 对账:窗口未走的重算同步收尾,不丢状态迁移', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const h = makeHarness(db)
      h.service.submitSnapshot([ws('ws-1', projPath('a'), 'A', 0)])
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('pending')
      h.service.dispose() // 不 advance 定时器,dispose 直接冲刷
      expect(listProjects(db).find(p => p.id === a.id)?.projectionState).toBe('healthy')
      expect(projectionUpdated(h.events)).toEqual([{ type: 'projection_updated', projectId: a.id, state: 'healthy' }])
    })
  })

  it('push 面防御包装:presence 探测异常仅结构化 log,动词不上抛', async () => {
    await withDb((db) => {
      const a = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const stderr: string[] = []
      vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
        stderr.push(String(chunk))
        return true
      }) as typeof process.stderr.write)
      const events: WorkbenchEvent[] = []
      const service = createProjectionReconcileService({
        db,
        onEvents: batch => events.push(...batch),
        relayPresence: () => {
          throw new Error('subscriptions registry exploded')
        },
      })
      expect(() => service.retryProjection({ projectId: a.id })).not.toThrow()
      expect(stderr.some(line => line.includes('ERR_PROJECTION_OP_FAILED'))).toBe(true)
      expect(pushRequired(events)).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// AC-5:注册 hook(期望占位 + 真实 plan;动词不因投影失败 reject)
// ---------------------------------------------------------------------------

describe('registerProject hook — expectation placeholder + real plan push (AC-5)', () => {
  function makeLifecycle(db: RepoDb, events: WorkbenchEvent[], hook?: (projectId: string) => void) {
    return createProjectLifecycleService({
      db,
      docsRoot: join(makeScratch(), 'docs'),
      onEvents: batch => events.push(...batch),
      ...(hook === undefined ? {} : { onProjectionExpectation: hook }),
    })
  }

  /** v2 注册 anchor 须真实存在(D11 硬校验:存在+目录+可读)。 */
  function realAnchor(name: string): string {
    const dir = join(makeScratch(), name)
    mkdirSync(dir, { recursive: true })
    return dir.replaceAll('\\', '/')
  }

  it('hook 在场:注册成功 → 期望占位 + projection_push_required(真实 plan)先于 project_list_changed', async () => {
    vi.useFakeTimers()
    await withDb((db) => {
      const h = makeHarness(db)
      // 事件面共用同一数组(生产装配 = 同一 sink;顺序断言方成立)。
      const lifecycle = makeLifecycle(db, h.events, projectId => h.service.pushForRegistration(projectId))
      const project = lifecycle.registerProject({ anchor: realAnchor('reg'), docsPlacement: 'repo-existing', displayName: 'reg' })
      // 期望占位(er-diagram「注册即占位」):path/title/order_idx 基线入行。
      expect(getWorkspaceProjectionRow(db, project.id)).toMatchObject({
        projectId: project.id,
        workspaceId: null,
        path: project.codeRoot,
        title: 'reg',
        orderIdx: 0,
        pushedAt: null,
        lastError: null,
      })
      // 事件序:projection_push_required(真实 plan)→ project_list_changed。
      expect(h.events).toEqual([
        {
          type: 'projection_push_required',
          projectId: project.id,
          plan: { projectId: project.id, ops: [{ kind: 'ensure', canonicalPath: project.codeRoot, title: 'reg' }] },
        },
        { type: 'project_list_changed' },
      ])
    })
  })

  it('hook 抛错:注册语义不受影响(Hard Rule:动词不因投影失败 reject)+ 结构化 log', async () => {
    await withDb((db) => {
      const stderr: string[] = []
      vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
        stderr.push(String(chunk))
        return true
      }) as typeof process.stderr.write)
      const events: WorkbenchEvent[] = []
      const lifecycle = makeLifecycle(db, events, () => {
        throw new Error('projection kernel exploded')
      })
      const project = lifecycle.registerProject({ anchor: realAnchor('reg2'), docsPlacement: 'repo-existing', displayName: 'reg2' })
      expect(project.id).toMatch(/^[0-9a-f-]{36}$/) // 注册成功
      expect(events).toEqual([{ type: 'project_list_changed' }]) // 投影事件缺席,列表照常
      expect(stderr.some(line => line.includes('ERR_PROJECTION_OP_FAILED'))).toBe(true)
    })
  })

  it('hook 缺省(isolated 装配):1.3 占位单 ensure plan 兜底,行为不变', async () => {
    await withDb((db) => {
      const events: WorkbenchEvent[] = []
      const lifecycle = makeLifecycle(db, events)
      const project = lifecycle.registerProject({ anchor: realAnchor('reg3'), docsPlacement: 'repo-existing', displayName: 'reg3' })
      expect(events).toEqual([
        {
          type: 'projection_push_required',
          projectId: project.id,
          plan: { projectId: project.id, ops: [{ kind: 'ensure', canonicalPath: project.codeRoot, title: 'reg3' }] },
        },
        { type: 'project_list_changed' },
      ])
    })
  })
})
