// dispatch-core · T3 同缝拦截守卫（loop-recurrence-hardening 提案 §2.2 T3 + §2.3）：
// 「待建模」软拒绝 = 派发前置条件非任务本体状态——零持久标记零清理，标记载体 = 派生态
// （claim 时点现算：同缝计数 ≥ 阈值 ∧ 卷宗建模报告不在场 → 拒绝盲试 fix 派发并提示升级）。
//
// 同缝判据 = 台账 recurrence_of 链计数（结构化主判据，经只读 face 跨容器查询——跨容器库域
// 口径归域层，插件层不直连库文件）；scope 文件/服务缝重叠仅为提示性信号，不计入拦截判定。
// 阈值语义沿台账既有约定（get-bug 链区「recurrence count = chain length - 1」）：链上
// recurrence_of 边数 ≥ 2 = 已反复盲修仍复发，拒绝继续盲试。
//
// 与 ERR_BLOCK_SOURCE_REQUIRED（core add.ts 建链守卫，0a25720c）语义对偶：新问题径建 fix
// 链须 block_source=true；同族复发径盲试 fix 派发被本守卫软拒绝转升级——两错误码指引文案
// 互相指路（本面 violations 指向前者，core errors.ts BlockSourceRequiredError 消息指向本码）。
import type { BugRecurrenceCandidate, TaskSnapshot } from '@dsh-forge/contracts'
import { emitForgeDiag } from '../faces.js'
import type { ForgeDiagEmitFace } from '../faces.js'
import type { DispatchCoreFailure } from './result.js'

/** 同缝拦截阈值（提案 T3：同缝 ≥ 2 → 拒绝盲试 fix 派发，提示先升级排查） */
export const RECURRENCE_ESCALATION_THRESHOLD = 2

/** T3 软拒绝错误码（与 ERR_BLOCK_SOURCE_REQUIRED 文案互指——对偶守卫族） */
export const ERR_RECURRENCE_ESCALATION_REQUIRED = 'ERR_RECURRENCE_ESCALATION_REQUIRED' as const

/** 台账 recurrence 候选只读检索面（结构兼容 core add.ts T2 注入形——跨容器口径归域层） */
export type SameSeamRecurrenceFace = (
  projectId: string,
  scope: { readonly slug: string; readonly localId: string; readonly files: readonly string[] },
) => Promise<readonly BugRecurrenceCandidate[]> | readonly BugRecurrenceCandidate[]

/** 卷宗建模报告在场探测面（T4 旁挂回收的守卫侧消费缝——注入可替换；缺席 = 报告不在场） */
export type ModelingReportPresentFace = (input: {
  readonly projectId: string
  readonly slug: string
  readonly localId: string
}) => boolean

/**
 * 盲试 fix 派发判别（拦截对象 = blocked 源派生的 fix 链任务——非 fix 任务零拦截，行为零变化）：
 * taskType = coding-fix ∧ sourceTaskId 在场（fix 链派生）。
 */
export function isBlindFixDispatch(task: TaskSnapshot): boolean {
  return task.taskType === 'coding-fix' && task.sourceTaskId !== undefined
}

/** 链同缝计数（台账约定：recurrence count = chain length - 1——链根不计复发） */
export function recurrenceCountOf(chain: readonly string[]): number {
  return Math.max(0, chain.length - 1)
}

/** 候选集同缝计数（取候选链最大值——同任务 scope 命中多条候选时按最重家族判） */
export function sameSeamCountOf(candidates: readonly BugRecurrenceCandidate[]): number {
  return candidates.reduce((max, c) => Math.max(max, recurrenceCountOf(c.chain)), 0)
}

/** 「待建模」判定（纯函数——派生态现算的机械核）：count ≥ 阈值 ∧ 报告不在场 */
export function isModelingPending(count: number, reportPresent: boolean): boolean {
  return count >= RECURRENCE_ESCALATION_THRESHOLD && !reportPresent
}

/** 软拒绝裁决（guard 消费返回形——undefined = 放行） */
export interface RecurrenceEscalationRejection {
  readonly failure: DispatchCoreFailure
  /** 命中家族链（bug_id 时间序，链根在前——escalation 载荷/叙述证据指针） */
  readonly chain: readonly string[]
  readonly count: number
}

/**
 * T3 同缝拦截守卫（claim 面消费——claimTask 成功后、spawn 前的派发前置软拒绝）：
 * 非 fix 派生任务 / face 缺席 / 零候选 / face 异常 → 放行（fail-soft 降级跳过，
 * 先例 stampEvidenceValidity——数据源不洁不阻断）。拒绝时任务已领置 in_progress：
 * 消费方（循环驱动器 → 转 escalation 挂起；工具壳 → 幂等重入指引）负责不产生孤儿。
 */
