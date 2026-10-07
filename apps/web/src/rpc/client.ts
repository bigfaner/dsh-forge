// forge RPC client（定位：基础——通道契约消费方，2.4 forge:projects/* 五通道）。
// 通道名仅出自 contracts 常量（禁字面量）；负载形状 = dto/rpc.ts 请求/响应映射；
// 信封拆装：RpcOk → data 原样返回；RpcErr → 抛 RpcClientError（typed error 反序列化）；
// 形状非法 fail-loud（不静默捏造结果）。3.5 增 knowledge 面（forge:knowledge/* 五通道——
// 只增面不改建制；search/readAbstract 不在面，agent 面唯一门 = knowledge 插件 tool，双门分工）。
// 2.8 增 fs 面（forge:fs/listDir——文件浏览器数据源；三处一体：contracts → 本文件 → host ipc）。
// 3.1 增 M2 四族（forge:{tasks,features,proposals,docs}/* + projects 派生行扩族——Interface 7；
// 薄 Controller：仅参数映射与路由，禁业务逻辑。
// M3 4.1 扩池（Interface 4 三处一体的 web 侧落点；contracts/host 已先行）：forge:settings/{get,set}
// 新族（Forge设置 读写——forgeSettings 服务单门）+ forge:proposals/{transition,setMode,listDocs}
// （transitionProposal 从 tool 专属 → 双面——M2 纪律 drift 修订；setMode = 律三唯一正门·UI 专属；
// listDocs = 提案文档区目录扫描读）；恒不在面的写动词收窄为 addTask/submitTask/createProposal
// （claimTask 退役并入 dispatchTask——仅存 core 服务 API）。
import {
  DOCS_CHANNELS,
  FEATURES_CHANNELS,
  FS_CHANNELS,
  KNOWLEDGE_CHANNELS,
  PROJECTS_CHANNELS,
  PROJECTS_M2_CHANNELS,
  PROPOSALS_CHANNELS,
  SETTINGS_CHANNELS,
  TASKS_CHANNELS,
  type DeriveTaskStoreDirRequest,
  type DeriveTaskStoreDirResult,
  type DirListing,
  type DomainNode,
  type EntryDetail,
  type EntryDetailQuery,
  type FeatureCard,
  type FeatureDocumentRow,
  type FeatureRow,
  type ForgeSettings,
  type GetProjectRequest,
  type KnowledgeCard,
  type ListDirRequest,
  type ListFeatureDocsQuery,
  type ListEntriesQuery,
  type ListFeaturesQuery,
  type ListProposalDocsQuery,
  type ListProposalsQuery,
  type ListTasksQuery,
  type Project,
  type ProjectPatch,
  type ProjectSummary,
  type ProposalCard,
  type ProposalDocRow,
  type ProposalRow,
  type QueryTaskInput,
  type QueryTaskResult,
  type ReadDocRequest,
  type RecallGroup,
  type RegisterFeatureInput,
  type RegisterProjectInput,
  type RegisterResult,
  type ReconcileReport,
  type RpcResult,
  type SessionLinksQuery,
  type SessionRecallQuery,
  type SessionTaskLinkCard,
  type SetForgeSettingsInput,
  type SetProposalModeInput,
  type TaskCard,
  type TaskDetail,
  type TaskDetailQuery,
  type TaskGraph,
  type TaskGraphQuery,
  type TaskSnapshot,
  type TaskStats,
  type TaskStatsQuery,
  type TransitionFeatureInput,
  type TransitionProposalInput,
  type TransitionProposalResult,
  type TransitionTaskInput,
  type UpdateProjectRequest,
  type UpsertFeatureDocInput,
  type ValidateFeatureTasksInput,
  type ValidateReport,
  type DocContent,
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

/** forge:projects/* 面方法集（Interface 1 服务面 + Interface 5 M2 派生行扩族的通道同构镜像） */
export interface ForgeProjectsRpc {
  register(input: RegisterProjectInput): Promise<RegisterResult>
  list(): Promise<ProjectSummary[]>
  get(id: string): Promise<Project | null>
  update(id: string, patch: ProjectPatch): Promise<Project>
  reconcile(): Promise<ReconcileReport>
  /** M2 派生行（{tasksHome}/{flatten}@{hash8} 单源——注册表单预检位，纯读） */
  deriveTaskStoreDir(workspaceDir: string): Promise<DeriveTaskStoreDirResult>
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

/**
 * forge:tasks/* 面方法集（Interface 7 八通道——RPC 人类面 + 读面；键 = TASKS_CHANNELS 键）。
 * addTask/claimTask/submitTask 不在面——agent 面唯一门 = plugin-forge tool（SC7 断言面）。
 */
export interface ForgeTasksRpc {
  /** 人类纠偏转移（reason 必带；选项集与服务端 transitionTargets 同源零漂移） */
  transition(input: TransitionTaskInput): Promise<TaskSnapshot>
  /** 查询（四节按 include 门控；agent 面同法的 RPC 读面复用） */
  query(input: QueryTaskInput): Promise<QueryTaskResult>
  /** 只读校验（单 feature 子图五类检查） */
  validateFeatureTasks(input: ValidateFeatureTasksInput): Promise<ValidateReport>
  /** 列表（search 中英双语标签匹配；副行承重字段水化） */
  list(q: ListTasksQuery): Promise<TaskCard[]>
  /** 七态计数 */
  stats(q: TaskStatsQuery): Promise<TaskStats>
  /** feature 任务图（DAG/泳道渲染源） */
  graph(q: TaskGraphQuery): Promise<TaskGraph>
  /** 任务详情（allowedTransitions/actualFiles/refs 水化） */
  detail(q: TaskDetailQuery): Promise<TaskDetail>
  /** 挂接双源分型卡（会话头 pill 数据源） */
  sessionLinks(q: SessionLinksQuery): Promise<SessionTaskLinkCard[]>
}

/** forge:features/* 面方法集（Interface 7 五通道——UI 直调；键 = FEATURES_CHANNELS 键） */
export interface ForgeFeaturesRpc {
  register(input: RegisterFeatureInput): Promise<FeatureRow>
  transition(input: TransitionFeatureInput): Promise<FeatureRow>
  upsertDoc(input: UpsertFeatureDocInput): Promise<FeatureDocumentRow>
  list(q: ListFeaturesQuery): Promise<FeatureCard[]>
  /** feature_documents 列举读面（fix-2：概览 feature 子 tab 文档行数据源） */
  listDocs(q: ListFeatureDocsQuery): Promise<FeatureDocumentRow[]>
}

/**
 * forge:proposals/* 面方法集（M3 Interface 4 扩池四通道；createProposal 恒 tool 专属不上 RPC）。
 * transition = 人工裁决（M3 双面 drift 修订——agent 面保留）；setMode = 律三唯一正门
 * （agent tool 面无模式改写动词——SC6 断言面）；listDocs = 提案文档区只读扫描。
 */
export interface ForgeProposalsRpc {
  list(q: ListProposalsQuery): Promise<ProposalCard[]>
  /** 裁决转移（toStatus=accepted ∧ 远征 → 成链分叉内聚——返回 chained 水化） */
  transition(input: TransitionProposalInput): Promise<TransitionProposalResult>
  /** 模式改写唯一正门（单事务只写 proposals.mode——tasks.mode 快照永不触碰） */
  setMode(input: SetProposalModeInput): Promise<ProposalRow>
  /** 提案文档区读（docs/proposals/<slug>/ 全部 .md 目录扫描——零状态零写径） */
  listDocs(q: ListProposalDocsQuery): Promise<ProposalDocRow[]>
}

/** forge:docs/* 面方法集（Interface 7 两通道——read 工作区文档读 / openExternal main 侧执行） */
export interface ForgeDocsRpc {
  read(q: ReadDocRequest): Promise<DocContent>
  /** 外部打开（📁 编辑器入口；触发即忘——失败经 RpcErr 信封抛 RpcClientError） */
  openExternal(q: ReadDocRequest): Promise<void>
}

/** forge:settings/* 面方法集（M3 Interface 4 扩池——Forge设置 分区读写；forgeSettings 服务单门） */
export interface ForgeSettingsRpc {
  /** 读（worker 未配置 = 键缺席——dispatchTask 回退父会话继承） */
  get(): Promise<ForgeSettings>
  /** 整体覆写 worker 段（保存脏态——改完即生效无重启；失败经 RpcErr 信封） */
  set(input: SetForgeSettingsInput): Promise<void>
}

/** forge RPC client（transport 注入：preloadTransport() 真身 / 测试替身） */
export interface ForgeRpcClient {
  readonly projects: ForgeProjectsRpc
  readonly fs: ForgeFsRpc
  readonly knowledge: ForgeKnowledgeRpc
  readonly tasks: ForgeTasksRpc
  readonly features: ForgeFeaturesRpc
  readonly proposals: ForgeProposalsRpc
  readonly docs: ForgeDocsRpc
  readonly settings: ForgeSettingsRpc
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
      deriveTaskStoreDir: (workspaceDir) =>
        invokeRpc<DeriveTaskStoreDirResult>(transport, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, {
          workspaceDir,
        } satisfies DeriveTaskStoreDirRequest),
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
    tasks: {
      transition: (input) => invokeRpc<TaskSnapshot>(transport, TASKS_CHANNELS.transition, input),
      query: (input) => invokeRpc<QueryTaskResult>(transport, TASKS_CHANNELS.query, input),
      validateFeatureTasks: (input) =>
        invokeRpc<ValidateReport>(transport, TASKS_CHANNELS.validateFeatureTasks, input),
      list: (q) => invokeRpc<TaskCard[]>(transport, TASKS_CHANNELS.list, q),
      stats: (q) => invokeRpc<TaskStats>(transport, TASKS_CHANNELS.stats, q),
      graph: (q) => invokeRpc<TaskGraph>(transport, TASKS_CHANNELS.graph, q),
      detail: (q) => invokeRpc<TaskDetail>(transport, TASKS_CHANNELS.detail, q),
      sessionLinks: (q) => invokeRpc<SessionTaskLinkCard[]>(transport, TASKS_CHANNELS.sessionLinks, q),
    },
    features: {
      register: (input) => invokeRpc<FeatureRow>(transport, FEATURES_CHANNELS.register, input),
      transition: (input) => invokeRpc<FeatureRow>(transport, FEATURES_CHANNELS.transition, input),
      upsertDoc: (input) => invokeRpc<FeatureDocumentRow>(transport, FEATURES_CHANNELS.upsertDoc, input),
      list: (q) => invokeRpc<FeatureCard[]>(transport, FEATURES_CHANNELS.list, q),
      listDocs: (q) => invokeRpc<FeatureDocumentRow[]>(transport, FEATURES_CHANNELS.listDocs, q),
    },
    proposals: {
      list: (q) => invokeRpc<ProposalCard[]>(transport, PROPOSALS_CHANNELS.list, q),
      transition: (input) => invokeRpc<TransitionProposalResult>(transport, PROPOSALS_CHANNELS.transition, input),
      setMode: (input) => invokeRpc<ProposalRow>(transport, PROPOSALS_CHANNELS.setMode, input),
      listDocs: (q) => invokeRpc<ProposalDocRow[]>(transport, PROPOSALS_CHANNELS.listDocs, q),
    },
    docs: {
      read: (q) => invokeRpc<DocContent>(transport, DOCS_CHANNELS.read, q),
      openExternal: (q) => invokeRpc<void>(transport, DOCS_CHANNELS.openExternal, q),
    },
    settings: {
      get: () => invokeRpc<ForgeSettings>(transport, SETTINGS_CHANNELS.get),
      set: (input) => invokeRpc<void>(transport, SETTINGS_CHANNELS.set, input),
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
