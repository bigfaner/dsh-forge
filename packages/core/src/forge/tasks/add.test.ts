// 任务 2.3 测试 —— addTask 全路径 + B.5 锚（tech-design §Interface 1 动词内聚不变量 /
// §Key Test Scenarios；db-schema §6-14 环校验 / §6-35⑦ localId 混合分配 / C2 block-source /
// C6 链深 ≤6 / 两级去重）。临时 SQLite 夹具（harness——db.test.ts 形制）。
import { afterEach, describe, expect, it } from 'vitest'
import { addTask, isUniqueViolation } from './add.js'
import {
  ChainDepthExceededError,
  CycleDetectedError,
  TaskExistsError,
  TaskNotFoundError,
  TasksFeatureNotFoundError,
} from './errors.js'
import { PhaseInvariantViolationError } from './phase-deriver.js'
import { createTasksHarness, seedEdge, seedFeature, seedTask, type TasksHarness } from './harness.js'

let h: TasksHarness | undefined
afterEach(() => {
  h?.dispose()
  h = undefined
})

function svc() {
  h ??= createTasksHarness()
  return (input: Parameters<typeof addTask>[1]) => addTask({ store: h!.store, events: h!.events }, input)
}

const P = () => h!.projectId
const rows = (sql: string, ...args: unknown[]): unknown[] =>
  h!.db.prepare(sql).all(...args) as unknown[]

