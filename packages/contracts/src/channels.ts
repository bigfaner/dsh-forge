// IPC 通道名常量（P1 tech-design §Interface 4 + M2 §Interface 7 通道族清单）。
// 定位铁律：纯常量，零逻辑零依赖。main 侧 allowlist 校验与 web/src/rpc client 均以本文件为唯一源
//（共享类型唯一源，防 schema 漂移）。新增通道 = 三处一体：本文件 + dto 请求/响应映射 +
// web/rpc 与 core 对应域——禁单侧私改。
// M2 面分治（Interface 7/8）：写动词 addTask/claimTask/submitTask/createProposal/transitionProposal
// = agent tool 专属，恒不上 RPC（SC7 断言面）；forge:events/* = 主→渲染单向推送，
// 不进 invoke allowlist（preload 订阅面守卫以 FORGE_EVENT_CHANNELS 为唯一源）。
// M3（1.1）drift 修订（Interface 4）：transitionProposal 从 tool 专属 → 双面（UF-1 人工裁决，
// agent 面保留——评审发生在 agent 会话时技能代笔）+ setMode/listDocs 扩族 + forge:settings/* 新族；
// 恒不上 RPC 的写动词收窄为 addTask/submitTask/createProposal（claimTask 退役并入 dispatchTask，
// 仅存 core 服务 API）。

/** forge:projects/*（ProjectService 面——P1 五法不动；host 注册面 = projects-rpc.ts 五通道） */
export const PROJECTS_CHANNELS = {
  register: 'forge:projects/register',
  list: 'forge:projects/list',
  get: 'forge:projects/get',
  update: 'forge:projects/update',
  reconcile: 'forge:projects/reconcile',
} as const

export type ProjectsChannel = (typeof PROJECTS_CHANNELS)[keyof typeof PROJECTS_CHANNELS]

/** forge:projects/* M2 扩族（Interface 5：任务库派生行——注册表单预检位，纯读）。
 *  独立常量而非并入 PROJECTS_CHANNELS：P1 host 注册面（projects-rpc.ts 五通道）零波及，
 *  3.1 host 接线时与本族常量合流。 */
export const PROJECTS_M2_CHANNELS = {
  deriveTaskStoreDir: 'forge:projects/deriveTaskStoreDir',
} as const

export type ProjectsM2Channel = (typeof PROJECTS_M2_CHANNELS)[keyof typeof PROJECTS_M2_CHANNELS]

/** forge:knowledge/*（KnowledgeService 浏览面；search / readAbstract 走 agent 面插件 tool，不经 web RPC——双门分工） */
export const KNOWLEDGE_CHANNELS = {
  browse: 'forge:knowledge/browse',
  listEntries: 'forge:knowledge/listEntries',
  entryDetail: 'forge:knowledge/entryDetail',
  heat: 'forge:knowledge/heat',
  sessionRecall: 'forge:knowledge/sessionRecall',
} as const

export type KnowledgeChannel = (typeof KNOWLEDGE_CHANNELS)[keyof typeof KNOWLEDGE_CHANNELS]

/** forge:fs/*（宿主文件系统浏览面——UF-3 文件浏览器数据源；只读目录列举，任务 2.8：
 *  本机目录读取经 RPC，renderer 不开 Node fs 通道） */
export const FS_CHANNELS = {
  listDir: 'forge:fs/listDir',
} as const

export type FsChannel = (typeof FS_CHANNELS)[keyof typeof FS_CHANNELS]

/** forge:tasks/*（Interface 7：RPC 人类面 + 读面；add/claim/submit = agent tool 专属不上 RPC） */
export const TASKS_CHANNELS = {
  transition: 'forge:tasks/transition',
  query: 'forge:tasks/query',
  validateFeatureTasks: 'forge:tasks/validateFeatureTasks',
  list: 'forge:tasks/list',
  stats: 'forge:tasks/stats',
  graph: 'forge:tasks/graph',
  detail: 'forge:tasks/detail',
  sessionLinks: 'forge:tasks/sessionLinks',
} as const

export type TasksChannel = (typeof TASKS_CHANNELS)[keyof typeof TASKS_CHANNELS]

/** forge:features/*（register/transition/upsertDoc/list/listDocs——UI 直调；M2 仅 core API + RPC，tool 封装 = M3）。
 *  listDocs = feature_documents 列举读面（fix-2：概览 feature 子 tab 文档行数据源）。 */
export const FEATURES_CHANNELS = {
  register: 'forge:features/register',
  transition: 'forge:features/transition',
  upsertDoc: 'forge:features/upsertDoc',
  list: 'forge:features/list',
  listDocs: 'forge:features/listDocs',
} as const

export type FeaturesChannel = (typeof FEATURES_CHANNELS)[keyof typeof FEATURES_CHANNELS]

