// notify · 场景模板（S4 纯模块——loop-message-consolidation §2.1 注入面裁剪后规格）。
// 场景表收敛为结算/异常两径六场景：⑩ blocked-ask-user / ⑬ spawn-failed-halted /
// ⑭ blocked-pool / ⑮ finished-timeout / ⑯ finished-all / ⑰ stopped-by-command。
// 循环级（启动①-③）与任务级 notice 场景（领取④⑤/完成⑥/重试⑪⑫/自愈阻塞⑦⑧⑧b⑨）
// 已退出消息面——对应信息仅经 forge/progress 事件投影（driver 侧 emitProgress 单源）。
// 统一骨架（类型行/任务源/任务键/事实/系统动作/下一步动作）经 skeleton 机械拼装
// （key: val 单冒号·值内零冒号·封闭两值·机制词零出现）；结算消息附「任务概要」段
// （每任务一行：标题/终态/耗时——数据源 = 驱动侧与 progress 事件同源的起止记录）。
import {
  line,
  nextActionLine,
  NEXT_ACTION_NONE,
  nextActionPromptUser,
  sanitizeValue,
  typeLine,
} from './skeleton.js'

// ─────────────────────────── 场景载荷 ───────────────────────────

/** ⑩ 阻塞（无法自动处理——需要你决定；问询另行发起不经叙述）（followup·异常径） */
export interface BlockedAskUserPayload {
  readonly sourceSlug: string
  readonly taskLabel: string
  readonly reasonSummary: string
  /** 事件子文件夹相对路径（incident-log 产物；缺席 = 落盘降级，详情行省略） */
  readonly incidentPath?: string
}

/** ⑬ 连续失败——已停止（followup·异常径）——错误原文/任务标识在场时逐行补齐（AC 异常
 *  消息最小充分信息集：任务标识/错误原文/发生阶段/重试计数/处置入口） */
export interface SpawnFailedHaltedPayload {
  readonly sourceSlug: string
  readonly attempts: number
  readonly instruction: string
  /** 在飞任务标识（taskKey（标题）——guard 入口粘住无在飞时省略） */
  readonly taskLabel?: string
  /** 最近一次启动失败错误原文（缺席 = 该行省略） */
  readonly errorText?: string
}

/** ⑭ 无可执行任务且有任务阻塞（followup·异常径） */
export interface BlockedPoolItem {
  readonly taskKey: string
  readonly note: string
}

export interface BlockedPoolPayload {
  readonly sourceSlug: string
  readonly blockedItems: readonly BlockedPoolItem[]
}

/** ⑮ 结束（等待超时）（followup·结算径） */
export interface FinishedTimeoutPayload {
  readonly sourceSlug: string
  readonly reason: string
  readonly completed: number
  readonly blocked: number
  readonly pending: number
  readonly instruction: string
  /** 各任务概要（每任务一行：标题 — 终态 · 耗时；驱动侧起止记录同源产出） */
  readonly taskSummaries?: readonly string[]
}

/** ⑯ 结束（全部完成）（followup·结算径） */
export interface FinishedAllPayload {
  readonly sourceSlug: string
  readonly completed: number
  readonly blocked: number
  readonly instruction: string
  /** 各任务概要（同 ⑮） */
  readonly taskSummaries?: readonly string[]
}

/** ⑰ 停止（/stop-dag-tasks）（followup·结算径）——用户主动停止，不引导续跑（下一步动作 = 无） */
export interface StoppedByCommandPayload {
  readonly sourceSlug: string
  readonly completed: number
  readonly inFlightTaskKey: string
  /** 各任务概要（同 ⑮） */
  readonly taskSummaries?: readonly string[]
}

// ─────────────────────────── 场景表（id → 序号/通道/标题） ───────────────────────────

export type ScenarioId =
  | 'blocked-ask-user'
  | 'spawn-failed-halted'
  | 'blocked-pool'
  | 'finished-timeout'
  | 'finished-all'
  | 'stopped-by-command'

/** 叙述通道（历史分流列——裁剪后六场景恒 followup 唤醒径） */
export type NarrationRoute = 'notice' | 'followup'

export const SCENARIOS: Readonly<Record<ScenarioId, { readonly no: string; readonly channel: NarrationRoute; readonly title: string }>> = {
  'blocked-ask-user': { no: '⑩', channel: 'followup', title: '阻塞（无法自动处理）' },
  'spawn-failed-halted': { no: '⑬', channel: 'followup', title: '连续失败——已停止' },
  'blocked-pool': { no: '⑭', channel: 'followup', title: '无可执行任务且有任务阻塞' },
  'finished-timeout': { no: '⑮', channel: 'followup', title: '结束（等待超时）' },
  'finished-all': { no: '⑯', channel: 'followup', title: '结束（全部完成）' },
  'stopped-by-command': { no: '⑰', channel: 'followup', title: '停止' },
}

// ─────────────────────────── 六场景模板函数 ───────────────────────────

