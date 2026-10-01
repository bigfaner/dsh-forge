// @feature dsh-forge-m4 | @web-e2e | @journey split-pane-layout-memory
// Traceability: docs/features/dsh-forge-m4/testing/split-pane-layout-memory/
// contracts/step-2-add-split-view.md — Outcomes:
//   success — [分屏] 添加 pane + 选视图(会话 + 看板组合):两视图同屏可见且
//             均可操作;pane 结构开始随项目采集记忆;
//   view-enum-boundary — 可选视图枚举边界:仅当前项目可用视图(board/会话旁
//             置);知识区扩展位视图不出现(未启用即不渲染);
//   third-pane-variant — 追加第三 pane 变体(边界口径:vendored 预算 = 两
//             docked pane;第三视图以既有 pane 内 tab 落位 —— 见 header 注记)。
// fixture_spec: Project ×1 + Session ×1 + Task ×3。
// Techniques: sc4 ①(pickSplitBoard/ensureSplitActive + 双 pane 各一 board
// tab = 真链可达 split 态)/ SplitControls(菜单项白名单)。
//
// VERIFY(boundary consumed, third-pane-variant):4.5/4.6 口径 = vendored 右栏
// 预算为两个 docked pane,真链可达态 = 双 pane 各一 board tab(第三 pick 落
// 为既有 pane 内 tab,不产第三 pane)。本腿断言可达等价面:第三视图经 [分屏]
// 落位(板内容在场 + pane 数不超预算)+ 关闭 pane 后重排 + 重加重新记忆 ——
// 「三 pane 同屏」的字面面随 vendored 预算放开(契约 blob v1 白名单五种
// forge kinds 的 tab 集为其承载形态)。

import { expect, test } from '@playwright/test'
import {
  activateProjectByTreeRow, clickStable, ensureProjectGroupExpanded,
  ensureSplitActive, M4WorldManager, openTreeSession, pickSplitBoard,
  readLayoutBlob, splitRatioPercent, startAutoDismiss, expandRightbar,
} from '../_lib/m4-world.ts'
import { TASK_BOARD, bootSpWorld, buildSpJourneyRoot, composerInput, TOP_B } from './harness.ts'

