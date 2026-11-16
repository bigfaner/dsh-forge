// 1.42 随 knowledge 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// knowledge 域 RPC channels face（结构同型镜像——自 apps/web/src/rpc 抽出被用面）：
// plugins/project/ui/rpc.ts 已有 Typert 六族面但无 knowledge 命名空间，且 knowledge 域
// 数据通道保持 channels face 原样（范围外另案——提案明示，不做 Typert 改接），故本件
// 镜像 channels 传输形态（transport 注入 + RpcResult 信封拆装 + typed error）。
// 镜像面 = errors.ts（RpcClientError）+ ui-state.ts（rpcUiState 全码表）+ transport.ts
// （preloadTransport）+ client.ts 的 knowledge/projects 消费切片（get/list——知识族
// 装载链唯一消费的 projects 两法）。
import {
  BUGS_CHANNELS,
  DOCS_CHANNELS,
  FEATURES_CHANNELS,
  FS_CHANNELS,
  KNOWLEDGE_CHANNELS,
  PROJECTS_CHANNELS,
  PROJECTS_M2_CHANNELS,
  PROPOSALS_CHANNELS,
  SETTINGS_CHANNELS,
  TASKS_CHANNELS,
  WORKTREE_CHANNELS,
  type DeriveTaskStoreDirRequest,
  type DeriveTaskStoreDirResult,
  type DirListing,
  type DocContent,
  type DomainNode,
  type EntryActionReceipt,
  type EntryActionRequest,
  type EntryDetail,
  type EntryDetailQuery,
  type ErrorCode,
  type FeatureCard,
  type FeatureDocumentRow,
  type FeatureRow,
  type ForgeSettings,
  type BugCard,
  type BugCommitFile,
  type BugCommitFilesQuery,
  type BugFileDiffQuery,
  type GetProjectRequest,
  type KnowledgeCard,
  type ListDirRequest,
  type ListBugsQuery,
  type ListEntriesQuery,
  type ListFeatureDocsQuery,
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
  type RecallFeedbackOutcome,
  type RecallFeedbackRequest,
  type RecallGroup,
  type RegisterFeatureInput,
  type RegisterProjectInput,
  type RegisterResult,
  type ReconcileReport,
  type RpcErrorPayload,
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
  type WorktreeAheadBehindRequest,
  type WorktreeAheadBehindResult,
  type WorktreeBranchesRequest,
  type WorktreeBranchesResult,
  type WorktreeChecksRequest,
  type WorktreeChecksResult,
  type WorktreeCreateRequest,
  type WorktreeCreateResult,
  type WorktreeDeleteRequest,
  type WorktreeDeleteResult,
  type WorktreeEnsureWorkspaceRequest,
  type WorktreeEnsureWorkspaceResult,
  type WorktreeListRequest,
  type WorktreeListResult,
  type WorktreeResolveRequest,
  type WorktreeResolveResult,
  type WorktreeSealRequest,
  type WorktreeSealResult,
  type WorktreeSelectRequest,
  type WorktreeSelectResult,
} from '@dsh-forge/contracts'
import { CONNECTION_ENDPOINT_BY_CHANNEL, KNOWLEDGE_RPC_CHANNEL } from '../shared/connection-rpc.js'

export { CONNECTION_ENDPOINT_BY_CHANNEL, KNOWLEDGE_RPC_CHANNEL }

// ───────────────── errors.ts 镜像 ─────────────────

/** typed error 的 renderer 侧形态（code ∈ contracts 六码；data = 结构化附载原样保真） */
export class RpcClientError extends Error {
  readonly code: ErrorCode
  readonly data: unknown

  constructor(payload: RpcErrorPayload) {
    super(payload.message)
    this.name = 'RpcClientError'
    this.code = payload.code
    this.data = payload.data
  }
}

// ───────────────── ui-state.ts 镜像 ─────────────────

/** UI 状态三态（组件选型：EmptyState / 表单/面板错误条 / 应用级横幅） */
export type RpcUiStateKind = 'error-bar' | 'banner' | 'empty-state'

