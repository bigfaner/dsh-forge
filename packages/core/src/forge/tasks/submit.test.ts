// 任务 2.4 测试 —— submitTask 全路径（tech-design §Interface 1「动词内聚不变量」submitTask 行 +
// db-schema §4 动词矩阵 submitTask 行 + C4 blocked 走 fix 链 + C5 结构化负载 + 恢复钩子
// [C3/§6-5/§6-19：前置全满足才 auto-restore、边不删] + 交互一 executor 结算位）。
// 临时 SQLite 夹具（harness——db.test.ts 形制）。fix 链故事走真实 addTask/claimTask 动词链
// （派发链端到端骨架——SC-M2 门 5.4 承接完整 dogfood）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addTask } from './add.js'
import { claimTask } from './claim.js'
import { InvalidTransitionError, ReasonRequiredError, SummaryRequiredError } from './errors.js'
import { createTasksHarness, seedEdge, seedFeature, seedTask, type TasksHarness } from './harness.js'
import { submitTask } from './submit.js'

let h: TasksHarness | undefined
beforeEach(() => {
  h ??= createTasksHarness() // 种行先行于动词调用——夹具前置建（claim.test 的 svc() 惰性建同义）
})
afterEach(() => {
  h?.dispose()
  h = undefined
})

const deps = () => ({ store: h!.store, events: h!.events })
const claim = (input: Parameters<typeof claimTask>[1]) => claimTask(deps(), input)
const add = (input: Parameters<typeof addTask>[1]) => addTask(deps(), input)
const submit = (input: Parameters<typeof submitTask>[1]) => submitTask(deps(), input)

const P = () => h!.projectId
const rows = (sql: string, ...args: unknown[]): unknown[] =>
  h!.db.prepare(sql).all(...args) as unknown[]

