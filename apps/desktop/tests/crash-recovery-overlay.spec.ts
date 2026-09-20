// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../src/shell-ui/crash-recovery.js'

// UF4 crash-recovery overlay (task 5.2) — mock-IPC unit tests against the
// globalThis.__DSH_FORGE_CRASH_RECOVERY__ factory (plain classic script,
// concatenated after update-banner.js into dist/shell-ui.js).
//
// Contract: tech-design Interface 2 (RecoveryState five states, failed
// terminal, no regression) + ui-design §Component 宿主崩溃恢复覆盖层
// (state→visual mapping, focus trap, Esc/mask do not close, failed-state
// reason block ≤120 chars / max-height 96px inner scroll, restart button,
// recovered → close + toast 已恢复最近会话, z1200, modal geometry).

type RecoveryState = 'idle' | 'restarting' | 'restoring' | 'recovered' | 'failed'

interface OverlayHandle {
  applyState: (next: { state: RecoveryState; reason?: string }) => { state: RecoveryState }
  getState: () => { state: RecoveryState }
  element: () => HTMLElement | null
  destroy: () => void
}

function factory() {
  const creator = (globalThis as Record<string, unknown>).__DSH_FORGE_CRASH_RECOVERY__ as {
    create: (opts: Record<string, unknown>) => OverlayHandle
  }
  if (creator === undefined) throw new Error('crash-recovery factory missing')
  return creator
}

function makeBridge() {
  return {
    recovery: {
      restartApp: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      getState: vi.fn<() => Promise<RecoveryState>>().mockResolvedValue('idle'),
    },
  }
}

function mount(opts: Record<string, unknown> = {}) {
  const root = document.createElement('div')
  document.body.append(root)
  const bridge = makeBridge()
  const overlay = factory().create({ document, root, dshForge: bridge, ...opts })
  return { overlay, root, bridge }
}

function press(key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
  document.dispatchEvent(event)
  return event
}

const cssOf = (): string =>
  document.getElementById('dsh-forge-crash-recovery-style')?.textContent ?? ''

beforeEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  vi.useFakeTimers()
})

describe('AC1: five-state presentation matches the main-process state machine', () => {
  it('idle renders nothing', () => {
    const { overlay } = mount()
    overlay.applyState({ state: 'idle' })
    expect(overlay.getState().state).toBe('idle')
    expect(overlay.element()).toBeNull()
  })

  it('restarting renders the crash prompt: static error dot + 「正在重启运行时…」', () => {
    const { overlay, root } = mount()
    overlay.applyState({ state: 'restarting' })
    const el = overlay.element() as HTMLElement
    expect(root.contains(el)).toBe(true)
    expect(el.textContent).toContain('连接已中断')
    expect(el.textContent).toContain('正在重启运行时…')
    const dot = el.querySelector('.dfw-crash-dot') as HTMLElement
    expect(dot).not.toBeNull()
  })

  it('restoring switches to the spinner visual + 「正在恢复会话…」', () => {
    const { overlay } = mount()
    overlay.applyState({ state: 'restarting' })
    overlay.applyState({ state: 'restoring' })
    const el = overlay.element() as HTMLElement
    expect(el.textContent).toContain('正在恢复会话…')
    expect(el.querySelector('.dfw-crash-spinner')).not.toBeNull()
  })

  it('recovered closes the overlay and shows the 「已恢复最近会话」 toast', () => {
    const { overlay, root } = mount()
    overlay.applyState({ state: 'restarting' })
    overlay.applyState({ state: 'restoring' })
    overlay.applyState({ state: 'recovered' })
    expect(overlay.element()).toBeNull()
    expect(root.textContent).toContain('已恢复最近会话')
    vi.advanceTimersByTime(3000)
    expect(root.textContent).not.toContain('已恢复最近会话')
  })

  it('failed renders the reason block + 「重启应用」 button and never regresses', () => {
    const { overlay } = mount()
    overlay.applyState({ state: 'restarting' })
    overlay.applyState({ state: 'failed', reason: 'exit code 137, 3 attempts' })
    const el = overlay.element() as HTMLElement
    expect(el.textContent).toContain('恢复失败')
    expect(el.textContent).toContain('exit code 137, 3 attempts')
    const button = el.querySelector<HTMLButtonElement>('.dfw-crash-restart')
    expect(button?.textContent).toBe('重启应用')
    // Terminal: failed 不回退 to any other state (Interface 2).
    overlay.applyState({ state: 'restoring' })
    overlay.applyState({ state: 'recovered' })
    expect(overlay.getState().state).toBe('failed')
    expect(overlay.element()).not.toBeNull()
  })

  it('idle→failed (start-failed, F1) renders the failed layout directly', () => {
    const { overlay } = mount()
    overlay.applyState({ state: 'failed', reason: 'first spawn handshake failed' })
    const el = overlay.element() as HTMLElement
    expect(el.textContent).toContain('first spawn handshake failed')
    expect(el.querySelector('.dfw-crash-restart')).not.toBeNull()
  })
})

