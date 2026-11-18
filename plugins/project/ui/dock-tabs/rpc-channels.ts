// 1.45 随 dock tab 族注册面自 apps/web/src/rpc 平移镜像（装配缝归插件域，AGENTS §1.3）。
// dock tab 族 RPC channels face 镜像：镜像面 = client.ts 全命名空间 + errors.ts + events.ts
// + transport + ui-state。
// knowledge-plugin-migration 1.4 传输单源归位（typert-strict-migration 前置修同口径）：
// 原「ui-state 复用 knowledge 镜像单源」的包内源依赖（../knowledge/rpc-channels.js re-export）
// 剥离——knowledge 28 件已 git mv 迁 @dsh-forge/knowledge（跨 bundle 不可 import），transport
// + ui-state 面（preloadTransport / ForgeTransport / rpcUiState / RpcUiStateKind）落本文件
// 自含镜像（镜像同步 pin = dock-tabs/rpc-channels-mirror-pin.test.ts）；下游约 30 消费面
// 零触碰（同名导出面零漂移）。本包从此零跨插件 import。
// ───────────────── transport.ts 镜像（自 knowledge rpc-channels 逐字） ─────────────────

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

// ───────────────── errors.ts 镜像 ─────────────────
// RPC 客户端错误（信封 RpcErr 的反序列化面，AC2 边界保真的 renderer 侧半边）：
// main 侧 serializeRpcError 序列化 { code, message, data } → 本类还原为可捕获 typed error：
// UI 消费约定 = catch RpcClientError → rpcUiState(code) 选状态组件（见 ui-state 与 README）。
import type { ErrorCode, RpcErrorPayload, TasksChangedEvent } from '@dsh-forge/contracts'

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

// ───────────────── ui-state.ts 镜像（自 knowledge rpc-channels 逐字） ─────────────────

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
  // ── plugin-spec-roadmaps 1.5–1.8（goal 终审/复核 + 生命周期 + roadmap/milestone 服务域）──
  ERR_SPEC_GOAL_ILLEGAL_TRANSITION: 'error-bar',
  ERR_SPEC_GOAL_REJECT_NOTE_REQUIRED: 'error-bar',
  ERR_SPEC_GOAL_NOT_FOUND: 'empty-state',
  ERR_SPEC_REVIEW_GAP_NOTE_REQUIRED: 'error-bar',
  ERR_SPEC_REVIEW_GOAL_NOT_REVIEWING: 'error-bar',
  ERR_SPEC_REVIEW_KIND_INVALID: 'error-bar',
  ERR_SPEC_ROADMAP_UNKNOWN: 'empty-state',
  ERR_SPEC_ROADMAP_TERMINAL: 'error-bar',
  ERR_SPEC_MILESTONE_UNKNOWN: 'empty-state',
  ERR_SPEC_MILESTONE_PROJECT_MISMATCH: 'error-bar',
  ERR_SPEC_MOVE_ANCHOR_INVALID: 'error-bar',
  ERR_SPEC_AC_INVALID: 'error-bar',
  ERR_SPEC_AC_ADDRESS_UNKNOWN: 'error-bar',
  ERR_SPEC_CONFIRM_NOT_ACHIEVED: 'error-bar',
  ERR_SPEC_INCLUDE_UNKNOWN: 'error-bar',
}

/**
 * UI 消费入口：catch RpcClientError → rpcUiState(error.code) → 选状态组件。
 * 未映射码 → 通用错误条兜底（永无裸 code 泄漏——Record 编译期穷举之外，运行期
 * 版本错配面（主进程新版码 × 旧 renderer 映射表）亦收敛为 error-bar，不 undefined 外溢）。
 */
export function rpcUiState(code: ErrorCode): RpcUiStateKind {
  return RPC_UI_STATE_BY_CODE[code] ?? 'error-bar'
}

