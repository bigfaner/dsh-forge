// @feature dsh-forge-m4 | @web-e2e | @journey multi-window-tearout
// Traceability: docs/features/dsh-forge-m4/testing/multi-window-tearout/
// contracts/step-2-tearout-window.md — Outcomes:
//   success — [拆出为窗口]:视图迁入独立窗口(标题「<项目名> · <视图名>」);
//             主窗移除该 pane、其余 pane 重排;拆出集合入布局记忆;
//   main-pane-rearrange — 被拆出视图原占主窗唯一内容 pane:移除后按布局
//             规则重排,不出现空白死区;
//   tearout-target-invalid — DEFERRED(见 header VERIFY);
//   tearout-open-failed — DEFERRED(见 header VERIFY)。
// fixture_spec: Project ×1 + Task ×1 + LayoutMemory(分屏态/唯一内容 pane)。
// Techniques: sc4 ③(waitForDetachedBoard + 换台重置 pane 移除面)+ 4.5 blob
// detached 集合面。
//
// VERIFY(deferred, tearout-target-invalid):conversation 型拆出(会话类目标)
// 经由「会话旁置」tab 菜单(DetachMenuEntry —— 仅 subagentchat tab 渲染),
// 而旁置行在当前接线为 DISABLED(aside 目标解析器缺席,client/index.ts 接线
// 注记)—— 拆出侧的「目标已失效」形态在真链不可达;同通道拒绝语义
// (ERR_SESSION_OPEN_FAILED,不静默)由 roundtrip 旅程 step-5 open-target-
// missing 权威承载(cross-ref)。
// VERIFY(deferred, tearout-open-failed):窗口构造/文档加载失败无 e2e 注错
// 缝(ERR_WINDOW_OPEN_FAILED;FT-104 单测矩阵为权威);本旅程不伪造无载体的
// 故障腿 —— 「失败窗收回不留残窗」以 step-4 收回腿的窗口集恒一致性承载旁证。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, M4WorldManager, readLayoutBlob,
  startAutoDismiss,
} from '../_lib/m4-world.ts'
import { shellWindowCount, waitForDetachedBoard } from '../../helpers/windows.ts'
import { bootMwWorld, buildMwJourneyRoot, reachTearoutReady } from './harness.ts'

test.describe.serial('multi-window-tearout / step 2: 拆出为独立窗口', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 拆出:独立窗 + 标题 + 主窗 pane 移除 + 记忆。
  test('step2/success: 拆出为窗口 —— 独立窗标题「项目 · 视图」+ 主窗 pane 移除 + 拆出集合入记忆', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildMwJourneyRoot()
    const world = await bootMwWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)
    const panesBefore = await page.evaluate(() =>
      document.querySelectorAll('[data-dsh-forge-pane-region]').length)

    // 拆出(pane 头动作;主进程 windowOpenDetached → 同源 SPA 重载 + role 握手)。
    await clickStable(page, '[data-dsh-forge-pane-detach]')
    const detached = await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)

    // 独立窗:标题「<项目名> · <视图名>」(C10 form;projectTitle · viewLabel)。
    // 标题归主进程(M4 窗口角色契约)—— OS 窗题经主进程面读取;
    // page.title() 读的是渲染层 document.title,非 OS 窗题。
    const osTitles = await world.shell.electronApp.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().map(win => win.getTitle()))
    expect(osTitles.some(title => title.includes('·')),
      `独立窗标题 = 项目 · 视图(实测 OS titles ${JSON.stringify(osTitles)})`).toBe(true)
    // detached 装配:[收回] 条 + 单视图(钉死来源项目)。
    await expect(detached.page.locator('[data-dsh-forge-detached-recall]'),
      'detached [收回] 条在场(单视图装配)').toBeVisible({ timeout: 15_000 })
    await expect(detached.page.locator(`[data-dsh-forge-detached-project="${kernel.projectId}"]`),
      'detached 钉死来源项目').toBeVisible()

    // 主窗:移除该 pane(pane 数下降)、其余 pane 按布局规则重排。
    await page.waitForTimeout(1_000)
    const panesAfter = await page.evaluate(() =>
      document.querySelectorAll('[data-dsh-forge-pane-region]').length)
    expect(panesAfter, '主窗移除该 pane(pane 数下降)').toBeLessThan(panesBefore)
    expect(await shellWindowCount(world.shell.electronApp), '窗口集 +1(双窗在册)').toBe(2)

    // State(深断言):拆出集合入布局记忆(blob detached 条目;去抖后)。
    await page.waitForTimeout(1_600)
    await expect.poll(async () => JSON.stringify((await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.detached ?? {}),
      { timeout: 15_000, message: '拆出窗口集合入 blob(detached 条目)' }).toContain('board')
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
    expect(detached.pageErrors, `detached pageerrors: ${detached.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "main-pane-rearrange" — 唯一内容 pane 拆出:无空白死区。
  test('step2/main-pane-rearrange: 唯一内容 pane 拆出 —— 主窗按布局规则重排呈现,无空白死区', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildMwJourneyRoot()
    const world = await bootMwWorld(manager, 'rearrange', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await reachTearoutReady(page, kernel.projectId)

    // 关闭其余 pane 至唯一 board 内容 pane(拆出对象 = 主窗唯一内容 pane)。
    while (await page.locator('[data-dsh-forge-pane-close]').count() > 1) {
      await clickStable(page, '[data-dsh-forge-pane-close]')
      await page.waitForTimeout(600)
    }
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '唯一内容 pane = board(拆出对象就位)').toBeVisible({ timeout: 15_000 })

    // 拆出该唯一内容 pane。
    await clickStable(page, '[data-dsh-forge-pane-detach]')
    await waitForDetachedBoard(world.shell.electronApp, kernel.projectId, 30_000)
    await page.waitForTimeout(1_000)

    // 主窗不出现空白死区:右栏容器回收呈现默认面(开始/概览引导)而非空区;
    // 三区骨架仍在(座位 + conversation)。
    await expect(page.locator('[data-dsh-forge-project-seat]'),
      '左栏座位仍在(无空白主窗死区)').toBeVisible()
    await expect(page.locator('[data-composer-card] [contenteditable="true"]'),
      'conversation 面仍在(主窗内容区不空白)').toBeVisible({ timeout: 20_000 })
    const blankDead = await page.evaluate(() => {
      const panel = document.querySelector('[data-sidebar-right-panel]') as HTMLElement | null
      return panel === null
    })
    expect(blankDead, '右栏容器在场(回收呈现,无空白死区)').toBe(false)
    expect(await shellWindowCount(world.shell.electronApp), '双窗在册(拆出完成)').toBe(2)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
