// Electron 实面绑定（定位：装配——main 纯编排纪律的 Electron 依赖隔离层）：
//   · 目录选取对话框实装（dialog.showOpenDialog + BrowserWindow.fromWebContents——
//     directory-picker-channel 的 main 注入面，测试注入 fake 即单测）；
//   · Harness 菜单三动作实装（relaunch / 安全模式 relaunch / showLog——官方 Harness
//     族 web 同位搬运；薄宿主进程即 runtime，重启 = relaunch + exit）；
//   · harness.log 路径单源（app.getPath('logs')/harness.log——官方 :22336 对位）。
import { createRequire } from 'node:module'
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
  shell: { showItemInFolder(path: string): void }
}

/** 本模块消费的 Electron app 切片（结构同型——测试可注入 fake） */
export interface ElectronAppSlice {
  relaunch(): void
  exit(code: number): void
  getPath(name: 'logs'): string
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

/** Harness 菜单三动作实装（安全模式标志经环境变量跨进程存活——relaunch 环境承载） */
export function electronHarnessActions(app: ElectronAppSlice, logPath: string): HarnessActions {
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
  }
}
