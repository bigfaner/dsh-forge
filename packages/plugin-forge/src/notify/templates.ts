// notify · 十八场景模板（S4 纯模块——notification-samples.md 全谱的实现规格与测试锚）。
// 常规 6（①启动×3/领取×2/完成）+ 异常 9（⑦-⑧b-⑩阻塞族/⑪⑫自动重试/⑬⑭终局受阻）+
// 收口停止 3（⑮⑯⑰）。统一骨架（类型行/任务源/任务键/事实/剩余/详情/系统动作/下一步动作）
// 经 skeleton 机械拼装（key: val 单冒号·值内零冒号·封闭两值·机制词零出现）。
// 通道分流表（decisions #28）：①-⑫ 常规进行事件 = notice（inject·零模型回合）；
// ⑬-⑰ 终局事件 = followup（完整骨架消息）。renderNarrative 为场景分发单入口——
// 循环驱动器按场景 id + 载荷取文，模板函数亦可直调。
import {
  line,
  nextActionLine,
  NEXT_ACTION_NONE,
  nextActionPromptUser,
  sanitizeValue,
  typeLine,
} from './skeleton.js'

// ─────────────────────────── 场景载荷（样例逐字段参数化） ───────────────────────────

/** ① 启动·从头执行 */
export interface StartupFromScratchPayload {
  readonly sourceSlug: string
  readonly sourceKind: 'feature' | 'proposal'
  readonly pending: number
}

/** ② 启动·接续执行（上次未完成任务） */
export interface StartupResumeStoppedPayload {
  readonly sourceSlug: string
  readonly sourceKind: 'feature' | 'proposal'
  readonly taskKey: string
}

/** ③ 启动·接续执行（有任务正在执行） */
export interface StartupResumeInFlightPayload {
  readonly sourceSlug: string
  readonly sourceKind: 'feature' | 'proposal'
  readonly taskKey: string
}

/** ④ 领取 */
export interface ClaimPayload {
  readonly sourceSlug: string
  /** 任务行值（任务键+任务名——如「2.8 诊断弹窗装配（Apps web）」） */
  readonly taskLabel: string
}

/** ⑤ 领取（恢复中断的任务） */
export interface ClaimInterruptedPayload {
  readonly sourceSlug: string
  /** 任务行值（含「（恢复自中断 — …）」注记） */
  readonly taskLabel: string
}

/** ⑥ 完成 */
export interface CompletedPayload {
  readonly sourceSlug: string
  readonly taskLabel: string
  readonly summary: string
}

/** ⑦-⑩ 阻塞族公共面（reason 恒为摘要——全文只进裁决问询，decisions #24） */
interface BlockedBase {
  readonly sourceSlug: string
  readonly taskLabel: string
  readonly reasonSummary: string
  /** 事件子文件夹相对路径（incident-log 产物；缺席 = 落盘降级，详情行省略） */
  readonly incidentPath?: string
}

/** ⑦ 阻塞（已带修复任务——自动继续） */
export interface BlockedWithFixPayload extends BlockedBase {
  readonly fixId: string
}

/** ⑧ 阻塞（已自动分析并创建修复任务） */
export interface BlockedAutoFixedPayload extends BlockedBase {
  readonly fixId: string
  /** 修复内容摘要（系统行动作行括注） */
  readonly fixNote: string
}

/** ⑨ 阻塞（原因在其它任务源——先执行别的） */
export interface BlockedWaitExternalPayload extends BlockedBase {
  readonly externalSlug: string
}

/** ⑩ 阻塞（无法自动处理——需要你决定；问询另行发起不经叙述） */
export interface BlockedAskUserPayload extends BlockedBase {}

/** ⑧b 阻塞（已分割剩余范围——继任任务承接，源任务保持阻塞） */
export interface BlockedSplitPayload extends BlockedBase {
  /** 继任任务键（承接剩余范围的新任务 localId） */
  readonly successorId: string
  /** 分割内容摘要（系统行动作行括注；缺席省略） */
  readonly splitNote?: string
}

