// 任务 2.6 测试 —— listTasks/taskStats/taskGraph（tech-design §Interface 1 读面五法列表族 +
// TaskCard 副行承重字段表）：search 中英双语标签常量匹配 / sort(active|created) / 副行水化
// 四件（实际耗时[completed 首 claim→末 submit]/前置摘要[自然键+状态]/挂接计数/fix 源标）+
// EQP 三查询命中索引断言 + @500 任务直读核心侧基准（SC2 数据面 ≤2s）。
// 读面直读 Hard Rule（即时判据 = 单次重取见新值）单列断言。
import { afterEach, describe, expect, it } from 'vitest'
import type { TaskStatus } from '@dsh-forge/contracts'
import { LINKS_BY_SESSION_SQL } from './session-links.js'
import { listTasks, SQL_TASKS_BY_FEATURE, taskGraph, taskStats } from './list.js'
import { RECORDS_BY_TASK_SQL } from './query.js'
import {
  createTasksHarness,
  seedEdge,
  seedFeature,
  seedLink,
  seedRecord,
  seedTask,
  type TasksHarness,
} from './harness.js'

let h: TasksHarness | undefined
afterEach(() => {
  h?.dispose()
  h = undefined
})

function db() {
  h ??= createTasksHarness()
  return h.db
}
const P = () => h!.projectId

/** 受控时间序列（创建序断言基准） */
const TS = (n: number): string => `2026-10-06T0${n}:00:00.000Z`

/** 七态 + 跨类型夹具（f1 七任务 + f2 一任务）——返回 id 锚 */
function seedSevenStatuses(): Record<string, string> {
  const d = db()
  seedFeature(d, { slug: 'f1', status: 'in-progress' })
  seedFeature(d, { slug: 'f2' })
  const id: Record<string, string> = {
    pending: seedTask(d, 'f1', '1.1', { status: 'pending', type: 'coding-feature', createdAt: TS(1) }),
    inProgress: seedTask(d, 'f1', '1.2', { status: 'in_progress', type: 'doc', createdAt: TS(2) }),
    blocked: seedTask(d, 'f1', '1.3', { status: 'blocked', type: 'coding-fix', createdAt: TS(3) }),
    completed: seedTask(d, 'f1', '1.4', { status: 'completed', type: 'gate', createdAt: TS(4) }),
    suspended: seedTask(d, 'f1', '1.5', { status: 'suspended', createdAt: TS(5) }),
    skipped: seedTask(d, 'f1', '1.6', { status: 'skipped', createdAt: TS(6) }),
    rejected: seedTask(d, 'f1', '1.7', { status: 'rejected', createdAt: TS(7) }),
    other: seedTask(d, 'f2', '2.1', { status: 'completed', createdAt: TS(8) }),
  }
  return id
}

describe('AC1 listTasks：search 服务端中英双语过滤（标签常量匹配）', () => {
  it.each([
    ['待处理', ['1.1']], // 状态中文标签（TASK_STATUS_LABELS.zh）
    ['Pending', ['1.1']], // 状态英文标签
    ['in progress', ['1.2']], // 状态值本词（大小写不敏感）
    ['进行中', ['1.2']],
    ['文档', ['1.2']], // 类型中文标签（TASK_TYPE_LABELS.zh——doc = 文档）
    ['Gate', ['1.4']], // 类型英文标签
    ['缺陷修复', ['1.3']], // 类型中文标签（coding-fix）
    ['任务 1.3', ['1.3']], // 标题子串（seedTask 标题 = 任务 <localId>）
    ['1.4', ['1.4']], // localId 自然键
    ['f2', ['2.1']], // slug 自然键（仅 f2 任务命中）
    ['f1/1.2', ['1.2']], // 复合自然键 'slug/localId'
    ['不存在的词', []],
  ])('search %s → [%s]', async (needle, want) => {
    seedSevenStatuses()
    const cards = await listTasks({ store: h!.store }, { projectId: P(), search: needle })
    expect(cards.map((c) => c.localId)).toEqual(want)
  })

  it('search 空/纯空白 = 全量放行；trim 生效', async () => {
    seedSevenStatuses()
    for (const blank of [undefined, '', '   ']) {
      const cards = await listTasks({ store: h!.store }, { projectId: P(), search: blank })
      expect(cards).toHaveLength(8)
    }
    const trimmed = await listTasks({ store: h!.store }, { projectId: P(), search: ' 待处理 ' })
    expect(trimmed.map((c) => c.localId)).toEqual(['1.1'])
  })
})

