// @feature dsh-forge-m4 | @web-e2e | @journey split-pane-layout-memory
// Journey smoke test — the split-layout loop END TO END in one world
// (happy-path Outcomes only):
//   Step 1 单视图默认态 → Step 2 [分屏] 添加看板 pane(双 pane 同屏可操作)→
//   Step 3 分隔条调比例 30%(功能面不变)→ Step 4 subagent 后代展开→收起 →
//   Step 5 离开重进(冷重启:结构/比例/收起恢复)→ Step 6 关闭 pane 回单视图
//   (记忆更新)。
// Traceability: docs/features/dsh-forge-m4/testing/split-pane-layout-memory/
// journey.md (Happy Path Steps 1-6) + contracts/step-{1..6}-*.md success faces。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, commitSplitRatioToFloor,
  ensureProjectGroupExpanded, ensureSplitActive, M4WorldManager, openTreeSession,
  pickSplitBoard, readLayoutBlob, splitRatioPercent, startAutoDismiss, expandRightbar,
} from '../_lib/m4-world.ts'
import { bootSpWorld, buildSpJourneyRoot, composerInput, TASK_BOARD, TOP_A, TOP_B } from './harness.ts'

test('smoke/split-pane-layout-memory: 单视图 → 分屏 → 调比例 → 收起后代 → 重进恢复 → 关回单视图(单世界 happy path)', async ({ }, testInfo) => {
  testInfo.setTimeout(900_000)
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}
  const built = await buildSpJourneyRoot()
  try {
    const world = await bootSpWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)

    // ---- Step 1:单视图默认态 ---------------------------------------------
    await expect(page.locator('[data-dsh-forge-split-separator]'),
      'Step 1:single 默认态(无分隔条)').toHaveCount(0)

    // ---- Step 2:添加分屏(会话 + 看板)-----------------------------------
    await openTreeSession(page, TOP_B)
    await expect(composerInput(page), 'Step 2:会话体挂载').toBeVisible({ timeout: 20_000 })
    await expandRightbar(page)
    await pickSplitBoard(page)
    await expect(page.locator('[data-dsh-forge-task-board]'),
      'Step 2:看板 pane 打开').toBeVisible({ timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_BOARD}"]`),
      'Step 2:看板承载语料节点').toBeVisible({ timeout: 20_000 })

    // ---- Step 3:调比例 30% + 功能面不变 ---------------------------------
    await ensureSplitActive(page)
    await commitSplitRatioToFloor(page)
    await expect.poll(() => splitRatioPercent(page),
      { timeout: 10_000, message: 'Step 3:比例 30%' }).toBe('30')
    await composerInput(page).click()
    await page.keyboard.insertText('SP smoke 输入桩 sp-smoke-typing')
    await expect(composerInput(page), 'Step 3:比例调整后会话功能面不变').toContainText('sp-smoke-typing')

    // ---- Step 4:subagent 后代展开 → 收起 --------------------------------
    await expect(page.locator(`[data-dsh-forge-tree-session="${TOP_A}"]`),
      'Step 4:parent 会话行在座').toBeVisible({ timeout: 30_000 })
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_A}"]`)
    await expect(page.locator('[data-dsh-forge-tree-kind="subagent"]'),
      'Step 4:展开后 subagent 行在场').toBeVisible({ timeout: 10_000 })
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_A}"]`)
    await expect(page.locator('[data-dsh-forge-tree-kind="subagent"]'),
      'Step 4:收起').toHaveCount(0, { timeout: 10_000 })
    await page.waitForTimeout(1_600)
    await expect.poll(async () => (await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.rightbar,
      { timeout: 15_000, message: 'Step 3/4:布局入 blob(widthPct=30)' }).toMatchObject({ widthPct: 30 })

    // ---- Step 5:离开重进(冷重启;结构/比例/收起恢复)-------------------
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
      tag: 'smoke-reborn', shell: reborn, page: reborn.page, kernel,
      root: rootDir, dshHome, stub: null, mainLog: [],
    })
    await reborn.uiReady()
    stopAutoDismiss = startAutoDismiss(reborn.page)
    const page2 = reborn.page
    await expect(page2.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
      'Step 5:重进活跃项目恢复').toHaveAttribute('aria-current', 'true', { timeout: 30_000 })
    await expect(page2.locator('[data-dsh-forge-task-board]'),
      'Step 5:board pane 重放恢复').toBeVisible({ timeout: 45_000 })
    await expect(page2.locator('[data-dsh-forge-tree-kind="subagent"]'),
      'Step 5:subagent 收起状态恢复').toHaveCount(0)
    await ensureProjectGroupExpanded(page2, kernel.projectId)
    await openTreeSession(page2, TOP_B)
    await ensureSplitActive(page2)
    await expect.poll(() => splitRatioPercent(page2),
      { timeout: 10_000, message: 'Step 5:比例恢复 30' }).toBe('30')

    // ---- Step 6:关闭 pane 回单视图(记忆更新)--------------------------
    await clickStable(page2, '[data-dsh-forge-pane-close]')
    await expect(page2.locator('[data-dsh-forge-split-separator]'),
      'Step 6:回到单视图').toHaveCount(0, { timeout: 15_000 })
    await page2.waitForTimeout(1_600)
    const blob = await readLayoutBlob(kernel.userDataDir, kernel.projectId)
    const panes = (blob?.rightbar as { panes?: unknown[] } | undefined)?.panes
    expect(Array.isArray(panes) ? (panes as unknown[]).length : 0,
      'Step 6:记忆更新为单 pane 结构').toBeLessThanOrEqual(1)
    expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    stopAutoDismiss()
    await manager.closeAll()
  }
})
