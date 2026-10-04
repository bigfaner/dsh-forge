// @feature:dsh-forge-p1-mvp @web-e2e
// fix-40 验收面：Windows 壳标题栏模式激活——preload 标记 html[data-windows-titlebar] +
// 内联 --dsh-windows-titlebar-height → 官方 web 壳补偿全套生效（ui-layout frame
// padding-top/顶部拖拽条、ui-sidebar 折叠钮带区内居中）、会话头右上角图标钮（右栏展开钮）
// 位于原生 WCO 覆盖条之下可点（用户验收 2026-10-05 报障②）。
//
// 事实锚（官方消费面逐点核实，任务 Reference Files）：
//   - 官方补偿面全部只认 data-windows-titlebar（与 data-platform 无关）：
//     ui-layout `[data-windows-titlebar] .pI_x6G_frame{padding-top:var(--dsh-windows-titlebar-height)}`
//     + `:before` 拖拽条（-webkit-app-region:drag）；dockkit 按 documentElement.style 内联
//     读取高度变量；ui-sidebar 折叠钮 position:fixed、top:calc((高-28px)/2)（带区内居中）；
//     settings-account 覆盖层 padding-top
//   - data-platform 刻意不标（fix-40 实测裁决缝，本 spec 负向 pin 守门）：官方
//     dsh-client-shortcuts ShortcutsService 在 runtime=desktop（= dataset.platform 存在，
//     任意值——detectEnvironment 判据）硬性要求 window.dshDesktop.keyboard，缺席即 throw
//     → 25 插件激活级联失败（实测 A/B：标记即 boot 面全红）。dshDesktop 桥在树内无官方
//     实现（keyboard/shortcuts/analytics/chat/settings/…七包消费面）；翻转本断言须随桥落地
//   - ui-sidebar-right ExpandButton：[data-sidebar-right-expand]、aria「打开右侧边栏」、
//     Tooltip「打开侧边栏」（delayMs 500）、动作 = setExpanded(true)
// 平台门：本任务 Windows 主战场（WCO 标记/几何仅 win32 载体成立）；darwin 分支静态保证
// （preload-api 单测），e2e 不在非 win32 载体跑。
// 隔离：独立 userData + 端口分配器（e2e 单实例纪律）；载体面经 e2e/support（fix-37）。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost } from '../../support/launch.js'
import { registerProject } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import {
  CONVERSATION_HEADER,
  RIGHTBAR_COLLAPSED,
  SIDEBAR_COLLAPSE_BUTTON,
  SIDEBAR_RIGHT_EXPAND,
  WORKBENCH,
} from '../../support/anchors.js'

test.skip(process.platform !== 'win32', 'fix-40 Windows 主战场——WCO 标记/补偿几何断言仅 win32 载体成立')

/** WCO 覆盖条高度（宿主-壳单源刻度：apps/host/src/window/titlebar.ts = create.ts overlay.height） */
const WCO_BAND_PX = 32

