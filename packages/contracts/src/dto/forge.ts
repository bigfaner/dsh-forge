// M2 forge 四域 DTO 与方法签名（tech-design §Interface 1–5 逐项对照，不自行增删方法；
// 载荷映射键 = channels.ts 族常量键——三处一体的 DTO 侧落点）。字段形状依据
// design/schema.sql 七域表（SQLite INTEGER 0/1 → boolean，TEXT ISO-8601 → string，
// *_json 列 → 解码形）与 Cross-Layer Data Map。身份双轨（2026-10-06 用户裁决）：
// taskId = tasks.id（uuid 代理主键——FK/前端/RPC 引用锚，slug 改名零级联）；
// TaskRef = { slug; localId }（agent 自然键，UNIQUE(slug, local_id) 查捞）——
// TaskSnapshot/TaskCard/TaskDetail 恒含 { taskId, slug, localId }。
// M3（1.1）：容器双轨容器化改写（featureSlug 族 → source: ContainerRef 族——Interface 1）+
// mode 词汇 + tasks.mode 快照/ac_json 快照面 + main_session 砍除 + 提案域三新面
// （setProposalMode/listProposalDocs/supersededBy 谱系）+ forgeSettings 服务签名 +
// ForgePluginEvent 事件两层联合（Interface 3）。
// 定位铁律：纯类型与纯常量，零逻辑零依赖。
import type { ForgeEventChannel } from '../channels.js'
import type { ErrorCode } from '../errors.js'
import type { FeatureStatus, ProposalStatus, TaskStatus, TaskType } from '../labels.js'
import type { ProjectService } from './project.js'

// ─────────────────────────── 词汇与枚举（schema 单源对齐） ───────────────────────────

/** 任务自然键（agent 面输入 = slug + localId 两显式参；dispatchPrompt TASK_ID 与界面展示 = 'slug/localId'） */
export interface TaskRef {
  /** 容器 slug（M3：feature 或 proposal 目录名；slug 列 ≡ 容器 slug——服务不变量 + validateFeatureTasks 断言） */
  slug: string
  /** 容器内局部键（混合分配 §6-35⑦：常规数值顺延 / fix-N·disc-N 动态前缀） */
  localId: string
}

/** M3 任务容器类型双值（tasks.source_kind CHECK 同词汇；容器 = feature 或 proposal） */
export const CONTAINER_KINDS = ['feature', 'proposal'] as const

export type ContainerKind = (typeof CONTAINER_KINDS)[number]

/**
 * 任务容器引用（M3 通用源头双列的 agent 面 DTO——Cross-Layer Data Map：
 * ContainerRef{kind,slug}（agent 面）/ sourceId（RPC 面））。kind 判别 + slug 承载；
 * 服务不变量：tasks.slug ≡ 解析出的容器 slug + source_id 必命中 kind 对应表
 * （多态引用无 DB FK——写入校验承载）。
 */
export interface ContainerRef {
  kind: ContainerKind
  /** 容器 slug（feature 目录名 / proposal slug——任务 slug 恒等值） */
  slug: string
}

/**
 * M3 模式词汇双值（proposals.mode CHECK expedition|blitz|NULL 与 tasks.mode 快照列共用；
 * 远征 = 全管线（提案→PRD→设计→任务分解）/ 突击 = 提案直挂任务直达）。
 * feature 容器恒 'expedition'（无列——成链门保证，裁决⑥）；tasks.mode = 创建时快照不回溯。
 */
export const MODES = ['expedition', 'blitz'] as const

export type Mode = (typeof MODES)[number]

/** tasks.priority CHECK 三值 */
export type TaskPriority = 'P0' | 'P1' | 'P2'

/** tasks.complexity CHECK 三值 */
export type TaskComplexity = 'low' | 'medium' | 'high'

/** task_records.verb 六值（TS 单源无 CHECK——§6-32③；append-only 行的动词面） */
export const TASK_RECORD_VERBS = [
  'add',
  'claim',
  'submit',
  'transition',
  'auto-restore',
  'auto-block',
] as const

export type TaskRecordVerb = (typeof TASK_RECORD_VERBS)[number]

/** feature_records.verb 三值（TS 单源无 CHECK——M3 2.1；append-only 审计行的动词面）。
 *  三动词闭包伴随：register = registerFeature（含 2.2 成链内聚同事务调用）/
 *  transition = transitionFeature / doc-upsert = upsertFeatureDoc。 */
export const FEATURE_RECORD_VERBS = [
  'register',
  'transition',
  'doc-upsert',
] as const

export type FeatureRecordVerb = (typeof FEATURE_RECORD_VERBS)[number]

/** task_records.actor 三值（actor 由通道语境服务端推断——tool = 'plugin-tool'，RPC = 'ui'；输入面不收）。
 *  feature_records.actor 同词汇（schema CHECK 同三值——共享本类型单源）。 */
export type TaskActor = 'plugin-tool' | 'ui' | 'core'

/** task_edges.origin 三值（manual 人工声明 / fix-chain 派生链 / autoconfig 自动配置） */
export type TaskEdgeOrigin = 'manual' | 'fix-chain' | 'autoconfig'

/**
 * feature_documents.doc_kind 受控词汇（TS 单源无 CHECK——§6-23 行级开放：加类不加列，
 * 扩词汇 = 契约面变更）。目录约定七类 = docs/features/<slug>/ 下 prd·ui·design 三段文档。
 */