/** code → 状态（约定本体；理由逐行见壳侧 apps/web/src/rpc/README.md 消费约定表） */
export const RPC_UI_STATE_BY_CODE: Readonly<Record<ErrorCode, RpcUiStateKind>> = {
  // 注册流程内失败（create 中止 / ③ 写失败，含补偿已执行口径）——表单错误条，用户原地重试
  ERR_WORKSPACE_CREATE: 'error-bar',
  ERR_PROJECT_WRITE: 'error-bar',
  // 补偿失败留孤儿（已 app_key_logs 记账 + 启动对账提示）——应用级横幅，超出单表单语境
  ERR_COMPENSATION: 'banner',
  // 条目漂移 / 索引静默重建中——详情与浏览面退空态
  ERR_ENTRY_NOT_FOUND: 'empty-state',
  ERR_INDEX_STALE: 'empty-state',
  // 知识目录不可达——浏览面空态 + 提示（无内容可列）
  ERR_INVALID_KNOWLEDGE_DIR: 'empty-state',
  // ── M2 15 新码（1.1 扩池承接；3.1 按码精化——tech-design Propagation Strategy）──
  // 读未命中 → 空态（详情/列表面目标缺席 = 无内容可列，与知识域三码同口径）
  ERR_TASK_NOT_FOUND: 'empty-state',
  ERR_FEATURE_NOT_FOUND: 'empty-state',
  ERR_PROPOSAL_NOT_FOUND: 'empty-state',
  // 动词校验失败 → 错误条（表单/动作原地反馈，用户改参重试）
  ERR_INVALID_TRANSITION: 'error-bar',
  ERR_DEPENDENCIES_UNMET: 'error-bar',
  ERR_CYCLE_DETECTED: 'error-bar',
  ERR_CHAIN_DEPTH_EXCEEDED: 'error-bar',
  ERR_REASON_REQUIRED: 'error-bar',
  ERR_SUMMARY_REQUIRED: 'error-bar',
  ERR_TASK_EXISTS: 'error-bar',
  ERR_FEATURE_EXISTS: 'error-bar',
  ERR_WORKSPACE_NOT_REGISTERED: 'error-bar',
  ERR_DOC_PATH_INVALID: 'error-bar',
  // 疑似移动 → 错误条 + 手工指引留场（表单语境，data.guidance 喂点——注册表单单点重试）
  ERR_SUSPECTED_MOVE: 'error-bar',
  // 库不可用 → 工作区隔离态（概览域级横幅——单库腐化不瘫痪全局，其余工作区照常）
  ERR_WORKSPACE_DB_UNAVAILABLE: 'banner',
  // ── M3 3 新码（1.1 扩池承接；按码精化归 4.x）──
  // 提交证据/摘要缺席 → 错误条（结算语境原地反馈；ERR_TEST_EVIDENCE_REQUIRED data 含 AC 清单）
  ERR_TEST_EVIDENCE_REQUIRED: 'error-bar',
  ERR_GATE_SUMMARY_REQUIRED: 'error-bar',
  // spawn 失败 → 错误条（派发语境——任务留 in_progress 幂等重入，指引重试）
  ERR_SPAWN_FAILED: 'error-bar',
  // ── worker-lean-execution S3（结构化提交机械门）──
  // AC 逐项未达 / 交叉校验失配 / files 分组失配 → 错误条（结算语境原地反馈，改参重试）
  ERR_AC_NOT_MET: 'error-bar',
  ERR_AC_CRITERIA_MISMATCH: 'error-bar',
  ERR_FILES_UNION_MISMATCH: 'error-bar',
  // ── forge-verification-hardening 机械⑤（强制域取证声明校验兜底）──
  // 强制域缺取证声明 / 证据与债务并存 → 错误条（结算语境原地反馈，二选一改参重试）
  ERR_RUNTIME_EVIDENCE_REQUIRED: 'error-bar',
  ERR_RUNTIME_EVIDENCE_CONFLICT: 'error-bar',
  // ── main-agent-task-tools（updateTask 锁定面）──
  // 锁定态改写 / 派生边改写 → 错误条（修改语境原地反馈，改参重试）
  ERR_TASK_LOCKED: 'error-bar',
  ERR_TASK_EDGE_ORIGIN_LOCKED: 'error-bar',
  // ── fix-bug（bug 域两写径）──
  // bug 未命中 → 空态（详情引用锚缺席）；其余写径校验 → 错误条（表单/回填语境原地反馈）
  ERR_BUG_NOT_FOUND: 'empty-state',
  ERR_BUG_SUMMARY_TOO_LONG: 'error-bar',
  ERR_BUG_ALREADY_RESOLVED: 'error-bar',
  ERR_COMMIT_HASH_REQUIRED: 'error-bar',
  // ── bug-recurrence-chain（复发链挂链写径）──
  // 挂链引用悬空/弱引用格式非法 → 错误条（recordBug 语境原地反馈——前驱 bug_id 不存在或形制非法改参重试）
  ERR_BUG_RECURRENCE_DANGLING: 'error-bar',
  ERR_BUG_RECURRENCE_INVALID: 'error-bar',
  // ── plugin-project 1.11 归拢（host/bugs 行级归属键闸门）──
  // project_key 派生失败 → 错误条（登记语境原地反馈——项目归属未解析，重试同因）
  ERR_BUG_PROJECT_KEY_REQUIRED: 'error-bar',
  // ── dispatch-loop-hardening 改进 5（addTask caller 身份分流）──
  // worker 会话 addTask 拒收 → 错误条（自解释文案带正确动作——submitTask result=blocked 如实结算）
  ERR_WORKER_ADDTASK_DENIED: 'error-bar',
  // ── session-binding-guarantee W2 / bug 4a30b193（host 能力/目标树缺席显式拒绝）──
  // 会话创建入口 fail-closed 拒绝 → 错误条（创建语境原地反馈）
  ERR_WORKTREE_CAPABILITY_ABSENT: 'error-bar',
  ERR_WORKTREE_TARGET_ABSENT: 'error-bar',
  // ── task-pause-primitive §2.1（addTask before 后继状态守卫）──
  // before 后继处不可挂边状态 → 错误条（插入语境原地反馈——指路 pauseTask / human 通道 / 改选后继）
  ERR_BEFORE_SUCCESSOR_INVALID: 'error-bar',
  // ── project-manual-order（patch.sortOrders 批量排序写面校验）──
  // sortOrders 校验拒绝 → 错误条（拖拽写回语境原地反馈——序回弹拖拽前渲染，改序重试）
  ERR_PROJECT_SORT_INVALID: 'error-bar',
  // ── bug 0a25720c 方案 A（addTask 建链守卫）──
  // blocked 源缺省 block_source → 错误条（建链语境原地反馈——文案带指引补 block_source=true）
  ERR_BLOCK_SOURCE_REQUIRED: 'error-bar',
  // ── loop-recurrence-hardening T2（blocked 归类闸门）──
  // blocked 结算缺根因归类 → 错误条（结算语境原地反馈——文案带归类字段形状指引重提交）
  ERR_BLOCK_CLASSIFICATION_REQUIRED: 'error-bar',
  // ── loop-recurrence-hardening T3（同缝拦截 + 待建模软拒绝）──
  // 同缝 ≥2 盲试 fix 派发软拒绝 → 错误条（派发语境原地反馈——文案带升级排查与报告落卷放行指引）
  ERR_RECURRENCE_ESCALATION_REQUIRED: 'error-bar',
  // ── loop-recurrence-hardening T4（覆盖声明闸门）──
  // 覆盖声明段/报告锚行缺席 / 锚指向卷宗不在场 → 错误条（fixed 回填语境原地反馈——文案带协议补证指引）
  ERR_BUG_COVERAGE_DECLARATION_REQUIRED: 'error-bar',
  ERR_BUG_COVERAGE_ANCHOR_INVALID: 'error-bar',
  // ── forge-dirs-query-tool（双查询工具受控面拒绝）──
  // 未知 dirKey/dest / requires 缺参 → 错误条（查询语境原地反馈——文案带法集改参重试）
  ERR_DIR_PATH_INVALID: 'error-bar',
  // loop-phase-gate B1 三码（main 并入）：阶段门未收口 = 应用级横幅；block_source 状态守卫 = 动作反馈错误条
  ERR_PHASE_GATE_UNSETTLED: 'banner',
  ERR_BLOCK_SOURCE_IN_PROGRESS: 'error-bar',
  ERR_BLOCK_SOURCE_TERMINAL: 'error-bar',
  // ── plugin-spec 1.4（spec 域 typed 码池 + tool 入参收窄）──
  ERR_SPEC_NOT_FOUND: 'empty-state',
  ERR_SPEC_GOALS_EMPTY: 'error-bar',
  ERR_SPEC_CRITERION_EMPTY: 'error-bar',
  ERR_SPEC_TIERS_INVALID: 'error-bar',
  ERR_SPEC_DUPLICATE_SLUG: 'error-bar',
  ERR_SPEC_DUPLICATE_DOC_PATH: 'error-bar',
  ERR_SPEC_PROJECT_KEY_DERIVATION: 'error-bar',
  ERR_SPEC_ARCHIVED_FROZEN: 'error-bar',
  ERR_SPEC_ILLEGAL_TRANSITION: 'error-bar',
  ERR_SPEC_REJECT_NOTE_REQUIRED: 'error-bar',
  ERR_SPEC_ACTOR_INVALID: 'error-bar',
  ERR_SPEC_DOC_WRITE: 'error-bar',
  ERR_TOOL_ARGS_INVALID: 'error-bar',
}

