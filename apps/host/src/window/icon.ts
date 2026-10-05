// 窗口图标路径解析（fix-45：鲸游书海 brand 标派生应用图标——退役 Electron 默认）。
// 口径与 web-document.ts resolveWebDistDir 同构：dev = hostRoot 上溯仓库根 build/；
// 打包形态（DSH_FORGE_RESOURCES_DIR 置位，main 侧 app.isPackaged 注入）= {resources}/icon.png
// （assemble-installer-resources.mjs 物化）。Windows 任务栏/Alt-Tab 由 exe 内嵌图标
// （electron-builder win.icon = build/icon.ico）优先——本选项覆盖窗口标题栏与运行期兜底。
import { isAbsolute, join } from 'node:path'
import { hostRoot } from '../profile/paths.js'

export interface WindowIconEnv {
  DSH_FORGE_RESOURCES_DIR?: string
}

export function resolveWindowIconPath(env: WindowIconEnv): string {
  if (env.DSH_FORGE_RESOURCES_DIR !== undefined && env.DSH_FORGE_RESOURCES_DIR !== '') {
    return join(resolveFromHost(env.DSH_FORGE_RESOURCES_DIR), 'icon.png')
  }
  return join(hostRoot(), '..', '..', 'build', 'icon.png')
}

/** 相对路径锚 hostRoot（与 profile/paths.ts resolveFromHost 同语义；绝对值原样） */
function resolveFromHost(p: string): string {
  return isAbsolute(p) ? p : join(hostRoot(), p)
}