describe('AC1 addTask 单事务：tasks 行 + localId 混合分配 + slug 归属校验', () => {
  it('常规新建全链：uuid + slug ≡ feature slug + pending + 字段映射 + add record + 相位 prd→tasks + 事件单发', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'f1' }) // prd、无文档无任务——推导机不动点
    const r = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'f1' },
      title: '示例任务',
      type: 'coding-feature',
      taskDesc: '描述',
      priority: 'P0',
      estimatedTime: '2h',
      vars: { K: 'V' },
      coverage: 0.8,
      complexity: 'high',
      surfaceKey: 'web',
      surfaceType: 'web',
      breaking: true,
    })
    expect(r).toMatchObject({ slug: 'f1', localId: '1.1', reused: false })
    expect(r.taskId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    const row = h!.db
      .prepare<unknown[], Record<string, unknown>>(
        `SELECT slug, local_id, title, task_type, task_status, task_desc, priority, estimated_time,
           vars_json, source_task_id, main_session, breaking, coverage, complexity, surface_key,
           surface_type, feature_id FROM tasks WHERE id = ?`,
      )
      .get(r.taskId) as Record<string, unknown>
    expect(row).toMatchObject({
      slug: 'f1',
      local_id: '1.1',
      title: '示例任务',
      task_type: 'coding-feature',
      task_status: 'pending',
      task_desc: '描述',
      priority: 'P0',
      estimated_time: '2h',
      vars_json: '{"K":"V"}',
      source_task_id: null,
      main_session: 0, // M3：输入面砍除（裁决⑦）——垫片恒 0，列随 1.2 schema 退役
      breaking: 1,
      coverage: 0.8,
      complexity: 'high',
      surface_key: 'web',
      surface_type: 'web',
    })
    expect(row.feature_id).toBe('f-f1')
    // add record（actor='plugin-tool'——add 为 tool 专属动词，通道即 actor；无 from/to）
    expect(rows(`SELECT verb, actor, from_status, to_status FROM task_records WHERE task_id = ?`, r.taskId)).toEqual([
      { verb: 'add', actor: 'plugin-tool', from_status: null, to_status: null },
    ])
    // 相位重算：无任务 prd + 首个 pending → tasks
    expect(
      h!.db.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE slug = 'f1'`).get(),
    ).toEqual({ feature_status: 'tasks' })
    expect(h!.events.emitted).toEqual([{ projectId: P() }])
  })

  it('localId 数值顺延：max(major.minor) 顺延（2.7 → 2.8）；空 feature 起点 1.1；非数值 id 不参与', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'num', status: 'tasks' })
    seedTask(h!.db, 'num', '1.1')
    seedTask(h!.db, 'num', '1.2')
    seedTask(h!.db, 'num', '2.7')
    expect((await add({ projectId: P(), source: { kind: 'feature', slug: 'num' }, title: 't', type: 'doc' })).localId).toBe('2.8')
    seedFeature(h!.db, { slug: 'fresh' })
    expect((await add({ projectId: P(), source: { kind: 'feature', slug: 'fresh' }, title: 't', type: 'doc' })).localId).toBe('1.1')
    seedFeature(h!.db, { slug: 'mixed', status: 'tasks' })
    seedTask(h!.db, 'mixed', '1.gate')
    seedTask(h!.db, 'mixed', 'fix-1', { type: 'coding-fix' })
    expect((await add({ projectId: P(), source: { kind: 'feature', slug: 'mixed' }, title: 't', type: 'doc' })).localId).toBe('1.1')
  })

  it('dependsOn → manual 边（origin=manual）；未命中 → ERR_TASK_NOT_FOUND（featureSlug 作用域）', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'dep', status: 'tasks' })
    seedTask(h!.db, 'dep', '1.1')
    const r = await add({ projectId: P(), source: { kind: 'feature', slug: 'dep' }, title: 't', type: 'doc', dependsOn: ['1.1'] })
    expect(
      rows(
        `SELECT task_id, prerequisite_id, origin FROM task_edges WHERE task_id = ?`,
        r.taskId,
      ),
    ).toEqual([{ task_id: r.taskId, prerequisite_id: 't-dep-1.1', origin: 'manual' }])
    const err = await add({ projectId: P(), source: { kind: 'feature', slug: 'dep' }, title: 't', type: 'doc', dependsOn: ['ghost'] }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(TaskNotFoundError)
    expect((err as TaskNotFoundError).data).toEqual({
      projectId: P(),
      taskRef: { slug: 'dep', localId: 'ghost' },
      featureSlug: 'dep',
    })
  })

  it('featureSlug 未命中 → ERR_FEATURE_NOT_FOUND（tasks 域就近类）+ 零行写入', async () => {
    const add = svc()
    const err = await add({ projectId: P(), source: { kind: 'feature', slug: 'ghost' }, title: 't', type: 'doc' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TasksFeatureNotFoundError)
    expect((err as TasksFeatureNotFoundError).code).toBe('ERR_FEATURE_NOT_FOUND')
    expect((err as TasksFeatureNotFoundError).data).toEqual({ projectId: P(), featureSlug: 'ghost' })
    expect(h!.db.prepare(`SELECT COUNT(*) AS n FROM tasks`).get()).toEqual({ n: 0 })
  })

  it('单事务全成全败：环拒绝/漂移拒绝 → tasks·edges·records·features 零残留', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'tasks' })
    const s22 = seedTask(h!.db, 'fx', '2.2')
    seedTask(h!.db, 'fx', '2.4')
    seedEdge(h!.db, 't-fx-2.4', s22)
    const before = {
      tasks: rows(`SELECT id FROM tasks`).length,
      edges: rows(`SELECT task_id FROM task_edges`).length,
      records: rows(`SELECT id FROM task_records`).length,
    }
    const err = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: '环',
      type: 'coding-fix',
      dependsOn: ['2.4'],
      sourceTask: { slug: 'fx', localId: '2.2' },
      blockSource: true,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CycleDetectedError)
    expect(rows(`SELECT id FROM tasks`).length).toBe(before.tasks)
    expect(rows(`SELECT task_id FROM task_edges`).length).toBe(before.edges)
    expect(rows(`SELECT id FROM task_records`).length).toBe(before.records)
    // 漂移拒绝（写时增量断言先于写）：源任务保持 pending 零变更
    seedFeature(h!.db, { slug: 'drifted', status: 'completed' })
    seedTask(h!.db, 'drifted', '1.1', { status: 'pending' })
    const driftErr = await add({ projectId: P(), source: { kind: 'feature', slug: 'drifted' }, title: 't', type: 'doc' }).catch(
      (e: unknown) => e,
    )
    expect(driftErr).toBeInstanceOf(PhaseInvariantViolationError)
    expect(
      h!.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE local_id = '1.1' AND slug = 'drifted'`).get(),
    ).toEqual({ task_status: 'pending' })
    expect(h!.events.emitted).toEqual([]) // 拒绝面零事件
  })
})

