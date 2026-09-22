import { shellLog } from './log.ts'

// Single-instance ownership + second-instance semantics (task 3.4, Key Flow F1).
// Structure mirrors upstream apps/desktop/src/single-instance.ts (sole
// authority): claim the lock before any profile lifecycle, route later
// launches to the owner via `second-instance`. dsh-forge additions per F1:
// the losing instance logs ERR_SINGLE_INSTANCE before quitting, and the
// owner-side callback restores/focuses the existing window only.

/** Minimal Electron application operations needed for instance ownership. */
export interface ShellSingleInstanceApplication {
  requestSingleInstanceLock(): boolean
  quit(): void
  on(event: 'second-instance', listener: () => void): unknown
}

/**
 * Claim the process-lifetime shell lock and route later launches to the owner.
 * @param application - Electron application singleton.
 * @param focusOwner - focus or restore the primary window after a later launch.
 * @returns true only in the process that may access the shared profile.
 */
export function claimShellSingleInstance(
  application: ShellSingleInstanceApplication,
  focusOwner: () => void,
): boolean {
  if (!application.requestSingleInstanceLock()) {
    shellLog.warn({
      code: 'ERR_SINGLE_INSTANCE',
      message: 'another shell instance already owns the lock; focusing it and exiting',
    })
    application.quit()
    return false
  }
  application.on('second-instance', focusOwner)
  return true
}

/** Primary window operations needed to focus/restore the owner window. */
export interface ShellFocusWindow {
  isDestroyed(): boolean
  isVisible(): boolean
  isMinimized(): boolean
  show(): void
  restore(): void
  focus(): void
}

/**
 * Focus the existing primary window (owner side of `second-instance`).
 * Covers F1 branches: normal → focus; minimized → restore + focus;
 * closed-to-tray residency → `show()` brings the hidden window back from the
 * tray state. UF4 mask periods: this only manipulates window visibility and
 * focus — it never reloads or replaces the window content, so an active UF4
 * crash-recovery mask stays up and just gains focus.
 */
export function focusShellWindow(
  window: ShellFocusWindow | undefined,
  createWindow: () => ShellFocusWindow,
): ShellFocusWindow | undefined {
  if (window === undefined || window.isDestroyed()) {
    // No live window: the shell is resident (tray) or the window died; the
    // restore path is a fresh primary window.
    return createWindow()
  }
  if (window.isMinimized()) window.restore()
  if (!window.isVisible()) window.show()
  window.focus()
  return window
}
