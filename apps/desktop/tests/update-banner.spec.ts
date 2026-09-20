// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../src/shell-ui/update-banner.js'

// UF3 update banner (task 5.1) — mock-IPC unit tests against the
// globalThis.__DSH_FORGE_UPDATE_BANNER__ factory (plain classic script,
// same artifact concatenated into dist/shell-ui.js).
//
// Contract: tech-design Data Models (UpdateBannerState four-phase legal
// transitions, dismissed terminal) + ui-design §更新提示横幅 (aria, toast
// geometry, Esc-inside-banner, reduced motion, no auto-dismiss).

type Phase = 'hidden' | 'queued' | 'shown' | 'dismissed'

function factory() {
  const creator = (globalThis as Record<string, unknown>).__DSH_FORGE_UPDATE_BANNER__ as {
    create: (opts: Record<string, unknown>) => {
      applyState: (next: { phase: Phase; version?: string }) => { phase: Phase; version?: string }
      getState: () => { phase: Phase; version?: string }
      element: () => HTMLElement | null
      destroy: () => void
    }
  }
  if (creator === undefined) throw new Error('update-banner factory missing')
  return creator
}

function makeBridge() {
  return {
    update: {
      dismiss: vi.fn<() => void>(),
      openRelease: vi.fn<() => void>(),
    },
  }
}

function mount(opts: Record<string, unknown> = {}) {
  const root = document.createElement('div')
  document.body.append(root)
  const bridge = makeBridge()
  const banner = factory().create({ document, root, dshForge: bridge, ...opts })
  return { banner, root, bridge }
}