describe('AC2 增量环校验（B.5-1 锚：环构造双 flag）', () => {
  it('双 flag 组合成环 → ERR_CYCLE_DETECTED 回报完整环路径（可达性 DFS 一步命中）', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'feat-x', status: 'tasks' })
    const s22 = seedTask(h!.db, 'feat-x', '2.2')
    seedTask(h!.db, 'feat-x', '2.4')
    seedEdge(h!.db, 't-feat-x-2.4', s22) // 既有链：2.4 等待 2.2
    const err = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'feat-x' },
      title: 'T',
      type: 'coding-fix',
      dependsOn: ['2.4'],
      sourceTask: { slug: 'feat-x', localId: '2.2' },
      blockSource: true,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CycleDetectedError)
    expect((err as CycleDetectedError).code).toBe('ERR_CYCLE_DETECTED')
    // B.5-1 形制：2.2 → T(fix-1) → 2.4 → 2.2（'slug/localId' 复合自然键，首尾相接）
    expect((err as CycleDetectedError).data.cycle).toEqual([
      'feat-x/2.2',
      'feat-x/fix-1',
      'feat-x/2.4',
      'feat-x/2.2',
    ])
  })

  it('多跳路径全量回报（DFS 两跳）：2.2 → fix-1 → 2.4 → 2.3 → 2.2', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'tasks' })
    seedTask(h!.db, 'fx', '2.2')
    seedTask(h!.db, 'fx', '2.3')
    seedTask(h!.db, 'fx', '2.4')
    seedEdge(h!.db, 't-fx-2.4', 't-fx-2.3')
    seedEdge(h!.db, 't-fx-2.3', 't-fx-2.2')
    const err = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: 'T',
      type: 'coding-fix',
      dependsOn: ['2.4'],
      sourceTask: { slug: 'fx', localId: '2.2' },
      blockSource: true,
    }).catch((e: unknown) => e)
    expect((err as CycleDetectedError).data.cycle).toEqual(['fx/2.2', 'fx/fix-1', 'fx/2.4', 'fx/2.3', 'fx/2.2'])
  })

  it('D === S 两步环直报：dependsOn 指向源 → [S, T, S]', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'tasks' })
    seedTask(h!.db, 'fx', '2.2')
    const err = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: 'T',
      type: 'coding-fix',
      dependsOn: ['2.2'],
      sourceTask: { slug: 'fx', localId: '2.2' },
      blockSource: true,
    }).catch((e: unknown) => e)
    expect((err as CycleDetectedError).data.cycle).toEqual(['fx/2.2', 'fx/fix-1', 'fx/2.2'])
  })

  it('新节点无 dependsOn → 结构性无环 O(1)：blockSource 既有等待链照常建 fix', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'in-progress' }) // in_progress 任务在场 → 相位一致（写前增量断言）
    seedTask(h!.db, 'fx', '2.2', { status: 'in_progress' })
    seedTask(h!.db, 'fx', '2.4')
    seedEdge(h!.db, 't-fx-2.2', 't-fx-2.4') // 2.2 等待 2.4——fix 链常态零图遍历
    const r = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: 'fix',
      type: 'coding-fix',
      sourceTask: { slug: 'fx', localId: '2.2' },
      blockSource: true,
    })
    expect(r.localId).toBe('fix-1')
  })

  it('dependsOn 单独携带（无 block-source）→ 无入边不成环：照常新建 + manual 边', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'tasks' })
    seedTask(h!.db, 'fx', '2.2')
    seedTask(h!.db, 'fx', '2.4')
    seedEdge(h!.db, 't-fx-2.4', 't-fx-2.2')
    const r = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: 'follow',
      type: 'doc',
      dependsOn: ['2.4'],
      sourceTask: { slug: 'fx', localId: '2.2' },
    })
    expect(r.reused).toBe(false)
    expect(rows(`SELECT origin FROM task_edges WHERE task_id = ?`, r.taskId)).toEqual([{ origin: 'manual' }])
  })
})

