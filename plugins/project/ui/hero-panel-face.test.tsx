// fix-3 A 面（bug bd544d59）RED 锚：hero 空态自判定卷走右栏展开钮（官方宿主 hero 相位
// 会话头缺席 → ExpandButton 载体缺席 → 概览不可达，注册两段实际全在座）。修口断言面：
// heroOpenOverviewOf 无壳缝 + registerHeroPanelFace inject 透传 + HeroPanel 可达面渲染锚。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HERO_PANEL_KEY,
  heroOpenOverviewOf,
  registerHeroPanelFace,
  type SidebarRightOpenTabFace,
} from './hero-panel-face.js'
import { ForgeHeroPanel } from './hero/HeroPanel.js'

/** 注册捕获 slots 替身（inject 直调 cb → register 捕获 options/component） */
function captureSlots() {
  const calls: Array<{ options: Record<string, unknown>; component: unknown }> = []
  const slots = {
    inject: (_key: string, cb: () => (() => void) | undefined) => cb(),
    register: (options: Record<string, unknown>, component: unknown) => {
      calls.push({ options, component })
      return () => {}
    },
  }
  return { slots, calls }
}

const SHELL_GLOBAL = '__DSH_FORGE_HOST_PLUGINS__' as keyof typeof globalThis

function face(openTab?: SidebarRightOpenTabFace['openTab']): SidebarRightOpenTabFace {
  return openTab === undefined ? {} : { openTab }
}

describe('heroOpenOverviewOf（hero 相位右栏可达缝）', () => {
  it('壳宿主（ShellHost 自有右栏缝）→ undefined 不注入（壳 UX 零变化）', () => {
    ;(globalThis as Record<string, unknown>)[SHELL_GLOBAL] = {}
    try {
      expect(heroOpenOverviewOf(() => face(() => {}), true)).toBeUndefined()
    } finally {
      delete (globalThis as Record<string, unknown>)[SHELL_GLOBAL]
    }
  })

  it('无壳官方宿主 → 返回缝；调用即 openTab(dswf-overview)（官方 docked tab 展开列同径）', () => {
    const kinds: string[] = []
    const open = heroOpenOverviewOf(() => face((kind) => { kinds.push(kind) }), false)
    expect(typeof open).toBe('function')
    open!()
    expect(kinds).toEqual(['dswf-overview'])
  })

  it('sidebarRight/openTab 缺席或抛错 → fail-soft 不炸（诚实降级）', () => {
    expect(() => heroOpenOverviewOf(() => undefined, false)!()).not.toThrow()
    expect(() => heroOpenOverviewOf(() => face(() => { throw new Error('x') }), false)!()).not.toThrow()
  })
})

describe('registerHeroPanelFace inject 透传（bug bd544d59）', () => {
  it('无壳：registration 携 inject 工厂 → 产出 { openOverview }；key = dswf-hero', () => {
    const { slots, calls } = captureSlots()
    const ok = registerHeroPanelFace(slots, () => face(() => {}))
    expect(ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.options['key']).toBe(HERO_PANEL_KEY)
    const inject = calls[0]!.options['inject'] as () => Record<string, unknown>
    expect(typeof inject()['openOverview']).toBe('function')
  })

  it('壳全局在场：inject 产出零 openOverview（壳宿主 hero UX 零变化）', () => {
    ;(globalThis as Record<string, unknown>)[SHELL_GLOBAL] = {}
    try {
      const { slots, calls } = captureSlots()
      registerHeroPanelFace(slots, () => face(() => {}))
      const inject = calls[0]!.options['inject'] as () => Record<string, unknown>
      expect(inject()['openOverview']).toBeUndefined()
    } finally {
      delete (globalThis as Record<string, unknown>)[SHELL_GLOBAL]
    }
  })

  it('sidebarRightOf 缺席（调用方不传）→ registration 无 inject（既有签名零变化）', () => {
    const { slots, calls } = captureSlots()
    expect(registerHeroPanelFace(slots)).toBe(true)
    expect(calls[0]!.options['inject']).toBeUndefined()
  })
})

describe('ForgeHeroPanel 可达面渲染锚（bug bd544d59）', () => {
  it('openOverview 在场 → data-dswf-hero-open-overview 锚 + aria-label 官方词（打开右侧边栏）', () => {
    const markup = renderToStaticMarkup(<ForgeHeroPanel openOverview={() => {}} />)
    expect(markup).toContain('data-dswf-hero-open-overview')
    expect(markup).toContain('aria-label="打开右侧边栏"')
    expect(markup).toContain('data-dswf-hero-panel')
  })

  it('openOverview 缺席 → 零可达面锚（壳宿主/缺 face 形态零渲染）', () => {
    const markup = renderToStaticMarkup(<ForgeHeroPanel />)
    expect(markup).not.toContain('data-dswf-hero-open-overview')
    expect(markup).toContain('data-dswf-hero-panel')
  })
})
