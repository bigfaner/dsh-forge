// windows/channels — 壳层窗口动词通道白名单(任务 4.2;tech-design
// §Interfaces·Interface 5「新 shell 动词组,非 workbench 前缀」)。
//
// TECH-electron-ipc-001(白名单纪律)的窗口面:每个语义动词映射唯一通道
// `dsh-forge:window-<kebab-verb>`,与 workbench 面(`dsh-forge:workbench-*`)
// 前缀分立。本模块为纯常量(Electron/node 零依赖);preload 侧孪生副本在
// apps/desktop/src/preload/channel-allowlist.ts(sandboxed preload 不可共享
// bundle chunk,见该文件头),drift 由 apps/desktop/tests/windows-role.spec.ts
// 的 deep-equal 断言锁定 —— 两侧通道名不允许各自手写漂移。
//
// 事件推送走独立的 `dsh-forge:window-changed`(主→渲染,不可 invoke,不在
// 动词白名单内;载荷 = WindowChangedEvent,detached-opened/detached-closed)。

/** The complete window verb whitelist. Nothing else may be invoked from the renderer. */
export const WINDOW_VERB_CHANNELS = {
  openDetached: 'dsh-forge:window-open-detached',
  getRole: 'dsh-forge:window-get-role',
  recall: 'dsh-forge:window-recall',
} as const

/**
 * Main → renderer window-changed push channel (Interface 5). Not an invokable
 * verb — the main process is the sole sender; the renderer only subscribes.
 */
export const WINDOW_CHANGED_CHANNEL = 'dsh-forge:window-changed'

export type WindowVerbChannel = (typeof WINDOW_VERB_CHANNELS)[keyof typeof WINDOW_VERB_CHANNELS]

/** Whitelist guard: only these channels may carry a window verb. */
export function isWhitelistedWindowVerbChannel(channel: string): channel is WindowVerbChannel {
  return (Object.values(WINDOW_VERB_CHANNELS) as string[]).includes(channel)
}
