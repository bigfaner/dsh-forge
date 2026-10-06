// 相位推导机——feature 相位快照单源纯函数（任务 2.1；db-schema §6-28「登记即推进」+
// §6-29「task-driven 补全：统一相位推导机」+ tech-design §Interface 1「相位重算」/
// §Interface 2「单调只进」/ 三层校验职责「写事务内增量断言」）。
//
// 统一推导规则：status = archived（人类收纳，唯一不可推导态——推导机不覆盖）∨
// combine(docPhaseMax, taskDerived)——有任务时 taskDerived 覆盖（无视 docPhase，回退边
// 合法：completed feature 追加任务 → tasks，快照诚实）；无任务时 max(线性序当前,
// docPhaseMax)（§6-28 max 单调式仅适用无任务分支——后补低阶段文档不回退）。
// 消费侧（addTask/claimTask/submitTask/transitionTask/upsertFeatureDoc 写动词事务内重算 +
// 增量断言）由 2.3/2.4/2.5/2.7 接线；validateFeatureTasks 的 'phase-invariant' 批量对照面（2.5）
// 亦经本单源。定位铁律：纯函数禁 IO（输入 = 调用方在事务内读出的行集快照）。
import type { DocKind, FeatureStatus, TaskStatus } from '@dsh-forge/contracts'

/** doc_kind → phase 映射（§6-28 单源：{prd-spec, user-stories, ui-functions}→prd；{tech-design,
 *  er-diagram, sql-schema, page-map}→design）。Record<DocKind, …> = 编译期穷尽——加 kind 即
 *  编译红，逼映射裁决（AC5）。 */
export type DocPhase = 'prd' | 'design'

export const DOC_KIND_PHASE: Readonly<Record<DocKind, DocPhase>> = {
  'prd-spec': 'prd',
  'user-stories': 'prd',
  'ui-functions': 'prd',
  'tech-design': 'design',
  'er-diagram': 'design',
  'sql-schema': 'design',
  'page-map': 'design',
}

/** feature 六态线性序（§6-22：prd → design → tasks → in-progress → completed → archived）。
 *  Record<FeatureStatus, …> = 编译期穷尽（AC5）；测试锚定 order[FEATURE_STATUSES[i]] === i
 *  （线性序与词汇行序同源）。 */
export const FEATURE_STATUS_ORDER: Readonly<Record<FeatureStatus, number>> = {
  prd: 0,
  design: 1,
  tasks: 2,
  'in-progress': 3,
  completed: 4,
  archived: 5,
}

/** 任务终态集（§6-29：全部 ∈ 终态 → completed；rejected 不满足前置但计入相位终态——§3.2） */
export const TERMINAL_TASK_STATUSES = ['completed', 'skipped', 'rejected'] as const satisfies readonly TaskStatus[]

/** 活跃判定集（§6-29 两段式第一段：存在其一 → in-progress——执行中/受阻/挂起均为活跃相位） */
export const ACTIVE_TASK_STATUSES = ['in_progress', 'blocked', 'suspended'] as const satisfies readonly TaskStatus[]

/** 推导机输入（调用方写事务内读出的行集快照——本模块零 IO） */
export interface PhaseDeriverInput {
  /** features.feature_status 当前存储快照（无任务分支单调式的「线性序当前」项） */
  current: FeatureStatus
  /** 该 feature 全部 feature_documents 行 doc_kind 集（行只增——登记即推进的文档面） */
  docKinds: readonly DocKind[]
  /** 该 feature 全部 tasks 行 task_status */
  taskStatuses: readonly TaskStatus[]
}

/** taskDerived 相位（§6-29 两段式的三值；'tasks' 亦涵盖 quick-tasks 式无文档任务流的天然落位） */
export type TaskDerivedPhase = 'tasks' | 'in-progress' | 'completed'

/** docPhaseMax（§6-28）：已登记文档映射 phase 的线性序最大值；无已登记文档 → null（不触发推进） */
export function docPhaseMax(docKinds: readonly DocKind[]): DocPhase | null {
  let max: DocPhase | null = null
  for (const kind of docKinds) {
    const phase = DOC_KIND_PHASE[kind]
    if (max === null || FEATURE_STATUS_ORDER[phase] > FEATURE_STATUS_ORDER[max]) max = phase
  }
  return max
}

