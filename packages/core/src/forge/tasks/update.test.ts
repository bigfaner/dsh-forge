// main-agent-task-tools 1.1 测试 —— updateTask 全路径（提案 Acceptance 1：宽字段 partial 改写 /
// 状态门六锁定态拒 / depends_on 增量环校验 / manual 边护栏 / updateTask 审计行）。
// 临时 SQLite 夹具（harness——add.test.ts 形制）。
import { afterEach, describe, expect, it } from 'vitest'
import { updateTask } from './update.js'
import {
  CycleDetectedError,
  EdgeOriginLockedError,
  TaskLockedError,
  TaskNotFoundError,
} from './errors.js'
import {
  createTasksHarness,
  seedEdge,
  seedFeature,
  seedTask,
  type TasksHarness,
} from './harness.js'

let h: TasksHarness | undefined
afterEach(() => {
  h?.dispose()
  h = undefined
})

function svc() {
  h ??= createTasksHarness()
  return (input: Parameters<typeof updateTask>[1]) => updateTask({ store: h!.store, events: h!.events }, input)
}

const P = () => h!.projectId
const rows = (sql: string, ...args: unknown[]): unknown[] =>
  h!.db.prepare(sql).all(...args) as unknown[]

describe('AC1 pending/blocked/suspended 全字段 partial 改写落库并返回更新后快照', () => {
  it('pending 全字段改写：宽字段面落库 + 快照所见即所得 + 未给字段不动 + 事件单发', async () => {
    const update = svc()
    seedFeature(h!.db, { slug: 'f1', status: 'tasks' })
    const id = seedTask(h!.db, 'f1', '1.1', { type: 'doc' })
    const snap = await update({
      projectId: P(),
      taskRef: { slug: 'f1', localId: '1.1' },
      title: '改题',
      type: 'coding-feature',
      priority: 'P0',
      estimatedTime: '2h',
      complexity: 'high',
      taskDesc: '新描述',
      acceptanceCriteria: ['全绿', 'lint 干净'],
      vars: { K: 'V' },
    })
    expect(snap).toMatchObject({
      taskId: id,
      slug: 'f1',
      localId: '1.1',
      title: '改题',
      taskType: 'coding-feature',
      taskStatus: 'pending',
      priority: 'P0',
      estimatedTime: '2h',
      complexity: 'high',
      taskDesc: '新描述',
      acceptanceCriteria: ['全绿', 'lint 干净'],
      vars: { K: 'V' },
    })
    const row = h!.db.prepare<unknown[], Record<string, unknown>>(
      `SELECT title, task_type, priority, estimated_time, complexity, task_desc, ac_json, vars_json
         FROM tasks WHERE id = ?`,
    ).get(id) as Record<string, unknown>
    expect(row).toMatchObject({
      title: '改题',
      task_type: 'coding-feature',
      priority: 'P0',
      estimated_time: '2h',
      complexity: 'high',
      task_desc: '新描述',
      ac_json: '["全绿","lint 干净"]',
      vars_json: '{"K":"V"}',
    })
    expect(h!.events.emitted).toEqual([{ projectId: P() }])
  })

  it('partial 语义：只给 title → 其余字段与 task_status 不动；三态全可改（blocked/suspended）', async () => {
    const update = svc()
    seedFeature(h!.db, { slug: 'f1', status: 'tasks' })
    const id = seedTask(h!.db, 'f1', '1.1', { type: 'doc' })
    await update({ projectId: P(), taskRef: { slug: 'f1', localId: '1.1' }, title: '只改题' })
    const row = h!.db.prepare<unknown[], { title: string; task_type: string; task_desc: string | null }>(
      `SELECT title, task_type, task_desc FROM tasks WHERE id = ?`,
    ).get(id) as { title: string; task_type: string; task_desc: string | null }
    expect(row).toEqual({ title: '只改题', task_type: 'doc', task_desc: null })

    seedTask(h!.db, 'f1', '2.1', { status: 'blocked' })
    await expect(
      update({ projectId: P(), taskRef: { slug: 'f1', localId: '2.1' }, title: '阻塞中改写' }),
    ).resolves.toMatchObject({ taskStatus: 'blocked', title: '阻塞中改写' })
    seedTask(h!.db, 'f1', '3.1', { status: 'suspended' })
    await expect(
      update({ projectId: P(), taskRef: { slug: 'f1', localId: '3.1' }, title: '挂起中改写' }),
    ).resolves.toMatchObject({ taskStatus: 'suspended', title: '挂起中改写' })
  })

  it('taskRef 未命中 → ERR_TASK_NOT_FOUND', async () => {
    const update = svc()
    seedFeature(h!.db, { slug: 'f1' })
    const err = await update({ projectId: P(), taskRef: { slug: 'f1', localId: '9.9' }, title: 'x' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TaskNotFoundError)
    expect((err as TaskNotFoundError).data.taskRef).toEqual({ slug: 'f1', localId: '9.9' })
  })
})

describe('AC2 六锁定态改写被拒（ERR_TASK_LOCKED）', () => {
  it.each(['in_progress', 'interrupted', 'completed', 'skipped', 'rejected'] as const)(
    '%s → TaskLockedError + 零写入零事件',
    async (status) => {
      const update = svc()
      seedFeature(h!.db, { slug: 'f1', status: 'tasks' })
      seedTask(h!.db, 'f1', '1.1', { status })
      const err = await update({ projectId: P(), taskRef: { slug: 'f1', localId: '1.1' }, title: 'x' }).catch(
        (e: unknown) => e,
      )
      expect(err).toBeInstanceOf(TaskLockedError)
      expect((err as TaskLockedError).code).toBe('ERR_TASK_LOCKED')
      expect((err as TaskLockedError).data).toEqual({
        projectId: P(),
        taskRef: { slug: 'f1', localId: '1.1' },
        taskStatus: status,
      })
      expect(h!.events.emitted).toEqual([]) // 拒绝面零事件
    },
  )
})

describe('AC3 depends_on 改写引环被拒（复用 addTask 增量环校验）', () => {
  it('多跳环 → ERR_CYCLE_DETECTED 完整环路径 + 边集零残留（事务回滚）', async () => {
    const update = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'tasks' })
    seedTask(h!.db, 'fx', '1.1')
    seedTask(h!.db, 'fx', '1.2')
    seedTask(h!.db, 'fx', '1.3')
    seedEdge(h!.db, 't-fx-1.2', 't-fx-1.1') // 1.2 等待 1.1
    seedEdge(h!.db, 't-fx-1.3', 't-fx-1.2') // 1.3 等待 1.2
    const err = await update({
      projectId: P(),
      taskRef: { slug: 'fx', localId: '1.1' },
      dependsOn: ['1.3'], // 1.1 → 1.3 → 1.2 → 1.1 成环
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CycleDetectedError)
    expect((err as CycleDetectedError).code).toBe('ERR_CYCLE_DETECTED')
    expect((err as CycleDetectedError).data.cycle).toEqual(['fx/1.1', 'fx/1.3', 'fx/1.2', 'fx/1.1'])
    // 事务回滚：manual 边集与审计行零残留
    expect(
      rows(`SELECT task_id, prerequisite_id, origin FROM task_edges WHERE task_id = 't-fx-1.1'`),
    ).toEqual([])
    expect(rows(`SELECT verb FROM task_records WHERE task_id = 't-fx-1.1'`)).toEqual([])
    expect(h!.events.emitted).toEqual([])
  })

  it('自依赖两步环直报：dependsOn 指向自身 → [T, T]', async () => {
    const update = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'tasks' })
    seedTask(h!.db, 'fx', '1.1')
    const err = await update({
      projectId: P(),
      taskRef: { slug: 'fx', localId: '1.1' },
      dependsOn: ['1.1'],
    }).catch((e: unknown) => e)
    expect((err as CycleDetectedError).data.cycle).toEqual(['fx/1.1', 'fx/1.1'])
  })

  it('无环改写照常：manual 边整组置换（删旧插新）+ 未命中前置 → ERR_TASK_NOT_FOUND', async () => {
    const update = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'tasks' })
    const t = seedTask(h!.db, 'fx', '1.1')
    seedTask(h!.db, 'fx', '1.2')
    seedTask(h!.db, 'fx', '1.3')
    seedEdge(h!.db, t, 't-fx-1.2') // 旧 manual 边：1.1 等待 1.2
    const snap = await update({ projectId: P(), taskRef: { slug: 'fx', localId: '1.1' }, dependsOn: ['1.3'] })
    expect(snap.taskStatus).toBe('pending')
    expect(
      rows(`SELECT task_id, prerequisite_id, origin FROM task_edges WHERE task_id = ?`, t),
    ).toEqual([{ task_id: t, prerequisite_id: 't-fx-1.3', origin: 'manual' }])
    const miss = await update({ projectId: P(), taskRef: { slug: 'fx', localId: '1.1' }, dependsOn: ['ghost'] }).catch(
      (e: unknown) => e,
    )
    expect(miss).toBeInstanceOf(TaskNotFoundError)
    expect((miss as TaskNotFoundError).data.taskRef).toEqual({ slug: 'fx', localId: 'ghost' })
  })
})

