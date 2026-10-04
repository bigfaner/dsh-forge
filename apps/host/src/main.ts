// @dsh-forge/host Electron 薄宿主入口（定位：装配，~100 行纪律——仅编排
// profile/ boot/ ipc/ window/ 四子模块，无业务语义；行数上限受结构 pin 机械约束）。
// S1 实测约束：ESM main 禁顶层 `await app.whenReady()`（死锁）——boot 全部入 void async。
// 1.5：主窗口改载自有壳（自定义 scheme dsh-forge://app/ 服务 apps/web dist，
// 非资产路由转发已认证 webserver；boot manifest 经 preload IPC 供壳消费）。
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, protocol, session, type OpenDialogOptions, type WebContents } from 'electron'
import { bootDshHost } from './boot/index.js'
import {
  BOOT_CHANNEL, createForgeIpc, DIRECTORY_PICKER_CHANNEL, DIRECTORY_PICKER_DIALOG_TITLE,
  refreshKnowledgeBindings, registerBootChannel, registerDirectoryPickerChannel, registerFsChannels,
  registerKnowledgeChannels, registerProjectsChannels, runStartupReconcile, withKnowledgeBindingsRefresh,
} from './ipc/index.js'
import { ensureProfileMaterialized, resolveHostPaths } from './profile/index.js'
import {
  acquireSingleInstance, authenticateWebHost, createMainWindow, createShellProtocolHandler,
  installShellStreamRewrite, registerShellScheme, resolveWebDistDir, SHELL_ENTRY_URL,
  SHELL_SCHEME, wireWindowLifecycle, type BrowserWindowLike,
} from './window/index.js'

app.setName('dsh-forge') // userData = {app-data}/dsh-forge（profile 首启落地根）
if (process.env.DSH_FORGE_USER_DATA) app.setPath('userData', process.env.DSH_FORGE_USER_DATA) // e2e 隔离（fix-26：在场兼作凭据桥关闭门——dshHome 已缺省隔离）
if (app.isPackaged) process.env.DSH_FORGE_RESOURCES_DIR ??= process.resourcesPath // 4.1：打包形态资源根（installAnchor/壳 dist 解析源）
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
    if (process.env.DSH_HOME) console.warn(`[host] shell 继承 DSH_HOME=${process.env.DSH_HOME} 压过 fix-26 缺省隔离（paths.ts 第三层）——确认有意（调试/特殊布局）`)
    process.env.DSH_HOME ??= paths.dshHome // 须先于 boot 重定向（fix-26：缺省隔离 {userData}/dsh-home 数据两界，凭据经 overlay 桥真 home）
    if (paths.form === 'packaged') {
      const landed = ensureProfileMaterialized(paths.profileDir)
      console.log(`[host] profile(${paths.form}) dir=${paths.profileDir} created=${landed.created.length}`)
      // e2e 首启自证钩子：仅落地不 boot，保活等待外部关闭（避免与 Playwright 握手竞速）
      if (process.env.DSH_FORGE_MATERIALIZE_ONLY === '1') return
    }
    const envPort = Number(process.env.DSH_FORGE_PORT ?? '')
    const port = Number.isInteger(envPort) && envPort > 0 ? envPort : 19400 + (process.pid % 400)
    const host = await bootDshHost({
      profileDir: paths.profileDir,
      installAnchor: paths.installAnchor,
      port,
      stateDb: paths.stateDb,
      bindingsFile: paths.bindingsFile,
      credentialsPath: paths.credentialsPath, // fix-26：非 USER_DATA 隔离态桥真 home 凭据
      resourcesDir: paths.resourcesDir, // 4.1：打包形态 boot child 取 runtime/host-dist 入口
    })
    const cookie = await authenticateWebHost(host.manifest.url) // 认证 URL → authority cookie（转发/ws 用）
    let hostRef: { url: string; cookie: string } | undefined = { url: host.manifest.url, cookie }
    protocol.handle(SHELL_SCHEME, createShellProtocolHandler({
      distRoot: resolveWebDistDir(process.env),
      host: () => hostRef,
    }))
    let mainWindow: BrowserWindowLike | undefined
    installShellStreamRewrite(session.defaultSession.webRequest, () => hostRef, (id) => mainWindow?.webContents.id === id)
    const forgeIpc = createForgeIpc(ipcMain) // forge:* 域面（handler 本体 2.4/3.5 注册进此机制）
    registerFsChannels(forgeIpc) // 宿主文件系统能力面（2.8 文件浏览器数据源，无 core 依赖即可注册）
    // 产品双服务接线（4.2——SMOKE-LEDGER §5 转正）：core 插件经 profile 装配 provide，
    // boot 面世后注册 forge:projects/* + forge:knowledge/* 两面；knowledge 绑定表随
    // boot 全量刷新 + 注册增量刷新（fail-soft——服务缺席记日志不注册，壳面不受损）
    if (host.services.forgeProjects !== undefined) {
      registerProjectsChannels(
        forgeIpc,
        withKnowledgeBindingsRefresh(host.services.forgeProjects, paths.bindingsFile),
      )
      void refreshKnowledgeBindings(host.services.forgeProjects, paths.bindingsFile)
      runStartupReconcile(host.services.forgeProjects) // fix-27：启动对账（§交互三）——悬空引用启动即修
    } else console.warn('[host] forgeProjects 服务缺席（core 插件行未装载）——forge:projects/* 通道未注册')
    if (host.services.forgeKnowledge !== undefined) {
      registerKnowledgeChannels(forgeIpc, host.services.forgeKnowledge)
    } else console.warn('[host] forgeKnowledge 服务缺席（core 插件行未装载）——forge:knowledge/* 通道未注册')
    registerBootChannel(ipcMain, () => host.manifest) // {url, injections} 注入 renderer（壳消费）
    // fix-14：官方 __DSH_DIRECTORY_PICKER__ 桥 main 半边——openDirectory 单选（取消 = null）
    // fix-21：parent 窗口形参 + 官方标题——showOpenDialog(父窗, options) = 对父窗模态 +
    // 前台置顶（Windows 失焦态点「＋」仍立即现于主窗之上）；parent 缺席（理论不可达）
    // → 回退无 parent 形参（fail-soft，不比 fix-14 现状差）。
    const pickDialogOptions: OpenDialogOptions = { properties: ['openDirectory'], title: DIRECTORY_PICKER_DIALOG_TITLE }
    registerDirectoryPickerChannel(
      ipcMain,
      (parent) => (parent === null
        ? dialog.showOpenDialog(pickDialogOptions)
        : dialog.showOpenDialog(parent as BrowserWindow, pickDialogOptions)),
      (sender) => BrowserWindow.fromWebContents(sender as WebContents),
    )
    const preloadPath = fileURLToPath(new URL('./ipc/preload.mjs', import.meta.url))
    mainWindow = await createMainWindow(BrowserWindow, { url: SHELL_ENTRY_URL, preloadPath, title: 'dsh-forge' })
    wireWindowLifecycle(app)
    app.on('before-quit', () => {
      forgeIpc.unregisterAll()
      ipcMain.removeHandler(BOOT_CHANNEL)
      ipcMain.removeHandler(DIRECTORY_PICKER_CHANNEL)
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
