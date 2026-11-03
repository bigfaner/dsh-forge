// dispatch-core · T3 同缝拦截守卫（loop-recurrence-hardening 提案 §2.2 T3 + §2.3 + 
// recurrence-judgment-narrowing 判据收窄适配）：
// 「待建模」软拒绝 = 派发前置条件非任务本体状态——零持久标记零清理，标记载体 = 派生态
// （claim 时点现算：同缝计数 ≥ 阈值 ∧ 卷宗建模报告不在场 → 拒绝盲试 fix 派发并提示升级）。
//
// 同缝判据 = 台账 recurrence 链计数（结构化主判据，经只读 face 跨容器查询——跨容器库域
// 口径归域层，插件层不直连库文件）。归属 scope（recurrence-judgment-narrowing）：face
// scope 携带任务归属标识（sourceTaskId + slug 容器标识）——core bugs 域按「链内任一成员
// source_task_id 落 `t-<slug>-` 容器前缀」过滤，无关提案历史链不进候选集（守卫侧不再传
// files 全库口径，files 收窄口径归结算径）。
// 拦截计数 = 候选 activeCount（core 域产出的活态祖先径边数，终态成员不计）——缺席回退
// chain 呈现链长判读（contracts BugRecurrenceCandidate 既有约定）。
//
// 与 ERR_BLOCK_SOURCE_REQUIRED（core add.ts 建链守卫，0a25720c）语义对偶：新问题径建 fix
// 链须 block_source=true；同族复发径盲试 fix 派发被本守卫软拒绝转升级。
import type { BugRecurrenceCandidate, TaskSnapshot } from '@dsh-forge/contracts'
import { emitForgeDiag } from '../faces.js'
import type { ForgeDiagEmitFace } from '../faces.js'
import type { DispatchCoreFailure } from './result.js'

/** 同缝拦截阈值（提案 T3：同缝 ≥ 2 → 拒绝盲试 fix 派发，提示先升级排查） */
export const RECURRENCE_ESCALATION_THRESHOLD = 2

/** T3 软拒绝错误码（对偶守卫族——core 建链径 block_source 守卫语义对偶） */
export const ERR_RECURRENCE_ESCALATION_REQUIRED = 'ERR_RECURRENCE_ESCALATION_REQUIRED' as const

/**
 * 台账 recurrence 候选检索归属 scope（跨容器库域口径归 core bugs 域定义，插件层只传任务
 * 归属标识）：slug = 归属容器标识（任务 id 形制 `t-<slug>-<localId>`，域层以 `t-<slug>-`
 * 前缀判容器成员）；sourceTaskId = fix 链派生源任务 id（归属取证面，域层过滤键为容器前缀）。
 */
export interface SameSeamRecurrenceScope {
  readonly slug: string
  readonly localId: string
  readonly sourceTaskId: string | undefined
}

/** 台账 recurrence 候选只读检索面（结构兼容 core add.ts T2 注入形——跨容器口径归域层） */
export type SameSeamRecurrenceFace = (
  projectId: string,
  scope: SameSeamRecurrenceScope,
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
 *
 * 已知绕行面（formal-verifier/architect 共识）：本判别以 taskType 锚定——taskType 为任务
 * 创建方自标字段，可被标注规避（coding-feature 命名即绕过），是已知绕行面；本守卫维持
 * 软拒绝不另加反绕行判别面，守卫升级硬闸前须先解耦该锚。
 */
export function isBlindFixDispatch(task: TaskSnapshot): boolean {
  return task.taskType === 'coding-fix' && task.sourceTaskId !== undefined
}

/** 链同缝计数（台账约定：recurrence count = chain length - 1——链根不计复发） */
export function recurrenceCountOf(chain: readonly string[]): number {
  return Math.max(0, chain.length - 1)
}

/**
 * 候选集同缝计数（取候选最大值——同 scope 命中多条候选时按最重家族判）：activeCount
 * （core 域活态祖先径，终态不计）在场优先；缺席 = 旧 face 回退 chain 呈现链长判读。
 */
export function sameSeamCountOf(candidates: readonly BugRecurrenceCandidate[]): number {
  return candidates.reduce((max, c) => Math.max(max, c.activeCount ?? recurrenceCountOf(c.chain)), 0)
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
    // 归属 scope（recurrence-judgment-narrowing）：传任务归属标识——core 域按容器前缀过滤，
    // 无关提案历史链不进候选集；files 收窄口径归结算径，派发径不传 files。
    candidates = await findRecurrenceCandidates(projectId, {
      slug: task.slug,
      localId: task.localId,
      sourceTaskId: task.sourceTaskId,
    })
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

/**
 * 软拒绝 DTO（code + 升级提示 + 解除指引——Hard Rule：文案带指引不裸码）。解除指引
 * 三要件（事故判例 4545fde4 直接对策：unblock/报告落错位/resolveBug 无效处置三连的
 * 根因是指引缺口）：顶层路径模板 + .md 形态 + 报告在场后重新 claim 放行（防 unblock/
 * resolve 死锁重演）。
 */
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
      'release: 在 .forge/docs/proposals/<slug>/issues/<localId>/ 顶层落排查建模报告（.md），报告在场后重新 claim 本任务即放行',
    ],
  }
}
