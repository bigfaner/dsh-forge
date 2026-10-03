// __DSH_DIRECTORY_PICKER__ 桥 main 侧通道（定位：基础——fix-14 段一目录选取原生优先）。
// 契约 pin = @deepseek-ai/dsh-client-ui-directory-picker-native lib/client.js:62-76（官方
// 消费面逐字同形，不自创 API）：preload 暴露 window.__DSH_DIRECTORY_PICKER__ = { pick }，
// pick(): Promise<string|null> = 选中绝对路径 / 取消 null；失败 reject = 错误面（不可达路径等
// 系统错误原样上抛）。与 forge:* 域 RPC 分面（boot-channel 同制：宿主↔renderer 装配胶——
// dsh 官方桥契约形状，非域通道，不进 FORGE_CHANNEL_ALLOWLIST；负样例由单测自证）。
import type { IpcMainLike } from './forge-channels.js'

/** renderer 侧消费名（preload 暴露 window.__DSH_DIRECTORY_PICKER__.pick() → 本通道） */
export const DIRECTORY_PICKER_CHANNEL = 'dsh-forge:directory-picker'

/** 单次系统对话框结果面（Electron OpenDialogReturnValue 切片——canceled / filePaths） */
export interface DirectoryDialogResult {
  readonly canceled: boolean
  readonly filePaths: readonly string[]
}

/** 对话框打开面（main 注入绑定调用 lambda——隔离 Electron overload 形状，测试注入 fake） */
export type OpenDirectoryDialog = () => Promise<DirectoryDialogResult>

/**
 * 单次系统目录选取（任务口径：openDirectory 单选——options 字面量由 main 绑定调用点内联，
 * tsc 对照 Electron OpenDialogOptions 编译期 pin）：取消/零选 → null；选中 → 首个绝对路径；
 * 对话框异常原样 reject（官方契约错误面——渲染侧 onError 分支承载）。
 */
export async function pickDirectory(open: OpenDirectoryDialog): Promise<string | null> {
  const result = await open()
  return result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] as string)
}

export function registerDirectoryPickerChannel(ipcMain: IpcMainLike, open: OpenDirectoryDialog): void {
  ipcMain.handle(DIRECTORY_PICKER_CHANNEL, () => pickDirectory(open))
}
