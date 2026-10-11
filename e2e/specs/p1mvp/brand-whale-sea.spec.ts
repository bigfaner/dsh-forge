// @feature:dsh-forge-p1-mvp @web-e2e
// fix-38 ②：「鲸游书海」对话面板书海背景——双主题在场 + 指针穿透断言。断言源 = fix-38
// 任务②验收 + docs/brand/README.md「鲸游书海」节。
//
// 裁决沿革（fix-7 断言随行迁移记账——brand.css 头注同源）：v3 书海纹理（whale-sea-bg
// ink/paper 双资产 ::before、仅 active 相位、hero/召回/轨迹红线退场）经 2026-10-06 用户
// 裁决退役为历史档——现行 = 「鲸游书海」统一插画 whale-hero-bg.svg ::after **全相位全
// 视图常驻**（hero 空态 .88 完整档 / active·轨迹·召回 .4 可读性压画档；顶部 mask 渐隐；
// 主题跟随 = body[data-ds-dark-theme] → filter 提亮去饱和——资产互换退役）。本 spec 断言
// 面随行迁移：① hero 相位红线 → hero 档在场（.88 完整插画——裁决反转记账，原红线语义被
// 裁决显式取代）；② active 模拟面 → ::after 统一资产 + 穿透/层序守护（原位保留）；
// ③ 主题跟随 → filter 双向翻转（原双资产互换的面语义）；④⑤ 指针穿透/视图退场规则原样。
//
// 载体说明（无凭据环境）：active 相位会话不可达（blank 会话恒 hero 相位——官方相位机
// settling→hero|active），active 视觉态经官方 DOM 契约属性（data-content-phase / 根
// data-phase）直接模拟：被测面 = 产品 CSS 锚（官方 DOM 契约属性即状态载体），真实
// active 相位下的在场断言由 session-workbench 冒烟（dogfood）承载。
// 双主题口径 = body[data-ds-dark-theme]（官方 ui-theme 布尔标记——应用内主题；官方
// 缺省 preference=system 随 OS，故断言前显式控制标记而非假设浅色）。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../../support/launch.js'
import { registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import {
  COMPOSER_INPUT,
  COMPOSER_SEAT,
  CONVERSATION_CONTENT,
  CONVERSATION_SCROLL,
  WORKBENCH,
} from '../../support/anchors.js'

/** 覆层计算样式读取（content 锚 [data-conversation-content]::after——统一插画 CSS 锚面） */
function readOverlay(page: Page): Promise<{
  phase: string | null
  bg: string
  pointerEvents: string
  opacity: string
  zIndex: string
  position: string
  filter: string
} | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-conversation-content]')
    if (el === null) return null
    const cs = window.getComputedStyle(el, '::after')
    return {
      phase: el.getAttribute('data-content-phase'),
      bg: cs.backgroundImage,
      pointerEvents: cs.pointerEvents,
      opacity: cs.opacity,
      zIndex: cs.zIndex,
      position: cs.position,
      filter: cs.filter,
    }
  })
}