export const DOC_KINDS = [
  'prd-spec',
  'user-stories',
  'ui-functions',
  'tech-design',
  'er-diagram',
  'sql-schema',
  'page-map',
] as const

export type DocKind = (typeof DOC_KINDS)[number]

// ─────────────────────────── Interface 1：任务域（ctx.forgeTasks） ───────────────────────────

/** 质量门载荷（task_records.gate_json 同构：布尔四项 + coverage 小数） */
export interface TaskGateReport {
  compile: boolean
  fmt: boolean
  lint: boolean
  test: boolean
  /** 覆盖率小数（0–1；缺省 = 未度量） */
  coverage?: number
}

/** tasks 行应用层形状（claim/transition 返回体；身份双轨恒含 taskId + slug + localId） */
export interface TaskSnapshot {
  /** uuid 代理主键（FK/前端/RPC 引用锚，恒稳定） */
  taskId: string
  slug: string
  localId: string
  /** 所属容器（M3 通用源头双列的行形状承载——feature 恒在；proposal = 突击直挂） */
  source: ContainerRef
  title: string
  taskType: TaskType
  taskStatus: TaskStatus
  /** 内容负载（Hard Rules/参照列表等自由文本，C11） */
  taskDesc?: string
  priority?: TaskPriority
  /** 如 '1-2h'（autoconfig 产出语义） */
  estimatedTime?: string
  /** --var 注入变量（vars_json 解码形） */
  vars?: Record<string, string>
  /** fix 链源（uuid 自引用，链深 ≤ 6；非 fix 任务缺省） */
  sourceTaskId?: string
  blockedReason?: string
  /** M3 创建时模式快照（容器 mode 的不可回溯快照；feature 容器恒 'expedition'；NULL = 键缺席） */
  mode?: Mode
  /** 验收清单（ac_json 解码形——submitTask AC 证据门判据；无 AC 任务键缺席） */
  acceptanceCriteria?: string[]
  breaking: boolean
  /** 覆盖率阈值小数；缺省 = 全局默认（三级优先） */
  coverage?: number
  complexity: TaskComplexity
  surfaceKey?: string
  surfaceType?: string
  /** ISO-8601 */
  createdAt: string
  /** ISO-8601 */
  updatedAt: string
}

/** 前置摘要项（自然键 + 当前状态——列表副行「前置」与现状条「前置（键+当前状态）」共用） */
export interface TaskPrerequisiteSummary {
  slug: string
  localId: string
  taskStatus: TaskStatus
}

/**
 * 任务列表卡（概览任务子 tab 三视图共载体；副行承重字段：
 * 类型/优先级/实际耗时[completed]/前置摘要/挂接计数/fix 源标）。
 */
export interface TaskCard {
  taskId: string
  slug: string
  localId: string
  title: string
  taskType: TaskType
  taskStatus: TaskStatus
  priority?: TaskPriority
  estimatedTime?: string
  /** 实际耗时毫秒（仅 completed；core 水化 = 首 claim → 末 submit 时差；缺时间/时差 ≤0 不显示——XhYm 格式化归 UI） */
  actualDurationMs?: number
  /** 前置摘要（自然键 + 当前状态） */
  prerequisites: TaskPrerequisiteSummary[]
  /** 挂接会话计数（links ∪ records 双源去重） */
  sessionCount: number
  /** fix 链源自然键（fix 源标；非 fix 任务缺省） */
  sourceTask?: TaskRef
}

/** task_records 时间线项（append-only 行应用层形状；verb/from→to/reason/summary/gate/commit/digest） */
export interface TaskRecordEntry {
  verb: TaskRecordVerb
  fromStatus?: TaskStatus
  toStatus?: TaskStatus
  /** transition 与 blocked submit 必带（服务内校验） */
  reason?: string
  /** 执行摘要（keyDecisions 等自由文本） */
  summary?: string
  /** 实际改动文件清单（files_json 解码形；正斜杠路径） */
  files?: string[]
  gate?: TaskGateReport
  commitHash?: string
  /** claim 简报指纹 sha-256 前 12 hex（全文 = dsh 子会话日志，§6-11） */
  digest?: string
  actor: TaskActor
  /** claim = 派发会话 / submit = 执行会话（两形态混存，相异判勿前缀判型——S8） */
  sessionId?: string
  /** ISO-8601 */
  createdAt: string
}

/** 挂接会话卡（sessionLinks：links ∪ records.session_id 双源分型——SC6③ 双源相异断言面） */
export interface SessionTaskLinkCard {
  taskId: string
  slug: string
  localId: string
  title: string
  taskStatus: TaskStatus
  sessionId: string
  /** link = task_session_links（派发会话，claim upsert-ignore 写）/ record = task_records.session_id（执行会话） */
  source: 'link' | 'record'
}

/** 参考文档水化项（vars/taskDesc 声明锚点 → feature_documents ∪ proposals docRel 匹配；命中 = 链接态，未命中 = 置灰） */
export interface TaskDocRef {
  docRel: string
  /** true = 命中在册文档（链接态）；false = 置灰 */
  resolved: boolean
  /** 命中方标题（未命中缺省） */
  title?: string
}

/**
 * 任务容器水化摘要（M3 Interface 1：queryTask/taskDetail 增 container 水化——诊断两路消息
 * 数据源）。phase 仅 feature 容器（proposal 容器无相位域——derive 闭包按 source_kind 过滤）；
 * feature 容器 mode 恒 'expedition'，proposal 容器 = proposals.mode（NULL = 键缺席缺省占位）。
 */
