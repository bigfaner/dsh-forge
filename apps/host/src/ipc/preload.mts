// renderer preload（ESM .mjs——Electron ESM preload 须非沙箱渲染 + contextIsolation 保持开）。
// 暴露面构造在 preload-api.ts（electron 依赖隔离，逻辑可单测）；本文件仅装桥。
// 唯一暴露面：window.dshForge.{ getBootManifest() → {url, injections}, invoke(channel, payload)
// → RpcResult }（G1 第 1 项缝 + 2.4 RPC 面）。禁扩展其他 electron 能力（electron-ipc-security：最小面）。
import { contextBridge, ipcRenderer } from 'electron'
import { createDshForgePreloadApi } from './preload-api.js'

contextBridge.exposeInMainWorld('dshForge', createDshForgePreloadApi(ipcRenderer))