/**
 * UI 消费入口：catch RpcClientError → rpcUiState(error.code) → 选状态组件。
 * 未映射码 → 通用错误条兜底（永无裸 code 泄漏——Record 编译期穷举之外，运行期
 * 版本错配面（主进程新版码 × 旧 renderer 映射表）亦收敛为 error-bar，不 undefined 外溢）。
 */
export function rpcUiState(code: ErrorCode): RpcUiStateKind {
  return RPC_UI_STATE_BY_CODE[code] ?? 'error-bar'
}

// ───────────────── transport.ts 镜像 ─────────────────

/** forge:* 通道调用形状（client 注入消费——测试替身与 preload 真身同型） */
export type ForgeTransport = (channel: string, payload?: unknown) => Promise<unknown>

/** preload 暴露面的 RPC 切片（window.dshForge.invoke） */
interface DshForgeInvokeGlobal {
  invoke(channel: string, payload?: unknown): Promise<unknown>
}

/** 取 preload 传输真身；缺席即装配断裂（host 未接 preload / 非 Electron 载体），fail-loud。 */
export function preloadTransport(): ForgeTransport {
  const bridge = (globalThis as { dshForge?: DshForgeInvokeGlobal }).dshForge
  if (bridge === undefined || typeof bridge.invoke !== 'function') {
    throw new Error(
      'dsh-forge web: window.dshForge.invoke 缺席——宿主 preload 未接 RPC 面（forge:* 通道常量 = @dsh-forge/contracts channels）',
    )
  }
  return (channel, payload) => bridge.invoke(channel, payload)
}

