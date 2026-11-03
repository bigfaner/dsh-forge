// dispatch-core · T3 同缝拦截守卫（loop-recurrence-hardening 提案 §2.2 T3 + §2.3 +
// recurrence-judgment-narrowing 判据收窄适配 + recurrence-signal-tiering 触发公式/载荷改造）：
// 「待建模」软拒绝 = 派发前置条件非任务本体状态——零持久标记零清理，标记载体 = 派生态
// （claim 时点现算 → 拒绝盲试 fix 派发并提示升级）。
//
// 触发公式（recurrence-signal-tiering 验收要点 2）：最长祖先径全边数 fullEdgeCount ≥ 2
// ∧ 链内有 open 成员（hasOpen——终态过滤从 core 管线移除后的消费侧触发分量）∧ 本缝归属
// （scope 归属过滤归 core bugs 域，container_slug 列直接比较）∧ 卷宗建模报告不在场
// （dossier issues 卷 / probes/<bugId>/ 备选双探测）。全 fixed 链对 T3 不拦（无 open 分量）。
//
// 拒绝载荷（渐进式披露）：列表式（八字段/条：bugId/summary/status/errorType/containerSlug/
// suspectedLocation/lastSeenAt/recurrenceOf——甄别判据 = suspected 位置，agent 自行甄别后经
// getBug 深挖）+ top-5 限幅（lastSeenAt 降序，其余按 errorType 计数——控呈现不控召回）+
// escalate 豁免（链串摘要保留在升级指引——上浮主会话要的是因果链证据）。
//
// 与 ERR_BLOCK_SOURCE_REQUIRED（core add.ts 建链守卫，0a25720c）语义对偶：新问题径建 fix
// 链须 block_source=true；同族复发径盲试 fix 派发被本守卫软拒绝转升级。
import type { BugRecurrenceCandidate, TaskSnapshot } from '@dsh-forge/contracts'
import { emitForgeDiag } from '../faces.js'
import type { ForgeDiagEmitFace } from '../faces.js'
import type { DispatchCoreFailure } from './result.js'

/** 同缝拦截阈值（提案 T3：最长祖先径全边 ≥ 2 → 拒绝盲试 fix 派发，提示先升级排查） */
export const RECURRENCE_ESCALATION_THRESHOLD = 2

/** 拒绝载荷列表限幅（recurrence-signal-tiering 渐进式披露：候选 >5 条时 top-5 + 计数） */
export const REJECTION_LIST_LIMIT = 5

/** T3 软拒绝错误码（对偶守卫族——core 建链径 block_source 守卫语义对偶） */
export const ERR_RECURRENCE_ESCALATION_REQUIRED = 'ERR_RECURRENCE_ESCALATION_REQUIRED' as const

/**
 * 台账 recurrence 候选检索归属 scope（跨容器库域口径归 core bugs 域定义，插件层只传任务
 * 归属标识）：sourceTaskId = fix 链派生源任务 id——域层事务级反查 tasks.slug 作容器归属锚
 * （生产 UUID 形制唯一可靠形态；缺席回退 slug），归属比较 = bugs.container_slug 列直接
 * 比较（双向语义）。slug 为调用方容器标识（回退键）。
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

/**
 * 卷宗建模报告在场探测面（T4 旁挂回收的守卫侧消费缝——注入可替换）三态：
 * true = 报告在场（解除判据满足）；false = 真「报告不在场」（双轨目录均可读但无报告 .md，
 * 拦截保守成立）；'error' = 探测 IO 故障（readdirSync 抛错等——机制失能，消费侧放行 + warn 留痕）。
 *
 * bugIds = 命中家族链成员 id（probes/<bugId>/ 备选探测锚——recurrence-signal-tiering 落点
 * 双轨：有关联提案落 dossier issues 卷，无关联落 probes 卷，任一在场即解除）。
 */
export type ModelingReportPresentFace = (input: {
  readonly projectId: string
  readonly slug: string
  readonly localId: string
  readonly bugIds: readonly string[]
}) => boolean | 'error'

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

/** 链呈现计数（台账约定：recurrence count = chain length - 1——链根不计复发；呈现口径，不参与拦截计数） */
export function recurrenceCountOf(chain: readonly string[]): number {
  return Math.max(0, chain.length - 1)
}

/**
 * 候选集同缝计数（取候选最大值——同 scope 命中多条候选时按最重家族判）：fullEdgeCount
 * （core 域最长祖先径全边，fixed 段也计，分叉兄弟不计）。chain 链长回退分支已随
 * activeCount 退役删除（recurrence-signal-tiering：单一计数源，core face 恒产出 fullEdgeCount）。
 */
export function sameSeamCountOf(candidates: readonly BugRecurrenceCandidate[]): number {
  return candidates.reduce((max, c) => Math.max(max, c.fullEdgeCount ?? 0), 0)
}

/** 最重候选（拦截计数与链归属锚——fullEdgeCount 最大者） */
export function heaviestCandidateOf(candidates: readonly BugRecurrenceCandidate[]): BugRecurrenceCandidate {
  return candidates.reduce((a, b) => ((b.fullEdgeCount ?? 0) > (a.fullEdgeCount ?? 0) ? b : a))
}

/**
 * 「待建模」判定（纯函数——派生态现算的机械核）：全边数 ≥ 阈值 ∧ 链内有 open ∧ 报告不在场。
 * hasOpen 缺席（旧 face 结构兼容）= 保守拦截（维持既有口径，不因分量缺席放宽硬动作）。
 */
