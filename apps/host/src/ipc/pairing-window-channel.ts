// 配对独立窗口 IPC 通道（定位：基础——fix-7；directory-picker-channel 同制：宿主↔renderer
// 装配胶——非域通道，不进 FORGE_CHANNEL_ALLOWLIST，preload 以专用成员单门暴露）。
// 消费缝：侧栏手机图标点击（web client 插件注入面）→ dshForge.openPairingWindow() →
// 本通道 → main 侧 setupPairingEntry 开/聚焦配对独立窗。
import type { IpcMainLike } from './forge-channels.js'

/** renderer 侧消费名（preload 暴露 dshForge.openPairingWindow() → 本通道） */
export const OPEN_PAIRING_WINDOW_CHANNEL = 'dsh-forge:open-pairing-window'

/** 通道注册（handler 零参零返回——开窗失败面归 main 侧日志，不向 renderer 外溢） */
export function registerPairingWindowChannel(ipcMain: IpcMainLike, open: () => void): void {
  ipcMain.handle(OPEN_PAIRING_WINDOW_CHANNEL, () => {
    open()
  })
}
