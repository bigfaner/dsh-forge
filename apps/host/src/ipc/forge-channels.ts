// forge:* RPC 通道注册机制 + allowlist 校验（定位：基础——机制与骨架；
// 通道 handler 本体属 core，2.4/3.5 注册）。allowlist 唯一源 = @dsh-forge/contracts
// channels.ts（Interface 4；electron-ipc-security 约定：未列通道拒绝）。
import { FORGE_CHANNEL_ALLOWLIST, type ForgeChannel } from '@dsh-forge/contracts'

/** Electron ipcMain 结构面（测试注入 fake；真身由 main 传入） */
export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
  removeHandler(channel: string): void
}

export type ForgeChannelHandler = (event: unknown, ...args: unknown[]) => unknown

export interface ForgeIpc {
  /** 注册单通道：非 allowlist / 重复注册即抛（fail-loud，不静默降级） */
  register(channel: ForgeChannel, handler: ForgeChannelHandler): void
  /** 已注册通道（只读快照，测试/诊断面） */
  registered(): readonly string[]
  /** 全量注销（app 关停清理面） */
  unregisterAll(): void
}

export function createForgeIpc(ipcMain: IpcMainLike): ForgeIpc {
  const channels = new Set<string>()
  const allow = new Set<string>(FORGE_CHANNEL_ALLOWLIST)
  return {
    register(channel, handler) {
      if (!allow.has(channel)) {
        throw new Error(
          `[host:ipc] 通道不在 allowlist，拒绝注册：${channel}（唯一源 = @dsh-forge/contracts channels；新通道须三处一体：contracts → web/rpc → core 域）`,
        )
      }
      if (channels.has(channel)) throw new Error(`[host:ipc] 通道重复注册：${channel}`)
      channels.add(channel)
      ipcMain.handle(channel, handler)
    },
    registered: () => [...channels],
    unregisterAll() {
      for (const channel of channels) ipcMain.removeHandler(channel)
      channels.clear()
    },
  }
}
