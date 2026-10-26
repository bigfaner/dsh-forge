// 错误码 typed 定义（P1 六码 tech-design §Error Handling「Error Types & Codes」表逐行对照；
// M2 扩池 15 新码——1.1，行序 = M2 表行序；M3 扩池 3 新码——Interface 6）。能力面/服务层抛
// typed error（code 字面量锚定
// 本 ERROR_CODES；类名/name 由 core 双域 errors.ts 手写字面量——本文件不持运行期名映射，
// fix-34 删死常量 ERROR_NAMES 后注释如实），RPC 边界序列化为 RpcErrorPayload，UI 按 code
// 映射状态（空态/错误条/横幅；未映射码 → 通用错误条兜底——永无裸 code 泄漏）。
// 定位铁律：纯常量与类型，零逻辑零依赖。
import type { TaskRef } from './dto/forge.js'
import type { TaskStatus } from './labels.js'

/** 错误码全集（1–6 行 = P1 面；7–21 行 = M2 面；行序 = Error Handling 表行序；
 *  行尾 → 类名 = 表 Name 列的文档性映射，core 双域 errors.ts 手写字面量，不消费本注释——
 *  fix-34 删死常量后承诺如实） */
export const ERROR_CODES = [
  // ── P1（中央库双域） ──
  'ERR_WORKSPACE_CREATE', // → WorkspaceCreateError：dsh create 失败（注册中止，无补偿需要）
  'ERR_PROJECT_WRITE', // → ProjectWriteError：③ 应用库写入失败（触发 ④ 补偿）
  'ERR_COMPENSATION', // → CompensationError：补偿调用失败——app_key_logs 记账 + 启动对账提示（不自动删）
  'ERR_ENTRY_NOT_FOUND', // → EntryNotFoundError：entryId 未命中（索引重建后 ID 漂移）
  'ERR_INDEX_STALE', // → IndexStaleError：索引缺失/过期提示（触发静默重建）
  'ERR_INVALID_KNOWLEDGE_DIR', // → InvalidKnowledgeDirError：知识目录不可达/非法
  // ── M2（forge 任务管线四域 + 工作区库） ──
  'ERR_TASK_NOT_FOUND', // → TaskNotFoundError：TaskRef(slug/local_id) 未命中（404）
  'ERR_INVALID_TRANSITION', // → InvalidTransitionError：from 不匹配 / 目标 ∉ transitionTargets / agent 面矩阵非法格（409）
  'ERR_DEPENDENCIES_UNMET', // → DependenciesUnmetError：claim 守卫前置未终态（409；data 带未满足清单）
  'ERR_CYCLE_DETECTED', // → CycleDetectedError：addTask 环（409；data 带完整环路径）
  'ERR_CHAIN_DEPTH_EXCEEDED', // → ChainDepthExceededError：fix 链 > 6（409）
  'ERR_REASON_REQUIRED', // → ReasonRequiredError：transition / blocked submit 空因（400）
  'ERR_SUMMARY_REQUIRED', // → SummaryRequiredError：success submit 空摘要（400）
  'ERR_TASK_EXISTS', // → TaskExistsError：UNIQUE(slug, local_id) 冲突（manual 边重复）（409）
  'ERR_FEATURE_NOT_FOUND', // → FeatureNotFoundError：featureSlug 解析未命中（404）
  'ERR_FEATURE_EXISTS', // → FeatureExistsError：registerFeature slug UNIQUE 冲突（409）
  'ERR_PROPOSAL_NOT_FOUND', // → ProposalNotFoundError：proposalId 未命中（404）
  'ERR_WORKSPACE_NOT_REGISTERED', // → WorkspaceNotRegisteredError：tool 面 cwd 无匹配项目（400）
  'ERR_WORKSPACE_DB_UNAVAILABLE', // → WorkspaceDbUnavailableError：惰性开库/迁移失败——工作区隔离态（503）
  'ERR_SUSPECTED_MOVE', // → SuspectedMoveError：注册碰撞同主体异 hash8（409；data 带手工指引）
  'ERR_DOC_PATH_INVALID', // → DocPathInvalidError：readDoc 路径越界（400）
  // ── M3（Interface 6：自举·模式预设） ──
  'ERR_TEST_EVIDENCE_REQUIRED', // → TestEvidenceRequiredError：submitTask AC 证据缺席·gate.test !== true（400；data 带 AC 清单）
  'ERR_GATE_SUMMARY_REQUIRED', // → GateSummaryRequiredError：type='gate' 任务缺数字摘要（400）
  'ERR_SPAWN_FAILED', // → SpawnFailedError：driver spawn 异常——任务留 in_progress 幂等重入径（500）
  // ── worker-lean-execution S3（结构化提交机械门） ──
  'ERR_AC_NOT_MET', // → AcNotMetError：success ∧ acceptanceCriteria 任一 met=false（400；data 带未达清单）
  'ERR_AC_CRITERIA_MISMATCH', // → AcCriteriaMismatchError：AC 交叉校验——提交面 criterion 与 tasks.ac_json 定义侧条数/顺序/原文不符（400）
  'ERR_FILES_UNION_MISMATCH', // → FilesUnionMismatchError：files 与 {created, modified} 并存且 files ≠ created ∪ modified（400）
  // ── main-agent-task-tools（updateTask 锁定面） ──
  'ERR_TASK_LOCKED', // → TaskLockedError：六锁定态任务改写被拒（in_progress/interrupted/completed/skipped/rejected——409）
  'ERR_TASK_EDGE_ORIGIN_LOCKED', // → EdgeOriginLockedError：fix-chain/autoconfig 派生边结构性不可改（409；仅 manual 边可改写）
  // ── fix-bug（bug 域两写径——core small-domains/bugs.ts 字面锚定的 contracts 对账扩池） ──
  'ERR_BUG_NOT_FOUND', // → BugNotFoundError：bugId 未命中（404）
  'ERR_BUG_SUMMARY_TOO_LONG', // → BugSummaryTooLongError：registerBug summary 超 50 字拒写（400）
  'ERR_BUG_ALREADY_RESOLVED', // → BugAlreadyResolvedError：终态再迁移拒绝（open→fixed｜unresolved 单向——409）
  'ERR_COMMIT_HASH_REQUIRED', // → CommitHashRequiredError：resolveBug(fixed) 缺 agent 捕获的 commit_hash（400）
  // ── bug-recurrence-chain（复发链挂链写径） ──
  'ERR_BUG_RECURRENCE_DANGLING', // → BugRecurrenceDanglingError：recordBug recurrenceOf 指向不存在的 bug_id 拒写（404；data 带 dangling bug_id）
  // ── dispatch-loop-hardening 改进 5（调度权收敛——addTask caller 身份分流） ──
  'ERR_WORKER_ADDTASK_DENIED', // → WorkerAddTaskDeniedError：loopSourced spawn 的 worker 会话调 addTask 拒收（403；任务派生权限归主会话/循环处置层——正确动作 = submitTask result=blocked 如实结算）
  // ── session-binding-guarantee W2（host 能力缺席显式拒绝——fail-closed 收口） ──
  'ERR_WORKTREE_CAPABILITY_ABSENT', // → WorktreeCapabilityAbsentError：gitWorktree 能力缺席（60s 放弃）+ git 探针有锚——sessionCreate 入口显式拒绝（prompt 入口同因走 SessionSealedError 先例稳定 name 面）
  // ── bug 4a30b193（必绑重路由目标树活性守护——陈旧选中树/cwd 已删显式拒绝） ──
  'ERR_WORKTREE_TARGET_ABSENT', // → WorktreeTargetAbsentError：重路由目标树目录不在场（已被外部强制删除）——prompt 径显式拒绝不静默编排（data 带目标路径）
  // ── forge-verification-hardening 机械⑤（submitTask 强制域取证声明校验兜底） ──
  'ERR_RUNTIME_EVIDENCE_REQUIRED', // → RuntimeEvidenceRequiredError：强制域任务（声明运行期装配面）success 结算无真机取证证据亦无债务声明（400；data 带装配面清单）
  'ERR_RUNTIME_EVIDENCE_CONFLICT', // → RuntimeEvidenceConflictError：runtimeEvidence 与 evidenceDebt 并存——取证声明二选一口径歧义（400）
  // ── task-pause-primitive §2.1（addTask before 后继状态守卫） ──
  'ERR_BEFORE_SUCCESSOR_INVALID', // → BeforeSuccessorInvalidError：before 后继处不可挂边状态（409；in_progress 指路 pauseTask / interrupted 指 human 通道 / 终态指改选）
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** RPC 边界错误序列化形状（Propagation Strategy：`{ code, message, data }`）。
 *  data = 结构化附载（workspaceId / projectId / 失败原因 / 处置结果等）；UI 按 code 映射状态。
 *  M2 三码持结构化 data 载荷（下方接口）；其余码 data 缺省或自由附载。
 *  causeStack = dev 生境（DSH_FORGE_DEV_PROFILE）专用：错误回包附原始栈（DevTools Network
 *  面板点开即得；app-observability 方案 6）——生产生境恒缺席（零税）。 */
export interface RpcErrorPayload {
  code: ErrorCode
  message: string
  data?: unknown
  causeStack?: string
}

/** ERR_DEPENDENCIES_UNMET data 载荷：claim 守卫前置未满足清单（自然键 + 当前状态） */
export interface UnmetDependency {
  slug: string
  localId: string
  taskStatus: TaskStatus
}

export interface DependenciesUnmetData {
  /** 未达终态 {completed, skipped} 的前置清单 */
  unmet: readonly UnmetDependency[]
}

/** ERR_CYCLE_DETECTED data 载荷：完整环路径（可达性 DFS 回报；db-schema B.5 形制
 *  「2.2 → T → 2.4 → 2.2」——有序节点列，首尾相接，节点 = 'slug/localId' 自然键复合呈现） */
export interface CycleDetectedData {
  cycle: readonly string[]
}

/** ERR_SUSPECTED_MOVE data 载荷：注册碰撞手工指引（删孤儿目录或改回原名；UI 错误条 + 指引留场） */
export interface SuspectedMoveData {
  /** 同 flatten 主体·异 hash8 的既有（孤儿）目录 */
  existingDir: string
  /** 本次推导目录（拒绝发生在中央行落库之前——零副作用，未创建） */
  derivedDir: string
  /** 手工处置指引文案（认领对话框 = M3） */
  guidance: string
}

/** ERR_TEST_EVIDENCE_REQUIRED data 载荷：AC 证据缺席的验收清单（M3 Interface 6——
 *  submitTask gate.test !== true 时逐行带回，错误信息含 AC 清单） */
export interface TestEvidenceRequiredData {
  /** 判据 AC 清单（tasks.ac_json 解码形原样带回） */
  acceptanceCriteria: readonly string[]
}

// ── worker-lean-execution S3：结构化提交机械门 data 载荷 ──

/** ERR_AC_NOT_MET data 载荷：逐项未达清单（criterion + evidence 原样带回） */
export interface AcNotMetData {
  /** met=false 的核验项（同序投影） */
  unmet: readonly { criterion: string; evidence?: string }[]
}

/** ERR_AC_CRITERIA_MISMATCH data 载荷：定义侧 vs 提交侧 criterion 镜像失配 */
export interface AcCriteriaMismatchData {
  /** tasks.ac_json 定义侧清单（同序） */
  expected: readonly string[]
  /** 提交面 acceptanceCriteria[].criterion 清单（同序） */
  actual: readonly string[]
}

/** ERR_FILES_UNION_MISMATCH data 载荷：files ≠ created ∪ modified 失配三方原样带回 */
export interface FilesUnionMismatchData {
  files: readonly string[]
  created: readonly string[]
  modified: readonly string[]
}

/** ERR_BUG_RECURRENCE_DANGLING data 载荷：悬空前驱引用（挂链拒写零副作用） */
export interface BugRecurrenceDanglingData {
  /** 指向不存在 bug 的 recurrenceOf 值 */
  recurrenceOf: string
}

// ── forge-verification-hardening 机械⑤：submitTask 强制域取证声明校验兜底 data 载荷 ──

/** ERR_BEFORE_SUCCESSOR_INVALID data 载荷：before 后继不可挂边（task-pause-primitive §2.1——
 *  哪个后继什么态 + 结构化下一步处置：in_progress → pauseTask 先暂停；interrupted → human
 *  通道；completed/skipped/rejected → terminal 改选未终态后继） */
export interface BeforeSuccessorInvalidData {
  readonly projectId: string
  readonly taskRef: TaskRef
  readonly taskStatus: TaskStatus
  readonly action: 'pauseTask' | 'human' | 'terminal'
}

/** ERR_RUNTIME_EVIDENCE_REQUIRED data 载荷：强制域判定的运行期装配面声明清单（原样带回） */
export interface RuntimeEvidenceRequiredData {
  /** 提交面 runtimeSurface 声明（强制域判据输入——就高不就低判定后的面清单） */
  faces: readonly string[]
}
