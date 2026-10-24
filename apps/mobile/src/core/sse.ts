/**
 * SSE 引擎：EventSource（命名事件 snapshot/event）+ rAF 合帧 +
 * 官方三值退避轮询（活跃 250ms / 空闲 750ms / 封顶 5000ms）+
 * 心跳判活（15s 间隔检查 · 30s 无数据判死）+ 三态 teardown。
 *
 * 状态机（tech-design）：
 * [*] → Live →(error/心跳超时)→ Degraded →(轮询成功)→ Live
 *                              →(连续失败 ≥3)→ Offline →(手动重试)→ Degraded
 * 任意态 →(teardown)→ [*]：close + 清全部 timer（禁止串台）。
 * 所有 IO/timer 经 SseDeps 注入——单测全 fake。
 */
import { createSeqGate, mergeBySeq, type SeqGate, type WireEvent } from './wire.ts'

export type SseState = 'idle' | 'live' | 'degraded' | 'offline'

/** 官方三值轮询常量 + 心跳判活常量。 */
export const SSE_CONSTANTS = {
  POLL_ACTIVE_MS: 250,
  POLL_IDLE_MS: 750,
  POLL_CAP_MS: 5000,
  HEARTBEAT_INTERVAL_MS: 15000,
  HEARTBEAT_DEAD_MS: 30000,
  OFFLINE_FAIL_STREAK: 3,
} as const

export interface SseSource {
  close(): void
}

export interface SseSourceHandlers {
  onOpen(): void
  onSnapshot(data: string): void
  onEvent(data: string): void
  onError(): void
}

export interface SseDeps {
  openSource(url: string, handlers: SseSourceHandlers): SseSource
  /** 轮询探测（session.history 轻请求）：resolve = 通道可达。 */
  poll(): Promise<void>
  now(): number
  setTimeout(handler: () => void, timeoutMs: number): unknown
  clearTimeout(handle: unknown): void
  /** rAF 注入：测试传同步执行。 */
  requestFrame(fn: () => void): void
}

export interface StreamSnapshot {
  readonly kind: 'snapshot'
  readonly events: readonly WireEvent[]
  readonly projections: unknown
}

export interface StreamDelta {
  readonly kind: 'event'
  readonly event: WireEvent
}

export type StreamFrame = StreamSnapshot | StreamDelta

/** 官方帧形状：snapshot = {records, projections}；event = frame.event || frame。 */
export function parseStreamFrame(kind: 'snapshot' | 'event', raw: string): StreamFrame | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (kind === 'snapshot') {
    const frame = parsed as { records?: unknown; projections?: unknown }
    return {
      kind: 'snapshot',
      events: Array.isArray(frame.records) ? (frame.records as WireEvent[]) : [],
      projections: frame.projections,
    }
  }
  const frame = parsed as { event?: WireEvent } | WireEvent
  const event = 'event' in frame && frame.event !== undefined ? frame.event : (frame as WireEvent)
  return { kind: 'event', event }
}

/** 引擎出口：合帧后的投影载荷（seq 单调门已过）。 */
export interface SseSink {
  snapshot(frame: StreamSnapshot): void
  delta(frame: StreamDelta): void
  stateChange(state: SseState): void
}

export interface SseEngine {
  state(): SseState
  start(sessionId: string): void
  /** 路由离开会话：close + 清轮询/心跳 timer（三态同径）。 */
  teardown(): void
  /** Offline 手动重试 → Degraded 轮询。 */
  retry(): void
  /** 官方同款：agentRunning 切换轮询节奏（活跃 250 / 空闲 750）。 */
  setPollActive(active: boolean): void
}