/** 任务概要段（结算/终局消息「每任务一行」段——行经 skeleton line 拼装，值净化同骨架） */
function taskSummarySection(summaries: readonly string[] | undefined): readonly string[] {
  return (summaries ?? []).map((item) => line('任务概要', item))
}

/** ⑩ 阻塞（无法自动处理——需要你决定；问询已另行发起）（followup·异常径） */
export function blockedAskUser(p: BlockedAskUserPayload): string {
  return [
    typeLine('阻塞', '任务源', p.sourceSlug),
    line('任务', `${p.taskLabel} — 阻塞 — ${p.reasonSummary}`),
    ...(p.incidentPath !== undefined ? [line('详情', p.incidentPath)] : []),
    line('系统', '无法自动处理——已向你发起问询（附完整原因与处理历史）'),
    line('处置入口', `响应问询，或任意会话凭任务源 ${p.sourceSlug} 认领挂起循环继续处置`),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ⑬ 连续失败——已停止（followup·异常径） */
export function spawnFailedHalted(p: SpawnFailedHaltedPayload): string {
  return [
    typeLine('自动重试', '任务源', p.sourceSlug),
    ...(p.taskLabel !== undefined ? [line('任务', p.taskLabel)] : []),
    line('事件', `启动子代理连续失败 ${p.attempts} 次——已停止`),
    line('阶段', '启动子代理'),
    ...(p.errorText !== undefined ? [line('错误', p.errorText)] : []),
    line('系统', '已向你发起问询'),
    nextActionLine(nextActionPromptUser(p.instruction, { alsoInquiry: true })),
  ].join('\n')
}

/** ⑭ 无可执行任务且有任务阻塞（followup·异常径） */
export function blockedPool(p: BlockedPoolPayload): string {
  return [
    typeLine('受阻', '任务源', p.sourceSlug),
    line('事件', '没有可执行的任务，且有任务阻塞中'),
    // 清单项接缝 = 「· 」——项恒以全角括注收尾（）· 项间无前置空格
    line('阻塞中', p.blockedItems.map((item) => `${item.taskKey}（${item.note}）`).join('· ')),
    line('系统', '已向你发起问询（附阻塞清单与完整原因）'),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

/** ⑮ 结束（等待超时）（followup·结算径） */
export function finishedTimeout(p: FinishedTimeoutPayload): string {
  return [
    typeLine('结束', '任务源', `${p.sourceSlug} — 结束（${p.reason}）`),
    line('状态', `完成 ${p.completed} · 阻塞 ${p.blocked} · 待处理 ${p.pending}`),
    ...taskSummarySection(p.taskSummaries),
    nextActionLine(nextActionPromptUser(p.instruction)),
  ].join('\n')
}

/** ⑯ 结束（全部完成）（followup·结算径） */
export function finishedAll(p: FinishedAllPayload): string {
  return [
    typeLine('结束', '任务源', `${p.sourceSlug} — 全部任务已完成`),
    line('状态', `完成 ${p.completed} · 阻塞 ${p.blocked}`),
    ...taskSummarySection(p.taskSummaries),
    nextActionLine(nextActionPromptUser(p.instruction)),
  ].join('\n')
}

/** ⑰ 停止（/stop-dag-tasks）（followup·结算径） */
export function stoppedByCommand(p: StoppedByCommandPayload): string {
  return [
    typeLine('停止', '任务源', `${p.sourceSlug} — 已按你的指令停止`),
    line('状态', `完成 ${p.completed} · 执行中任务 ${p.inFlightTaskKey} 已标记为中断`),
    ...taskSummarySection(p.taskSummaries),
    nextActionLine(NEXT_ACTION_NONE),
  ].join('\n')
}

// ─────────────────────────── 场景单行摘要（折叠位专用） ───────────────────────────

/** 折叠摘要单行界（faces 折叠位同值 120——超界省略号截断保底） */
export const HEADLINE_MAX_CHARS = 120

/** 单行摘要拼装（`[forge·X]` 前缀 + ` · ` 分隔事实片段；动态片段经 sanitizeValue 净化冒号） */
function headlineOf(badge: string, parts: readonly string[]): string {
  return `[forge·${badge}] ${parts.map((part) => sanitizeValue(part)).join(' · ')}`
}

/** 每场景专用单行摘要表（同源载荷事实） */
const HEADLINERS: { readonly [S in ScenarioId]: (payload: NarrativePayloadMap[S]) => string } = {
  'blocked-ask-user': (p) => headlineOf('阻塞', [`${p.taskLabel} — 阻塞`, '已发起问询']),
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
  'blocked-ask-user': BlockedAskUserPayload
  'spawn-failed-halted': SpawnFailedHaltedPayload
  'blocked-pool': BlockedPoolPayload
  'finished-timeout': FinishedTimeoutPayload
  'finished-all': FinishedAllPayload
  'stopped-by-command': StoppedByCommandPayload
}

const RENDERERS: { readonly [S in ScenarioId]: (payload: NarrativePayloadMap[S]) => string } = {
  'blocked-ask-user': blockedAskUser,
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
