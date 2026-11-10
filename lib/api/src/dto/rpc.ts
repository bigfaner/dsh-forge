// RPC DTO：通道请求/响应负载映射与结果信封（Interface 4 面的消费契约）。
// 键与 channels.ts 通道常量的键一一对应（三处一体的 DTO 侧落点：通道值查 channels，负载查本文件）。
// typed error 经 RPC 边界序列化为 RpcErrorPayload 随信封带内返回（Electron invoke 的拒绝
// 会抹平结构化对象，故错误不走 promise 拒绝而走信封——2.4 RPC 面机制消费本契约）。
// 定位铁律：纯类型，零逻辑零依赖。
import type { RpcErrorPayload } from '../errors.js'
import type { DirListing, ListDirRequest } from './fs.js'
import type {
  DomainNode,
  EntryDetail,
  EntryDetailQuery,
  KnowledgeCard,
  ListEntriesQuery,
  RecallGroup,
  SessionRecallQuery,
} from './knowledge.js'
import type {
  GetProjectRequest,
  Project,
  ProjectSummary,
  RegisterProjectInput,
  RegisterResult,
  ReconcileReport,
  UpdateProjectRequest,
} from './project.js'

/** RPC 成功信封 */
export interface RpcOk<T> {
  ok: true
  data: T
}

/** RPC 失败信封（typed error 序列化形状） */
export interface RpcErr {
  ok: false
  error: RpcErrorPayload
}

/** 通道统一返回形状（web/src/rpc client 反序列化面） */
export type RpcResult<T> = RpcOk<T> | RpcErr

/** forge:projects/* 请求负载（键 = PROJECTS_CHANNELS 键） */
export interface ProjectsChannelRequests {
  register: RegisterProjectInput
  list: void
  get: GetProjectRequest
  update: UpdateProjectRequest
  reconcile: void
}

/** forge:projects/* 响应负载（键 = PROJECTS_CHANNELS 键） */
export interface ProjectsChannelResponses {
  register: RegisterResult
  list: ProjectSummary[]
  get: Project | null
  update: Project
  reconcile: ReconcileReport
}

/** forge:knowledge/* 请求负载（键 = KNOWLEDGE_CHANNELS 键） */
export interface KnowledgeChannelRequests {
  /** 域树聚合数据源（listEntries 兼作聚合底表） */
  browse: { projectId: string }
  listEntries: ListEntriesQuery
  entryDetail: EntryDetailQuery
  heat: { projectId: string }
  sessionRecall: SessionRecallQuery
}

/** forge:knowledge/* 响应负载（键 = KNOWLEDGE_CHANNELS 键；Map 经 IPC 结构化克隆保真） */
export interface KnowledgeChannelResponses {
  browse: DomainNode[]
  listEntries: KnowledgeCard[]
  entryDetail: EntryDetail
  heat: Map<number, number>
  sessionRecall: RecallGroup[]
}

/** forge:fs/* 请求负载（键 = FS_CHANNELS 键；listDir 缺省 = 用户主目录） */
export interface FsChannelRequests {
  listDir: ListDirRequest
}

/** forge:fs/* 响应负载（键 = FS_CHANNELS 键） */
export interface FsChannelResponses {
  listDir: DirListing
}