export function createSseEngine(deps: SseDeps, sink: SseSink): SseEngine {
  const { POLL_ACTIVE_MS, POLL_IDLE_MS, POLL_CAP_MS, HEARTBEAT_INTERVAL_MS, HEARTBEAT_DEAD_MS, OFFLINE_FAIL_STREAK } =
    SSE_CONSTANTS

  let state: SseState = 'idle'
  let source: SseSource | null = null
  let sessionId = ''
  let pollActive = true
  let pollTimer: unknown = null
  let heartbeatTimer: unknown = null
  let pollDelayMs: number = POLL_ACTIVE_MS
  let pollFailStreak = 0
  let polling = false
  let lastDataAt = 0
  let tornDown = false

  // rAF 合帧：chunk 触发合帧，非 chunk 帧直接冲刷（官方 pending-sync 口径简化为：
  // delta 帧全部过 seq 门后经 rAF 一次回调，snapshot 即刻全量应用）。
  const seqGate: SeqGate = createSeqGate()
  let pendingDeltas: WireEvent[] = []
  let frameQueued = false

  const flush = (): void => {
    frameQueued = false
    const deltas = pendingDeltas
    pendingDeltas = []
    for (const event of deltas) sink.delta({ kind: 'event', event })
  }
  const queueFrame = (): void => {
    if (frameQueued) return
    frameQueued = true
    deps.requestFrame(flush)
  }

  const setState = (next: SseState): void => {
    if (state === next) return
    state = next
    sink.stateChange(next)
  }

  const clearTimers = (): void => {
    if (pollTimer !== null) deps.clearTimeout(pollTimer)
    if (heartbeatTimer !== null) deps.clearTimeout(heartbeatTimer)
    pollTimer = null
    heartbeatTimer = null
  }

  const closeSource = (): void => {
    source?.close()
    source = null
  }

  const schedulePoll = (): void => {
    if (polling || tornDown) return
    polling = true
    pollTimer = deps.setTimeout(() => {
      polling = false
      if (tornDown) return
      deps
        .poll()
        .then(() => {
          pollFailStreak = 0
          connect() // 轮询成功 → EventSource 重建 → Live
        })
        .catch(() => {
          pollFailStreak += 1
          if (pollFailStreak >= OFFLINE_FAIL_STREAK) {
            clearTimers()
            setState('offline')
            return
          }
          pollDelayMs = Math.min(pollDelayMs * 2, POLL_CAP_MS) // 5s 封顶退避
          schedulePoll()
        })
    }, pollDelayMs)
  }

  const toDegraded = (): void => {
    clearTimers() // 离开 Live：心跳 timer 必须随之销毁
    closeSource()
    pollDelayMs = pollActive ? POLL_ACTIVE_MS : POLL_IDLE_MS
    setState('degraded')
    schedulePoll()
  }

  const heartbeat = (): void => {
    heartbeatTimer = deps.setTimeout(() => {
      if (tornDown) return
      if (deps.now() - lastDataAt > HEARTBEAT_DEAD_MS) {
        // 半开连接对策：readyState OPEN 但无数据 → 主动 close → Degraded
        toDegraded()
        return
      }
      heartbeat()
    }, HEARTBEAT_INTERVAL_MS)
  }

  const onWireData = (frame: StreamFrame | null): void => {
    if (frame === null) return
    lastDataAt = deps.now()
    if (frame.kind === 'snapshot') {
      for (const event of frame.events) seqGate.admit(event.seq)
      sink.snapshot(frame)
      return
    }
    if (!seqGate.admit(frame.event.seq)) return // 单调门：≤ 已应用 seq 丢弃
    pendingDeltas.push(frame.event)
    queueFrame()
  }

  const connect = (): void => {
    closeSource()
    const url = `/api/session/stream?sessionId=${encodeURIComponent(sessionId)}`
    source = deps.openSource(url, {
      onOpen: () => {
        clearTimers()
        pollFailStreak = 0
        lastDataAt = deps.now()
        setState('live')
        heartbeat()
      },
      onSnapshot: (data) => onWireData(parseStreamFrame('snapshot', data)),
      onEvent: (data) => onWireData(parseStreamFrame('event', data)),
      onError: () => {
        if (state === 'live') toDegraded()
      },
    })
  }

  return {
    state: () => state,
    start(id) {
      sessionId = id
      tornDown = false
      connect()
    },
    teardown() {
      tornDown = true
      clearTimers()
      closeSource()
      pendingDeltas = []
      setState('idle')
    },
    retry() {
      if (state !== 'offline') return
      setState('degraded')
      pollDelayMs = pollActive ? POLL_ACTIVE_MS : POLL_IDLE_MS // 手动重试即恢复常规节奏
      schedulePoll()
    },
    setPollActive(active) {
      pollActive = active
    },
  }
}

/** 双通道合并不变式：SSE 增量与轮询快照按 seq 去重归并（store 层消费）。 */
export function mergeWindows<T extends { readonly seq: number }>(current: readonly T[], incoming: readonly T[]): T[] {
  return mergeBySeq(current, incoming)
}