export interface TaskContainerSummary {
  kind: ContainerKind
  slug: string
  title: string
  summary?: string
  mode?: Mode
  /** feature 相位（FeatureStatus 快照；proposal 容器键缺席） */
  phase?: FeatureStatus
}

/** 任务详情（抽屉载体；TaskCard 全量 + 深字段） */
export interface TaskDetail extends TaskCard {
  /** 容器水化（诊断消息数据源——Interface 1 taskDetail 增量） */
  container: TaskContainerSummary
  taskDesc?: string
  vars?: Record<string, string>
  /** 验收与覆盖率负载（覆盖率进度条；NULL = 全局默认） */
  coverage?: number
  complexity: TaskComplexity
  surfaceKey?: string
  surfaceType?: string
  blockedReason?: string
  breaking: boolean
  /** ISO-8601 */
  createdAt: string
  /** ISO-8601 */
  updatedAt: string
  /** 执行时间线（按 record 自增序） */
  records: TaskRecordEntry[]
  /** 等我的人（后继摘要——恢复钩子反查面的读侧呈现） */
  waitingOnMe: TaskPrerequisiteSummary[]
  /** 挂接会话双源分型 */
  sessions: SessionTaskLinkCard[]
  /** 实际改动范围（files_json → commit 只读 git 查找回填；git 缺席/失败回退记录语——core 填） */
  actualFiles: string[]
  /** 人类面允许目标态（transitionTargets(current,'human') 同源纯函数——所见即所得零漂移） */
  allowedTransitions: TaskStatus[]
  /** 参考文档水化 */
  refs: TaskDocRef[]
}

/** validateFeatureTasks 违规类别（C8 五类检查——单 feature 子图口径） */
export type ViolationKind =
  | 'phase-invariant' // ① 派生不变量（feature_status ≡ derive(feature_documents, tasks)）
  | 'cycle' // ② 边集无环复核（写时增量校验的批量对照）
  | 'liveness' // ③ liveness 诊断（§6-8）
  | 'record-chain' // ④ 记录链完整性（in_progress 必有 claim / completed 必有 submit record）
  | 'topology' // ⑤ 拓扑可分层性（phase order 新形态）

/** 违规项 */
export interface Violation {
  kind: ViolationKind
  /** 人类可读描述（可断言可渲染） */
  message: string
  /** 涉事任务自然键（feature 级违规——如相位不变量——缺省） */
  taskRef?: TaskRef
}

/** validateFeatureTasks 返回体（一次只校验一个 feature 的任务子图——2026-10-06 用户裁决） */
export interface ValidateReport {
  violations: Violation[]
  checked: { featureSlug: string; tasks: number }
}

/** addTask 入参（fix 链走 sourceTask + blockSource：单事务同置源 blocked + auto-block 行 + 链深 ≤ 6 + 增量环校验）。
 *  M3 容器化（Interface 1）：featureSlug → source: ContainerRef——容器必须在场（服务不变量·
 *  多态引用无 DB FK，写入校验 source_id 必命中 kind 对应表）；tasks.mode = 容器 mode 创建时
 *  快照（feature 容器恒 'expedition'；proposal 容器取 proposals.mode·可 NULL——键缺席）。
 *  main_session 砍除（M3 裁决⑦：老 forge 形态约束残留·新形态零消费者）。 */
export interface AddTaskInput {
  projectId: string
  /** 任务容器（feature = 远征链分解 / proposal = 突击直挂） */
  source: ContainerRef
  title: string
  type: TaskType
  taskDesc?: string
  /** 验收清单（→ ac_json；submitTask AC 证据门判据——gate.test !== true 拒 ERR_TEST_EVIDENCE_REQUIRED） */
  acceptanceCriteria?: string[]
  priority?: TaskPriority
  estimatedTime?: string
  vars?: Record<string, string>
  /** 依赖的自然键 localId 清单（同容器前置声明——同容器边约束：task_edges 两端 source_id 相等） */
  dependsOn?: string[]
  /** fix 链源（--block-source 隐含谱系） */
  sourceTask?: TaskRef
  /** true = 源任务同事务置 blocked + 边（fix-N 分配） */
  blockSource?: boolean
  breaking?: boolean
  coverage?: number
  complexity?: TaskComplexity
  surfaceKey?: string
  surfaceType?: string
}

/** addTask 返回体 */
export interface AddTaskResult {
  taskId: string
  slug: string
  localId: string
  /** 两级去重命中 = 任务级 fix 复用（既有行复用，零新建） */
  reused: boolean
}

/** claimTask 入参（M3 容器化：featureSlug? → source?: ContainerRef——容器限定盲选，缺省 = 全库） */
export interface ClaimTaskInput {
  projectId: string
  /** 显式重入（in_progress 幂等重入 = reclaimed；无 taskRef 盲选不领 in_progress——双 dispatcher 不双派发） */
  taskRef?: TaskRef
  /** 就绪选择限定容器（缺省 = 全库；dispatchPrompt 增容器语境行 SOURCE: feature|proposal slug） */
  source?: ContainerRef
  /** 派发会话（S8：exec.agent.session.id 可得；links upsert-ignore） */
  sessionId: string
}

/** claimTask 返回体 */
export interface ClaimTaskResult {
  /** 无就绪任务 = null（Z1 出口信号——run-tasks 循环等待/收工判据；此时 dispatchPrompt='' digest=''） */
  task: TaskSnapshot | null
  /** 派发简报全文（人格段 + 三标签块；不入库——record 存 digest） */
  dispatchPrompt: string
  /** sha-256(dispatchPrompt) 前 12 hex */
  digest: string
  /** in_progress 幂等重入 = true（简报重合成，digest 新值） */
  reclaimed: boolean
}

