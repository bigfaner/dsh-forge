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
 * fix-2 增补第二兜底：回放环境实证（bug 4af56ed4 探针）hero 工作区芯片未锚定时行尾
 * 行动点击不物化——先经 hero「选择工作区」picker 选中项目行挂芯片，再点行尾
 * new-session 行动创建活跃会话（bug-hero spec ① 同径：chip 锚定后行行动作 = 活跃会话
 * 创建径；空白会话同样承载 corner 槽），后再等 30s。
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
  // 兜底一：工作区行「在 {name} 新建会话」（DOM 级直点 onClick 载体——候选钮在侧栏行
  // hover 面/裁剪树内，locator 可见性过滤不稳）
  await page
    .evaluate(() => {
      const target = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label]')).find((button) =>
        /在 .+ 新建会话/.test(button.getAttribute('aria-label') ?? ''),
      )
      if (target === undefined) return
      target.click()
    })
    .catch(() => undefined)
  if (
    await page
      .waitForFunction(bound, undefined, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
  )
    return true
  // 兜底二（fix-2）：hero「选择工作区」picker 选中首个项目行挂芯片（run10 探针实证：
  // picker 开 + 行点击命中；芯片锚 = [data-dswt-hero-trigger]，bug-hero spec ① 同径）
  // → 行尾 new-session 行动创建活跃会话（壳顶「新建会话」仅落引导态不绑定——run10 实证；
  // bug-hero spec ①：chip 挂载后行行动作 = 「A 活跃会话」创建径）→ 等绑定。
  await page.locator('button[aria-label="选择工作区"]').first().click({ timeout: 15_000 }).catch(() => undefined)
  await page
    .locator('.dswf-hero-picker-list button, .dswf-hero-picker-list [role="option"]')
    .filter({ hasNotText: '添加项目' })
    .first()
    .click({ timeout: 15_000 })
    .catch(() => undefined)
  await page
    .locator('[data-dswt-hero-trigger]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => undefined)
  await page
    .locator('[data-dswf-project-action="new-session"]')
    .first()
    .click({ timeout: 15_000 })
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
  // fix-2 摘除 fix-1 误判捷径：SIDEBAR_COLLAPSE_BUTTON（aria「收起侧边栏」）= 官方左栏
  // sidebar toggle 词条（anchors.ts 分区口径），与右栏展开态零因果——「暂无会话」态右栏
  // 仍休眠，捷径提前返回致 openOverviewDock 概览入口恒缺席（bug 4af56ed4）。展开判定
  // 只认 RIGHTBAR_COL 可见；不可见即走完整 reveal 径（会话物化兜底 + 展开钮点击）。
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

/** 重复 reveal 轮数（fix-2：入口水化缺席时重走 reveal 物化径——首轮会话竞速败者兜底窗） */
const REVEAL_RETRY = 3

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
  const stripTab = page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '项目概览' }).first()
  const entry = page.locator(RIGHTBAR_COL).locator('button', { hasText: '项目概览' }).first()
  // fix-2 重试形态：reveal 后入口未水化（右栏休眠/零内容——revealRightbar 内会话物化竞速
  // 败者窗）时重走 reveal 物化径再等入口，限 REVEAL_RETRY 轮，取代「仅判右栏展开」的
  // 一次性时序假设。
  for (let attempt = 0; attempt < REVEAL_RETRY; attempt++) {
    await revealRightbar(page)
    const appeared = await stripTab
      .or(entry)
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    if (appeared) break
  }
  await expect(stripTab.or(entry), '右栏 dock 概览入口在场（strip 页签 | guide 入口卡）').toBeVisible({ timeout: 10_000 })
  if ((await stripTab.isVisible().catch(() => false)) === true) {
    await stripTab.click()
  } else {
    await entry.click()
  }
  await expect(page.locator(OV_PANEL).first(), '概览 tab body 挂载（dswf-overview）').toBeVisible({ timeout: 30_000 })
}
