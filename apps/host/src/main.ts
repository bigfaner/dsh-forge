// @dsh-forge/host Electron 薄宿主入口（定位：装配，~100 行纪律——仅编排
// profile/ boot/ ipc/ window/ 四子模块，无业务语义；行数上限受结构 pin 机械约束）。
// S1 实测约束：ESM main 禁顶层 `await app.whenReady()`（死锁）——boot 全部入 void async。
// 1.5：主窗口改载自有壳（自定义 scheme dsh-forge://app/ 服务 apps/web dist，
// 非资产路由转发已认证 webserver；boot manifest 经 preload IPC 供壳消费）。
// Electron 实面绑定（对话框/Harness 动作）下沉 ipc/electron-bindings——main 零直用。
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, protocol, session, shell } from 'electron'
import { bootDshHost } from './boot/index.js'
import {
  BOOT_CHANNEL, createForgeIpc, DIRECTORY_PICKER_CHANNEL, electronDirectoryDialog,
  electronHarnessActions, harnessLogPathOf, HARNESS_SAFE_MODE_ENV, noteHarnessLog,
  parentWindowOf, refreshKnowledgeBindings, registerBootChannel, registerDirectoryPickerChannel,
  registerFsChannels, registerHarnessChannels, registerKnowledgeChannels, registerM2Channels,
  registerProjectsChannels, removeHarnessChannels, removeTunnelChannel, runStartupReconcile,
  registerTunnelChannel, withKnowledgeBindingsRefresh,
} from './ipc/index.js'
import { ensureProfileMaterialized, ensureSafeModeProfile, resolveHostPaths } from './profile/index.js'
import {
  acquireSingleInstance, authenticateWebHost, createMainWindow, createShellProtocolHandler,
  installShellStreamRewrite, registerShellScheme, resolveWebDistDir, SHELL_ENTRY_URL,
  SHELL_SCHEME, wireDevToolsToggle, wireWindowLifecycle, type BrowserWindowLike,
} from './window/index.js'

app.setName('dsh-forge') // userData = {app-data}/dsh-forge（profile 首启落地根）
if (process.env.DSH_FORGE_USER_DATA) app.setPath('userData', process.env.DSH_FORGE_USER_DATA) // e2e 隔离（fix-26：在场兼作凭据桥关闭门——dshHome 已缺省隔离）
if (app.isPackaged) process.env.DSH_FORGE_RESOURCES_DIR ??= process.resourcesPath // 4.1：打包形态资源根（installAnchor/壳 dist 解析源）
registerShellScheme(protocol) // 特权 scheme 注册一次性，须先于 app ready

