// Harness 菜单三通道（fix-12 B——directory-picker-channel 同制：宿主↔renderer 装配胶，
// 官方应用菜单 Harness 族 web 同位搬运；域外直转面不进 FORGE_CHANNEL_ALLOWLIST——
// openPairingWindow/目录选取先例同径，负样例由单测自证）。三动作：
//   relaunch        = app.relaunch() + app.exit(0)（薄宿主进程即 runtime——重启 Harness；
//                     官方 restartHarness 语义、安全模式标志位随环境回收）
//   relaunchSafeMode = 安全模式标志置位 + relaunch（main 侧 ensureSafeModeProfile 隔离区
//                     承载 profile 切换——bootDshHost profileDir 参数即官方 runtime.start
//                     第二参对位；launch 参数经 DSH_FORGE_SAFE_MODE 环境变量跨进程存活）
//   showLog         = shell.showItemInFolder(harness.log)（官方 :22336 同径——日志文件缺席
//                     时先触ensure 落一行托管头，保证 showItemInFolder 有真实文件可达）
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { IpcMainLike } from './forge-channels.js'

/** renderer 侧消费名（preload dshForge 三成员 → 本三通道；族名 = dsh-forge:harness/*） */
export const HARNESS_RELAUNCH_CHANNEL = 'dsh-forge:harness/relaunch'
export const HARNESS_SAFE_MODE_CHANNEL = 'dsh-forge:harness/safe-mode'
export const HARNESS_SHOW_LOG_CHANNEL = 'dsh-forge:harness/show-log'

/** 安全模式启动标志（main 启动期消费——置位 = 以安全模式 profile 三件套启动本进程） */
export const HARNESS_SAFE_MODE_ENV = 'DSH_FORGE_SAFE_MODE'

/** Harness 菜单动作面（main 绑定注入——Electron 依赖隔离出本模块可单测） */
export interface HarnessActions {
  /** 重启 Harness（正常 profile——安全模式标志回收） */
  relaunch(): void
  /** 以安全模式重启（标志置位后 relaunch） */
  relaunchSafeMode(): void
  /** 查看日志（showItemInFolder；true = 已触发） */
  showLog(): boolean
}

/** 通道注册（负载零载荷三动作——renderer 侧只触发，无返回语义面） */
export function registerHarnessChannels(ipcMain: IpcMainLike, actions: HarnessActions): void {
  ipcMain.handle(HARNESS_RELAUNCH_CHANNEL, () => actions.relaunch())
  ipcMain.handle(HARNESS_SAFE_MODE_CHANNEL, () => actions.relaunchSafeMode())
  ipcMain.handle(HARNESS_SHOW_LOG_CHANNEL, () => actions.showLog())
}

/** 三通道注销集中面（before-quit 消费——与 DIRECTORY_PICKER 同制） */
export function removeHarnessChannels(ipcMain: Pick<IpcMainLike, 'removeHandler'>): void {
  for (const channel of [HARNESS_RELAUNCH_CHANNEL, HARNESS_SAFE_MODE_CHANNEL, HARNESS_SHOW_LOG_CHANNEL]) {
    ipcMain.removeHandler(channel)
  }
}

/**
 * harness.log 追加一行（fail-soft——目录/文件缺席即建；写失败静默，日志面永不炸宿主流程）。
 * 托管行 = 启动里程碑 + 菜单动作留痕（宿主 console 不落盘——本文件即「查看 Harness 日志」
 * 的单一等价物，官方 app.getPath('logs')/harness.log 对位）。
 */
export function noteHarnessLog(logPath: string, line: string): void {
  try {
    if (!existsSync(logPath)) mkdirSync(dirname(logPath), { recursive: true })
    appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`, 'utf8')
  } catch {
    // fail-soft：日志面缺席不阻断动作
  }
}
