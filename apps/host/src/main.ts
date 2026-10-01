// @dsh-forge/host Electron 薄宿主入口（定位：装配，~100 行纪律——仅编排
// profile/ boot/ ipc/ window/ 四子模块，无业务语义；行数上限受结构 pin 机械约束）。
// S1 实测约束：ESM main 禁顶层 `await app.whenReady()`（死锁）——boot 全部入 void async。
// 1.5：主窗口改载自有壳（自定义 scheme dsh-forge://app/ 服务 apps/web dist，
// 非资产路由转发已认证 webserver；boot manifest 经 preload IPC 供壳消费）。
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, protocol, session } from 'electron'
import { bootDshHost } from './boot/index.js'
import { BOOT_CHANNEL, createForgeIpc, registerBootChannel } from './ipc/index.js'
import { ensureProfileMaterialized, resolveHostPaths } from './profile/index.js'
import {
  acquireSingleInstance, authenticateWebHost, createMainWindow, createShellProtocolHandler,
  installShellStreamRewrite, registerShellScheme, resolveWebDistDir, SHELL_ENTRY_URL,
  SHELL_SCHEME, wireWindowLifecycle, type BrowserWindowLike,
} from './window/index.js'

app.setName('dsh-forge') // userData = {app-data}/dsh-forge（profile 首启落地根）
if (process.env.DSH_FORGE_USER_DATA) app.setPath('userData', process.env.DSH_FORGE_USER_DATA)
registerShellScheme(protocol) // 特权 scheme 注册一次性，须先于 app ready

const watchdog = setTimeout(() => {
  console.error('[host] boot watchdog 超时（180s）')
  app.exit(3)
}, 180_000)
watchdog.unref()

void (async () => {
  if (!acquireSingleInstance(app)) return // 已有实例持锁：quit 已请求，静默退出
  try {
    await app.whenReady()
    const paths = resolveHostPaths(process.env, app.getPath('userData'))
    process.env.DSH_HOME ??= paths.dshHome // S1 pin：DSH_HOME 须先于 boot 重定向隔离
    if (paths.form === 'packaged') {
      const landed = ensureProfileMaterialized(paths.profileDir)
      console.log(`[host] profile(${paths.form}) dir=${paths.profileDir} created=${landed.created.length}`)
      // e2e 首启自证钩子：仅落地不 boot，保活等待外部关闭（避免与 Playwright 握手竞速）
      if (process.env.DSH_FORGE_MATERIALIZE_ONLY === '1') return
    }
    const envPort = Number(process.env.DSH_FORGE_PORT ?? '')
    const port = Number.isInteger(envPort) && envPort > 0 ? envPort : 19400 + (process.pid % 400)
    const host = await bootDshHost({ profileDir: paths.profileDir, installAnchor: paths.installAnchor, port })
    const cookie = await authenticateWebHost(host.manifest.url) // 认证 URL → authority cookie（转发/ws 用）
    let hostRef: { url: string; cookie: string } | undefined = { url: host.manifest.url, cookie }
    protocol.handle(SHELL_SCHEME, createShellProtocolHandler({
      distRoot: resolveWebDistDir(process.env),
      host: () => hostRef,
    }))
    let mainWindow: BrowserWindowLike | undefined
    installShellStreamRewrite(session.defaultSession.webRequest, () => hostRef, (id) => mainWindow?.webContents.id === id)
    const forgeIpc = createForgeIpc(ipcMain) // forge:* 域面（handler 本体 2.4/3.5 注册进此机制）
    registerBootChannel(ipcMain, () => host.manifest) // {url, injections} 注入 renderer（壳消费）
    const preloadPath = fileURLToPath(new URL('./ipc/preload.mjs', import.meta.url))
    mainWindow = await createMainWindow(BrowserWindow, { url: SHELL_ENTRY_URL, preloadPath, title: 'dsh-forge' })
    wireWindowLifecycle(app)
    app.on('before-quit', () => {
      forgeIpc.unregisterAll()
      ipcMain.removeHandler(BOOT_CHANNEL)
      hostRef = undefined
      void host.shutdown()
    })
    console.log(`[host] 壳窗口就绪 entry=${SHELL_ENTRY_URL} dist=${resolveWebDistDir(process.env)} injections=${host.manifest.injections.length}`)
  } catch (error) {
    console.error(`[host] 启动失败：${String((error as Error)?.stack ?? error)}`)
    app.exit(1)
  } finally {
    clearTimeout(watchdog)
  }
})()
