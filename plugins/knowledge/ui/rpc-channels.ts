// 1.42 随 knowledge 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// knowledge 域 RPC channels face（结构同型镜像——自 apps/web/src/rpc 抽出被用面）：
// plugins/project/ui/rpc.ts 已有 Typert 六族面但无 knowledge 命名空间，且 knowledge 域
// 数据通道保持 channels face 原样（范围外另案——提案明示，不做 Typert 改接），故本件
// 镜像 channels 传输形态（transport 注入 + RpcResult 信封拆装 + typed error）。
// 镜像面 = errors.ts（RpcClientError）+ ui-state.ts（rpcUiState 全码表）+ transport.ts
// （preloadTransport）+ client.ts 的 knowledge/projects 消费切片（get/list——知识族
// 装载链唯一消费的 projects 两法）。
import {
  KNOWLEDGE_CHANNELS,
  PROJECTS_CHANNELS,
  type DomainNode,
  type EntryActionReceipt,
  type EntryActionRequest,
  type EntryDetail,
  type EntryDetailQuery,
  type ErrorCode,
  type GetProjectRequest,
  type KnowledgeCard,
  type ListEntriesQuery,
  type Project,
  type ProjectSummary,
  type RecallFeedbackOutcome,
  type RecallFeedbackRequest,
  type RecallGroup,
  type RpcErrorPayload,
  type RpcResult,
  type SessionRecallQuery,
  WORKTREE_CHANNELS,
  type WorktreeResolveRequest,
  type WorktreeResolveResult,
} from '@dsh-forge/contracts'

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

// ───────────────── client.ts 镜像（knowledge + projects 消费切片） ─────────────────

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

/** forge:projects/* 面方法集（knowledge 族消费切片：get 项目元数据 / list 项目台账） */
export interface ForgeProjectsRpc {
  list(): Promise<ProjectSummary[]>
  get(id: string): Promise<Project | null>
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
 * forge:worktree/resolve 消费切片（锚定链——useWorkspaceProjectMap 归属归并唯一消费法；
 * dock-tabs/rpc-channels ForgeWorktreeRpc 十法全量的切片镜像，通道常量同源 contracts）。
 */
export interface ForgeWorktreeRpc {
  resolve(q: WorktreeResolveRequest): Promise<WorktreeResolveResult>
}

/** forge RPC client（transport 注入：preloadTransport() 真身 / 测试替身） */
export interface ForgeRpcClient {
  readonly projects: ForgeProjectsRpc
  readonly knowledge: ForgeKnowledgeRpc
  readonly worktree: ForgeWorktreeRpc
}

export function createForgeRpcClient(transport: ForgeTransport): ForgeRpcClient {
  return {
    projects: {
      list: () => invokeRpc<ProjectSummary[]>(transport, PROJECTS_CHANNELS.list),
      get: (id) =>
        invokeRpc<Project | null>(transport, PROJECTS_CHANNELS.get, { id } satisfies GetProjectRequest),
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
    worktree: {
      resolve: (q) => invokeRpc<WorktreeResolveResult>(transport, WORKTREE_CHANNELS.resolve, q),
    },
  }
}

/** RPC client 构造器（缺省 = preload 真身；注入 = 测试面——各装载 hook 同型口径） */
export type RpcClientFactory = () => ForgeRpcClient

/**
 * 缺省构造：preload 传输真身。缺席（非 Electron 载体/preload 未接）在构造期抛——由各
 * 消费面错误归一收敛为错误相位/错误条，不炸壳（fetchProjectsPhase / mapBrowseError /
 * mapRecallError 同口径）。
 */
export function preloadRpcClientFactory(): ForgeRpcClient {
  return createForgeRpcClient(preloadTransport())
}
