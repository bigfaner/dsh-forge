// renderer preload（ESM .mjs——Electron ESM preload 须非沙箱渲染 + contextIsolation 保持开）。
// 暴露面构造在 preload-api.ts（electron 依赖隔离，逻辑可单测）；本文件仅装桥。
// 暴露面：window.dshForge.{ getBootManifest() → {url, injections}, invoke(channel, payload)
// → RpcResult }（G1 第 1 项缝 + 2.4 RPC 面）+ window.__DSH_DIRECTORY_PICKER__ = { pick() }
// （fix-14：官方 dsh 桥契约逐字同形——原生目录选取主路径；off 开关 = e2e 回退面口径）。
// 除此禁扩展其他 electron 能力（electron-ipc-security：最小面）。
// 另一法定职责：Windows 壳标题栏标记（fix-40）——html[data-windows-titlebar] + 内联
// --dsh-windows-titlebar-height 激活官方 web 壳补偿面（会话头/侧栏钮让出原生 WCO 钮带区；
// data-platform 缺席裁决见 markWindowsTitlebarShell 注记）。标记面在 preload-api.ts；
// 顶层即标（早于 React 渲染，官方注释容忍迟到至 DOMContentLoaded——ESM preload 延迟
// 语义下 documentElement 已在场，null 兜底转 DOMContentLoaded 补标，防御性不碍桥暴露）。
import { contextBridge, ipcRenderer } from 'electron'
import {
  createDirectoryPickerBridge,
  createDshForgePreloadApi,
  directoryPickerEnabled,
  markWindowsTitlebarShell,
  type ShellMarkTarget,
} from './preload-api.js'

// renderer DOM 窄面（宿主包 lib = ES2023 无 DOM——preload 运行面 = renderer，只声明消费子集；
// 全量 DOM 面由 apps/web 侧持有，宿主 main 面保持 DOM-free）
declare const document: {
  readonly documentElement: ShellMarkTarget | null
  addEventListener(type: 'DOMContentLoaded', listener: () => void): void
}

if (document.documentElement !== null) {
  markWindowsTitlebarShell(document.documentElement)
} else {
  document.addEventListener('DOMContentLoaded', () => {
    const documentElement = document.documentElement
    if (documentElement !== null) markWindowsTitlebarShell(documentElement)
  })
}

contextBridge.exposeInMainWorld('dshForge', createDshForgePreloadApi(ipcRenderer, ipcRenderer))
if (directoryPickerEnabled()) {
  contextBridge.exposeInMainWorld('__DSH_DIRECTORY_PICKER__', createDirectoryPickerBridge(ipcRenderer))
}
