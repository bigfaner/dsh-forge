/**
 * wire 投影：SessionEvent 判别集窄化 + 投影纯函数（fake 可测主战场）。
 *
 * 契约类型单源 = type-only import 官方包（零运行时依赖不受影响）：
 * - 持久事件判别集：@deepseek-ai/dsh-session/types 的 SessionEvent
 * - 瞬态 live-chunk / 结算判别帧：@deepseek-ai/dsh-api-session-controller/client
 *
 * 处置五档（tech-design AD-4 白名单）：A 消息流渲染 / B 系统层轻投影 /
 * C 只读审批提示 / D 特判（attempt 不渲染、unknown kind 中性系统行）/
 * E 忽略（状态与机械）。判定顺序：事件 type 白名单 → user/message 按
 * source.kind 分派；surfaceOp 是条件字段，不作为投影判据。
 * 成对纪律：command/run ↔ command/done、approval/asked ↔ approval/decided
 * 由 projectHistory 配对归并，开始态无终态 = 可收起 chip 而非常驻卡。
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {
  AssistantLiveChunkEvent,
  SessionEventLikeEntry,
} from '@deepseek-ai/dsh-api-session-controller/client'

/** plugin 声明合并进 SessionEventMap 的扩展事件信封（ignorable 纪律兜底）。 */
export interface ExtensionEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: unknown
  readonly ignorable?: true
}

/** 官方持久判别集 ∪ plugin 扩展信封——host wire 上真实出现的全部事件形状。 */
export type WireEvent = SessionEvent | ExtensionEvent

// ---------------------------------------------------------------------------
// 投影判别集
// ---------------------------------------------------------------------------

export interface TextPart {
  readonly type: string
  readonly text?: string
}

export type Projection =
  | { readonly kind: 'user-bubble'; readonly seq: number; readonly text: string; readonly rpcId?: string }
  | { readonly kind: 'loop-narrative'; readonly seq: number; readonly text: string }
  | { readonly kind: 'model-selection-chip'; readonly seq: number; readonly provider: string; readonly model: string }
  | {
      readonly kind: 'assistant-message'
      readonly seq: number
      readonly text: string
      readonly reasoning: string
      readonly toolCalls: readonly { readonly id: string; readonly name: string; readonly arguments: string }[]
      readonly interrupted?: true
    }
  | { readonly kind: 'tool-call'; readonly seq: number; readonly callId: string; readonly name: string; readonly arguments: string }
  | {
      readonly kind: 'tool-result'
      readonly seq: number
      readonly callId: string
      readonly isError: boolean
      readonly text: string
    }
  | {
      readonly kind: 'loop-progress'
      readonly seq: number
      readonly sourceSlug: string
      readonly verb: string
      readonly status: string
      readonly taskKey: string
      readonly counts: Readonly<Record<string, number>>
    }
  | { readonly kind: 'session-title-line'; readonly seq: number; readonly title: string }
  | { readonly kind: 'compaction-summary-line'; readonly seq: number; readonly text: string }
  | {
      readonly kind: 'deliverables-card'
      readonly seq: number
      readonly files: readonly { readonly description?: string; readonly path: string }[]
    }
  | { readonly kind: 'plan-mode-chip'; readonly seq: number; readonly active: boolean }
  | {
      readonly kind: 'command-chip'
      readonly seq: number
      readonly commandId: string
      readonly name: string
      readonly args: string
      readonly done?: { readonly kind: string; readonly text?: string }
    }
  | {
      readonly kind: 'approval-card'
      readonly seq: number
      readonly id: string
      readonly phase: 'asked' | 'decided'
      readonly toolName?: string
      readonly reason?: string
      readonly outcome?: string
    }
  /** D 档：source.kind 未知的中性系统行（unknown ≠ 人工输入）。 */
  | { readonly kind: 'neutral-line'; readonly seq: number; readonly type: string }
  /** 非 ignorable 未知事件类型：必选类型拒绝静默吞（FMEA）。 */
  | { readonly kind: 'error-card'; readonly seq: number; readonly type: string }

// ---------------------------------------------------------------------------
// 纯函数投影
// ---------------------------------------------------------------------------

