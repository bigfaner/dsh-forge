import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

// Electron shell main entry (skeleton).
// Responsibilities (see docs/features/dsh-forge-m1/design/tech-design.md):
// window-lifecycle / tray / notifier / update-checker / host-supervisor /
// crash-recovery / single-instance / dsh-app:// protocol / i18n.

const DEV_SERVER_URL = process.env.DSH_FORGE_DEV_SERVER_URL

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.once('ready-to-show', () => win.show())
  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL)
  } else {
    void win.loadFile(join(__dirname, '../../src/shell-ui/index.html'))
  }
}

void app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