/** submitTask 入参 */
export interface SubmitTaskInput {
  projectId: string
  taskRef: TaskRef
  result: 'success' | 'blocked'
  /** blocked 必带（ERR_REASON_REQUIRED） */
  reason?: string
  /** success 必带（ERR_SUMMARY_REQUIRED） */
  summary?: string
  /** 实际改动文件清单（正斜杠路径；缺省由 commit 只读查找回填） */
  files?: string[]
  gate?: TaskGateReport
  commitHash?: string
  /** 执行会话（子会话——与 claim 的派发会话相异可判，SC6③） */
  sessionId: string
}

/** submitTask 返回体 */
export interface SubmitTaskResult {
  taskId: string
  status: TaskStatus
  /** 恢复钩子反查自动恢复的前置（前置全满足才 auto-restore；边不删） */
  restored: TaskRef[]
}

/** transitionTask 入参（人类通道——UI/RPC 恒 taskId；提前校验 toStatus ∈ transitionTargets(current,'human')） */
export interface TransitionTaskInput {
  projectId: string
  taskId: string
  toStatus: TaskStatus
  /** 必带（→completed/skipped 同挂恢复钩子——与 submitTask 钩子同族，C3） */
  reason: string
}

/** queryTask 入参（agent 面——TaskRef 两显式参） */
export interface QueryTaskInput {
  projectId: string
  taskRef: TaskRef
  include?: {
    prerequisites?: boolean
    waitingOnMe?: boolean
    records?: boolean
    sessions?: boolean
  }
}

/** queryTask 返回体（未命中 → ERR_TASK_NOT_FOUND；四节按 include 门控；container 恒水化） */
export interface QueryTaskResult {
  task: TaskSnapshot
  /** 容器水化（诊断消息数据源——Interface 1 M3 增量） */
  container: TaskContainerSummary
  prerequisites?: TaskPrerequisiteSummary[]
  waitingOnMe?: TaskPrerequisiteSummary[]
  records?: TaskRecordEntry[]
  sessions?: SessionTaskLinkCard[]
}

/** validateFeatureTasks 入参（恒单 feature——批量语义归流程层） */
export interface ValidateFeatureTasksInput {
  projectId: string
  featureSlug: string
}

/** listTasks 查询（search = 服务端 core 过滤——中英双语标签常量匹配；IME 安全 = 前端仅更新内容区；
 *  M3 容器化：featureSlug? → source?: ContainerRef） */
export interface ListTasksQuery {
  projectId: string
  source?: ContainerRef
  /** 七态过滤 chips（空/缺省 = 全部） */
  statusFilter?: TaskStatus[]
  search?: string
  /** active = 活跃优先 / created = 最新创建 */
  sort?: 'active' | 'created'
}

/** taskStats 查询（M3 容器化） */
export interface TaskStatsQuery {
  projectId: string
  source?: ContainerRef
}

/** taskStats 返回体（七态 chips 计数单源；0 计数禁用+淡化）。
 *  M3 增 unmetPending（pending ∧ 前置未全满足计数——单查询派生；dispatchTask 池快照数据源）。 */
export interface TaskStats {
  total: number
  byStatus: Record<TaskStatus, number>
  /** pending 且前置未全 ∈ {completed, skipped} 的任务数（池快照「等待」判据成分） */
  unmetPending: number
}

/** taskGraph 查询（M3 容器化：容器子图） */
export interface TaskGraphQuery {
  projectId: string
  source: ContainerRef
}

/** taskGraph 边（等待方 → 前置方；边持久不删——满足 = 读时派生） */
export interface TaskGraphEdge {
  taskId: string
  prerequisiteId: string
  origin: TaskEdgeOrigin
}

/** taskGraph 返回体（DAG/泳道渲染源） */
export interface TaskGraph {
  tasks: TaskCard[]
  edges: TaskGraphEdge[]
}

/** taskDetail 查询（UI/RPC 面恒 taskId） */
export interface TaskDetailQuery {
  projectId: string
  taskId: string
}

/** sessionLinks 查询（挂接 pill——sessionId → 单库解析：sessions → workspaces → path） */
export interface SessionLinksQuery {
  projectId: string
  sessionId: string
}

/** Interface 1：core · forge 任务域服务面（ctx.forgeTasks） */
export interface ForgeTasksService {
  /** tasks 行 + edges 行 + records 行单事务全成全败（增量环校验 + 两级去重 + 相位重算） */
  addTask(input: AddTaskInput): Promise<AddTaskResult>
  /** 守卫（依赖全 ∈ {completed, skipped}）+ 就绪选择（分支延续优先 → priority → 创建序）+ links + dispatchPrompt 合成 */
  claimTask(input: ClaimTaskInput): Promise<ClaimTaskResult>
  /** 转移 + record(files/gate/commit) + 恢复钩子反查 + 相位重算 */
  submitTask(input: SubmitTaskInput): Promise<SubmitTaskResult>
  /** 人类纠偏面（提前校验 + 与 submitTask 同族恢复钩子） */
  transitionTask(input: TransitionTaskInput): Promise<TaskSnapshot>
  /** agent 查询面（四节按 include 门控） */
  queryTask(input: QueryTaskInput): Promise<QueryTaskResult>
  /** 只读校验：单 feature 子图五类检查（发现面吸收对新入库 feature 逐个送校） */
  validateFeatureTasks(input: ValidateFeatureTasksInput): Promise<ValidateReport>
  /** 列表（search 中英双语标签匹配；副行承重字段水化） */
  listTasks(q: ListTasksQuery): Promise<TaskCard[]>
  /** 七态计数 */
  taskStats(q: TaskStatsQuery): Promise<TaskStats>
  /** feature 任务图（DAG/泳道） */
  taskGraph(q: TaskGraphQuery): Promise<TaskGraph>
  /** 任务详情（allowedTransitions/actualFiles/refs 水化） */
  taskDetail(q: TaskDetailQuery): Promise<TaskDetail>
  /** 挂接双源分型卡（links ∪ records.session_id） */
  sessionLinks(q: SessionLinksQuery): Promise<SessionTaskLinkCard[]>
}

