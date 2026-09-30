// @feature dsh-forge-m4 | @web-e2e | @journey multi-window-tearout
// Traceability: docs/features/dsh-forge-m4/testing/multi-window-tearout/
// contracts/step-5-second-tearout-set.md — Outcomes:
//   success — 复数拆出:主窗 + 两个独立窗并行;拆出集合 = 2,各窗视图类型/
//             几何随项目记入布局记忆(类型边界见 header 注记);
//   retearout-remembered-rect — 收回后再拆出:按记忆几何打开(非缺省首窗
//             几何;重放 rect > 进程内记忆 > 缺省 960×640);
//   source-project-lifecycle — 来源项目归档 → 拆出窗保持 + 标题追加「已归档」
//             / 恢复 → 后缀清除 / 删除 → 全部拆出窗关闭 + toast + 记忆随删清除。
// fixture_spec: Project ×1 + Session + Task + DetachedWindow(集合 = 2)+ LayoutMemory。
// Techniques: sc4 ③(拆出用户径 ×2)/ detached.ts composeDetachedTitle(「项目 ·
// 视图[ · 已归档]」)/ lifecycle archiveProject/removeProject 动词。
//
// VERIFY(boundary, success 的「看板与会话」词面):conversation 型拆出经旁置
// 路径在当前接线为 DISABLED(见 step-2 header 注记)—— 复数集合腿以双
// board 窗承载(窗口集合/几何/记忆语义对 DetachedViewKind 类型无关;FT-102
// 几何决策纯函数为类型无关权威)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, bridgeInvoke, clickStable, M4WorldManager,
  readLayoutBlob, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { shellWindowCount, waitForDetachedBoard } from '../../helpers/windows.ts'
import { bootMwWorld, buildMwJourneyRoot, reachTearoutReady } from './harness.ts'

