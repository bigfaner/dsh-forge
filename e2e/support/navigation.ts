// e2e 向导浏览器导航族（fix-37 ① 收编——dirRow/enterDir ×7 同源拷贝单源）。
// 边界口径（探针 7 实测）：「已注册」标记与目录名零空白拼接（行文本 = "comp-a已注册"），
// 尾界放宽为 空白|行尾|非名字字符（防 'Local' 误中 'LocalLow' 的前缀碰撞保持不变）。
// 5.2 增 dock 导航面：openOverviewDock（右栏官方 guide 入口卡 → 产品概览 tab body 挂载）。
// fix-11 增夹具导航段推导面：pickerStartRoot/fixtureDirSegments——去 ['AppData','Local','Temp']
// %TEMP% 位置假设（fix-10 dispatch TMP 重定向后夹具落 .e2e-tmp，硬编码段恒脱节）。
import { expect, type Page } from '@playwright/test'
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'
import { DOCKKIT_STRIP_TAB, OV_PANEL, RIGHTBAR_COLLAPSED, RIGHTBAR_COL } from './anchors.js'

/**
 * 回退浏览器起始根（host listDir 缺省 = os.homedir() 的 spec 侧镜像）。
 * fix-10 TMP 重定向在期（env 标记随进程树继承）→ 起始根 = 重定向根（launch.ts 同步把宿主
 * USERPROFILE 对齐该根——同盘符可达）；真实终端无标记 → homedir()（行为不变）。
 */
export function pickerStartRoot(): string {
  const redirected = process.env.__E2E_TMP_REDIRECTED__
  return redirected !== undefined && redirected !== '' ? resolve(redirected) : homedir()
}

/**
 * 夹具绝对路径 → picker 导航段序列（自 picker 起始根起算，含夹具目录名自身）。
 * Windows 盘符跨根处理：path.relative 跨盘符返回绝对结果/逃逸上级——回退浏览器无跨盘符
 * 导航面（行双击仅限当前列举子目录），此形 fail-fast 报因（替代 30s dblclick 超时谜团）。
 */
export function fixtureDirSegments(fixtureAbsPath: string, pickerRoot: string): string[] {
  const fixture = resolve(fixtureAbsPath)
  const root = resolve(pickerRoot)
  const rel = relative(root, fixture)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `夹具不在 picker 起始根之下（回退浏览器无法跨盘符导航）：fixture=${fixture} pickerRoot=${root}`,
    )
  }
  return rel.split(/[\\/]+/).filter((segment) => segment !== '')
}

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
 * fix-10 会话绑定收敛门（探针实证——注册与官方会话物化竞速：胜者 ~30s 内
 * data-conversation-content 绑上 data-conversation-session；败者恒 hero/headerSessionless，
 * corner 槽 ExpandButton 无载体恒缺席）。绑定期 15s；缺席则点工作区行「在 {name} 新建会话」
 * 强制物化（空白会话同样承载 corner 槽——probe round0 实证 headerBlank + expand present），
 * 再等 30s。返回绑定是否收敛（调用方自行决定放行语义）。
 */
export async function ensureOfficialSessionBound(page: Page): Promise<boolean> {
  const bound = () =>
    document.querySelector('[data-conversation-content]')?.hasAttribute('data-conversation-session') === true
  if (
    await page
      .waitForFunction(bound, undefined, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
  )
    return true
  // 兜底点击走 DOM 级（候选钮在侧栏行 hover 面/裁剪树内——locator 可见性过滤不稳，
  // evaluate 直点 onClick 载体；命中即 React 合成事件正常触发）
  await page
    .evaluate(() => {
      const target = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label]')).find((button) =>
        /在 .+ 新建会话/.test(button.getAttribute('aria-label') ?? ''),
      )
      if (target === undefined) return
      target.click()
    })
    .catch(() => undefined)
  return page
    .waitForFunction(bound, undefined, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false)
}

/**
 * 右栏展开前置（5.2 实测口径）：零开页签态右栏官方休眠——会话面 corner「打开右侧边栏」
 * 钮承载 reveal（aria 文案非 data-* 台账锚，留字面量）。已展开 = 幂等跳过。
 * fix-7 前置收敛门：展开钮 = 官方 ui-sidebar-right ExpandButton（conversation.session.header
 * .corner 注入——官方会话面板被选中 + 面内有会话才渲染）。全部消费面位于 registerProject
 * 之后（注册成功 → projects 写推送 → 工作台 phase 翻 session → heroPanelDrive
 * selectPanel(null) 官方面板选中）——先等相位驱动收敛再断言展开钮（消除「注册驱动 + 首用
 * 会话面就位」竞态的盲等；门超时静默放行原断言——语义零改，只吃时序）。
 */
export async function revealRightbar(page: Page): Promise<void> {
  if ((await page.locator(RIGHTBAR_COL).first().isVisible().catch(() => false)) === true) return
  await page
    .waitForFunction(
      () => document.querySelector('[data-dswf-workbench]')?.getAttribute('data-dswf-phase') === 'session',
      undefined,
      { timeout: 60_000 },
    )
    .catch(() => undefined)
  // fix-10 收敛门（探针实证——注册与官方会话物化竞速，败者 corner ExpandButton 恒缺席）：
  // 先等官方会话视图绑上会话（绑定期 + 新建会话兜底）再断言展开钮。
  await ensureOfficialSessionBound(page)
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
