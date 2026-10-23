import { describe, expect, it } from 'vitest'
import {
  createSseEngine,
  parseStreamFrame,
  SSE_CONSTANTS,
  type SseDeps,
  type SseSink,
  type SseSourceHandlers,
  type StreamFrame,
} from './sse.ts'

// ---------------------------------------------------------------------------
// fake 依赖：手动 timer 队列 + 可编程 EventSource/poll + 同步 rAF 队列
// ---------------------------------------------------------------------------

interface FakeTimer {
  id: number
  at: number
  fn: () => void
}

function makeDeps() {
  let nowMs = 1000
  let timerSeq = 0
  const timers: FakeTimer[] = []
  const sources: { url: string; handlers: SseSourceHandlers; closed: boolean }[] = []
  const frames: (() => void)[] = []
  let pollResult: Promise<void> = Promise.resolve()
  const polls = { started: 0 }

  const deps: SseDeps = {
    openSource(url, handlers) {
      const source = { url, handlers, closed: false }
      sources.push(source)
      return {
        close: () => {
          source.closed = true
        },
      }
    },
    poll: () => {
      polls.started += 1
      return pollResult
    },
    now: () => nowMs,
    setTimeout(fn, timeoutMs) {
      timerSeq += 1
      timers.push({ id: timerSeq, at: nowMs + timeoutMs, fn })
      return timerSeq
    },
    clearTimeout(handle) {
      const id = handle as number
      const index = timers.findIndex((timer) => timer.id === id)
      if (index !== -1) timers.splice(index, 1)
    },
    requestFrame(fn) {
      frames.push(fn)
    },
  }

  const harness = {
    deps,
    sources,
    frames,
    polls,
    advance(ms: number): void {
      nowMs += ms
      const due = timers.filter((timer) => timer.at <= nowMs)
      for (const timer of due) {
        const index = timers.findIndex((t) => t.id === timer.id)
        if (index !== -1) timers.splice(index, 1)
        timer.fn()
      }
    },
    tickNow(): void {
      while (frames.length > 0) frames.shift()!()
    },
    open(index = sources.length - 1): SseSourceHandlers {
      return sources[index]!.handlers
    },
    setPollResult(result: Promise<void>): void {
      pollResult = result
    },
    pendingTimers(): FakeTimer[] {
      return [...timers]
    },
  }
  return harness
}

function makeSink() {
  const events: unknown[] = []
  const states: string[] = []
  const sink: SseSink = {
    snapshot: (frame) => events.push({ kind: 'snapshot', events: frame.events }),
    delta: (frame) => events.push({ kind: 'delta', event: frame.event }),
    stateChange: (state) => states.push(state),
  }
  return { events, states, sink }
}

const SAMPLE_EVENT = { type: 'forge/progress', seq: 11, time: 1, data: {} }

/** 排干 poll promise 的 then/catch 链（两级微任务）。 */
const drainMicro = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

function frameOf(event: unknown): string {
  return JSON.stringify({ event })
}

// ---------------------------------------------------------------------------
// 状态机：Live / Degraded / Offline 全迁移
// ---------------------------------------------------------------------------

