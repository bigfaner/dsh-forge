// @feature dsh-forge-m4 | @web-e2e | @journey split-pane-layout-memory
// Traceability: docs/features/dsh-forge-m4/testing/split-pane-layout-memory/
// contracts/step-3-drag-pane-ratio.md — Outcomes:
//   success — 拖拽(键盘模型)调整比例:即时生效;各 pane 复用同一视图组件
//             (功能面不变);钳制后比例入记忆(去抖合流);
//   ratio-clamp-extreme — 极限拖拽:比例恒留 [30%,70%](钳制),不失能、
//             无 0 宽死区;松手后布局可继续操作。
// fixture_spec: Project ×1 + LayoutMemory(rightbar.panes 两 pane 在屏;
// widthPct 达钳制极限一侧)。
// Techniques: sc4 ②(分隔条键盘模型:Home 复位 + Shift+← 大步 → 30% 地板;
// aria-valuenow = 模型态)+ FT-114(clampSplitRatio 0.3–0.7 纯函数)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, commitSplitRatioToFloor,
  ensureProjectGroupExpanded, ensureSplitActive, M4WorldManager, openTreeSession,
  pickSplitBoard, readLayoutBlob, splitRatioPercent, startAutoDismiss, expandRightbar,
} from '../_lib/m4-world.ts'
import { TASK_BOARD, TOP_B, bootSpWorld, buildSpJourneyRoot, composerInput } from './harness.ts'

test.describe.serial('split-pane-layout-memory / step 3: 拖拽调整 pane 比例', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 比例调整即时生效 + 入记忆 + 功能面不变。
  test('step3/success: 分隔条键盘模型调比例 —— 即时生效 + 钳制值入 blob + 双 pane 功能面不变', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildSpJourneyRoot()
    const world = await bootSpWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await expect(composerInput(page), '会话体挂载').toBeVisible({ timeout: 20_000 })
    await expandRightbar(page)
    await pickSplitBoard(page)
    await ensureSplitActive(page)

    // 调整:键盘模型 → 30%(即时生效 = aria-valuenow 更新)。
    const initial = await splitRatioPercent(page)
    expect(initial, '分隔条模型态在座(调整前读数)').not.toBeNull()
    await commitSplitRatioToFloor(page)
    await expect.poll(() => splitRatioPercent(page),
      { timeout: 10_000, message: '比例调整即时生效(键盘模型 → 30%)' }).toBe('30')

    // 各 pane 复用同一视图组件(功能面不变):会话输入 + 看板节点点击。
    await composerInput(page).click()
    await page.keyboard.insertText('SP 比例调整后输入桩 sp-after-ratio')
    await expect(composerInput(page), '比例调整后会话功能面不变(可输入)').toContainText('sp-after-ratio')
    await clickStable(page, `[data-dsh-forge-node-card="${TASK_BOARD}"]`)
    await expect(page.locator(`[data-dsh-forge-task-detail="${TASK_BOARD}"]`),
      '比例调整后看板功能面不变(可点击 → dock)').toBeVisible({ timeout: 20_000 })
    await clickStable(page, '[data-dsh-forge-detail-close]')

    // State(深断言):钳制后比例入记忆(800ms 尾随去抖 + settle)。
    await page.waitForTimeout(1_600)
    await expect.poll(async () => (await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.rightbar,
      { timeout: 15_000, message: '钳制后比例入 blob(widthPct = 30)' }).toMatchObject({ widthPct: 30 })
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "ratio-clamp-extreme" — 极限拖拽钳制(30% 地板不再收缩)。
  test('step3/ratio-clamp-extreme: 极限方向继续拖拽 —— 钳制不再收缩(恒 ≥30%)+ 不失能 + 松手后可继续操作', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildSpJourneyRoot()
    const world = await bootSpWorld(manager, 'clamp', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await expect(composerInput(page), '会话体挂载').toBeVisible({ timeout: 20_000 })
    await expandRightbar(page)
    await pickSplitBoard(page)
    await ensureSplitActive(page)

    // 就位:钳制极限一侧(30% 地板)。
    await commitSplitRatioToFloor(page)
    await expect.poll(() => splitRatioPercent(page),
      { timeout: 10_000, message: '就位钳制地板(30%)' }).toBe('30')
    // 继续向极限方向步进(多次大步):比例钳制不再收缩。
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Shift+ArrowLeft')
    }
    await page.waitForTimeout(500)
    const clamped = Number(await splitRatioPercent(page))
    expect(clamped, '钳制:比例恒留 [30,70] 域(不再收缩,无 0 宽死区)').toBeGreaterThanOrEqual(30)
    expect(clamped, '钳制上界同域').toBeLessThanOrEqual(70)
    // 不失能:分隔条仍可操作(复位 50/50 = 反向操作生效)。
    await page.keyboard.press('Home')
    await expect.poll(() => splitRatioPercent(page),
      { timeout: 10_000, message: '松手后布局可继续操作(Home 复位 50)' }).toBe('50')
    // State(深断言):比例恒在域内入记忆。
    await page.waitForTimeout(1_600)
    const widthPct = (await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.rightbar
    expect((widthPct as { widthPct?: number } | undefined)?.widthPct,
      '记忆中的比例恒在 [30,70] 域').toBeGreaterThanOrEqual(30)
    expect((widthPct as { widthPct?: number } | undefined)?.widthPct,
      '记忆中的比例上界同域').toBeLessThanOrEqual(70)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