describe('AC1 listTasks：statusFilter 七态 chips + featureSlug 作用域', () => {
  it('statusFilter = [pending, blocked] → 仅命中两态；空数组 = 全部（chips 缺省语义）', async () => {
    seedSevenStatuses()
    const filtered = await listTasks({ store: h!.store }, {
      projectId: P(),
      statusFilter: ['pending', 'blocked'],
    })
    expect(filtered.map((c) => c.localId).sort()).toEqual(['1.1', '1.3'])
    const all = await listTasks({ store: h!.store }, { projectId: P(), statusFilter: [] })
    expect(all).toHaveLength(8)
  })

  it('featureSlug 限定单 feature 子图；未命中 feature → 空数组（读面零 404）', async () => {
    seedSevenStatuses()
    const f1 = await listTasks({ store: h!.store }, { projectId: P(), source: { kind: 'feature', slug: 'f1' } })
    expect(f1).toHaveLength(7)
    expect(f1.every((c) => c.slug === 'f1')).toBe(true)
    await expect(
      listTasks({ store: h!.store }, { projectId: P(), source: { kind: 'feature', slug: 'nope' } }),
    ).resolves.toEqual([])
  })
})

describe('AC1 listTasks：sort（active 活跃优先 | created 最新创建）', () => {
  it("active（默认）= 活跃度权重序 in_progress → blocked → pending → suspended → skipped → rejected → completed（PRD '…' 展开）", async () => {
    const id = seedSevenStatuses()
    const cards = await listTasks({ store: h!.store }, { projectId: P(), source: { kind: 'feature', slug: 'f1' } })
    expect(cards.map((c) => c.taskStatus)).toEqual([
      'in_progress',
      'blocked',
      'pending',
      'suspended',
      'skipped',
      'rejected',
      'completed',
    ])
    expect(cards.at(-1)?.taskId).toBe(id.completed)
  })

  it('created = created_at 降序（组内 id 升序决胜——跨 feature 同库）', async () => {
    seedSevenStatuses()
    const cards = await listTasks({ store: h!.store }, { projectId: P(), sort: 'created' })
    expect(cards.map((c) => c.localId)).toEqual(['2.1', '1.7', '1.6', '1.5', '1.4', '1.3', '1.2', '1.1'])
  })

  it('active 组内同权重按 created 降序（三 pending 任务最新在前）', async () => {
    const d = db()
    seedFeature(d, { slug: 'f1' })
    seedTask(d, 'f1', '1.1', { status: 'pending', createdAt: TS(1) })
    seedTask(d, 'f1', '1.2', { status: 'pending', createdAt: TS(3) })
    seedTask(d, 'f1', '1.3', { status: 'pending', createdAt: TS(2) })
    const cards = await listTasks({ store: h!.store }, { projectId: P() })
    expect(cards.map((c) => c.localId)).toEqual(['1.2', '1.3', '1.1'])
  })
})