// ───────────────── client.ts 镜像（channels face 单源——typert strict 迁移 1.5 三重镜像族收敛） ─────────────────
// 本件 = forge:* channels 传输 client 的唯一正本（RpcClientError / createForgeRpcClient /
// preloadRpcClientFactory 单源）；dock-tabs/rpc-channels.ts 与 knowledge 消费面一律经本件
// 再导出消费，零逐字副本。preload 桥保留为 dsh-forge 集成态加速位（语义不变）。
// forge RPC client（定位：基础——通道契约消费方）。通道名仅出自 contracts 常量（禁字面量）；
// 信封拆装：RpcOk → data 原样返回；RpcErr → 抛 RpcClientError（typed error 反序列化）；
// 形状非法 fail-loud（不静默捏造结果）。

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

/** forge:projects/* 面方法集（Interface 1 服务面 + Interface 5 M2 派生行扩族 + knowledge 消费切片） */
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
 * knowledge-review-ui 增 entryAction 第六方法：web 人工裁决写面（confirm/reject 批量 + 单条/树级动词）。
 */
export interface ForgeKnowledgeRpc {
  /** 域树聚合（domainPath 派生 ≤3 层，节点计数含子域；底表 = listEntries） */
  browse(projectId: string): Promise<DomainNode[]>
  /** 浏览卡片（组合过滤：目录路径前缀 × 关键词细分 × 状态片——服务端执行） */
  listEntries(q: ListEntriesQuery): Promise<KnowledgeCard[]>
  /** 详情抽屉（含 Markdown 正文按需读取） */
  entryDetail(q: EntryDetailQuery): Promise<EntryDetail>
  /** 热度 = 使用事件按条目计数（Map 经 IPC 结构化克隆保真） */
  heat(projectId: string): Promise<Map<number, number>>
  /** 召回 tab 数据源（call_id 聚合分组 + 命中快照展开） */
  sessionRecall(q: SessionRecallQuery): Promise<RecallGroup[]>
  /** 人工裁决（判别联合动词；逐条回执 code 封闭码集——文案分派键） */
  entryAction(req: EntryActionRequest): Promise<EntryActionReceipt>
  /** 召回反馈动作（判别联合——行级 👍/👎/撤销 + 事件级 👎 批/批撤销；stage④ 1.7 第七通道） */
  recallFeedback(req: RecallFeedbackRequest): Promise<RecallFeedbackOutcome>
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

/**
 * forge:bugs/* 面方法集（fix-bug：list 列表读面 + commitFiles/fileDiff 变更内容读面——
 * fixed 证据的文件清单与单文件 diff；recordBug/resolveBug 写动词 = agent tool 专属，恒不上 RPC）。
 */
export interface ForgeBugsRpc {
  list(q: ListBugsQuery): Promise<BugCard[]>
  commitFiles(q: BugCommitFilesQuery): Promise<BugCommitFile[]>
  fileDiff(q: BugFileDiffQuery): Promise<{ diff: string }>
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

/**
 * forge:worktree/* 面方法集（10 方法 + resolve；域实现 = packages/plugins/git-worktree，
 * host ipc/worktree-rpc 装配透传。seal = 封存判定快照；select = hero 选中树推送；
 * resolve = 批量归属解析。session-create 通道已退役——bug 82e92933）。
 */
export interface ForgeWorktreeRpc {
  list(q: WorktreeListRequest): Promise<WorktreeListResult>
  create(q: WorktreeCreateRequest): Promise<WorktreeCreateResult>
  delete(q: WorktreeDeleteRequest): Promise<WorktreeDeleteResult>
  aheadBehind(q: WorktreeAheadBehindRequest): Promise<WorktreeAheadBehindResult>
  branches(q: WorktreeBranchesRequest): Promise<WorktreeBranchesResult>
  checks(q: WorktreeChecksRequest): Promise<WorktreeChecksResult>
  seal(q: WorktreeSealRequest): Promise<WorktreeSealResult>
  select(q: WorktreeSelectRequest): Promise<WorktreeSelectResult>
  selected(q: { readonly projectRoot: string }): Promise<{ readonly path?: string }>
  resolve(q: WorktreeResolveRequest): Promise<WorktreeResolveResult>
  ensureWorkspace(q: WorktreeEnsureWorkspaceRequest): Promise<WorktreeEnsureWorkspaceResult>
}

/** forge RPC client（transport 注入：preloadTransport() 真身 / 测试替身） */
export interface ForgeRpcClient {
  readonly projects: ForgeProjectsRpc
  readonly fs: ForgeFsRpc
  readonly knowledge: ForgeKnowledgeRpc
  readonly tasks: ForgeTasksRpc
  readonly features: ForgeFeaturesRpc
  readonly proposals: ForgeProposalsRpc
  readonly bugs: ForgeBugsRpc
  readonly docs: ForgeDocsRpc
  readonly settings: ForgeSettingsRpc
  readonly worktree: ForgeWorktreeRpc
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
      entryAction: (req) => invokeRpc<EntryActionReceipt>(transport, KNOWLEDGE_CHANNELS.entryAction, req),
      recallFeedback: (req) =>
        invokeRpc<RecallFeedbackOutcome>(transport, KNOWLEDGE_CHANNELS.recallFeedback, req),
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
    bugs: {
      list: (q) => invokeRpc<BugCard[]>(transport, BUGS_CHANNELS.list, q),
      commitFiles: (q) => invokeRpc<BugCommitFile[]>(transport, BUGS_CHANNELS.commitFiles, q),
      fileDiff: (q) => invokeRpc<{ diff: string }>(transport, BUGS_CHANNELS.fileDiff, q),
    },
    docs: {
      read: (q) => invokeRpc<DocContent>(transport, DOCS_CHANNELS.read, q),
      openExternal: (q) => invokeRpc<void>(transport, DOCS_CHANNELS.openExternal, q),
    },
    settings: {
      get: () => invokeRpc<ForgeSettings>(transport, SETTINGS_CHANNELS.get),
      set: (input) => invokeRpc<void>(transport, SETTINGS_CHANNELS.set, input),
    },
    worktree: {
      list: (q) => invokeRpc<WorktreeListResult>(transport, WORKTREE_CHANNELS.list, q),
      create: (q) => invokeRpc<WorktreeCreateResult>(transport, WORKTREE_CHANNELS.create, q),
      delete: (q) => invokeRpc<WorktreeDeleteResult>(transport, WORKTREE_CHANNELS.delete, q),
      aheadBehind: (q) => invokeRpc<WorktreeAheadBehindResult>(transport, WORKTREE_CHANNELS.aheadBehind, q),
      branches: (q) => invokeRpc<WorktreeBranchesResult>(transport, WORKTREE_CHANNELS.branches, q),
      checks: (q) => invokeRpc<WorktreeChecksResult>(transport, WORKTREE_CHANNELS.checks, q),
      seal: (q) => invokeRpc<WorktreeSealResult>(transport, WORKTREE_CHANNELS.seal, q),
      select: (q) => invokeRpc<WorktreeSelectResult>(transport, WORKTREE_CHANNELS.select, q),
      selected: (q) => invokeRpc<{ readonly path?: string }>(transport, WORKTREE_CHANNELS.selected, q),
      resolve: (q) => invokeRpc<WorktreeResolveResult>(transport, WORKTREE_CHANNELS.resolve, q),
      ensureWorkspace: (q) =>
        invokeRpc<WorktreeEnsureWorkspaceResult>(transport, WORKTREE_CHANNELS.ensureWorkspace, q),
    },
  }
}

/** RPC client 构造器（fix-36 单一来源：缺省 = preload 真身；注入 = 测试面） */
export type RpcClientFactory = () => ForgeRpcClient

/**
 * 缺省构造：preload 传输真身。缺席（非 Electron 载体/preload 未接）在构造期抛——由各
 * 消费面错误归一收敛为错误相位/错误条，不炸壳。
 */
export function preloadRpcClientFactory(): ForgeRpcClient {
  return createForgeRpcClient(preloadTransport())
}

// ───────────────── connection.rpc 双运输面（fix-9——bug 1c2a603e）─────────────────
// 官方 dsh web 宿主无 preload 面 → 缺省 preloadRpcClientFactory 构造期抛 → 插槽节 fail-soft
// 退 null。官方正缝（上游 dsh-client-connection 源码核销）：client ctx.connection.rpc.call
// (channel, endpoint, payload) → ConnectionRpcResult {ok,value}|{ok,error:{code,message,details}}
// （rpc.d.ts:209-230）；host 侧 ctx.connection.rpc.handle(channel, handler) 逻辑通道注册
// （rpc-host.d.ts:27-31，channel 形态 ^\/[A-Za-z0-9._~-]+$，endpoint 段 ^[A-Za-z0-9_$.-]+$）。
// 装配期分流：ctx.connection 在场走 connection 面（官方宿主 + dsh-forge 官方 client 内核
// 两宿主同源——dsh-client-connection client.js ctx.provide('connection')，裁决记 faces.ts）；
// 缺席回落 preload 面（dsh-forge Electron preload）；两缺 = 现行 fail-loud（构造期抛）。

/** knowledge 域连接 RPC 通道（host 半为 '/api' 精确路由族——逐 endpoint 一条 ctx.connection.fetch.register 精确 POST 路由，host/connection-rpc.ts 落座）——通道常量本体 = shared/connection-rpc.ts（上方 import + re-export） */

/** ctx.connection.rpc.call 消费切片（ClientConnectionRpc 结构同型——测试替身同型） */
export interface ConnectionRpcCallFace {
  call(channel: string, endpoint: string, payload?: unknown, signal?: AbortSignal): Promise<unknown>
}

/**
 * 通道常量 → (逻辑通道, endpoint) 映射表（endpoint 段官方校验 ^[A-Za-z0-9_$.-]+$——
 * 点分族前缀防 knowledge/projects 方法键互撞；host 半 connection-rpc.ts 分发同表语义）。
 * worktree.resolve 不入表——knowledge UI 零消费（anchored-projects 镜像窄面注记），
 * 未映射通道走 typed 拒绝信封（消费面错误相位收敛）。常量本体 = shared/connection-rpc.ts。
 */

/**
 * connection 面传输适配（ForgeTransport 同形）：通道常量 → endpoint，经
 * ctx.connection.rpc.call('/knowledge', endpoint, payload) 送达；ConnectionRpcResult
 * 信封投影为 contracts RpcResult（{ok,data|error{code,message,data:details}}）——
 * invokeRpc 拆装面零改动（消费面签名不动）。未映射通道 / 信封形状非法 = typed 拒绝
 * 信封（不抛构造错——消费面错误相位 fail-soft，typert-transport 同型口径）。
 */
export function connectionRpcTransport(connection: ConnectionRpcCallFace): ForgeTransport {
  return async (channel, payload) => {
    const endpoint = CONNECTION_ENDPOINT_BY_CHANNEL[channel]
    if (endpoint === undefined) {
      return {
        ok: false,
        error: {
          code: 'internal',
          message: `dsh-forge knowledge: ${channel} 通道不在 connection 面映射表（'/knowledge' 逻辑通道未承载）——typed 降级`,
        },
      }
    }
    const raw = await connection.call(KNOWLEDGE_RPC_CHANNEL, endpoint, payload ?? {})
    if (raw === null || typeof raw !== 'object' || !('ok' in raw)) {
      return {
        ok: false,
        error: {
          code: 'internal',
          message: `dsh-forge knowledge: connection RPC 响应形状非法（${KNOWLEDGE_RPC_CHANNEL}/${endpoint}）——期望 ConnectionRpcResult 信封`,
        },
      }
    }
    const result = raw as { ok: boolean; value?: unknown; error?: { code?: unknown; message?: unknown; details?: unknown } }
    if (result.ok) return { ok: true, data: result.value }
    return {
      ok: false,
      error: {
        code: typeof result.error?.code === 'string' ? result.error.code : 'internal',
        message: typeof result.error?.message === 'string' ? result.error.message : 'connection rpc failure',
        data: result.error?.details,
      },
    }
  }
}

/** connection 面 makeClient 构造器（真身 = ctx.connection.rpc 切片；注入 = 测试替身同型） */
export function connectionRpcClientFactory(connection: ConnectionRpcCallFace): ForgeRpcClient {
  return createForgeRpcClient(connectionRpcTransport(connection))
}

/**
 * 装配期运输面分流（apply 期一次求值——faces 注册 inject 递达各数据消费面）：
 * ctx.connection.rpc.call 函数面在场 → connection 面工厂（官方宿主正缝）；缺席 → 现行
 * preload 面工厂（dsh-forge Electron preload；缺席构造期 fail-loud 语义不变）。
 * 检测永不缓存语义边界：此处缓存的是装配期选定的运输面（宿主载体装配期恒定，非跨插件
 * 服务在场性检测面——connection 服务随 client 内核装配期 provide，非中途装卸面）。
 */
export function resolveRpcClientFactory(ctx: unknown): RpcClientFactory {
  const call = (ctx as { connection?: { rpc?: { call?: unknown } } | undefined } | undefined)?.connection?.rpc?.call
  if (typeof call === 'function') {
    const connection: ConnectionRpcCallFace = { call: call as ConnectionRpcCallFace['call'] }
    return () => connectionRpcClientFactory(connection)
  }
  return preloadRpcClientFactory
}

// ── 缺省 factory 页内缝（apply 期安装——useForgeProjects 缺省参消费面）──
// faces 注册 inject 递达显式 props 链（面板/召回/目录节）；anchored-projects 链
// （useAnchoredProjects → useForgeProjects）为镜像 pin 逐字面（签名不动）——其缺省
// factory 经本页内缝安装换面（apply 期一次安装；本包 bundle 单副本页内单例，
// installForgeRemoteFace 页内锚同型先例）。
let installedDefaultFactory: RpcClientFactory = preloadRpcClientFactory

/** apply 期安装装配期分流选定的缺省 factory（faces.ts 消费——页内单点） */
export function installDefaultRpcClientFactory(factory: RpcClientFactory): void {
  installedDefaultFactory = factory
}

/** 缺省 factory 现读（useForgeProjects 缺省参消费——调用期求值非装载期冻结） */
export function currentDefaultRpcClientFactory(): RpcClientFactory {
  return installedDefaultFactory
}