/** ⑪ 启动子代理失败（自动重试） */
export interface SpawnFailedRetryPayload {
  readonly sourceSlug: string
  readonly attempt: number
  readonly errorSummary: string
  readonly delaySeconds: number
  readonly maxAttempts: number
}

/** ⑫ 子代理异常退出（自动重新执行） */
export interface WorkerAbortedRetryPayload {
  readonly sourceSlug: string
  readonly taskKey: string
  readonly attempt: number
  readonly maxAttempts: number
}

/** ⑬ 连续失败——已停止（终局） */
export interface SpawnFailedHaltedPayload {
  readonly sourceSlug: string
  readonly attempts: number
  readonly instruction: string
}

/** ⑭ 无可执行任务且有任务阻塞（终局） */
export interface BlockedPoolItem {
  readonly taskKey: string
  readonly note: string
}

export interface BlockedPoolPayload {
  readonly sourceSlug: string
  readonly blockedItems: readonly BlockedPoolItem[]
}

/** ⑮ 结束（等待超时）（终局） */
export interface FinishedTimeoutPayload {
  readonly sourceSlug: string
  readonly reason: string
  readonly completed: number
  readonly blocked: number
  readonly pending: number
  readonly instruction: string
}

/** ⑯ 结束（全部完成）（终局） */
export interface FinishedAllPayload {
  readonly sourceSlug: string
  readonly completed: number
  readonly blocked: number
  readonly instruction: string
}

/** ⑰ 停止（/stop-dag-tasks）（终局） */
export interface StoppedByCommandPayload {
  readonly sourceSlug: string
  readonly completed: number
  readonly inFlightTaskKey: string
  readonly instruction: string
}

// ─────────────────────────── 场景表（id → 序号/通道/标题） ───────────────────────────

export type ScenarioId =
  | 'startup-from-scratch'
  | 'startup-resume-stopped'
  | 'startup-resume-inflight'
  | 'claim'
  | 'claim-interrupted'
  | 'completed'
  | 'blocked-with-fix'
  | 'blocked-auto-fixed'
  | 'blocked-split'
  | 'blocked-wait-external'
  | 'blocked-ask-user'
  | 'spawn-failed-retry'
  | 'worker-aborted-retry'
  | 'spawn-failed-halted'
  | 'blocked-pool'
  | 'finished-timeout'
  | 'finished-all'
  | 'stopped-by-command'

/** 叙述通道（decisions #28——notice = inject 零模型回合；followup = 终局完整消息） */
export type NarrationRoute = 'notice' | 'followup'

export const SCENARIOS: Readonly<Record<ScenarioId, { readonly no: string; readonly channel: NarrationRoute; readonly title: string }>> = {
  'startup-from-scratch': { no: '①', channel: 'notice', title: '启动·从头执行' },
  'startup-resume-stopped': { no: '②', channel: 'notice', title: '启动·接续执行（上次未完成）' },
  'startup-resume-inflight': { no: '③', channel: 'notice', title: '启动·接续执行（在飞任务）' },
  claim: { no: '④', channel: 'notice', title: '领取' },
  'claim-interrupted': { no: '⑤', channel: 'notice', title: '领取（恢复中断）' },
  completed: { no: '⑥', channel: 'notice', title: '完成' },
  'blocked-with-fix': { no: '⑦', channel: 'notice', title: '阻塞（已带修复任务）' },
  'blocked-auto-fixed': { no: '⑧', channel: 'notice', title: '阻塞（已自动分析并创建修复任务）' },
  'blocked-split': { no: '⑧b', channel: 'notice', title: '阻塞（已分割剩余范围）' },
  'blocked-wait-external': { no: '⑨', channel: 'notice', title: '阻塞（原因在其它任务源）' },
  'blocked-ask-user': { no: '⑩', channel: 'notice', title: '阻塞（无法自动处理）' },
  'spawn-failed-retry': { no: '⑪', channel: 'notice', title: '启动子代理失败（自动重试）' },
  'worker-aborted-retry': { no: '⑫', channel: 'notice', title: '子代理异常退出（自动重新执行）' },
  'spawn-failed-halted': { no: '⑬', channel: 'followup', title: '连续失败——已停止' },
  'blocked-pool': { no: '⑭', channel: 'followup', title: '无可执行任务且有任务阻塞' },
  'finished-timeout': { no: '⑮', channel: 'followup', title: '结束（等待超时）' },
  'finished-all': { no: '⑯', channel: 'followup', title: '结束（全部完成）' },
  'stopped-by-command': { no: '⑰', channel: 'followup', title: '停止' },
}