export function isModelingPending(count: number, hasOpen: boolean, reportPresent: boolean): boolean {
  return count >= RECURRENCE_ESCALATION_THRESHOLD && hasOpen && !reportPresent
}

/** 软拒绝裁决（guard 消费返回形——undefined = 放行） */
export interface RecurrenceEscalationRejection {
  readonly failure: DispatchCoreFailure
  /** 命中家族链（bug_id 时间序，链根在前——escalate 载荷链串摘要豁免的证据指针） */
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
    // 归属 scope：传任务归属标识——core 域按 sourceTaskId 事务级反查 tasks.slug 作容器锚
    // （container_slug 列直接比较，双向语义），无关提案历史链不进候选集；files 收窄口径归结算径。
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
  const heaviest = heaviestCandidateOf(candidates)
  const count = heaviest.fullEdgeCount ?? 0
  const chain = heaviest.chain
  const hasOpen = heaviest.hasOpen ?? true // 旧 face 回退 = 保守拦截（硬动作不因分量缺席放宽）
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
  const probe = modelingReportPresent?.({ projectId, slug: task.slug, localId: task.localId, bugIds: chain })
  if (probe === 'error') {
    // AGENTS §7 降级留痕 + 用户裁决（recurrence-judgment-narrowing 圆桌分歧 2）：探测 IO
    // 故障 = 机制失能 → 放行不拦（防「报告落错路径即永久拦截需绕行」重演），但必须 warn 留痕。
    emitForgeDiag(diag, {
      level: 'warn',
      event: 'modeling-report-face-error',
      message: `dispatch-core T3 解除判据降级：报告探测故障，拦截未生效（${task.slug}/${task.localId}）——探测 IO 故障按机制失能放行（核销卷宗目录可读性）`,
      projectId,
    })
  }
  const reportPresent = probe === true || probe === 'error'
  if (!isModelingPending(count, hasOpen, reportPresent)) return undefined
  return {
    chain,
    count,
    failure: rejectionFailureOf(`${task.slug}/${task.localId}`, candidates, count, chain),
  }
}

/** 候选行渲染（渐进式披露八字段：bugId/summary/status/errorType/containerSlug/suspectedLocation/lastSeenAt/recurrenceOf） */
function candidateLineOf(c: BugRecurrenceCandidate): string {
  return (
    `- ${c.bugId} [${c.status ?? 'unknown'}] ${c.summary}` +
    ` | errorType=${c.errorType ?? '未归类'}` +
    ` | container=${c.containerSlug ?? '—'}` +
    ` | suspected=${c.suspectedLocation ?? '—'}` +
    ` | lastSeen=${c.lastSeenAt ?? '—'}` +
    ` | recurrenceOf=${c.recurrenceOf ?? '链根'}`
  )
}

/** 限幅外候选的 errorType 计数行（控呈现不控召回——其余按 errorType 分组计数） */
function overflowLineOf(rest: readonly BugRecurrenceCandidate[]): string {
  const counts = new Map<string, number>()
  for (const c of rest) {
    const key = c.errorType ?? '未归类'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const parts = [...counts.entries()].map(([type, n]) => `${type}×${n}`)
  return `（其余 ${rest.length} 条按 errorType 计数：${parts.join('、')}——经 getBug 深挖）`
}

/**
 * 软拒绝 DTO（code + 升级提示 + 解除指引——Hard Rule：文案带指引不裸码）。载荷形态
 * （recurrence-signal-tiering 渐进式披露）：候选列表式（八字段/条，lastSeenAt 降序 top-5
 * 限幅，超出按 errorType 计数）——甄别判据 = suspected 位置，agent 自行甄别后经 getBug
 * 深挖；escalate 豁免 = 链串摘要保留在升级指引（上浮主会话要的是因果链证据，非甄别列表）。
 * 解除指引三要件（事故判例 4545fde4 直接对策）：落点双轨顶层路径模板 + .md 形态 +
 * 报告在场后重新 claim 放行（防 unblock/resolve 死锁重演）。
 */
export function rejectionFailureOf(
  taskKey: string,
  candidates: readonly BugRecurrenceCandidate[],
  count: number,
  chain: readonly string[],
): DispatchCoreFailure {
  const ordered = [...candidates].sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''))
  const top = ordered.slice(0, REJECTION_LIST_LIMIT)
  const rest = ordered.slice(REJECTION_LIST_LIMIT)
  const list = top.map(candidateLineOf).join('\n')
  return {
    ok: false,
    code: ERR_RECURRENCE_ESCALATION_REQUIRED,
    message:
      `同缝拦截：任务 ${taskKey} 的 recurrence 链最长祖先径全边数 ${count} ≥ ${RECURRENCE_ESCALATION_THRESHOLD}` +
      ` ∧ 链内有 open 成员——盲试 fix 派发被软拒绝（「待建模」派生态现算，零持久标记）。` +
      `候选清单（甄别判据 = suspected 位置，自行甄别后经 getBug 深挖）：\n${list}` +
      (rest.length > 0 ? `\n${overflowLineOf(rest)}` : ''),
    violations: [
      `escalate: 同缝全边 ≥2 ∧ 链内有 open——建议先升级排查建模（链串摘要（豁免呈现）：${chain.join(' → ')}；` +
        `判别实验清单逐条排除后再开修；委派目标由主会话自行决定，本提示零专家键）`,
      'release: 在 .forge/docs/proposals/<slug>/issues/<localId>/ 顶层或 .forge/docs/probes/<bugId>/ 顶层' +
        '落排查建模报告（.md），报告在场后重新 claim 本任务即放行',
    ],
  }
}
