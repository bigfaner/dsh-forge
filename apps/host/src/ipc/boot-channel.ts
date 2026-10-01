// {url, injections} boot 通道（定位：基础）。与 forge:* 域 RPC 分面：
// boot manifest 是宿主↔renderer 装配胶（dsh 自有形状），非域通道——不进
// FORGE_CHANNEL_ALLOWLIST（allowlist 只守 forge:* 域面，负样例由单测自证）。
import type { BootManifest } from '../boot/index.js'
import type { IpcMainLike } from './forge-channels.js'

/** renderer 侧消费名（preload 暴露 window.dshForge.getBootManifest()） */
export const BOOT_CHANNEL = 'dsh-forge:boot'

export function registerBootChannel(
  ipcMain: IpcMainLike,
  getManifest: () => BootManifest | Promise<BootManifest>,
): void {
  ipcMain.handle(BOOT_CHANNEL, async () => getManifest())
}