describe('AC4 submitTask success：转移 + record files/gate/commit + 相位重算 + 事件', () => {
  it('全载荷结算：in_progress → completed + 结构化 record + 执行会话 + restored=[] + 相位 → completed', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    const r = await submit({
      projectId: P(),
      taskRef: { slug: 'f', localId: '1.1' },
      result: 'success',
      summary: '完成：动词落地 + 单测全路径',
      files: ['packages/core/src/forge/tasks/submit.ts', 'packages/core/src/forge/tasks/submit.test.ts'],
      gate: { compile: true, fmt: true, lint: true, test: true, coverage: 0.86 },
      commitHash: 'abc1234',
      sessionId: 's-exec',
    })
    expect(r).toEqual({ taskId: 't-f-1.1', status: 'completed', restored: [] })
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'completed' }])
    // submit 记录：结构化负载（files/gate JSON + commit + summary + 执行会话——与 claim 派发会话相异可判）
    expect(
      rows(`SELECT verb, from_status, to_status, reason, summary, files_json, gate_json, commit_hash,
        dispatch_digest, actor, session_id FROM task_records WHERE task_id = 't-f-1.1'`),
    ).toEqual([
      {
        verb: 'submit',
        from_status: 'in_progress',
        to_status: 'completed',
        reason: null,
        summary: '完成：动词落地 + 单测全路径',
        files_json: '["packages/core/src/forge/tasks/submit.ts","packages/core/src/forge/tasks/submit.test.ts"]',
        gate_json: '{"compile":true,"fmt":true,"lint":true,"test":true,"coverage":0.86}',
        commit_hash: 'abc1234',
        dispatch_digest: null,
        actor: 'plugin-tool',
        session_id: 's-exec',
      },
    ])
    // 相位重算：全任务终态 → completed
    expect(
      h!.db.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE slug = 'f'`).get(),
    ).toEqual({ feature_status: 'completed' })
    expect(h!.events.emitted).toEqual([{ projectId: P() }])
  })

  it('success 空摘要 / 纯空白摘要 → ERR_SUMMARY_REQUIRED（400，先于转移校验）', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    for (const summary of [undefined, '', '   ']) {
      const err = await submit({
        projectId: P(),
        taskRef: { slug: 'f', localId: '1.1' },
        result: 'success',
        summary,
        sessionId: 's',
      }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(SummaryRequiredError)
      expect((err as SummaryRequiredError).code).toBe('ERR_SUMMARY_REQUIRED')
    }
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'in_progress' }])
    expect(rows(`SELECT * FROM task_records`)).toEqual([]) // 零写入
  })

  it('blocked：in_progress → blocked + reason 落 record + 相位保持 in-progress + restored=[]', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    const r = await submit({
      projectId: P(),
      taskRef: { slug: 'f', localId: '1.1' },
      result: 'blocked',
      reason: 'Complex failure: vitest 全量超时（3 次重试）——fix 链承接',
      sessionId: 's-exec',
    })
    expect(r).toEqual({ taskId: 't-f-1.1', status: 'blocked', restored: [] })
    expect(
      rows(`SELECT task_status, blocked_reason FROM tasks WHERE local_id = '1.1'`),
    ).toEqual([{ task_status: 'blocked', blocked_reason: null }])
    expect(
      rows(`SELECT verb, from_status, to_status, reason, summary, files_json, gate_json FROM task_records`),
    ).toEqual([
      {
        verb: 'submit',
        from_status: 'in_progress',
        to_status: 'blocked',
        reason: 'Complex failure: vitest 全量超时（3 次重试）——fix 链承接',
        summary: null,
        files_json: null,
        gate_json: null,
      },
    ])
    expect(
      h!.db.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE slug = 'f'`).get(),
    ).toEqual({ feature_status: 'in-progress' }) // blocked ∈ 活跃集
    expect(h!.events.emitted).toEqual([{ projectId: P() }])
  })

  it('blocked 空因 / 纯空白因 → ERR_REASON_REQUIRED（fix 链承接前置）', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    for (const reason of [undefined, '', '\t ']) {
      const err = await submit({
        projectId: P(),
        taskRef: { slug: 'f', localId: '1.1' },
        result: 'blocked',
        reason,
        sessionId: 's',
      }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ReasonRequiredError)
      expect((err as ReasonRequiredError).data).toEqual({ verb: 'submitTask' })
    }
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'in_progress' }])
  })

  it('files/gate/commit 缺省 → 记录列 NULL（files 回填归读面 git 查找）', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    await submit({
      projectId: P(),
      taskRef: { slug: 'f', localId: '1.1' },
      result: 'success',
      summary: '最小载荷',
      sessionId: 's',
    })
    expect(
      rows(`SELECT files_json, gate_json, commit_hash FROM task_records WHERE verb = 'submit'`),
    ).toEqual([{ files_json: null, gate_json: null, commit_hash: null }])
  })

  it('非 in_progress 提交 → ERR_INVALID_TRANSITION（agent 矩阵唯一 from；blocked→blocked 同拒）', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1') // pending
    seedTask(h!.db, 'f', '1.2', { status: 'blocked' })
    const errP = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, result: 'success', summary: 'x', sessionId: 's',
    }).catch((e: unknown) => e)
    expect(errP).toBeInstanceOf(InvalidTransitionError)
    const errB = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.2' }, result: 'blocked', reason: 'r', sessionId: 's',
    }).catch((e: unknown) => e)
    expect(errB).toBeInstanceOf(InvalidTransitionError)
    expect((errB as InvalidTransitionError).data).toMatchObject({ current: 'blocked', to: 'blocked', face: 'agent' })
    // completed 再提交（幂等面拒绝——审计链唯一结算）
    seedTask(h!.db, 'f', '1.3', { status: 'completed' })
    const errC = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.3' }, result: 'success', summary: 'x', sessionId: 's',
    }).catch((e: unknown) => e)
    expect(errC).toBeInstanceOf(InvalidTransitionError)
  })
})

