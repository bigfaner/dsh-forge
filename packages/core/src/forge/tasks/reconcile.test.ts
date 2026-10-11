// S3 测试 —— reconcileInterrupted 启动对账（run-tasks-host-command proposal.md SC3/R6 +
// implementation-blueprint §2/图 D）：三重收敛判据单测 pin（带标记 in_progress ∧ 登记表空 →
// interrupted）+ skill 路线隔离（无标记 in_progress 不被对账改态——幂等重入不受影响）+
// 幂等收敛 + 相位不动点 + 中断序。夹具 = tasks harness（claim.test 同型；seedRecord S3 增
// loopSourced 受控项种入标记行）。
import { afterEach, describe, expect, it } from 'vitest'
import { claimTask } from './claim.js'
import {
  createTasksHarness,
  seedFeature,
  seedProposal,
  seedRecord,
  seedTask,
  type TasksHarness,
} from './harness.js'
import { reconcileInterrupted } from './reconcile.js'

let h: TasksHarness | undefined
afterEach(() => {
  h?.dispose()
  h = undefined
})

function svc() {
  h ??= createTasksHarness()
  return {
    reconcile: (input: { registryEmpty: boolean }) =>
      reconcileInterrupted({ store: h!.store, events: h!.events }, { projectId: h!.projectId, ...input }),
    claim: (input: Parameters<typeof claimTask>[1]) => claimTask({ store: h!.store, events: h!.events }, input),
  }
}

