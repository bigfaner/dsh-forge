// 任务 2.4 测试 —— submitTask 全路径（tech-design §Interface 1「动词内聚不变量」submitTask 行 +
// db-schema §4 动词矩阵 submitTask 行 + C4 blocked 走 fix 链 + C5 结构化负载 + 恢复钩子
// [C3/§6-5/§6-19：前置全满足才 auto-restore、边不删] + 交互一 executor 结算位）。
// 临时 SQLite 夹具（harness——db.test.ts 形制）。fix 链故事走真实 addTask/claimTask 动词链
// （派发链端到端骨架——SC-M2 门 5.4 承接完整 dogfood）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addTask } from './add.js'
import { claimTask } from './claim.js'
import {
  AcCriteriaMismatchError,
  AcNotMetError,
  BlockClassificationRequiredError,
  FilesUnionMismatchError,
  GateSummaryRequiredError,
  InvalidTransitionError,
  ReasonRequiredError,
  RuntimeEvidenceConflictError,
  RuntimeEvidenceRequiredError,
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
import { createBugsService } from '../small-domains/bugs.js'
import { queryTask } from './query.js'
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
      blockClassification: { kind: 'new-problem' },
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
      projectId: P(), taskRef: { slug: 'f', localId: '1.2' }, result: 'blocked', reason: 'r',
      blockClassification: { kind: 'new-problem' }, sessionId: 's',
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

// ───────── blocked verdict restore（blocked-verdict-restore-primitive）：blocked 卡 success 直达结算 ─────────
// 转移矩阵已放行 blocked→completed（agent 面）；submit 层：blocked 卡 result=success 提交成功
// （summary 必带——无因结算拒绝），恢复钩子/相位重算照常挂；blocked→blocked 再阻塞仍拒。
describe('blocked verdict restore：blocked 卡 success 直达结算', () => {
  it('blocked 卡 result=success → completed 直达：submit 记录含 summary 与 from/to 审计 + 恢复钩子 + 相位重算', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'blocked' }) // 源卡 blocked（fix 已解决，主会话判完成）
    seedTask(h!.db, 'f', '2.1', { status: 'blocked' }) // 后继 blocked（前置 = 1.1）——恢复钩子对象
    seedEdge(h!.db, 't-f-2.1', 't-f-1.1')
    const r = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.1' },
      result: 'success', summary: '阻塞已解决：fix-1 修复落地，主会话裁决直达结算',
      gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 's-main',
    })
    expect(r).toEqual({ taskId: 't-f-1.1', status: 'completed', restored: [{ slug: 'f', localId: '2.1' }] })
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'completed' }])
    expect(
      rows(`SELECT verb, from_status, to_status, reason, summary, actor, session_id FROM task_records WHERE task_id = 't-f-1.1'`),
    ).toEqual([
      {
        verb: 'submit',
        from_status: 'blocked',
        to_status: 'completed',
        reason: null,
        summary: '阻塞已解决：fix-1 修复落地，主会话裁决直达结算',
        actor: 'plugin-tool',
        session_id: 's-main',
      },
    ])
    // 相位重算：[1.1 completed, 2.1 auto-restore → pending] → tasks
    expect(
      h!.db.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE slug = 'f'`).get(),
    ).toEqual({ feature_status: 'tasks' })
    expect(h!.events.emitted).toEqual([{ projectId: P() }])
  })

  it('blocked 卡 success 无 summary → ERR_SUMMARY_REQUIRED（无因结算拒绝，先于转移校验）+ 零写入', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'blocked' })
    for (const summary of [undefined, '', '  ']) {
      const err = await submit({
        projectId: P(), taskRef: { slug: 'f', localId: '1.1' },
        result: 'success', summary, sessionId: 's',
      }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(SummaryRequiredError)
      expect((err as SummaryRequiredError).code).toBe('ERR_SUMMARY_REQUIRED')
    }
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'blocked' }])
    expect(rows(`SELECT * FROM task_records`)).toEqual([]) // 零写入
  })

  it('既有径回归：in_progress success/blocked 语义不变；blocked→blocked 再阻塞仍拒（范围边界 pin）', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    const ok = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.1' },
      result: 'success', summary: '常规结算', sessionId: 's',
    })
    expect(ok.status).toBe('completed')
    seedTask(h!.db, 'f', '1.2', { status: 'in_progress' })
    // 直写种行后同步回置相位（存储快照 ≡ 推导值——相位守卫前置，直写不触发派生）
    h!.db.prepare(`UPDATE features SET feature_status = 'in-progress' WHERE slug = 'f'`).run()
    const blk = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.2' },
      result: 'blocked', reason: '受阻——fix 链承接',
      blockClassification: { kind: 'new-problem' }, sessionId: 's',
    })
    expect(blk.status).toBe('blocked')
    seedTask(h!.db, 'f', '1.3', { status: 'blocked' })
    const errBB = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.3' },
      result: 'blocked', reason: '再阻塞',
      blockClassification: { kind: 'new-problem' }, sessionId: 's',
    }).catch((e: unknown) => e)
    expect(errBB).toBeInstanceOf(InvalidTransitionError)
    expect((errBB as InvalidTransitionError).data).toMatchObject({ current: 'blocked', to: 'blocked', face: 'agent' })
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.3'`)).toEqual([{ task_status: 'blocked' }])
  })
})

