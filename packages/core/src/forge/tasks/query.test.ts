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
        `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, task_desc, ac_json, priority,
           estimated_time, vars_json, source_task_id, blocked_reason, breaking,
           coverage, complexity, surface_key, surface_type, source_kind, source_id, mode, created_at, updated_at)
         VALUES ('tid-1', 'f1', '2.1', '标题', 'coding-feature', 'blocked', '描述', '["通过全部测试"]', 'P1', '4h',
           '{"A":"1"}', 't-f1-1.0', 'lint 失败', 0, 0.9, 'low', 'web', 'web', 'feature', 'f-f1', 'expedition',
           '2026-10-06T08:00:00.000Z', '2026-10-06T09:00:00.000Z')`,
      )
      .run()
    const r = await q({ projectId: P(), taskRef: { slug: 'f1', localId: '2.1' } })
    expect(r.task).toEqual({
      taskId: 'tid-1',
      slug: 'f1',
      localId: '2.1',
      source: { kind: 'feature', slug: 'f1' },
      title: '标题',
      taskType: 'coding-feature',
      taskStatus: 'blocked',
      taskDesc: '描述',
      acceptanceCriteria: ['通过全部测试'], // M3（1.2）：ac_json 解码形——AC gate 数据面
      priority: 'P1',
      estimatedTime: '4h',
      vars: { A: '1' },
      sourceTaskId: 't-f1-1.0',
      blockedReason: 'lint 失败',
      mode: 'expedition', // M3（1.2）：mode 创建时快照（feature 容器恒远征）；main_session 砍除无此键
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

  it('include 缺席 → task + container 两节（四节门控——缺席不查询不呈现；container 恒水化）', async () => {
    const q = svc()
    seedFeature(h!.db, { slug: 'f1', status: 'tasks' })
    seedTask(h!.db, 'f1', '1.1')
    seedRecord(h!.db, 't-f1-1.1', { verb: 'add' })
    const r = await q({ projectId: P(), taskRef: { slug: 'f1', localId: '1.1' } })
    expect(Object.keys(r)).toEqual(['task', 'container'])
    expect(r.container).toEqual({ kind: 'feature', slug: 'f1', title: '特性 f1', mode: 'expedition', phase: 'tasks' })
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

// 5.4 dogfood 实证缺陷：DTO 可选字段「缺省 = 键缺席」而非「键在场值 undefined」——
// agent tool 输出面（dsh harness snapshotJsonValue）对显式 undefined 属性值判
// 「value is not lossless JSON」拒绝整个工具结果（claimTask 三连拒、派发链断头）。
// RPC/JSON 序列化面两形态等价（undefined 键自然丢弃），故历史单测（toEqual）未暴露。
describe('AC-lossless：可选字段缺席形态（agent tool 输出无损 JSON）', () => {
  /** 无损 JSON 语义自证：对象图零显式 undefined 属性值（dsh snapshotJsonValue 同口径） */
  const assertLossless = (v: unknown, what: string): void => {
    const undefKeys: string[] = []
    const walk = (x: unknown, path: string): void => {
      if (x === null || typeof x !== 'object') return
      for (const [k, val] of Object.entries(x)) {
        if (val === undefined) undefKeys.push(path + k)
        else if (val !== null && typeof val === 'object') walk(val, `${path}${k}.`)
      }
    }
    walk(v, '')
    expect(undefKeys, `${what} 携显式 undefined 值的键`).toEqual([])
  }

  it('NULL 可选列任务行 → 快照零显式 undefined（claimTask/queryTask 返回体）', async () => {
    const q = svc()
    seedFeature(h!.db, { slug: 'f1', status: 'tasks' })
    seedTask(h!.db, 'f1', '1.1') // task_desc/priority/estimated_time/vars/coverage/surface_* 全 NULL
    const r = await q({ projectId: P(), taskRef: { slug: 'f1', localId: '1.1' } })
    assertLossless(r.task, 'task snapshot')
  })

  it('NULL 负载 record 行 → 时间线项零显式 undefined（queryTask include_records）', async () => {
    const q = svc()
    seedFeature(h!.db, { slug: 'f1', status: 'tasks' })
    seedTask(h!.db, 'f1', '1.1')
    seedRecord(h!.db, 't-f1-1.1', { verb: 'add' }) // from/to/reason/summary/files/gate/commit/digest/session 全 NULL
    const r = await q({ projectId: P(), taskRef: { slug: 'f1', localId: '1.1' }, include: { records: true } })
    expect(r.records).toHaveLength(1)
    assertLossless(r.records, 'record entries')
  })
})
