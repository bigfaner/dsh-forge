import { describe, expect, it, vi } from 'vitest'
import { createShellTray, TRAY_NAME, type ShellTrayInstance, type ShellTrayWindow } from '../src/main/tray/index.ts'
import { TRAY_ICON_DATA_URL } from '../src/main/tray/icon.ts'

// Task 4.2 AC (UF1, SC5): close-to-tray residency + menu restore/quit,
// two-state left-click semantics, Linux silent degradation (ERR_TRAY_UNAVAILABLE),
// missedCount tooltip fallback 「dsh-forge(N)」.

type Fn = ReturnType<typeof vi.fn>

function fakeTray() {
  const listeners: Array<() => void> = []
  const instance: ShellTrayInstance & { setToolTip: Fn; setContextMenu: Fn; destroy: Fn } = {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: (_event: 'click', listener: () => void) => {
      listeners.push(listener)
      return undefined
    },
    destroy: vi.fn(),
  }
  return { instance, listeners }
}

function fakeDeps(overrides: Partial<Parameters<typeof createShellTray>[0]> = {}) {
  const tray = fakeTray()
  const menus: Array<Array<{ label: string; click: () => void }>> = []
  const deps = {
    icon: 'icon-native-image',
    createTray: vi.fn(() => tray.instance),
    buildMenu: (template: Array<{ label: string; click: () => void }>) => {
      menus.push(template)
      return { menu: true }
    },
    copy: (key: 'tray.show' | 'tray.quit') => (key === 'tray.show' ? '显示主窗口' : '退出 dsh-forge'),
    focusMainWindow: vi.fn(),
    quitApp: vi.fn(),
    ...overrides,
  }
  return { deps, tray, menus }
}

function fakeWindow() {
  const closeListeners: Array<(event: { preventDefault(): void }) => void> = []
  const window: ShellTrayWindow & { hide: Fn } = {
    on: (_event: 'close', listener: (event: { preventDefault(): void }) => void) => {
      closeListeners.push(listener)
      return undefined
    },
    hide: vi.fn(),
  }
  const fireClose = (): { prevented: boolean } => {
    let prevented = false
    closeListeners.at(-1)?.({ preventDefault: () => { prevented = true } })
    return { prevented }
  }
  return { window, fireClose }
}

describe('tray creation', () => {
  it('builds the two-item native menu with i18n copy and sets the base tooltip', () => {
    const { deps, tray, menus } = fakeDeps()
    const shellTray = createShellTray(deps)
    expect(shellTray.state).toEqual({ present: true, missedCount: 0 })
    expect(tray.instance.setToolTip).toHaveBeenCalledWith(TRAY_NAME)
    expect(menus).toHaveLength(1)
    expect(menus[0]!.map(item => item.label)).toEqual(['显示主窗口', '退出 dsh-forge'])
    expect(tray.instance.setContextMenu).toHaveBeenCalledWith({ menu: true })
  })

  it('degrades silently when the native tray cannot be created (Linux)', () => {
    const lines: string[] = []
    const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      lines.push(String(chunk))
      return true
    })
    const { deps } = fakeDeps({ createTray: () => { throw new Error('no StatusNotifier') } })
    const shellTray = createShellTray(deps)
    expect(shellTray.state).toEqual({ present: false, missedCount: 0 })
    // SC2: no thrown error, no dialog — log only, with the structured code.
    expect(lines.some(line => line.includes('ERR_TRAY_UNAVAILABLE'))).toBe(true)
    // No-ops on the degraded handle must be safe.
    expect(() => {
      shellTray.incrementMissed()
      shellTray.destroy()
      shellTray.attachCloseToResidency(fakeWindow().window)
    }).not.toThrow()
    write.mockRestore()
  })
})

describe('close-to-tray residency (SC5)', () => {
  it('prevents close while the tray is present (window hides instead of quitting)', () => {
    const { deps } = fakeDeps()
    const shellTray = createShellTray(deps)
    const { window, fireClose } = fakeWindow()
    shellTray.attachCloseToResidency(window)
    expect(fireClose()).toEqual({ prevented: true })
    expect(window.hide).toHaveBeenCalledTimes(1)
  })

  it('does not intercept close after the tray is destroyed (quit path, or degraded tray)', () => {
    const { deps } = fakeDeps()
    const shellTray = createShellTray(deps)
    const { window, fireClose } = fakeWindow()
    shellTray.attachCloseToResidency(window)
    shellTray.destroy()
    expect(shellTray.state.present).toBe(false)
    expect(fireClose()).toEqual({ prevented: false })
    expect(window.hide).not.toHaveBeenCalled()
  })
})

describe('menu and left-click actions', () => {
  it('menu 「显示主窗口」 restores/focuses the main window (left-click shares the path)', () => {
    const { deps, menus, tray } = fakeDeps()
    createShellTray(deps)
    menus[0]![0]!.click()
    expect(deps.focusMainWindow).toHaveBeenCalledTimes(1)
    expect(deps.quitApp).not.toHaveBeenCalled()
    // Left click routes to the same focus/restore path (two-state semantics
    // live in focusShellWindow, covered by single-instance.spec.ts).
    tray.listeners[0]!()
    expect(deps.focusMainWindow).toHaveBeenCalledTimes(2)
  })

  it('menu 「退出」 tears the tray down and quits', () => {
    const { deps, menus, tray } = fakeDeps()
    const shellTray = createShellTray(deps)
    menus[0]![1]!.click()
    expect(deps.quitApp).toHaveBeenCalledTimes(1)
    // The quit path (before-quit in the main entry) destroys the tray so the
    // icon is removed and residency stops intercepting the window close.
    shellTray.destroy()
    expect(tray.instance.destroy).toHaveBeenCalledTimes(1)
    expect(shellTray.state.present).toBe(false)
  })
})

describe('missedCount tooltip fallback (F3-F1 DND path)', () => {
  it('tooltip becomes 「dsh-forge(N)」 as notifications are missed', () => {
    const { deps, tray } = fakeDeps()
    const shellTray = createShellTray(deps)
    shellTray.incrementMissed()
    expect(shellTray.state).toEqual({ present: true, missedCount: 1 })
    expect(tray.instance.setToolTip).toHaveBeenLastCalledWith('dsh-forge(1)')
    shellTray.incrementMissed()
    expect(shellTray.state.missedCount).toBe(2)
    expect(tray.instance.setToolTip).toHaveBeenLastCalledWith('dsh-forge(2)')
  })

  it('tooltip falls back to the plain name when the count resets', () => {
    const { deps, tray } = fakeDeps()
    const shellTray = createShellTray(deps)
    shellTray.incrementMissed()
    shellTray.resetMissed()
    expect(shellTray.state.missedCount).toBe(0)
    expect(tray.instance.setToolTip).toHaveBeenLastCalledWith(TRAY_NAME)
  })
})

describe('embedded tray icon', () => {
  it('is a decodable PNG data URL with sane dimensions', () => {
    expect(TRAY_ICON_DATA_URL.startsWith('data:image/png;base64,')).toBe(true)
    const base64 = TRAY_ICON_DATA_URL.split(',')[1]!
    const bytes = Buffer.from(base64, 'base64')
    // PNG magic + IHDR dimensions 16x16.
    expect(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true)
    expect(bytes.readUInt32BE(16)).toBe(16)
    expect(bytes.readUInt32BE(20)).toBe(16)
  })
})