describe('AC5 恢复钩子：反查 idx_edges_prerequisite + 前置全满足才 auto-restore + 边不删', () => {
  it('fix 链全流程（真实动词链）：submitTask blocked → addTask block-source → fix 完成 → 源自动恢复', async () => {
    seedFeature(h!.db, { slug: 'fix', status: 'in-progress' })
    seedTask(h!.db, 'fix', '1.1', { status: 'in_progress' })
    // ① executor 受阻 → blocked（fix 链承接）
    await submit({
      projectId: P(), taskRef: { slug: 'fix', localId: '1.1' },
      result: 'blocked', reason: '测试基座崩坏',
      blockClassification: { kind: 'new-problem' }, sessionId: 's-exec',
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
      result: 'blocked', reason: '受阻',
      blockClassification: { kind: 'new-problem' }, sessionId: 's',
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
      result: 'blocked', reason: '测试基座崩坏——fix 链承接',
      blockClassification: { kind: 'new-problem' }, sessionId: 's',
    })
    expect(r1.status).toBe('blocked')
    const r2 = await submit({
      projectId: P(), taskRef: { slug: 'b', localId: '2.gate' },
      result: 'blocked', reason: '环境缺依赖',
      blockClassification: { kind: 'new-problem' }, sessionId: 's',
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

// ───────── S3 结构化提交（worker-lean-execution·老 forge record.json 形制回归） ─────────
// 门序：AC 交叉校验 → AC 逐项闭环（met=false 拒）→ 既有 gate.test 证据门；均仅挂 success。
// 入库：task_records.ac_json + record_fields_json + files_json v2 {created, modified}。
describe('S3 结构化提交：AC 交叉校验 + 逐项闭环 + files 分组 + record_fields_json 入库', () => {
  const withAc = (localId: string, ac: readonly string[]): void => {
    h!.db.prepare(`UPDATE tasks SET ac_json = ? WHERE local_id = ?`).run(JSON.stringify(ac), localId)
  }

  it('结构化全载荷结算：ac_json/record_fields_json 落账 + files_json v2 {created,modified} 对象形', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    withAc('1.1', ['[AC-1] 结构化落账', '[AC-2] 读面归一'])
    const r = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.1' },
      result: 'success', summary: 'S3 数据侧落地',
      filesCreated: ['packages/core/src/forge/tasks/s3.ts'],
      filesModified: ['packages/core/src/forge/tasks/submit.ts', 'packages/core/src/forge/tasks/submit.test.ts'],
      acceptanceCriteria: [
        { criterion: '[AC-1] 结构化落账', met: true, evidence: 'submit.test S3 全载荷用例绿' },
        { criterion: '[AC-2] 读面归一', met: true, evidence: 'query.test 两形制夹具绿' },
      ],
      keyDecisions: ['files_json 对象形直写、读面归一', 'AC 门仅挂 success'],
      testsPassed: 12,
      testsFailed: 0,
      coverage: 0.91,
      notes: 'UI 面归姊妹提案',
      gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 's-exec',
    })
    expect(r.status).toBe('completed')
    const rec = rows(`SELECT summary, files_json, ac_json, record_fields_json, gate_json FROM task_records WHERE verb = 'submit'`)[0] as {
      summary: string; files_json: string; ac_json: string; record_fields_json: string; gate_json: string
    }
    expect(rec.summary).toBe('S3 数据侧落地')
    expect(JSON.parse(rec.files_json)).toEqual({
      created: ['packages/core/src/forge/tasks/s3.ts'],
      modified: ['packages/core/src/forge/tasks/submit.ts', 'packages/core/src/forge/tasks/submit.test.ts'],
    })
    expect(JSON.parse(rec.ac_json)).toEqual([
      { criterion: '[AC-1] 结构化落账', met: true, evidence: 'submit.test S3 全载荷用例绿' },
      { criterion: '[AC-2] 读面归一', met: true, evidence: 'query.test 两形制夹具绿' },
    ])
    expect(JSON.parse(rec.record_fields_json)).toEqual({
      keyDecisions: ['files_json 对象形直写、读面归一', 'AC 门仅挂 success'],
      testsPassed: 12,
      testsFailed: 0,
      coverage: 0.91,
      notes: 'UI 面归姊妹提案',
    })
  })

  it('AC 交叉校验：条数不符 / 顺序漂移 / 原文不同 → ERR_AC_CRITERIA_MISMATCH + 零写入', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    seedTask(h!.db, 'f', '1.2', { status: 'in_progress' })
    seedTask(h!.db, 'f', '1.3', { status: 'in_progress' })
    withAc('1.1', ['[AC-1] a', '[AC-2] b'])
    withAc('1.2', ['[AC-1] a', '[AC-2] b'])
    withAc('1.3', ['[AC-1] a', '[AC-2] b'])
    const base = { projectId: P(), result: 'success' as const, summary: 'x', sessionId: 's' }
    const count = await submit({ ...base, taskRef: { slug: 'f', localId: '1.1' }, acceptanceCriteria: [{ criterion: '[AC-1] a', met: true }] }).catch((e: unknown) => e)
    expect(count).toBeInstanceOf(AcCriteriaMismatchError)
    expect((count as AcCriteriaMismatchError).data).toEqual({
      expected: ['[AC-1] a', '[AC-2] b'],
      actual: ['[AC-1] a'],
    })
    const order = await submit({ ...base, taskRef: { slug: 'f', localId: '1.2' }, acceptanceCriteria: [{ criterion: '[AC-2] b', met: true }, { criterion: '[AC-1] a', met: true }] }).catch((e: unknown) => e)
    expect(order).toBeInstanceOf(AcCriteriaMismatchError)
    const text = await submit({ ...base, taskRef: { slug: 'f', localId: '1.3' }, acceptanceCriteria: [{ criterion: '[AC-1] a', met: true }, { criterion: '[AC-2] 漂移', met: true }] }).catch((e: unknown) => e)
    expect(text).toBeInstanceOf(AcCriteriaMismatchError)
    expect(rows(`SELECT task_status FROM tasks WHERE local_id LIKE '1._'`)).toEqual([
      { task_status: 'in_progress' }, { task_status: 'in_progress' }, { task_status: 'in_progress' },
    ])
    expect(rows(`SELECT * FROM task_records`)).toEqual([]) // 单事务全成全败——零写入
  })

  it('AC 逐项闭环门：success ∧ 任一 met=false → ERR_AC_NOT_MET（data 带未达清单）+ 零写入', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    withAc('1.1', ['[AC-1] 达成项', '[AC-2] 未达项'])
    const err = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.1' },
      result: 'success', summary: 'x',
      acceptanceCriteria: [
        { criterion: '[AC-1] 达成项', met: true, evidence: '用例绿' },
        { criterion: '[AC-2] 未达项', met: false, evidence: '单测红：3 failed' },
      ],
      gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 's',
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AcNotMetError)
    expect((err as AcNotMetError).code).toBe('ERR_AC_NOT_MET')
    expect((err as AcNotMetError).data).toEqual({ unmet: [{ criterion: '[AC-2] 未达项', evidence: '单测红：3 failed' }] })
    expect((err as AcNotMetError).message).toContain('[AC-2] 未达项')
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'in_progress' }])
    expect(rows(`SELECT * FROM task_records`)).toEqual([])
  })

  it('files 一致性：files ≠ created ∪ modified（缺项/顺序差异视为集不等）→ ERR_FILES_UNION_MISMATCH + 零写入', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    const err = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.1' },
      result: 'success', summary: 'x',
      files: ['a.ts'],
      filesCreated: ['a.ts'],
      filesModified: ['b.ts'],
      sessionId: 's',
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FilesUnionMismatchError)
    expect((err as FilesUnionMismatchError).code).toBe('ERR_FILES_UNION_MISMATCH')
    expect(rows(`SELECT * FROM task_records`)).toEqual([])
  })

  it('blocked submit 不经 S3 门（C4）：met=false / criterion 漂移 / files 失配均直通 blocked', async () => {
    seedFeature(h!.db, { slug: 'b', status: 'in-progress' })
    seedTask(h!.db, 'b', '1.1', { status: 'in_progress' })
    withAc('1.1', ['[AC-1] 定义判据'])
    const r = await submit({
      projectId: P(), taskRef: { slug: 'b', localId: '1.1' },
      result: 'blocked', reason: '受阻——fix 链承接',
      blockClassification: { kind: 'new-problem' },
      acceptanceCriteria: [{ criterion: '漂移判据', met: false }],
      filesCreated: ['x.ts'],
      filesModified: ['y.ts'],
      keyDecisions: ['先 blocked'],
      testsFailed: 3,
      sessionId: 's',
    })
    expect(r.status).toBe('blocked')
    const rec = rows(`SELECT ac_json, files_json, record_fields_json FROM task_records WHERE verb = 'submit'`)[0] as {
      ac_json: string; files_json: string; record_fields_json: string
    }
    // blocked 结构化载荷原样落账（沿「不服务内判红」注记——R13 兼容面）
    expect(JSON.parse(rec.ac_json)).toEqual([{ criterion: '漂移判据', met: false }])
    expect(JSON.parse(rec.files_json)).toEqual({ created: ['x.ts'], modified: ['y.ts'] })
    expect(JSON.parse(rec.record_fields_json)).toEqual({
      keyDecisions: ['先 blocked'], testsFailed: 3,
      blockClassification: { kind: 'new-problem' },
    })
  })

  it('record_fields_json 缺省 = 列 NULL（无结构化字段不落空对象）', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    await submit({ projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, result: 'success', summary: '最小', sessionId: 's' })
    expect(rows(`SELECT ac_json, record_fields_json FROM task_records WHERE verb = 'submit'`)).toEqual([
      { ac_json: null, record_fields_json: null },
    ])
  })
})

