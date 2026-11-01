// Electron 实面绑定（定位：装配——main 纯编排纪律的 Electron 依赖隔离层）：
//   · 目录选取对话框实装（dialog.showOpenDialog + BrowserWindow.fromWebContents——
//     directory-picker-channel 的 main 注入面，测试注入 fake 即单测）；
//   · Harness 菜单三动作实装（relaunch / 安全模式 relaunch / showLog——官方 Harness
//     族 web 同位搬运；薄宿主进程即 runtime，重启 = relaunch + exit）；
//   · harness.log 路径单源（app.getPath('logs')/harness.log——官方 :22336 对位）。
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserWindow, OpenDialogOptions } from 'electron'
import type { HarnessActions } from './harness-channel.js'
import { HARNESS_SAFE_MODE_ENV, noteHarnessLog } from './harness-channel.js'
import type { OpenDirectoryDialog, ParentWindowResolver } from './directory-picker-channel.js'
import { DIRECTORY_PICKER_DIALOG_TITLE } from './directory-picker-channel.js'

// Electron 取法：子模块经 createRequire 取 CJS 面（官方 ESM 文档同径的稳健形态——
// 'electron' 的 ESM 具名导出面在非入口模块的可用性无契约保证，CJS require 恒稳）。
const { BrowserWindow: BrowserWindowCtor, dialog, shell } = createRequire(import.meta.url)('electron') as {
  BrowserWindow: typeof BrowserWindow
  dialog: { showOpenDialog(options: OpenDialogOptions): Promise<{ canceled: boolean; filePaths: string[] }>; showOpenDialog(win: BrowserWindow, options: OpenDialogOptions): Promise<{ canceled: boolean; filePaths: string[] }> }
  shell: { showItemInFolder(path: string): void; openPath(path: string): Promise<string> }
}

/** 本模块消费的 Electron app 切片（结构同型——测试可注入 fake） */
export interface ElectronAppSlice {
  relaunch(): void
  exit(code: number): void
  getPath(name: 'logs' | 'userData'): string
}

/**
 * 目录选取对话框实装：openDirectory 单选 + 官方对齐标题（fix-21）；defaultPath 形参
 * = renderer 下发起始目录（bug db7af09a）；parent 非空 → 父窗模态/置顶（fix-21）。
 */
export const electronDirectoryDialog: OpenDirectoryDialog = (parent = null, defaultPath?) => {
  const base: OpenDialogOptions = { properties: ['openDirectory'], title: DIRECTORY_PICKER_DIALOG_TITLE }
  const options: OpenDialogOptions = defaultPath === undefined ? base : { ...base, defaultPath }
  return parent === null
    ? dialog.showOpenDialog(options)
    : dialog.showOpenDialog(parent as BrowserWindow, options)
}

/** sender → 父窗解析（BrowserWindow.fromWebContents；无窗 → undefined 回退无 parent） */
export const parentWindowOf: ParentWindowResolver = (sender) => BrowserWindowCtor.fromWebContents(sender as never)

/** harness.log 路径（app.getPath('logs')/harness.log——官方对位单源） */
export function harnessLogPathOf(app: ElectronAppSlice): string {
  return join(app.getPath('logs'), 'harness.log')
}

/** diag JSONL 日志目录（{userData}/logs——app-*.jsonl 落点，telemetry host-wiring 单源对位） */
export function diagLogsDirOf(app: ElectronAppSlice): string {
  return join(app.getPath('userData'), 'logs')
}

/**
 * diag debug 运行期开关缝（1.14——main 注入 tele.appender 级别门 + tele.emit 诊断面；
 * 缺席 = 动作不可用返回 false，不炸宿主流程）。
 */
export interface DiagDebugToggleFace {
  setMinLevel(level: 'debug' | 'info'): void
  emit(enabled: boolean, message: string): void
}

/** Harness 菜单三动作实装（安全模式标志经环境变量跨进程存活——relaunch 环境承载）。
 *  第 4 参 = 测试注入缝（openPath 可替身；缺省 = 真 shell.openPath）。 */
export function electronHarnessActions(
  app: ElectronAppSlice,
  logPath: string,
  diagDebug?: DiagDebugToggleFace,
  inject?: { openPath?(path: string): Promise<string> },
): HarnessActions {
  let diagDebugEnabled = false // 开关态单源（唯一写点 = 本动作；appender 级别门由 setMinLevel 承载）
  const openDir = inject?.openPath ?? ((path: string) => shell.openPath(path))
  // bug a8d147e7 单窗口语义：触发面消费一次——去重窗（500ms）内的重复触发（真实双击/
  // 事件双发）不再次 openPath，杜绝 Explorer 同目录双开竞态；窗外触发照常打开。
  const DIAG_OPEN_DEDUPE_MS = 500
  let lastDiagOpenAt = -DIAG_OPEN_DEDUPE_MS - 1
  return {
    relaunch: () => {
      noteHarnessLog(logPath, '[host] 重启 Harness（菜单触发）')
      delete process.env[HARNESS_SAFE_MODE_ENV] // 正常重启：安全模式标志回收
      app.relaunch()
      app.exit(0)
    },
    relaunchSafeMode: () => {
      noteHarnessLog(logPath, '[host] 以安全模式重启（菜单触发）')
      process.env[HARNESS_SAFE_MODE_ENV] = '1'
      app.relaunch()
      app.exit(0)
    },
    showLog: () => {
      noteHarnessLog(logPath, '[host] 查看 Harness 日志（菜单触发）') // 保底落一行：文件恒可达
      shell.showItemInFolder(logPath)
      return true
    },
    showDiagLogs: () => {
      const now = Date.now()
      if (now - lastDiagOpenAt < DIAG_OPEN_DEDUPE_MS) return true // 去重窗内重复触发 = 已触发语义（不双开）
      const diagDir = diagLogsDirOf(app)
      try {
        noteHarnessLog(logPath, '[host] 查看诊断日志目录（菜单触发）') // 菜单动作留痕（与其余四动作同制；真机调用计数面）
        lastDiagOpenAt = now
        mkdirSync(diagDir, { recursive: true }) // 目录缺席即建（对位 showLog 的 ensure 头——openPath 恒有真实目录可达）
        void openDir(diagDir)
        return true
      } catch {
        return false // fail-soft：目录不可建时静默（打开面永不炸宿主流程）
      }
    },
    toggleDiagDebug: () => {
      if (diagDebug === undefined) return false // 缝缺席（测试/非装配形态）——动作不可用
      diagDebugEnabled = !diagDebugEnabled
      diagDebug.setMinLevel(diagDebugEnabled ? 'debug' : 'info') // 级别门翻转（默认 info 起）
      const message = `[host] diag debug ${diagDebugEnabled ? '开启' : '关闭'}（菜单触发——级别门 ${diagDebugEnabled ? 'debug' : 'info'}）`
      noteHarnessLog(logPath, message) // harness.log 双轨留痕（开关动作可观测）
      diagDebug.emit(diagDebugEnabled, message) // diag info 行恒落盘（info 过级别门）——开关事件本身可回放
      return diagDebugEnabled
    },
  }
}
