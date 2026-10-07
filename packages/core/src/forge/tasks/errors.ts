// forge/tasks 域 typed error（任务 2.1 起步：ERR_INVALID_TRANSITION——tech-design §Error Handling
// 409 行三形统一拒绝面：from 不匹配 / 目标 ∉ transitionTargets / agent 面矩阵非法格；
// 2.3 扩池：ERR_TASK_NOT_FOUND / ERR_TASK_EXISTS / ERR_CYCLE_DETECTED /
// ERR_CHAIN_DEPTH_EXCEEDED / ERR_FEATURE_NOT_FOUND——addTask/queryTask 拒绝面）；
// M3 2.4 扩池：ERR_PROPOSAL_NOT_FOUND（TasksProposalNotFoundError——容器双轨 proposal 容器
// 在场校验，与 small-domains 同 code 异类就近落位）；
// 2.5 扩池：ERR_REASON_REQUIRED（transitionTask 空因）+ TaskNotFoundData.taskId 附载
// （UI/RPC 面 id 直查路径）；2.4 扩池：ERR_DEPENDENCIES_UNMET（claim 守卫前置未终态，
// data 带未满足清单）+ ERR_SUMMARY_REQUIRED（success submit 空摘要）+ ReasonRequired
// 扩 verb 'submitTask'（blocked submit 空因——同码同语义跨动词）。
// code 字面量锚定 @dsh-forge/contracts ERROR_CODES，类名/name 手写字面量（contracts 不持
// 运行期名映射——表 Name 列为文档性对照）；RPC 边界（3.1）序列化为 RpcErrorPayload
// { code, message, data }，UI 按 code 映射状态。后续动词动词错误（DEPENDENCIES_* 等）
// 随 2.4–2.5 同文件扩池。与 small-domains/errors.ts 的 FeatureNotFoundError 同 code 异类：
// 四域互禁 import 彼此（Hard Rule），typed 类按域就近落位，跨 IPC 以 code 判别。
import type { DependenciesUnmetData, TaskRef, TaskStatus } from '@dsh-forge/contracts'

/** 校验面（Interface 10）：human = 七态 − 当前态（UI 菜单与服务端同源）；agent = claim/submit 转移矩阵 */
export type TransitionFace = 'human' | 'agent'

/** ERR_INVALID_TRANSITION 附载（RpcErrorPayload.data 形状：校验基准 + 合法目标全集——零漂移证物） */
export interface InvalidTransitionData {
  /** 实际当前态（校验基准 from——from 不匹配即基于此判定） */
  current: TaskStatus
  /** 请求目标态 */
  to: TaskStatus
  /** 校验面 */
  face: TransitionFace
  /** 该 (current, face) 合法目标全集（transitionTargets 单源计算，非二次实现） */
  allowed: readonly TaskStatus[]
}

/** 非法任务转移：to ∉ transitionTargets(current, face)（三形归一——动词层提前校验共用本拒绝面） */
export class InvalidTransitionError extends Error {
  readonly code = 'ERR_INVALID_TRANSITION' as const
  readonly data: InvalidTransitionData

  constructor(data: InvalidTransitionData) {
    super(
      `非法任务转移：${data.current} → ${data.to}（${data.face} 面）——合法目标 [${data.allowed.join(', ')}]`,
    )
    this.name = 'InvalidTransitionError'
    this.data = data
  }
}

/** 运行期判别（跨 IPC / 日志附载后仍可识别）。 */
export function isInvalidTransitionError(e: unknown): e is InvalidTransitionError {
  return e instanceof InvalidTransitionError
}

// ───────────────────────── 2.3 扩池：addTask/queryTask 拒绝面 ─────────────────────────

/** ERR_TASK_NOT_FOUND 附载（TaskRef UNIQUE(slug, local_id) 查捞未命中——身份双轨的 agent 面解析） */
export interface TaskNotFoundData {
  readonly projectId: string
  /** 未命中的自然键（dependsOn 同 feature 解析时 slug = featureSlug；taskId 直查路径缺省） */
  readonly taskRef?: TaskRef
  /** UI/RPC 面 taskId 直查未命中（2.5 transitionTask——身份双轨的 id 侧定位） */
  readonly taskId?: string
  /**
   * 同 feature 前置/谱系解析的作用域（dependsOn localId 与 sourceTask 归属校验）——
   * 命中他 feature 同键任务亦按未命中拒（同 feature 边服务不变量——er-diagram 差异清单 #9）
   */
  readonly featureSlug?: string
}