// ─────────────────────────── 十八场景模板函数 ───────────────────────────

/** ① 启动·从头执行（notice） */
export function startupFromScratch(p: StartupFromScratchPayload): string {
  return [
    typeLine('启动', '任务源', `${p.sourceSlug}（${p.sourceKind}）`),
    line('状态', `从头执行 — 按依赖顺序逐个执行（待执行 ${p.pending}）`),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ② 启动·接续执行（上次未完成任务）（notice） */
export function startupResumeStopped(p: StartupResumeStoppedPayload): string {
  return [
    typeLine('启动', '任务源', `${p.sourceSlug}（${p.sourceKind}）`),
    line('状态', `接续执行 — 发现未完成任务 ${p.taskKey}（上次已停止），重新执行`),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ③ 启动·接续执行（有任务正在执行）（notice） */
export function startupResumeInFlight(p: StartupResumeInFlightPayload): string {
  return [
    typeLine('启动', '任务源', `${p.sourceSlug}（${p.sourceKind}）`),
    line('状态', `接续执行 — 任务 ${p.taskKey} 正在执行，等它完成后继续`),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ④ 领取（notice；2026-10-12 用户裁决「去掉状态计数」——剩余行整体移除，头部单行摘要计数保留） */
export function claim(p: ClaimPayload): string {
  return [
    typeLine('领取', '任务源', p.sourceSlug),
    line('任务', p.taskLabel),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ⑤ 领取（恢复中断的任务）（notice；剩余行移除同 ④） */
export function claimInterrupted(p: ClaimInterruptedPayload): string {
  return [
    typeLine('领取', '任务源', p.sourceSlug),
    line('任务', p.taskLabel),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ⑥ 完成（notice） */
export function completed(p: CompletedPayload): string {
  return [
    typeLine('完成', '任务源', p.sourceSlug),
    line('任务', `${p.taskLabel} — 完成`),
    line('摘要', p.summary),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ⑦-⑩ 阻塞族任务行（任务 — 阻塞 — 原因摘要） */
function blockedTaskLine(p: BlockedBase): string {
  return line('任务', `${p.taskLabel} — 阻塞 — ${p.reasonSummary}`)
}

/** ⑦-⑩ 阻塞族详情行（事件子文件夹路径；落盘降级 = 省略） */
function blockedDetailLine(p: BlockedBase): readonly string[] {
  return p.incidentPath !== undefined ? [line('详情', p.incidentPath)] : []
}

/** ⑦ 阻塞（已带修复任务——自动继续）（notice） */
export function blockedWithFix(p: BlockedWithFixPayload): string {
  return [
    typeLine('阻塞', '任务源', p.sourceSlug),
    blockedTaskLine(p),
    ...blockedDetailLine(p),
    line('系统', `已自动创建修复任务 ${p.fixId}（完成后本任务自动恢复），继续执行`),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ⑧ 阻塞（已自动分析并创建修复任务）（notice） */
export function blockedAutoFixed(p: BlockedAutoFixedPayload): string {
  return [
    typeLine('自动处理', '任务源', p.sourceSlug),
    blockedTaskLine(p),
    ...blockedDetailLine(p),
    line('系统', `已自动分析原因并创建修复任务 ${p.fixId}（${p.fixNote}），继续执行`),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ⑧b 阻塞（已分割剩余范围——继任承接，源保持阻塞不重跑）（notice） */
export function blockedSplit(p: BlockedSplitPayload): string {
  return [
    typeLine('自动处理', '任务源', p.sourceSlug),
    blockedTaskLine(p),
    ...blockedDetailLine(p),
    line('系统', `已创建继任任务 ${p.successorId} 承接剩余范围（本任务保持阻塞，不再重跑），继续执行${p.splitNote !== undefined ? `——${p.splitNote}` : ''}`),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ⑨ 阻塞（原因在其它任务源——先执行别的）（notice） */
export function blockedWaitExternal(p: BlockedWaitExternalPayload): string {
  return [
    typeLine('自动处理', '任务源', p.sourceSlug),
    blockedTaskLine(p),
    ...blockedDetailLine(p),
    line('系统', `等待 ${p.externalSlug} 先完成，先执行其它任务`),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ⑩ 阻塞（无法自动处理——需要你决定；问询已另行发起）（notice） */
export function blockedAskUser(p: BlockedAskUserPayload): string {
  return [
    typeLine('自动处理', '任务源', p.sourceSlug),
    blockedTaskLine(p),
    ...blockedDetailLine(p),
    line('系统', '无法自动处理——已向你发起问询（附完整原因与处理历史）'),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ⑪ 启动子代理失败（自动重试）（notice） */
export function spawnFailedRetry(p: SpawnFailedRetryPayload): string {
  return [
    typeLine('自动重试', '任务源', p.sourceSlug),
    line('事件', `启动子代理失败（第 ${p.attempt} 次）— ${p.errorSummary}`),
    line('系统', `${p.delaySeconds} 秒后自动重试（连续 ${p.maxAttempts} 次失败将停止）`),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ⑫ 子代理异常退出（自动重新执行）（notice） */
export function workerAbortedRetry(p: WorkerAbortedRetryPayload): string {
  return [
    typeLine('自动重试', '任务源', p.sourceSlug),
    line('事件', `子代理异常退出 — 任务 ${p.taskKey}`),
    line('系统', `自动重新执行（第 ${p.attempt}/${p.maxAttempts} 次）`),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ⑬ 连续失败——已停止（followup·终局） */
export function spawnFailedHalted(p: SpawnFailedHaltedPayload): string {
  return [
    typeLine('自动重试', '任务源', p.sourceSlug),
    line('事件', `启动子代理连续失败 ${p.attempts} 次——已停止`),
    line('系统', '已向你发起问询'),
    nextActionLine(nextActionPromptUser(p.instruction, { alsoInquiry: true })),
  ].join('\n')
}

/** ⑭ 无可执行任务且有任务阻塞（followup·终局） */
export function blockedPool(p: BlockedPoolPayload): string {
  return [
    typeLine('受阻', '任务源', p.sourceSlug),
    line('事件', '没有可执行的任务，且有任务阻塞中'),
    // 清单项接缝 = 「· 」——项恒以全角括注收尾（）· 项间无前置空格，样例 ⑭ 逐字口径
    line('阻塞中', p.blockedItems.map((item) => `${item.taskKey}（${item.note}）`).join('· ')),
    line('系统', '已向你发起问询（附阻塞清单与完整原因）'),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ⑮ 结束（等待超时）（followup·终局） */
export function finishedTimeout(p: FinishedTimeoutPayload): string {
  return [
    typeLine('结束', '任务源', `${p.sourceSlug} — 结束（${p.reason}）`),
    line('状态', `完成 ${p.completed} · 阻塞 ${p.blocked} · 待处理 ${p.pending}`),
    nextActionLine(nextActionPromptUser(p.instruction)),
  ].join('\n')
}

/** ⑯ 结束（全部完成）（followup·终局） */
export function finishedAll(p: FinishedAllPayload): string {
  return [
    typeLine('结束', '任务源', `${p.sourceSlug} — 全部任务已完成`),
    line('状态', `完成 ${p.completed} · 阻塞 ${p.blocked}`),
    nextActionLine(nextActionPromptUser(p.instruction)),
  ].join('\n')
}

/** ⑰ 停止（/stop-dag-tasks）（followup·终局） */
export function stoppedByCommand(p: StoppedByCommandPayload): string {
  return [
    typeLine('停止', '任务源', `${p.sourceSlug} — 已按你的指令停止`),
    line('状态', `完成 ${p.completed} · 执行中任务 ${p.inFlightTaskKey} 已标记为中断`),
    nextActionLine(nextActionPromptUser(p.instruction)),
  ].join('\n')
}

// ─────────────────────────── 场景单行摘要（notice 折叠位专用——替代整段截断） ───────────────────────────

/** 折叠摘要单行界（faces 折叠位同值 120——超界省略号截断保底） */
export const HEADLINE_MAX_CHARS = 120

/** 摘要片段钳制（单片段超界省略号——防一个长值挤占整行预算） */
function clampPart(part: string, max: number): string {
  return part.length <= max ? part : `${part.slice(0, max - 1)}…`
}

/** 单行摘要拼装（`[forge·X]` 前缀 + ` · ` 分隔事实片段；动态片段经 sanitizeValue 净化冒号） */
function headlineOf(badge: string, parts: readonly string[]): string {
  return `[forge·${badge}] ${parts.map((part) => sanitizeValue(part)).join(' · ')}`
}

/** 每场景专用单行摘要表（复用骨架同源载荷事实——类型 + 任务键/事实短语；2026-10-12
 *  「去掉状态计数」——claim 族摘要零计数位） */
const HEADLINERS: { readonly [S in ScenarioId]: (payload: NarrativePayloadMap[S]) => string } = {
  'startup-from-scratch': (p) => headlineOf('启动', [`${p.sourceSlug}（${p.sourceKind}）`, '从头执行', `待执行 ${p.pending}`]),
  'startup-resume-stopped': (p) => headlineOf('启动', [`${p.sourceSlug}（${p.sourceKind}）`, `接续执行未完成 ${p.taskKey}`]),
  'startup-resume-inflight': (p) => headlineOf('启动', [`${p.sourceSlug}（${p.sourceKind}）`, `在飞任务 ${p.taskKey}`]),
  claim: (p) => headlineOf('领取', [clampPart(p.taskLabel, 60)]),
  'claim-interrupted': (p) => headlineOf('领取', [clampPart(p.taskLabel, 60), '恢复自中断']),
  completed: (p) => headlineOf('完成', [`${clampPart(p.taskLabel, 60)} — 完成`, clampPart(p.summary, 40)]),
  'blocked-with-fix': (p) =>
    headlineOf('阻塞', [
      `${clampPart(p.taskLabel, 40)} — 阻塞`,
      clampPart(p.reasonSummary, 30),
      `已创建修复任务 ${p.fixId}`,
      '继续执行',
    ]),
  'blocked-auto-fixed': (p) =>
    headlineOf('自动处理', [`${clampPart(p.taskLabel, 40)} — 阻塞`, `已创建修复任务 ${p.fixId}`, clampPart(p.fixNote, 20)]),
  'blocked-split': (p) =>
    headlineOf('自动处理', [
      `${clampPart(p.taskLabel, 40)} — 阻塞`,
      `已创建继任任务 ${p.successorId} 承接剩余范围`,
      ...(p.splitNote !== undefined ? [clampPart(p.splitNote, 20)] : []),
    ]),
  'blocked-wait-external': (p) =>
    headlineOf('自动处理', [`${clampPart(p.taskLabel, 40)} — 阻塞`, `等待 ${p.externalSlug} 先完成`]),
  'blocked-ask-user': (p) => headlineOf('自动处理', [`${clampPart(p.taskLabel, 40)} — 阻塞`, '已发起问询']),
  'spawn-failed-retry': (p) =>
    headlineOf('自动重试', [`启动子代理失败（第 ${p.attempt} 次）`, clampPart(p.errorSummary, 30), `${p.delaySeconds} 秒后重试`]),
  'worker-aborted-retry': (p) =>
    headlineOf('自动重试', [`任务 ${p.taskKey} 异常退出`, `自动重新执行（第 ${p.attempt}/${p.maxAttempts} 次）`]),
  'spawn-failed-halted': (p) =>
    headlineOf('自动重试', [`${p.sourceSlug} 启动子代理连续失败 ${p.attempts} 次 — 已停止`, '已发起问询']),
  'blocked-pool': (p) =>
    headlineOf('受阻', [
      `${p.sourceSlug} 无可执行任务`,
      `阻塞 ${p.blockedItems.length} 项（${p.blockedItems.map((item) => item.taskKey).join('、')}）`,
    ]),
  'finished-timeout': (p) =>
    headlineOf('结束', [
      `${p.sourceSlug} — 结束（${p.reason}）`,
      `完成 ${p.completed}`,
      `阻塞 ${p.blocked}`,
      `待处理 ${p.pending}`,
    ]),
  'finished-all': (p) => headlineOf('结束', [`${p.sourceSlug} — 全部任务已完成`, `完成 ${p.completed}`]),
  'stopped-by-command': (p) =>
    headlineOf('停止', [`${p.sourceSlug} — 已按你的指令停止`, `完成 ${p.completed}`, `执行中任务 ${p.inFlightTaskKey} 已标记为中断`]),
}

/** 场景分发单行摘要（与 renderNarrative 同参口径；超界省略号截断保底——折叠位永不越界） */
export function renderHeadline<S extends ScenarioId>(scenario: S, payload: NarrativePayloadMap[S]): string {
  const builder: (payload: NarrativePayloadMap[S]) => string = HEADLINERS[scenario]
  const raw = builder(payload)
  return raw.length <= HEADLINE_MAX_CHARS ? raw : `${raw.slice(0, HEADLINE_MAX_CHARS - 1)}…`
}

// ─────────────────────────── 场景分发（循环驱动器单入口） ───────────────────────────

/** 场景 id → 载荷映射（renderNarrative 的类型化分发表） */
export interface NarrativePayloadMap {
  'startup-from-scratch': StartupFromScratchPayload
  'startup-resume-stopped': StartupResumeStoppedPayload
  'startup-resume-inflight': StartupResumeInFlightPayload
  claim: ClaimPayload
  'claim-interrupted': ClaimInterruptedPayload
  completed: CompletedPayload
  'blocked-with-fix': BlockedWithFixPayload
  'blocked-auto-fixed': BlockedAutoFixedPayload
  'blocked-split': BlockedSplitPayload
  'blocked-wait-external': BlockedWaitExternalPayload
  'blocked-ask-user': BlockedAskUserPayload
  'spawn-failed-retry': SpawnFailedRetryPayload
  'worker-aborted-retry': WorkerAbortedRetryPayload
  'spawn-failed-halted': SpawnFailedHaltedPayload
  'blocked-pool': BlockedPoolPayload
  'finished-timeout': FinishedTimeoutPayload
  'finished-all': FinishedAllPayload
  'stopped-by-command': StoppedByCommandPayload
}

const RENDERERS: { readonly [S in ScenarioId]: (payload: NarrativePayloadMap[S]) => string } = {
  'startup-from-scratch': startupFromScratch,
  'startup-resume-stopped': startupResumeStopped,
  'startup-resume-inflight': startupResumeInFlight,
  claim,
  'claim-interrupted': claimInterrupted,
  completed,
  'blocked-with-fix': blockedWithFix,
  'blocked-auto-fixed': blockedAutoFixed,
  'blocked-split': blockedSplit,
  'blocked-wait-external': blockedWaitExternal,
  'blocked-ask-user': blockedAskUser,
  'spawn-failed-retry': spawnFailedRetry,
  'worker-aborted-retry': workerAbortedRetry,
  'spawn-failed-halted': spawnFailedHalted,
  'blocked-pool': blockedPool,
  'finished-timeout': finishedTimeout,
  'finished-all': finishedAll,
  'stopped-by-command': stoppedByCommand,
}

/** 场景分发（id 与载荷强关联——载荷形状错 = 编译期拒绝） */
export function renderNarrative<S extends ScenarioId>(scenario: S, payload: NarrativePayloadMap[S]): string {
  const renderer: (payload: NarrativePayloadMap[S]) => string = RENDERERS[scenario]
  return renderer(payload)
}
