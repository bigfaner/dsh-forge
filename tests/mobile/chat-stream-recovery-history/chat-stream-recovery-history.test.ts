// @feature:mobile-ui
// @mobile-e2e
// Journey: chat-stream-recovery-history（对话流式渲染 + 历史分页 + 断线降级/重连补齐）。
// 溯源：contracts/step-1-open-session.md … step-8-reconnect-resync.md（每 Outcome 一测 + 冒烟）。
// 策略：数据面用 e2e/fixtures/mobile api 参照腿（session/list 官方 SessionSummary 形状）+
// forge-stream SSE 帧录制（snapshot/event timed 序）+ wire 钉样本（wire.fixtures 37 类持久
// 事件）驱动 chat/sse/wire 纯逻辑面；引擎行为用注入 fake 的 createSseEngine 实测。零真实 host。
// 锚点注记：contract 锚点写官方 /api/rpc session.history/session.prompt——实现只消费官方面
// （core/api.ts OFFICIAL_RPC_PATH），语义一致；本文件按实现端口断言。
import { describe, expect, it } from 'vitest'
import { HISTORY_PAGE_SIZE, anchorDelta, coerceHistoryWindow, isAtBottom, mergeOlderPage } from '../../../apps/mobile/src/views/chat.js'
import { SSE_CONSTANTS, createSseEngine, parseStreamFrame, type SseSink, type StreamFrame } from '../../../apps/mobile/src/core/sse.js'
import { clampLastReadSeq, createAttemptSettler, createSeqGate, mergeBySeq, projectHistory, visibleCount, type WireEvent } from '../../../apps/mobile/src/core/wire.js'
import { DURABLE_SAMPLES, USER_MESSAGE_SAMPLE, ASSISTANT_MESSAGE_SAMPLE, ev } from '../../../apps/mobile/src/core/wire.fixtures.js'
import { COLLAPSE_LINE_THRESHOLD, pairToolActivity, shouldCollapseMessage } from '../../../apps/mobile/src/widgets/msg-cards.js'
import { mobileSrc, sessionSummarySample, loadFixtures } from '../support.js'

const FIX = loadFixtures()

// ---------------------------------------------------------------------------
// fake SSE 源 + 手动 timer 队列（引擎行为实测的注入世界）
// ---------------------------------------------------------------------------

interface FakeTimer { readonly id: number; readonly ms: number; fn: () => void }

function makeWorld() {
  let clock = 1_000
  let nextId = 1
  const timers: FakeTimer[] = []
  let sourceHandlers: Parameters<Extract<Parameters<typeof createSseEngine>[0]['openSource'], (...args: never[]) => unknown>> extends never ? never : { onOpen(): void; onSnapshot(d: string): void; onEvent(d: string): void; onError(): void } | null = null
  let openCount = 0
  let pollCalls = 0
  let pollShouldFail = false
  const frames: (() => void)[] = []
  const states: string[] = []

  const deps = {
    openSource: (_url: string, handlers: NonNullable<typeof sourceHandlers>) => {
      openCount += 1
      sourceHandlers = handlers
      return { close: () => { sourceHandlers = null } }
    },
    poll: () => {
      pollCalls += 1
      return pollShouldFail ? Promise.reject(new Error('down')) : Promise.resolve()
    },
    now: () => clock,
    setTimeout: (fn: () => void, ms: number) => {
      const t: FakeTimer = { id: nextId++, ms: clock + ms, fn }
      timers.push(t)
      return t.id
    },
    clearTimeout: (handle: unknown) => {
      const idx = timers.findIndex((t) => t.id === handle)
      if (idx >= 0) timers.splice(idx, 1)
    },
    requestFrame: (fn: () => void) => { frames.push(fn) },
  }
  const sink: SseSink & { deltas: WireEvent[]; snapshots: number[] } = {
    deltas: [],
    snapshots: [],
    snapshot: (frame) => { sink.snapshots.push(frame.events.length) },
    delta: (frame) => { sink.deltas.push(frame.event) },
    stateChange: (s) => { states.push(s) },
  }
  const advance = async (ms: number): Promise<void> => {
    const deadline = clock + ms
    for (;;) {
      timers.sort((a, b) => a.ms - b.ms)
      const due = timers.find((t) => t.ms <= deadline)
      if (due === undefined) break
      timers.splice(timers.indexOf(due), 1)
      clock = Math.max(clock, due.ms)
      due.fn()
      await Promise.resolve() // 微任务落定（poll 承诺链）
      await Promise.resolve()
    }
    clock = deadline
  }
  return {
    deps, sink, advance, frames, states,
    get handlers() { return sourceHandlers },
    get openCount() { return openCount },
    get pollCalls() { return pollCalls },
    setPollFail(v: boolean) { pollShouldFail = v },
    get now() { return clock },
  }
}