/** TaskRef(slug/local_id) 未命中（404）：queryTask 定位 / addTask dependsOn·sourceTask 解析；taskId 未命中：transitionTask（2.5） */
export class TaskNotFoundError extends Error {
  readonly code = 'ERR_TASK_NOT_FOUND' as const
  readonly data: TaskNotFoundData

  constructor(data: TaskNotFoundData) {
    const where =
      data.taskRef !== undefined
        ? `${data.taskRef.slug}/${data.taskRef.localId}`
        : `id ${data.taskId ?? '?'}`
    super(
      `任务未命中：${where}（project ${data.projectId}` +
        `${data.featureSlug === undefined ? '' : `，feature ${data.featureSlug} 作用域`}）`,
    )
    this.name = 'TaskNotFoundError'
    this.data = data
  }
}

/** ERR_TASK_EXISTS 附载（定位键随冲突面：任务自然键 / manual 边复合键） */
export interface TaskExistsData {
  readonly projectId: string
  /** UNIQUE(slug, local_id) 冲突面：冲突自然键 */
  readonly slug?: string
  readonly localId?: string
  /** manual 边复合键冲突面（task_edges PK——重复声明） */
  readonly edge?: { readonly taskId: string; readonly prerequisiteId: string }
}

/** UNIQUE(slug, local_id) 冲突 / manual 边重复（409）——两级去重的边级拒绝面（manual 重复报错） */
export class TaskExistsError extends Error {
  readonly code = 'ERR_TASK_EXISTS' as const
  readonly data: TaskExistsData

  constructor(data: TaskExistsData) {
    const where =
      data.edge !== undefined
        ? `边重复（${data.edge.taskId} ← ${data.edge.prerequisiteId}）`
        : `任务已存在：${data.slug ?? '?'}/${data.localId ?? '?'}`
    super(`${where}——UNIQUE 冲突（project ${data.projectId}）`)
    this.name = 'TaskExistsError'
    this.data = data
  }
}

/** ERR_CYCLE_DETECTED 附载（contracts CycleDetectedData 同形：完整环路径——'slug/localId' 复合自然键，首尾相接） */
export interface CycleDetectedPayload {
  readonly cycle: readonly string[]
}

/** addTask 环（409）：dependsOn × block-source 组合——可达性 DFS 回报完整环路径（§6-14/B.5-1） */
export class CycleDetectedError extends Error {
  readonly code = 'ERR_CYCLE_DETECTED' as const
  readonly data: CycleDetectedPayload

  constructor(data: CycleDetectedPayload) {
    super(`检测到依赖环：${data.cycle.join(' → ')}`)
    this.name = 'CycleDetectedError'
    this.data = data
  }
}

/** ERR_CHAIN_DEPTH_EXCEEDED 附载（fix 链深 = source_task_id 边数；新任务 = 源链长 + 1） */
export interface ChainDepthExceededData {
  readonly projectId: string
  readonly featureSlug: string
  /** 源链自然键（根 → … → 源；新任务将超限未建） */
  readonly chain: readonly string[]
  /** 新任务将处的链深 */
  readonly depth: number
  readonly limit: number
}

/** fix 链 > 6（409）：addTask 沿 source_task_id 链计数超限（C6 用户裁决——较老 forge 放宽） */
export class ChainDepthExceededError extends Error {
  readonly code = 'ERR_CHAIN_DEPTH_EXCEEDED' as const
  readonly data: ChainDepthExceededData

  constructor(data: ChainDepthExceededData) {
    super(
      `fix 链深超限：新任务将处第 ${data.depth} 级（上限 ${data.limit}）——` +
        `链 ${data.chain.join(' → ')}，请人工介入（project ${data.projectId}，feature ${data.featureSlug}）`,
    )
    this.name = 'ChainDepthExceededError'
    this.data = data
  }
}

/** ERR_FEATURE_NOT_FOUND 附载（tasks 域就近类——与 small-domains 同 code 异类，四域互禁 import） */
export interface TasksFeatureNotFoundData {
  readonly projectId: string
  readonly featureSlug: string
}