describe('改进7 e2e 取证债（实现态部分结算声明落账）', () => {
  it('success + evidenceDebt：结算为 completed（实现态）+ record_fields_json 携带欠账声明 + 读面投影', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    const r = await submit({
      projectId: P(),
      taskRef: { slug: 'f', localId: '1.1' },
      result: 'success',
      summary: '实现+单测绿；真机 e2e 断言欠账',
      gate: { compile: true, fmt: true, lint: true, test: true },
      evidenceDebt: { suite: 'e2e', specs: ['e2e/specs/race-window.spec.ts'], note: '竞速窗断言待真机取证' },
      sessionId: 's-exec',
    })
    expect(r.status).toBe('completed')
    const rec = rows(`SELECT record_fields_json FROM task_records WHERE verb = 'submit'`)[0] as {
      record_fields_json: string
    }
    expect(JSON.parse(rec.record_fields_json)).toEqual({
      evidenceDebt: { suite: 'e2e', specs: ['e2e/specs/race-window.spec.ts'], note: '竞速窗断言待真机取证' },
    })
    // 读面投影（TaskRecordEntry.evidenceDebt——settle 核欠账任务生成的数据源）
    const detail = await queryTask(deps(), {
      projectId: P(),
      taskRef: { slug: 'f', localId: '1.1' },
      include: { records: true },
    })
    expect(detail.records?.[0]?.evidenceDebt).toEqual({
      suite: 'e2e',
      specs: ['e2e/specs/race-window.spec.ts'],
      note: '竞速窗断言待真机取证',
    })
  })
})

