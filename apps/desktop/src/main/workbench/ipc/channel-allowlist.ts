// workbench/ipc/channel-allowlist — dshForge.workbench.* 动词通道白名单(任务 2.7)。
//
// TECH-electron-ipc-001(白名单纪律)的 workbench 面:每个语义动词映射唯一
// 通道 `dsh-forge:workbench-<name>`,禁止复用、禁止通配透传动词。本模块为
// 纯常量(Electron/node 零依赖),preload 与 main 共用同一份通道表 —— 两侧
// 通道名不允许各自手写漂移。
//
// 通道清单(tech-design §Interface 1 动词表):
//   13 个数据动词 + onEvents 的订阅/退订动词对(subscribe-events /
//   unsubscribe-events)= 15 条白名单通道;事件推送走独立的
//   `dsh-forge:workbench-events`(主→渲染,不可 invoke,不在动词白名单内)。
//   onEvents 在 preload 侧呈现为单订阅者语义动词:订阅即 invoke
//   subscribe-events,返回的退订函数移除监听并 invoke unsubscribe-events
//   —— 渲染层销毁时主进程经 webContents destroyed 钩子自动退订。

/** The complete workbench verb whitelist. Nothing else may be invoked from the renderer. */
export const WORKBENCH_VERB_CHANNELS = {
  getState: 'dsh-forge:workbench-get-state',
  registerProject: 'dsh-forge:workbench-register-project',
  updateProject: 'dsh-forge:workbench-update-project',
  removeProject: 'dsh-forge:workbench-remove-project',
  activateProject: 'dsh-forge:workbench-activate-project',
  getTaskBoard: 'dsh-forge:workbench-get-task-board',
  getTaskDetail: 'dsh-forge:workbench-get-task-detail',
  getFeatureBoard: 'dsh-forge:workbench-get-feature-board',
  readFeatureDoc: 'dsh-forge:workbench-read-feature-doc',
  listPlugins: 'dsh-forge:workbench-list-plugins',
  setPluginEnabled: 'dsh-forge:workbench-set-plugin-enabled',
  recordSessionLink: 'dsh-forge:workbench-record-session-link',
  endSessionLink: 'dsh-forge:workbench-end-session-link',
  subscribeEvents: 'dsh-forge:workbench-subscribe-events',
  unsubscribeEvents: 'dsh-forge:workbench-unsubscribe-events',
} as const

/**
 * Main → renderer event push channel (tech-design §Interface 1): batches of
 * WorkbenchEvent coalesced by the 2.6 batcher (≤500ms). Not an invokable verb
 * — the main process is the sole sender; the renderer only subscribes.
 */
export const WORKBENCH_EVENT_CHANNEL = 'dsh-forge:workbench-events'

export type WorkbenchVerbChannel = (typeof WORKBENCH_VERB_CHANNELS)[keyof typeof WORKBENCH_VERB_CHANNELS]

/** Whitelist guard: only these channels may carry a workbench verb. */
export function isWhitelistedWorkbenchVerbChannel(channel: string): channel is WorkbenchVerbChannel {
  return (Object.values(WORKBENCH_VERB_CHANNELS) as string[]).includes(channel)
}