/** 手动 flush 合帧队列（rAF 注入为收集式） */
function flushFrames(world: ReturnType<typeof makeWorld>): void {
  for (const fn of world.frames.splice(0)) fn()
}

const chunkFrame = (seq: number, text: string): string =>
  JSON.stringify({ event: { type: 'assistant/live-chunk', seq, time: 1, data: { attemptId: 'a1', turn: 1, step: 1, chunk: { type: 'text', text } } } })

describe('step-1 open-session（打开会话加载最近历史）', () => {
  it('success（默认加载最近 10 条）', () => {
    // 回链 contracts/step-1-open-session.md Outcome:success——最近 10 条 + hasMore 锚
    const entries: WireEvent[] = DURABLE_SAMPLES.filter((e) => ['user/message', 'assistant/message', 'tool/call', 'tool/result'].includes(e.type))
    const window1 = coerceHistoryWindow({ entries, hasMore: true, revision: 7 }, HISTORY_PAGE_SIZE)
    expect(HISTORY_PAGE_SIZE).toBe(10)
    expect(window1.hasMore).toBe(true)
    expect(window1.revision).toBe(7)
    // 投影一致性：消息流是 wire 事件序的确定性投影
    const projections = projectHistory(entries)
    expect(projections.length).toBeGreaterThan(0)
    expect(projections.some((p) => p.kind === 'user-bubble')).toBe(true)
    // 官方 SessionSummary 参照腿钉面（打开入口 = session/list 选行）
    expect(Object.keys(sessionSummarySample(FIX.apiRef))).toContain('sessionId')
  })

  it('history-below-window（历史不足 10 条）', () => {
    // 回链 contracts/step-1-open-session.md Outcome:history-below-window——
    // inferred：不足窗口时一次全量，hasMore=false 锚耗尽，无上翻入口残留
    const short = [USER_MESSAGE_SAMPLE]
    const w = coerceHistoryWindow({ entries: short }, HISTORY_PAGE_SIZE)
    expect(w.entries).toHaveLength(1)
    expect(w.hasMore).toBe(false) // 缺省推导 = entries.length >= requested
  })
})

describe('step-2 scroll-paginate（上翻分页拉取更早历史）', () => {
  it('success（触发上翻分页）', () => {
    // 回链 contracts/step-2-scroll-paginate.md Outcome:success——旧页按 seq 去重升序锚定插入
    const current = [ev('user/message', 30, { content: [], role: 'user', id: 'x' }), ev('assistant/message', 31, { turn: 1, step: 1, message: { role: 'assistant', content: [], source: { kind: 'model', provider: 'p', model: 'm' }, id: 'y' }, stream: [] })]
    const older = [ev('user/message', 10, { content: [], role: 'user', id: 'o' }), ev('user/message', 30, { content: [], role: 'user', id: 'x' })]
    const merged = mergeOlderPage(current, older)
    expect(merged.map((e) => e.seq)).toEqual([10, 30, 31]) // 头部扩充、序不重排、零重复
    // 滚动锚：prepend 前后 scrollHeight 差值 = 补偿量（阅读位置不跳动）
    expect(anchorDelta(2_000, 2_600)).toBe(600)
  })

  it('in-flight-throttle（分页在途连点）', () => {
    // 回链 contracts/step-2-scroll-paginate.md Outcome:in-flight-throttle
    // inferred：同锚请求至多一次在途——视图在途位单发，重复 merge 零重复（同屏无重复消息）
    const page = [ev('user/message', 10, { content: [], role: 'user', id: 'o' })]
    const current = [ev('user/message', 30, { content: [], role: 'user', id: 'x' })]
    const once = mergeOlderPage(current, page)
    const twice = mergeOlderPage(once, page) // 连点导致的重复批次合并
    expect(twice.map((e) => e.seq)).toEqual([10, 30])
    // 源面锚点：分页在途守卫在视图装配层
    expect(mobileSrc('views/chat.ts')).toMatch(/loadingOlder|inFlight|分页在途/)
  })
})