/** forge:proposals/*（M3 Interface 4 扩池：transition 双面上 RPC（UF-1 人工裁决——M2「tool 专属」
 *  纪律 drift 修订）+ setMode（律三唯一正门·UI 专属——agent tool 面无模式改写动词）+
 *  listDocs（UF-1 提案文档区读·目录扫描）；createProposal 恒 tool 专属不上 RPC） */
export const PROPOSALS_CHANNELS = {
  list: 'forge:proposals/list',
  transition: 'forge:proposals/transition',
  setMode: 'forge:proposals/setMode',
  listDocs: 'forge:proposals/listDocs',
} as const

export type ProposalsChannel = (typeof PROPOSALS_CHANNELS)[keyof typeof PROPOSALS_CHANNELS]

/** forge:settings/*（M3 Interface 4 扩池：Forge设置 读写——forgeSettings 服务单门，UI 分区消费；
 *  host 接线归 3.8，web client 归 4.1） */
export const SETTINGS_CHANNELS = {
  get: 'forge:settings/get',
  set: 'forge:settings/set',
} as const

export type SettingsChannel = (typeof SETTINGS_CHANNELS)[keyof typeof SETTINGS_CHANNELS]

/** forge:docs/*（read = 工作区文档读；openExternal = main 侧 shell.openPath，先经桥校验路径在册） */
export const DOCS_CHANNELS = {
  read: 'forge:docs/read',
  openExternal: 'forge:docs/openExternal',
} as const

export type DocsChannel = (typeof DOCS_CHANNELS)[keyof typeof DOCS_CHANNELS]

/**
 * invoke 通道全集平铺视图（allowlist 数据单源）。
 * 键约定：P1 三族 + projects 扩族 = 族方法名；M2 四族方法键跨族重名（list/transition/register），
 * 平铺视图内加族前缀键保全键唯一（族权威键面 = 各族 *CHANNELS 常量，dto 负载映射亦键于族常量）。
 */
export const FORGE_CHANNELS = {
  ...PROJECTS_CHANNELS,
  ...KNOWLEDGE_CHANNELS,
  ...FS_CHANNELS,
  deriveTaskStoreDir: PROJECTS_M2_CHANNELS.deriveTaskStoreDir,
  tasksTransition: TASKS_CHANNELS.transition,
  tasksQuery: TASKS_CHANNELS.query,
  tasksValidateFeatureTasks: TASKS_CHANNELS.validateFeatureTasks,
  tasksList: TASKS_CHANNELS.list,
  tasksStats: TASKS_CHANNELS.stats,
  tasksGraph: TASKS_CHANNELS.graph,
  tasksDetail: TASKS_CHANNELS.detail,
  tasksSessionLinks: TASKS_CHANNELS.sessionLinks,
  featuresRegister: FEATURES_CHANNELS.register,
  featuresTransition: FEATURES_CHANNELS.transition,
  featuresUpsertDoc: FEATURES_CHANNELS.upsertDoc,
  featuresList: FEATURES_CHANNELS.list,
  featuresListDocs: FEATURES_CHANNELS.listDocs,
  proposalsList: PROPOSALS_CHANNELS.list,
  proposalsTransition: PROPOSALS_CHANNELS.transition,
  proposalsSetMode: PROPOSALS_CHANNELS.setMode,
  proposalsListDocs: PROPOSALS_CHANNELS.listDocs,
  settingsGet: SETTINGS_CHANNELS.get,
  settingsSet: SETTINGS_CHANNELS.set,
  docsRead: DOCS_CHANNELS.read,
  docsOpenExternal: DOCS_CHANNELS.openExternal,
} as const

export type ForgeChannel =
  | ProjectsChannel
  | ProjectsM2Channel
  | KnowledgeChannel
  | FsChannel
  | TasksChannel
  | FeaturesChannel
  | ProposalsChannel
  | SettingsChannel
  | DocsChannel

/** main 侧 IPC allowlist 唯一源（未知通道拒绝——electron-ipc-security 约定，继承自 1.4） */
export const FORGE_CHANNEL_ALLOWLIST: readonly ForgeChannel[] = Object.values(FORGE_CHANNELS)

/**
 * forge:events/*（主→渲染单向推送——四域写动词闭包尾部 emitTasksChanged 同通道同载荷）。
 * 非 invoke 面：不进 FORGE_CHANNEL_ALLOWLIST（renderer → main invoke 与 main → renderer
 * send 方向相异）；preload 订阅面守卫以本常量为唯一源（3.1 接线 onForgeTasksChanged）。
 */
export const FORGE_EVENT_CHANNELS = {
  tasksChanged: 'forge:events/tasks-changed',
} as const

export type ForgeEventChannel = (typeof FORGE_EVENT_CHANNELS)[keyof typeof FORGE_EVENT_CHANNELS]
