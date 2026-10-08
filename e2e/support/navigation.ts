// e2e 向导浏览器导航族（fix-37 ① 收编——dirRow/enterDir ×7 同源拷贝单源）。
// 边界口径（探针 7 实测）：「已注册」标记与目录名零空白拼接（行文本 = "comp-a已注册"），
// 尾界放宽为 空白|行尾|非名字字符（防 'Local' 误中 'LocalLow' 的前缀碰撞保持不变）。
// 5.2 增 dock 导航面：openOverviewDock（右栏官方 guide 入口卡 → 产品概览 tab body 挂载）。
import { expect, type Page } from '@playwright/test'
import { DOCKKIT_STRIP_TAB, OV_PANEL, RIGHTBAR_COLLAPSED, RIGHTBAR_COL } from './anchors.js'

/** 浏览器行定位（名称精确匹配——防前缀碰撞） */
export function dirRow(page: Page, name: string): ReturnType<Page['locator']> {
  return page
    .locator('.dswf-fb-item', { hasText: new RegExp(`(?:^|\\s)${name}(?=\\s|$|[^\\w.-])`) })
    .first()
}

/** 双击进入目录并等待列举就绪（面包屑出现目标段） */
export async function enterDir(page: Page, name: string): Promise<void> {
  await dirRow(page, name).dblclick()
  await expect(page.locator('.dswf-fb-crumb-current')).toHaveText(name, { timeout: 15_000 })
}

/**
 * 右栏展开前置（5.2 实测口径）：零开页签态右栏官方休眠——banner「打开右侧边栏」
 * 钮承载 reveal（aria 文案非 data-* 台账锚，留字面量）。已展开 = 幂等跳过。
 */
export async function revealRightbar(page: Page): Promise<void> {
  if ((await page.locator(RIGHTBAR_COL).first().isVisible().catch(() => false)) === true) return
  const expand = page.locator('button[aria-label="打开右侧边栏"]').first()
  await expect(expand, '右栏休眠态展开钮在场（banner 面）').toBeVisible({ timeout: 30_000 })
  await expand.click()
  await expect(page.locator(RIGHTBAR_COLLAPSED), '右栏展开（休眠标记退场）').toHaveCount(0, { timeout: 30_000 })
  await expect(page.locator(RIGHTBAR_COL).first()).toBeVisible({ timeout: 30_000 })
}

/**
 * 右栏 dock 概览 tab 开启（5.2——M2 dswf-overview body 挂载门）。先 reveal 右栏（休眠
 * 常态）。两入口按在场性择一：
 *   · strip 页签（已开过的概览 tab——reveal 激活，非重开；keyed body 非激活即卸载，
 *     文档 tab 激活期 OV_PANEL 不在场是常态）；
 *   · 官方开始页 guide 入口卡（首开径——产品 sidebarRightTabs.register guide entry
 *     order 0 最前；title = locale『项目概览』——locale 文案非 data-* 台账锚，留字面量）。
 * 已激活（body 在场）= 幂等直接返回。
 * 两入口互斥呈现（tab 已开 = strip 在、guide 卡恒缺席）——reveal 后 strip 水化有时差，
 * 短窗先等其一在场再择一（瞬时 isVisible 会误落 guide 分支 → tab 已开时入口卡 30s 空等
 * ——fix-3 会话行回访后右栏收起再 reveal 的实证形态）。
 */
export async function openOverviewDock(page: Page): Promise<void> {
  if ((await page.locator(OV_PANEL).first().isVisible().catch(() => false)) === true) return
  await revealRightbar(page)
  const stripTab = page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '项目概览' }).first()
  const entry = page.locator(RIGHTBAR_COL).locator('button', { hasText: '项目概览' }).first()
  await expect(stripTab.or(entry), '右栏 dock 概览入口在场（strip 页签 | guide 入口卡）').toBeVisible({ timeout: 10_000 })
  if ((await stripTab.isVisible().catch(() => false)) === true) {
    await stripTab.click()
  } else {
    await entry.click()
  }
  await expect(page.locator(OV_PANEL).first(), '概览 tab body 挂载（dswf-overview）').toBeVisible({ timeout: 30_000 })
}
