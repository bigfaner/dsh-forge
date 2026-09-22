// workbench/ipc/sender-validate — sender frame 校验(任务 2.7)。
//
// TECH-electron-ipc-001(M1 ipc/index.ts 的 assertVerbSender 同款纪律):
// 每条 workbench 动词 handler 在做任何工作前复核 sender frame —— 非
// dsh-app://app/ 主文档来源的 invoke 一律拒绝 AND 记录
// (ERR_IPC_SENDER_REJECTED)。白名单通道集见 channel-allowlist.ts:未注册
// 通道由 Electron 以 "No handler registered" 拒绝,注册通道由本校验拒绝。

import { shellLog } from '../../log.ts'
import { SHELL_APP_ORIGIN } from '../../protocol/constants.ts'
import type { WorkbenchVerbChannel } from './channel-allowlist.ts'

/**
 * 最小事件形状(Electron IpcMainInvokeEvent 子集,测试注入假体)。`sender`
 * 仅订阅/退订动词消费(事件推送登记需要 webContents 句柄)。
 */
export interface WorkbenchVerbEvent {
  readonly senderFrame?: { readonly url: string } | undefined
  readonly sender?: WorkbenchEventSender | undefined
}

/** webContents 最小面(事件推送 send + destroyed 生命周期钩子)。 */
export interface WorkbenchEventSender {
  send(channel: string, ...args: unknown[]): void
  once(event: 'destroyed', listener: () => void): void
  isDestroyed(): boolean
}

/**
 * Sender frame validation shared by every workbench verb handler. Rejects
 * (throw) AND logs any frame that is not the dsh-app://app/ main document —
 * the exact discipline the M1 dshForge update/recovery verbs enforce.
 */
export function assertWorkbenchSender(channel: WorkbenchVerbChannel, event: WorkbenchVerbEvent): void {
  const frameUrl = event.senderFrame?.url ?? ''
  if (!frameUrl.startsWith(`${SHELL_APP_ORIGIN}/`)) {
    shellLog.error({
      code: 'ERR_IPC_SENDER_REJECTED',
      message: 'rejected workbench verb IPC from an unowned frame',
      data: { channel, frameUrl },
    })
    throw new Error(`dsh-forge: rejected ${channel} IPC from an unowned frame`)
  }
}
