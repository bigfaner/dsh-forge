// IPC 通道名常量（tech-design §Interface 4：Web RPC 面——renderer ↔ main，allowlist 通道）。
// 定位铁律：纯常量，零逻辑零依赖。main 侧 allowlist 校验与 web/src/rpc client 均以本文件为唯一源
//（共享类型唯一源，防 schema 漂移）。新增通道 = 三处一体：本文件 + dto 请求/响应映射 +
// web/rpc 与 core 对应域——禁单侧私改。

/** forge:projects/*（ProjectService 面） */
export const PROJECTS_CHANNELS = {
  register: 'forge:projects/register',
  list: 'forge:projects/list',
  get: 'forge:projects/get',
  update: 'forge:projects/update',
  reconcile: 'forge:projects/reconcile',
} as const

export type ProjectsChannel = (typeof PROJECTS_CHANNELS)[keyof typeof PROJECTS_CHANNELS]

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
 * 本机目录读取经 RPC，renderer 不开 Node fs 通道） */
export const FS_CHANNELS = {
  listDir: 'forge:fs/listDir',
} as const

export type FsChannel = (typeof FS_CHANNELS)[keyof typeof FS_CHANNELS]

/** 通道全集（键 = 通道方法名，与 dto/rpc.ts 请求/响应映射的键一一对应） */
export const FORGE_CHANNELS = {
  ...PROJECTS_CHANNELS,
  ...KNOWLEDGE_CHANNELS,
  ...FS_CHANNELS,
} as const

export type ForgeChannel = ProjectsChannel | KnowledgeChannel | FsChannel

/** main 侧 IPC allowlist 唯一源（未知通道拒绝——electron-ipc-security 约定，继承自 1.4） */
export const FORGE_CHANNEL_ALLOWLIST: readonly ForgeChannel[] = Object.values(FORGE_CHANNELS)