// ───────────────── events.ts 镜像 ─────────────────
// 写推送事件订阅层（3.1；交互二事件链 renderer 段——tech-design §交互二「web/rpc
// 共享订阅层 50ms 合并重取」裁决落点）。链路：core 写动词闭包尾部 emitTasksChanged →
// process.send（child 形态）→ main webContents.send('forge:events/tasks-changed') →
// preload onForgeTasksChanged（本模块唯一消费面）→ 共享订阅层 → 各视图重取活跃查询
//（概览/文档 tab/会话头 pill），延迟上限 500ms。
// 合并语义：50ms 窗内多事件合并为一次通知（载荷 latest-wins——重取方只关心「有变化」，
// 单写闭包单事件、多事件 = 多闭包连发，合并后一次重取即见最终值）。
// 形状权威 = apps/host/src/ipc/preload-api.ts 的 window.dshForge.onForgeTasksChanged
//（结构同型镜像，运行期边界禁互引源码）；preload 面缺席（非 Electron 载体）= 静默降级
// no-op 订阅（交互重取兜底——与 core 侧 direct 形态缺席静默同口径）。

/** 事件订阅回调（载荷只读 { projectId }——Hard Rule） */
export type TasksChangedListener = (payload: TasksChangedEvent) => void

/** preload 暴露面的事件切片（window.dshForge.onForgeTasksChanged） */
export type TasksChangedSubscribe = (cb: TasksChangedListener) => () => void

interface DshForgeEventGlobal {
  onForgeTasksChanged?: TasksChangedSubscribe
}

/** 合并窗（ms）——重取合并与表单防抖均归 web/rpc 模块（tech-design §交互二裁决） */
export const TASKS_CHANGED_COALESCE_MS = 50

/** 取 preload 订阅真身；缺席 = undefined（非 Electron 载体 / preload 未接事件面） */
export function preloadTasksChangedSubscribe(): TasksChangedSubscribe | undefined {
  const bridge = (globalThis as { dshForge?: DshForgeEventGlobal }).dshForge
  return typeof bridge?.onForgeTasksChanged === 'function' ? bridge.onForgeTasksChanged : undefined
}

/** 订阅中枢面（subscribe = 入层退订器；flush = 测试面——立即结算合并窗） */
export interface TasksChangedHub {
  subscribe(listener: TasksChangedListener): () => void
  flush(): void
}

/**
 * 建订阅中枢（单底层订阅 + 本地监听扇出 + 50ms 尾沿合并）。首监听挂底层订阅、
 * 末退订拆订阅（无监听零占用）；监听方异常隔离（不阻断其余监听与底层）。
 * @param underlying - preload 订阅真身（或测试替身）
 */
export function createTasksChangedHub(underlying: TasksChangedSubscribe): TasksChangedHub {
  const listeners = new Set<TasksChangedListener>()
  let pending: TasksChangedEvent | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribe: (() => void) | undefined

  const flush = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    if (pending === undefined) return
    const payload = pending
    pending = undefined
    for (const listener of listeners) {
      try {
        listener(payload)
      } catch {
        // 监听方异常隔离——其余监听与底层订阅照常
      }
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      if (unsubscribe === undefined) {
        unsubscribe = underlying((payload) => {
          pending = payload
          if (timer !== undefined) return // 窗内连发——合并不重置计时
          timer = setTimeout(flush, TASKS_CHANGED_COALESCE_MS)
        })
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && unsubscribe !== undefined) {
          unsubscribe()
          unsubscribe = undefined
          if (timer !== undefined) {
            clearTimeout(timer)
            timer = undefined
          }
          pending = undefined // 末监听已退——待发载荷不再结算
        }
      }
    },
    flush, // 测试面：合并窗立即结算（不改语义——与计时到期同径）
  }
}

/** 共享单例（进程内唯一底层订阅——多视图共用） */
let sharedHub: TasksChangedHub | undefined

/**
 * 订阅入口（视图消费面）：概览/文档 tab/会话头 pill 重取活跃查询。
 * preload 面缺席 = 静默降级 no-op 退订器（交互重取兜底）。
 */
export function subscribeTasksChanged(listener: TasksChangedListener): () => void {
  const underlying = preloadTasksChangedSubscribe()
  if (underlying === undefined) return () => {}
  sharedHub ??= createTasksChangedHub(underlying)
  return sharedHub.subscribe(listener)
}

