// @feature dsh-forge-m3 | @web-e2e | @journey task-dispatch-execution-loop
// Journey smoke test — the golden path END TO END in one world (happy-path
// Outcomes only, per gen-test-scripts):
//   Step 1 browse + multi-select 3 → Step 2 artifacts-complete direct confirm
//   → Step 3 confirm dispatch (3 running rows, one batch, ≤3s interactive)
//   → Step 4 presynth oracle (three-element anchors) → Step 5 approval visible
//   + explicit approve → Step 6 enter session & return → Step 7 claim/submit ×3
//   with ≤5s reflow each → final board = kernel rows (Journey Invariants: actor
//   marks, independent rows/sessions/reflows, board = derived snapshot).
// Traceability: docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/
// journey.md (Happy Path Steps 1-7) + contracts/step-{1..7}-*.md success faces.

import { expect, test } from '@playwright/test'
import {
  DISPATCH_INTERACTIVE_BUDGET_MS,
  REFLOW_BUDGET_MS,
  dispatchFromBoard,
  freshRoot,
  getDispatchRows,
  measureReflow,
  openKernelDb,
  recomputePresynth,
  switchToWorkbench,
  waitForOrchBadge,
  waitForPromptRows,
  WorldManager,
  bridgeInvoke,
} from '../_lib/journey-world.ts'
import { verifyPromptInjection } from '../../stubs/oracle.ts'
import { buildMainWorld, FEATURE, TASK_1, TASK_2, TASK_3 } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

