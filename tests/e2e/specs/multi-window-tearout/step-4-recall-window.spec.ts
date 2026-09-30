// @feature dsh-forge-m4 | @web-e2e | @journey multi-window-tearout
// Traceability: docs/features/dsh-forge-m4/testing/multi-window-tearout/
// contracts/step-4-recall-window.md — Outcomes:
//   success — [收回]:视图 pane 即时回主窗原位(不待重启);布局记忆更新为
//             收回后结构;关闭时记忆该窗几何(供复用);
//   close-main-quit — 关闭主窗 = 退出应用:全部拆出窗随之关闭、不残留;
//             重进按布局记忆恢复拆出态(UF10 restored;OS 标题栏关闭的
//             M1 承载形态见 header 注记);
//   recall-window-not-found — DEFERRED(见 header VERIFY)。
// fixture_spec: Project ×1 + DetachedWindow ×1 + LayoutMemory(detached 集)。
// Techniques: sc4 ④(OS 关主窗 = 托盘驻留 M1 语义 + 退出漏斗 recallAll 清扫
// + 计数归零 + 重进恢复)。
//
// VERIFY(semantics mapping, close-main-quit):tech-design Interface 5「主窗
// 关闭 = 退出」由 M1 托盘语义承接(sc4 ④ 实测口径):OS 标题栏关闭 = 托盘
// 驻留(隐藏非销毁,detached 不被误清);退出经退出漏斗(托盘「退出」/
// app.quit 同径)→ 主窗 'closed' recallAll 清扫全部拆出窗 → 计数归零 +
// 进程退出。本腿依序断言两个形态(驻留零误清 → 退出清扫),词面「关闭主
// 窗口」以漏斗口径落断言。
// VERIFY(deferred, recall-window-not-found):失效 windowId 的收回请求无 UI
// 驱动径(收回按钮随窗而逝;windowRecall 通道为 main 进程内部面),e2e 无
// 注错缝;FT-104 单测矩阵(log-only + 窗口关闭事件兜底)为权威 —— UI 侧的
// 「窗口集与记忆恒一致」由本步 success/close-main-quit 两腿承载旁证。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, clickPaneDetachStable, ensureBoardPaneDetachable, M4WorldManager,
  readLayoutBlob, startAutoDismiss,
} from '../_lib/m4-world.ts'
import {
  closeMainWindowLikeUser, mainWindowVisible, quitShellAssertZeroWindows,
  shellWindowCount, waitForDetachedBoard,
} from '../../helpers/windows.ts'
import { isProcessAlive } from '../../../../apps/desktop/e2e/helpers/fixture-app.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { bootMwWorld, buildMwJourneyRoot, reachTearoutReady } from './harness.ts'