/** taskDerived 两段式（§6-29）：无任务 → null（combine 交还 docPhaseMax 分支）。
 *  第一段：存在 in_progress/blocked/suspended → in-progress；第二段：否则存在非终态
 *  （即 pending）→ tasks（终态+pending 混合）；全终态 → completed。 */
export function deriveTaskPhase(taskStatuses: readonly TaskStatus[]): TaskDerivedPhase | null {
  if (taskStatuses.length === 0) return null
  if (taskStatuses.some((s) => (ACTIVE_TASK_STATUSES as readonly TaskStatus[]).includes(s))) return 'in-progress'
  if (taskStatuses.some((s) => !(TERMINAL_TASK_STATUSES as readonly TaskStatus[]).includes(s))) return 'tasks'
  return 'completed'
}

/**
 * 相位推导机主体（写动词事务内重算的单源入口）：
 * 1. archived → 原样（人类收纳决策，唯一不可推导态——推导机永不覆盖）；
 * 2. 有任务 → taskDerived（覆盖 docPhase——回退边合法，快照诚实）；
 * 3. 无任务 → max(current, docPhaseMax)（单调只进——后补低阶段文档不回退；human 前推保持）。
 */
export function deriveFeaturePhase(input: PhaseDeriverInput): FeatureStatus {
  if (input.current === 'archived') return 'archived'
  const taskPhase = deriveTaskPhase(input.taskStatuses)
  if (taskPhase !== null) return taskPhase
  const doc = docPhaseMax(input.docKinds)
  if (doc === null) return input.current
  return FEATURE_STATUS_ORDER[doc] > FEATURE_STATUS_ORDER[input.current] ? doc : input.current
}

/** 相位不变量断言输入（存储快照 + 行集 + 定位——current 语义由 featureStatus 承载） */
export interface PhaseInvariantInput extends Omit<PhaseDeriverInput, 'current'> {
  /** 存储快照（features.feature_status——断言对象） */
  featureStatus: FeatureStatus
  /** 涉事 feature 定位（写动词事务内已知——诊断信息用；缺省 = 校验器盲调） */
  featureSlug?: string
}

/** 相位不变量断言失败（内部漂移防护——非 RPC 域错误码面；写事务内抛出即整体回滚，
 *  validateFeatureTasks 批量面以 Violation(kind='phase-invariant') 呈现同源结论） */
export class PhaseInvariantViolationError extends Error {
  readonly expected: FeatureStatus
  readonly actual: FeatureStatus

  constructor(input: PhaseInvariantInput, expected: FeatureStatus) {
    const where = input.featureSlug === undefined ? '' : `（feature ${input.featureSlug}）`
    super(
      `相位派生不变量断言失败${where}：存储 ${input.featureStatus} ≢ 推导 ${expected}` +
        `（docKinds [${input.docKinds.join(', ')}]，taskStatuses [${input.taskStatuses.join(', ')}]）`,
    )
    this.name = 'PhaseInvariantViolationError'
    this.expected = expected
    this.actual = input.featureStatus
  }
}

/**
 * 相位派生不变量断言（§5-9/§6-29——写事务内增量：受影响 feature 漂移防护）。
 * 判据 = 存储快照为推导机不动点：stored ≡ derive(current=stored, docs, tasks)。
 * - 有任务：stored 必须 ≡ taskDerived（漂移即红）；
 * - 无任务：stored ≥ docPhaseMax 且单调保持（human 前推/max 保持均为不动点——回退/落后即红）；
 * - archived：唯一不可推导态，恒豁免（永不红）。
 */
export function assertPhaseInvariant(input: PhaseInvariantInput): void {
  const expected = deriveFeaturePhase({
    current: input.featureStatus,
    docKinds: input.docKinds,
    taskStatuses: input.taskStatuses,
  })
  if (expected !== input.featureStatus) throw new PhaseInvariantViolationError(input, expected)
}

/** 运行期判别（测试与消费侧诊断面）。 */
export function isPhaseInvariantViolationError(e: unknown): e is PhaseInvariantViolationError {
  return e instanceof PhaseInvariantViolationError
}