describe('机械⑤ submitTask 强制域取证声明校验兜底（forge-verification-hardening）', () => {
  // base 用函数形——h 在 beforeEach 才就绪（模块顶层求值不可取 P()）
  const base = () => ({
    projectId: P(),
    taskRef: { slug: 'f', localId: '1.1' } as const,
    result: 'success' as const,
    summary: '交付完成',
    gate: { compile: true, fmt: true, lint: true, test: true },
    sessionId: 's-exec',
  })
  const seed = () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
  }

  it('强制域（声明运行期装配面 web-server）无取证证据 / 无 debt → ERR_RUNTIME_EVIDENCE_REQUIRED（零写入）', async () => {
    seed()
    const err = await submit({ ...base(), runtimeSurface: ['web-server'] }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RuntimeEvidenceRequiredError)
    expect((err as RuntimeEvidenceRequiredError).code).toBe('ERR_RUNTIME_EVIDENCE_REQUIRED')
    expect((err as RuntimeEvidenceRequiredError).data).toEqual({ faces: ['web-server'] })
    // 零写入：转移未发生、无结算记录
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'in_progress' }])
    expect(rows(`SELECT * FROM task_records`)).toEqual([])
  })

  it('清单外命中判据同样入强制域：声明 browser-extension → 拒（七类为示例非白名单）', async () => {
    seed()
    const err = await submit({ ...base(), runtimeSurface: ['browser-extension'] }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RuntimeEvidenceRequiredError)
  })

  it('SDK/库边界 + 多类交叉就高不就低：library 单独豁免；library+network 交叉 → 强制', async () => {
    seed()
    // 纯库（装配由消费方承担）→ 豁免域放行
    const ok = await submit({ ...base(), runtimeSurface: ['library'] })
    expect(ok.status).toBe('completed')
    // 库自带真实副作用（network）→ 就高入强制域，无证据即拒
    seedTask(h!.db, 'f', '1.2', { status: 'in_progress' })
    const err = await submit({
      ...base(),
      taskRef: { slug: 'f', localId: '1.2' },
      runtimeSurface: ['library', 'network'],
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RuntimeEvidenceRequiredError)
    expect((err as RuntimeEvidenceRequiredError).data).toEqual({ faces: ['library', 'network'] })
  })

  it('豁免域（无声明）不受影响：直通 success', async () => {
    seed()
    const r = await submit(base())
    expect(r.status).toBe('completed')
  })

  it('evidence_debt 声明债务路径放行：completed + record_fields 携带声明', async () => {
    seed()
    const r = await submit({
      ...base(),
      runtimeSurface: ['ui'],
      evidenceDebt: { suite: 'e2e', specs: ['e2e/specs/ui.spec.ts'], note: '真机走查待做' },
    })
    expect(r.status).toBe('completed')
    const rec = rows(`SELECT record_fields_json FROM task_records WHERE verb = 'submit'`)[0] as {
      record_fields_json: string
    }
    expect(JSON.parse(rec.record_fields_json).runtimeSurface).toEqual(['ui'])
    expect(JSON.parse(rec.record_fields_json).evidenceDebt.suite).toBe('e2e')
  })

  it('evidence 真机取证声明路径放行：completed + record_fields 携带 evidence 声明 + 读面投影', async () => {
    seed()
    const evidence = {
      face: 'web-server',
      artifacts: ['.forge/docs/proposals/x/walkthrough/server-e2e.png'],
      note: '真实服务端到端取证（AGENTS 1.4）',
    }
    const r = await submit({ ...base(), runtimeSurface: ['api', 'web-server'], runtimeEvidence: evidence })
    expect(r.status).toBe('completed')
    const rec = rows(`SELECT record_fields_json FROM task_records WHERE verb = 'submit'`)[0] as {
      record_fields_json: string
    }
    expect(JSON.parse(rec.record_fields_json).runtimeEvidence).toEqual(evidence)
    const detail = await queryTask(deps(), {
      projectId: P(),
      taskRef: { slug: 'f', localId: '1.1' },
      include: { records: true },
    })
    expect(detail.records?.[0]?.runtimeEvidence).toEqual(evidence)
    expect(detail.records?.[0]?.runtimeSurface).toEqual(['api', 'web-server'])
  })

  it('evidence 与 evidence_debt 二选一：并存 → ERR_RUNTIME_EVIDENCE_CONFLICT（口径歧义拒绝）', async () => {
    seed()
    const err = await submit({
      ...base(),
      runtimeSurface: ['ui'],
      runtimeEvidence: { face: 'ui', artifacts: ['a.png'] },
      evidenceDebt: { suite: 'e2e', specs: ['a.spec.ts'] },
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RuntimeEvidenceConflictError)
    expect((err as RuntimeEvidenceConflictError).code).toBe('ERR_RUNTIME_EVIDENCE_CONFLICT')
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'in_progress' }])
  })

  it('blocked submit 不经强制域门（C4）：声明装配面无证据直通 blocked', async () => {
    seed()
    const r = await submit({
      projectId: P(),
      taskRef: { slug: 'f', localId: '1.1' },
      result: 'blocked',
      reason: '真机取证环境不可用——显式环境缺口（提案 M1 三级顺序）',
      blockClassification: { kind: 'new-problem' },
      runtimeSurface: ['ui'],
      sessionId: 's',
    })
    expect(r.status).toBe('blocked')
  })
})

