// @proposal:expert-squad @web-e2e
// bug 25c91ebd 回归 e2e：详情 Dialog 内工具白名单 MultiSelect 展开菜单曾被
// .dswf-dlg-body overflow:auto 裁切（真机截图实证，edit/bash 不可见）。
// 修法 = 菜单 position:fixed 视口锚定（mselMenuPlacement 坐标），允许溢出 Dialog
// 视觉范围。断言径 = 真机 hit-test：菜单纵向逐采样点 elementFromPoint 须命中原菜单
// （getBoundingClientRect 不反映裁切，hit-test 才是裁切事实面）+ 菜单完整落在视口内。
//
// Hard Rules：零产品源码改动（断言失败 → 判定归属：实现缺陷回本特性语义、锚面缺陷本任务
// 修锚）；夹具 = 仓内 dsh-forge 工作区（code-reviewer 内置档案 origin=plugin 在场）；
// 实跑前无活跃 dsh-forge Electron 实例（单实例锁坑）；零真实模型凭据。

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../support/launch.js'
import { ensureNoBlockingDialog } from '../support/modals.js'
import { rmDirBestEffort } from '../support/cleanup.js'
import { registerProject, selectWorkspaceViaChip } from '../support/rpc.js'

/** 菜单纵向 hit-test 采样：每个采样点 elementFromPoint 须落在菜单内（含子孙）。 */
function menuHitTest(
  page: Page,
  selector: string,
): Promise<{ clipped: number; samples: number; misses: string[]; rect: Record<string, number> }> {
  return page.evaluate((sel) => {
    const menu = document.querySelector(sel)
    if (!(menu instanceof HTMLElement)) throw new Error(`菜单缺席：${sel}`)
    const rect = menu.getBoundingClientRect()
    let clipped = 0
    let samples = 0
    const misses: string[] = []
    for (let y = rect.top + 2; y <= rect.bottom - 2; y += 6) {
      samples += 1
      const hit = document.elementFromPoint(rect.left + rect.width / 2, y)
      if (!(hit instanceof Node && menu.contains(hit))) {
        clipped += 1
        const tag =
          hit instanceof Element
            ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 60)}`
            : 'null'
        misses.push(`y=${Math.round(y)}→${tag}`)
      }
    }
    return {
      clipped,
      samples,
      misses,
      rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
    }
  }, selector)
}

test('@web-e2e @expert-squad bug 25c91ebd 回归：详情 Dialog msel 展开菜单不被 Dialog overflow 裁切（fixed 视口锚定，真机 hit-test）', async () => {
  test.setTimeout(420_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-xs-msel-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', collectConsole: true })
  const { app, page, pageErrors } = launched
  try {
    await ensureNoBlockingDialog(page)
    // 注册 dsh-forge 工作区（code-reviewer 内置档案 origin=plugin 在场）
    await registerProject(page, 'Z:/project/dsh/dsh-forge', 'dsh-forge')
    await selectWorkspaceViaChip(page, 'dsh-forge')
    // 打开专家团面板（侧栏 panellist 字形「专家团」）
    await page.getByText('专家团', { exact: true }).first().click()
    const panel = page.locator('[data-dswf-expert-panel]')
    await expect(panel, '专家团面板挂载').toBeVisible({ timeout: 30_000 })
    // 打开 code-reviewer 详情 Dialog → 编辑态
    await page.locator('[data-dswf-xcard], .dswf-xcard').filter({ hasText: 'code-reviewer' }).first().click()
    const dialog = page.locator('[data-dswf-detail-dialog] [role="dialog"]')
    await expect(dialog, '详情 Dialog 开出').toBeVisible()
    await dialog.getByRole('button', { name: '编辑' }).click()
    // 滚动 Dialog body：把工具 msel box 推到 Dialog body 可视下缘（复现裁切位的最大化）
    const box = dialog.locator('[data-msel="tools"]')
    await box.scrollIntoViewIfNeeded()
    await box.evaluate((el) => {
      const scroller = el.closest('.dswf-dlg-body')
      if (scroller instanceof HTMLElement) scroller.scrollTop = scroller.scrollHeight
    })
    await box.scrollIntoViewIfNeeded()
    // 展开菜单
    await box.locator('.dswf-msel-box').click()
    const menu = dialog.locator('[data-msel-menu="tools"]')
    await expect(menu, '工具白名单菜单展开').toBeVisible()
    // fixed 坐标经 effect→setState 应用（一帧后收敛）——等内联 style 在场再断言
    await expect
      .poll(() => menu.getAttribute('style') ?? '', 'fixed 定位坐标收敛（内联 style 在场）')
      .toContain('left')
    // 真机取证截图（菜单展开 + fixed 定位收敛态；归档任务日志，不进 git）
    await page
      .screenshot({
        path: 'D:\\software\\dsh-forge\\data\\forge-workspaces\\Z-project-dsh-dsh-forge@dadf6b04\\logs\\expert-squad\\1.62\\001-msel-dialog-clip\\e2e-msel-open-fixed.png',
        timeout: 20_000,
        animations: 'disabled',
        caret: 'hide',
      })
      .catch(() => undefined) // 取证尽力而为（electron 截图偶发挂起不阻塞断言链）
    // ① 裁切事实面：菜单纵向 hit-test 零逃逸（被 overflow 裁切则采样点命中别处）
    const hit = await menuHitTest(page, '[data-msel-menu="tools"]')
    expect(hit.samples, 'hit-test 采样非空').toBeGreaterThan(3)
    expect(hit.clipped, '菜单纵向采样全数命中原菜单（零裁切逃逸）').toBe(0)
    // ② 菜单完整落在视口内（fixed 视口锚定——不溢出浏览器视口）
    const inViewport = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0
    })
    expect(inViewport, '菜单底边在视口内（完整可见）').toBe(true)
    // ③ 浮动越场正证：菜单矩形越过 box 所属 field 容器边界（浮动于 Dialog 后续内容之上，
    //    而非被约束在字段行内）——fixed 脱离 body 裁切上下文的形态面
    const floating = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const field = el.closest('.dswf-dlg-field')
      if (!(field instanceof HTMLElement)) return false
      const f = field.getBoundingClientRect()
      return r.top < f.bottom && r.height > 0 && (r.top < f.top || r.bottom > f.bottom)
    })
    expect(floating, '菜单矩形越出所属 field 容器边界（越场浮动在场）').toBe(true)
    // 全程零 renderer 未捕获异常
    expect(pageErrors, `renderer 异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(userData)
  }
})
