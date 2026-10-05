// window/create 单测 —— 主窗口建窗语义 pin（窗口形态 fix-2 起：titleBarStyle/titleBarOverlay）。
// BrowserWindow 注入 fake（create.ts 设计面——真实 Electron 形态面由 e2e host-boot/smoke-skeleton 承载）。
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createMainWindow, type BrowserWindowLike } from './create.js'
import { resolveWindowIconPath } from './icon.js'
import { WINDOWS_TITLEBAR_HEIGHT } from './titlebar.js'

class FakeBrowserWindow implements BrowserWindowLike {
  readonly webContents = { id: 1 }
  readonly options: Record<string, unknown>
  shown = false
  loadedUrl?: string
  private readonly listeners = new Map<string, () => void>()
  constructor(options: Record<string, unknown>) {
    this.options = options
  }
  loadURL(url: string): Promise<void> {
    this.loadedUrl = url
    return Promise.resolve()
  }
  on(event: string, listener: () => void): void {
    this.listeners.set(event, listener)
  }
  show(): void {
    this.shown = true
  }
  /** 测试面：触发注入的监听（ready-to-show 显窗行为断言载体） */
  emit(event: string): void {
    this.listeners.get(event)?.()
  }
}

async function createFake(): Promise<FakeBrowserWindow> {
  let created: FakeBrowserWindow | undefined
  const factory = class {
    constructor(options: Record<string, unknown>) {
      created = new FakeBrowserWindow(options)
      return created
    }
  }
  const win = await createMainWindow(
    factory as unknown as new (options: Record<string, unknown>) => BrowserWindowLike,
    { url: 'dsh-forge://app/', preloadPath: 'Z:/dist/preload.mjs', title: 'dsh-forge' },
  )
  return (created ?? win) as FakeBrowserWindow
}

describe('createMainWindow（建窗参数）', () => {
  it('未点名元素保持：1440×900、初始不显窗、安全 webPreferences、壳入口加载', async () => {
    const win = await createFake()
    expect(win.options.width).toBe(1440)
    expect(win.options.height).toBe(900)
    expect(win.options.title).toBe('dsh-forge')
    expect(win.options.show).toBe(false)
    expect(win.options.webPreferences).toEqual({
      preload: 'Z:/dist/preload.mjs',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    })
    expect(win.loadedUrl).toBe('dsh-forge://app/')
  })
  it('窗口形态（fix-2）：titleBarStyle hidden + overlay 原生钮（官方 bg 令牌实值）', async () => {
    const win = await createFake()
    expect(win.options.titleBarStyle).toBe('hidden')
    // overlay 取官方主题令牌静态实值（浅色 scope：bg-base→neutral-bluish-00 / label-primary→
    // neutral-bluish-1000；高度 = Windows 官方系统 caption 刻度）——注记见 create.ts
    expect(win.options.titleBarOverlay).toEqual({
      color: '#fff', // = --dsw-static-neutral-bluish-00
      symbolColor: '#0f1115', // = --dsw-static-neutral-bluish-1000
      height: 32,
    })
  })
  it('WCO 覆盖条高度单源（fix-40）：titleBarOverlay.height = WINDOWS_TITLEBAR_HEIGHT（preload 壳标记内联变量同源）', async () => {
    const win = await createFake()
    // 上行已字面 pin 32；本行钉住单源链——create.ts 与 preload-api.ts 共消费 window/titlebar.ts，
    // 宿主-壳两源漂移（改一处漏一处）在此红
    expect((win.options.titleBarOverlay as { height: number }).height).toBe(WINDOWS_TITLEBAR_HEIGHT)
  })
  it('窗口图标（fix-45）：icon 选项在场 = resolveWindowIconPath 单源值且文件存在（dev 缺省分支）', async () => {
    // create.ts 内消费 process.env——显式清 DSH_FORGE_RESOURCES_DIR 钉 dev 缺省分支
    const saved = process.env.DSH_FORGE_RESOURCES_DIR
    delete process.env.DSH_FORGE_RESOURCES_DIR
    try {
      const win = await createFake()
      const icon = win.options.icon as string
      expect(icon).toBe(resolveWindowIconPath({}))
      expect(icon.replace(/\\/g, '/')).toMatch(/build\/icon\.png$/)
      // 资产在场门：build/icon.png 入仓缺席（生成器未跑/被误删）在此红
      expect(existsSync(icon)).toBe(true)
    } finally {
      if (saved !== undefined) process.env.DSH_FORGE_RESOURCES_DIR = saved
    }
  })
})

describe('createMainWindow（显窗行为）', () => {
  it('ready-to-show 前不显窗，事件触发即显窗', async () => {
    const win = await createFake()
    expect(win.shown).toBe(false)
    win.emit('ready-to-show')
    expect(win.shown).toBe(true)
  })
})
