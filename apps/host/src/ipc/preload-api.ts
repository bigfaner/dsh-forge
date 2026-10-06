// preload 暴露面构造（定位：基础——electron 依赖隔离出 preload.mts，逻辑面可单测）。
// 唯一暴露面三成员：getBootManifest()（1.4）+ invoke(channel, payload)（2.4 RPC 面）+
// onForgeTasksChanged(cb)（3.1 事件订阅面——主→渲染单向推送，Interface 7 forge:events/*）。
// invoke 守 allowlist（FORGE_CHANNEL_ALLOWLIST 唯一源）——renderer 侧第一道拒绝，
// main 侧 createForgeIpc 注册面为第二道（纵深防御，electron-ipc-security 约定：最小面）。
// 事件订阅守 FORGE_EVENT_CHANNELS 值域（推送面不进 invoke allowlist——方向相异）。
import {
  FORGE_CHANNEL_ALLOWLIST,
  FORGE_EVENT_CHANNELS,
  type ForgeChannel,
  type ForgeEventChannel,
  type TasksChangedEvent,
} from '@dsh-forge/contracts'
import { BOOT_CHANNEL } from './boot-channel.js'
import { DIRECTORY_PICKER_CHANNEL } from './directory-picker-channel.js'
import type { BootManifest } from '../boot/index.js'
import { WINDOWS_TITLEBAR_HEIGHT } from '../window/titlebar.js'

/** Electron ipcRenderer 的结构化消费面（preload.mts 传入真身；测试注入 fake） */
export interface PreloadInvokeFace {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

/** Electron ipcRenderer 的事件消费面（on/removeListener——preload.mts 传真身；测试注入 fake） */
export interface PreloadEventFace {
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
}

/**
 * forge:events/* 订阅（allowlist 守卫——FORGE_EVENT_CHANNELS 值域唯一源，未列通道
 * fail-loud 拒绝，与 invoke 面同形纪律）；载荷形状守卫（{ projectId } 只读——Hard Rule；
 * 畸形载荷静默跳过，不猜测不转发）；返回退订器（removeListener）。
 */
export function subscribeForgeEvent(
  events: PreloadEventFace,
  channel: ForgeEventChannel,
  listener: (payload: TasksChangedEvent) => void,
): () => void {
  if (!(Object.values(FORGE_EVENT_CHANNELS) as readonly string[]).includes(channel)) {
    throw new Error(
      `[preload] forge 事件通道不在 allowlist，拒绝订阅：${channel}（唯一源 = @dsh-forge/contracts FORGE_EVENT_CHANNELS）`,
    )
  }
  const onMessage = (_event: unknown, payload: unknown): void => {
    if (typeof payload !== 'object' || payload === null) return
    const projectId = (payload as Record<string, unknown>).projectId
    if (typeof projectId !== 'string') return
    listener({ projectId })
  }
  events.on(channel, onMessage)
  return () => events.removeListener(channel, onMessage)
}

/** window.dshForge 暴露面（web/src/rpc transport.ts/events.ts 结构同型镜像——运行期边界禁互引源码） */
export function createDshForgePreloadApi(invokeFace: PreloadInvokeFace, events?: PreloadEventFace) {
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
    /**
     * forge:events/tasks-changed 订阅（3.1——Interface 7 推送面 preload 半边；
     * cb 收只读 { projectId } 载荷；返回退订器）。事件面缺席（events 未注入——
     * 非 Electron 载体/测试替身）调用即 fail-loud 拒绝，不静默假装订阅成功。
     */
    onForgeTasksChanged: (cb: (payload: TasksChangedEvent) => void): (() => void) => {
      if (events === undefined) {
        throw new Error('[preload] 事件订阅面缺席（ipcRenderer 事件面未接）——onForgeTasksChanged 不可用')
      }
      return subscribeForgeEvent(events, FORGE_EVENT_CHANNELS.tasksChanged, cb)
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

/**
 * 壳标记目标（document.documentElement 结构子集——preload.mts 传真身，单测注入 fake）。
 */
export interface ShellMarkTarget {
  readonly dataset: Record<string, string | undefined>
  setAttribute(qualifiedName: string, value: string): void
  readonly style: { setProperty(property: string, value: string): void }
}

/**
 * Windows 壳标题栏标记（fix-40——官方 Electron preload 法定职责位，web 层只读不写）：
 * Windows WCO 形态（产品唯一窗口形态，create.ts 恒 titleBarOverlay——win32 ⇒ WCO）标
 * `data-windows-titlebar` 属性 + 内联 `--dsh-windows-titlebar-height`（dockkit 按
 * documentElement.style 内联读取；值与 create.ts titleBarOverlay.height 单源 =
 * window/titlebar.ts）。官方补偿面由此激活（全部只认 data-windows-titlebar，与
 * data-platform 无关）：ui-layout frame padding-top/顶部拖拽条、ui-sidebar 折叠/新会话钮
 * 32px 带区内垂直居中、settings 覆盖层顶距——会话头右上角图标钮让出原生钮带区
 * （用户验收报障②根因修复）。非 win32 零标记（darwin 补偿走 [data-platform=darwin]
 * 变体族，见下）。
 *
 * **data-platform 刻意不标（fix-40 实测裁决缝，翻转须有意识地随桥落地）**：
 * 官方 dsh-client-shortcuts ShortcutsService 构造器在 runtime="desktop"（=
 * dataset.platform 存在，任意值——detectEnvironment 判据）时硬性要求官方桌面 preload
 * 能力面 `window.dshDesktop.keyboard`，缺席即 throw "Desktop keyboard bridge unavailable"
 * → 25 个官方 client 插件激活级联失败（实测 A/B：标记 data-platform=win32 → boot 面全红；
 * 不标 → 全绿）。dshDesktop 能力面（keyboard/shortcuts/analytics/chat/settings/…
 * 七包消费）在树内无官方实现可采，属独立桥接任务。标 data-platform 之前必须先落
 * dshDesktop 桥；连带 isDarwinDesktop（primitives）与 detectEnvironment 的 runtime 面
 * 同缓。代价（已裁决可受）：快捷键解析面按 web 口径呈现（与现状一致，非回归）。
 *
 * preload 顶层即调（早于任何 React 渲染——官方注释容忍迟到至 DOMContentLoaded，
 * 早起无害且消除闪烁窗）。
 */
export function markWindowsTitlebarShell(
  documentElement: ShellMarkTarget,
  platform: string = process.platform,
): void {
  if (platform === 'win32') {
    documentElement.setAttribute('data-windows-titlebar', '')
    documentElement.style.setProperty('--dsh-windows-titlebar-height', `${WINDOWS_TITLEBAR_HEIGHT}px`)
  }
}
