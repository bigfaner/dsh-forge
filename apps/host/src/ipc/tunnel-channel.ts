// fix-17 ②：隧道 tab 重连缝 IPC 通道（定位：基础——dshForge 域外直转面先例同制：
// harness-channel 同构，不进 forge invoke allowlist）。UI 切互联网 tab 隧道不在线时
// renderer 经 window.dshForge.tunnelToggle() 触达；handler 本体 = main 侧转发
// tunnel-toggle 消息至 boot child（child 侧隧道分支消费——离线建立 / 在线重推读数）。
import type { IpcMainLike } from './forge-channels.js'

/** 通道名（dshForge 直转面命名制——非 forge: 前缀，不经 FORGE_CHANNEL_ALLOWLIST） */
export const TUNNEL_TOGGLE_CHANNEL = 'dsh-forge:remote/tunnel-toggle'

/** 隧道重连动作面（main.ts 注入 host.toggleTunnel——缺席由调用侧守卫） */
export interface TunnelToggleActions {
  toggle(): void
}

/** 注册 handler（invoke → actions.toggle()——fire-and-forget，结果面走 manifest 轮询回流） */
export function registerTunnelChannel(ipcMain: IpcMainLike, actions: TunnelToggleActions): void {
  ipcMain.handle(TUNNEL_TOGGLE_CHANNEL, () => actions.toggle())
}

/** 撤除 handler（before-quit 清理面——harness-channel 同构） */
export function removeTunnelChannel(ipcMain: Pick<IpcMainLike, 'removeHandler'>): void {
  ipcMain.removeHandler(TUNNEL_TOGGLE_CHANNEL)
}
