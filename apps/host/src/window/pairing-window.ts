// 配对独立窗口（fix-7——bug 9fd9b6b1 ①：Modal 承载退役，官方独立窗逐位对照）。
// 官方锚（DSH Desktop 0.10.0 main.js :22415-22440）：BrowserWindow 560×720、min 420×560、
// 标题「连接移动设备」、加载配对页；应用菜单「连接手机... Ctrl+Shift+M」开窗。
// 偏差注记（承重假设核销）：官方窗口 sandbox:true——本仓 preload 为 ESM .mjs（Electron
// 沙箱渲染器仅支持 CJS preload），配对窗复用主窗 preload 注入机械 → sandbox:false（与
// 主窗同刻度，contextIsolation 保持开）。转 sandbox:true 须先拆 CJS 独立 preload，属
// 注入机械改造，不属本缺陷最小修复面。
import { SHELL_PAGE_ORIGIN } from './web-document.js'
import type { BrowserWindowLike } from './create.js'
import { WINDOWS_TITLEBAR_HEIGHT } from './titlebar.js'
import { resolveWindowIconPath } from './icon.js'
import { OPEN_PAIRING_WINDOW_CHANNEL } from '../ipc/pairing-window-channel.js'

/** 官方配对窗标题（DSH Desktop 0.10.0 实机逐字） */
export const PAIRING_WINDOW_TITLE = '连接移动设备'
/** 官方配对窗几何（560×720 min 420×560——:22415-22440 同刻度） */
export const PAIRING_WINDOW_GEOMETRY = {
  width: 560,
  height: 720,
  minWidth: 420,
  minHeight: 560,
} as const
/** 配对页路由（产品配对面独立页——apps/web main.ts forgePair 分支承载） */
export const PAIRING_WINDOW_URL = `${SHELL_PAGE_ORIGIN}/?forgePair=1`

/** 配对窗消费面（BrowserWindowLike + options 检视 + 关窗/聚焦——测试替身可检视） */
export interface PairingWindowLike extends BrowserWindowLike {
  readonly options?: unknown
  focus(): void
  isDestroyed(): boolean
  close(): void
}

/** BrowserWindow 构造器窄面（create.ts BrowserWindowFactory 产出扩面——options 检视锚） */
export type BrowserWindowCtorLike = new (options: Record<string, unknown>) => PairingWindowLike

export interface PairingWindowOptions {
  /** 配对页 URL（缺省 = 产品配对页路由） */
  url?: string
  /** dist/preload.mjs 绝对路径（主窗同款注入机械——boot manifest + RPC 桥） */
  preloadPath: string
}

/**
 * 创建配对独立窗（官方几何逐位对照；隐藏起手 + ready-to-show 显窗——主窗同款防闪烁形态；
 * e2e 无头缝 DSH_FORGE_WINDOW_HIDDEN=1 同主窗口径：不显窗）。
 */
export async function createPairingWindow(
  BrowserWindow: BrowserWindowCtorLike,
  options: PairingWindowOptions,
): Promise<PairingWindowLike> {
  const hidden = process.env.DSH_FORGE_WINDOW_HIDDEN === '1'
  const win = new BrowserWindow({
    ...PAIRING_WINDOW_GEOMETRY,
    title: PAIRING_WINDOW_TITLE,
    show: false,
    icon: resolveWindowIconPath(process.env),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#fff',
      symbolColor: '#0f1115',
      height: WINDOWS_TITLEBAR_HEIGHT,
    },
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // ESM preload 须非沙箱渲染（主窗同刻度——偏差见文件头注记）
      sandbox: false,
      ...(hidden ? { backgroundThrottling: false } : {}),
    },
  })
  if (!hidden) win.on('ready-to-show', () => win.show())
  await win.loadURL(options.url ?? PAIRING_WINDOW_URL)
  return win
}

/** Electron Menu 构造窄面（真身由 main 传入；测试注入 fake） */
export interface MenuFactoryLike {
  buildFromTemplate(template: unknown): unknown
  setApplicationMenu(menu: unknown): void
}

/** ipcMain 注册窄面（forge-channels IpcMainLike 消费切片——测试注入 fake） */
export interface PairingIpcMainLike {
  handle(channel: string, handler: (...args: unknown[]) => unknown): unknown
  removeHandler(channel: string): unknown
}

/** app 生命周期窄面（before-quit 挂钩——测试注入 fake） */
export interface PairingAppLike {
  on(event: 'before-quit', listener: () => void): unknown
}

/** setupPairingEntry 依赖注入面（Electron 真身由 main 绑定；测试全替身） */
export interface PairingEntryDeps {
  readonly app: PairingAppLike
  readonly BrowserWindow: BrowserWindowCtorLike
  readonly Menu: MenuFactoryLike
  readonly ipcMain: PairingIpcMainLike
  readonly preloadPath: string
}

/**
 * 配对入口装配（菜单项 + IPC 通道 + 单实例复用——一次装配全程持窗）：
 *  - 应用菜单「连接手机... Ctrl+Shift+M」→ 开/聚焦配对窗（重开 = 单实例复用聚焦）；
 *  - OPEN_PAIRING_WINDOW_CHANNEL handler → 同径（侧栏手机图标点击缝）；
 *  - before-quit → 关窗 + removeHandler。
 * 返回 dispose（对称收口——宿主测试/异常路径面）。
 */
export function setupPairingEntry(deps: PairingEntryDeps): () => void {
  let window: PairingWindowLike | undefined
  let creating: Promise<PairingWindowLike> | undefined
  // 单实例复用：窗在场未销毁 = 聚焦现窗；在途创建 = 等建成后聚焦（连点不开双窗）；
  // 否则经 createPairingWindow 新建（工厂注入同构造器）。
  const openWindow = (): void => {
    if (window !== undefined && !window.isDestroyed()) {
      window.focus()
      return
    }
    if (creating !== undefined) {
      void creating.then((win) => {
        if (!win.isDestroyed()) win.focus()
      })
      return
    }
    creating = createPairingWindow(deps.BrowserWindow, { preloadPath: deps.preloadPath }).then((win) => {
      window = win
      creating = undefined
      return win
    })
  }
  deps.ipcMain.handle(OPEN_PAIRING_WINDOW_CHANNEL, () => {
    openWindow()
  })
  deps.Menu.setApplicationMenu(
    deps.Menu.buildFromTemplate([
      {
        label: '设备',
        submenu: [
          {
            label: '连接手机...',
            accelerator: 'CmdOrCtrl+Shift+M',
            click: (): void => openWindow(),
          },
        ],
      },
    ]),
  )
  const onQuit = (): void => {
    if (window !== undefined && !window.isDestroyed()) window.close()
    window = undefined
  }
  deps.app.on('before-quit', onQuit)
  return () => {
    onQuit()
    deps.ipcMain.removeHandler(OPEN_PAIRING_WINDOW_CHANNEL)
  }
}