describe('AC1 TaskCard 副行水化四件（承重字段表逐项）', () => {
  it('实际耗时（仅 completed；core 水化 = 首 claim → 末 submit 时差）', async () => {
    const d = db()
    seedFeature(d, { slug: 'f1' })
    const done = seedTask(d, 'f1', '1.4', { status: 'completed', createdAt: TS(1) })
    // 两轮 claim→submit（blocked 再成功）——首 claim 08:00，末 submit 10:30 → 2h30m = 9000000ms
    seedRecord(d, done, { verb: 'claim', createdAt: '2026-10-06T08:00:00.000Z' })
    seedRecord(d, done, { verb: 'submit', createdAt: '2026-10-06T09:00:00.000Z' })
    seedRecord(d, done, { verb: 'claim', createdAt: '2026-10-06T09:10:00.000Z' })
    seedRecord(d, done, { verb: 'submit', createdAt: '2026-10-06T10:30:00.000Z' })
    const active = seedTask(d, 'f1', '1.1', { status: 'in_progress', createdAt: TS(2) })
    seedRecord(d, active, { verb: 'claim', createdAt: '2026-10-06T08:00:00.000Z' }) // 非 completed 不显示
    seedRecord(d, active, { verb: 'submit', createdAt: '2026-10-06T10:00:00.000Z' })
    const noClaim = seedTask(d, 'f1', '1.2', { status: 'completed', createdAt: TS(3) })
    seedRecord(d, noClaim, { verb: 'submit', createdAt: '2026-10-06T10:00:00.000Z' }) // 缺 claim 记录
    const inverted = seedTask(d, 'f1', '1.3', { status: 'completed', createdAt: TS(4) })
    seedRecord(d, inverted, { verb: 'claim', createdAt: '2026-10-06T10:00:00.000Z' })
    seedRecord(d, inverted, { verb: 'submit', createdAt: '2026-10-06T08:00:00.000Z' }) // 时差 ≤0 不显示

    const byLocal = new Map(
      (await listTasks({ store: h!.store }, { projectId: P() })).map((c) => [c.localId, c]),
    )
    expect(byLocal.get('1.4')?.actualDurationMs).toBe(9_000_000)
    expect(byLocal.get('1.1')?.actualDurationMs).toBeUndefined()
    expect(byLocal.get('1.2')?.actualDurationMs).toBeUndefined()
    expect(byLocal.get('1.3')?.actualDurationMs).toBeUndefined()
  })

  it('前置摘要（自然键 + 当前状态）+ 挂接计数（links ∪ records 双源去重）+ fix 源标（TaskRef）', async () => {
    const d = db()
    seedFeature(d, { slug: 'f1' })
    const first = seedTask(d, 'f1', '1.1', { status: 'pending', createdAt: TS(1) })
    const waiter = seedTask(d, 'f1', '1.2', { status: 'pending', createdAt: TS(2) })
    const fix = seedTask(d, 'f1', 'fix-1', { status: 'pending', sourceTaskId: first, createdAt: TS(3) })
    seedEdge(d, waiter, first, 'manual')
    // 1.1 挂接：link s1 + records s1/s2（s1 双源同会话去重）→ 2；1.2 无挂接 → 0
    seedLink(d, first, 's1')
    seedRecord(d, first, { verb: 'submit', sessionId: 's1' })
    seedRecord(d, first, { verb: 'transition', sessionId: 's2' })

    const byLocal = new Map(
      (await listTasks({ store: h!.store }, { projectId: P(), sort: 'created' })).map((c) => [
        c.localId,
        c,
      ]),
    )
    expect(byLocal.get('1.2')?.prerequisites).toEqual([
      { slug: 'f1', localId: '1.1', taskStatus: 'pending' },
    ])
    expect(byLocal.get('1.1')?.prerequisites).toEqual([])
    expect(byLocal.get('1.1')?.sessionCount).toBe(2)
    expect(byLocal.get('1.2')?.sessionCount).toBe(0)
    expect(byLocal.get('fix-1')?.sourceTask).toEqual({ slug: 'f1', localId: '1.1' })
    expect(byLocal.get('1.1')?.sourceTask).toBeUndefined()
    expect(fix).toBe('t-f1-fix-1')
  })
})

