import { shellLog } from '../log.ts'

// System tray — UF1 (task 4.2), SC5 关窗驻留.
//
// Responsibilities (tech-design §Component Diagram, ui-design §Component
// 系统托盘):
//   - native tray menu with exactly two items: 显示主窗口 / 退出 (i18n
//     `tray.show` / `tray.quit` via the injected copy function)
//   - close-to-tray residency: when the tray is present, closing the main
//     window hides it instead of quitting; when the tray is unavailable
//     (Linux ERR_TRAY_UNAVAILABLE), close keeps its default quit semantics
//   - left-click semantics: delegate to the same focus/restore path used by
//     single-instance (visible → focus only; closed → restore + focus)
//   - TrayState { present, missedCount }: DND fallback counter for UF2 —
//     each denied notification bumps missedCount and the tooltip becomes
//     「dsh-forge(N)」; reset to plain 「dsh-forge」on 0
//
// The module is dependency-injected (same pattern as single-instance.ts) so
// the unit tests drive it with fakes instead of a live Electron session.

/** Tech-design Data Models: TrayState = { present: boolean; missedCount: number } */
export interface TrayState {
  present: boolean
  missedCount: number
}

/** Tooltip label while no notification was missed. */
export const TRAY_NAME = 'dsh-forge'

/** Minimal native-tray surface the controller depends on (mockable). */
export interface ShellTrayInstance {
  setToolTip(tooltip: string): void
  setContextMenu(menu: unknown): void
  on(event: 'click', listener: () => void): unknown
  destroy(): void
}

/** Window surface needed for close-to-tray residency. */
export interface ShellTrayWindow {
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): unknown
  hide(): void
}

export interface ShellTrayDeps {
  /** Create the native tray for an icon; must throw when unavailable (Linux). */
  createTray: (icon: unknown) => ShellTrayInstance
  /** Native menu factory for the two-item template. */
  buildMenu: (template: Array<{ label: string; click: () => void }>) => unknown
  /** Copy resolver — i18n `t('tray.show'|'tray.quit')`. */
  copy: (key: 'tray.show' | 'tray.quit') => string
  /** Focus/restore path (shared with single-instance second-instance flow). */
  focusMainWindow: () => void
  /** Full quit: shell + host subprocess, no orphans (wired by the caller). */
  quitApp: () => void
  /** Icon payload handed to createTray. */
  icon: unknown
}

export interface ShellTray {
  readonly state: TrayState
  /** Attach close-to-tray residency to a window (idempotent per window). */
  attachCloseToResidency(window: ShellTrayWindow): void
  /** DND fallback counter (F3-F1): tooltip becomes 「dsh-forge(N)」. */
  incrementMissed(): void
  /** Reset the counter (e.g. when the user returns via the tray). */
  resetMissed(): void
  /** Remove the tray icon (quit path / tests). */
  destroy(): void
}

/**
 * Create the shell tray controller. When the native tray cannot be created
 * (Linux without a system tray), the failure degrades silently per SC2:
 * ERR_TRAY_UNAVAILABLE is logged, `state.present` stays false, close events
 * keep their default quit semantics, and no error surfaces to the user.
 */
export function createShellTray(deps: ShellTrayDeps): ShellTray {
  const state: TrayState = { present: false, missedCount: 0 }
  // Set once the quit path removes the tray, so a subsequent 'close' event
  // (window teardown during quit) is not intercepted into residency.
  let quitting = false
  let tray: ShellTrayInstance | undefined

  try {
    tray = deps.createTray(deps.icon)
  } catch (error: unknown) {
    shellLog.warn({
      code: 'ERR_TRAY_UNAVAILABLE',
      message: 'system tray unavailable; degrading to close-quits semantics (SC2)',
      data: { detail: error instanceof Error ? error.message : String(error) },
    })
    return {
      state,
      attachCloseToResidency: () => {},
      incrementMissed: () => {},
      resetMissed: () => {},
      destroy: () => {},
    }
  }

  state.present = true
  quitting = false

  const applyTooltip = (): void => {
    if (tray === undefined) return
    tray.setToolTip(state.missedCount > 0 ? `${TRAY_NAME}(${state.missedCount})` : TRAY_NAME)
  }

  tray.setContextMenu(
    deps.buildMenu([
      { label: deps.copy('tray.show'), click: () => deps.focusMainWindow() },
      { label: deps.copy('tray.quit'), click: () => deps.quitApp() },
    ]),
  )
  tray.on('click', () => deps.focusMainWindow())
  applyTooltip()

  return {
    state,
    attachCloseToResidency(window: ShellTrayWindow): void {
      window.on('close', (event) => {
        // Present tray → hide instead of quit (SC5 residency). Quitting is
        // signaled by the quit path destroying the tray first, so a present
        // tray here always means residency, not shutdown.
        if (state.present && !quitting) {
          event.preventDefault()
          window.hide()
        }
      })
    },
    incrementMissed(): void {
      state.missedCount += 1
      applyTooltip()
    },
    resetMissed(): void {
      state.missedCount = 0
      applyTooltip()
    },
    destroy(): void {
      if (tray === undefined) return
      quitting = true
      tray.destroy()
      tray = undefined
      state.present = false
    },
  }
}