export async function recurrenceEscalationGuard(input: {
  readonly projectId: string
  readonly task: TaskSnapshot
  readonly findRecurrenceCandidates?: SameSeamRecurrenceFace
  readonly modelingReportPresent?: ModelingReportPresentFace
  /** 诊断发射缝（AGENTS §7——降级径留痕：face 缺席 info / 台账读故障 warn；缺席 = console 兜底） */
  readonly diag?: ForgeDiagEmitFace
}): Promise<RecurrenceEscalationRejection | undefined> {
  const { projectId, task, findRecurrenceCandidates, modelingReportPresent, diag } = input
  if (!isBlindFixDispatch(task)) return undefined
  if (findRecurrenceCandidates === undefined) {
    // AGENTS §7 降级留痕：face 缺席 = 同缝拦截机制生产静默关停（bug 0db72bcb 教训——降级
    // 必须可观测），info 级 emit（仅盲试 fix 派发径——非 fix 任务零拦截零噪声）。
    emitForgeDiag(diag, {
      level: 'info',
      event: 'recurrence-face-absent',
      message: `dispatch-core T3 同缝拦截降级：findRecurrenceCandidates face 缺席（${task.slug}/${task.localId}）——盲试 fix 守卫惰性放行（核销装配面接线）`,
      projectId,
    })
    return undefined
  }
  let candidates: readonly BugRecurrenceCandidate[]
  try {
    candidates = await findRecurrenceCandidates(projectId, { slug: task.slug, localId: task.localId, files: [] })
  } catch (cause) {
    emitForgeDiag(diag, {
      level: 'warn',
      event: 'recurrence-face-error',
      message: `dispatch-core T3 同缝拦截降级：台账候选检索故障（${task.slug}/${task.localId}）——${cause instanceof Error ? cause.message : String(cause)}`,
      projectId,
    })
    return undefined // fail-soft：台账读故障降级放行——机制惰性不阻派发主链
  }
  if (candidates.length === 0) return undefined
  const count = sameSeamCountOf(candidates)
  const chain = candidates.reduce((a, b) => (recurrenceCountOf(b.chain) > recurrenceCountOf(a.chain) ? b : a)).chain
  if (modelingReportPresent === undefined) {
    // AGENTS §7 降级留痕：报告探测 face 缺席 = 「报告落卷即放行」解除判据恒不可满足
    // （bug 0db72bcb 断链面）——降级为报告恒不在场（拦截保守成立）+ info 留痕。
    emitForgeDiag(diag, {
      level: 'info',
      event: 'modeling-report-face-absent',
      message: `dispatch-core T3 解除判据降级：modelingReportPresent face 缺席（${task.slug}/${task.localId}）——报告视为不在场，拦截保守成立（核销装配面接线）`,
      projectId,
    })
  }
  const reportPresent = modelingReportPresent?.({ projectId, slug: task.slug, localId: task.localId }) === true
  if (!isModelingPending(count, reportPresent)) return undefined
  return {
    chain,
    count,
    failure: rejectionFailureOf(`${task.slug}/${task.localId}`, chain, count),
  }
}

/** 软拒绝 DTO（code + 升级提示 + 对偶守卫互指 + 解除指引——Hard Rule：文案带指引不裸码） */
export function rejectionFailureOf(taskKey: string, chain: readonly string[], count: number): DispatchCoreFailure {
  return {
    ok: false,
    code: ERR_RECURRENCE_ESCALATION_REQUIRED,
    message:
      `同缝拦截：任务 ${taskKey} 的 recurrence 链计数 ${count} ≥ ${RECURRENCE_ESCALATION_THRESHOLD}` +
      `（链：${chain.join(' → ')}）——盲试 fix 派发被软拒绝，请先升级排查建模再派发` +
      `（「待建模」派生态现算，零持久标记）`,
    violations: [
      'escalate: 同缝 ≥2 建议先升级排查建模（判别实验清单逐条排除后再开修；委派目标由主会话自行决定，本提示零专家键）',
      'related: 新问题径建 fix 链的对偶守卫为 ERR_BLOCK_SOURCE_REQUIRED（补 block_source=true）——两码指引文案互相指路',
      `release: 建模报告落卷后（卷宗报告在场）重新派发本任务——守卫派生态现算即放行`,
    ],
  }
}