/** featureSlug 解析未命中（404）：addTask 归属校验（featureSlug 必须命中 feature 且 ≡ slug 列） */
export class TasksFeatureNotFoundError extends Error {
  readonly code = 'ERR_FEATURE_NOT_FOUND' as const
  readonly data: TasksFeatureNotFoundData

  constructor(data: TasksFeatureNotFoundData) {
    super(`feature 未命中：${data.featureSlug}（project ${data.projectId}）——addTask 归属校验`)
    this.name = 'TasksFeatureNotFoundError'
    this.data = data
  }
}

/** ERR_PROPOSAL_NOT_FOUND 附载（tasks 域就近类——2.4 容器双轨；与 small-domains 同 code 异类） */
export interface TasksProposalNotFoundData {
  readonly projectId: string
  readonly proposalSlug: string
}

/** proposal 容器解析未命中（404）：addTask 容器在场校验（source_id 必命中 source_kind 对应表——不变量①） */
export class TasksProposalNotFoundError extends Error {
  readonly code = 'ERR_PROPOSAL_NOT_FOUND' as const
  readonly data: TasksProposalNotFoundData

  constructor(data: TasksProposalNotFoundData) {
    super(`proposal 未命中：${data.proposalSlug}（project ${data.projectId}）——addTask 容器在场校验`)
    this.name = 'TasksProposalNotFoundError'
    this.data = data
  }
}

/** 运行期判别（跨 IPC / 日志附载后仍可识别）。 */
export function isTaskNotFoundError(e: unknown): e is TaskNotFoundError {
  return e instanceof TaskNotFoundError
}

// ───────────────────────── 2.5 扩池：transitionTask 拒绝面 ─────────────────────────

/** ERR_REASON_REQUIRED 附载（transitionTask 空因——与 small-domains/transitionFeature 同语义同 code 异类；
 *  2.4 扩 verb 'submitTask'：blocked submit 空因同码拒绝） */
export interface TasksReasonRequiredData {
  readonly verb: 'transitionTask' | 'submitTask'
}

/** 转移动词空因（400）：reason trim 后为空（转移缘由必带——审计行 reason 列的服务内校验面） */
export class ReasonRequiredError extends Error {
  readonly code = 'ERR_REASON_REQUIRED' as const
  readonly data: TasksReasonRequiredData

  constructor(data: TasksReasonRequiredData) {
    super(`${data.verb} 需要 reason（转移缘由必带——空因拒绝）`)
    this.name = 'ReasonRequiredError'
    this.data = data
  }
}

// ───────────────────────── 2.4 扩池：claimTask/submitTask 拒绝面 ─────────────────────────

/**
 * claim 守卫前置未终态（409）：依赖全 ∈ {completed, skipped} 才放行（db-schema §3.2 满足集
 * ——rejected 不满足即依赖路径死锁信号）；data 带未满足清单（自然键 + 当前状态——dispatcher
 * 重规划依据）。TaskPrerequisiteSummary 与 contracts UnmetDependency 同形，直接透传。
 */
export class DependenciesUnmetError extends Error {
  readonly code = 'ERR_DEPENDENCIES_UNMET' as const
  readonly data: DependenciesUnmetData

  constructor(data: DependenciesUnmetData) {
    super(
      `前置依赖未满足：${data.unmet.map((u) => `${u.slug}/${u.localId} ${u.taskStatus}`).join('; ')}` +
        `——满足集 {completed, skipped}`,
    )
    this.name = 'DependenciesUnmetError'
    this.data = data
  }
}

/** 运行期判别（跨 IPC / 日志附载后仍可识别）。 */
export function isDependenciesUnmetError(e: unknown): e is DependenciesUnmetError {
  return e instanceof DependenciesUnmetError
}

/** ERR_SUMMARY_REQUIRED 附载（success submit 空摘要——执行摘要必带，gate 之外的人审负载） */
export interface TasksSummaryRequiredData {
  readonly verb: 'submitTask'
}

/** success submit 空摘要（400）：summary trim 后为空（执行结果审计面——keyDecisions 等自由文本承载） */
export class SummaryRequiredError extends Error {
  readonly code = 'ERR_SUMMARY_REQUIRED' as const
  readonly data: TasksSummaryRequiredData

  constructor(data: TasksSummaryRequiredData) {
    super(`${data.verb} result=success 需要 summary（执行摘要必带——空摘要拒绝）`)
    this.name = 'SummaryRequiredError'
    this.data = data
  }
}