test.describe.serial('multi-window-tearout / step 4: 收回独立窗口(关闭 ≡ 收回)', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 收回:pane 即时回主窗 + 记忆更新。
  test('step4/success: [收回] —— 视图 pane 即时回主窗原位 + 窗口集 -1 + 记忆更新(几何记忆随关闭)', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildMwJourneyRoot()
    const world = await bootMwWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // 就位:拆出(主窗 board pane 移除)。
    await clickPaneDetachStable(page)
    const detached = await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '主窗 board pane 已移除(拆出对照)').toHaveCount(0, { timeout: 15_000 })
    expect(await shellWindowCount(world.shell.electronApp), '双窗在册(拆出态)').toBe(2)

    // [收回](拆出窗条;OS 标题栏关闭同语义 —— 两者汇入同一 closed 路径)。
    await clickStable(detached.page, '[data-dsh-forge-detached-recall]')
    // pane 即时回主窗原位(不待重启)+ 窗口集 -1。
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '收回:board pane 即时回主窗原位(不待重启)').toBeVisible({ timeout: 30_000 })
    await expect.poll(() => shellWindowCount(world.shell.electronApp),
      { timeout: 15_000, message: '窗口集 -1(单窗在册)' }).toBe(1)

    // State(深断言):记忆更新为收回后结构(detached 条目退场;去抖后)。
    await page.waitForTimeout(1_600)
    const blob = await readLayoutBlob(kernel.userDataDir, kernel.projectId)
    expect(JSON.stringify(blob?.detached ?? {}),
      '布局记忆更新为收回后结构(零拆出条目 —— 几何已随关闭记忆供复用)').not.toContain(`"view":"board"`)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "close-main-quit" — 主窗关闭 = 退出(驻留形态 + 退出清扫 + 重进恢复)。
  test('step4/close-main-quit: 主窗关闭 —— 托盘驻留零误清 + 退出漏斗清扫全部拆出窗 + 重进恢复拆出态', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const built = await buildMwJourneyRoot()
    const world = await bootMwWorld(manager, 'quit', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // 就位:拆出态(主窗 + ≥1 拆出窗)+ 拆出集合落库(去抖 flush;重进恢复
    // 的记忆前提)。pane 头动作位先证在场可用(拆出走 C9 分屏径的重进竞态面)。
    await ensureBoardPaneDetachable(page)
    await clickPaneDetachStable(page)
    const detached = await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    expect(await shellWindowCount(world.shell.electronApp), '双窗在册(拆出态)').toBe(2)
    await page.waitForTimeout(1_600)
    await expect.poll(async () => JSON.stringify((await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.detached ?? {}),
      { timeout: 15_000, message: '拆出集合入 blob(重进恢复的记忆前提)' }).toContain('board')
    const mainPid = await world.shell.electronApp.evaluate(() => process.pid)
    const userDataDir = kernel.userDataDir
    const rootDir = world.root
    const dshHome = world.dshHome

    // 形态一(M1 承载):OS 标题栏关闭主窗 = 托盘驻留(隐藏非销毁;detached
    // 不被误清 —— 仅真实销毁才清扫)。
    await closeMainWindowLikeUser(world.shell.electronApp, detached.page)
    await expect.poll(() => mainWindowVisible(world.shell.electronApp),
      { timeout: 15_000, message: '主窗关闭落驻留(隐藏,M1 语义)' }).toBe(false)
    expect(await shellWindowCount(world.shell.electronApp),
      '驻留非销毁:窗口仍在册(主窗隐藏 + detached)').toBe(2)
    expect(isProcessAlive(mainPid), '驻留期主进程存活(未退出)').toBe(true)
    await expect(detached.page.locator(`[data-dsh-forge-detached-project="${kernel.projectId}"]`),
      '驻留期拆出窗不被误清').toBeVisible()

    // 形态二(退出漏斗):主窗销毁 → recallAll 清扫 → 计数归零 + 进程退出。
    stopAutoDismiss()
    await quitShellAssertZeroWindows(world.shell.electronApp)
    expect(isProcessAlive(mainPid), '退出后主进程已退出').toBe(false)
    expect(await shellWindowCount(world.shell.electronApp), '窗口集清零(不残留)').toBe(0)

    // 重进按布局记忆恢复拆出态(UF10 restored)。
    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
    const reborn = await launchWorkbenchShell({ userDataDir, rootDir, env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'm4-e2e-stub-key' } })
    manager.adopt({
      tag: 'quit-reborn', shell: reborn, page: reborn.page, kernel,
      root: rootDir, dshHome, stub: null, mainLog: [],
    })
    try {
      await reborn.uiReady()
      stopAutoDismiss = startAutoDismiss(reborn.page)
      const page2 = reborn.page
      await expect(page2.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
        '重进:活跃项目恢复').toHaveAttribute('aria-current', 'true', { timeout: 30_000 })
      // 拆出窗口集合随项目记忆恢复(异步重建;收敛为离开时集合 = 1 拆出窗)。
      const rebornDetached = await waitForDetachedBoard(reborn.electronApp, kernel.projectId, 45_000)
      await expect(rebornDetached.page.locator(`[data-dsh-forge-detached-project="${kernel.projectId}"]`),
        '重进恢复拆出态(记忆逐窗重建)').toBeVisible()
      expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      stopAutoDismiss()
    }
  })
})