test.describe.serial('multi-window-tearout / step 5: 再拆出第二视图(集合复数)', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 复数拆出:集合 = 2 + 逐窗记忆。
  test('step5/success: 复数拆出 —— 主窗 + 两个独立窗并行 + 集合 = 2 入记忆(逐窗条目)', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const built = await buildMwJourneyRoot()
    const world = await bootMwWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // 第一次拆出(主窗 board pane 移除)。
    await clickStable(page, '[data-dsh-forge-pane-detach]')
    const first = await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '主窗 board pane 已移除(第一次拆出)').toHaveCount(0, { timeout: 15_000 })

    // 第二次拆出:重开 board pane(同一用户径)→ 再拆出。
    const { openBoardPane } = await import('../_lib/journey-world.ts')
    await openBoardPane(page)
    await expect(page.locator('[data-dsh-forge-pane-detach]'),
      '第二次拆出的 pane 头动作位在场').toBeVisible({ timeout: 15_000 })
    await clickStable(page, '[data-dsh-forge-pane-detach]')
    const second = await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    expect(first.page !== second.page, '两个独立窗(不同 page 身份)').toBe(true)
    await expect.poll(() => shellWindowCount(world.shell.electronApp),
      { timeout: 15_000, message: '窗口集 = 3(主窗 + 两独立窗)' }).toBe(3)

    // State(深断言):拆出集合 = 2 入记忆(逐窗条目;去抖后)。
    await page.waitForTimeout(1_600)
    await expect.poll(async () => {
      const detached = (await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.detached
      return Array.isArray(detached) ? (detached as unknown[]).length : 0
    }, { timeout: 15_000, message: '拆出集合 = 2(blob detached 条目数)' }).toBe(2)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
    expect(first.pageErrors, `detached-1 pageerrors: ${first.pageErrors.join(' | ')}`).toEqual([])
    expect(second.pageErrors, `detached-2 pageerrors: ${second.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "retearout-remembered-rect" — 记忆几何复用(非缺省)。
  test('step5/retearout-remembered-rect: 收回后再拆出 —— 新窗按记忆几何打开(非缺省首窗几何)', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const built = await buildMwJourneyRoot()
    const world = await bootMwWorld(manager, 'rect', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // 第一次拆出 + 调整几何(移动 + 缩放,偏离缺省 960×640 居中)。
    await clickStable(page, '[data-dsh-forge-pane-detach]')
    const first = await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    await first.page.setViewportSize({ width: 800, height: 520 })
    const moved = await first.page.evaluate(() => { window.moveTo(140, 160); return true }).catch(() => false)
    void moved
    // 拆出集合落库(几何随关闭记忆)→ [收回]。
    await page.waitForTimeout(1_600)
    await clickStable(first.page, '[data-dsh-forge-detached-recall]')
    await expect.poll(() => shellWindowCount(world.shell.electronApp),
      { timeout: 15_000, message: '收回(单窗)' }).toBe(1)
    await expect(page.locator('[data-dsh-forge-task-board]'),
      'pane 回主窗(收回完成)').toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(1_600)

    // 再拆出:新窗按记忆几何打开(宽 = 调整后值,非缺省 960)。
    await clickStable(page, '[data-dsh-forge-pane-detach]')
    const second = await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    const rect = await second.page.evaluate(() => ({
      w: window.innerWidth, h: window.innerHeight, x: window.screenX, y: window.screenY,
    }))
    expect(rect.w, `记忆几何复用:宽 = 调整后值(实测 ${String(rect.w)};缺省 960)`).toBeLessThan(960)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
    expect(second.pageErrors, `detached pageerrors: ${second.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "source-project-lifecycle" — 来源项目归档/恢复/删除的窗口钩子。
  test('step5/source-project-lifecycle: 归档 → 窗保持 + 标题追加「已归档」/ 恢复 → 后缀清除 / 删除 → 窗全关 + 记忆随删清除', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const built = await buildMwJourneyRoot()
    const world = await bootMwWorld(manager, 'lifecycle', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // 就位:拆出 + 集合落库。
    await clickStable(page, '[data-dsh-forge-pane-detach]')
    const detached = await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    await page.waitForTimeout(1_600)
    const titleBefore = await detached.page.title()

    // ---- 支路一:归档 → 窗保持可用 + 标题追加「已归档」。---------------
    await bridgeInvoke<unknown>(page, 'archiveProject', [{ projectId: kernel.projectId }])
    await expect(detached.page.locator(`[data-dsh-forge-detached-project="${kernel.projectId}"]`),
      '归档:拆出窗保持可用(归档 ≠ 关窗)').toBeVisible()
    await expect.poll(() => detached.page.title(),
      { timeout: 15_000, message: '归档:标题追加「已归档」' }).toContain('已归档')

    // ---- 支路二:恢复 → 后缀即时清除、窗保持。---------------------------
    await bridgeInvoke<unknown>(page, 'restoreProject', [{ projectId: kernel.projectId }])
    await expect(detached.page.locator(`[data-dsh-forge-detached-project="${kernel.projectId}"]`),
      '恢复:窗保持可用').toBeVisible()
    await expect.poll(() => detached.page.title(),
      { timeout: 15_000, message: '恢复:后缀「已归档」即时清除' }).toBe(titleBefore)

    // ---- 支路三:删除 → 该项目全部拆出窗关闭 + 记忆随删清除。-----------
    await page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
    await bridgeInvoke<unknown>(page, 'removeProject', [kernel.projectId])
    await expect.poll(() => shellWindowCount(world.shell.electronApp),
      { timeout: 20_000, message: '删除:全部拆出窗关闭(不残留)' }).toBe(1)
    expect(await readLayoutBlob(kernel.userDataDir, kernel.projectId),
      '删除:布局记忆随项目级联清除').toBeUndefined()
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
    expect(detached.pageErrors, `detached pageerrors: ${detached.pageErrors.join(' | ')}`).toEqual([])
  })
})