describe('AC4 fix-chain/autoconfig 边改写被拒，仅 manual 边可改写', () => {
  it.each(['fix-chain', 'autoconfig'] as const)('%s 派生出边在场 → ERR_TASK_EDGE_ORIGIN_LOCKED', async (origin) => {
    const update = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'tasks' })
    const t = seedTask(h!.db, 'fx', '1.1')
    seedTask(h!.db, 'fx', '2.1')
    seedEdge(h!.db, t, 't-fx-2.1', origin)
    const err = await update({ projectId: P(), taskRef: { slug: 'fx', localId: '1.1' }, dependsOn: [] }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(EdgeOriginLockedError)
    expect((err as EdgeOriginLockedError).code).toBe('ERR_TASK_EDGE_ORIGIN_LOCKED')
    expect((err as EdgeOriginLockedError).data).toEqual({
      projectId: P(),
      taskRef: { slug: 'fx', localId: '1.1' },
      origins: [origin],
    })
    // 拒绝面零写入：派生边原样保留
    expect(rows(`SELECT origin FROM task_edges WHERE task_id = ?`, t)).toEqual([{ origin }])
  })

  it('manual 边在场不触护栏：dependsOn 置空 → manual 边清空 + 派生边不动', async () => {
    const update = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'tasks' })
    const t = seedTask(h!.db, 'fx', '1.1')
    seedTask(h!.db, 'fx', '1.2')
    seedTask(h!.db, 'fx', '2.1')
    seedEdge(h!.db, t, 't-fx-1.2', 'manual')
    seedEdge(h!.db, t, 't-fx-2.1', 'fix-chain')
    // 先拒绝（护栏命中）——manual 旧边原样
    await update({ projectId: P(), taskRef: { slug: 'fx', localId: '1.1' }, dependsOn: [] }).catch(() => undefined)
    expect(
      rows(`SELECT prerequisite_id, origin FROM task_edges WHERE task_id = ?`, t),
    ).toEqual([
      { prerequisite_id: 't-fx-1.2', origin: 'manual' },
      { prerequisite_id: 't-fx-2.1', origin: 'fix-chain' },
    ])
  })
})

