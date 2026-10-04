// forge RPC client（定位：基础——通道契约消费方，2.4 forge:projects/* 五通道）。
// 通道名仅出自 contracts 常量（禁字面量）；负载形状 = dto/rpc.ts 请求/响应映射；
// 信封拆装：RpcOk → data 原样返回；RpcErr → 抛 RpcClientError（typed error 反序列化）；
// 形状非法 fail-loud（不静默捏造结果）。3.5 增 knowledge 面（forge:knowledge/* 五通道——
// 只增面不改建制；search/readAbstract 不在面，agent 面唯一门 = knowledge 插件 tool，双门分工）。
// 2.8 增 fs 面（forge:fs/listDir——文件浏览器数据源；三处一体：contracts → 本文件 → host ipc）。
import {
  FS_CHANNELS,
  KNOWLEDGE_CHANNELS,
  PROJECTS_CHANNELS,
  type DirListing,
  type DomainNode,
  type EntryDetail,
  type EntryDetailQuery,
  type GetProjectRequest,
  type KnowledgeCard,
  type ListDirRequest,
  type ListEntriesQuery,
  type Project,
  type ProjectPatch,
  type ProjectSummary,
  type RecallGroup,
  type RegisterProjectInput,
  type RegisterResult,
  type ReconcileReport,
  type RpcResult,
  type SessionRecallQuery,
  type UpdateProjectRequest,
} from '@dsh-forge/contracts'
import { RpcClientError } from './errors.js'
import { preloadTransport, type ForgeTransport } from './transport.js'

async function invokeRpc<T>(transport: ForgeTransport, channel: string, payload?: unknown): Promise<T> {
  const raw = await transport(channel, payload)
  if (raw === null || typeof raw !== 'object' || !('ok' in raw)) {
    throw new Error(
      `dsh-forge web: RPC 信封形状非法（channel=${channel}）——期望 contracts RpcResult 信封，实得 ${raw === null ? 'null' : typeof raw}`,
    )
  }
  const result = raw as RpcResult<T>
  if (result.ok) return result.data
  throw new RpcClientError(result.error)
}

/** forge:projects/* 面方法集（Interface 1 服务面的通道同构镜像） */
export interface ForgeProjectsRpc {
  register(input: RegisterProjectInput): Promise<RegisterResult>
  list(): Promise<ProjectSummary[]>
  get(id: string): Promise<Project | null>
  update(id: string, patch: ProjectPatch): Promise<Project>
  reconcile(): Promise<ReconcileReport>
}

/** forge:fs/* 面方法集（宿主文件系统浏览面——只读目录列举，renderer 不开 Node fs 通道） */
export interface ForgeFsRpc {
  /** dirPath 缺省 = 用户主目录（浏览器起始态） */
  listDir(dirPath?: string): Promise<DirListing>
}

/**
 * forge:knowledge/* 面方法集（Interface 2 浏览面通道同构镜像；键 = KNOWLEDGE_CHANNELS 键）。
 * search/readAbstract 不在面——agent 面唯一门 = knowledge 插件 tool（双门分工）。
 */
export interface ForgeKnowledgeRpc {
  /** 域树聚合（domainPath 派生 ≤3 层，节点计数含子域；底表 = listEntries） */
  browse(projectId: string): Promise<DomainNode[]>
  /** 浏览卡片（组合过滤：目录路径前缀 × 关键词细分） */
  listEntries(q: ListEntriesQuery): Promise<KnowledgeCard[]>
  /** 详情抽屉（含 Markdown 正文按需读取） */
  entryDetail(q: EntryDetailQuery): Promise<EntryDetail>
  /** 热度 = 使用事件按条目计数（Map 经 IPC 结构化克隆保真） */
  heat(projectId: string): Promise<Map<number, number>>
  /** 召回 tab 数据源（call_id 聚合分组 + 命中快照展开） */
  sessionRecall(q: SessionRecallQuery): Promise<RecallGroup[]>
}

/** forge RPC client（transport 注入：preloadTransport() 真身 / 测试替身） */
export interface ForgeRpcClient {
  readonly projects: ForgeProjectsRpc
  readonly fs: ForgeFsRpc
  readonly knowledge: ForgeKnowledgeRpc
}

export function createForgeRpcClient(transport: ForgeTransport): ForgeRpcClient {
  return {
    projects: {
      register: (input) => invokeRpc(transport, PROJECTS_CHANNELS.register, input),
      list: () => invokeRpc<ProjectSummary[]>(transport, PROJECTS_CHANNELS.list),
      get: (id) =>
        invokeRpc<Project | null>(transport, PROJECTS_CHANNELS.get, { id } satisfies GetProjectRequest),
      update: (id, patch) =>
        invokeRpc<Project>(transport, PROJECTS_CHANNELS.update, {
          id,
          patch,
        } satisfies UpdateProjectRequest),
      reconcile: () => invokeRpc<ReconcileReport>(transport, PROJECTS_CHANNELS.reconcile),
    },
    fs: {
      listDir: (dirPath) =>
        invokeRpc<DirListing>(transport, FS_CHANNELS.listDir, { dirPath } satisfies ListDirRequest),
    },
    knowledge: {
      browse: (projectId) =>
        invokeRpc<DomainNode[]>(transport, KNOWLEDGE_CHANNELS.browse, { projectId }),
      listEntries: (q) => invokeRpc<KnowledgeCard[]>(transport, KNOWLEDGE_CHANNELS.listEntries, q),
      entryDetail: (q) => invokeRpc<EntryDetail>(transport, KNOWLEDGE_CHANNELS.entryDetail, q),
      heat: (projectId) => invokeRpc<Map<number, number>>(transport, KNOWLEDGE_CHANNELS.heat, { projectId }),
      sessionRecall: (q) => invokeRpc<RecallGroup[]>(transport, KNOWLEDGE_CHANNELS.sessionRecall, q),
    },
  }
}

/**
 * RPC client 构造器（fix-36 单一来源：缺省 = preload 真身；注入 = 测试面——各装载 hook
 * 同型口径，此前 sidebar/knowledge/session 三域各持逐字副本）。
 */
export type RpcClientFactory = () => ForgeRpcClient

/**
 * 缺省构造：preload 传输真身。缺席（非 Electron 载体/preload 未接）在构造期抛——由各
 * 消费面错误归一收敛为错误相位/错误条，不炸壳（fetchProjectsPhase / mapBrowseError /
 * mapRecallError / fetchDirListing 同口径）。
 */
export function preloadRpcClientFactory(): ForgeRpcClient {
  return createForgeRpcClient(preloadTransport())
}