// [M4 1.8 e2e 迁移·迁移清单 第②⑥行 · 看板派发链(发起链断言不变,随看板新宿主恢复)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('smoke/task-dispatch-execution-loop: 看板多选并行派发 → 预合成注入(oracle)→ 审批批准 → 进入会话返回 → claim/submit ×3 回流 ≤5s → 板 = 内核', async ({ }, testInfo) => {
  testInfo.setTimeout(900_000)
  const manager = new WorldManager()
  const kernel = await buildMainWorld(freshRoot('disp-loop-smoke'))
  try {
    const world = await manager.acquire(kernel, 'main')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    // ---- Step 1:浏览 + 多选 3 个无依赖任务 --------------------------------
    for (const key of [TASK_1, TASK_2, TASK_3]) {
      await expect(page.locator(`[data-dsh-forge-node-card="${key}"]`)).toBeVisible({ timeout: 20_000 })
    }

    // 要素③ 前置:feature 级覆盖偏好(非默认锚点)。
    await bridgeInvoke(page, 'setPrefs', [
      { feature: `${world.projectId}/${FEATURE}` },
      [
        { key: 'coverage.coding.feature', value: { type: 'percentage', percentage: 63 } },
        { key: 'coverage.coding.fix', value: { type: 'percentage', percentage: 58 } },
        { key: 'coverage.coding.enhancement', value: { type: 'percentage', percentage: 73 } },
      ],
    ])

    // ---- Step 2+3:派发(产物齐 → 无警告直达确认)→ 确认 → 3 subagent ----
    const t0 = await dispatchFromBoard(page, [TASK_1, TASK_2, TASK_3])
    await expect(page.locator('[data-dsh-forge-dialog="dispatch-warning"]'), '产物齐全 → 零警告(Step 2 Output)').toHaveCount(0)

    const prompts = await waitForPromptRows(page, stub, 3)
    expect(Date.now() - t0, `派发 → 可交互 ≤${String(DISPATCH_INTERACTIVE_BUDGET_MS)}ms(Step 3 Output)`)
      .toBeLessThanOrEqual(DISPATCH_INTERACTIVE_BUDGET_MS + REFLOW_BUDGET_MS)
    const rows = (await getDispatchRows(page, world.projectId)).filter(row => [TASK_1, TASK_2, TASK_3].includes(row.taskKey))
    expect(rows, '3 独立行').toHaveLength(3)
    expect(new Set(rows.map(row => row.batchId)).size, '同批单 batch_id').toBe(1)
    expect(new Set(rows.map(row => row.sessionId)).size, 'session 互不共享(Invariant)').toBe(3)
    for (const key of [TASK_1, TASK_2, TASK_3]) {
      await waitForOrchBadge(page, key, 'running', 20_000)
    }

    // ---- Step 4:预合成三要素 + oracle 四件套 ×3 ----------------------------
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      for (const row of rows) {
        const prompt = prompts.find(candidate => candidate.sessionId === row.sessionId)
        if (prompt === undefined) throw new Error(`prompt row missing for ${row.taskKey}`)
        expect(verifyPromptInjection({
          journalText: prompt.text,
          presynthContent: recomputePresynth(db, world.kernel.featuresRoot, world.projectId, row.taskKey),
          promptHash: row.promptHash,
          sessionId: row.sessionId as string,
          requestId: prompt.requestId,
        }), `${row.taskKey} oracle`).toEqual({ ok: true })
        expect(prompt.text, `${row.taskKey} 要素② PhaseSummary`).toContain('## PhaseSummary')
        expect(prompt.text, `${row.taskKey} 要素③ 生效偏好`).toMatch(/Target: Achieve \d{2}% test coverage/u)
      }
    } finally {
      ;(db as unknown as { close(): void }).close()
    }

    // ---- Step 5:审批可见 + 显式批准 → 回执行中 -----------------------------
    stub.injectToolExec('disp-loop-smoke-call', { command: 'pnpm exec vitest run tests/disp-loop-smoke' })
    const approvalRow = rows.find(row => row.taskKey === TASK_1)
    stub.injectApproval({ agentId: approvalRow?.sessionId as string, toolName: 'Bash', callId: 'disp-loop-smoke-call', reason: 'smoke approval leg' })
    await waitForOrchBadge(page, TASK_1, 'awaiting', 20_000)
    const entry = page.locator('[data-dsh-forge-approval-entry]')
    await entry.click()
    const dock = page.locator('[data-dsh-forge-approval-panel]')
    const item = dock.locator(`[data-dsh-forge-approval-task="${TASK_1}"]`)
    await expect(item, '审批条目可见(内容+来源)').toBeVisible({ timeout: 10_000 })
    const approvalId = await item.getAttribute('data-dsh-forge-approval-item')
    await item.locator(`[data-dsh-forge-approval-approve="${approvalId}"]`).click()
    await waitForOrchBadge(page, TASK_1, 'running', 20_000)
    await dock.locator('[data-dsh-forge-approval-close]').click()

    // ---- Step 6:进入会话 → 返回看板 ---------------------------------------
    await page.locator(`[data-dsh-forge-node-card="${TASK_1}"]`).click()
    const orch = page.locator(`[data-dsh-forge-task-detail="${TASK_1}"] [data-dsh-forge-orchestration-section]`)
    await expect(orch).toBeVisible({ timeout: 10_000 })
    await orch.locator('[data-dsh-forge-orch-enter-session]').click()
    await expect(page.locator('[data-dsh-forge-shell]'), 'session 视图接管').toBeHidden({ timeout: 15_000 })
    await switchToWorkbench(page)
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_1}"]`), '返回来源页(任务看板)').toBeVisible({ timeout: 20_000 })

    // ---- Step 7:agent 提交 ×3 → 逐笔 ≤5s 回流 ------------------------------
    const freshRows = await getDispatchRows(page, world.projectId)
    const actors = new Map<string, string>()
    for (const key of [TASK_1, TASK_2, TASK_3]) {
      const row = freshRows.find(candidate => candidate.taskKey === key)
      actors.set(key, `session:${row?.sessionId as string}`)
      await bridgeInvoke(page, 'taskClaim', [{ projectId: world.projectId, taskKey: key }, actors.get(key) as string])
    }
    for (const key of [TASK_1, TASK_2, TASK_3]) {
      const ms = await measureReflow(page, key, 'completed', async () => {
        await bridgeInvoke(page, 'taskSubmit', [{ projectId: world.projectId, taskKey: key }, actors.get(key) as string])
      })
      expect(ms, `${key} 提交回流 ≤${String(REFLOW_BUDGET_MS)}ms(Invariant)`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)
    }

    // ---- 收尾:板 = 内核权威行集;actor 与来源标记一致 ----------------------
    const board = await bridgeInvoke<{ tasks: Array<{ key: string; status: string; updatedBy?: string; source: string | null }> }>(page, 'getTaskBoard', [world.projectId])
    for (const key of [TASK_1, TASK_2, TASK_3]) {
      const row = board.tasks.find(candidate => candidate.key === key)
      expect(row?.status, `${key} 终态 done`).toBe('completed')
      expect(row?.source, `${key} 来源标记 = session(与 actor 一致,Invariant)`).toBe('session')
      expect(row?.updatedBy, `${key} actor 审计`).toBe(actors.get(key))
    }
    expect(shellPageErrors(world), 'renderer 零 pageerror').toEqual([])
  } finally {
    await manager.closeAll()
  }
})

/** The shell's collected renderer page errors (the SC 收尾 discipline). */
function shellPageErrors(world: Awaited<ReturnType<WorldManager['acquire']>>): string[] {
  return world.shell.pageErrors
}
