import { app, BrowserWindow, ipcMain, Menu, session, shell, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { OFFICE_SKILLS_ASSETS_DIR, WEB_APP_DIST_DIR } from '@dsh-forge/desktop-host-vendor'
import { shellLog } from './log.ts'
import { SHELL_WEB_PREFERENCES } from './web-preferences.ts'
import { createHostSupervisor, type HostHandle } from './host-supervisor/index.ts'
import { authenticateWebHost } from './protocol/web-document.ts'
import { createProtocolCarriage, type ProtocolCarriage } from './protocol/carriage.ts'
import { installProtocolCarriage } from './protocol/bootstrap.ts'
import { registerShellScheme } from './protocol/scheme.ts'
import { SHELL_APP_URL } from './protocol/constants.ts'
import { claimShellSingleInstance, focusShellWindow } from './single-instance.ts'
import { createSessionFocus } from './session-focus/index.ts'
import { createShellTray, type ShellTray } from './tray/index.ts'
import { loadTrayIcon } from './tray/icon.ts'
import { init as initI18n, t } from './i18n/index.ts'
import { createUpdateChecker, fetchReleaseFeed } from './update-checker/index.ts'
import { UPDATE_CHECK_STARTUP_BUDGET_MS } from './update-checker/constants.ts'
import { createCrashRecovery, type RecoverySideEffect } from './crash-recovery/index.ts'
import { createUpdateBannerState } from './update-banner-state/index.ts'
import {
  HostProfileError,
  loadPluginBundlesConfig,
  PluginBundlesConfigError,
  projectHostProfile,
  type HostProfileProjection,
} from './host-profile/index.ts'
import type { UpdateCheck } from './update-checker/index.ts'
import { installShellVerbs, createRestartSequence, SHELL_PUSH_CHANNELS } from './ipc/index.ts'
import { WS_REWRITE_URL_FILTER, resolveWsHeaderRewrite } from './protocol/ws-header-rewrite.ts'
import { createPluginEnableGuard } from './plugin-runtime/guard.ts'
import { openDatabase } from './workbench/store/db.ts'
import { createWorkbenchEventSubscriptions, installWorkbenchVerbs } from './workbench/ipc/handlers.ts'
import { createWorkbenchIpcServices } from './workbench/ipc/services.ts'
import { readPluginManifestBundles } from './workbench/ipc/plugins.ts'

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
  // First-show latch: the load-failure fallback below must never re-show a
  // window the user sent to the tray (UF1 residency hide) after it had been
  // visible once — only a document that never became visible is rescued.
  let shownOnce = false
  win.once('show', () => { shownOnce = true })
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
    if (!win.isDestroyed() && !shownOnce && !win.isVisible()) win.show()
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
  // UF1: every primary window (initial, activate, tray restore) carries the
  // close-to-tray residency hook when the tray is present.
  tray?.attachCloseToResidency(win)
  return win
}

function resolveProfileDir(): string {
  return process.env.DSH_FORGE_PROFILE_DIR ?? join(app.getPath('userData'), 'host-profile')
}

// Task 2 (ui-plugin-foundation): the product-level plugin-bundles config is
// the plugin tree's single source of truth. Resolved like the other resource
// seams (env override > packaged resources dir > workspace resources/); read
// once at startup and never written — product manifest entries are read-only
// to runtime start/stop writers (AC5).
function resolvePluginBundlesConfigPath(): string {
  return process.env.DSH_FORGE_PLUGIN_BUNDLES
    ?? (app.isPackaged ? join(process.resourcesPath, 'plugin-bundles.json') : join(__dirname, '..', 'resources', 'plugin-bundles.json'))
}

// Dev anchor for `workspace:` materialization sources: walk up from the main
// bundle (apps/desktop/dist) to the workspace root (pnpm-workspace.yaml
// marker), so the depth change between src/ and dist/ cannot skew the anchor.
function resolveWorkspaceRoot(): string {
  let dir = __dirname
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return resolve(__dirname, '..', '..', '..')
}

// Primary window registry for the second-instance focus path (F1). A closed
// window that left the shell resident in the tray is covered by the
// `undefined` branch of focusShellWindow (fresh primary window).
let mainWindow: BrowserWindow | undefined

