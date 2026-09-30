// @feature dsh-forge-m4 | @web-e2e | @journey multi-window-tearout
// Traceability: docs/features/dsh-forge-m4/testing/multi-window-tearout/
// contracts/step-3-parallel-observation.md — Outcomes:
//   success — 并行观察与操作:主窗操作会话、独立窗操作看板,互不干扰;
//   same-data-parallel — 同一数据面两侧镜像:状态以数据内核为事实源,两侧
//             一致更新、互不覆盖互不丢失;
//   main-switch-no-drag — 主窗切到项目 B:A 的拆出窗仍以 A 上下文渲染
//             (拆出窗 = 派生快照显示面,非第二激活);
//   detached-session-expired — DEFERRED(见 header VERIFY)。
// fixture_spec: Project ×2(dual 世界)+ Session + Task + DetachedWindow。
// Techniques: sc4 ③(detached 点击其内 dock + 主窗 composer 输入 + 主窗切 B
// 后 detached 钉 A)。
//
// VERIFY(deferred, detached-session-expired):detached 会话视图所依 dsh 会话
// 通道不可用的注入缝缺失(conversation 型拆出经旁置路径,当前接线为
// DISABLED —— 见 step-2 header 注记);同族降级呈现语义(明确错误 + 恢复
// 引导,不静默空白)由 BIZ-resilience-001 家族与 roundtrip open-failed 腿
// 承载。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, clickPaneDetachStable, M4WorldManager, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { openBoardPane } from '../_lib/journey-world.ts'
import { shellWindowCount, waitForDetachedBoard } from '../../helpers/windows.ts'
import { bootMwWorld, buildMwJourneyRoot, composerInput, reachTearoutReady, TASK_BOARD, TASK_OTHER } from './harness.ts'

test.describe.serial('multi-window-tearout / step 3: 并行观察与操作', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 两侧并行互不干扰(主窗会话 + 独立窗看板)。
  test('step3/success: 并行观察与操作 —— 主窗会话输入 + 独立窗看板点击,互不干扰', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildMwJourneyRoot()
    const world = await bootMwWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // 拆出看板 pane → 双窗并行。
    await clickPaneDetachStable(page)
    const detached = await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    expect(await shellWindowCount(world.shell.electronApp), '双窗在册').toBe(2)

    // 独立窗操作:节点点击 → 其内任务详情 dock。
    await clickStable(detached.page, `[data-dsh-forge-node-card="${TASK_BOARD}"]`)
    await expect(detached.page.locator(`[data-dsh-forge-task-detail="${TASK_BOARD}"]`),
      '独立窗可操作:节点点击 → 其内 dock').toBeVisible({ timeout: 20_000 })
    // 主窗操作:composer 输入(互不抢占 —— 两侧输入态各自独立)。
    await composerInput(page).click()
    await page.keyboard.insertText('MW 并行主窗输入桩 mw-parallel-typing')
    await expect(composerInput(page), '主窗并行可操作(composer 输入读回)').toContainText('mw-parallel-typing')
    // 互不串扰:独立窗 dock 不受主窗输入影响;主窗无 dock 抢占。
    await expect(detached.page.locator(`[data-dsh-forge-task-detail="${TASK_BOARD}"]`),
      '独立窗交互态保留(主窗操作不抢占)').toBeVisible()
    await expect(page.locator(`[data-dsh-forge-task-detail="${TASK_BOARD}"]`),
      '主窗未被独立窗 dock 抢占(互不干扰)').toHaveCount(0)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
    expect(detached.pageErrors, `detached pageerrors: ${detached.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "same-data-parallel" — 同一数据面两侧镜像,内核为事实源。
  test('step3/same-data-parallel: 同一任务状态面两侧镜像 —— 内核为事实源,两侧一致呈现、互不覆盖', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildMwJourneyRoot()
    const world = await bootMwWorld(manager, 'mirror', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // 拆出看板;主窗重开看板(同一数据面在两侧镜像呈现)。
    await clickPaneDetachStable(page)
    const detached = await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    await openBoardPane(page)
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_BOARD}"]`),
      '主窗看板呈现同一数据面(镜像)').toBeVisible({ timeout: 30_000 })
    await expect(detached.page.locator(`[data-dsh-forge-node-card="${TASK_BOARD}"]`),
      '独立窗看板呈现同一数据面(镜像)').toBeVisible({ timeout: 30_000 })

    // 两侧各自交互(detached 开 dock;主窗同节点核对)—— 状态以数据内核为
    // 事实源:两侧节点承载同一内核态(同源派生,互不覆盖互不丢失)。
    await clickStable(detached.page, `[data-dsh-forge-node-card="${TASK_BOARD}"]`)
    await expect(detached.page.locator(`[data-dsh-forge-task-detail="${TASK_BOARD}"]`),
      '独立窗侧交互(其内 dock)').toBeVisible({ timeout: 20_000 })
    const detachedLabel = await detached.page.locator(`[data-dsh-forge-node-card="${TASK_BOARD}"]`).textContent()
    const mainLabel = await page.locator(`[data-dsh-forge-node-card="${TASK_BOARD}"]`).textContent()
    expect((detachedLabel ?? '').includes(TASK_BOARD), '独立窗节点承载内核态(派生视图)').toBe(true)
    expect((mainLabel ?? '').includes(TASK_BOARD), '主窗节点承载内核态(派生视图)').toBe(true)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
    expect(detached.pageErrors, `detached pageerrors: ${detached.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "main-switch-no-drag" — 主窗切 B,拆出窗钉 A 不动。
  test('step3/main-switch-no-drag: 主窗切到 B —— A 拆出窗仍以 A 上下文渲染(单激活指针仅约束主窗)', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildMwJourneyRoot({ dual: true })
    const world = await bootMwWorld(manager, 'switch', built)
    const { page, kernel } = world
    const other = built.other
    if (other === null) throw new Error('dual world must carry the second project')
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // 拆出 A 的看板 → 主窗切 B。
    await clickPaneDetachStable(page)
    const detached = await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    const rowB = page.locator(`[data-dsh-forge-tree-project="${other.projectId}"]`)
    await rowB.click()
    await expect(rowB, '主窗切到 B(指针 = B)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })

    // A 的拆出窗不随主窗指针变化:仍钉 A + 零 B 串台。
    await expect(detached.page.locator(`[data-dsh-forge-detached-board][data-dsh-forge-detached-project="${kernel.projectId}"]`),
      '拆出窗仍以 A 上下文渲染(A/B 并行观察)').toBeVisible()
    await expect(detached.page.locator(`[data-dsh-forge-node-card="${TASK_OTHER}"]`),
      '拆出窗零 B 节点(不随主窗切台)').toHaveCount(0)
    // 主窗侧确实换台(B 语料可达 = 切换生效的对照)。
    await openBoardPane(page)
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_OTHER}"]`),
      '主窗 board 重键到 B(切换生效对照)').toBeVisible({ timeout: 30_000 })
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
    expect(detached.pageErrors, `detached pageerrors: ${detached.pageErrors.join(' | ')}`).toEqual([])
  })
})