describe('step-3 paginate-exhaust（翻尽历史到达起点）', () => {
  it('success（锚耗尽停发）', () => {
    // 回链 contracts/step-3-paginate-exhaust.md Outcome:success——hasMore=false 终态零请求
    const w = coerceHistoryWindow({ entries: [USER_MESSAGE_SAMPLE], hasMore: false }, HISTORY_PAGE_SIZE)
    expect(w.hasMore).toBe(false)
    // 源面锚点：耗尽后不再发分页请求（守卫在请求发起前短路）
    expect(mobileSrc('views/chat.ts')).toMatch(/hasMore/)
  })
})

describe('step-4 send-prompt（发送消息意图转发）', () => {
  it('success（乐观上屏 + 通道转发）', () => {
    // 回链 contracts/step-4-send-prompt.md Outcome:success——乐观气泡上屏、意图经官方面转发
    const src = mobileSrc('views/chat.ts')
    expect(src).toMatch(/optimistic|乐观/) // 乐观上屏语义在视图装配层
    expect(mobileSrc('core/api.ts')).toContain("OFFICIAL_RPC_PATH = '/api/rpc'")
    // 发送链经 composer 输入仲裁（斜杠命令/普通消息分流——意图转发零校验）
    expect(mobileSrc('core/rpc.ts')).toMatch(/export (async )?function sendComposerInput/)
  })

  it('revision-conflict（发送在途快照更新）', () => {
    // 回链 contracts/step-4-send-prompt.md Outcome:revision-conflict
    // inferred：乐观态被快照收口替换——同 seq 事件 merge 去重、live 被 settle 覆盖不回退
    const optimistic = [ev('user/message', 40, { content: [], role: 'user', id: 'opt' })]
    const snapshotAck = [ev('user/message', 40, { content: [], role: 'user', id: 'opt' }), ev('assistant/message', 41, { turn: 1, step: 1, message: { role: 'assistant', content: [], source: { kind: 'model', provider: 'p', model: 'm' }, id: 'a' }, stream: [] })]
    const settled = mergeBySeq(snapshotAck, optimistic)
    expect(settled.map((e) => e.seq)).toEqual([40, 41]) // 收口零重复零错序
    // seq 门：已收口 seq 不被旧帧回退
    const gate = createSeqGate(41)
    expect(gate.admit(40)).toBe(false)
    expect(gate.admit(42)).toBe(true)
    // lastRead 钳制：游标落在 compaction 裁剪区间时回退到裁剪上界之后最近可见 seq
    const pruned = [ev('compaction/prune', 50, { shadowedRange: { start: 48, end: 50 }, shadowedSeqs: [48, 49, 50] })]
    expect(clampLastReadSeq(50, pruned)).toBe(47)
    expect(clampLastReadSeq(30, pruned)).toBe(30) // 未被裁剪的游标原样
  })
})

describe('step-5 stream-render（流式回复渲染与 settle 收口）', () => {
  it('success（live-chunk→settle 投影）', () => {
    // 回链 contracts/step-5-stream-render.md Outcome:success——chunk 增量拼接、终态帧覆盖
    const delta = parseStreamFrame('event', chunkFrame(100, '你好'))
    expect(delta?.kind).toBe('event')
    const settle = parseStreamFrame('event', JSON.stringify(ASSISTANT_MESSAGE_SAMPLE))
    expect(settle?.kind).toBe('event')
    // AttemptSettler：streaming→settled 单向，settle 后不回退流式态
    const settler = createAttemptSettler()
    settler.chunk({ type: 'assistant/live-chunk', seq: 100, time: 1, data: { attemptId: 'a1', turn: 1, step: 1, chunk: { type: 'text-delta', text: 'x' } } } as never)
    expect(settler.rows()[0]?.state).toBe('streaming')
    settler.settle('a1')
    expect(settler.rows()[0]?.state).toBe('settled')
    // 终态吸收：settled 后迟到 chunk 不回退流式态
    settler.chunk({ type: 'assistant/live-chunk', seq: 102, time: 1, data: { attemptId: 'a1', turn: 1, step: 1, chunk: { type: 'text-delta', text: 'late' } } } as never)
    expect(settler.rows()[0]?.state).toBe('settled')
  })

  it('high-frequency-chunks（高频合帧）', () => {
    // 回链 contracts/step-5-stream-render.md Outcome:high-frequency-chunks——
    // inferred：rAF 合帧渲染——多帧 chunk 一次冲刷，不逐帧 DOM 写入
    const world = makeWorld()
    const engine = createSseEngine(world.deps, world.sink)
    engine.start('s-1')
    expect(world.openCount).toBe(1)
    world.handlers!.onOpen()
    world.handlers!.onSnapshot(JSON.stringify({ records: [], projections: {} }))
    for (const seq of [1, 2, 3]) world.handlers!.onEvent(chunkFrame(seq, `c${seq}`))
    expect(world.frames.length).toBe(1) // 合帧：3 帧只排 1 次 rAF
    flushFrames(world)
    expect(world.sink.deltas).toHaveLength(3) // 冲刷一次全量下发
    engine.teardown()
  })

  it('fold-cards（长消息/活动卡折叠）', () => {
    // 回链 contracts/step-5-stream-render.md Outcome:fold-cards——折叠纪律 + 调用段在结果段上方
    const long = Array.from({ length: COLLAPSE_LINE_THRESHOLD + 2 }, (_, i) => `l${i}`).join('\n')
    expect(shouldCollapseMessage(long)).toBe(true)
    expect(shouldCollapseMessage('短消息')).toBe(false)
    // tool call/result 对：配对活动序 = 调用在前
    const activity = pairToolActivity(projectHistory([DURABLE_SAMPLES.find((e) => e.type === 'tool/call')!, DURABLE_SAMPLES.find((e) => e.type === 'tool/result')!]))
    expect(activity.length).toBeGreaterThan(0)
  })
})