function textOf(parts: readonly TextPart[] | undefined): string {
  return (parts ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('')
}

interface UserMessageData {
  readonly content?: readonly TextPart[]
  readonly source?: { readonly kind?: string; readonly rpcId?: string }
}

function projectUserMessage(event: WireEvent): Projection {
  const data = event.data as UserMessageData
  const text = textOf(data.content)
  switch (data.source?.kind) {
    case 'user':
      return { kind: 'user-bubble', seq: event.seq, text, rpcId: data.source.rpcId }
    case 'forge-loop':
      return { kind: 'loop-narrative', seq: event.seq, text }
    case 'model-selection': {
      const model = text
      const [provider = '', name = ''] = model.split('/')
      return { kind: 'model-selection-chip', seq: event.seq, provider, model: name || model }
    }
    default:
      return { kind: 'neutral-line', seq: event.seq, type: 'user/message' }
  }
}

/** 单事件投影：E 档返回 null（零渲染），D 档中性/错误卡。 */
export function projectEvent(event: WireEvent): Projection | null {
  switch (event.type) {
    // A 消息流渲染
    case 'user/message':
      return projectUserMessage(event)
    case 'assistant/message': {
      const data = event.data as {
        message?: { content?: readonly ({ type: string; text?: string; id?: string; name?: string; arguments?: string })[] }
        interrupted?: true
      }
      const blocks = data.message?.content ?? []
      return {
        kind: 'assistant-message',
        seq: event.seq,
        text: textOf(blocks),
        reasoning: blocks
          .filter((b) => b.type === 'reasoning' && typeof b.text === 'string')
          .map((b) => b.text ?? '')
          .join(''),
        toolCalls: blocks
          .filter((b) => b.type === 'tool-call')
          .map((b) => ({ id: b.id ?? '', name: b.name ?? '', arguments: b.arguments ?? '' })),
        ...(data.interrupted ? { interrupted: true } : {}),
      }
    }
    case 'tool/call': {
      const data = event.data as { callId: string; name: string; arguments: string }
      return { kind: 'tool-call', seq: event.seq, callId: data.callId, name: data.name, arguments: data.arguments }
    }
    case 'tool/result': {
      const data = event.data as {
        message?: { toolCallId?: string; isError?: boolean; content?: readonly TextPart[] }
      }
      return {
        kind: 'tool-result',
        seq: event.seq,
        callId: data.message?.toolCallId ?? '',
        isError: data.message?.isError === true,
        text: textOf(data.message?.content),
      }
    }
    // B 系统层轻投影
    case 'forge/progress': {
      const data = event.data as {
        sourceSlug: string
        verb: string
        status: string
        taskKey: string
        counts: Record<string, number>
      }
      return {
        kind: 'loop-progress',
        seq: event.seq,
        sourceSlug: data.sourceSlug,
        verb: data.verb,
        status: data.status,
        taskKey: data.taskKey,
        counts: data.counts,
      }
    }
    case 'session/title':
      return { kind: 'session-title-line', seq: event.seq, title: (event.data as { title: string }).title }
    case 'compaction/summary': {
      const data = event.data as { summary?: readonly TextPart[] }
      return { kind: 'compaction-summary-line', seq: event.seq, text: textOf(data.summary) }
    }
    case 'deliverables/presented': {
      const data = event.data as { files?: readonly { description?: string; path: string }[] }
      return { kind: 'deliverables-card', seq: event.seq, files: data.files ?? [] }
    }
    case 'plan/mode':
      return { kind: 'plan-mode-chip', seq: event.seq, active: (event.data as { active: boolean }).active }
    case 'command/run': {
      const data = event.data as { commandId: string; name: string; args: string }
      return { kind: 'command-chip', seq: event.seq, commandId: data.commandId, name: data.name, args: data.args }
    }
    // C 只读审批提示
    case 'approval/asked': {
      const data = event.data as { id: string; toolName?: string; reason?: string }
      return {
        kind: 'approval-card',
        seq: event.seq,
        id: data.id,
        phase: 'asked',
        toolName: data.toolName,
        reason: data.reason,
      }
    }
    case 'approval/decided': {
      const data = event.data as { id: string; outcome: string }
      return { kind: 'approval-card', seq: event.seq, id: data.id, phase: 'decided', outcome: data.outcome }
    }
    // D 特判
    case 'assistant/attempt':
      return null
    // E 忽略（状态与机械）——含 command/done（并入 command-chip 配对口径）
    case 'command/done':
    case 'permission/preset':
    case 'sandbox/mode':
    case 'approval/policy':
    case 'agent-preset/selected':
    case 'agent/inbox/spliced':
    case 'turn/start':
    case 'turn/end':
    case 'step/start':
    case 'step/end':
    case 'system/message':
    case 'request/header':
    case 'request/context':
    case 'session/title-llm-request':
    case 'workspace/changes':
    case 'web/deepseek-search-llm-request':
    case 'session/end-seed':
    case 'llm/retry':
    case 'llm/retry-started':
    case 'compaction/start':
    case 'compaction/end':
    case 'compaction/prune':
    case 'subagent/catalog':
    case 'model/selection':
      return null
    default:
      // 白名单外的 plugin 扩展类型：ignorable → 安全跳过；否则不静默吞。
      return 'ignorable' in event && event.ignorable === true
        ? null
        : { kind: 'error-card', seq: event.seq, type: event.type }
  }
}

/**
 * 历史投影：逐事件投影 + 成对纪律归并——
 * command/done 并入同名 commandId 的 command-chip；approval/decided 并入
 * 同 id 的 asked 卡。终态缺失时开始态保持可收起 chip。
 */
export function projectHistory(events: readonly WireEvent[]): Projection[] {
  const projections = events
    .map(projectEvent)
    .filter((p): p is Projection => p !== null)
  const doneById = new Map<string, { kind: string; text?: string }>()
  for (const event of events) {
    if (event.type === 'command/done') {
      const data = event.data as { commandId: string; kind: string; text?: string }
      doneById.set(data.commandId, { kind: data.kind, ...(data.text === undefined ? {} : { text: data.text }) })
    }
  }
  const decidedById = new Map<string, string>()
  for (const event of events) {
    if (event.type === 'approval/decided') {
      const data = event.data as { id: string; outcome: string }
      decidedById.set(data.id, data.outcome)
    }
  }
  // decided 独立卡在有 asked 配对时并入（成对纪律）；无配对保持独立只读卡
  const askedIds = new Set(
    events.filter((event) => event.type === 'approval/asked').map((event) => (event.data as { id: string }).id),
  )
  const paired = projections.filter(
    (p) => !(p.kind === 'approval-card' && p.phase === 'decided' && askedIds.has(p.id)),
  )
  return paired.map((p) => {
    if (p.kind === 'command-chip') {
      const done = doneById.get(p.commandId)
      return done ? { ...p, done } : p
    }
    if (p.kind === 'approval-card' && p.phase === 'asked') {
      const outcome = decidedById.get(p.id)
      return outcome === undefined ? p : { ...p, phase: 'decided' as const, outcome }
    }
    return p
  })
}

// ---------------------------------------------------------------------------
// seq 单调门（双通道写纪律：Degraded 期间轮询与 SSE 重连并存，全部写入经此门）
// ---------------------------------------------------------------------------

export interface SeqGate {
  /** seq 严格大于已应用游标才放行；放行即推进游标。 */
  admit(seq: number): boolean
  appliedSeq(): number
}

export function createSeqGate(initial = -1): SeqGate {
  let applied = initial
  return {
    admit(seq: number) {
      if (seq <= applied) return false
      applied = seq
      return true
    },
    appliedSeq: () => applied,
  }
}

/**
 * 双通道乱序写入按 seq 去重合并：incoming 与 current 逐 seq 去重后升序归并。
 * 纯函数——返回新数组，不改动 current。
 */
export function mergeBySeq<T extends { readonly seq: number }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const bySeq = new Map<number, T>()
  for (const item of current) bySeq.set(item.seq, item)
  for (const item of incoming) {
    if (!bySeq.has(item.seq)) bySeq.set(item.seq, item)
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
}

// ---------------------------------------------------------------------------
// per-attemptId 结算状态机（live-chunk 瞬态行 → settle/abandon 原子取代）
// ---------------------------------------------------------------------------

export type AttemptState = 'streaming' | 'settled' | 'abandoned'

export interface TransientRow {
  readonly attemptId: string
  readonly text: string
  readonly reasoning: string
  readonly state: AttemptState
  readonly lastSeq: number
}

interface AttemptBuffer {
  text: string
  reasoning: string
  state: AttemptState
  lastSeq: number
  /** 已吸收的 chunk 键（attemptId+chunk 判别去重） */
  readonly seen: Set<string>
}

/**
 * 判别帧（window.change）驱动的瞬态结算：
 * - append assistant/live-chunk → 开新子状态机 / 同 attempt 追加（去重）
 * - settle-assistant(attemptId, entry?) → Streaming→Settled，transient 载荷清空
 *   （持久 assistant-message 卡原子取代）；Settled/Abandoned 后迟到 chunk 被终态吸收
 * - abandoned 判别帧 → Streaming→Abandoned，保留前缀 + 中断标记
 */
export interface AttemptSettler {
  chunk(event: AssistantLiveChunkEvent): void
  settle(attemptId: string, entry?: SessionEventLikeEntry): void
  abandon(attemptId: string): void
  rows(): readonly TransientRow[]
}

export function createAttemptSettler(): AttemptSettler {
  const buffers = new Map<string, AttemptBuffer>()
  const bufferOf = (attemptId: string): AttemptBuffer | undefined => buffers.get(attemptId)

  const absorb = (buffer: AttemptBuffer, event: AssistantLiveChunkEvent): void => {
    const { chunk } = event.data
    const key = `${chunk.type}:${'index' in chunk ? String(chunk.index) : ''}:${event.seq}`
    if (buffer.seen.has(key)) return
    buffer.seen.add(key)
    if (chunk.type === 'text-delta') buffer.text += chunk.text
    else if (chunk.type === 'reasoning-delta') buffer.reasoning += chunk.text
    buffer.lastSeq = event.seq
  }

  return {
    chunk(event) {
      const attemptId = event.data.attemptId
      const buffer = bufferOf(attemptId)
      if (buffer === undefined) {
        const fresh: AttemptBuffer = { text: '', reasoning: '', state: 'streaming', lastSeq: event.seq, seen: new Set() }
        buffers.set(attemptId, fresh)
        absorb(fresh, event)
        return
      }
      if (buffer.state !== 'streaming') return // 终态吸收
      absorb(buffer, event)
    },
    settle(attemptId, _entry) {
      const buffer = bufferOf(attemptId)
      if (buffer === undefined || buffer.state !== 'streaming') return
      buffer.state = 'settled'
      buffer.text = ''
      buffer.reasoning = ''
    },
    abandon(attemptId) {
      const buffer = bufferOf(attemptId)
      if (buffer === undefined || buffer.state !== 'streaming') return
      buffer.state = 'abandoned'
    },
    rows: () =>
      [...buffers.entries()].map(([attemptId, buffer]) => ({
        attemptId,
        text: buffer.text,
        reasoning: buffer.reasoning,
        state: buffer.state,
        lastSeq: buffer.lastSeq,
      })),
  }
}

// ---------------------------------------------------------------------------
// 未读可见计数（AD-6：A/B 档投影类型才计；compaction/prune 被裁 seq 不计）
// ---------------------------------------------------------------------------

function shadowedSeqs(events: readonly WireEvent[]): Set<number> {
  const shadowed = new Set<number>()
  for (const event of events) {
    if (event.type === 'compaction/prune') {
      const data = event.data as { shadowedRange?: { start: number; end: number }; shadowedSeqs?: readonly number[] }
      for (const seq of data.shadowedSeqs ?? []) shadowed.add(seq)
      const range = data.shadowedRange
      if (range) for (let seq = range.start; seq <= range.end; seq++) shadowed.add(seq)
    }
    if (event.type === 'compaction/summary') {
      const data = event.data as { shadowedRange?: { start: number; end: number } }
      const range = data.shadowedRange
      if (range) for (let seq = range.start; seq <= range.end; seq++) shadowed.add(seq)
    }
  }
  return shadowed
}

/** 可见事件计数：投影非空且未被 compaction 裁剪。 */
export function visibleCount(events: readonly WireEvent[]): number {
  const shadowed = shadowedSeqs(events)
  return events.filter((event) => !shadowed.has(event.seq) && projectEvent(event) !== null).length
}

/** lastReadSeq 钳制：游标落在被裁区间时回退到裁剪上界之后最近可见 seq。 */
export function clampLastReadSeq(lastReadSeq: number, events: readonly WireEvent[]): number {
  const shadowed = shadowedSeqs(events)
  if (!shadowed.has(lastReadSeq)) return lastReadSeq
  let clamped = lastReadSeq
  while (shadowed.has(clamped)) clamped -= 1
  return clamped
}
