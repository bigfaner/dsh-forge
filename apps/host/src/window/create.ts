// 主窗口创建（定位：基础——窗口生命周期；Security Mitigations：contextIsolation、
// 无 remote content、nodeIntegration 关）。BrowserWindow 以注入方式进入（测试可换 fake）。
import { WINDOWS_TITLEBAR_HEIGHT } from './titlebar.js'
import { resolveWindowIconPath } from './icon.js'

export interface BrowserWindowLike {
  /** ws 改写栏的主窗口归属判定面（1.5：installShellStreamRewrite 消费） */
  readonly webContents: {
    readonly id: number
    /** 主→渲染单向推送（3.1：forge:events/* 广播面——m2-wiring 消费；fake 窗口可缺席） */
    send?(channel: string, ...args: unknown[]): unknown
  }
  loadURL(url: string): Promise<void>
  on(event: string, listener: () => void): void
  show(): void
}

export interface BrowserWindowFactory {
  new (options: Record<string, unknown>): BrowserWindowLike
}

export interface MainWindowOptions {
  url: string
  /** dist/preload.mjs 绝对路径（boot manifest 通道暴露给 renderer） */
  preloadPath: string
  title: string
}

export async function createMainWindow(
  BrowserWindow: BrowserWindowFactory,
  options: MainWindowOptions,
): Promise<BrowserWindowLike> {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: options.title,
    show: false,
    // 窗口图标（fix-45）：鲸游书海 brand 标派生——dev = 仓库根 build/icon.png（hostRoot
    // 上溯，解析单源 window/icon.ts）；打包形态 = {resources}/icon.png（assemble 物化）。
    // Windows 任务栏由 exe 内嵌图标（electron-builder win.icon = build/icon.ico）优先。
    icon: resolveWindowIconPath(process.env),
    // 窗口形态（fix-2，UI 走查 §2.1）：隐藏原生标题栏，窗口钮以 Windows Window Controls
    // Overlay 原生保留右上角（dsh 官方桌面形态基准；不自绘标题栏/窗口钮/拖拽条——后续里程碑面）
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      // 官方主题令牌静态实值（dsh-client-ui-theme 浅色 scope = 原型基准默认形态）：
      // --dsw-alias-bg-base → --dsw-static-neutral-bluish-00；symbolColor ← label-primary →
      // --dsw-static-neutral-bluish-1000。主题令牌属 renderer 面——host 无主题联动机制
      // （暗色 scope 对应实值 neutral-bluish-950 / -50，随机制裁决同步此注记）
      color: '#fff',
      symbolColor: '#0f1115',
      // Windows 官方系统 caption 刻度（100% DPI）——单源 window/titlebar.ts
      // （fix-40：preload 壳标记内联高度变量同源消费，防宿主-壳漂移）
      height: WINDOWS_TITLEBAR_HEIGHT,
    },
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // ESM preload（.mjs）须非沙箱渲染；contextIsolation 保持开（electron-ipc-security）
      sandbox: false,
    },
  })
  win.on('ready-to-show', () => win.show())
  await win.loadURL(options.url)
  return win
}
