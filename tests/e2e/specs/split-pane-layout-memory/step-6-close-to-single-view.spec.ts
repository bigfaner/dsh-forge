// @feature dsh-forge-m4 | @web-e2e | @journey split-pane-layout-memory
// Traceability: docs/features/dsh-forge-m4/testing/split-pane-layout-memory/
// contracts/step-6-close-to-single-view.md — Outcomes:
//   success — 关闭一个 pane 至单视图:回到单视图呈现;布局记忆更新为当前
//             结构(记忆与实际一致);
//   all-closed-reenter — 全部关闭后重进:恢复单视图(不恢复已关闭 pane)。
// fixture_spec: Project ×1 + LayoutMemory(rightbar.panes 两 pane → 单 pane)。
// Techniques: sc4 ②(blob panes 随实际更新;单 pane 无 split-ratio 重放腿)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, ensureProjectGroupExpanded,
  ensureSplitActive, M4WorldManager, openTreeSession, pickSplitBoard,
  readLayoutBlob, startAutoDismiss, expandRightbar,
} from '../_lib/m4-world.ts'
import { bootSpWorld, buildSpJourneyRoot, composerInput, TOP_B } from './harness.ts'

test.describe.serial('split-pane-layout-memory / step 6: 关闭分屏回到单视图', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 关 pane → 单视图 + 记忆更新。
  test('step6/success: 关闭一个 pane —— 回到单视图呈现 + 布局记忆更新为当前结构', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildSpJourneyRoot()
    const world = await bootSpWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await expect(composerInput(page), '会话体挂载').toBeVisible({ timeout: 20_000 })

    // 就位:两 pane split 态。
    await expandRightbar(page)
    await pickSplitBoard(page)
    await ensureSplitActive(page)
    await expect(page.locator('[data-dsh-forge-split-separator]'),
      'split 态在座(分隔条呈现)').toBeVisible({ timeout: 10_000 })

    // 关闭一个 pane → 单视图(分隔条退场)。
    await clickStable(page, '[data-dsh-forge-pane-close]')
    await expect(page.locator('[data-dsh-forge-split-separator]'),
      '回到单视图(分隔条退场)').toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-pane-header]'),
      '回到单视图(pane 头退场)').toHaveCount(0, { timeout: 15_000 })

    // State(深断言):记忆更新为当前结构(单 pane 无 split-ratio 腿;去抖后)。
    await page.waitForTimeout(1_600)
    const blob = await readLayoutBlob(kernel.userDataDir, kernel.projectId)
    expect(blob, '布局记忆行在座(记忆与实际一致)').toBeDefined()
    const panes = (blob?.rightbar as { panes?: unknown[] } | undefined)?.panes
    expect(Array.isArray(panes), 'blob panes 在座(单 pane 结构)').toBe(true)
    expect((panes as unknown[]).length, '记忆 = 单 pane(与实际一致)').toBeLessThanOrEqual(1)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "all-closed-reenter" — 全关闭后重进:单视图恢复,不复活已关 pane。
  test('step6/all-closed-reenter: 全部关闭后重进 —— 恢复单视图(不恢复已关闭的 pane)', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildSpJourneyRoot()
    const world = await bootSpWorld(manager, 'reenter', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await expect(composerInput(page), '会话体挂载').toBeVisible({ timeout: 20_000 })

    // 就位 split 态 → 全部关闭至单视图 → 记忆落库。
    await expandRightbar(page)
    await pickSplitBoard(page)
    await ensureSplitActive(page)
    while (await page.locator('[data-dsh-forge-pane-close]').count() > 0) {
      await clickStable(page, '[data-dsh-forge-pane-close]')
      await page.waitForTimeout(600)
    }
    await expect(page.locator('[data-dsh-forge-split-separator]'),
      '全部关闭(单视图)').toHaveCount(0, { timeout: 15_000 })
    await page.waitForTimeout(1_600)

    // 离开重进(冷重启):恢复单视图,不恢复已关闭 pane。
    const userDataDir = kernel.userDataDir
    const rootDir = world.root
    const dshHome = world.dshHome
    stopAutoDismiss()
    await world.shell.close()
    const { launchWorkbenchShell } = await import('../../helpers/app.ts')
    const { assertNoActiveDshForgeInstances } = await import('../../helpers/instance-lock.ts')
    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
    const reborn = await launchWorkbenchShell({ userDataDir, rootDir, env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'm4-e2e-stub-key' } })
    manager.adopt({
      tag: 'reenter-reborn', shell: reborn, page: reborn.page, kernel,
      root: rootDir, dshHome, stub: null, mainLog: [],
    })
    try {
      await reborn.uiReady()
      stopAutoDismiss = startAutoDismiss(reborn.page)
      const page2 = reborn.page
      await expect(page2.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
        '重进:活跃项目恢复').toHaveAttribute('aria-current', 'true', { timeout: 30_000 })
      // 记忆与实际一致:单 pane 无 split-ratio 重放腿 → 分隔条不复活。
      await page2.waitForTimeout(2_000)
      await expect(page2.locator('[data-dsh-forge-split-separator]'),
        '重进恢复单视图(不恢复已关闭 pane)').toHaveCount(0)
      const blob = await readLayoutBlob(kernel.userDataDir, kernel.projectId)
      const panes = (blob?.rightbar as { panes?: unknown[] } | undefined)?.panes
      expect(Array.isArray(panes) ? (panes as unknown[]).length : 0,
        '重进后记忆仍 = 单 pane(记忆与实际一致)').toBeLessThanOrEqual(1)
      expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      stopAutoDismiss()
    }
  })
})