const watchdog = setTimeout(() => {
  console.error('[host] boot watchdog 超时（180s）')
  app.exit(3)
}, 180_000).unref()
const PORT_FALLBACK = { base: 19400, span: 400 } as const // 兜底端口基址/展幅（DSH_FORGE_PORT 缺席/非法时 pid 摊开避碰撞）
void (async () => {
  if (!acquireSingleInstance(app)) return // 已有实例持锁：quit 已请求，静默退出
  try {
    await app.whenReady()
    const paths = resolveHostPaths(process.env, app.getPath('userData'))
    if (process.env.DSH_HOME) console.warn(`[host] shell 继承 DSH_HOME=${process.env.DSH_HOME} 压过 fix-26 缺省隔离（paths.ts 第三层）——确认有意（调试/特殊布局）`)
    process.env.DSH_HOME ??= paths.dshHome // 须先于 boot 重定向（fix-26：缺省隔离 {userData}/dsh-home 数据两界，凭据经 overlay 桥真 home）
    // fix-12 B：安全模式（HARNESS_SAFE_MODE_ENV 跨进程存活——relaunch 环境承载 profile
    // 切换；安全模式 = 官方基座三件套隔离区，跳过用户层与第三方 bundle）。
    let profileDir = paths.profileDir
    if (process.env[HARNESS_SAFE_MODE_ENV] === '1') {
      profileDir = ensureSafeModeProfile(paths.dshHome).directory
      console.warn(`[host] safe mode：以安全模式 profile 启动 dir=${profileDir}（用户层/第三方 bundle 跳过）`)
    }
    if (paths.form === 'packaged' && profileDir === paths.profileDir) {
      const landed = ensureProfileMaterialized(paths.profileDir)
      console.log(`[host] profile(${paths.form}) dir=${paths.profileDir} created=${landed.created.length}`)
      if (process.env.DSH_FORGE_MATERIALIZE_ONLY === '1') return // e2e 首启自证钩子：仅落地不 boot，保活等待外部关闭
    }
    const envPort = Number(process.env.DSH_FORGE_PORT ?? '')
    const port = Number.isInteger(envPort) && envPort > 0 ? envPort : PORT_FALLBACK.base + (process.pid % PORT_FALLBACK.span)
    const host = await bootDshHost({
      profileDir,
      installAnchor: paths.installAnchor,
      port,
      stateDb: paths.stateDb,
      bindingsFile: paths.bindingsFile,
      tasksHome: paths.tasksHome, settingsFile: paths.settingsFile, // core 行 config 双注：3.4 派生根（四域装配门）+ 3.8 设置域存储（forgeSettings 装配门）
      skillsDir: paths.skillsDir, specSkillsDir: paths.specSkillsDir, // skills 物理挂载（M3 3.7：core/spec 双目录——预设 customSkillDirs 物化锚）
      credentialsPath: paths.credentialsPath, resourcesDir: paths.resourcesDir, // fix-26 隔离态凭据桥真 home + 4.1 打包资源根（boot child runtime/host-dist 入口）
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
    registerM2Channels(forgeIpc, host, () => mainWindow?.webContents, shell.openPath) // M2 四族+derive 注册（缺席 fail-soft 记 warn）+ 写推送事件广播（交互二）
    // 产品双服务接线（4.2 转正）：core 经 profile 装配 provide，boot 面世后注册
    // forge:projects/* + forge:knowledge/*；绑定表随 boot 全量刷新 + 增量刷新（fail-soft）。
    if (host.services.forgeProjects !== undefined) {
      registerProjectsChannels(forgeIpc, withKnowledgeBindingsRefresh(host.services.forgeProjects, paths.bindingsFile))
      void refreshKnowledgeBindings(host.services.forgeProjects, paths.bindingsFile)
      runStartupReconcile(host.services.forgeProjects) // fix-27：启动对账（§交互三）——悬空引用启动即修
    } else console.warn('[host] forgeProjects 服务缺席（core 插件行未装载）——forge:projects/* 通道未注册')
    if (host.services.forgeKnowledge !== undefined) {
      registerKnowledgeChannels(forgeIpc, host.services.forgeKnowledge)
    } else console.warn('[host] forgeKnowledge 服务缺席（core 插件行未装载）——forge:knowledge/* 通道未注册')
    registerBootChannel(ipcMain, () => host.manifest) // {url,injections} 注入 renderer（壳消费）
    registerDirectoryPickerChannel(ipcMain, electronDirectoryDialog, parentWindowOf) // fix-14/fix-21/bug db7af09a：Electron 实装下沉 electron-bindings
    let harnessLogPath: string | undefined // 先声明后赋值：diag 订阅先挂（child 早到诊断行零丢失窗）
    // fix-23 诊断日志落盘链：child [pair-diag] 决策行经桥 diag 消息回流 → harness.log 同链
    host.onDiag((line) => {
      if (harnessLogPath !== undefined) noteHarnessLog(harnessLogPath, line)
    })
    harnessLogPath = harnessLogPathOf(app) // fix-12 B：Harness 菜单三通道（relaunch/安全模式/showLog——实装下沉 electron-bindings）
    noteHarnessLog(harnessLogPath, `[host] 启动（form=${paths.form} profile=${profileDir} safeMode=${process.env[HARNESS_SAFE_MODE_ENV] === '1' ? '是' : '否'}）`)
    registerHarnessChannels(ipcMain, electronHarnessActions(app, harnessLogPath))
    // fix-17 ② + fix-18：tab 重连/换线/PIN 重置三缝（dshForge 直转面——转发对应消息至 boot child）
    registerTunnelChannel(ipcMain, {
      toggle: () => host.toggleTunnel?.(),
      fallback: () => host.fallbackTunnel?.(),
      pinReset: () => host.resetPin?.(),
    })
    const preloadPath = fileURLToPath(new URL('./ipc/preload.mjs', import.meta.url))
    mainWindow = await createMainWindow(BrowserWindow, { url: SHELL_ENTRY_URL, preloadPath, title: 'dsh-forge' })
    if (!app.isPackaged) wireDevToolsToggle((mainWindow as BrowserWindow).webContents) // 开发态 F12 按需开关（打包形态零面）
    wireWindowLifecycle(app)
    app.on('before-quit', () => {
      forgeIpc.unregisterAll()
      for (const channel of [BOOT_CHANNEL, DIRECTORY_PICKER_CHANNEL]) ipcMain.removeHandler(channel)
      removeHarnessChannels(ipcMain)
      removeTunnelChannel(ipcMain) // fix-17 ②：隧道重连缝清理面
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
