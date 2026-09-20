import { describe, expect, it, vi } from 'vitest'
import { claimShellSingleInstance, focusShellWindow, type ShellFocusWindow, type ShellSingleInstanceApplication } from '../src/main/single-instance.ts'
import { formatShellLog } from '../src/main/log.ts'

type Fn = ReturnType<typeof vi.fn>

// Task 3.4 AC (Key Flow F1): second launch focuses the existing window and
// exits; closed-to-tray residency restores; the losing instance logs
// ERR_SINGLE_INSTANCE. Structure mirrors upstream apps/desktop/src/single-instance.ts.
describe('single-instance claim', () => {
  function fakeApp(lockGranted: boolean) {
    const listeners: Array<() => void> = []
    const application: ShellSingleInstanceApplication = {
      requestSingleInstanceLock: () => lockGranted,
      quit: vi.fn(),
      on: (_event: 'second-instance', listener: () => void) => {
        listeners.push(listener)
        return undefined
      },
    }
    return { application, listeners }
  }

  it('grants ownership when the lock is acquired and does not quit', () => {
    const { application } = fakeApp(true)
    expect(claimShellSingleInstance(application, () => {})).toBe(true)
    expect(application.quit).not.toHaveBeenCalled()
  })

  it('denies ownership on a second launch: quits and returns false', () => {
    const { application } = fakeApp(false)
    expect(claimShellSingleInstance(application, () => {})).toBe(false)
    expect(application.quit).toHaveBeenCalledTimes(1)
  })

  it('routes a later launch to the owner via second-instance', () => {
    const { application, listeners } = fakeApp(true)
    const focusOwner = vi.fn()
    claimShellSingleInstance(application, focusOwner)
    expect(listeners).toHaveLength(1)
    listeners[0]!()
    expect(focusOwner).toHaveBeenCalledTimes(1)
  })
})

describe('owner-side focus semantics (F1)', () => {
  function fakeWindow(state: { destroyed?: boolean; visible?: boolean; minimized?: boolean }): ShellFocusWindow & {
    show: Fn
    restore: Fn
    focus: Fn
  } {
    return {
      isDestroyed: () => state.destroyed ?? false,
      isVisible: () => state.visible ?? true,
      isMinimized: () => state.minimized ?? false,
      show: vi.fn<() => void>(),
      restore: vi.fn<() => void>(),
      focus: vi.fn<() => void>(),
    }
  }

  it('focuses a normal visible window without restore/show', () => {
    const win = fakeWindow({})
    focusShellWindow(win, () => { throw new Error('must not recreate') })
    expect(win.focus).toHaveBeenCalledTimes(1)
    expect(win.restore).not.toHaveBeenCalled()
    expect(win.show).not.toHaveBeenCalled()
  })

  it('restores a minimized window then focuses', () => {
    const win = fakeWindow({ minimized: true })
    focusShellWindow(win, () => { throw new Error('must not recreate') })
    expect(win.restore).toHaveBeenCalledTimes(1)
    expect(win.focus).toHaveBeenCalledTimes(1)
  })

  it('restores from tray residency: hidden window is shown again', () => {
    const win = fakeWindow({ visible: false })
    focusShellWindow(win, () => { throw new Error('must not recreate') })
    expect(win.show).toHaveBeenCalledTimes(1)
    expect(win.focus).toHaveBeenCalledTimes(1)
  })

  it('recreates the primary window when resident with no live window', () => {
    const recreated = fakeWindow({})
    const createWindow = vi.fn(() => recreated)
    const result = focusShellWindow(undefined, createWindow)
    expect(createWindow).toHaveBeenCalledTimes(1)
    expect(result).toBe(recreated)
  })

  it('recreates the primary window when the previous one is destroyed', () => {
    const recreated = fakeWindow({})
    const result = focusShellWindow(fakeWindow({ destroyed: true }), () => recreated)
    expect(result).toBe(recreated)
  })
})

describe('single-instance error code propagation', () => {
  it('ERR_SINGLE_INSTANCE is a structured log code', () => {
    const record = formatShellLog('warn', {
      code: 'ERR_SINGLE_INSTANCE',
      message: 'another shell instance already owns the lock; focusing it and exiting',
    })
    expect(record.code).toBe('ERR_SINGLE_INSTANCE')
    expect(record.level).toBe('warn')
  })
})
