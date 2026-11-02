// unblockTask 测试（blocked-verdict-restore-primitive 1.3——blocked→pending 出口薄壳动词）。
// 覆盖：成功径（blocked→pending + 'unblock' 审计行含 reason + 相位重算 + 事件）、无因拒绝
// （ReasonRequiredError 同族）、非 blocked 矩阵硬门拒绝、pending 出口不触发后继恢复钩子
// （留档理由：pending ∉ 满足集 {completed, skipped}——恢复钩子只挂满足集终态，
// transition.ts runRestoreHook 判定集单源，blocked→pending 不满足即结构性不触发）。
// 临时 SQLite 夹具（harness——submit.test.ts 形制）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  InvalidTransitionError,
  ReasonRequiredError,
} from './errors.js'
import {
  createTasksHarness,
  seedEdge,
  seedFeature,
  seedRecord,
  seedTask,
  type TasksHarness,
} from './harness.js'
import { unblockTask } from './unblock.js'

let h: TasksHarness | undefined
beforeEach(() => {
  h ??= createTasksHarness()
})
afterEach(() => {
  h?.dispose()
  h = undefined
})

const deps = () => ({ store: h!.store, events: h!.events })
const unblock = (input: Parameters<typeof unblockTask>[1]) => unblockTask(deps(), input)

const P = () => h!.projectId
const rows = (sql: string, ...args: unknown[]): unknown[] =>
  h!.db.prepare(sql).all(...args) as unknown[]

describe('AC1 unblockTask 成功径：blocked→pending + unblock 审计行 + 相位重算 + 事件', () => {
  it('blocked 卡带 reason 解除：→pending + verb=unblock 审计行含 reason + 相位 in-progress→tasks + emitTasksChanged', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'blocked' })
    seedRecord(h!.db, 't-f-1.1', { verb: 'submit', from: 'in_progress', to: 'blocked', reason: '门禁失败走 fix 链' })

    const r = await unblock({
      projectId: P(),
      taskRef: { slug: 'f', localId: '1.1' },
      reason: '阻塞原因已消失：fix-N 已完成，回队列走正常 claim',
      sessionId: 's-main',
    })

    expect(r).toEqual({ taskId: 't-f-1.1', status: 'pending' })
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'pending' }])
    // 审计行：复用 submit 记录管道语义（单事务、reason 列承载裁决理由）——verb=unblock 区分结算
    expect(
      rows(`SELECT verb, from_status, to_status, reason, summary, gate_json, ac_json, actor, session_id
        FROM task_records WHERE task_id = 't-f-1.1' ORDER BY created_at`),
    ).toEqual([
      { verb: 'submit', from_status: 'in_progress', to_status: 'blocked', reason: '门禁失败走 fix 链', summary: null, gate_json: null, ac_json: null, actor: 'plugin-tool', session_id: null },
      { verb: 'unblock', from_status: 'blocked', to_status: 'pending', reason: '阻塞原因已消失：fix-N 已完成，回队列走正常 claim', summary: null, gate_json: null, ac_json: null, actor: 'plugin-tool', session_id: 's-main' },
    ])
    // 相位重算：blocked ∈ 活跃集（in-progress）→ pending 非活跃非终态（tasks）——快照诚实
    expect(
      h!.db.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE slug = 'f'`).get(),
    ).toEqual({ feature_status: 'tasks' })
    expect(h!.events.emitted).toEqual([{ projectId: P() }])
  })
})

describe('AC2 无因拒绝：reason 必带（ReasonRequiredError 同族）', () => {
  it('reason 缺席 / 空串 / 纯空白 → ERR_REASON_REQUIRED，零写入', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'blocked' })
    for (const reason of [undefined, '', '   ']) {
      const err = await unblock({
        projectId: P(),
        taskRef: { slug: 'f', localId: '1.1' },
        reason,
      }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ReasonRequiredError)
      expect((err as ReasonRequiredError).code).toBe('ERR_REASON_REQUIRED')
      expect((err as ReasonRequiredError).data.verb).toBe('unblockTask')
    }
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'blocked' }])
    expect(rows(`SELECT * FROM task_records WHERE verb = 'unblock'`)).toEqual([]) // 零写入
  })
})

describe('AC3 非 blocked 卡拒绝：agent 面矩阵硬门', () => {
  it('pending/in_progress/completed/skipped/rejected 卡调用 → ERR_INVALID_TRANSITION，零写入', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    for (const status of ['pending', 'in_progress', 'completed', 'skipped', 'rejected'] as const) {
      seedTask(h!.db, 'f', status, { status })
      const err = await unblock({
        projectId: P(),
        taskRef: { slug: 'f', localId: status },
        reason: '误用出口',
      }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(InvalidTransitionError)
      expect((err as InvalidTransitionError).code).toBe('ERR_INVALID_TRANSITION')
      expect((err as InvalidTransitionError).data.current).toBe(status)
    }
    expect(rows(`SELECT * FROM task_records WHERE verb = 'unblock'`)).toEqual([]) // 零写入
  })
})

describe('AC4 pending 出口不触发后继恢复钩子（留档：pending ∉ 满足集——结构性不触发）', () => {
  it('blocked 卡解除后，其 blocked 后继不恢复、无 auto-restore 记录（恢复钩子只挂 completed/skipped）', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'blocked' })
    seedTask(h!.db, 'f', '1.2', { status: 'blocked' })
    seedEdge(h!.db, 't-f-1.2', 't-f-1.1') // 1.2 等待 1.1

    const r = await unblock({
      projectId: P(),
      taskRef: { slug: 'f', localId: '1.1' },
      reason: '解除阻塞——后继待其自身前置满足或人工处置',
    })

    expect(r).toEqual({ taskId: 't-f-1.1', status: 'pending' })
    // 后继不动：1.1 → pending 非满足集终态，restoreBlockedWaiter 判定集不命中
    expect(rows(`SELECT local_id, task_status FROM tasks WHERE local_id IN ('1.1','1.2') ORDER BY local_id`)).toEqual([
      { local_id: '1.1', task_status: 'pending' },
      { local_id: '1.2', task_status: 'blocked' },
    ])
    expect(rows(`SELECT * FROM task_records WHERE verb = 'auto-restore'`)).toEqual([])
  })
})