// ─────────────────────────── Interface 2：feature 域（ctx.forgeFeatures） ───────────────────────────

/** registerFeature 入参 */
export interface RegisterFeatureInput {
  projectId: string
  /** 目录名自然键（UNIQUE；实践不可变） */
  slug: string
  title: string
  summary?: string
  /** 来源谱系（发现面扫描按 slug 回填；缺省 = 无提案来源） */
  proposalId?: string
}

/** transitionFeature 入参（人类纠偏面；reason 必带；非终态 → archived 放开——弃案与完成案同可收纳） */
export interface TransitionFeatureInput {
  projectId: string
  featureId: string
  toStatus: FeatureStatus
  reason: string
}

/** upsertFeatureDoc 入参（单事务内聚相位推进——登记即推进 §6-28：单调只进，技能无显式推相位面） */
export interface UpsertFeatureDocInput {
  projectId: string
  featureSlug: string
  docKind: DocKind
  /** 相对 forge_dir，正斜杠；可悬空（SC-branch 容错） */
  relPath: string
  summary?: string
}

/** listFeatures 查询 */
export interface ListFeaturesQuery {
  projectId: string
  search?: string
  sort?: 'active' | 'created'
}

/** listFeatureDocs 查询（fix-2：feature_documents 列举读面——概览 feature 子 tab 文档行数据源；
 *  行归属过滤归 UI（featureId 分组呈现），无 search 面） */
export interface ListFeatureDocsQuery {
  projectId: string
}

/** features 行应用层形状 */
export interface FeatureRow {
  featureId: string
  slug: string
  title: string
  featureStatus: FeatureStatus
  /** 一句话摘要（未来注入 agent 上下文） */
  summary?: string
  /** 来源谱系身份 FK（uuid） */
  proposalId?: string
  /** ISO-8601 */
  createdAt: string
  /** ISO-8601 */
  updatedAt: string
}

/** feature_documents 行应用层形状 */
export interface FeatureDocumentRow {
  featureId: string
  docKind: DocKind
  /** 相对 forge_dir，正斜杠；悬空容忍 */
  relPath: string
  summary?: string
  /** ISO-8601 */
  createdAt: string
  /** ISO-8601 */
  updatedAt: string
}

/** feature 列表卡（feature 子 tab 父行：任务七态分布 + 文档统计 + 谱系） */
export interface FeatureCard extends FeatureRow {
  /** 任务七态分布（概览 chips 与任务子 tab 同源口径） */
  byStatus: Record<TaskStatus, number>
  /** 文档统计（feature_documents 行数） */
  docCount: number
  /** 谱系水化（来源提案 slug；无提案来源缺省） */
  proposalSlug?: string
}

/** Interface 2：core · forge feature 域服务面（ctx.forgeFeatures） */
export interface ForgeFeaturesService {
  /** slug UNIQUE 冲突 → ERR_FEATURE_EXISTS */
  registerFeature(input: RegisterFeatureInput): Promise<FeatureRow>
  /** from≠to 校验同源（复用 ERR_INVALID_TRANSITION） */
  transitionFeature(input: TransitionFeatureInput): Promise<FeatureRow>
  /** 登记即推进（slug→id 服务内解析；doc_kind→phase 映射单调只进） */
  upsertFeatureDoc(input: UpsertFeatureDocInput): Promise<FeatureDocumentRow>
  /** 含七态分布/文档统计/谱系 */
  listFeatures(q: ListFeaturesQuery): Promise<FeatureCard[]>
  /** feature_documents 列举读面（fix-2：文档行浏览源；纯读零事件） */
  listFeatureDocs(q: ListFeatureDocsQuery): Promise<FeatureDocumentRow[]>
}

// ─────────────────────────── Interface 3：提案域（ctx.forgeProposals） ───────────────────────────

/** createProposal 入参（tool 专属——写动词不上 RPC；M3 增 mode 由创建技能透传溯源） */
export interface CreateProposalInput {
  projectId: string
  slug: string
  title: string
  /** proposal.md 相对 forge_dir（SC4 浏览锚点）；缺省 = 未挂文档 */
  relPath?: string
  status?: ProposalStatus
  /** 模式溯源（远征/突击；缺省 = NULL 占位——成链门按 NULL 边界处理） */
  mode?: Mode
}

/** transitionProposal 入参（M3 双面：tool + RPC（UF-1 人工裁决）——M2「tool 专属」纪律 drift 修订；
 *  裁决写 decided_at；toStatus='superseded' 必带 supersededBy） */
export interface TransitionProposalInput {
  projectId: string
  proposalId: string
  toStatus: ProposalStatus
  /** superseded 必带（目标提案 id 在场校验 → 写 proposals.superseded_by——UF-1 取代链数据面） */
  supersededBy?: string
}