describe('AC3 两级去重（B.5-3 锚）+ 边级 PK 幂等 + ERR_TASK_EXISTS', () => {
  it('任务级 fix 复用：同源同型未终态 → reused=true 复用既有行（零新建/零事件）', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'in-progress' }) // in_progress 任务在场 → 相位一致（写前增量断言）
    seedTask(h!.db, 'fx', '2.2', { status: 'in_progress' })
    const first = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: 'fix lint',
      type: 'coding-fix',
      sourceTask: { slug: 'fx', localId: '2.2' },
      blockSource: true,
    })
    expect(h!.events.emitted).toHaveLength(1)
    const second = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: 'fix lint again',
      type: 'coding-fix',
      sourceTask: { slug: 'fx', localId: '2.2' },
      blockSource: true,
    })
    expect(second).toEqual({ taskId: first.taskId, slug: 'fx', localId: 'fix-1', reused: true })
    expect(h!.db.prepare(`SELECT COUNT(*) AS n FROM tasks`).get()).toEqual({ n: 2 }) // 2.2 + fix-1
    expect(h!.events.emitted).toHaveLength(1) // 复用纯读零事件
  })

  it('既有 fix 已终态 → 不复用新建 fix-2；边持久不删（B.5-6）：两条 fix-chain 边并存', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'in-progress' }) // in_progress 任务在场 → 相位一致（写前增量断言）
    seedTask(h!.db, 'fx', '2.2', { status: 'in_progress' })
    const first = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: 'fix',
      type: 'coding-fix',
      sourceTask: { slug: 'fx', localId: '2.2' },
      blockSource: true,
    })
    // 2.4 submitTask 未落地（2.4 任务）——直写终态模拟 fix-1 completed
    h!.db.prepare(`UPDATE tasks SET task_status = 'completed' WHERE id = ?`).run(first.taskId)
    const second = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: 'fix again',
      type: 'coding-fix',
      sourceTask: { slug: 'fx', localId: '2.2' },
      blockSource: true,
    })
    expect(second).toMatchObject({ localId: 'fix-2', reused: false })
    // 边持久：恢复后 (2.2←fix-1) 仍在 + 新增 (2.2←fix-2)——边持久不删可观测证据
    const fixEdges = rows(
      `SELECT prerequisite_id, origin FROM task_edges WHERE task_id = 't-fx-2.2'`,
    ) as { prerequisite_id: string; origin: string }[]
    expect(fixEdges).toHaveLength(2)
    expect(new Set(fixEdges.map((e) => e.prerequisite_id))).toEqual(new Set([first.taskId, second.taskId]))
    expect(fixEdges.every((e) => e.origin === 'fix-chain')).toBe(true)
  })

  it('同源异型未终态 → 不复用（同型判据）：新建 disc-1', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'in-progress' }) // in_progress 任务在场 → 相位一致（写前增量断言）
    seedTask(h!.db, 'fx', '2.2', { status: 'in_progress' })
    await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: 'fix',
      type: 'coding-fix',
      sourceTask: { slug: 'fx', localId: '2.2' },
      blockSource: true,
    })
    const other = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: 'cleanup',
      type: 'coding-cleanup',
      sourceTask: { slug: 'fx', localId: '2.2' },
    })
    expect(other).toMatchObject({ localId: 'disc-1', reused: false })
  })

  it('manual 边重复（dependsOn 同项双写）→ ERR_TASK_EXISTS + 整体回滚', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'tasks' })
    seedTask(h!.db, 'fx', '1.1')
    const err = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: 't',
      type: 'doc',
      dependsOn: ['1.1', '1.1'],
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TaskExistsError)
    expect((err as TaskExistsError).code).toBe('ERR_TASK_EXISTS')
    expect((err as TaskExistsError).data.edge).toMatchObject({ prerequisiteId: 't-fx-1.1' })
    expect(h!.db.prepare(`SELECT COUNT(*) AS n FROM tasks`).get()).toEqual({ n: 1 }) // 零残留
    expect(h!.db.prepare(`SELECT COUNT(*) AS n FROM task_records`).get()).toEqual({ n: 0 })
  })

  it('UNIQUE 违例判据（存储级拒绝面映射）：tasks.slug 复合 UNIQUE / task_edges PK / 无关 code 不映射', () => {
    expect(
      isUniqueViolation(
        Object.assign(new Error('UNIQUE constraint failed: tasks.slug, tasks.local_id'), { code: 'SQLITE_CONSTRAINT_UNIQUE' }),
        'tasks.slug',
      ),
    ).toBe(true)
    expect(
      isUniqueViolation(
        Object.assign(new Error('UNIQUE constraint failed: task_edges.task_id, task_edges.prerequisite_id'), {
          code: 'SQLITE_CONSTRAINT_PRIMARYKEY',
        }),
        'task_edges',
      ),
    ).toBe(true)
    expect(
      isUniqueViolation(Object.assign(new Error('FOREIGN KEY constraint failed'), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }), 'tasks'),
    ).toBe(false)
    expect(isUniqueViolation(new Error('UNIQUE constraint failed: tasks.slug'), 'task_edges')).toBe(false)
    expect(isUniqueViolation('not-an-error', 'tasks')).toBe(false)
  })
})

