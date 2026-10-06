// 错误码 typed 定义（P1 六码 tech-design §Error Handling「Error Types & Codes」表逐行对照；
// M2 扩池 15 新码——1.1，行序 = M2 表行序）。能力面/服务层抛 typed error（code 字面量锚定
// 本 ERROR_CODES；类名/name 由 core 双域 errors.ts 手写字面量——本文件不持运行期名映射，
// fix-34 删死常量 ERROR_NAMES 后注释如实），RPC 边界序列化为 RpcErrorPayload，UI 按 code
// 映射状态（空态/错误条/横幅；未映射码 → 通用错误条兜底——永无裸 code 泄漏）。
// 定位铁律：纯常量与类型，零逻辑零依赖。
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
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** RPC 边界错误序列化形状（Propagation Strategy：`{ code, message, data }`）。
 *  data = 结构化附载（workspaceId / projectId / 失败原因 / 处置结果等）；UI 按 code 映射状态。
 *  M2 三码持结构化 data 载荷（下方接口）；其余码 data 缺省或自由附载。 */
export interface RpcErrorPayload {
  code: ErrorCode
  message: string
  data?: unknown
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