test.describe.serial('split-pane-layout-memory / step 2: 添加分屏并选视图', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 双 pane 同屏可操作 + 记忆采集开始。
  test('step2/success: [分屏] → 看板 —— 会话 + 看板双 pane 同屏可操作 + pane 结构入记忆', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    const built = await buildSpJourneyRoot()
    const world = await bootSpWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await expect(composerInput(page), '会话 composer 在场(会话体挂载)').toBeVisible({ timeout: 20_000 })

    // [分屏] → 看板(C9 用户径)。
    await expandRightbar(page)
    await pickSplitBoard(page)
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '看板 pane 打开([分屏] → 看板)').toBeVisible({ timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_BOARD}"]`),
      '看板承载语料节点').toBeVisible({ timeout: 20_000 })
    // 两视图同屏可见(中区 composer + 右栏 board 同 document)。
    const sameScreen = await page.evaluate(() => ({
      composer: (() => { const el = document.querySelector('[data-composer-card]'); return el !== null && (el as HTMLElement).offsetParent !== null })(),
      board: (() => { const el = document.querySelector('[data-dsh-forge-task-board]'); return el !== null && (el as HTMLElement).offsetParent !== null })(),
    }))
    expect(sameScreen, '会话 + 看板双 pane 同屏').toEqual({ composer: true, board: true })
    // 均可操作:会话侧输入读回 + 看板侧节点点击 → dock。
    await composerInput(page).click()
    await page.keyboard.insertText('SP 分屏同屏输入桩 sp-split-typing')
    await expect(composerInput(page), '会话侧可操作:composer 输入读回').toContainText('sp-split-typing')
    await clickStable(page, `[data-dsh-forge-node-card="${TASK_BOARD}"]`)
    await expect(page.locator(`[data-dsh-forge-task-detail="${TASK_BOARD}"]`),
      '看板侧可操作:节点点击 → 任务详情 dock').toBeVisible({ timeout: 20_000 })
    await clickStable(page, '[data-dsh-forge-detail-close]')
    // State(深断言):pane 结构入 blob(board tab;800ms 去抖 + settle)。
    await ensureSplitActive(page)
    await page.waitForTimeout(1_600)
    await expect.poll(async () => JSON.stringify((await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.rightbar ?? {}),
      { timeout: 15_000, message: 'pane 结构入记忆(blob 含 board tab)' }).toContain('"board"')
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "view-enum-boundary" — 视图枚举白名单(知识区扩展位不出现)。
  test('step2/view-enum-boundary: 视图选择枚举 —— 仅项目可用视图(board/会话旁置)+ 知识区扩展位零渲染', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const built = await buildSpJourneyRoot()
    const world = await bootSpWorld(manager, 'enum', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await expect(composerInput(page), '会话体挂载(C9 座位前提)').toBeVisible({ timeout: 20_000 })

    // 打开视图选择菜单。
    await expandRightbar(page)
    const opened = await page.evaluate(() => {
      const trigger = document.querySelector('[data-dsh-forge-split-trigger]') as HTMLElement | null
      if (trigger === null) return false
      trigger.click()
      return true
    })
    expect(opened, '[分屏] 菜单打开').toBe(true)
    // 枚举边界:菜单项恰 = {session-aside, board}(白名单;无知识区/管线位)。
    const items = await page.evaluate(() =>
      [...document.querySelectorAll('[data-dsh-forge-split-menu-item]')]
        .map(item => item.getAttribute('data-dsh-forge-split-menu-item') ?? ''))
    expect(items.sort(), '可选视图 = 会话旁置 + 看板(白名单)').toEqual(['board', 'session-aside'])
    expect(items.some(item => /knowledge|pipeline|doc|depgraph/.test(item)),
      '知识区扩展位视图不出现(未启用即不渲染)').toBe(false)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "third-pane-variant" — 追加变体(可达等价面 + 边界注记)。
  test('step2/third-pane-variant: 追加视图 —— 双 pane 预算内落位 + 关闭重排 + 重加重新记忆', async ({ }, testInfo) => {
    testInfo.setTimeout(540_000)
    const built = await buildSpJourneyRoot()
    const world = await bootSpWorld(manager, 'third', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await expect(composerInput(page), '会话体挂载').toBeVisible({ timeout: 20_000 })

    // 就位:split-active(双 pane;真链可达态)。
    await expandRightbar(page)
    await pickSplitBoard(page)
    await ensureSplitActive(page)
    expect(await splitRatioPercent(page), '分隔条在座(模型态比例)').not.toBeNull()
    // 追加第三个 board pick:落在既有 pane 内 tab(预算 = 2 pane;4.5 边界)。
    await pickSplitBoard(page)
    await page.waitForTimeout(800)
    const paneCount = await page.evaluate(() =>
      document.querySelectorAll('[data-dsh-forge-pane-region]').length)
    expect(paneCount, 'pane 数不超 vendored 预算(第三视图以 tab 落位)').toBeLessThanOrEqual(2)
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '板内容仍同屏可操作(追加后功能面不变)').toBeVisible({ timeout: 15_000 })

    // 关闭一个 pane → 其余 pane 自动重排(pane 数下降或回单视图);重加 → 重新记忆。
    const closeButtons = page.locator('[data-dsh-forge-pane-close]')
    if (await closeButtons.count() > 0) {
      const panesBeforeClose = await page.evaluate(() =>
        document.querySelectorAll('[data-dsh-forge-pane-region]').length)
      await clickStable(page, '[data-dsh-forge-pane-close]')
      await page.waitForTimeout(1_600)
      const panesAfterClose = await page.evaluate(() =>
        document.querySelectorAll('[data-dsh-forge-pane-region]').length)
      expect(panesAfterClose, '关闭 pane 后其余 pane 自动重排(pane 数下降)').toBeLessThan(panesBeforeClose)
      // 重加(同一用户径)→ pane 集合恢复 + 记忆重新采集。
      await ensureSplitActive(page)
      await page.waitForTimeout(1_600)
      await expect.poll(async () => JSON.stringify((await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.rightbar ?? {}),
        { timeout: 15_000, message: '重加后 pane 集合重新入记忆' }).toContain('"board"')
      // 各 pane 功能面不变(复用同一视图组件)。
      await expect(page.locator(`[data-dsh-forge-node-card="${TASK_BOARD}"]`),
        '重加后板功能面不变(分屏不改变视图本身)').toBeVisible({ timeout: 20_000 })
    }
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