test('@web-e2e @p1mvp brand·书海背景：双主题在场 + hero/召回轨迹红线 + 指针穿透', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-brand-'))
  mkdirSync(join(fixtureRoot, 'brand-demo'), { recursive: true })
  writeFileSync(join(fixtureRoot, 'brand-demo', 'fixture-file.txt'), 'sentinel', 'utf8')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-brand-ud-'))
  const { app, page } = await launchHost({ userData })
  try {
    await registerProject(page, join(fixtureRoot, 'brand-demo'), 'brand-demo')
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await page.waitForTimeout(3_000)
    // blank 会话（芯片流）→ 官方会话面在场（hero 相位）
    await selectWorkspaceViaChip(page, 'brand-demo')
    const conversation = page.locator(CONVERSATION_CONTENT).first()
    await expect(conversation, '官方会话面在场').toBeAttached()
    await expect(
      page.locator(CONVERSATION_SCROLL).first(),
      '官方滚动容器在场（书海背景 CSS 锚宿主）',
    ).toBeAttached()

    // ── ① hero 相位（裁决反转记账）：hero 空态 = 完整插画档（.88——原 v3「不铺底」红线
    // 被 2026-10-06 统一插画裁决显式取代，hero 在场即新契约） ──
    await expect(conversation, 'blank 会话 = hero 相位（官方相位机）').toHaveAttribute(
      'data-content-phase',
      'hero',
      { timeout: 30_000 },
    )
    let overlay = await readOverlay(page)
    expect(overlay?.bg, 'hero 相位书海插画在场（统一插画全相位常驻——hero 完整档）').toContain('whale-hero-bg.svg')
    expect(
      Number.parseFloat(overlay?.opacity ?? '0'),
      'hero 档 = 完整插画透明度（brand.css .88）',
    ).toBeCloseTo(0.88, 5)

    // ── ② active 相位（官方 DOM 契约属性模拟）：插画常驻 + 可读性压画档/穿透守护面 ──
    // 先钉浅色基线（官方缺省 preference=system 随 OS——显式摘除暗色标记，不假设浅色）
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
    await page.evaluate(() => {
      const el = document.querySelector('[data-conversation-content]')
      el?.setAttribute('data-content-phase', 'active')
      // 官方 active 层序同态（根 data-phase——composer 座 z7 规则宿主）
      el?.closest('[data-phase]')?.setAttribute('data-phase', 'active')
    })
    overlay = await readOverlay(page)
    expect(overlay?.bg, 'active 相位书海插画在场（统一插画——浅色缺省）').toContain('whale-hero-bg.svg')
    expect(overlay?.position).toBe('absolute')
    expect(overlay?.pointerEvents, '覆层不拦截指针（pointer-events:none）').toBe('none')
    expect(
      Number.parseFloat(overlay?.opacity ?? '1'),
      'active 档可读性总守护：CSS opacity ≤ .85（非 hero 压画档 .4——文本清晰度优先）',
    ).toBeLessThanOrEqual(0.85)
    // 宿主栈上下文 + 覆层沉底（「正文/输入层在覆层之上」官方层序结构性承载）
    expect(
      await page.evaluate(() => getComputedStyle(document.querySelector('[data-conversation-content]')!).isolation),
      '插画宿主栈上下文（isolation:isolate——z-index:-1 生效前提）',
    ).toBe('isolate')
    expect(overlay?.zIndex, '插画沉底（z-index:-1——正文/输入卡恒在其上）').toBe('-1')
    // 正文/输入层在覆层之上（官方 DOM 层序验证）：composer 座 sticky z7（官方 active 规则）> 覆层 -1
    const seatZ = await page.evaluate(() => {
      const seat = document.querySelector('[data-composer-seat]')
      return seat === null ? null : Number.parseInt(window.getComputedStyle(seat).zIndex, 10)
    })
    expect(seatZ, '官方 composer 座在场（层序对照面）').not.toBeNull()
    expect(seatZ as number, 'composer 座 z 序 > 覆层（输入区不受背景污染）').toBeGreaterThan(
      Number.parseInt(overlay?.zIndex ?? '0', 10),
    )
    // 资产可达：统一插画经 dsh-forge://app/ 根服务（vite public 物化面；v3 ink/paper 双资产
    // 退役存档不删——服务面契约只对现行资产断言）
    for (const asset of ['whale-hero-bg.svg']) {
      const fetched = await page.evaluate(async (name: string) => {
        const res = await fetch(`/brand/${name}`)
        return { status: res.status, head: (await res.text()).slice(0, 120) }
      }, asset)
      expect(fetched.status, `资产可达（${asset}）`).toBe(200)
      expect(fetched.head).toContain('<svg')
    }

    // ── ③ 应用内主题即时跟随：body[data-ds-dark-theme] 翻转 → filter 提亮层（裁决沿革：
    // v3 资产互换 paper/ink 退役——主题层现为 filter 提亮去饱和，应用内口径不变） ──
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
    overlay = await readOverlay(page)
    expect(overlay?.filter, '深色主题 = 插画提亮层在场（应用内主题口径——filter 承载）').toContain('brightness')
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
    overlay = await readOverlay(page)
    expect(overlay?.filter, '摘除暗色标记即回（提亮层退场——即时跟随）').not.toContain('brightness')

    // ── ④ 指针穿透：覆层在场时交互零阻挡（composer 可聚焦 + elementFromPoint 命中真实元素） ──
    const composer = page.locator(COMPOSER_INPUT).last()
    await composer.click()
    const focused = await page.evaluate(() => {
      const el = document.activeElement
      return el !== null && (el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true')
    })
    expect(focused, '覆层在场时 composer 仍可聚焦（交互零阻挡实证）').toBe(true)
    const hit = await page.evaluate(() => {
      const el = document.querySelector('[data-conversation-scroll]')
      if (el === null) return null
      const rect = el.getBoundingClientRect()
      const target = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + Math.min(rect.height / 2, 200),
      )
      return target === null ? null : target.tagName
    })
    expect(hit, 'elementFromPoint 命中真实元素（伪元素不可命中 + 覆层指针穿透）').toBeTruthy()

    // ── ⑤ 召回/轨迹红线（规则面）：:has 退场规则在页样式表在场（视图面行为归 dogfood 冒烟） ──
    const optOutRules = await page.evaluate(() => {
      let found = 0
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: ArrayLike<CSSRule> | undefined
        try {
          rules = sheet.cssRules
        } catch {
          continue // 跨源样式表（注入面）不可读——跳过
        }
        if (rules === undefined) continue
        for (const rule of Array.from(rules)) {
          if (rule.cssText.includes('[data-dswf-pane=recall') || rule.cssText.includes('[data-trajectory-scroll]')) {
            found += 1
          }
        }
      }
      return found
    })
    expect(optOutRules, '召回/轨迹视图退场规则在场（红线②：仅会话滚动容器）').toBeGreaterThan(0)

    // composer 座锚在场性（层序对照面）终检——官方 DOM 契约不因属性模拟而漂移
    await expect(page.locator(COMPOSER_SEAT).first()).toBeAttached()
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})