const cssOf = (): string => {
  const style = document.getElementById('dsh-forge-update-banner-style')
  return style?.textContent ?? ''
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

describe('UpdateBannerState four-phase transitions', () => {
  it('hidden→shown directly (no mask, F4-D2) renders the banner', () => {
    const { banner, root } = mount()
    expect(banner.getState().phase).toBe('hidden')
    expect(banner.element()).toBeNull()
    banner.applyState({ phase: 'shown', version: 'v0.2.0' })
    expect(banner.getState()).toEqual({ phase: 'shown', version: 'v0.2.0' })
    expect(root.contains(banner.element())).toBe(true)
  })

  it('hidden→queued→shown defers rendering until the mask closes', () => {
    const { banner } = mount()
    banner.applyState({ phase: 'queued', version: 'v0.2.0' })
    expect(banner.getState().phase).toBe('queued')
    expect(banner.element()).toBeNull()
    banner.applyState({ phase: 'shown' })
    expect(banner.getState().phase).toBe('shown')
    expect(banner.element()).not.toBeNull()
    expect(banner.element()?.textContent).toContain('v0.2.0')
  })

  it('shown→dismissed removes the UI and latches terminally', () => {
    const { banner, root } = mount()
    banner.applyState({ phase: 'shown', version: 'v0.2.0' })
    banner.applyState({ phase: 'dismissed' })
    expect(banner.getState().phase).toBe('dismissed')
    expect(banner.element()).toBeNull()
    expect(root.childElementCount).toBe(0)
    // Terminal: a later update-available push must not resurrect the banner.
    banner.applyState({ phase: 'shown', version: 'v0.3.0' })
    expect(banner.getState().phase).toBe('dismissed')
    expect(banner.element()).toBeNull()
  })

  it('queued→dismissed is legal (mask closed with a pending banner)', () => {
    const { banner } = mount()
    banner.applyState({ phase: 'queued', version: 'v0.2.0' })
    banner.applyState({ phase: 'dismissed' })
    expect(banner.getState().phase).toBe('dismissed')
    banner.applyState({ phase: 'shown' })
    expect(banner.getState().phase).toBe('dismissed')
  })

  it('rejects illegal transitions (shown→queued, shown→hidden, hidden→dismissed)', () => {
    const { banner } = mount()
    banner.applyState({ phase: 'shown', version: 'v0.2.0' })
    banner.applyState({ phase: 'queued' })
    expect(banner.getState().phase).toBe('shown')
    expect(banner.element()).not.toBeNull()
    banner.applyState({ phase: 'hidden' })
    expect(banner.getState().phase).toBe('shown')

    const second = mount()
    second.banner.applyState({ phase: 'dismissed' })
    expect(second.banner.getState().phase).toBe('hidden')
  })

  it('no UI for up-to-date / unavailable (stays hidden silently)', () => {
    const { banner } = mount()
    banner.applyState({ phase: 'hidden' })
    expect(banner.getState().phase).toBe('hidden')
    expect(banner.element()).toBeNull()
  })
})

describe('user actions', () => {
  it('✕ closes, invokes the dismiss verb, and never reappears this run', () => {
    const { banner, bridge } = mount()
    banner.applyState({ phase: 'shown', version: 'v0.2.0' })
    const close = banner.element()?.querySelector<HTMLButtonElement>('.dfw-banner-close')
    expect(close?.getAttribute('aria-label')).toBe('关闭更新提示')
    close?.click()
    expect(bridge.update.dismiss).toHaveBeenCalledTimes(1)
    expect(banner.getState().phase).toBe('dismissed')
    banner.applyState({ phase: 'shown', version: 'v0.9.0' })
    expect(banner.element()).toBeNull()
  })

  it('Esc closes while focus is inside the banner', () => {
    const { banner, bridge } = mount()
    banner.applyState({ phase: 'shown', version: 'v0.2.0' })
    const el = banner.element() as HTMLElement
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    el.dispatchEvent(esc)
    expect(banner.getState().phase).toBe('dismissed')
    expect(bridge.update.dismiss).toHaveBeenCalledTimes(1)
  })

  it('Esc outside the banner does not close it', () => {
    const { banner, bridge } = mount()
    banner.applyState({ phase: 'shown', version: 'v0.2.0' })
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(banner.getState().phase).toBe('shown')
    expect(bridge.update.dismiss).not.toHaveBeenCalled()
  })

  it('「查看发布页」invokes openRelease and dismisses for this run', () => {
    const { banner, bridge } = mount()
    banner.applyState({ phase: 'shown', version: 'v0.2.0' })
    const view = banner.element()?.querySelector<HTMLButtonElement>('.dfw-banner-btn')
    expect(view?.textContent).toBe('查看发布页')
    view?.click()
    expect(bridge.update.openRelease).toHaveBeenCalledTimes(1)
    expect(banner.getState().phase).toBe('dismissed')
    expect(banner.element()).toBeNull()
  })

  it('does not auto-dismiss: the banner stays until a user action (SC6)', () => {
    const { banner } = mount()
    banner.applyState({ phase: 'shown', version: 'v0.2.0' })
    expect(banner.element()).not.toBeNull()
    expect(banner.getState().phase).toBe('shown')
  })
})

describe('aria and geometry tokens (ui-design §UF3 / DESIGN.md)', () => {
  it('exposes role=status, aria-live=polite, tab order, and labeled buttons', () => {
    const { banner } = mount()
    banner.applyState({ phase: 'shown', version: 'v0.2.0' })
    const el = banner.element() as HTMLElement
    expect(el.getAttribute('role')).toBe('status')
    expect(el.getAttribute('aria-live')).toBe('polite')
    expect(el.tabIndex).toBe(0)
    const icon = el.querySelector('.dfw-banner-icon')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(el.textContent).toContain('新版本')
    expect(el.textContent).toContain('v0.2.0')
    expect(el.textContent).toContain('可用')
  })

  it('uses the toast geometry: top 40px, r14, pad 12 16, min(640px,100vw-48px), z1100, pointer-events auto', () => {
    const { banner } = mount()
    banner.applyState({ phase: 'shown', version: 'v0.2.0' })
    const css = cssOf()
    expect(css).toContain('top:40px')
    expect(css).toContain('padding:12px 16px')
    expect(css).toContain('border-radius:14px')
    expect(css).toContain('max-width:min(640px,calc(100vw - 48px))')
    expect(css).toContain('z-index:1100')
    expect(css).toContain('pointer-events:auto')
  })

  it('uses --dsw-alias semantic tokens (light/dark via body attribute) and brand-blue icon', () => {
    const { banner } = mount()
    banner.applyState({ phase: 'shown', version: 'v0.2.0' })
    const css = cssOf()
    expect(css).toContain('var(--dsw-alias-bg-layer-2')
    expect(css).toContain('var(--dsw-alias-label-primary')
    expect(css).toContain('var(--dsw-alias-link')
    expect(css).toContain('var(--dsw-alias-interactive-bg-hover')
    expect(css).not.toContain('--dsw-static-')
  })

  it('entrance is 160ms cubic-bezier(0.4,0,0.2,1); reduced motion degrades to a 100ms fade-only', () => {
    const plain = mount()
    plain.banner.applyState({ phase: 'shown', version: 'v0.2.0' })
    expect(plain.banner.element()?.dataset.reducedMotion).toBeUndefined()
    expect(cssOf()).toContain('160ms cubic-bezier(0.4,0,0.2,1)')

    const reduced = mount({ matchMedia: () => ({ matches: true }) })
    reduced.banner.applyState({ phase: 'shown', version: 'v0.2.0' })
    expect(reduced.banner.element()?.dataset.reducedMotion).toBe('true')
    const css = cssOf()
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('100ms')
    expect(css).toContain('@keyframes dfw-banner-in-reduced{from{opacity:0}to{opacity:1}}')
  })
})