// ───────── loop-recurrence-hardening T2 归类闸门：presence 校验 + records 落库 + recurrence 交叉校验 ─────────
describe('T2 归类闸门（loop-recurrence-hardening）：blocked 归类 presence + 落库 + 交叉校验', () => {
  const seed = (localId = '1.1'): void => {
    if (h!.db.prepare(`SELECT id FROM features WHERE slug = 'f'`).get() === undefined) {
      seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    }
    seedTask(h!.db, 'f', localId, { status: 'in_progress' })
  }
  const blockedBase = (localId = '1.1') => ({
    projectId: P(),
    taskRef: { slug: 'f', localId } as const,
    result: 'blocked' as const,
    reason: '受阻——根因待排查',
    blockClassification: { kind: 'new-problem' } as const,
    sessionId: 's-exec',
  })

  it('缺归类字段 / kind 非法 → ERR_BLOCK_CLASSIFICATION_REQUIRED（错误码 + 指引文案在场）+ 单事务零写入', async () => {
    seed()
    for (const blockClassification of [undefined, { kind: '随便' } as unknown as { kind: 'new-problem' }]) {
      const err = await submit({ ...blockedBase(), blockClassification }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(BlockClassificationRequiredError)
      const e = err as BlockClassificationRequiredError
      expect(e.code).toBe('ERR_BLOCK_CLASSIFICATION_REQUIRED')
      // 指引文案：字段形状 + 两 kind + recurrenceOf 指引在场（Hard Rule 禁裸错误码）
      expect(e.message).toContain('blockClassification')
      expect(e.message).toContain("'new-problem'")
      expect(e.message).toContain("'same-family-recurrence'")
      expect(e.message).toContain('recurrenceOf')
    }
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'in_progress' }])
    expect(rows(`SELECT * FROM task_records`)).toEqual([])
  })

  it('归类=同族复发：records payload 结构化键落库（tasks 零列改动）+ 应答携 upgrade-hint 升级提示', async () => {
    seed()
    const r = await submit({
      ...blockedBase(),
      blockClassification: { kind: 'same-family-recurrence', recurrenceOf: 'bug-前驱-id' },
    })
    expect(r.status).toBe('blocked')
    expect(r.restored).toEqual([])
    expect(r.recurrenceAdvisories).toEqual([
      {
        kind: 'upgrade-hint',
        message: expect.stringContaining('同族复发'),
      },
    ])
    expect(JSON.stringify(r.recurrenceAdvisories)).toContain('bug-前驱-id')
    const rec = rows(`SELECT record_fields_json FROM task_records WHERE verb = 'submit'`)[0] as {
      record_fields_json: string
    }
    expect(JSON.parse(rec.record_fields_json)).toEqual({
      blockClassification: { kind: 'same-family-recurrence', recurrenceOf: 'bug-前驱-id' },
    })
    // tasks 表零列改动：无新增列承载（归类只在 record_fields_json）
    const cols = h!.db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[]
    expect(cols.some((c) => c.name.includes('classification'))).toBe(false)
  })

  it('归类=新问题 ∧ scope 命中 recurrence 候选 → 应答携 suspected-family「疑似同族」警示（列表式八字段 + status 标注，不硬拒，status=blocked）', async () => {
    seed()
    const candidates = [
      {
        bugId: 'b-root', summary: '写径拒写', chain: ['b-root', 'b-mid', 'b-leaf'],
        status: 'fixed', errorType: 'db-guard', containerSlug: 'f',
        suspectedLocation: 'packages/core/src/forge/tasks/submit.ts:78',
        lastSeenAt: '2026-11-01T00:00:00.000Z', recurrenceOf: undefined,
      },
    ]
    const depsWithFace = {
      store: h!.store,
      events: h!.events,
      findRecurrenceCandidates: () => candidates,
    }
    const r = await submitTask(depsWithFace, {
      ...blockedBase(),
      files: ['packages/core/src/forge/tasks/submit.ts'],
    })
    expect(r.status).toBe('blocked') // 警示不硬拒
    expect(r.recurrenceAdvisories).toHaveLength(1)
    const advisory = r.recurrenceAdvisories![0]!
    expect(advisory.kind).toBe('suspected-family')
    expect(advisory.candidates).toEqual(candidates)
    // 列表式八字段（渐进式披露——与 T3 拒绝载荷/triage signals 同形呈现口径）
    expect(advisory.message).toContain('疑似同族')
    expect(advisory.message).toContain('全史含 fixed')
    const line = advisory.message.split('\n').find((l) => l.startsWith('- ')) ?? ''
    expect(line).toContain('b-root [fixed] 写径拒写')
    expect(line).toContain('errorType=db-guard')
    expect(line).toContain('container=f')
    expect(line).toContain('suspected=packages/core/src/forge/tasks/submit.ts:78')
    expect(line).toContain('lastSeen=2026-11-01T00:00:00.000Z')
    expect(line).toContain('recurrenceOf=链根')
    expect(advisory.message).toContain('getBug')
  })

  it('候选 >5 条：top-5 限幅（lastSeenAt 降序）+ 其余按 errorType 计数（控呈现不控召回）', async () => {
    seed()
    const candidates = [8, 7, 6, 5, 4, 3, 2, 1, 0].map((i) => ({
      bugId: `b-${i}`, summary: `候选 ${i}`, chain: ['b-root', `b-${i}`],
      status: i % 2 === 0 ? 'open' : 'fixed', errorType: i % 3 === 0 ? 'type-a' : 'type-b',
      containerSlug: 'f', suspectedLocation: `src/f${i}.ts:${i}`,
      lastSeenAt: `2026-11-0${i + 1}T00:00:00.000Z`, recurrenceOf: 'b-root',
    }))
    const r = await submitTask({ store: h!.store, events: h!.events, findRecurrenceCandidates: () => candidates }, {
      ...blockedBase(),
      files: ['packages/core/src/forge/tasks/submit.ts'],
    })
    const message = r.recurrenceAdvisories![0]!.message
    const entryLines = message.split('\n').filter((l) => l.startsWith('- '))
    expect(entryLines).toHaveLength(5)
    expect(entryLines[0]).toContain('b-8') // lastSeenAt 降序首条
    const overflow = message.split('\n').find((l) => l.includes('其余 4 条'))
    expect(overflow).toBeDefined()
    expect(overflow).toContain('type-a×')
    expect(overflow).toContain('type-b×')
    expect(overflow).toContain('getBug')
  })

  it('TasksVerbDeps face 缺席 → 交叉校验降级跳过不阻载（新问题无警示照常 blocked）', async () => {
    seed()
    const r = await submit(blockedBase())
    expect(r.status).toBe('blocked')
    expect(r.recurrenceAdvisories).toBeUndefined()
  })

  it('face 实现抛错 → fail-soft 降级跳过（结算态不受影响）', async () => {
    seed()
    const depsWithBrokenFace = {
      store: h!.store,
      events: h!.events,
      findRecurrenceCandidates: () => {
        throw new Error('台账检索面故障')
      },
    }
    const r = await submitTask(depsWithBrokenFace, blockedBase())
    expect(r.status).toBe('blocked')
    expect(r.recurrenceAdvisories).toBeUndefined()
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'blocked' }])
  })

  it('face 在场而零候选 → 新问题无警示；success 结算不经归类门（blocked verdict restore 直达不受影响）', async () => {
    seed()
    const depsEmptyFace = {
      store: h!.store,
      events: h!.events,
      findRecurrenceCandidates: () => [],
    }
    const r = await submitTask(depsEmptyFace, blockedBase())
    expect(r.recurrenceAdvisories).toBeUndefined()
    // success 直达：无归类字段要求
    seed('1.2')
    h!.db.prepare(`UPDATE tasks SET task_status = 'blocked' WHERE local_id = '1.2'`).run()
    const ok = await submit({
      projectId: P(), taskRef: { slug: 'f', localId: '1.2' },
      result: 'success', summary: '阻塞已解决', sessionId: 's-main',
    })
    expect(ok.status).toBe('completed')
    expect(ok.recurrenceAdvisories).toBeUndefined()
  })
})

