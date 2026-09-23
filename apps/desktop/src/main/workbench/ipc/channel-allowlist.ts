// workbench/ipc/channel-allowlist — dshForge.workbench.* 动词通道白名单(任务 2.7)。
//
// TECH-electron-ipc-001(白名单纪律)的 workbench 面:每个语义动词映射唯一
// 通道 `dsh-forge:workbench-<name>`,禁止复用、禁止通配透传动词。本模块为
// 纯常量(Electron/node 零依赖),preload 与 main 共用同一份通道表 —— 两侧
// 通道名不允许各自手写漂移。
//
// 通道清单(tech-design §Interface 1 动词表):
//   13 个数据动词 + onEvents 的订阅/退订动词对(subscribe-events /
//   unsubscribe-events)+ 仓外授权确认动词(authorize-external-doc-path,
//   6.4 补齐)= 16 条白名单通道;事件推送走独立的
//   `dsh-forge:workbench-events`(主→渲染,不可 invoke,不在动词白名单内)。
//   onEvents 在 preload 侧呈现为单订阅者语义动词:订阅即 invoke
//   subscribe-events,返回的退订函数移除监听并 invoke unsubscribe-events
//   —— 渲染层销毁时主进程经 webContents destroyed 钩子自动退订。
//
// authorize-external-doc-path(6.4,SC5-1 缺口补齐):2.4 的仓外授权登记
// (registry/authorize.ts —— 持久化 app_state 记录,校验链只读它,入参无
// 旗标可绕过)此前没有任何 IPC 写入面,真实链上仓外注册恒被
// ERR_EXTERNAL_PATH_UNREADABLE 拒绝。本动词 = 向导步骤②显式授权确认的唯一
// 落库通道(经 RegisterWizard 的 step-③ submit 触发):只登记授权,零 fs
// 探测(可读性/检出探测仍在注册校验链内、授权确认之后)。

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
  authorizeExternalDocPath: 'dsh-forge:workbench-authorize-external-doc-path',
  subscribeEvents: 'dsh-forge:workbench-subscribe-events',
  unsubscribeEvents: 'dsh-forge:workbench-unsubscribe-events',
  // —— M3 tasks 段(任务 1.3 追加;Hard Rule:追加式修改,M2 既有动词
  //    定义不改写)。命名沿用 v1 惯例 `dsh-forge:workbench-<kebab-verb>`;
  //    通道清单 = tech-design §Interface 1 任务权威写集(5)+ 读路由(2)。
  //    写集动词的 actor 审计与权限界在内核(task-service),通道面零特权。 ——
  taskAdd: 'dsh-forge:workbench-task-add',
  taskClaim: 'dsh-forge:workbench-task-claim',
  taskTransition: 'dsh-forge:workbench-task-transition',
  taskSubmit: 'dsh-forge:workbench-task-submit',
  taskReopen: 'dsh-forge:workbench-task-reopen',
  taskGet: 'dsh-forge:workbench-task-get',
  taskQuery: 'dsh-forge:workbench-task-query',
  // —— M3 migration 段(任务 1.4 追加;Hard Rule 延续:追加式修改,既有
  //    动词定义不改写)。迁移面 = 一对动词:状态读取 + 一次性显式发起;
  //    相位进度走事件通道(migration_progress),非动词。 ——
  getMigrationStatus: 'dsh-forge:workbench-get-migration-status',
  startMigration: 'dsh-forge:workbench-start-migration',
  // M3 UF3 集成段(任务 1.7 追加;与 preload 侧同键同值,drift 锁 =
  // tests/workbench-ipc.spec.ts deep-equal 断言):向导真实探测 + 内核位置读。
  probeCodeRoot: 'dsh-forge:workbench-probe-code-root',
  getWorkbenchPaths: 'dsh-forge:workbench-get-workbench-paths',
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