describe('读面直读 Hard Rule（即时判据 = 单次重取见新值——禁 watch/回流/快照同步）', () => {
  it('写后单次重取即见新值（无事件/无快照依赖）', async () => {
    const d = db()
    seedFeature(d, { slug: 'f1' })
    await expect(listTasks({ store: h!.store }, { projectId: P() })).resolves.toHaveLength(0)
    seedTask(d, 'f1', '1.1')
    await expect(listTasks({ store: h!.store }, { projectId: P() })).resolves.toHaveLength(1)
    const [stats1] = [await taskStats({ store: h!.store }, { projectId: P() })]
    expect(stats1.total).toBe(1)
  })
})

describe('AC2 taskStats（total + byStatus 七态分布）', () => {
  it('全库七态分布（零计数态含 0 键）+ feature 作用域', async () => {
    seedSevenStatuses()
    const all = await taskStats({ store: h!.store }, { projectId: P() })
    expect(all.total).toBe(8)
    expect(all.byStatus).toEqual({
      pending: 1,
      in_progress: 1,
      completed: 2,
      blocked: 1,
      suspended: 1,
      skipped: 1,
      rejected: 1,
    })
    expect(Object.keys(all.byStatus)).toEqual([
      'pending',
      'in_progress',
      'completed',
      'blocked',
      'suspended',
      'skipped',
      'rejected',
    ])
    const f1 = await taskStats({ store: h!.store }, { projectId: P(), source: { kind: 'feature', slug: 'f1' } })
    expect(f1.total).toBe(7)
    expect(f1.byStatus.pending).toBe(1)
  })

  it('空库 → 全零七态 + unmetPending 0（M3 池快照派生）', async () => {
    db() // 起夹具（空库）
    const stats = await taskStats({ store: h!.store }, { projectId: P() })
    expect(stats).toEqual({
      total: 0,
      byStatus: { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 },
      unmetPending: 0,
    })
  })
})

describe('AC2 taskGraph（tasks + edges{taskId, prerequisiteId, origin}——DAG 数据）', () => {
  it('feature 子图：TaskCard 全量水化 + 边三元组（origin 透传）', async () => {
    const d = db()
    seedFeature(d, { slug: 'f1' })
    seedFeature(d, { slug: 'f2' })
    const a = seedTask(d, 'f1', '1.1', { status: 'completed', createdAt: TS(1) })
    const b = seedTask(d, 'f1', '1.2', { createdAt: TS(2) })
    const c = seedTask(d, 'f1', 'fix-1', { sourceTaskId: a, createdAt: TS(3) })
    seedTask(d, 'f2', '2.1', { createdAt: TS(4) })
    seedEdge(d, b, a, 'manual')
    seedEdge(d, c, a, 'fix-chain')
    seedEdge(d, b, c, 'autoconfig')

    const graph = await taskGraph({ store: h!.store }, { projectId: P(), source: { kind: 'feature', slug: 'f1' } })
    expect(graph.tasks.map((t) => t.localId)).toEqual(['fix-1', '1.2', '1.1']) // created 降序（渲染稳定序）
    expect(graph.tasks.every((t) => t.slug === 'f1' && Array.isArray(t.prerequisites))).toBe(true)
    expect(graph.edges).toEqual([
      { taskId: b, prerequisiteId: a, origin: 'manual' },
      { taskId: b, prerequisiteId: c, origin: 'autoconfig' },
      { taskId: c, prerequisiteId: a, origin: 'fix-chain' },
    ])
  })

  it('未命中 feature → 空图（读面零 404）', async () => {
    const d = db()
    seedFeature(d, { slug: 'f1' })
    seedTask(d, 'f1', '1.1')
    await expect(
      taskGraph({ store: h!.store }, { projectId: P(), source: { kind: 'feature', slug: 'nope' } }),
    ).resolves.toEqual({ tasks: [], edges: [] })
  })
})

