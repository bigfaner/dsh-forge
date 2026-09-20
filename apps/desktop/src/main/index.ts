import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { shellLog } from './log.ts'
import { SHELL_WEB_PREFERENCES } from './web-preferences.ts'

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
    webPreferences: SHELL_WEB_PREFERENCES,
  })
  win.once('ready-to-show', () => win.show())
  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL)
  } else {
    void win.loadFile(join(__dirname, '../src/shell-ui/index.html'))
  }
  win.webContents.on('render-process-gone', (_event, details) => {
    shellLog.error({
      code: 'ERR_RENDERER_GONE',
      message: 'shell renderer process terminated',
      data: { reason: details.reason, exitCode: details.exitCode },
    })
  })
}

void app.whenReady().then(() => {
  shellLog.info({ code: 'SHELL_READY', message: 'electron shell started', data: { version: app.getVersion() } })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  shellLog.info({ code: 'SHELL_WINDOWS_CLOSED', message: 'all shell windows closed' })
  if (process.platform !== 'darwin') app.quit()
})

process.on('uncaughtException', (error) => {
  shellLog.error({
    code: 'ERR_MAIN_UNCAUGHT',
    message: 'uncaught exception in main process',
    data: { name: error.name, detail: error.message },
  })
})
