// __DSH_DIRECTORY_PICKER__ 桥 main 侧通道（定位：基础——fix-14 段一目录选取原生优先）。
// 契约 pin = @deepseek-ai/dsh-client-ui-directory-picker-native lib/client.js:62-76（官方
// 消费面逐字同形，不自创 API）：preload 暴露 window.__DSH_DIRECTORY_PICKER__ = { pick }，
// pick(): Promise<string|null> = 选中绝对路径 / 取消 null；失败 reject = 错误面（不可达路径等
// 系统错误原样上抛）。与 forge:* 域 RPC 分面（boot-channel 同制：宿主↔renderer 装配胶——
// dsh 官方桥契约形状，非域通道，不进 FORGE_CHANNEL_ALLOWLIST；负样例由单测自证）。
import type { IpcMainLike } from './forge-channels.js'

/** renderer 侧消费名（preload 暴露 window.__DSH_DIRECTORY_PICKER__.pick() → 本通道） */
export const DIRECTORY_PICKER_CHANNEL = 'dsh-forge:directory-picker'

/**
 * fix-21：对话框标题对齐官方 host-directory-picker-native DIALOG_TITLE（lib/index.js:111）。
 * 官方口径逐字（"Select Workspace Directory"）——缺省标题（Windows「打开」）与官方系统
 * 文件浏览器形态不一致，故以官方为准（main 绑定调用点 options 内联消费 + 单测 pin）。
 */
export const DIRECTORY_PICKER_DIALOG_TITLE = 'Select Workspace Directory'

/** 单次系统对话框结果面（Electron OpenDialogReturnValue 切片——canceled / filePaths） */
export interface DirectoryDialogResult {
  readonly canceled: boolean
  readonly filePaths: readonly string[]
}

/**
 * 对话框打开面（main 注入绑定调用 lambda——隔离 Electron overload 形状，测试注入 fake）。
 * fix-21：parent 形参（发起 invoke 的父窗，非 null 时 Electron showOpenDialog(parent, options)
 * 语义 = 对话框对父窗模态 + 正确 z-order/前台——Windows 前台激活权不在手也置顶；官方
 * host-directory-picker-native 合成 Alt 前台工程面向无窗口宿主，Electron main 等价机制
 * 即 parent 形参）。null → 无 parent 形参回退（fail-soft，不比 fix-14 现状差）。
 */
export type OpenDirectoryDialog = (parent: unknown) => Promise<DirectoryDialogResult>

/**
 * fix-21：sender → 父窗解析器（main 绑定 electron BrowserWindow.fromWebContents）。
 * 通道保持 electron 依赖隔离——sender/parent 均以 unknown 透传，真身形状由 main
 * 绑定调用点编译期 pin；解析为 null/undefined（sender 无窗，理论不可达）→ 回退无 parent。
 */
export type ParentWindowResolver = (sender: unknown) => unknown

/**
 * 单次系统目录选取（任务口径：openDirectory 单选——options 字面量由 main 绑定调用点内联，
 * tsc 对照 Electron OpenDialogOptions 编译期 pin）：取消/零选 → null；选中 → 首个绝对路径；
 * 对话框异常原样 reject（官方契约错误面——渲染侧 onError 分支承载）。
 */
export async function pickDirectory(open: OpenDirectoryDialog, parent: unknown = null): Promise<string | null> {
  const result = await open(parent)
  return result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] as string)
}

export function registerDirectoryPickerChannel(
  ipcMain: IpcMainLike,
  open: OpenDirectoryDialog,
  resolveParent: ParentWindowResolver = () => null,
): void {
  ipcMain.handle(DIRECTORY_PICKER_CHANNEL, (event) => {
    const sender = (event as { sender?: unknown } | undefined)?.sender
    return pickDirectory(open, resolveParent(sender) ?? null)
  })
}