describe('SSE 状态机', () => {
  it('start → EventSource open → Live', () => {
    const h = makeDeps()
    const { states, sink } = makeSink()
    const engine = createSseEngine(h.deps, sink)
    engine.start('s-1')
    expect(h.sources[0]?.url).toBe('/api/session/stream?sessionId=s-1')
    h.open().onOpen()
    expect(engine.state()).toBe('live')
    expect(states).toEqual(['live'])
  })

  it('Live →(error)→ Degraded：close 源 + 心跳清场 + 按活跃值起 250ms 轮询', () => {
    const h = makeDeps()
    const { sink } = makeSink()
    const engine = createSseEngine(h.deps, sink)
    engine.start('s-1')
    h.open().onOpen()
    h.open().onError()
    expect(engine.state()).toBe('degraded')
    expect(h.sources[0]?.closed).toBe(true)
    expect(h.pendingTimers().length).toBe(1) // 仅轮询 timer，心跳已清
    expect(h.polls.started).toBe(0) // 定时器未到期
    h.advance(SSE_CONSTANTS.POLL_ACTIVE_MS)
    expect(h.polls.started).toBe(1)
  })

  it('Degraded →(轮询成功)→ EventSource 重建 → Live', async () => {
    const h = makeDeps()
    const { sink } = makeSink()
    const engine = createSseEngine(h.deps, sink)
    engine.start('s-1')
    h.open().onOpen()
    h.open().onError()
    h.advance(SSE_CONSTANTS.POLL_ACTIVE_MS) // poll resolve → reconnect
    await drainMicro()
    expect(h.sources.length).toBe(2)
    h.open().onOpen()
    expect(engine.state()).toBe('live')
  })

  it('Degraded →(连续失败 ≥3)→ Offline：清轮询 timer（停止打失效端点）', async () => {
    const h = makeDeps()
    const { sink } = makeSink()
    h.setPollResult(Promise.reject(new Error('down')))
    const engine = createSseEngine(h.deps, sink)
    engine.start('s-1')
    h.open().onOpen()
    h.open().onError()
    for (const gap of [250, 500, 1000]) {
      h.advance(gap)
      await drainMicro()
    }
    expect(engine.state()).toBe('offline')
    expect(h.pendingTimers().length).toBe(0)
  })

  it('Offline →(手动重试)→ Degraded（轮询恢复）', async () => {
    const h = makeDeps()
    const { sink } = makeSink()
    h.setPollResult(Promise.reject(new Error('down')))
    const engine = createSseEngine(h.deps, sink)
    engine.start('s-1')
    h.open().onOpen()
    h.open().onError()
    for (const gap of [250, 500, 1000]) {
      h.advance(gap)
      await drainMicro()
    }
    expect(engine.state()).toBe('offline')
    h.setPollResult(Promise.resolve())
    engine.retry()
    expect(engine.state()).toBe('degraded')
    h.advance(SSE_CONSTANTS.POLL_ACTIVE_MS)
    await drainMicro()
    expect(h.sources.length).toBe(2)
  })

  it('退避升级：连续失败按 ×2 升级，第 3 次失败判 Offline', async () => {
    const h = makeDeps()
    const { sink } = makeSink()
    h.setPollResult(Promise.reject(new Error('down')))
    const engine = createSseEngine(h.deps, sink)
    engine.start('s-1')
    h.open().onOpen()
    h.open().onError()
    h.advance(250) // 第 1 次失败
    await drainMicro()
    expect(engine.state()).toBe('degraded')
    expect(h.pendingTimers().map((t) => t.at - h.deps.now())).toEqual([500]) // ×2
    h.advance(500) // 第 2 次失败
    await drainMicro()
    expect(h.pendingTimers().map((t) => t.at - h.deps.now())).toEqual([1000]) // ×2
    h.advance(1000) // 第 3 次失败 → Offline
    await drainMicro()
    expect(engine.state()).toBe('offline')
    expect(h.polls.started).toBe(3)
    expect(h.pendingTimers().length).toBe(0)
  })

  it('setPollActive(false)：空闲档起 750ms 轮询', () => {
    const h = makeDeps()
    const { sink } = makeSink()
    const engine = createSseEngine(h.deps, sink)
    engine.setPollActive(false)
    engine.start('s-1')
    h.open().onOpen()
    h.open().onError()
    h.advance(SSE_CONSTANTS.POLL_ACTIVE_MS)
    expect(h.polls.started).toBe(0)
    h.advance(SSE_CONSTANTS.POLL_IDLE_MS - SSE_CONSTANTS.POLL_ACTIVE_MS)
    expect(h.polls.started).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 心跳判活（半开对策）
// ---------------------------------------------------------------------------

describe('心跳判活', () => {
  it('30s 无数据 → 主动 close → Degraded', () => {
    const h = makeDeps()
    const { sink } = makeSink()
    const engine = createSseEngine(h.deps, sink)
    engine.start('s-1')
    h.open().onOpen()
    h.advance(SSE_CONSTANTS.HEARTBEAT_INTERVAL_MS) // 15s：未超时
    expect(engine.state()).toBe('live')
    h.advance(SSE_CONSTANTS.HEARTBEAT_INTERVAL_MS + 1) // 30s+：判死
    expect(engine.state()).toBe('degraded')
    expect(h.sources[0]?.closed).toBe(true)
  })

  it('心跳间隔内有数据刷新时间戳 → 保持 Live', () => {
    const h = makeDeps()
    const { sink } = makeSink()
    const engine = createSseEngine(h.deps, sink)
    engine.start('s-1')
    h.open().onOpen()
    for (let i = 0; i < 4; i++) {
      h.open().onEvent(frameOf(SAMPLE_EVENT))
      h.advance(SSE_CONSTANTS.HEARTBEAT_INTERVAL_MS)
    }
    expect(engine.state()).toBe('live')
    expect(h.sources[0]?.closed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 三态 teardown
// ---------------------------------------------------------------------------

describe('teardown 纪律', () => {
  type Engine = ReturnType<typeof createSseEngine>
  function teardownFrom(stateSetup: (h: ReturnType<typeof makeDeps>, engine: Engine) => void) {
    const h = makeDeps()
    const { sink } = makeSink()
    const engine = createSseEngine(h.deps, sink)
    engine.start('s-1')
    stateSetup(h, engine)
    engine.teardown()
    return { h, engine }
  }

  it('Live teardown：close + 清心跳 timer', () => {
    const { h, engine } = teardownFrom((h2, e) => {
      h2.open().onOpen()
      expect(e.state()).toBe('live')
    })
    expect(engine.state()).toBe('idle')
    expect(h.sources[0]?.closed).toBe(true)
    expect(h.pendingTimers().length).toBe(0)
  })

  it('Degraded teardown：轮询 timer 必须随状态机销毁（禁止串台）', () => {
    const { h, engine } = teardownFrom((h2, e) => {
      h2.open().onOpen()
      h2.open().onError()
      expect(e.state()).toBe('degraded')
    })
    expect(engine.state()).toBe('idle')
    expect(h.pendingTimers().length).toBe(0)
    h.advance(60000)
    expect(h.polls.started).toBe(0) // teardown 后轮询不再触发
  })

  it('Offline teardown：无残留 timer，状态回 idle', async () => {
    const h = makeDeps()
    const { sink } = makeSink()
    h.setPollResult(Promise.reject(new Error('down')))
    const engine = createSseEngine(h.deps, sink)
    engine.start('s-1')
    h.open().onOpen()
    h.open().onError()
    for (let i = 0; i < 3; i++) {
      h.advance(250)
      await drainMicro()
    }
    engine.teardown()
    expect(engine.state()).toBe('idle')
    expect(h.pendingTimers().length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// rAF 合帧 + seq 单调门 + 官方帧形状
// ---------------------------------------------------------------------------

describe('合帧与帧解析', () => {
  it('多 delta 合一帧冲刷；≤ 已应用 seq 的写入被单调门丢弃', () => {
    const h = makeDeps()
    const { events, sink } = makeSink()
    const engine = createSseEngine(h.deps, sink)
    engine.start('s-1')
    h.open().onOpen()
    h.open().onEvent(
      frameOf({
        type: 'assistant/live-chunk',
        seq: 5,
        time: 1,
        data: { attemptId: 'a', turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'x' } },
      }),
    )
    h.open().onEvent(frameOf({ type: 'forge/progress', seq: 3, time: 1, data: {} })) // 乱序旧 seq → 丢弃
    h.open().onEvent(frameOf(SAMPLE_EVENT))
    expect(events.length).toBe(0) // rAF 未冲刷前零渲染
    h.tickNow()
    expect(events.length).toBe(2)
    expect(events.at(-1)).toMatchObject({ kind: 'delta', event: { seq: 11 } })
  })

  it('snapshot 全量应用并推进 seq 游标', () => {
    const h = makeDeps()
    const { events, sink } = makeSink()
    const engine = createSseEngine(h.deps, sink)
    engine.start('s-1')
    h.open().onSnapshot(JSON.stringify({ records: [SAMPLE_EVENT], projections: {} }))
    expect(events).toEqual([{ kind: 'snapshot', events: [SAMPLE_EVENT] }])
    h.open().onEvent(frameOf({ type: 'forge/progress', seq: 10, time: 1, data: {} })) // ≤ snapshot seq → 丢弃
    h.tickNow()
    expect(events.length).toBe(1)
  })

  it('官方帧形状：event 帧 = frame.event || frame；snapshot = {records, projections}', () => {
    expect(parseStreamFrame('event', frameOf(SAMPLE_EVENT))).toEqual({ kind: 'event', event: SAMPLE_EVENT })
    expect(parseStreamFrame('event', JSON.stringify(SAMPLE_EVENT))).toEqual({ kind: 'event', event: SAMPLE_EVENT })
    const snapshot = parseStreamFrame('snapshot', JSON.stringify({ records: [SAMPLE_EVENT], projections: { p: 1 } }))
    expect(snapshot).toMatchObject({ kind: 'snapshot', projections: { p: 1 } })
    expect(parseStreamFrame('event', 'not-json')).toBeNull()
  })
})

// 类型 pin：StreamFrame 判别集收窄
describe('StreamFrame 形状', () => {
  it('snapshot / event 判别收窄', () => {
    const frame: StreamFrame = { kind: 'event', event: SAMPLE_EVENT as never }
    if (frame.kind === 'event') expect(frame.event.seq).toBe(11)
  })
})
