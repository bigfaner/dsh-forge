// @feature dsh-forge-m3 | @web-e2e | @journey task-dispatch-execution-loop
// Traceability: docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/
// contracts/step-6-enter-session-return.md — Outcomes:
//   success — 编排条目「进入会话」→ 主窗口切至 session 视图(工作台壳退
//             场)→ 返回 → 回到任务看板(返回来源页);视图切换为会话期
//             内存态,内核零变更。
//   bridge-unavailable-degraded — DEFERRED(无注入缝):宿主桥缺席的降级
//             提示面在 6.2 基座无 fault seam(不可破坏插件半身而不连带整
//             面);gen-test-scripts 质量门禁止无条件 skip 的空测试,故不
//             生成占位测试 —— 该 Outcome 的覆盖留待缝位落地(见覆盖报告)。
// fixture_spec: Project/Dispatch(running, session_id 非空)— served by
// harness.buildMainWorld + the in-test dispatch.

import { expect, test } from '@playwright/test'
import { dispatchFromBoard, freshRoot, getDispatchRows, waitForOrchBadge, WorldManager, bridgeInvoke, switchToWorkbench, openBoardPane } from '../_lib/journey-world.ts'
import { buildMainWorld, TASK_1 } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('task-dispatch-execution-loop / step 6: 进入会话界面观察执行并返回', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('disp-loop-s6'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // [M4 1.8 e2e 迁移·迁移清单 第②⑥行 · 看板派发链(发起链断言不变,随看板新宿主恢复)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 2.10 复核:断言锚定已退役宿主方言(旧向导/换台 chrome/提案板与
// Feature 板详情/阶段资产面板内部件),右栏 pane 族未承接 —— 挂起终态与恢复前置 = regression-inventory.md 开放项。
  // 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。

  // Outcome "success" — 自哪来回哪去(session ↔ workbench/tasks)。
  test('step6/success: enter-session from the orchestration entry → the session view takes over (workbench shell leaves) → return lands back on the task board', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/tasks' })
    const { page } = world

    // 前置:一条 running 派发(session_id 已回填)。
    await dispatchFromBoard(page, [TASK_1])
    await waitForOrchBadge(page, TASK_1, 'running', 20_000)
    const row = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_1)
    expect(row?.sessionId, '行携带 session id(跳转目标)').not.toBeNull()

    // 内核零变更的观察基线。
    const boardBefore = await bridgeInvoke<{ tasks: Array<{ key: string; status: string }> }>(page, 'getTaskBoard', [world.projectId])

    // 进入会话:详情编排分区「进入会话」→ session 视图接管(工作台壳退场)。
    await page.locator(`[data-dsh-forge-node-card="${TASK_1}"]`).click()
    const orch = page.locator(`[data-dsh-forge-task-detail="${TASK_1}"] [data-dsh-forge-orchestration-section]`)
    await expect(orch).toBeVisible({ timeout: 10_000 })
    await orch.locator('[data-dsh-forge-orch-enter-session]').click()

    // 视图切换为会话期内存态:workbench 壳面板退场(隐藏或卸载)。
    const shellPanel = page.locator('[data-dsh-forge-shell]')
    await expect(shellPanel, 'session 视图接管(工作台壳退场)').toBeHidden({ timeout: 15_000 })

    // 返回:经侧栏工作台行回到任务看板(返回来源页)。2.10 新宿主:会话
    // 切换重置会话域右栏(#28-④)—— 返回 = 逃生门往返 + 同一用户路径重开
    // 看板(概览任务行 seam);数据面断言零删改。
    await switchToWorkbench(page)
    await openBoardPane(page)
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_1}"]`), '返回 → 任务看板(来源页)').toBeVisible({ timeout: 20_000 })

    // State:数据内核零变更(视图切换纯内存)。
    const boardAfter = await bridgeInvoke<{ tasks: Array<{ key: string; status: string }> }>(page, 'getTaskBoard', [world.projectId])
    expect(boardAfter.tasks.map(candidate => `${candidate.key}:${candidate.status}`).sort(),
      '进入会话往返零内核变更').toEqual(boardBefore.tasks.map(candidate => `${candidate.key}:${candidate.status}`).sort())
  })
})
