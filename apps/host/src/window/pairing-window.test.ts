// fix-7 配对独立窗口单测（mobile-remote-approval bug 9fd9b6b1 ①）：官方 BrowserWindow
// 几何（560×720 min 420×560）+ 标题「连接移动设备」+ 单实例复用（重开 = 聚焦）+
// 应用菜单项「连接手机... Ctrl+Shift+M」+ IPC 通道缝（侧栏手机图标 → host 开窗）。
// Electron 依赖全注入（create.test 同型替身机械——BrowserWindow/Menu/ipcMain 皆 fake；
// BrowserWindow 替身 = 可 new 的真 class——vi.fn 不可构造）。
import { describe, expect, it, vi } from 'vitest'
import {
  PAIRING_WINDOW_TITLE,
  createPairingWindow,
  setupPairingEntry,
  type BrowserWindowCtorLike,
  type PairingWindowLike,
} from './pairing-window.js'
import { OPEN_PAIRING_WINDOW_CHANNEL } from '../ipc/pairing-window-channel.js'

/** BrowserWindow 替身工厂（记录 options，产出可检视窗口假体） */
function fakeBrowserWindowCtor() {
  const windows: PairingWindowLike[] = []
  const calls: Record<string, unknown>[] = []
  class FakeBrowserWindow {
    options: Record<string, unknown>
    webContents: { id: number }
    loadURL: (url: string) => Promise<void>
    on: (event: string, listener: () => void) => void
    show: () => void
    focus: () => void
    isDestroyed: () => boolean
    close: () => void
    constructor(options: Record<string, unknown>) {
      this.options = options
      calls.push(options)
      this.webContents = { id: windows.length + 1 }
      this.loadURL = vi.fn(() => Promise.resolve())
      this.on = vi.fn()
      this.show = vi.fn()
      this.focus = vi.fn()
      this.isDestroyed = vi.fn(() => false)
      this.close = vi.fn()
      windows.push(this as unknown as PairingWindowLike)
    }
  }
  const ctor = FakeBrowserWindow as unknown as BrowserWindowCtorLike
  return { ctor, windows, calls }
}

describe('createPairingWindow（官方配对窗几何逐位对照——DSH Desktop 0.10.0 :22415-22440）', () => {
  it('窗口 options：560×720 / min 420×560 / title 连接移动设备 / 隐藏起手 ready-to-show 显窗', async () => {
    const { ctor, windows, calls } = fakeBrowserWindowCtor()
    const win = await createPairingWindow(ctor, { url: 'dsh-forge://app/?forgePair=1', preloadPath: 'p.mjs' })
    expect(calls).toHaveLength(1)
    const options = calls[0]!
    expect(options['width']).toBe(560)
    expect(options['height']).toBe(720)
    expect(options['minWidth']).toBe(420)
    expect(options['minHeight']).toBe(560)
    expect(options['title']).toBe(PAIRING_WINDOW_TITLE)
    expect(PAIRING_WINDOW_TITLE).toBe('连接移动设备')
    expect(options['show']).toBe(false)
    expect(win.loadURL).toHaveBeenCalledWith('dsh-forge://app/?forgePair=1')
    expect(windows[0]!.on).toHaveBeenCalledWith('ready-to-show', expect.any(Function))
  })
})

describe('setupPairingEntry（菜单项 + IPC 通道 + 单实例复用）', () => {
  function fakeDeps() {
    const { ctor, windows, calls } = fakeBrowserWindowCtor()
    let template: unknown
    const menu = {
      buildFromTemplate: vi.fn((t: unknown) => {
        template = t
        return { t }
      }),
      setApplicationMenu: vi.fn(),
    }
    const handlers = new Map<string, unknown>()
    const ipcMain = {
      handle: vi.fn((channel: string, handler: unknown) => void handlers.set(channel, handler)),
      removeHandler: vi.fn((channel: string) => void handlers.delete(channel)),
    }
    const app = { on: vi.fn() }
    return {
      ctor, windows, calls, menu, template: () => template, ipcMain, handlers, app,
      deps: () => ({ app, BrowserWindow: ctor as BrowserWindowCtorLike, Menu: menu, ipcMain, preloadPath: 'p.mjs' }),
    }
  }

  it('应用菜单含「连接手机...」项（accelerator CmdOrCtrl+Shift+M——官方菜单锚逐字）；click → 开窗', () => {
    const fx = fakeDeps()
    const dispose = setupPairingEntry(fx.deps())
    expect(fx.menu.setApplicationMenu).toHaveBeenCalledTimes(1)
    const items = fx.template() as Array<{ label?: string; submenu?: Array<{ label?: string; accelerator?: string; click?: () => void }> }>
    const labels = items.flatMap((item) => item.submenu?.map((sub) => sub.label) ?? [])
    expect(labels).toContain('连接手机...')
    const subs = items.flatMap((item) => item.submenu ?? [])
    expect(subs.some((sub) => sub.accelerator === 'CmdOrCtrl+Shift+M' && typeof sub.click === 'function')).toBe(true)
    subs.find((sub) => sub.label === '连接手机...')!.click!()
    expect(fx.calls).toHaveLength(1)
    dispose()
  })

  it('IPC 通道：OPEN_PAIRING_WINDOW_CHANNEL handler → 开窗；重复开 = 单实例复用（构造一次 + focus 现窗）', async () => {
    const fx = fakeDeps()
    const dispose = setupPairingEntry(fx.deps())
    const handler = fx.handlers.get(OPEN_PAIRING_WINDOW_CHANNEL) as () => unknown
    expect(handler).toBeTypeOf('function')
    handler()
    handler() // 在途创建期连点 → 不开双窗
    await vi.waitFor(() => expect(fx.calls).toHaveLength(1))
    await vi.waitFor(() => expect(fx.windows).toHaveLength(1))
    await Promise.resolve()
    expect(fx.windows[0]!.focus).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('dispose：removeHandler + 关窗 + before-quit 挂钩（quit 面收口）', async () => {
    const fx = fakeDeps()
    const dispose = setupPairingEntry(fx.deps())
    expect(fx.app.on).toHaveBeenCalledWith('before-quit', expect.any(Function))
    ;(fx.handlers.get(OPEN_PAIRING_WINDOW_CHANNEL) as () => void)()
    await vi.waitFor(() => expect(fx.calls).toHaveLength(1))
    await vi.waitFor(() => expect(fx.windows).toHaveLength(1))
    dispose()
    expect(fx.ipcMain.removeHandler).toHaveBeenCalledWith(OPEN_PAIRING_WINDOW_CHANNEL)
    expect(fx.windows[0]!.close).toHaveBeenCalled()
  })
})