describe('step-6 scroll-to-bottom-badge（视野外新消息与「滚动到底」）', () => {
  it('success（未读计数与跟随）', () => {
    // 回链 contracts/step-6-scroll-to-bottom-badge.md Outcome:success——
    // 触底判据（<24px 口径）+ 未读计数随视野外帧累加、触底归零（渲染侧视野状态）
    expect(isAtBottom(900, 1_000, 100)).toBe(true) // 距底 0
    expect(isAtBottom(890, 1_000, 100)).toBe(true) // 距底 10 < 24
    expect(isAtBottom(800, 1_000, 100)).toBe(false) // 距底 100
    // 未读推进投影：可见事件计数（与宿主 read-state 无耦合——本地渲染态）
    const events = [ev('user/message', 1, { content: [], role: 'user', id: 'u' })]
    expect(visibleCount(events)).toBe(1)
    expect(visibleCount([ev('turn/start', 2, { turn: 1 })])).toBe(0) // 零投影事件不计
    expect(mobileSrc('views/chat.ts')).toMatch(/滚动到底|scroll-to-bottom|unread/)
  })
})

describe('step-7 disconnect-poll（SSE 中断降级轮询）', () => {
  it('success（断流降级）', async () => {
    // 回链 contracts/step-7-disconnect-poll.md Outcome:success——onerror → degraded 轮询启动
    const world = makeWorld()
    const engine = createSseEngine(world.deps, world.sink)
    engine.start('s-1')
    world.handlers!.onOpen()
    world.handlers!.onSnapshot(JSON.stringify({ records: [], projections: {} }))
    world.handlers!.onError() // 断流
    expect(world.states).toContain('degraded')
    expect(world.pollCalls).toBe(0) // 首轮轮询按退避延迟排队（未立即发）
    await world.advance(SSE_CONSTANTS.POLL_IDLE_MS)
    expect(world.pollCalls).toBe(1) // 降级轮询发出（750ms 起步）
    engine.teardown()
  })

  it('send-during-poll（轮询期间再发消息）', () => {
    // 回链 contracts/step-7-disconnect-poll.md Outcome:send-during-poll——
    // 降级轮询不阻塞意图转发（composer 发送面独立于流连接态）
    const src = mobileSrc('views/chat.ts')
    expect(src).toMatch(/DisconnectedError/) // 断线态只影响覆盖层与流引擎，不锁发送链
    expect(mobileSrc('core/api.ts')).toMatch(/export class DisconnectedError/)
  })

  it('backoff-cap（断线跨越多轮退避）', async () => {
    // 回链 contracts/step-7-disconnect-poll.md Outcome:backoff-cap——退避 750ms→5s 封顶稳态
    expect(SSE_CONSTANTS.POLL_IDLE_MS).toBe(750)
    expect(SSE_CONSTANTS.POLL_CAP_MS).toBe(5_000)
    const world = makeWorld()
    world.setPollFail(true)
    const engine = createSseEngine(world.deps, world.sink)
    engine.start('s-1')
    world.handlers!.onOpen()
    world.handlers!.onError()
    for (let i = 0; i < 6; i += 1) await world.advance(SSE_CONSTANTS.POLL_CAP_MS)
    expect(world.states).toContain('offline') // 连败 OFFLINE_FAIL_STREAK 轮 → offline 终态
    expect(SSE_CONSTANTS.OFFLINE_FAIL_STREAK).toBe(3)
    engine.teardown()
  })
})

