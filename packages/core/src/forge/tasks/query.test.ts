// 任务 2.3 测试 —— queryTask（tech-design §Interface 1 queryTask + 身份解析约定）：
// TaskRef UNIQUE(slug, local_id) 查捞 → taskId 路径（未命中 ERR_TASK_NOT_FOUND）；
// include 四节门控（prerequisites/waitingOnMe/records/sessions——缺席 = 仅 task 节）；
// sessions 双源分型（SC6③：link=派发挂接 / record=执行挂接）。
import { afterEach, describe, expect, it } from 'vitest'
import { queryTask } from './query.js'
import { TaskNotFoundError } from './errors.js'
import { createTasksHarness, seedEdge, seedFeature, seedLink, seedRecord, seedTask, type TasksHarness } from './harness.js'

let h: TasksHarness | undefined
afterEach(() => {
  h?.dispose()
  h = undefined
})

function svc() {
  h ??= createTasksHarness()
  return (input: Parameters<typeof queryTask>[1]) => queryTask({ store: h!.store }, input)
}

const P = () => h!.projectId

describe('AC5 queryTask：身份解析 + TaskSnapshot 全量映射', () => {
  it('TaskRef 命中 → task 全字段快照（vars 解码 / 0|1 → boolean / NULL → 缺省键）', async () => {
    const q = svc()
    seedFeature(h!.db, { slug: 'f1', status: 'in-progress' })
    seedTask(h!.db, 'f1', '1.0') // 真实谱系源（source_task_id FK 在场）
    h!.db
      .prepare(
        `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, task_desc, priority,
           estimated_time, vars_json, source_task_id, blocked_reason, main_session, breaking,
           coverage, complexity, surface_key, surface_type, feature_id, created_at, updated_at)
         VALUES ('tid-1', 'f1', '2.1', '标题', 'coding-feature', 'blocked', '描述', 'P1', '4h',
           '{"A":"1"}', 't-f1-1.0', 'lint 失败', 1, 0, 0.9, 'low', 'web', 'web', 'f-f1',
           '2026-10-06T08:00:00.000Z', '2026-10-06T09:00:00.000Z')`,
      )
      .run()
    const r = await q({ projectId: P(), taskRef: { slug: 'f1', localId: '2.1' } })
    expect(r.task).toEqual({
      taskId: 'tid-1',
      slug: 'f1',
      localId: '2.1',
      featureId: 'f-f1',
      title: '标题',
      taskType: 'coding-feature',
      taskStatus: 'blocked',
      taskDesc: '描述',
      priority: 'P1',
      estimatedTime: '4h',
      vars: { A: '1' },
      sourceTaskId: 't-f1-1.0',
      blockedReason: 'lint 失败',
      mainSession: true,
      breaking: false,
      coverage: 0.9,
      complexity: 'low',
      surfaceKey: 'web',
      surfaceType: 'web',
      createdAt: '2026-10-06T08:00:00.000Z',
      updatedAt: '2026-10-06T09:00:00.000Z',
    })
  })

  it('TaskRef 未命中 → ERR_TASK_NOT_FOUND（data 带 taskRef）', async () => {
    const q = svc()
    const err = await q({ projectId: P(), taskRef: { slug: 'ghost', localId: '9.9' } }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TaskNotFoundError)
    expect((err as TaskNotFoundError).code).toBe('ERR_TASK_NOT_FOUND')
    expect((err as TaskNotFoundError).data).toEqual({ projectId: P(), taskRef: { slug: 'ghost', localId: '9.9' } })
  })

  it('include 缺席 → 仅 task 节（四节门控——缺席不查询不呈现）', async () => {
    const q = svc()
    seedFeature(h!.db, { slug: 'f1', status: 'tasks' })
    seedTask(h!.db, 'f1', '1.1')
    seedRecord(h!.db, 't-f1-1.1', { verb: 'add' })
    const r = await q({ projectId: P(), taskRef: { slug: 'f1', localId: '1.1' } })
    expect(Object.keys(r)).toEqual(['task'])
  })
})