describe('AC5 恢复钩子：反查 idx_edges_prerequisite + 前置全满足才 auto-restore + 边不删', () => {
  it('fix 链全流程（真实动词链）：submitTask blocked → addTask block-source → fix 完成 → 源自动恢复', async () => {
    seedFeature(h!.db, { slug: 'fix', status: 'in-progress' })
    seedTask(h!.db, 'fix', '1.1', { status: 'in_progress' })
    // ① executor 受阻 → blocked（fix 链承接）
    await submit({
      projectId: P(), taskRef: { slug: 'fix', localId: '1.1' },
      result: 'blocked', reason: '测试基座崩坏', sessionId: 's-exec',
    })
    // ② dispatcher 建 fix 任务（block-source：源置 blocked + fix-chain 边 + auto-block 记录）
    const fixTask = await add({
      projectId: P(), featureSlug: 'fix', title: '修 1.1', type: 'coding-fix',
      sourceTask: { slug: 'fix', localId: '1.1' }, blockSource: true,
    })
    expect(fixTask).toMatchObject({ localId: 'fix-1', reused: false })
    // ③ 领取 fix → 执行 → success
    await claim({ projectId: P(), taskRef: { slug: 'fix', localId: 'fix-1' }, sessionId: 's-fix-exec' })
    const r = await submit({
      projectId: P(), taskRef: { slug: 'fix', localId: 'fix-1' },
      result: 'success', summary: '修复完成', files: ['src/base.ts'], sessionId: 's-fix-exec',
    })
    // ④ 恢复钩子：源 1.1（blocked，前置 = fix-1 已完成，全满足）→ auto-restore blocked→pending
    expect(r.restored).toEqual([{ slug: 'fix', localId: '1.1' }])
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'pending' }])
    expect(
      rows(`SELECT verb, from_status, to_status, actor FROM task_records WHERE task_id = 't-fix-1.1' ORDER BY id`),
    ).toEqual([
      { verb: 'submit', from_status: 'in_progress', to_status: 'blocked', actor: 'plugin-tool' },
      { verb: 'auto-block', from_status: 'blocked', to_status: 'blocked', actor: 'core' },
      { verb: 'auto-restore', from_status: 'blocked', to_status: 'pending', actor: 'core' },
    ])
    // 边不删（满足 = 读时派生——§6-5）：fix-chain 边持存
    expect(
      rows(`SELECT task_id, prerequisite_id, origin FROM task_edges WHERE prerequisite_id = ?`, fixTask.taskId),
    ).toEqual([{ task_id: 't-fix-1.1', prerequisite_id: fixTask.taskId, origin: 'fix-chain' }])
    // 相位重算：[1.1 pending, fix-1 completed] → tasks
    expect(
      h!.db.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE slug = 'fix'`).get(),
    ).toEqual({ feature_status: 'tasks' })
  })

  it('后继 blocked 但另有前置未满足 → 不恢复（前置**全**满足判据）', async () => {
    seedFeature(h!.db, { slug: 'w', status: 'in-progress' })
    seedTask(h!.db, 'w', '1.1', { status: 'in_progress' }) // 将 success
    seedTask(h!.db, 'w', '1.2') // 另一前置：pending 未满足
    seedTask(h!.db, 'w', '2.1', { status: 'blocked' }) // 后继：blocked
    seedEdge(h!.db, 't-w-2.1', 't-w-1.1')
    seedEdge(h!.db, 't-w-2.1', 't-w-1.2')
    const r = await submit({
      projectId: P(), taskRef: { slug: 'w', localId: '1.1' },
      result: 'success', summary: 'ok', sessionId: 's',
    })
    expect(r.restored).toEqual([])
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '2.1'`)).toEqual([{ task_status: 'blocked' }])
    expect(rows(`SELECT verb FROM task_records WHERE verb = 'auto-restore'`)).toEqual([])
  })

  it('后继 rejected 前置 → 不恢复（rejected 不满足——死锁信号）；后继非 blocked（pending）→ 不动', async () => {
    seedFeature(h!.db, { slug: 'w', status: 'in-progress' })
    seedTask(h!.db, 'w', '1.1', { status: 'in_progress' })
    seedTask(h!.db, 'w', '1.2', { status: 'rejected' })
    seedTask(h!.db, 'w', '2.1', { status: 'blocked' }) // blocked 后继 × rejected 前置
    seedEdge(h!.db, 't-w-2.1', 't-w-1.1')
    seedEdge(h!.db, 't-w-2.1', 't-w-1.2')
    seedTask(h!.db, 'w', '2.2') // pending 后继（无需恢复）
    seedEdge(h!.db, 't-w-2.2', 't-w-1.1')
    const r = await submit({
      projectId: P(), taskRef: { slug: 'w', localId: '1.1' },
      result: 'success', summary: 'ok', sessionId: 's',
    })
    expect(r.restored).toEqual([])
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '2.1'`)).toEqual([{ task_status: 'blocked' }])
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '2.2'`)).toEqual([{ task_status: 'pending' }])
  })

  it('blocked submit 不挂恢复钩子（非满足集终态）', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    seedTask(h!.db, 'f', '2.1', { status: 'blocked' })
    seedEdge(h!.db, 't-f-2.1', 't-f-1.1')
    const r = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.1' },
      result: 'blocked', reason: '受阻', sessionId: 's',
    })
    expect(r.restored).toEqual([])
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '2.1'`)).toEqual([{ task_status: 'blocked' }])
    expect(rows(`SELECT verb FROM task_records WHERE verb = 'auto-restore'`)).toEqual([])
  })
})