// ───────── bug 0db72bcb 生产装配径接线：face = bugs 域服务只读聚合（非手写桩）+ 降级 diag 留痕 ─────────
describe('T2 生产装配径（bug 0db72bcb）：findRecurrenceCandidates = createBugsService 只读聚合 + 降级 diag 留痕', () => {
  const seed = (localId = '1.1'): void => {
    if (h!.db.prepare(`SELECT id FROM features WHERE slug = 'f'`).get() === undefined) {
      seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    }
    seedTask(h!.db, 'f', localId, { status: 'in_progress' })
  }
  const blockedBase = (localId = '1.1') => ({
    projectId: P(),
    taskRef: { slug: 'f', localId } as const,
    result: 'blocked' as const,
    reason: '受阻——根因待排查',
    blockClassification: { kind: 'new-problem' } as const,
    sessionId: 's-exec',
  })
  /** 受控 execFile 桩（bugs.test.ts 同形——git config 身份解析径受控） */
  const gitExec = (): unknown => (_cmd: string, args: string[], _opts: unknown, cb: (e: unknown, out: string) => void) => {
    cb(null, args.join(' ') === 'config user.name' ? 'faner' : '')
  }

  /** 生产装配同构接线（core/src/index.ts 同径：bugs 域服务聚合 + 闭包注入消 import 边） */
  function productionFace() {
    const bugs = createBugsService({
      store: h!.store,
      events: h!.events,
      resolveWsPath: () => h!.projectId,
      execFile: gitExec() as never,
    })
    return {
      bugs,
      findRecurrenceCandidates: (projectId: string, scope: { readonly slug: string; readonly localId: string; readonly files: readonly string[] }) =>
        bugs.findRecurrenceCandidates(projectId, scope),
    }
  }

  async function seedChain(): Promise<void> {
    seed()
    const bugs = createBugsService({
      store: h!.store,
      events: h!.events,
      resolveWsPath: () => h!.projectId,
      execFile: gitExec() as never,
    })
    const root = (await bugs.registerBug({
      projectId: P(),
      summary: '写径拒写根',
      bugDesc: 'd', triggerDesc: 't', expected: 'e', actual: 'a',
      suspected: 'packages/core/src/forge/tasks/submit.ts:78',
    })).card
    await bugs.registerBug({
      projectId: P(),
      summary: '写径复发一',
      bugDesc: 'd', triggerDesc: 't', expected: 'e', actual: 'a',
      suspected: 'packages/core/src/forge/tasks/submit.ts:96',
      recurrenceOf: root.bugId,
    })
    // recurrence-signal-tiering：链须落本任务容器（container_slug 列比较）才产候选——
    // 测试链经源任务行（t-f-1.1，slug=f）反查挂容器归属
    h!.db.prepare(`UPDATE bugs SET source_task_id = 't-f-1.1', container_slug = 'f' WHERE source_task_id IS NULL`).run()
  }

  it('face 经 bugs 域服务聚合：新问题 ∧ scope 命中链上 suspected → suspected-family 警示（链结构 = 域层口径）', async () => {
    await seedChain()
    const { findRecurrenceCandidates } = productionFace()
    const r = await submitTask({ store: h!.store, events: h!.events, findRecurrenceCandidates }, {
      ...blockedBase(),
      files: ['packages/core/src/forge/tasks/submit.ts'],
    })
    expect(r.status).toBe('blocked') // 警示不硬拒
    expect(r.recurrenceAdvisories).toHaveLength(1)
    const advisory = r.recurrenceAdvisories![0]!
    expect(advisory.kind).toBe('suspected-family')
    expect(advisory.candidates).toHaveLength(2) // 链两员均候选
    expect(advisory.candidates![0]!.chain).toHaveLength(2) // root → 复发一
  })

  it('连坐消除对照（recurrence-signal-tiering 验收 3）：全 fixed 本缝链 → T2 suspected-family 警示在场（全史视野，status 标注 fixed）；T3 对同链不拦（无 open 分量——claim.test 钉住）', async () => {
    await seedChain()
    // 链两员全部终态 fixed——终态过滤已从 core face 管线移除（软动作全史视野）
    h!.db.prepare(`UPDATE bugs SET bug_status = 'fixed'`).run()
    const { findRecurrenceCandidates } = productionFace()
    const r = await submitTask({ store: h!.store, events: h!.events, findRecurrenceCandidates }, {
      ...blockedBase(),
      files: ['packages/core/src/forge/tasks/submit.ts'],
    })
    expect(r.status).toBe('blocked')
    expect(r.recurrenceAdvisories).toHaveLength(1) // T2 有信号（软动作不连坐）
    const advisory = r.recurrenceAdvisories![0]!
    expect(advisory.kind).toBe('suspected-family')
    expect(advisory.candidates).toHaveLength(2)
    expect(advisory.candidates!.every((c) => c.status === 'fixed')).toBe(true) // status 标注
    expect(advisory.message).toContain('[fixed]')
  })

  it('无关链（链成员 source_task_id 落其它容器）：经生产 face 归属过滤后零候选——新问题不再触发疑似同族警示（1.1 收窄口径，T2 随 T3 同 face 同批生效）', async () => {
    await seedChain()
    // 链整体移出无关任务容器（f → other）：模拟其它提案的历史链（source_task_id FK 指向真实任务行）
    seedFeature(h!.db, { slug: 'other', status: 'in-progress' })
    seedTask(h!.db, 'other', '9.9', { status: 'in_progress' })
    h!.db.prepare(`UPDATE bugs SET source_task_id = 't-other-9.9', container_slug = 'other' WHERE source_task_id IS NOT NULL`).run()
    const { findRecurrenceCandidates } = productionFace()
    const r = await submitTask({ store: h!.store, events: h!.events, findRecurrenceCandidates }, {
      ...blockedBase(),
      files: ['packages/core/src/forge/tasks/submit.ts'],
    })
    expect(r.status).toBe('blocked')
    expect(r.recurrenceAdvisories).toBeUndefined()
  })

  it('face 缺席 → 降级留痕 recurrence-face-absent（onDiag 类型化 emit，info 级）', async () => {
    seed()
    const diags: { level: string; event: string }[] = []
    const r = await submitTask({ store: h!.store, events: h!.events, onDiag: (p) => diags.push({ level: p.level, event: p.event }) }, blockedBase())
    expect(r.status).toBe('blocked')
    expect(diags).toContainEqual({ level: 'info', event: 'recurrence-face-absent' })
  })

  it('face 读故障 → 降级留痕 recurrence-face-error（warn 级）+ 结算态不受影响', async () => {
    seed()
    const diags: { level: string; event: string }[] = []
    const r = await submitTask({
      store: h!.store,
      events: h!.events,
      findRecurrenceCandidates: () => {
        throw new Error('台账读故障')
      },
      onDiag: (p) => diags.push({ level: p.level, event: p.event }),
    }, blockedBase())
    expect(r.status).toBe('blocked')
    expect(diags).toContainEqual({ level: 'warn', event: 'recurrence-face-error' })
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'blocked' }])
  })
})