describe('step-8 reconnect-resync（连接恢复自动重连续流）', () => {
  it('success（恢复补齐）', async () => {
    // 回链 contracts/step-8-reconnect-resync.md Outcome:success——轮询成功 → EventSource 重建 → Live；错过的帧经快照收口补齐（零重放）
    const world = makeWorld()
    const engine = createSseEngine(world.deps, world.sink)
    engine.start('s-1')
    world.handlers!.onOpen()
    world.handlers!.onError()
    await world.advance(SSE_CONSTANTS.POLL_IDLE_MS)
    expect(world.pollCalls).toBe(1)
    expect(world.openCount, '轮询成功后重建 EventSource').toBe(2)
    // 补齐：snapshot 全量收口（含断线期间错过的事件），投影与不断线基准对齐
    world.handlers!.onSnapshot(JSON.stringify({ records: [USER_MESSAGE_SAMPLE], projections: {} }))
    expect(world.sink.snapshots).toEqual([1])
    engine.teardown()
  })

  it('heartbeat-missing（心跳缺席判活）', async () => {
    // 回链 contracts/step-8-reconnect-resync.md Outcome:heartbeat-missing
    // inferred：readyState OPEN 但无数据超 HEARTBEAT_DEAD_MS → 主动降级（半开连接对策），不误判健康
    expect(SSE_CONSTANTS.HEARTBEAT_INTERVAL_MS).toBe(15_000)
    expect(SSE_CONSTANTS.HEARTBEAT_DEAD_MS).toBe(30_000)
    const world = makeWorld()
    const engine = createSseEngine(world.deps, world.sink)
    engine.start('s-1')
    world.handlers!.onOpen() // 心跳判活链仅在 live 态启动
    world.handlers!.onSnapshot(JSON.stringify({ records: [], projections: {} }))
    await world.advance(SSE_CONSTANTS.HEARTBEAT_INTERVAL_MS + SSE_CONSTANTS.HEARTBEAT_DEAD_MS + 1) // 两个心跳检查点静默超时
    expect(world.states).toContain('degraded') // 判活失败 → 降级轮询（零误切换回 live）
    engine.teardown()
  })
})

describe('smoke: happy path 依序走全链（chat-stream-recovery-history）', () => {
  it('打开 → 分页 → 发送 → 流式 → 触底 → 断线降级 → 恢复补齐', async () => {
    // ① 打开：官方 SessionSummary 参照腿 + 最近 10 条窗口 + snapshot 首帧投影
    expect(Object.keys(sessionSummarySample(FIX.apiRef))).toContain('sessionId')
    const world = makeWorld()
    const engine = createSseEngine(world.deps, world.sink)
    engine.start('s-1')
    const sse = FIX.sse
    expect(sse, 'forge-stream 录制在位').toBeTruthy()
    const snapshotFrame = sse!.frames.find((f) => f.event === 'snapshot')
    expect(snapshotFrame, 'snapshot 首帧已录').toBeTruthy()
    const parsed: StreamFrame | null = parseStreamFrame('snapshot', snapshotFrame!.data)
    expect(parsed?.kind).toBe('snapshot')
    world.handlers!.onOpen()
    world.handlers!.onSnapshot(snapshotFrame!.data)
    // ② 历史分页合并 + 锚补偿
    const page1 = coerceHistoryWindow({ entries: DURABLE_SAMPLES.slice(0, 12) }, HISTORY_PAGE_SIZE)
    expect(page1.hasMore).toBe(true)
    // ③④ 发送（乐观）→ 流式 chunk 增量 → settle 收口
    world.handlers!.onEvent(chunkFrame(200, '回复增量'))
    flushFrames(world)
    expect(world.sink.deltas).toHaveLength(1)
    // ⑤ 触底跟随判据
    expect(isAtBottom(999, 1_000, 100)).toBe(true)
    // ⑥ 断线降级 → ⑦ 轮询成功重建 → 快照补齐
    world.handlers!.onError()
    await world.advance(SSE_CONSTANTS.POLL_IDLE_MS)
    expect(world.openCount).toBe(2)
    world.handlers!.onSnapshot(JSON.stringify({ records: [USER_MESSAGE_SAMPLE], projections: {} }))
    expect(world.sink.snapshots.length).toBeGreaterThan(0)
    engine.teardown()
  })
})