// ───────────────── client.ts 镜像 ─────────────────
// forge RPC client（定位：基础——通道契约消费方，2.4 forge:projects/* 五通道）。
// 通道名仅出自 contracts 常量（禁字面量）；负载形状 = dto/rpc.ts 请求/响应映射；
// 信封拆装：RpcOk → data 原样返回；RpcErr → 抛 RpcClientError（typed error 反序列化）；
// 形状非法 fail-loud（不静默捏造结果）。3.5 增 knowledge 面（forge:knowledge/* 五通道——
// 只增面不改建制；search/readAbstract 不在面，agent 面唯一门 = knowledge 插件 tool，双门分工）。
// 2.8 增 fs 面（forge:fs/listDir——文件浏览器数据源；三处一体：contracts → 本文件 → host ipc）。
// 3.1 增 M2 四族（forge:{tasks,features,docs}/* + projects 派生行扩族——Interface 7；
// 薄 Controller：仅参数映射与路由，禁业务逻辑。
// M3 4.1 扩池（Interface 4 三处一体的 web 侧落点；contracts/host 已先行）：forge:settings/{get,set}
// 新族（Forge设置 读写——forgeSettings 服务单门）；恒不在面的写动词收窄为 addTask/submitTask
// （claimTask 退役并入 dispatchTask——仅存 core 服务 API）。提案域通道族已随 proposal 域
// 整域下线批整体退役（plugin-spec/1.11）。
import {
  BUGS_CHANNELS,
  DOCS_CHANNELS,
  FEATURES_CHANNELS,
  FS_CHANNELS,
  KNOWLEDGE_CHANNELS,
  PROJECTS_CHANNELS,
  SETTINGS_CHANNELS,
  TASKS_CHANNELS,
  WORKTREE_CHANNELS,
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
  type WorktreeListRequest,
  type WorktreeListResult,
  type WorktreeSealRequest,
  type WorktreeSelectRequest,
  type WorktreeSelectResult,
  type WorktreeEnsureWorkspaceRequest,
  type WorktreeEnsureWorkspaceResult,
  type WorktreeResolveRequest,
  type WorktreeResolveResult,
  type WorktreeSealResult,
  type DirListing,
  type DomainNode,
  type EntryDetail,
  type EntryActionReceipt,
  type EntryActionRequest,
  type EntryDetailQuery,
  type BugCard,
  type BugCommitFile,
  type BugCommitFilesQuery,
  type BugFileDiffQuery,
  type FeatureCard,
  type FeatureDocumentRow,
  type FeatureRow,
  type ForgeSettings,
  type GetProjectRequest,
  type KnowledgeCard,
  type ListDirRequest,
  type ListBugsQuery,
  type ListFeatureDocsQuery,
  type ListEntriesQuery,
  type ListFeaturesQuery,
  type ListTasksQuery,
  type Project,
  type ProjectPatch,
  type ProjectSummary,
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
  type RpcResult,
  type SessionLinksQuery,
  type SessionRecallQuery,
  type SessionTaskLinkCard,
  type SetForgeSettingsInput,
  type TaskCard,
  type TaskDetail,
  type TaskDetailQuery,
  type TaskGraph,
  type TaskGraphQuery,
  type TaskSnapshot,
  type TaskStats,
  type TaskStatsQuery,
  type TransitionFeatureInput,
  type TransitionTaskInput,
  type UpdateProjectRequest,
  type UpsertFeatureDocInput,
  type ValidateFeatureTasksInput,
  type ValidateReport,
  type DocContent,
} from '@dsh-forge/contracts'

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
 * forge:worktree/* 面方法集（10 方法；域实现 = packages/plugins/git-worktree，
 * host ipc/worktree-rpc 装配透传。seal = 封存判定快照；select = hero 选中树推送；
 * resolve = 批量归属解析。session-create 通道已退役——bug 82e92933，binding-derivation
 * §2.3：换绑由官方 blank 复用天然生效，选树零 forge 建会话 RPC）。
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