describe('AC5 records 表追加 verb=updateTask 审计行（actor=plugin-tool）', () => {
  it('每次成功改写 append 一行：无 from/to；多次改写多行；字段改写与边改写均留痕', async () => {
    const update = svc()
    seedFeature(h!.db, { slug: 'f1', status: 'tasks' })
    const t = seedTask(h!.db, 'f1', '1.1')
    seedTask(h!.db, 'f1', '1.2')
    await update({ projectId: P(), taskRef: { slug: 'f1', localId: '1.1' }, title: '一改' })
    await update({ projectId: P(), taskRef: { slug: 'f1', localId: '1.1' }, dependsOn: ['1.2'] })
    expect(
      rows(`SELECT verb, actor, from_status, to_status FROM task_records WHERE task_id = ?`, t),
    ).toEqual([
      { verb: 'updateTask', actor: 'plugin-tool', from_status: null, to_status: null },
      { verb: 'updateTask', actor: 'plugin-tool', from_status: null, to_status: null },
    ])
  })
})

describe('AC6 blocked 卡 depends_on 改写后同事务补跑恢复判定（提案 §2.2-1）', () => {
  it('删光未满足前置 → blocked 同事务恢复 pending + auto-restore 记录（actor=core）', async () => {
    const update = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'tasks' })
    const t = seedTask(h!.db, 'fx', '1.1', { status: 'completed' })
    const done = seedTask(h!.db, 'fx', '1.2', { status: 'completed' })
    const stuck = seedTask(h!.db, 'fx', '1.3', { status: 'pending' })
    seedTask(h!.db, 'fx', '2.1', { status: 'blocked' })
    seedEdge(h!.db, 't-fx-2.1', t)
    seedEdge(h!.db, 't-fx-2.1', done)
    seedEdge(h!.db, 't-fx-2.1', stuck)
    const snap = await update({ projectId: P(), taskRef: { slug: 'fx', localId: '2.1' }, dependsOn: ['1.1'] })
    // 同事务恢复 pending + 快照所见即所得
    expect(snap.taskStatus).toBe('pending')
    expect(h!.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`)
      .get('t-fx-2.1')).toEqual({ task_status: 'pending' })
    // auto-restore 记录落时间线（actor='core'，blocked→pending）
    expect(
      rows(`SELECT verb, from_status, to_status, actor FROM task_records WHERE task_id = 't-fx-2.1'`),
    ).toEqual([
      { verb: 'auto-restore', from_status: 'blocked', to_status: 'pending', actor: 'core' },
      { verb: 'updateTask', from_status: null, to_status: null, actor: 'plugin-tool' },
    ])
    // 边不删（满足 = 读时派生）
    expect(rows(`SELECT prerequisite_id FROM task_edges WHERE task_id = 't-fx-2.1'`)).toEqual([
      { prerequisite_id: t },
    ])
  })

  it('保留未满足前置 → 保持 blocked、零 auto-restore 记录（不报错）', async () => {
    const update = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'tasks' })
    seedTask(h!.db, 'fx', '1.1', { status: 'completed' })
    seedTask(h!.db, 'fx', '1.2', { status: 'pending' }) // 未满足前置
    seedTask(h!.db, 'fx', '2.1', { status: 'blocked' })
    seedEdge(h!.db, 't-fx-2.1', 't-fx-1.1')
    const snap = await update({ projectId: P(), taskRef: { slug: 'fx', localId: '2.1' }, dependsOn: ['1.1', '1.2'] })
    expect(snap.taskStatus).toBe('blocked')
    expect(h!.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`)
      .get('t-fx-2.1')).toEqual({ task_status: 'blocked' })
    expect(rows(`SELECT verb FROM task_records WHERE task_id = 't-fx-2.1' AND verb = 'auto-restore'`)).toEqual([])
  })

  it('非 depends_on 改写（仅字段）不触发恢复判定；pending 卡改依赖不恢复不记录', async () => {
    const update = svc()
    seedFeature(h!.db, { slug: 'fx', status: 'tasks' })
    seedTask(h!.db, 'fx', '1.1', { status: 'completed' })
    const blocked = seedTask(h!.db, 'fx', '2.1', { status: 'blocked' })
    seedEdge(h!.db, blocked, 't-fx-1.1')
    // 前置全满足但只改 title（未动 depends_on）→ 不补跑，保持 blocked
    const snap = await update({ projectId: P(), taskRef: { slug: 'fx', localId: '2.1' }, title: '只改题' })
    expect(snap.taskStatus).toBe('blocked')
    seedTask(h!.db, 'fx', '3.1', { status: 'pending' })
    await update({ projectId: P(), taskRef: { slug: 'fx', localId: '3.1' }, dependsOn: ['1.1'] })
    expect(rows(`SELECT verb, actor, from_status, to_status FROM task_records WHERE task_id = 't-fx-3.1'`)).toEqual([
      { verb: 'updateTask', actor: 'plugin-tool', from_status: null, to_status: null },
    ])
  })
})
