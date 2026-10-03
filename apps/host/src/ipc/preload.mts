// renderer preload（ESM .mjs——Electron ESM preload 须非沙箱渲染 + contextIsolation 保持开）。
// 暴露面构造在 preload-api.ts（electron 依赖隔离，逻辑可单测）；本文件仅装桥。
// 暴露面：window.dshForge.{ getBootManifest() → {url, injections}, invoke(channel, payload)
// → RpcResult }（G1 第 1 项缝 + 2.4 RPC 面）+ window.__DSH_DIRECTORY_PICKER__ = { pick() }
// （fix-14：官方 dsh 桥契约逐字同形——原生目录选取主路径；off 开关 = e2e 回退面口径）。
// 除此禁扩展其他 electron 能力（electron-ipc-security：最小面）。
import { contextBridge, ipcRenderer } from 'electron'
import { createDirectoryPickerBridge, createDshForgePreloadApi, directoryPickerEnabled } from './preload-api.js'

contextBridge.exposeInMainWorld('dshForge', createDshForgePreloadApi(ipcRenderer))
if (directoryPickerEnabled()) {
  contextBridge.exposeInMainWorld('__DSH_DIRECTORY_PICKER__', createDirectoryPickerBridge(ipcRenderer))
}