/** transitionProposal 返回体（行 + 成链水化——toStatus=accepted ∧ mode='expedition' ∧ 无同链
 *  feature 时单事务内聚 registerFeature，返回 chained；mode='blitz'|NULL 不成链） */
export type TransitionProposalResult = ProposalRow & { chained?: FeatureRow }

/** setProposalMode 入参（M3 新·律三唯一正门·UI 专属 RPC——agent tool 面无模式改写动词（SC6 契约断言）） */
export interface SetProposalModeInput {
  projectId: string
  proposalId: string
  mode: Mode
  /** 说明必填（人工变更溯源——快照不回溯明示的审计面） */
  reason: string
}

/** listProposalDocs 查询（UF-1 提案文档区读——目录扫描·零状态零写径，文件系统为事实源） */
export interface ListProposalDocsQuery {
  projectId: string
  slug: string
}

/** 提案文档行（只读扫描 docs/proposals/<slug>/ 全部 .md——发现面同族；
 *  frontmatter 可选初值，fileName/relPath 恒有） */
export interface ProposalDocRow {
  fileName: string
  /** 相对 forge_dir，正斜杠 */
  relPath: string
  /** frontmatter 可选初值（缺席 = 键缺省） */
  title?: string
  status?: string
}

/** listProposals 查询 */
export interface ListProposalsQuery {
  projectId: string
  search?: string
  sort?: 'active' | 'created'
}

/** proposals 行应用层形状（身份与名称分离——slug 可改名，关联走 id）。
 *  M3 增 mode（CHECK expedition|blitz|NULL——扫描吸收旧行 = NULL 缺省占位）与
 *  supersededBy（自引用 FK——取代链谱系）。 */
export interface ProposalRow {
  proposalId: string
  slug: string
  title: string
  proposalStatus: ProposalStatus
  /** 相对 forge_dir，正斜杠；悬空容忍 */
  relPath?: string
  author?: string
  /** 裁决时刻（→ accepted/rejected 写；打回/superseded 不改写） */
  decidedAt?: string
  /** 模式溯源（NULL = 键缺席缺省占位；人工变更走 setProposalMode 唯一正门） */
  mode?: Mode
  /** 取代链目标提案 id（superseded 转移写入；UF-1 谱系右列数据面） */
  supersededBy?: string
  /** ISO-8601 */
  createdAt: string
  /** ISO-8601 */
  updatedAt: string
}

/** 提案列表卡（提案子 tab 父行 = 行全量 + M3 taskCount（JOIN tasks 按 source_id 分组——
 *  容器 pill「有任务的提案」判据 + 提案谱系联读）；展开元数据由行字段+文档读承载） */
export type ProposalCard = ProposalRow & {
  /** 容器下任务数（成链 feature 同 slug 任务并入同计——容器维度口径） */
  taskCount: number
}

/** Interface 3：core · forge 提案域服务面（ctx.forgeProposals——M3 五法） */
export interface ForgeProposalsService {
  /** tool 写动词（M3 起不上 RPC 的仍仅 createProposal/addTask/submitTask 族） */
  createProposal(input: CreateProposalInput): Promise<ProposalRow>
  /**
   * 裁决转移（→ accepted/rejected 写 decided_at；M3 双面：tool + RPC）。
   * 成链分叉内聚（单事务）：accepted ∧ mode='expedition' ∧ 无同链 feature →
   * registerFeature（同名 slug/title/summary 继承/proposalId）+ feature_records(register)
   * → 返回 chained；mode='blitz'|NULL → 不成链（NULL 边界：先 setProposalMode）。
   */
  transitionProposal(input: TransitionProposalInput): Promise<TransitionProposalResult>
  /** 模式改写唯一正门（单事务只写 proposals.mode——tasks.mode 快照永不触碰；UI 专属） */
  setProposalMode(input: SetProposalModeInput): Promise<ProposalRow>
  listProposals(q: ListProposalsQuery): Promise<ProposalCard[]>
  /** 提案文档区只读扫描（评审缺口#1 处置——零状态零写径） */
  listProposalDocs(q: ListProposalDocsQuery): Promise<ProposalDocRow[]>
}

// ─────────────────────────── Interface 4：工作区文档读域（ctx.forgeDocs） ───────────────────────────

/** read 入参 */
export interface ReadDocRequest {
  projectId: string
  /** 文档相对键（feature_documents ∪ proposals 的 rel_path；路径守卫：resolve 后必须 startsWith(canonical(forge_dir))——越界 ERR_DOC_PATH_INVALID） */
  docRel: string
}

/** read 返回体（悬空容忍：rel_path 可悬空——dangling 态只读缺省渲染） */
export interface DocContent {
  title?: string
  summary?: string
  /** markdown 全文（mermaid 段经文档 tab 分段渲染——md 段 MarkdownDoc / mermaid 段懒加载） */
  content: string
  /** resolve 后规范绝对路径（守卫通过者；悬空 = 库内 rel_path 原值） */
  canonicalPath: string
  /** true = 文件不在场（SC-branch：占位面，非错误） */
  dangling: boolean
}

/** Interface 4：core · forge 文档读域服务面（ctx.forgeDocs——纯读） */
export interface ForgeDocsService {
  read(q: ReadDocRequest): Promise<DocContent>
}

// ─────────────────────────── Interface 1（M3）：设置域（ctx.forgeSettings，provide ×1） ───────────────────────────