// ─────────────────────────────────────────────────────────────────────────────
// AC「标记 + 补偿面」：preload 标记在场 + 官方 frame padding/拖拽条 + 折叠钮带区内居中
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp windows-titlebar·标记面：html 标记 + frame 补偿 + 折叠钮带区内居中', async () => {
  test.setTimeout(240_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-wtb-'))
  const { app, page, pageErrors } = await launchHost({ userData })
  try {
    // ① preload 标记（顶层即标——早于 React 渲染，直接读即得）
    const marks = await page.evaluate(() => ({
      platform: document.documentElement.dataset.platform,
      hasTitlebar: document.documentElement.hasAttribute('data-windows-titlebar'),
      inlineVar: document.documentElement.style.getPropertyValue('--dsh-windows-titlebar-height'),
    }))
    expect(marks.hasTitlebar, 'data-windows-titlebar 在场（官方补偿面激活开关）').toBe(true)
    expect(marks.inlineVar, '内联 --dsh-windows-titlebar-height=32px（dockkit 按 documentElement.style 内联读取）').toBe('32px')
    // 负向 pin（裁决缝守门）：data-platform 缺席 = runtime 保持 web——标记前须先落 dshDesktop 桥
    expect(marks.platform, 'data-platform 刻意不标（dshDesktop 桥缺席——标记即 ShortcutsService 硬断）').toBeUndefined()

    // ② 官方 frame 补偿：整帧内容下压 32px（padding-top）+ 顶部拖拽条（:before drag）
    // frame = 官方 AppFrame 根（缺省右栏收起态承载 data-rightbar-collapsed；类名兜底并行）
    const frameGeo = await page.evaluate(() => {
      const frame = document.querySelector('[data-rightbar-collapsed]') ?? document.querySelector('.pI_x6G_frame')
      if (frame === null) return null
      const cs = getComputedStyle(frame)
      const before = getComputedStyle(frame, '::before')
      return { paddingTop: cs.paddingTop, dragRegion: before.getPropertyValue('-webkit-app-region') }
    })
    expect(frameGeo, '官方 AppFrame frame 在场').not.toBeNull()
    expect(frameGeo?.paddingTop, 'frame padding-top=32px（整帧内容让出原生钮带区）').toBe(`${WCO_BAND_PX}px`)
    expect(frameGeo?.dragRegion, 'frame :before 拖拽条（顶部空白带可拖窗）').toBe('drag')

    // ③ 官方侧栏折叠钮：32px 带区内垂直居中（fixed 定位公式 top=calc((32-28)/2)=2px）
    const toggle = page.locator(SIDEBAR_COLLAPSE_BUTTON).first()
    await expect(toggle, '官方折叠钮在场（windows-titlebar 模式 fixed 定位）').toBeVisible({ timeout: 30_000 })
    const toggleGeo = await page.evaluate((selector: string) => {
      const el = document.querySelector(selector)
      if (el === null) return null
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return { position: cs.position, y: rect.y, height: rect.height }
    }, SIDEBAR_COLLAPSE_BUTTON)
    expect(toggleGeo, '折叠钮几何可读').not.toBeNull()
    expect(toggleGeo?.position, '折叠钮 position=fixed（官方 windows-titlebar 模式）').toBe('fixed')
    expect(toggleGeo?.y, '折叠钮在带区内（y ≥ 0——不沉出上边界）').toBeGreaterThanOrEqual(0)
    expect(
      (toggleGeo?.y ?? 0) + (toggleGeo?.height ?? 0),
      `折叠钮整钮在带区内（y+高 ≤ ${WCO_BAND_PX}px——垂直居中不越带）`,
    ).toBeLessThanOrEqual(WCO_BAND_PX)

    // 运行时元断言（台账 L824 口径：pageerror 面）
    expect(pageErrors, '无页面 JS 错误（pageerror 面）').toEqual([])
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC「会话头右上角图标钮」：会话相位会话头整行在位——右栏展开钮 y ≥ 32（原生钮带区之下）、
// tooltip 正常、可点（点击 → 官方右栏展开）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp windows-titlebar·会话面：右栏展开钮位于 WCO 带区之下且 tooltip/点击正常', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-wtb2-'))
  const wsDir = join(fixtureRoot, 'wtb-demo')
  mkdirSync(join(wsDir, '.knowledge'), { recursive: true })
  writeFileSync(join(wsDir, 'fixture-file.txt'), 'sentinel', 'utf8')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-wtb2-ud-'))
  const { app, page, pageErrors } = await launchHost({ userData, stablePhase: 'none' })
  try {
    // 前置：RPC 直注项目 → 会话相位（官方会话头/右栏展开钮渲染相位）
    await registerProject(page, wsDir, 'wtb-demo')
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await page.waitForTimeout(3_000) // 收敛窗（安装/首启 kit 收敛——hero-control 同径）

    // 会话头整行在位（官方 ConversationHeader 渲染点；槽壳 display:contents 零盒——
    // 几何断言锚官方头内容行 .wSkVaW_header，类名锚 = 官方模块 CSS 稳定前缀，升级窗口对照面）
    await expect(page.locator(CONVERSATION_HEADER).first(), '官方会话头在场').toBeAttached({ timeout: 30_000 })
    const headerY = await page.evaluate(() => {
      const el = document.querySelector('.wSkVaW_header')
      return el === null ? null : Math.round(el.getBoundingClientRect().y)
    })
    expect(headerY, `会话头整行让出原生钮带区（y ≥ ${WCO_BAND_PX}px）`).toBeGreaterThanOrEqual(WCO_BAND_PX)

    // 右栏展开钮（corner ExpandButton——报障②主落点）：带区之下 + 可见
    const expand = page.locator(SIDEBAR_RIGHT_EXPAND).first()
    await expect(expand, '右栏展开钮在场（右栏收起态 corner 槽）').toBeVisible({ timeout: 30_000 })
    const box = await expand.boundingBox()
    expect(box, '展开钮几何可读').not.toBeNull()
    expect(box!.y, `展开钮位于原生 WCO 覆盖条之下（y ≥ ${WCO_BAND_PX}px——不再沉入 32px 白条）`).toBeGreaterThanOrEqual(WCO_BAND_PX)

    // tooltip 正常（官方 Tooltip delayMs 500——悬停后浮现「打开侧边栏」）
    await expand.hover()
    await expect(
      page.locator('[role="tooltip"]', { hasText: '打开侧边栏' }).first(),
      '悬停 tooltip 浮现（chrome.expand 词条）',
    ).toBeVisible({ timeout: 10_000 })

    // 可点：点击 → 官方右栏展开（frame 收起标记退场——smoke L59 同径）
    await expand.click()
    await expect(page.locator(RIGHTBAR_COLLAPSED), '点击展开钮 → 官方右栏展开（收起标记退场）').toHaveCount(0, { timeout: 15_000 })

    // 运行时元断言（pageerror 面）
    expect(pageErrors, '无页面 JS 错误（pageerror 面）').toEqual([])
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})
