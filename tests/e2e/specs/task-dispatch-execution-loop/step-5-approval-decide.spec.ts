// @feature dsh-forge-m3 | @web-e2e | @journey task-dispatch-execution-loop
// Traceability: docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/
// contracts/step-5-approval-decide.md — one test per Outcome:
//   approve-success     — stub 注入审批 → dock 可见(正文+来源)→ 显式批准 →
//                         回执行中 ≤5s + subagent 侧收据 allowed-once +
//                         库审计(approved/decided_by=workbench)。
//   reject              — 显式拒绝 → 回执行中 + 收据 rejected + 审计;呈现不
//                         误报完成态。
//   already-decided     — 同条目重复决策 → ERR_APPROVAL_DECIDED;首次决策
//                         (state/decided_at)不被改写。
//   channel-unavailable — 通道异常(真链路可达面 = launch 注错,SC3 注记口径)
//                         → 行 failed + 原因 + 重派发恢复,无半状态残留。
// fixture_spec: Project/Dispatch(running|awaiting)/ApprovalRequest(pending,
// session_id 非空)— served by harness.buildMainWorld + stub injections.

import { expect, test } from '@playwright/test'
import {
  REFLOW_BUDGET_MS,
  dispatchFromBoard,
  freshRoot,
  getDispatchRows,
  orchBadge,
  waitForOrchBadge,
  WorldManager,
  bridgeInvoke,
} from '../_lib/journey-world.ts'
import { buildMainWorld, TASK_1, TASK_2, TASK_3, TASK_5 } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('task-dispatch-execution-loop / step 5: 处理审批请求', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('disp-loop-s5'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  /** Dispatch one task and return its running row (the approval leg's subject). */
  async function dispatchOne(world: Awaited<ReturnType<WorldManager['acquire']>>, taskKey: string) {
    await dispatchFromBoard(world.page, [taskKey])
    await waitForOrchBadge(world.page, taskKey, 'running', 20_000)
    const row = (await getDispatchRows(world.page, world.projectId)).find(candidate => candidate.taskKey === taskKey)
    if (row === undefined) throw new Error(`dispatch row missing for ${taskKey}`)
    return row
  }

  // Outcome "approve-success" — 可见可操作 + 显式批准 + 双侧收据。
  test('step5/approve-success: injected approval visible (dock + body + source) → explicit approve → back to running ≤5s + allowed-once receipt + audit row', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    const row = await dispatchOne(world, TASK_1)

    // 注入审批(真桥核:inject → approval_receive → dock;正文 = 载荷 join)。
    stub.injectToolExec('disp-loop-call-1', { command: 'pnpm exec vitest run tests/disp-loop-1' })
    stub.injectApproval({ agentId: row.sessionId as string, toolName: 'Bash', callId: 'disp-loop-call-1', reason: 'disp-loop approval leg: run the targeted tests' })

    // 可见:角标 awaiting + 工具栏「审批 N」计数。
    const tAwait = Date.now()
    await waitForOrchBadge(page, TASK_1, 'awaiting', 20_000)
    const entry = page.locator('[data-dsh-forge-approval-entry]')
    await expect(entry, '审批入口在场').toBeVisible({ timeout: 10_000 })
    await expect(entry).toHaveAttribute('data-dsh-forge-approval-entry-count', '1', { timeout: 10_000 })
    expect(Date.now() - tAwait, `注入 → 看板可见 ≤${String(REFLOW_BUDGET_MS)}ms`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)

    // 可操作:dock 打开 + 条目(正文 + 来源任务)+ 显式批准。
    await entry.click()
    const dock = page.locator('[data-dsh-forge-approval-panel]')
    await expect(dock, '审批 dock 打开').toBeVisible({ timeout: 10_000 })
    const item = dock.locator(`[data-dsh-forge-approval-task="${TASK_1}"]`)
    await expect(item, '来源任务条目在场').toBeVisible({ timeout: 10_000 })
    await expect(item.locator('[data-dsh-forge-approval-body]'), '请求正文可见(载荷 join)')
      .toContainText('disp-loop approval leg: run the targeted tests')
    const approvalId = await item.getAttribute('data-dsh-forge-approval-item')

    const tApprove = Date.now()
    await item.locator(`[data-dsh-forge-approval-approve="${approvalId}"]`).click()
    await waitForOrchBadge(page, TASK_1, 'running', 20_000)
    expect(Date.now() - tApprove, `批准 → 回执行中 ≤${String(REFLOW_BUDGET_MS)}ms`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)

    // subagent 侧收据(决策送达)。
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const outcome = stub.readApprovals().find(candidate => candidate.agentId === row.sessionId && candidate.claimed === true)
      if (outcome !== undefined) {
        expect(outcome.outcome, '批准的决策送达(allowed-once)').toBe('allowed-once')
        break
      }
      await page.waitForTimeout(100)
      if (attempt === 99) throw new Error('approve outcome never reached the stub journal')
    }

    // 库审计:approval 行 pending → approved,decided_by = workbench。
    const approvals = await bridgeInvoke<Array<{ id: string; state: string; decidedBy: string | null; decidedAt: string | null }>>(page, 'listApprovals', [world.projectId])
    const mine = approvals.find(candidate => candidate.id === approvalId)
    expect(mine?.state, '审批行态 approved(审计)').toBe('approved')
    expect(mine?.decidedBy, '决策者审计 = workbench(人侧)').toBe('workbench')
    expect(mine?.decidedAt, '决策时间落档').not.toBeNull()
    await dock.locator('[data-dsh-forge-approval-close]').click()
  })

  // Outcome "reject" — 拒绝为可审计决策;呈现不误报完成。
  test('step5/reject: explicit reject → back to running + rejected receipt + audit; the task does NOT render completed', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    const row = await dispatchOne(world, TASK_2)
    stub.injectApproval({ agentId: row.sessionId as string, toolName: 'Bash', callId: 'disp-loop-call-2', reason: 'disp-loop reject leg: the reject verdict' })
    await waitForOrchBadge(page, TASK_2, 'awaiting', 20_000)

    const entry = page.locator('[data-dsh-forge-approval-entry]')
    await entry.click()
    const dock = page.locator('[data-dsh-forge-approval-panel]')
    await expect(dock).toBeVisible({ timeout: 10_000 })
    const item = dock.locator(`[data-dsh-forge-approval-task="${TASK_2}"]`)
    await expect(item).toBeVisible({ timeout: 10_000 })
    const approvalId = await item.getAttribute('data-dsh-forge-approval-item')
    await item.locator(`[data-dsh-forge-approval-reject="${approvalId}"]`).click()

    // 拒绝后的走向:回执行中(不误呈完成态;任务状态仍 pending)。
    await waitForOrchBadge(page, TASK_2, 'running', 20_000)
    await expect(orchBadge(page, TASK_2, 'completed')).toHaveCount(0)
    const board = await bridgeInvoke<{ tasks: Array<{ key: string; status: string }> }>(page, 'getTaskBoard', [world.projectId])
    expect(board.tasks.find(candidate => candidate.key === TASK_2)?.status, '任务状态未被拒绝隐式终局').toBe('pending')

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const outcome = stub.readApprovals().find(candidate => candidate.agentId === row.sessionId && candidate.claimed === true)
      if (outcome !== undefined) {
        expect(outcome.outcome, '拒绝的决策送达(rejected)').toBe('rejected')
        break
      }
      await page.waitForTimeout(100)
      if (attempt === 99) throw new Error('reject outcome never reached the stub journal')
    }
    const approvals = await bridgeInvoke<Array<{ id: string; state: string; decidedBy: string | null }>>(page, 'listApprovals', [world.projectId])
    expect(approvals.find(candidate => candidate.id === approvalId)?.state, '审批行态 rejected(审计)').toBe('rejected')
    await dock.locator('[data-dsh-forge-approval-close]').click()
  })

  // Outcome "already-decided" — 决策一次性:重复决策被拒,首次决策为终局审计。
  test('step5/already-decided: deciding an already-decided entry again → ERR_APPROVAL_DECIDED; the first decision is never rewritten', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    const row = await dispatchOne(world, TASK_3)
    stub.injectApproval({ agentId: row.sessionId as string, toolName: 'Bash', callId: 'disp-loop-call-3', reason: 'disp-loop already-decided leg' })
    await waitForOrchBadge(page, TASK_3, 'awaiting', 20_000)

    const entry = page.locator('[data-dsh-forge-approval-entry]')
    await entry.click()
    const dock = page.locator('[data-dsh-forge-approval-panel]')
    const item = dock.locator(`[data-dsh-forge-approval-task="${TASK_3}"]`)
    await expect(item).toBeVisible({ timeout: 10_000 })
    const approvalId = await item.getAttribute('data-dsh-forge-approval-item')
    await item.locator(`[data-dsh-forge-approval-approve="${approvalId}"]`).click()
    await waitForOrchBadge(page, TASK_3, 'running', 20_000)

    // 首次决策锚(审计终局)。
    const before = (await bridgeInvoke<Array<{ id: string; state: string; decidedBy: string | null; decidedAt: string | null }>>(page, 'listApprovals', [world.projectId]))
      .find(candidate => candidate.id === approvalId)
    expect(before?.state).toBe('approved')

    // 重复决策(事件回流前的迟到点击面)→ 明确拒绝。
    let rejected: string | undefined
    try {
      await bridgeInvoke(page, 'decideApproval', [{ approvalId, approve: true }, 'workbench'])
    } catch (error) {
      rejected = String((error as Error).message)
    }
    expect(rejected ?? '', '重复决策被拒(ERR_APPROVAL_DECIDED)').toContain('ERR_APPROVAL_DECIDED')

    // State:首次决策结果不被改写(decided_by/decided_at 原值)。
    const after = (await bridgeInvoke<Array<{ id: string; state: string; decidedBy: string | null; decidedAt: string | null }>>(page, 'listApprovals', [world.projectId]))
      .find(candidate => candidate.id === approvalId)
    expect(after?.state, '首次决策为终局').toBe('approved')
    expect(after?.decidedAt, 'decided_at 不被覆盖').toBe(before?.decidedAt)
    expect(after?.decidedBy, 'decided_by 不被覆盖').toBe(before?.decidedBy)
    await dock.locator('[data-dsh-forge-approval-close]').click()
  })

  // Outcome "channel-unavailable" — 通道异常呈现 + 恢复;无半状态(SC3 口径:
  // running→failed 的真链路可达面 = launch 注错;恢复 = 重派发)。
  test('step5/channel-unavailable: channel fault (launch injection) → failed row with reason + redispatch recovery, no residual half state', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    stub.writeControl({ create: 'fail', createError: 'disp-loop channel fault (host session channel unavailable)' })
    await dispatchFromBoard(page, [TASK_5]).catch(() => {})
    await waitForOrchBadge(page, TASK_5, 'failed', 30_000)
    const failedRow = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_5)
    expect(failedRow?.state, '通道异常 → 行 failed(不静默)').toBe('failed')
    expect(failedRow?.error, '失败原因留档(可辨非静默)').toContain('disp-loop channel fault')

    // 恢复引导:详情编排分区失败行 + 原因 + [重派发](二次确认)。
    await page.locator(`[data-dsh-forge-node-card="${TASK_5}"]`).click()
    const orch = page.locator(`[data-dsh-forge-task-detail="${TASK_5}"] [data-dsh-forge-orchestration-section]`)
    await expect(orch).toBeVisible({ timeout: 10_000 })
    await expect(orch.locator('[data-dsh-forge-orch-failed-line]'), '编排分区失败行在场').toBeVisible()
    await expect(orch.locator('[data-dsh-forge-orch-reason]'), '失败原因呈现').toContainText('disp-loop channel fault')

    stub.writeControl({})
    await orch.locator(`[data-dsh-forge-orch-redispatch="${failedRow?.id}"]`).click()
    const redispatchConfirm = page.locator('[data-dsh-forge-dialog="redispatch-confirm"]')
    await expect(redispatchConfirm, '重派发二次确认').toBeVisible({ timeout: 10_000 })
    await expect(redispatchConfirm.locator('[data-dsh-forge-redispatch-reason]'), '确认框回显失败原因').toContainText('disp-loop channel fault')
    await redispatchConfirm.locator('[data-dsh-forge-redispatch-go]').click()
    await expect(redispatchConfirm).toHaveCount(0, { timeout: 15_000 })
    await waitForOrchBadge(page, TASK_5, 'running', 30_000)

    // 无半状态残留:该任务恰两行(failed 审计 + running 新行)。
    const rows = (await getDispatchRows(page, world.projectId)).filter(candidate => candidate.taskKey === TASK_5)
    expect(rows, '恢复后无残留半状态(旧行审计 + 新行运行)').toHaveLength(2)
    expect(rows.some(candidate => candidate.state === 'failed'), '旧行保留审计').toBe(true)
    expect(rows.some(candidate => candidate.state === 'running'), '新行 running').toBe(true)
  })
})
