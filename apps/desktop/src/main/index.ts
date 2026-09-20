import { app, BrowserWindow, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { WEB_APP_DIST_DIR } from '@dsh-forge/desktop-host-vendor'
import { shellLog } from './log.ts'
import { SHELL_WEB_PREFERENCES } from './web-preferences.ts'
import { createHostSupervisor } from './host-supervisor/index.ts'
import { authenticateWebHost } from './protocol/web-document.ts'
import { createProtocolCarriage } from './protocol/carriage.ts'
import { installProtocolCarriage } from './protocol/bootstrap.ts'
import { registerShellScheme } from './protocol/scheme.ts'
import { SHELL_APP_URL } from './protocol/constants.ts'
import { claimShellSingleInstance, focusShellWindow } from './single-instance.ts'

// Electron shell main entry.
// Responsibilities (see docs/features/dsh-forge-m1/design/tech-design.md):
// window-lifecycle / tray / notifier / update-checker / host-supervisor /
// crash-recovery / single-instance / dsh-app:// protocol / i18n.
//
// This task (3.3) wires the SC7 foundation: the dsh-app:// scheme, the web
// asset + API traffic carriage over the host-protocol/wire seam, the
// `__DSH_TRANSPORT__` carrier boot IPC, and the shell-ui injection pipeline.

const DEV_SERVER_URL = process.env.DSH_FORGE_DEV_SERVER_URL

// Must run before app ready (upstream precedent: module-scope registration).
registerShellScheme()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: SHELL_WEB_PREFERENCES,
  })
  win.once('ready-to-show', () => win.show())
  const loaded = DEV_SERVER_URL ? win.loadURL(DEV_SERVER_URL) : win.loadURL(SHELL_APP_URL)
  void loaded.catch((error: unknown) => {
    shellLog.error({
      code: 'ERR_WINDOW_LOAD',
      message: 'main window failed to load the application document',
      data: { detail: error instanceof Error ? error.message : String(error) },
    })
  }).finally(() => {
    // Fallback show: a failed/empty document load must never leave the
    // window hidden (ready-to-show may not fire for error documents).
    if (!win.isDestroyed() && !win.isVisible()) win.show()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (['http:', 'https:'].includes(new URL(url).protocol)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).protocol !== 'dsh-app:') {
      event.preventDefault()
      if (['http:', 'https:'].includes(new URL(url).protocol)) void shell.openExternal(url)
    }
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    shellLog.error({
      code: 'ERR_RENDERER_GONE',
      message: 'shell renderer process terminated',
      data: { reason: details.reason, exitCode: details.exitCode },
    })
  })
  return win
}

function resolveProfileDir(): string {
  return process.env.DSH_FORGE_PROFILE_DIR ?? join(app.getPath('userData'), 'host-profile')
}

// Primary window registry for the second-instance focus path (F1). A closed
// window that left the shell resident in the tray is covered by the
// `undefined` branch of focusShellWindow (fresh primary window).
let mainWindow: BrowserWindow | undefined

function focusPrimaryWindow(): void {
  mainWindow = focusShellWindow(mainWindow, createWindow) as BrowserWindow
}

// F1: claim single-instance ownership before any profile lifecycle. The
// losing instance logs ERR_SINGLE_INSTANCE and exits inside the claim.
const ownsShellInstance = claimShellSingleInstance(app, focusPrimaryWindow)

void app.whenReady().then(() => {
  if (!ownsShellInstance) return

  shellLog.info({ code: 'SHELL_READY', message: 'electron shell started', data: { version: app.getVersion() } })

  const profileDir = resolveProfileDir()
  mkdirSync(profileDir, { recursive: true })

  // dsh-app:// carriage: web assets from the vendored web frontend dist,
  // API traffic forwarded to the authenticated upstream Host.
  const carriage = createProtocolCarriage({
    webRoot: process.env.DSH_FORGE_WEB_ROOT ?? WEB_APP_DIST_DIR,
    shellUiAssetPath: join(__dirname, 'shell-ui.js'),
  })

  // Boot IPC waits for a definitive Host outcome before answering the SPA.
  let notifyHostOutcome: () => void = () => {}
  const hostOutcome = new Promise<void>((resolve) => { notifyHostOutcome = resolve })
  installProtocolCarriage(carriage, { waitForHost: () => hostOutcome })

  const supervisor = createHostSupervisor(
    process.env.DSH_FORGE_HOST_ENTRY === undefined ? {} : { hostEntryPath: process.env.DSH_FORGE_HOST_ENTRY },
  )
  void supervisor.startHost(profileDir).then(async (handle) => {
    handle.onExit(() => {
      carriage.clearHost()
      shellLog.warn({ code: 'WARN_HOST_EXIT', message: 'host subprocess exited; dsh-app:// API carriage unbound', data: { pid: handle.pid } })
    })
    if (handle.boot === undefined) {
      shellLog.warn({ code: 'WARN_HOST_NO_BOOT_URL', message: 'host ready handshake carried no URL; API carriage stays unbound', data: { pid: handle.pid } })
      notifyHostOutcome()
      return
    }
    let cookie: string
    try {
      cookie = await authenticateWebHost(handle.boot.url)
    } catch (error) {
      shellLog.error({
        code: 'ERR_HOST_START_FAILED',
        message: 'host authentication failed',
        data: { detail: error instanceof Error ? error.message : String(error) },
      })
      notifyHostOutcome()
      return
    }
    carriage.setHost(handle.boot.url, cookie)
    carriage.setInjections(handle.boot.injections ?? [])
    shellLog.info({ code: 'CARRIAGE_READY', message: 'dsh-app:// carriage bound to host', data: { pid: handle.pid } })
    notifyHostOutcome()
  }).catch((error: unknown) => {
    shellLog.error({
      code: 'ERR_HOST_START_FAILED',
      message: 'host start failed; dsh-app:// API carriage unavailable',
      data: { detail: error instanceof Error ? error.message : String(error) },
    })
    notifyHostOutcome()
  })

  mainWindow = createWindow()
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