const P = () => h!.projectId
const statusOf = (localId: string): string | undefined =>
  (
    h!.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE local_id = ?`).get(
      localId,
    ) as { task_status: string } | undefined
  )?.task_status

const recordsOf = (taskId: string): unknown[] =>
  h!.db
    .prepare(`SELECT verb, from_status, to_status, reason, actor FROM task_records WHERE task_id = ? ORDER BY id`)
    .all(taskId)

/** 直推 updated_at（中断序/受控初值——对账真化时刻的锚定面） */
function touch(localId: string, updatedAt: string): void {
  h!.db.prepare(`UPDATE tasks SET updated_at = ? WHERE local_id = ?`).run(updatedAt, localId)
}

describe('AC2 三重收敛判据：带标记 in_progress ∧ 登记表空 → interrupted', () => {
  it('命中：状态真化 + transition 记录（reason=进程重启·actor=core）+ 事件单发 + reconciled 自然键', async () => {
    const { reconcile } = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '2.1', { status: 'in_progress' })
    seedRecord(h!.db, 't-f-2.1', { verb: 'claim', loopSourced: true, sessionId: 's-owner' })

    const r = await reconcile({ registryEmpty: true })

    expect(r.reconciled).toEqual([{ slug: 'f', localId: '2.1' }])
    expect(statusOf('2.1')).toBe('interrupted')
    expect(recordsOf('t-f-2.1')).toEqual([
      { verb: 'claim', from_status: null, to_status: null, reason: null, actor: 'plugin-tool' },
      { verb: 'transition', from_status: 'in_progress', to_status: 'interrupted', reason: '进程重启', actor: 'core' },
    ])
    // 写动词闭包尾部单事件（四域同通道）
    expect(h!.events.emitted).toEqual([{ projectId: P() }])
  })

  it('判据③ 短路：登记表非空（活循环在场）→ 零写入零事件（在飞任务不被真化）', async () => {
    const { reconcile } = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '2.1', { status: 'in_progress' })
    seedRecord(h!.db, 't-f-2.1', { verb: 'claim', loopSourced: true })

    const r = await reconcile({ registryEmpty: false })

    expect(r.reconciled).toEqual([])
    expect(statusOf('2.1')).toBe('in_progress')
    expect(recordsOf('t-f-2.1')).toHaveLength(1) // 仅原 claim 行
    expect(h!.events.emitted).toEqual([])
  })

  it('幂等收敛：对账后重跑 = 空报告零新写入（interrupted 非 in_progress 不再命中）', async () => {
    const { reconcile } = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '2.1', { status: 'in_progress' })
    seedRecord(h!.db, 't-f-2.1', { verb: 'claim', loopSourced: true })

    await reconcile({ registryEmpty: true })
    const again = await reconcile({ registryEmpty: true })

    expect(again.reconciled).toEqual([])
    expect(recordsOf('t-f-2.1')).toHaveLength(2) // claim + 一次 transition
    expect(h!.events.emitted).toEqual([{ projectId: P() }]) // 第二次零命中不发射
  })

  it('最新 claim 行判定（append-only id 最大）：先循环领取（带标记）后 skill 重入（无标记）→ 不命中', async () => {
    const { reconcile } = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '2.1', { status: 'in_progress' })
    seedRecord(h!.db, 't-f-2.1', { verb: 'claim', loopSourced: true, sessionId: 's-owner' })
    seedRecord(h!.db, 't-f-2.1', { verb: 'claim', loopSourced: false, sessionId: 's-skill' })

    const r = await reconcile({ registryEmpty: true })

    expect(r.reconciled).toEqual([]) // 最新 claim 无标记 → 谓词不命中
    expect(statusOf('2.1')).toBe('in_progress')
  })
})

describe('AC3 skill 路线隔离：无标记 in_progress 不被对账改态（幂等重入不受影响）', () => {
  it('无标记 in_progress + 登记表空 → 原态保持；taskRef 显式重入照常 reclaimed', async () => {
    const { reconcile, claim } = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '2.1', { status: 'in_progress' })
    seedRecord(h!.db, 't-f-2.1', { verb: 'claim', loopSourced: false, sessionId: 's-skill' })

    const r = await reconcile({ registryEmpty: true })

    expect(r.reconciled).toEqual([])
    expect(statusOf('2.1')).toBe('in_progress') // 对账零触达
    // 幂等重入语义不变：skill 会话显式 taskRef 重领 → reclaimed=true（无状态转移）
    const re = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '2.1' }, sessionId: 's-skill' })
    expect(re.reclaimed).toBe(true)
    expect(statusOf('2.1')).toBe('in_progress')
  })

  it('混合池：带标记与无标记并存 → 仅带标记者真化（隔离逐行判定）', async () => {
    const { reconcile } = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '2.1', { status: 'in_progress' })
    seedTask(h!.db, 'f', '2.2', { status: 'in_progress' })
    seedRecord(h!.db, 't-f-2.1', { verb: 'claim', loopSourced: true })
    seedRecord(h!.db, 't-f-2.2', { verb: 'claim', loopSourced: false })

    const r = await reconcile({ registryEmpty: true })

    expect(r.reconciled).toEqual([{ slug: 'f', localId: '2.1' }])
    expect(statusOf('2.1')).toBe('interrupted')
    expect(statusOf('2.2')).toBe('in_progress') // skill 路线原样
  })

  it('非 in_progress 不命中：blocked/completed 带标记 claim 也不改态（判据① 收敛）', async () => {
    const { reconcile } = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '2.1', { status: 'blocked' })
    seedTask(h!.db, 'f', '2.2', { status: 'completed' })
    seedRecord(h!.db, 't-f-2.1', { verb: 'claim', loopSourced: true })
    seedRecord(h!.db, 't-f-2.2', { verb: 'claim', loopSourced: true })

    const r = await reconcile({ registryEmpty: true })

    expect(r.reconciled).toEqual([])
    expect(statusOf('2.1')).toBe('blocked')
    expect(statusOf('2.2')).toBe('completed')
  })
})

describe('AC4 恢复数据面：中断序 + 相位不动点 + 容器双轨', () => {
  it('中断序：多任务命中按 updated_at 升序返回（最早中断优先——循环逐个恢复取数序）', async () => {
    const { reconcile } = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '2.1', { status: 'in_progress' })
    seedTask(h!.db, 'f', '2.2', { status: 'in_progress' })
    seedTask(h!.db, 'f', '2.3', { status: 'in_progress' })
    touch('2.3', '2026-01-01T00:00:01.000Z') // 最早中断
    touch('2.1', '2026-01-01T00:00:03.000Z') // 最晚中断
    touch('2.2', '2026-01-01T00:00:02.000Z')
    for (const id of ['t-f-2.1', 't-f-2.2', 't-f-2.3']) {
      seedRecord(h!.db, id, { verb: 'claim', loopSourced: true })
    }

    const r = await reconcile({ registryEmpty: true })

    expect(r.reconciled).toEqual([
      { slug: 'f', localId: '2.3' },
      { slug: 'f', localId: '2.2' },
      { slug: 'f', localId: '2.1' },
    ])
  })

  it('相位不动点：feature in-progress 保持（interrupted ∈ 活跃判定集——真化不降相位）', async () => {
    const { reconcile } = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '2.1', { status: 'in_progress' })
    seedRecord(h!.db, 't-f-2.1', { verb: 'claim', loopSourced: true })

    await reconcile({ registryEmpty: true })

    expect(
      h!.db.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE slug = 'f'`).get(),
    ).toEqual({ feature_status: 'in-progress' })
  })

  it('proposal 容器任务照常真化（律四：无相位域跳过）', async () => {
    const { reconcile } = svc()
    seedProposal(h!.db, { slug: 'pz' })
    seedTask(h!.db, 'pz', '1', { status: 'in_progress', kind: 'proposal' })
    seedRecord(h!.db, 't-pz-1', { verb: 'claim', loopSourced: true })

    const r = await reconcile({ registryEmpty: true })

    expect(r.reconciled).toEqual([{ slug: 'pz', localId: '1' }])
    expect(statusOf('1')).toBe('interrupted')
  })
})