/** worker 推理档位三值（reasoning → agentOptions.effort 直映射——设置三段与上游请求字段一对一） */
export const REASONING_LEVELS = ['low', 'medium', 'high'] as const

export type ReasoningLevel = (typeof REASONING_LEVELS)[number]

/** worker 默认 LLM 三项（dispatchTask 组装 agentOptions 的唯一配置源） */
export interface WorkerSettings {
  provider: string
  model: string
  reasoning: ReasoningLevel
}

/** forgeSettings.get 返回体（worker 未配置 = 键缺席——dispatchTask 不携带 agentOptions，
 *  回退父会话继承；存储 = {userData}/forge-settings.json，路径经 boot overlay 注 core 行 config） */
export interface ForgeSettings {
  worker?: WorkerSettings
}

/** forgeSettings.set 入参（整体覆写 worker 段——UI 设置分区保存脏态） */
export interface SetForgeSettingsInput {
  worker: WorkerSettings
}

/** Interface 1（M3）：core · forge 设置域服务面（ctx.forgeSettings——单写者 = core，
 *  UI 设置分区（RPC）与 dispatchTask（服务注入）同门消费；改完即生效无重启） */
export interface ForgeSettingsService {
  get(): Promise<ForgeSettings>
  set(input: SetForgeSettingsInput): Promise<void>
}

// ─────────────────────────── Interface 5：项目域扩展（ctx.forgeProjects，P1 五法不动） ───────────────────────────

/** deriveTaskStoreDir 入参（注册表单预检位——纯读；workspaceDir 为 canonical 化后路径） */
export interface DeriveTaskStoreDirRequest {
  workspaceDir: string
}

/** deriveTaskStoreDir 返回体（{tasksHome}/{flatten}@{hash8} 单源——SC2 位置单源） */
export interface DeriveTaskStoreDirResult {
  dir: string
}

/** Interface 5：ctx.forgeProjects M2 形状（P1 五法不动 + 派生行第六法；
 *  碰撞三态 = 本动词表单预检位 + 注册闭包复检，ERR_SUSPECTED_MOVE 在中央行落库之前抛出——零副作用） */
export interface ProjectServiceM2 extends ProjectService {
  deriveTaskStoreDir(q: DeriveTaskStoreDirRequest): Promise<DeriveTaskStoreDirResult>
}

// ─────────────────────────── Interface 6：桥事件信封（产品自有协议，零上游改动） ───────────────────────────

/** forge:events/tasks-changed 载荷（四域一切写动词闭包尾部 emitTasksChanged——同通道同载荷） */
export interface TasksChangedEvent {
  readonly projectId: string
}

/**
 * 桥事件信封（子 → 主单向推送：core 写动词闭包尾部 process.send 防护发送——direct 形态
 * IPC 缺席静默降级；run.ts child.on('message') event 分支 → DshHostHandle.onEvent →
 * main webContents.send → renderer 订阅重取，延迟上限 500ms）。
 * channel/payload 只读——扩消息变体 = 契约面变更。
 */
export interface BridgeEventMessage {
  readonly type: 'event'
  readonly channel: ForgeEventChannel
  readonly payload: TasksChangedEvent
}

// ─────────────────────────── Interface 3（M3）：事件两层抽象 + 业务日志（产品自建总线） ───────────────────────────

/** task-claimed 载荷（claim 落定；dispatchDigest = task_records.claim 行双记指纹） */
export interface TaskClaimedPayload {
  /** 'slug/localId' 复合自然键（与 task_records 追溯键同口径） */
  taskKey: string
  taskType: TaskType
  /** 容器模式快照（NULL = 键缺席） */
  mode?: Mode
  /** sha-256(dispatchPrompt) 前 12 hex（三层存放之指纹层） */
  dispatchDigest: string
}

/** task-spawned 载荷（driver spawn 落定——workerSessionId = 对账锚） */
export interface TaskSpawnedPayload {
  taskKey: string
  /** worker 子会话 id（追溯三键闭环：taskKey → digest → workerSessionId → 会话日志全文） */
  workerSessionId: string
  /** 收窄后的工具面（矩阵 × taskType + 全局拒绝集派生） */
  toolFilter: readonly string[]
  model: string
}

/** task-submitted 载荷（worker 结算——AC gate 后） */
export interface TaskSubmittedPayload {
  taskKey: string
  outcome: 'success' | 'blocked'
  /** blocked 必带 */
  reason?: string
  commitHash?: string
}

/** task-worker-done 载荷（dispatcher 视角收工） */
export interface TaskWorkerDonePayload {
  taskKey: string
  workerSessionId: string
  outcome: 'success' | 'blocked'
  /** 执行时长毫秒 */
  durationMs: number
}

/** no-ready-task 载荷（Z1 收工信号——无任务字段，只记会话与语境） */
export interface NoReadyTaskPayload {
  /** 无任务事件归属语境（= 容器限定认领的 source_slug——context_slug 入参已退役；归属判定：事件带任务 → 任务容器 slug；无任务 → contextSlug） */
  contextSlug?: string
}

/** tool-error 载荷（forge tool 面 typed error） */
export interface ToolErrorPayload {
  verb: string
  code: ErrorCode
  message: string
}

/** proposal-created 载荷（…verb 级按需扩——初集七事件之一） */
export interface ProposalCreatedPayload {
  proposalId: string
  /** 创建时模式溯源（缺省 = 键缺席占位） */
  mode?: Mode
}