describe('AC5 queryTask include 四节', () => {
  it('prerequisites / waitingOnMe：出边（等待方视角）与入边（后继反查）双节', async () => {
    const q = svc()
    seedFeature(h!.db, { slug: 'f1', status: 'tasks' })
    seedTask(h!.db, 'f1', '1.1', { status: 'completed' })
    seedTask(h!.db, 'f1', '1.2', { status: 'pending' })
    seedTask(h!.db, 'f1', '2.1')
    seedEdge(h!.db, 't-f1-2.1', 't-f1-1.1')
    seedEdge(h!.db, 't-f1-2.1', 't-f1-1.2')
    seedEdge(h!.db, 't-f1-1.2', 't-f1-2.1') // 后继（等我的人）
    const r = await q({
      projectId: P(),
      taskRef: { slug: 'f1', localId: '2.1' },
      include: { prerequisites: true, waitingOnMe: true },
    })
    expect(r.prerequisites).toEqual([
      { slug: 'f1', localId: '1.1', taskStatus: 'completed' },
      { slug: 'f1', localId: '1.2', taskStatus: 'pending' },
    ])
    expect(r.waitingOnMe).toEqual([{ slug: 'f1', localId: '1.2', taskStatus: 'pending' }])
    expect(r.records).toBeUndefined()
  })

  it('records：append-only 时间线按 id 序 + files/gate JSON 解码', async () => {
    const q = svc()
    seedFeature(h!.db, { slug: 'f1', status: 'in-progress' })
    seedTask(h!.db, 'f1', '2.1', { status: 'in_progress' })
    seedRecord(h!.db, 't-f1-2.1', { verb: 'add' })
    seedRecord(h!.db, 't-f1-2.1', {
      verb: 'claim',
      from: 'pending',
      to: 'in_progress',
      digest: 'abc123def456',
      sessionId: 's-dispatch',
    })
    seedRecord(h!.db, 't-f1-2.1', {
      verb: 'submit',
      from: 'in_progress',
      to: 'blocked',
      reason: 'lint 失败',
      filesJson: '["src/a.ts","src/b.ts"]',
      gateJson: '{"compile":true,"fmt":true,"lint":false,"test":true,"coverage":0.82}',
      actor: 'plugin-tool',
      sessionId: 's-exec',
    })
    const r = await q({ projectId: P(), taskRef: { slug: 'f1', localId: '2.1' }, include: { records: true } })
    expect(r.records).toEqual([
      { verb: 'add', actor: 'plugin-tool', createdAt: '2026-01-01T00:00:00.000Z' },
      {
        verb: 'claim',
        fromStatus: 'pending',
        toStatus: 'in_progress',
        digest: 'abc123def456',
        actor: 'plugin-tool',
        sessionId: 's-dispatch',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        verb: 'submit',
        fromStatus: 'in_progress',
        toStatus: 'blocked',
        reason: 'lint 失败',
        files: ['src/a.ts', 'src/b.ts'],
        gate: { compile: true, fmt: true, lint: false, test: true, coverage: 0.82 },
        actor: 'plugin-tool',
        sessionId: 's-exec',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])
  })

  it('sessions：links ∪ records.session_id 双源分型（同会话双侧 = 两卡并存；record 侧去重）', async () => {
    const q = svc()
    seedFeature(h!.db, { slug: 'f1', status: 'tasks' })
    seedTask(h!.db, 'f1', '2.1')
    seedLink(h!.db, 't-f1-2.1', 's-dispatch')
    seedLink(h!.db, 't-f1-2.1', 's-dispatch-again')
    seedRecord(h!.db, 't-f1-2.1', { verb: 'submit', sessionId: 's-exec' })
    seedRecord(h!.db, 't-f1-2.1', { verb: 'transition', sessionId: 's-exec' }) // 同执行会话两行 → 一卡
    seedRecord(h!.db, 't-f1-2.1', { verb: 'submit', sessionId: 's-dispatch' }) // 派发会话兼执行 → 两卡并存
    const r = await q({ projectId: P(), taskRef: { slug: 'f1', localId: '2.1' }, include: { sessions: true } })
    expect(r.sessions).toEqual([
      { taskId: 't-f1-2.1', slug: 'f1', localId: '2.1', title: '任务 2.1', taskStatus: 'pending', sessionId: 's-dispatch', source: 'link' },
      { taskId: 't-f1-2.1', slug: 'f1', localId: '2.1', title: '任务 2.1', taskStatus: 'pending', sessionId: 's-dispatch-again', source: 'link' },
      { taskId: 't-f1-2.1', slug: 'f1', localId: '2.1', title: '任务 2.1', taskStatus: 'pending', sessionId: 's-exec', source: 'record' },
      { taskId: 't-f1-2.1', slug: 'f1', localId: '2.1', title: '任务 2.1', taskStatus: 'pending', sessionId: 's-dispatch', source: 'record' },
    ])
  })
})
