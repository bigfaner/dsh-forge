// hero 面板注册面单测（bug bd544d59 终局形态——7f4901e5 退役补偿可达面后的收敛契约）：
// registerHeroPanelFace main keyed 'dswf-hero' 登记 + fail-soft + ForgeHeroPanel 静态渲染锚。
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HERO_PANEL_KEY, registerHeroPanelFace } from './hero-panel-face.js'
import { ForgeHeroPanel } from './hero/HeroPanel.js'

/** 注册捕获 slots 替身（keyed-section register 面） */
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

describe('registerHeroPanelFace（main keyed dswf-hero 登记）', () => {
	it('登记面：key = dswf-hero、component = ForgeHeroPanel（ui-layout 官方全局面板径）', () => {
		const { slots, calls } = captureSlots()
		expect(registerHeroPanelFace(slots)).toBe(true)
		expect(calls).toHaveLength(1)
		expect(calls[0]!.options['key']).toBe(HERO_PANEL_KEY)
		expect(calls[0]!.component).toBe(ForgeHeroPanel)
	})

	it('注册面 throw → fail-soft 返回 false（单面降级不炸装配）', () => {
		const slots = {
			inject: () => undefined,
			register: () => {
				throw new Error('slots broken')
			},
		}
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		try {
			expect(registerHeroPanelFace(slots as never)).toBe(false)
		} finally {
			warn.mockRestore()
		}
	})
})

describe('ForgeHeroPanel 静态渲染锚', () => {
	it('零项目引导面板载体在座（data-dswf-hero-panel；添加项目 CTA 归宿）', () => {
		const markup = renderToStaticMarkup(<ForgeHeroPanel />)
		expect(markup).toContain('data-dswf-hero-panel')
		expect(markup).toContain('data-dswf-cta="add-project"')
	})
})