describe('AC2: focus trap locks Tab/Shift+Tab inside the dialog and restores focus', () => {
  it('moves focus into the dialog on show and restores it on close', () => {
    const outside = document.createElement('button')
    outside.textContent = 'outside'
    document.body.append(outside)
    outside.focus()
    const { overlay } = mount()
    overlay.applyState({ state: 'restarting' })
    const el = overlay.element() as HTMLElement
    expect(el.contains(document.activeElement)).toBe(true)
    overlay.applyState({ state: 'restoring' })
    overlay.applyState({ state: 'recovered' })
    expect(document.activeElement).toBe(outside)
  })

  it('failed state focuses the 「重启应用」 button', () => {
    const { overlay } = mount()
    overlay.applyState({ state: 'restarting' })
    overlay.applyState({ state: 'failed', reason: 'boom' })
    const el = overlay.element() as HTMLElement
    expect(document.activeElement).toBe(el.querySelector('.dfw-crash-restart'))
  })

  it('Tab cycles forward from the last focusable back to the first', () => {
    const { overlay } = mount()
    overlay.applyState({ state: 'restarting' })
    const el = overlay.element() as HTMLElement
    el.querySelector('.dfw-crash-restart')?.focus()
    const event = press('Tab')
    expect(event.defaultPrevented).toBe(true)
    expect(el.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(el.querySelector('.dfw-crash-restart'))
  })

  it('Tab from outside the dialog while visible pulls focus back inside', () => {
    const outside = document.createElement('button')
    document.body.append(outside)
    const { overlay } = mount()
    overlay.applyState({ state: 'restarting' })
    const el = overlay.element() as HTMLElement
    outside.focus()
    const event = press('Tab')
    expect(event.defaultPrevented).toBe(true)
    expect(el.contains(document.activeElement)).toBe(true)
  })

  it('Shift+Tab from the first focusable wraps to the last', () => {
    const { overlay } = mount()
    overlay.applyState({ state: 'restarting' })
    const el = overlay.element() as HTMLElement
    const dialog = el.querySelector('.dfw-crash-dialog') as HTMLElement
    dialog.focus() // first focusable per querySelector order
    const event = press('Tab', true)
    expect(event.defaultPrevented).toBe(true)
    expect(el.contains(document.activeElement)).toBe(true)
  })

  it('Tab is not intercepted once the overlay is gone', () => {
    const { overlay } = mount()
    overlay.applyState({ state: 'restarting' })
    overlay.applyState({ state: 'restoring' })
    overlay.applyState({ state: 'recovered' })
    const event = press('Tab')
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('AC3: Esc and mask clicks do not close (recovery cannot be skipped)', () => {
  it('Esc does not close', () => {
    const { overlay, bridge } = mount()
    overlay.applyState({ state: 'restarting' })
    press('Escape')
    expect(overlay.getState().state).toBe('restarting')
    expect(overlay.element()).not.toBeNull()
    expect(bridge.recovery.restartApp).not.toHaveBeenCalled()
  })

  it('clicking the mask does not close', () => {
    const { overlay } = mount()
    overlay.applyState({ state: 'restarting' })
    const mask = overlay.element() as HTMLElement
    mask.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(overlay.getState().state).toBe('restarting')
    expect(overlay.element()).not.toBeNull()
  })
})

describe('AC4: failed-state layout and a11y per ui-design §UF4', () => {
  it('dialog is role=alertdialog, aria-modal=true, aria-live=assertive, labeled', () => {
    const { overlay } = mount()
    overlay.applyState({ state: 'restarting' })
    const dialog = overlay.element()?.querySelector('.dfw-crash-dialog') as HTMLElement
    expect(dialog.getAttribute('role')).toBe('alertdialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-live')).toBe('assertive')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(dialog.querySelector('#' + labelledBy)?.textContent).toContain('连接已中断')
  })

  it('state text transitions are announced (status text node persists across states)', () => {
    const { overlay } = mount()
    overlay.applyState({ state: 'restarting' })
    const el = overlay.element() as HTMLElement
    const status = el.querySelector('.dfw-crash-status-text') as HTMLElement
    expect(status.textContent).toContain('正在重启运行时…')
    overlay.applyState({ state: 'restoring' })
    expect((overlay.element() as HTMLElement).querySelector('.dfw-crash-status-text')?.textContent)
      .toContain('正在恢复会话…')
  })

  it('reason is truncated to 120 chars and only that block scrolls', () => {
    const { overlay } = mount()
    overlay.applyState({ state: 'failed', reason: 'x'.repeat(200) })
    const reason = overlay.element()?.querySelector('.dfw-crash-reason') as HTMLElement
    expect(reason.textContent?.length).toBe(120)
    const css = cssOf()
    expect(css).toContain('max-height:96px')
    expect(css).toContain('overflow-y:auto')
    expect(css).toContain('var(--dsw-alias-label-secondary')
  })

  it('uses modal geometry: mask z1200 + blur 2px, dialog r24 / min(380px) / pb24, title 16/24 w500', () => {
    const { overlay } = mount()
    overlay.applyState({ state: 'restarting' })
    const css = cssOf()
    expect(css).toContain('z-index:1200')
    expect(css).toContain('var(--dsw-alias-bg-mask-1')
    expect(css).toContain('blur(2px)')
    expect(css).toContain('border-radius:24px')
    expect(css).toContain('width:min(380px,calc(100vw - 48px))')
    expect(css).toContain('padding:22px 24px 24px')
    expect(css).toContain('font-size:16px')
    expect(css).toContain('font-weight:500')
    expect(css).toContain('var(--dsw-alias-bg-layer-2')
    expect(css).not.toContain('--dsw-static-')
  })

  it('restart button is md h36 r18 monochrome-primary; click invokes dshForge.recovery.restartApp', () => {
    const { overlay, bridge } = mount()
    overlay.applyState({ state: 'failed', reason: 'boom' })
    const button = overlay.element()?.querySelector<HTMLButtonElement>('.dfw-crash-restart')
    const css = cssOf()
    expect(css).toContain('height:36px')
    expect(css).toContain('border-radius:18px')
    button?.click()
    expect(bridge.recovery.restartApp).toHaveBeenCalledTimes(1)
  })
})