describe('AC4 block-source 单事务建链 + fix 链深 ≤6', () => {
  it('blockSource 全家福：fix-N 分配 + 源置 blocked + auto-block record(actor=core) + fix-chain 边 + 相位重算', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'in-progress' }) // in_progress 任务在场 → 相位一致（写前增量断言）
    seedTask(h!.db, 'fx', '2.2', { status: 'in_progress' })
    const r = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: '修复 lint',
      type: 'coding-fix',
      sourceTask: { slug: 'fx', localId: '2.2' },
      blockSource: true,
    })
    expect(r.localId).toBe('fix-1')
    expect(
      h!.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = 't-fx-2.2'`).get(),
    ).toEqual({ task_status: 'blocked' })
    expect(
      rows(`SELECT verb, from_status, to_status, actor, task_id FROM task_records WHERE task_id = 't-fx-2.2'`),
    ).toEqual([{ verb: 'auto-block', from_status: 'in_progress', to_status: 'blocked', actor: 'core', task_id: 't-fx-2.2' }])
    expect(
      rows(`SELECT task_id, prerequisite_id, origin FROM task_edges WHERE task_id = 't-fx-2.2'`),
    ).toEqual([{ task_id: 't-fx-2.2', prerequisite_id: r.taskId, origin: 'fix-chain' }])
    // 相位重算：{blocked, pending} → in-progress（活跃相位）
    expect(
      h!.db.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE slug = 'fx'`).get(),
    ).toEqual({ feature_status: 'in-progress' })
  })

  it('fix 链深 ≤6：第 7 级拒绝 ERR_CHAIN_DEPTH_EXCEEDED（data 带链与深度）', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'chain', status: 'tasks' })
    seedTask(h!.db, 'chain', '1.1')
    let prev = { slug: 'chain', localId: '1.1' }
    for (let i = 1; i <= 6; i++) {
      const r = await add({
        projectId: P(),
        source: { kind: 'feature', slug: 'chain' },
        title: `fix-${i}`,
        type: 'coding-fix',
        sourceTask: prev,
        blockSource: true,
      })
      expect(r.localId).toBe(`fix-${i}`)
      prev = { slug: 'chain', localId: `fix-${i}` }
    }
    const err = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'chain' },
      title: 'fix-7',
      type: 'coding-fix',
      sourceTask: prev,
      blockSource: true,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ChainDepthExceededError)
    const data = (err as ChainDepthExceededError).data
    expect(data).toMatchObject({ projectId: P(), featureSlug: 'chain', depth: 7, limit: 6 })
    expect(data.chain[0]).toBe('chain/1.1')
    expect(data.chain[data.chain.length - 1]).toBe('chain/fix-6')
    expect(h!.db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE local_id LIKE 'fix-%'`).get()).toEqual({ n: 6 })
  })

  it('携源未阻（谱系不断链）：disc-N 分配 + 源不动 + 零 fix-chain 边 + source_task_id 落列', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'in-progress' }) // in_progress 任务在场 → 相位一致（写前增量断言）
    seedTask(h!.db, 'fx', '2.2', { status: 'in_progress' })
    const r = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'fx' },
      title: '衍生发现',
      type: 'doc',
      sourceTask: { slug: 'fx', localId: '2.2' },
    })
    expect(r.localId).toBe('disc-1')
    expect(
      h!.db.prepare<unknown[], { task_status: string; source_task_id: string | null }>(
        `SELECT task_status, source_task_id FROM tasks WHERE id = ?`,
      ).get(r.taskId),
    ).toEqual({ task_status: 'pending', source_task_id: 't-fx-2.2' })
    expect(
      h!.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = 't-fx-2.2'`).get(),
    ).toEqual({ task_status: 'in_progress' }) // 源未被阻断
    expect(rows(`SELECT COUNT(*) AS n FROM task_edges`)).toEqual([{ n: 0 }])
  })

  it('sourceTask 未命中 / 跨 feature 源 → ERR_TASK_NOT_FOUND（同 feature 归属校验）', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'f1', status: 'tasks' })
    seedTask(h!.db, 'f1', '1.1')
    seedFeature(h!.db, { slug: 'f2', status: 'tasks' })
    seedTask(h!.db, 'f2', '1.1')
    const miss = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'f1' },
      title: 't',
      type: 'coding-fix',
      sourceTask: { slug: 'f1', localId: '9.9' },
      blockSource: true,
    }).catch((e: unknown) => e)
    expect(miss).toBeInstanceOf(TaskNotFoundError)
    expect((miss as TaskNotFoundError).data.taskRef).toEqual({ slug: 'f1', localId: '9.9' })
    const cross = await add({
      projectId: P(),
      source: { kind: 'feature', slug: 'f1' },
      title: 't',
      type: 'coding-fix',
      sourceTask: { slug: 'f2', localId: '1.1' }, // 命中他 feature 同键——同 feature 边不变量拒绝
      blockSource: true,
    }).catch((e: unknown) => e)
    expect(cross).toBeInstanceOf(TaskNotFoundError)
    expect((cross as TaskNotFoundError).data.featureSlug).toBe('f1')
  })

  it('blockSource 无 sourceTask → fail-loud 契约违例（非 typed 域错误码面）', async () => {
    const add = svc()
    seedFeature(h!.db, { slug: 'fx' })
    const err = await add({ projectId: P(), source: { kind: 'feature', slug: 'fx' }, title: 't', type: 'coding-fix', blockSource: true }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('blockSource 需要 sourceTask')
    expect(h!.db.prepare(`SELECT COUNT(*) AS n FROM tasks`).get()).toEqual({ n: 0 })
  })
})