// UF1 tray (SC5): created after app-ready; undefined until then and on the
// Linux ERR_TRAY_UNAVAILABLE silent-degradation path (no residency there —
// closing the last window quits).
let tray: ShellTray | undefined

// Current host handle for the quit path (UF1 AC: 退出无孤儿进程).
let hostHandle: HostHandle | undefined

function focusPrimaryWindow(): void {
  mainWindow = focusShellWindow(mainWindow, createWindow) as BrowserWindow
}

// Interface 5 (session focus), frozen fallback per spike-3: no runtime
// channel into the upstream SPA exists, so focusSession always fronts the
// main window, toasts `toast.manualSwitch`, and returns false.
export const sessionFocus = createSessionFocus({
  focusMainWindow: focusPrimaryWindow,
  showToast: (message) => {
    if (mainWindow === undefined || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('dsh-forge:toast', message)
  },
})

// Interface 3 (update-checker): GH Releases atom feed over HTTPS read-only.
// openExternal goes through Electron's shell; openRelease enforces the
// build-time RELEASE_HOST/RELEASE_PATH_PREFIX allowlist before it runs.
export const updateChecker = createUpdateChecker({
  fetchText: fetchReleaseFeed,
  openExternal: url => shell.openExternal(url),
})

// Main → renderer push seam (task 5.3 integration): state pushes go only to
// the live primary window's webContents (the dsh-app:// main document). A
// missing/destroyed window drops the push silently — the renderer catches up
// through the getState pull verbs after (re)mount.
function pushToRenderer(channel: string, payload: unknown): void {
  if (mainWindow === undefined || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

// UF3 banner state machine (task 5.3): main owns the phase (hidden / queued /
// shown / dismissed); the renderer banner mirrors it over
// dsh-forge:update-state pushes + the update-get-state pull verb.
export const updateBannerState = createUpdateBannerState({
  onState: (state) => { pushToRenderer(SHELL_PUSH_CHANNELS.updateState, state) },
})

// Recovery-state side-effect fan-out (task 5.3 + 6.1 host-exit wiring): every
// machine transition is mirrored to the UF4 overlay (with failure.detail
// ≤120 chars on failed) and drives the banner queued-while-mask ladder (mask
// active during restarting/restoring/failed; exited on recovered). The
// `retry-scheduled` effect (backoff ladder tick) is what actually re-runs
// bootHost() — `bootAttempt` is (re)bound inside app-ready below, where the
// supervisor and profile dir exist.
let bootAttempt: () => void = () => {}
// disc-1: the protocol carriage lives inside app-ready, but recovery effects
// (first-boot start-failed) can only fire after app-ready ran — safe to bind
// through this late-bound reference.
let shellCarriage: ProtocolCarriage | undefined
function onRecoveryEffect(effect: RecoverySideEffect): void {
  if (effect.type === 'retry-scheduled') {
    bootAttempt()
    return
  }
  if (effect.type !== 'state-changed') return
  if (effect.to === 'failed') shellCarriage?.forceShellFallback()
  pushToRenderer(SHELL_PUSH_CHANNELS.recoveryState, {
    state: effect.to,
    ...(effect.context.failure === undefined ? {} : { reason: effect.context.failure.detail }),
  })
  updateBannerState.setMaskActive(effect.to === 'restarting' || effect.to === 'restoring' || effect.to === 'failed')
}

// Interface 2 (crash-recovery) instance for UF4 state; Interface 6 exposes its
// state to the renderer through the dshForge.recovery.getState verb and the
// dsh-forge:recovery-state push. Host-exit wiring (task 6.1): an unexpected
// host-subprocess exit dispatches `host-exit`; the machine's backoff ladder
// (2s/4s/8s, ≤3 attempts) drives real bootHost() retries through the
// retry-scheduled effect above, terminating in host-responsive → restoring →
// replay-complete → recovered, or retry-exhausted → failed (terminal).
export const crashRecovery = createCrashRecovery({ onEffect: onRecoveryEffect })

// True while the shell itself asked the host to stop (quit / restartApp /
// before-quit): those exits are NOT crashes and must not arm the recovery
// ladder (SC3: graceful shutdown never resurrects the host).
let hostStopIntentional = false

// UF3 run-level UpdateBannerState (in-memory, not persisted): dismiss is a
// terminal latch for this process; openRelease uses the last check's URL.
let updateBannerDismissed = false
let lastUpdateCheck: UpdateCheck | undefined

// Interface 6 (preload 语义动词): IPC whitelist + sender frame validation.
// restartApp ordering: shutdown host → release single-instance lock →
// relaunch → old process exits (no orphan host, SC3-preserving).
installShellVerbs(
  (channel, listener) => { ipcMain.handle(channel, listener as Parameters<typeof ipcMain.handle>[1]) },
  {
    dismiss: () => {
      updateBannerDismissed = true
      updateBannerState.dismiss()
      shellLog.info({ code: 'UPDATE_BANNER_DISMISSED', message: 'UF3 update banner dismissed for this run' })
    },
    openRelease: async () => {
      if (updateBannerDismissed) {
        // UpdateBannerState: dismissed is terminal for this run — the verb
        // stays a no-op afterwards (F4-D2 latch, reset only by relaunch).
        shellLog.warn({ code: 'ERR_UPDATE_URL_REJECTED', message: 'openRelease requested after the banner was dismissed for this run' })
        return
      }
      if (lastUpdateCheck?.releaseUrl === undefined) {
        shellLog.warn({ code: 'ERR_UPDATE_URL_REJECTED', message: 'openRelease requested with no known release URL (no successful update check yet)' })
        return
      }
      await updateChecker.openRelease(lastUpdateCheck.releaseUrl)
    },
    getState: () => updateBannerState.getState(),
  },
  {
    restartApp: createRestartSequence({
      disposeRecovery: () => crashRecovery.dispose(),
      shutdownHost: () => {
        hostStopIntentional = true
        return hostHandle === undefined ? Promise.resolve() : hostHandle.shutdown()
      },
      releaseSingleInstanceLock: () => app.releaseSingleInstanceLock(),
      relaunch: () => { app.relaunch() },
      exit: () => { app.exit(0) },
    }),
    getState: () => crashRecovery.context.state,
  },
)

// F1: claim single-instance ownership before any profile lifecycle. The
// losing instance logs ERR_SINGLE_INSTANCE and exits inside the claim.
const ownsShellInstance = claimShellSingleInstance(app, focusPrimaryWindow)

void app.whenReady().then(async () => {
  if (!ownsShellInstance) return

  // Interface 7: read-only locale resolution before any shell copy is used.
  await initI18n()

  shellLog.info({ code: 'SHELL_READY', message: 'electron shell started', data: { version: app.getVersion() } })

  const profileDir = resolveProfileDir()

  // Packaged wiring (task 6.2): in an installed app the vendored upstream
  // tree and the builtin Node runtime live under process.resourcesPath
  // (staged by scripts/assemble-app-resources.mjs, embedded as extraResources).
  // The workspace-relative vendor-seam defaults only resolve in dev/e2e —
  // resolve the packaged overrides before any consumer below.
  if (app.isPackaged) {
    const resourcesPath = process.resourcesPath
    process.env.DSH_FORGE_HOST_ENTRY ??= join(resourcesPath, 'vendor', 'vendored', 'apps', 'desktop-host', 'src', 'index.ts')
    process.env.DSH_FORGE_HOST_RUNTIME_DIR ??= join(resourcesPath, 'vendor', 'vendored', 'apps', 'desktop-host')
    process.env.DSH_FORGE_OFFICE_SKILLS ??= join(resourcesPath, 'vendor', 'vendored', 'packages', 'skill', 'skill-office', 'assets')
    process.env.DSH_FORGE_WEB_ROOT ??= join(resourcesPath, 'vendor', 'vendored', 'apps', 'web', 'dist')
    process.env.DSH_FORGE_NODE_EXE ??= join(resourcesPath, 'runtime', process.platform === 'win32' ? 'node.exe' : 'bin/node')
    shellLog.info({ code: 'PACKAGED_RESOURCES', message: 'packaged app resolving embedded resources', data: { resourcesPath } })
  }

  // Host profile + payload projection (disc-2 + task 2 config-ization): the
  // vendored host entry boots from (a) an application-owned profile project
  // (package.json `dsh.profile.bundles`, converged to the product config by
  // the projector's startup reconciliation; the host materializes its own
  // node_modules there in link mode) and (b) an office payload source whose
  // sibling office-skills/ asset tree is a hard boot requirement. Both live
  // app-owned under userData — never inside the upstream $DSH_HOME (SC8).
  // A missing/corrupt/invalid config or an unreconcilable projection fails
  // loud below (explicit start-failed path); the bundle list cannot be derived
  // from anywhere but the product config.
  let hostProfile: HostProfileProjection | undefined
  let profileFailure: string | undefined
  try {
    const pluginBundlesConfigPath = resolvePluginBundlesConfigPath()
    const pluginBundles = loadPluginBundlesConfig(pluginBundlesConfigPath)
    hostProfile = projectHostProfile({
      profileDir,
      officeSkillsSource: process.env.DSH_FORGE_OFFICE_SKILLS ?? OFFICE_SKILLS_ASSETS_DIR,
      bundles: pluginBundles.bundles,
      workspaceRoot: resolveWorkspaceRoot(),
      // Task 6: `tarball:` sources are staged next to the config in app
      // resources (dev: resources/, packaged: process.resourcesPath).
      resourcesRoot: dirname(pluginBundlesConfigPath),
      // Task 3.1: fold the runtime enable/disable overlay into the projection —
      // mandatory bundles assemble unconditionally, disabled third-party ones
      // are held out. Same file the setPluginEnabled verb writes (single state).
      overlayPath: join(app.getPath('userData'), 'plugin-runtime.json'),
    })
  } catch (error) {
    profileFailure = error instanceof Error ? error.message : String(error)
    shellLog.error({
      code: error instanceof PluginBundlesConfigError || error instanceof HostProfileError ? error.code : 'ERR_HOST_PROFILE',
      message: 'host profile projection from the product plugin-bundles config failed; host start aborted',
      data: { detail: profileFailure },
    })
  }

  // M2 task 2.7: workbench data kernel + the dshForge.workbench.* verb face.
  // The SQLite kernel boots before the window loads (every verb must already
  // be registered on ipcMain by then). A boot failure is an explicit startup
  // error carried by the M1 crash-recovery path — there is no silent
  // no-database degradation, and the verb face simply stays uninstalled.
  try {
    const userDataPath = app.getPath('userData')
    const workbenchDb = await openDatabase(userDataPath)
    const workbenchEvents = createWorkbenchEventSubscriptions()
    const pluginBundlesPath = resolvePluginBundlesConfigPath()
    const workbenchIpc = createWorkbenchIpcServices({
      db: workbenchDb.db,
      pluginBundlesPath,
      userDataPath,
      // 3.1 seam: the real guard (mandatory → ERR_PLUGIN_MANDATORY) replaces
      // the 2.7 stub at this assembly point — mandatory identity derives from
      // the same product manifest (G6, no second list); setPluginEnabled
      // stays the single write path into plugin-runtime.json.
      pluginGuard: createPluginEnableGuard(() => readPluginManifestBundles(pluginBundlesPath)),
      onEvents: workbenchEvents.sink,
    })
    installWorkbenchVerbs(
      (channel, listener) => { ipcMain.handle(channel, listener as Parameters<typeof ipcMain.handle>[1]) },
      workbenchIpc.verbs,
      workbenchEvents,
    )
    workbenchIpc.start()
    shellLog.info({
      code: 'WORKBENCH_READY',
      message: 'workbench data kernel booted; dshForge.workbench verb face installed',
      data: { dbPath: workbenchDb.path },
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    shellLog.error({
      code: 'ERR_WORKBENCH_DB',
      message: 'workbench database boot failed; the workbench verb face is not installed',
      data: { detail },
    })
    try {
      crashRecovery.dispatch('start-failed', detail)
    } catch { /* already terminal (an earlier failure owns the state) */ }
  }

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
  shellCarriage = carriage

  // WS header-rewrite layer (ported from upstream main.ts): the renderer's
  // stream client opens a DIRECT WebSocket to the Host origin, which the
  // Host's Origin fence would 403/401 — rewrite origin/cookie/sec-fetch-site
  // for main-window WS traffic toward the bound host authority. Registered
  // once; reads the carriage's mutable host binding on every request, and
  // passes anything else (including a foreign origin claiming our scheme —
  // cancelled) through the pure decision in ws-header-rewrite.ts.
  session.defaultSession.webRequest.onBeforeSendHeaders(WS_REWRITE_URL_FILTER, (details, callback) => {
    const binding = carriage.hostBinding()
    const result = resolveWsHeaderRewrite({
      hostUrl: binding?.url,
      hostCookie: binding?.cookie,
      mainWebContentsId: mainWindow === undefined || mainWindow.isDestroyed() ? undefined : mainWindow.webContents.id,
      details: { url: details.url, webContentsId: details.webContentsId, requestHeaders: details.requestHeaders },
    })
    if (result.passthrough) {
      callback({})
      return
    }
    if (result.cancel) {
      callback({ cancel: true })
      return
    }
    callback({ requestHeaders: result.requestHeaders })
  })

  const supervisor = createHostSupervisor(
    {
      // The host loads its plugin profile from the project dir's package.json
      // (HOST_PROFILE_INITIALIZED in the projector) — dev/packaged both use
      // the profile dir; argv[2] runtimeDir defaults to the vendored
      // desktop-host dir (packaged: DSH_FORGE_HOST_RUNTIME_DIR below).
      ...(process.env.DSH_FORGE_HOST_RUNTIME_DIR === undefined ? {} : { runtimeDir: process.env.DSH_FORGE_HOST_RUNTIME_DIR }),
      ...(hostProfile?.primaryRuntimeSource === undefined ? {} : { primaryRuntimeSource: hostProfile.primaryRuntimeSource }),
      ...(process.env.DSH_FORGE_HOST_ENTRY === undefined ? {} : { hostEntryPath: process.env.DSH_FORGE_HOST_ENTRY }),
      ...(process.env.DSH_FORGE_NODE_EXE === undefined ? {} : { nodeExecutable: process.env.DSH_FORGE_NODE_EXE }),
    },
  )

  // One full host boot cycle: start → handshake → authenticate → carriage
  // bind. Throws on any failure (caller decides first-boot vs retry path).
  // `onHostReady` fires only on a successful bind (the first boot resolves the
  // SPA boot gate; recovery boots skip it — the outcome already resolved).
  async function bootHost(onHostReady?: () => void): Promise<void> {
    const handle = await supervisor.startHost(profileDir)
    hostHandle = handle
    crashRecovery.setAttempts(supervisor.recoveryContext.attempts)
    handle.onExit((code, signal) => {
      carriage.clearHost()
      if (hostStopIntentional) return
      shellLog.warn({ code: 'WARN_HOST_EXIT', message: 'host subprocess exited unexpectedly; arming crash recovery', data: { pid: handle.pid, code, signal } })
      try {
        crashRecovery.dispatch('host-exit', `host exited unexpectedly (code=${String(code)}, signal=${String(signal)})`)
      } catch (error) {
        // Illegal only if the machine already left idle (double exit while a
        // ladder is armed) — the running ladder owns that window.
        shellLog.warn({ code: 'WARN_RECOVERY_DISPATCH_REJECTED', message: 'host-exit dispatch rejected by the recovery machine', data: { detail: error instanceof Error ? error.message : String(error) } })
      }
    })
    if (handle.boot === undefined) {
      shellLog.warn({ code: 'WARN_HOST_NO_BOOT_URL', message: 'host ready handshake carried no URL; API carriage stays unbound', data: { pid: handle.pid } })
      throw new Error('host ready handshake carried no URL')
    }
    const cookie = await authenticateWebHost(handle.boot.url)
    carriage.setHost(handle.boot.url, cookie)
    carriage.setInjections(handle.boot.injections ?? [])
    shellLog.info({ code: 'CARRIAGE_READY', message: 'dsh-app:// carriage bound to host', data: { pid: handle.pid } })
    onHostReady?.()
  }

  // Recovery ladder tick (retry-scheduled effect): one real restart attempt.
  // Success walks host-responsive → restoring → replay-complete → recovered
  // (session replay = session-list 对账, carried by the rebooted host's next
  // session event; the immediate replay-complete marks the carriage rebound).
  // Failure mirrors the supervisor's incremented attempts counter into the
  // machine, which arms the next backoff step or abandons (retry-exhausted).
  let bootInFlight = false
  bootAttempt = () => {
    if (bootInFlight) return // a slow handshake still pending — never double-spawn
    bootInFlight = true
    void bootHost().then(() => {
      bootInFlight = false
      crashRecovery.dispatch('host-responsive')
      crashRecovery.dispatch('replay-complete')
    }).catch((error: unknown) => {
      bootInFlight = false
      shellLog.error({
        code: 'ERR_HOST_START_FAILED',
        message: 'host restart attempt failed (recovery ladder continues or abandons)',
        data: { detail: error instanceof Error ? error.message : String(error) },
      })
      try {
        crashRecovery.setAttempts(supervisor.recoveryContext.attempts)
      } catch { /* attempts already terminal — failed state owns the outcome */ }
    })
  }

  // First boot: a spawn/handshake/auth failure goes straight to the terminal
  // failed state (F1 直进失败态, tech-design Interface 2) with the UF4 overlay
  // presenting the failure detail; it never arms the retry ladder. A config or
  // profile-projection failure short-circuits the spawn through the same
  // explicit path (task 2 error contract: never a silent startup crash).
  if (profileFailure !== undefined) {
    try {
      crashRecovery.dispatch('start-failed', profileFailure)
    } catch { /* already terminal (an earlier host-exit ladder owns state) */ }
    notifyHostOutcome()
  } else {
    void bootHost(notifyHostOutcome).catch((error: unknown) => {
      shellLog.error({
        code: 'ERR_HOST_START_FAILED',
        message: 'host start failed; dsh-app:// API carriage unavailable',
        data: { detail: error instanceof Error ? error.message : String(error) },
      })
      try {
        crashRecovery.dispatch('start-failed', error instanceof Error ? error.message : String(error))
      } catch { /* already terminal (e.g. an earlier host-exit ladder owns state) */ }
      notifyHostOutcome()
    })
  }

  // UF1 tray (SC5): native menu + close-to-tray residency. On Linux without
  // a system tray the creation failure degrades silently (ERR_TRAY_UNAVAILABLE,
  // log only) and residency stays off — close then quits as before.
  tray = createShellTray({
    icon: loadTrayIcon(),
    createTray: icon => new Tray(icon as Electron.NativeImage),
    buildMenu: template => Menu.buildFromTemplate(template),
    copy: key => t(key),
    focusMainWindow: focusPrimaryWindow,
    quitApp: () => {
      void app.quit()
    },
  })

  mainWindow = createWindow()

  // Interface 3 (UF3 / F4 / SC6): the update check starts at app-ready and
  // must resolve within 60s of startup. It never blocks startup and never
  // surfaces a dialog on failure — offline/unreachable degrades silently to
  // `unavailable` with an ERR_UPDATE_FEED_UNREACHABLE log (SC2). The UF3
  // banner presentation (update-available → shell-ui overlay) lands with the
  // notifier/banner task; here we only record the outcome.
  const updateCheckStartedAt = Date.now()
  void updateChecker.check(app.getVersion()).then((result) => {
    lastUpdateCheck = result
    // UF3: update-available feeds the banner state machine (queued while the
    // UF4 mask is up, shown otherwise); up-to-date/unavailable stay hidden.
    if (result.status === 'update-available' && result.latestVersion !== undefined) {
      updateBannerState.reportAvailable(result.latestVersion)
    }
    const elapsedMs = Date.now() - updateCheckStartedAt
    if (elapsedMs > UPDATE_CHECK_STARTUP_BUDGET_MS) {
      shellLog.warn({
        code: 'ERR_UPDATE_FEED_UNREACHABLE',
        message: 'update check exceeded the SC6 60s startup budget',
        data: { elapsedMs },
      })
    } else {
      shellLog.info({
        code: 'UPDATE_CHECK_DONE',
        message: 'startup update check resolved',
        data: { status: result.status, latestVersion: result.latestVersion, elapsedMs },
      })
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

// UF1 AC (退出无孤儿进程): every quit path (tray menu, window-all-closed,
// OS signal) funnels through before-quit, which first tears the tray down
// (icon removed + residency latch released so the window close is not
// intercepted) and only lets the app exit after the host subprocess settled.
let quitSettled = false
app.on('before-quit', (event) => {
  if (quitSettled) return
  event.preventDefault()
  quitSettled = true
  hostStopIntentional = true
  tray?.destroy()
  const settleHost = hostHandle === undefined ? Promise.resolve() : hostHandle.shutdown()
  void settleHost.finally(() => {
    app.quit()
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
