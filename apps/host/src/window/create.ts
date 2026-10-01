// 主窗口创建（定位：基础——窗口生命周期；Security Mitigations：contextIsolation、
// 无 remote content、nodeIntegration 关）。BrowserWindow 以注入方式进入（测试可换 fake）。
export interface BrowserWindowLike {
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