describe('AC6 EQP 三查询命中索引（EXPLAIN QUERY PLAN 断言——SC2 数据面）', () => {
  /** 计划详情拼接（多行 plan 合一断言面） */
  function plan(sql: string, ...params: unknown[]): string {
    return db()
      .prepare<unknown[], { detail: string }>(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...params)
      .map((r) => r.detail)
      .join(' | ')
  }

  it('① feature 容器作用域任务扫描 → idx_tasks_source_status（M3 更名——source 双列垫片）', () => {
    seedSevenStatuses()
    const detail = plan(SQL_TASKS_BY_FEATURE, 'f-f1')
    expect(detail).toContain('idx_tasks_source_status')
    expect(detail).not.toContain('SCAN tasks')
  })

  it('② 记录时间线（task_id 定位 + id 序）→ idx_records_task', () => {
    seedSevenStatuses()
    const detail = plan(RECORDS_BY_TASK_SQL, 't-f1-1.1')
    expect(detail).toContain('idx_records_task')
    expect(detail).not.toContain('SCAN task_records')
  })

  it('③ 会话挂接查询（session_id 定位）→ idx_tsl_session', () => {
    seedSevenStatuses()
    const detail = plan(LINKS_BY_SESSION_SQL, 's1')
    expect(detail).toContain('idx_tsl_session')
    expect(detail).not.toContain('SCAN task_session_links')
  })
})

describe('AC6 @500 任务直读核心侧基准（SC2 数据面 ≤2s——直读无 watch/回流）', () => {
  it('500 任务 + 499 边 + 抽样记录：listTasks 与 taskGraph 各 ≤ 2000ms', async () => {
    const d = db()
    seedFeature(d, { slug: 'big' })
    const statuses: TaskStatus[] = [
      'pending',
      'in_progress',
      'completed',
      'blocked',
      'suspended',
      'skipped',
      'rejected',
    ]
    const ids: string[] = []
    d.transaction(() => {
      for (let i = 0; i < 500; i++) {
        const localId = String(i + 1)
        const id = `t-big-${localId}`
        ids.push(id)
        d.prepare(
          `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, source_kind, source_id, mode, created_at, updated_at)
           VALUES (?, 'big', ?, ?, 'coding-feature', ?, 'feature', 'f-big', 'expedition', ?, ?)`,
        ).run(
          id,
          localId,
          `任务 ${localId}`,
          statuses[i % statuses.length]!,
          new Date(Date.parse('2026-10-06T00:00:00.000Z') + i * 1000).toISOString(),
          '2026-10-06T00:00:00.000Z',
        )
      }
      for (let i = 1; i < 500; i++) {
        d.prepare(
          `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
           VALUES (?, ?, 'manual', '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
        ).run(ids[i], ids[i - 1])
      }
      for (let i = 0; i < 500; i += 10) {
        d.prepare(
          `INSERT INTO task_records (task_id, verb, from_status, to_status, reason, summary, files_json,
             gate_json, commit_hash, dispatch_digest, actor, session_id, created_at, updated_at)
           VALUES (?, 'claim', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'plugin-tool', ?, ?, ?)`,
        ).run(ids[i], `s-${i}`, '2026-10-06T01:00:00.000Z', '2026-10-06T01:00:00.000Z')
      }
    })()

    const t0 = Date.now()
    const cards = await listTasks({ store: h!.store }, { projectId: P(), source: { kind: 'feature', slug: 'big' } })
    const t1 = Date.now()
    const graph = await taskGraph({ store: h!.store }, { projectId: P(), source: { kind: 'feature', slug: 'big' } })
    const t2 = Date.now()
    expect(cards).toHaveLength(500)
    expect(graph.tasks).toHaveLength(500)
    expect(graph.edges).toHaveLength(499)
    expect(t1 - t0).toBeLessThan(2000)
    expect(t2 - t1).toBeLessThan(2000)
  })
})
