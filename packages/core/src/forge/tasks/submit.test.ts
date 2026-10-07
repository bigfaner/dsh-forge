// 任务 2.4 测试 —— submitTask 全路径（tech-design §Interface 1「动词内聚不变量」submitTask 行 +
// db-schema §4 动词矩阵 submitTask 行 + C4 blocked 走 fix 链 + C5 结构化负载 + 恢复钩子
// [C3/§6-5/§6-19：前置全满足才 auto-restore、边不删] + 交互一 executor 结算位）。
// 临时 SQLite 夹具（harness——db.test.ts 形制）。fix 链故事走真实 addTask/claimTask 动词链
// （派发链端到端骨架——SC-M2 门 5.4 承接完整 dogfood）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addTask } from './add.js'
import { claimTask } from './claim.js'
import {
  GateSummaryRequiredError,
  InvalidTransitionError,
  ReasonRequiredError,
  SummaryRequiredError,
  TestEvidenceRequiredError,
} from './errors.js'
import {
  createTasksHarness,
  seedEdge,
  seedFeature,
  seedProposal,
  seedTask,
  type TasksHarness,
} from './harness.js'
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
      projectId: P(), source: { kind: 'feature', slug: 'fix' }, title: '修 1.1', type: 'coding-fix',
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

// ───────── 2.6 双门（图 8 · SC7）：gate 摘要门 + AC 证据门 ─────────
// 链序：gate 门 → AC 门 → 转移 → 恢复钩子 → 相位重算；双门仅挂 success 结算——
// blocked submit 不经双门（C4 失败分诊走 fix 链；Go 先例 validateRecordData 非 completed 早退）。
describe('2.6 双门（图 8）：gate 任务数字摘要门 + AC 测试证据门', () => {
  /** 直写 ac_json 受控初值（真实写径 = addTask acceptanceCriteria——全链测试走真实动词链） */
  const withAc = (localId: string, ac: readonly string[]): void => {
    h!.db.prepare(`UPDATE tasks SET ac_json = ? WHERE local_id = ?`).run(JSON.stringify(ac), localId)
  }

  it('AC 证据门：ac_json 非空 ∧ gate 缺席 → ERR_TEST_EVIDENCE_REQUIRED——data + 错误信息逐行含 AC 清单（SC7 机械判据）+ 单事务零写入', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    const ac = ['[AC-1] 双门拒绝路径单测全绿', '[AC-2] 错误信息含 AC 清单']
    withAc('1.1', ac)
    const err = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.1' },
      result: 'success', summary: '完成', sessionId: 's-exec',
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TestEvidenceRequiredError)
    const e = err as TestEvidenceRequiredError
    expect(e.code).toBe('ERR_TEST_EVIDENCE_REQUIRED')
    // data = AC 清单原样带回（contracts TestEvidenceRequiredData 同形）
    expect(e.data).toEqual({ acceptanceCriteria: ac })
    // SC7 机械判据：错误信息人话 + 逐行含清单（Hard Rule 禁裸错误码）
    for (const line of ac) {
      expect(e.message).toContain(line)
    }
    // 单事务全成全败：状态不动 + 零记录
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'in_progress' }])
    expect(rows(`SELECT * FROM task_records`)).toEqual([])
  })

  it('AC 证据门：gate.test === false（compile/fmt/lint 全 true）→ 同拒；补 gate.test === true（coverage 缺省合法）→ 放行', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    withAc('1.1', ['测试通过'])
    const err = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.1' },
      result: 'success', summary: '完成',
      gate: { compile: true, fmt: true, lint: true, test: false },
      sessionId: 's',
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TestEvidenceRequiredError)
    const r = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.1' },
      result: 'success', summary: '完成',
      gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 's',
    })
    expect(r.status).toBe('completed')
  })

  it('无 AC 任务直通不校验：ac_json NULL 与空清单 [] 均放行（转移 + record 沿 M2）', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' }) // ac_json NULL
    seedTask(h!.db, 'f', '1.2', { status: 'in_progress' })
    withAc('1.2', []) // 空清单 = 无 AC 任务
    for (const localId of ['1.1', '1.2']) {
      const r = await submit({
        projectId: P(), taskRef: { slug: 'f', localId }, result: 'success', summary: '无 AC 直通', sessionId: 's',
      })
      expect(r.status).toBe('completed')
    }
    expect(rows(`SELECT gate_json FROM task_records WHERE verb = 'submit'`)).toEqual([
      { gate_json: null },
      { gate_json: null },
    ])
  })

  it('gate 摘要门：type=gate ∧ gate 缺席 → ERR_GATE_SUMMARY_REQUIRED——门序先于转移校验（pending 亦此拒）+ 零写入', async () => {
    seedFeature(h!.db, { slug: 'g', status: 'in-progress' })
    seedTask(h!.db, 'g', '2.gate', { status: 'in_progress', type: 'gate' })
    const err = await submit({
      projectId: P(), taskRef: { slug: 'g', localId: '2.gate' },
      result: 'success', summary: '全绿', sessionId: 's',
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GateSummaryRequiredError)
    expect((err as GateSummaryRequiredError).code).toBe('ERR_GATE_SUMMARY_REQUIRED')
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '2.gate'`)).toEqual([{ task_status: 'in_progress' }])
    expect(rows(`SELECT * FROM task_records`)).toEqual([])
    // 图 8 门序：gate 门先于转移校验——pending 态提交 = 本门拒绝而非 ERR_INVALID_TRANSITION
    seedTask(h!.db, 'g', '3.gate', { type: 'gate' }) // pending（未 claim）
    const errPending = await submit({
      projectId: P(), taskRef: { slug: 'g', localId: '3.gate' },
      result: 'success', summary: 'x', sessionId: 's',
    }).catch((e: unknown) => e)
    expect(errPending).toBeInstanceOf(GateSummaryRequiredError)
    expect(errPending).not.toBeInstanceOf(InvalidTransitionError)
  })

  it('门序（图 8 B→C）：双缺 → gate 摘要门先拒；gate 带而 test !== true → AC 证据门后拒', async () => {
    seedFeature(h!.db, { slug: 'g', status: 'in-progress' })
    seedTask(h!.db, 'g', '2.gate', { status: 'in_progress', type: 'gate' })
    withAc('2.gate', ['[AC-1] compile/fmt/lint/test 全绿'])
    const both = await submit({
      projectId: P(), taskRef: { slug: 'g', localId: '2.gate' },
      result: 'success', summary: '全绿', sessionId: 's',
    }).catch((e: unknown) => e)
    expect(both).toBeInstanceOf(GateSummaryRequiredError)
    const acOnly = await submit({
      projectId: P(), taskRef: { slug: 'g', localId: '2.gate' },
      result: 'success', summary: '全绿',
      gate: { compile: true, fmt: true, lint: true, test: false },
      sessionId: 's',
    }).catch((e: unknown) => e)
    expect(acOnly).toBeInstanceOf(TestEvidenceRequiredError)
  })

  it('gate 门通过：gate_json 承载 {compile,fmt,lint,test,coverage} 数字摘要落账 + 转移 completed', async () => {
    seedFeature(h!.db, { slug: 'g', status: 'in-progress' })
    seedTask(h!.db, 'g', '2.gate', { status: 'in_progress', type: 'gate' })
    await submit({
      projectId: P(), taskRef: { slug: 'g', localId: '2.gate' },
      result: 'success', summary: 'Phase 全绿',
      gate: { compile: true, fmt: true, lint: true, test: true, coverage: 0.82 },
      commitHash: 'deadbee', sessionId: 's-exec',
    })
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '2.gate'`)).toEqual([{ task_status: 'completed' }])
    expect(rows(`SELECT gate_json, commit_hash FROM task_records WHERE verb = 'submit'`)).toEqual([
      { gate_json: '{"compile":true,"fmt":true,"lint":true,"test":true,"coverage":0.82}', commit_hash: 'deadbee' },
    ])
  })

  it('blocked submit 不经双门（C4 失败分诊走 fix 链）：AC 任务 / gate 任务受阻均直通 blocked + reason 落账', async () => {
    seedFeature(h!.db, { slug: 'b', status: 'in-progress' })
    seedTask(h!.db, 'b', '1.1', { status: 'in_progress' })
    withAc('1.1', ['测试通过'])
    seedTask(h!.db, 'b', '2.gate', { status: 'in_progress', type: 'gate' })
    const r1 = await submit({
      projectId: P(), taskRef: { slug: 'b', localId: '1.1' },
      result: 'blocked', reason: '测试基座崩坏——fix 链承接', sessionId: 's',
    })
    expect(r1.status).toBe('blocked')
    const r2 = await submit({
      projectId: P(), taskRef: { slug: 'b', localId: '2.gate' },
      result: 'blocked', reason: '环境缺依赖', sessionId: 's',
    })
    expect(r2.status).toBe('blocked')
    expect(rows(`SELECT to_status, reason FROM task_records WHERE verb = 'submit'`)).toEqual([
      { to_status: 'blocked', reason: '测试基座崩坏——fix 链承接' },
      { to_status: 'blocked', reason: '环境缺依赖' },
    ])
  })

  it('AC 门与容器正交：proposal 容器（律四无相位域）任务同样拒——证据门是行级判据', async () => {
    seedProposal(h!.db, { slug: 'blitz-p', mode: 'blitz' })
    seedTask(h!.db, 'blitz-p', '1.1', { status: 'in_progress', kind: 'proposal', mode: 'blitz' })
    withAc('1.1', ['[AC-1] 突击直挂任务测试证据'])
    const err = await submit({
      projectId: P(), taskRef: { slug: 'blitz-p', localId: '1.1' },
      result: 'success', summary: '完成', sessionId: 's',
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TestEvidenceRequiredError)
  })

  it('图 8 全链（真实动词链）：addTask(AC) → claim → 无证据拒 → 补 gate.test → 转移+record → 恢复钩子 → 相位重算', async () => {
    seedFeature(h!.db, { slug: 'fl', status: 'in-progress' })
    // 后继 blocked（前置 = 本任务）——恢复钩子反查对象；先种保持相位不动点（blocked ∈ 活跃集
    // → in-progress），addTask 后增 pending 亦活跃——存储快照恒 ≡ 推导值
    seedTask(h!.db, 'fl', '2.1', { status: 'blocked' })
    const t = await add({
      projectId: P(), source: { kind: 'feature', slug: 'fl' }, title: '双门任务', type: 'coding-feature',
      acceptanceCriteria: ['[AC-1] 单测双门拒绝路径', '[AC-2] gate_json 数字摘要落账'],
    })
    expect(t).toMatchObject({ slug: 'fl', reused: false })
    seedEdge(h!.db, 't-fl-2.1', t.taskId)
    await claim({ projectId: P(), taskRef: { slug: 'fl', localId: t.localId }, sessionId: 's-dispatch' })
    // ① AC 门拒（错误信息/data 含清单）——状态原地 + 零 submit 记录
    const err = await submit({
      projectId: P(), taskRef: { slug: 'fl', localId: t.localId },
      result: 'success', summary: '完成', sessionId: 's-exec',
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TestEvidenceRequiredError)
    expect(rows(`SELECT task_status FROM tasks WHERE id = ?`, t.taskId)).toEqual([{ task_status: 'in_progress' }])
    expect(rows(`SELECT * FROM task_records WHERE verb = 'submit'`)).toEqual([])
    // ② 补证据结算：转移 + record（gate_json/commit_hash）+ 恢复钩子（后继 blocked 前置全满足 → auto-restore 边不删）
    const r = await submit({
      projectId: P(), taskRef: { slug: 'fl', localId: t.localId },
      result: 'success', summary: '双门落地',
      gate: { compile: true, fmt: true, lint: true, test: true, coverage: 0.9 },
      commitHash: 'beefcafe', sessionId: 's-exec',
    })
    expect(r).toEqual({ taskId: t.taskId, status: 'completed', restored: [{ slug: 'fl', localId: '2.1' }] })
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '2.1'`)).toEqual([{ task_status: 'pending' }])
    expect(rows(`SELECT task_id, prerequisite_id FROM task_edges WHERE prerequisite_id = ?`, t.taskId)).toEqual([
      { task_id: 't-fl-2.1', prerequisite_id: t.taskId },
    ])
    expect(rows(`SELECT gate_json, commit_hash FROM task_records WHERE task_id = ? AND verb = 'submit'`, t.taskId))
      .toEqual([
        { gate_json: '{"compile":true,"fmt":true,"lint":true,"test":true,"coverage":0.9}', commit_hash: 'beefcafe' },
      ])
    // ③ 相位重算（仅 feature 容器）：[本任务 completed, 2.1 pending] → tasks
    expect(
      h!.db.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE slug = 'fl'`).get(),
    ).toEqual({ feature_status: 'tasks' })
  })
})
