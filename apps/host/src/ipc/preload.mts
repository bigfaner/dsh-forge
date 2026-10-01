// renderer preload（ESM .mjs——Electron ESM preload 须非沙箱渲染 + contextIsolation 保持开）。
// 唯一暴露面：window.dshForge.getBootManifest() → {url, injections}（G1 第 1 项缝；
// apps/web 壳内核 1.5 消费）。禁扩展其他 electron 能力（electron-ipc-security：最小面）。
import { contextBridge, ipcRenderer } from 'electron'
import { BOOT_CHANNEL } from './boot-channel.js'
import type { BootManifest } from '../boot/index.js'

const api = {
  getBootManifest: (): Promise<BootManifest> => ipcRenderer.invoke(BOOT_CHANNEL) as Promise<BootManifest>,
}

contextBridge.exposeInMainWorld('dshForge', api)

export type DshForgePreloadApi = typeof api