/**
 * 事件信封（一切事件共有——两层抽象的外层）：事件必从某会话发出，信封恒有 sessionId；
 * slug = 归属容器 slug（任务容器 / contextSlug / '_pool' 兜底——监听器归属判定的单源）。
 */
export interface ForgePluginEventEnvelope {
  /** epoch 毫秒 */
  ts: number
  sessionId: string
  slug: string
}

/** 七事件判别联合内型（type 判别 + 载荷——exhaustive；verb 级按需扩零迁移） */
export type ForgePluginEventVariant =
  | { type: 'task-claimed'; payload: TaskClaimedPayload }
  | { type: 'task-spawned'; payload: TaskSpawnedPayload }
  | { type: 'task-submitted'; payload: TaskSubmittedPayload }
  | { type: 'task-worker-done'; payload: TaskWorkerDonePayload }
  | { type: 'no-ready-task'; payload: NoReadyTaskPayload }
  | { type: 'tool-error'; payload: ToolErrorPayload }
  | { type: 'proposal-created'; payload: ProposalCreatedPayload }

/** ForgePluginEvent = 信封 × 事件内型（两层抽象；判别字段 = type——exhaustive switch 锚） */
export type ForgePluginEvent = ForgePluginEventEnvelope & ForgePluginEventVariant

/** 事件类型全集（七事件初集——监听器落盘 logs/{slug}.jsonl 的行 type 值域） */
export const FORGE_PLUGIN_EVENT_TYPES = [
  'task-claimed',
  'task-spawned',
  'task-submitted',
  'task-worker-done',
  'no-ready-task',
  'tool-error',
  'proposal-created',
] as const

export type ForgePluginEventType = (typeof FORGE_PLUGIN_EVENT_TYPES)[number]

// ─────────────────────────── RPC 负载映射（键 = channels.ts 族常量键） ───────────────────────────

/** forge:tasks/* 请求负载（键 = TASKS_CHANNELS 键；写动词 add/claim/submit 不在此面——tool 专属） */
export interface TasksChannelRequests {
  transition: TransitionTaskInput
  query: QueryTaskInput
  validateFeatureTasks: ValidateFeatureTasksInput
  list: ListTasksQuery
  stats: TaskStatsQuery
  graph: TaskGraphQuery
  detail: TaskDetailQuery
  sessionLinks: SessionLinksQuery
}

/** forge:tasks/* 响应负载（键 = TASKS_CHANNELS 键） */
export interface TasksChannelResponses {
  transition: TaskSnapshot
  query: QueryTaskResult
  validateFeatureTasks: ValidateReport
  list: TaskCard[]
  stats: TaskStats
  graph: TaskGraph
  detail: TaskDetail
  sessionLinks: SessionTaskLinkCard[]
}

/** forge:features/* 请求负载（键 = FEATURES_CHANNELS 键） */
export interface FeaturesChannelRequests {
  register: RegisterFeatureInput
  transition: TransitionFeatureInput
  upsertDoc: UpsertFeatureDocInput
  list: ListFeaturesQuery
  listDocs: ListFeatureDocsQuery
}

/** forge:features/* 响应负载（键 = FEATURES_CHANNELS 键） */
export interface FeaturesChannelResponses {
  register: FeatureRow
  transition: FeatureRow
  upsertDoc: FeatureDocumentRow
  list: FeatureCard[]
  listDocs: FeatureDocumentRow[]
}

/** forge:proposals/* 请求负载（键 = PROPOSALS_CHANNELS 键；M3：transition 双面上 RPC（drift 修订）+
 *  setMode（UI 专属正门）+ listDocs（文档区读）；createProposal 恒 tool 专属不上 RPC） */
export interface ProposalsChannelRequests {
  list: ListProposalsQuery
  transition: TransitionProposalInput
  setMode: SetProposalModeInput
  listDocs: ListProposalDocsQuery
}

/** forge:proposals/* 响应负载（键 = PROPOSALS_CHANNELS 键） */
export interface ProposalsChannelResponses {
  list: ProposalCard[]
  transition: TransitionProposalResult
  setMode: ProposalRow
  listDocs: ProposalDocRow[]
}

/** forge:settings/* 请求负载（键 = SETTINGS_CHANNELS 键——get 无参） */
export interface SettingsChannelRequests {
  get: void
  set: SetForgeSettingsInput
}

/** forge:settings/* 响应负载（键 = SETTINGS_CHANNELS 键——set 触发即忘，失败经 RpcErr 信封） */
export interface SettingsChannelResponses {
  get: ForgeSettings
  set: void
}

/** forge:docs/* 请求负载（键 = DOCS_CHANNELS 键；openExternal 主侧执行——先经桥校验路径在册） */
export interface DocsChannelRequests {
  read: ReadDocRequest
  openExternal: ReadDocRequest
}

/** forge:docs/* 响应负载（键 = DOCS_CHANNELS 键；openExternal = 触发即忘——失败经 RpcErr 信封） */
export interface DocsChannelResponses {
  read: DocContent
  openExternal: void
}

/** forge:projects/deriveTaskStoreDir 负载映射（P1 五法负载映射在 dto/rpc.ts；M2 扩族键单列——键 = PROJECTS_M2_CHANNELS 键） */
export interface ProjectsM2ChannelRequests {
  deriveTaskStoreDir: DeriveTaskStoreDirRequest
}

/** forge:projects/deriveTaskStoreDir 响应负载 */
export interface ProjectsM2ChannelResponses {
  deriveTaskStoreDir: DeriveTaskStoreDirResult
}
