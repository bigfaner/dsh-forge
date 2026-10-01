// @feature dsh-forge-m4 | @web-e2e | @journey multi-window-tearout
// Journey smoke test — the tearout loop END TO END in one world (happy-path
// Outcomes only):
//   Step 1 pane 菜单 [拆出为窗口] 可用 → Step 2 拆出(独立窗 + 标题 + 主窗
//   pane 移除 + 记忆)→ Step 3 并行互不干扰 → Step 4 [收回](pane 即时回主窗
//   + 记忆更新)→ Step 5 再拆出(集合复数)→ Step 6 离开重进恢复拆出态。
// Traceability: docs/features/dsh-forge-m4/testing/multi-window-tearout/
// journey.md (Happy Path Steps 1-6) + contracts/step-{1..6}-*.md success faces。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, clickPaneDetachStable, ensureBoardPaneDetachable, M4WorldManager,
  readLayoutBlob, startAutoDismiss,
} from '../_lib/m4-world.ts'
import {
  quitShellAssertZeroWindows, shellWindowCount, waitForDetachedBoard,
} from '../../helpers/windows.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { bootMwWorld, buildMwJourneyRoot, composerInput, reachTearoutReady, TASK_BOARD } from './harness.ts'

test('smoke/multi-window-tearout: 拆出 → 并行 → 收回 → 复数 → 重进恢复(单世界 happy path)', async ({ }, testInfo) => {
  testInfo.setTimeout(900_000)
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}
  const built = await buildMwJourneyRoot()
  try {
    const world = await bootMwWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // ---- Step 1:pane 菜单 [拆出为窗口] 可用。---------------------------
    await expect(page.locator('[data-dsh-forge-pane-detach]'),
      'Step 1:[拆出为窗口] 动作位在场').toBeVisible({ timeout: 10_000 })

    // ---- Step 2:拆出(独立窗 + 标题 + 主窗 pane 移除)。----------------
    await ensureBoardPaneDetachable(page)
    await clickPaneDetachStable(page)
    const detached = await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    // 标题归主进程(M4 窗口角色契约)—— OS 窗题经主进程面读取。
    const osTitles = await world.shell.electronApp.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().map(win => win.getTitle()))
    expect(osTitles.some(title => title.includes('·')),
      `Step 2:独立窗标题「项目 · 视图」(实测 OS titles ${JSON.stringify(osTitles)})`).toBe(true)
    await expect(page.locator('[data-dsh-forge-task-board]'),
      'Step 2:主窗移除该 pane').toHaveCount(0, { timeout: 15_000 })
    expect(await shellWindowCount(world.shell.electronApp), 'Step 2:窗口集 +1').toBe(2)

    // ---- Step 3:并行互不干扰。-----------------------------------------
    await clickStable(detached.page, `[data-dsh-forge-node-card="${TASK_BOARD}"]`)
    await expect(detached.page.locator(`[data-dsh-forge-task-detail="${TASK_BOARD}"]`),
      'Step 3:独立窗可操作(其内 dock)').toBeVisible({ timeout: 20_000 })
    await composerInput(page).click()
    await page.keyboard.insertText('MW smoke 并行输入桩 mw-smoke-typing')
    await expect(composerInput(page), 'Step 3:主窗并行可操作').toContainText('mw-smoke-typing')

    // ---- Step 4:[收回](pane 即时回主窗 + 记忆更新)。------------------
    await page.waitForTimeout(1_600)
    await clickStable(detached.page, '[data-dsh-forge-detached-recall]')
    await expect(page.locator('[data-dsh-forge-task-board]'),
      'Step 4:pane 即时回主窗原位(不待重启)').toBeVisible({ timeout: 30_000 })
    await expect.poll(() => shellWindowCount(world.shell.electronApp),
      { timeout: 15_000, message: 'Step 4:窗口集 -1' }).toBe(1)

    // ---- Step 5:再拆出(集合复数 = 2)。-------------------------------
    // 再拆出走 C9 分屏用户径(pane 头仅在 ≥2 pane 时挂载;M3 openBoardPane
    // 单 pane 面不承载动作位)。
    await ensureBoardPaneDetachable(page)
    await clickPaneDetachStable(page)
    await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    await ensureBoardPaneDetachable(page)
    await clickPaneDetachStable(page)
    await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    await expect.poll(() => shellWindowCount(world.shell.electronApp),
      { timeout: 15_000, message: 'Step 5:窗口集 = 3(集合复数)' }).toBe(3)
    await page.waitForTimeout(1_600)
    await expect.poll(async () => {
      const entries = (await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.detached
      return Array.isArray(entries) ? (entries as unknown[]).length : 0
    }, { timeout: 15_000, message: 'Step 5:拆出集合 = 2 入记忆' }).toBe(2)

    // ---- Step 6:离开重进恢复拆出态。-----------------------------------
    const userDataDir = kernel.userDataDir
    const rootDir = world.root
    const dshHome = world.dshHome
    stopAutoDismiss()
    await quitShellAssertZeroWindows(world.shell.electronApp)
    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
    const reborn = await launchWorkbenchShell({ userDataDir, rootDir, env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'm4-e2e-stub-key' } })
    manager.adopt({
      tag: 'smoke-reborn', shell: reborn, page: reborn.page, kernel,
      root: rootDir, dshHome, stub: null, mainLog: [],
    })
    await reborn.uiReady()
    stopAutoDismiss = startAutoDismiss(reborn.page)
    await expect(reborn.page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      'Step 6:重进活跃项目恢复').toHaveAttribute('aria-current', 'true', { timeout: 30_000 })
    await expect.poll(() => shellWindowCount(reborn.electronApp),
      { timeout: 45_000, message: 'Step 6:拆出集合恢复(窗口集收敛 = 3)' }).toBe(3)
    const restored = await waitForDetachedBoard(reborn.electronApp, kernel.projectId, 30_000)
    await expect(restored.page.locator(`[data-dsh-forge-detached-project="${kernel.projectId}"]`),
      'Step 6:恢复的拆出窗钉死来源项目').toBeVisible()
    expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    stopAutoDismiss()
    await manager.closeAll()
  }
})
