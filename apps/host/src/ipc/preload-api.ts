// preload 暴露面构造（定位：基础——electron 依赖隔离出 preload.mts，逻辑面可单测）。
// 唯一暴露面两成员：getBootManifest()（1.4）+ invoke(channel, payload)（2.4 RPC 面）。
// invoke 守 allowlist（FORGE_CHANNEL_ALLOWLIST 唯一源）——renderer 侧第一道拒绝，
// main 侧 createForgeIpc 注册面为第二道（纵深防御，electron-ipc-security 约定：最小面）。
import { FORGE_CHANNEL_ALLOWLIST, type ForgeChannel } from '@dsh-forge/contracts'
import { BOOT_CHANNEL } from './boot-channel.js'
import { DIRECTORY_PICKER_CHANNEL } from './directory-picker-channel.js'
import type { BootManifest } from '../boot/index.js'

/** Electron ipcRenderer 的结构化消费面（preload.mts 传入真身；测试注入 fake） */
export interface PreloadInvokeFace {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

/** window.dshForge 暴露面（web/src/rpc transport.ts 结构同型镜像——运行期边界禁互引源码） */
export function createDshForgePreloadApi(invokeFace: PreloadInvokeFace) {
  return {
    getBootManifest: (): Promise<BootManifest> =>
      invokeFace.invoke(BOOT_CHANNEL) as Promise<BootManifest>,
    /** forge:* 域 RPC 调用（通道 ∈ allowlist 才转发；未列通道 fail-loud 拒绝） */
    invoke: (channel: ForgeChannel, payload?: unknown): Promise<unknown> => {
      if (!(FORGE_CHANNEL_ALLOWLIST as readonly string[]).includes(channel)) {
        throw new Error(
          `[preload] forge RPC 通道不在 allowlist，拒绝调用：${channel}（唯一源 = @dsh-forge/contracts channels；新通道须三处一体：contracts → web/rpc → core 域）`,
        )
      }
      return invokeFace.invoke(channel, payload)
    },
  }
}

export type DshForgePreloadApi = ReturnType<typeof createDshForgePreloadApi>

/**
 * 官方 __DSH_DIRECTORY_PICKER__ 桥形状（fix-14——与 dsh-client-ui-directory-picker-native
 * lib/client.js:62-76 消费面逐字同形 pin，不自创 API）：pick() = 选中绝对路径 / 取消 null /
 * reject 错误面。web 侧结构同型镜像（apps/web flows/add-project/dir-picker.ts——运行期边界
 * 禁互引源码）。
 */
export interface DshDirectoryPickerBridge {
  pick(): Promise<string | null>
}

/** 桥成员构造：pick → DIRECTORY_PICKER_CHANNEL 直转（payload 面 = 零参） */
export function createDirectoryPickerBridge(invokeFace: PreloadInvokeFace): DshDirectoryPickerBridge {
  return {
    pick: () => invokeFace.invoke(DIRECTORY_PICKER_CHANNEL) as Promise<string | null>,
  }
}

/**
 * 桥暴露开关：DSH_FORGE_DIRECTORY_PICKER=off → 桥不暴露（web 回退内嵌浏览器）。
 * 口径：e2e 走查组在 Electron 载体上断言回退面（OS 对话框不可 e2e——回退面承担回归），
 * 经本开关显式降桥；产品/开发载体缺省恒开（原生优先适用面）。
 */
export function directoryPickerEnabled(env: { readonly DSH_FORGE_DIRECTORY_PICKER?: string } = process.env): boolean {
  return env.DSH_FORGE_DIRECTORY_PICKER !== 'off'
}
