/**
 * chat 对话主视图（根 `#/chat/:sessionId`）——只做装配：
 * 顶栏 + 消息区（唯一滚动面）+ 滚动到底（未读计数）+ composer 底行 +
 * 断线/重新配对覆盖层 + 历史分页（默认 10 条，hasMore 驱动、滚动锚保持）。
 *
 * 纯逻辑面（单测主战场）：HistoryWindow 收敛 / 分页合并 / 滚动锚差值 / 未读推进。
 */
import type { OfficialApi } from '../core/api.ts'
import { DisconnectedError } from '../core/api.ts'
import { sendComposerInput } from '../core/rpc.ts'
import { type SseSink, type SseState } from '../core/sse.ts'
import {
  createAttemptSettler,
  mergeBySeq,
  projectHistory,
  type Projection,
  type WireEvent,
} from '../core/wire.ts'
import {
  createComposer,
  type ComposerHandle,
} from '../widgets/composer.ts'
import {
  degradedNarrativeSeqs,
  el,
  ensureIconSprite,
  isReasoningOnly,
  pairToolActivity,
  renderCard,
  renderThinkCard,
  renderToolCard,
} from '../widgets/msg-cards.ts'

// ---------------------------------------------------------------------------
// 纯函数：历史分页
// ---------------------------------------------------------------------------

export const HISTORY_PAGE_SIZE = 10

// ---------------------------------------------------------------------------
// 纯函数：turn 分段折叠（历史 turn 露「输入+回复」，思考/工具折进可展开组；
// 进行中 turn 全展开——用户裁决 2026-10-23）
// ---------------------------------------------------------------------------

/** turn 段：起点 = user-bubble（首段可为载入尾部历史）；活动 = 思考/工具调用。 */
export interface TurnSegment {
  /** 段首投影下标。 */
  readonly start: number
  /** true = 段内活动全部落在最后一个 turn/end 之前（历史 turn 完成）→ 活动折进组。 */
  readonly collapsed: boolean
  /** 段内活动投影 seq 序列（原位顺序）。 */
  readonly activitySeqs: readonly number[]
}

const isActivityProjection = (projection: Projection): boolean =>
  projection.kind === 'tool-call' || isReasoningOnly(projection)

/** 折叠组摘要元信息（桌面端 turn 头对齐：状态 + 步数 + 耗时）。 */
export interface TurnFoldMeta {
  /** 桌面端同语义状态文案（折叠 ⇒ turn 已完结）。 */
  readonly status: string
  /** 步数（step/end 计数；缺席回退活动项数）。 */
  readonly steps: number
  /** turn 耗时 ms（turn/start→turn/end；事件缺席/负值 = 0 不展示）。 */
  readonly durationMs: number
}

/** turn 摘要元信息推断（官方 durable 边界）：turn/end = 完结；步数 = 段内 step/end 数，
 *  无 step 事件回退活动项数；耗时 = 最近 turn/start→匹配 turn/end 的 time 差。 */
export function turnFoldMeta(entries: readonly WireEvent[], activitySeqs: readonly number[]): TurnFoldMeta {
  if (activitySeqs.length === 0) return { status: '已完成', steps: 0, durationMs: 0 }
  const minActivity = Math.min(...activitySeqs)
  const maxActivity = Math.max(...activitySeqs)
  const turnEnd = entries.find((entry) => entry.type === 'turn/end' && entry.seq > maxActivity)
  const steps =
    entries.filter((entry) => entry.type === 'step/end' && entry.seq > minActivity && (turnEnd === undefined || entry.seq <= turnEnd.seq))
      .length || activitySeqs.length
  let durationMs = 0
  if (turnEnd !== undefined) {
    let turnStartSeq = -1
    for (const entry of entries) {
      if (entry.seq >= turnEnd.seq) break
      if (entry.type === 'turn/start') turnStartSeq = entry.seq
    }
    const turnStart = entries.find((entry) => entry.seq === turnStartSeq)
    if (turnStart !== undefined) {
      const delta = turnEnd.time - turnStart.time
      if (Number.isFinite(delta) && delta > 0) durationMs = delta
    }
  }
  return { status: '已完成', steps, durationMs }
}

/** 桌面端 turn 头同语义时长文案：「2 分 25 秒」/「45 秒」。 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`
}

/** 投影流 → turn 段（user-bubble 分段）。折叠判定 = 官方 turn/end 边界（v2——用户裁决
 *  2026-10-23 迭代：尾随活动/打断 turn 的旧「回复后置」启发式漏折叠，real 信号是
 *  durable log 的 turn/end 事件）：活动 seq 全部 < lastTurnEndSeq = 历史折叠；
 *  之后（或无 turn/end——中断 turn）= 进行中展开。 */
export function partitionTurnSegments(
  projections: readonly Projection[],
  lastTurnEndSeq: number,
): readonly TurnSegment[] {
  const segments: TurnSegment[] = []
  let start = 0
  let activity: number[] = []
  const flush = (end: number): void => {
    if (end > start) {
      const maxActivitySeq = activity.length > 0 ? Math.max(...activity) : -1
      const completed = lastTurnEndSeq >= 0 && maxActivitySeq < lastTurnEndSeq
      segments.push({ start, collapsed: activity.length > 0 && completed, activitySeqs: activity })
    }
    start = end
    activity = []
  }
  for (let index = 0; index < projections.length; index++) {
    const projection = projections[index]!
    if (projection.kind === 'user-bubble') {
      flush(index)
      continue
    }
    if (isActivityProjection(projection)) {
      activity.push(projection.seq)
    }
  }
  flush(projections.length)
  return segments
}

export interface HistoryWindow {
  readonly entries: readonly WireEvent[]
  readonly hasMore: boolean
  readonly revision?: number
}

/** 官方 session.history 窗口形状收敛（缺字段 fail-soft 推导）。 */
export function coerceHistoryWindow(raw: unknown, requested: number): HistoryWindow {
  const frame = (raw ?? {}) as {
    entries?: readonly WireEvent[]
    messages?: readonly WireEvent[]
    hasMore?: boolean
    revision?: number
  }
  const entries = frame.entries ?? frame.messages ?? []
  return {
    entries,
    hasMore: frame.hasMore ?? entries.length >= requested,
    ...(frame.revision === undefined ? {} : { revision: frame.revision }),
  }
}

/** 上翻分页合并：旧页与当前窗按 seq 去重升序（滚动锚由 anchorDelta 恢复）。 */
export function mergeOlderPage(current: readonly WireEvent[], olderPage: readonly WireEvent[]): WireEvent[] {
  return mergeBySeq(olderPage, current)
}

/** prepend 前后 scrollHeight 差值 = 需补偿的 scrollTop（滚动锚保持）。 */
export function anchorDelta(beforeHeight: number, afterHeight: number): number {
  return afterHeight - beforeHeight
}

/** 触底判据：距底 < 24px（mockup 滚动到底图例口径）。 */
export function isAtBottom(scrollTop: number, scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight - scrollTop - clientHeight < 24
}

// ---------------------------------------------------------------------------
// 流引擎端口（单测可注入 fake）
// ---------------------------------------------------------------------------

export interface StreamEngine {
  start(sessionId: string): void
  teardown(): void
  retry(): void
  setPollActive(active: boolean): void
}

// 用户裁决 2026-10-22（双域统一代理化）：defaultStreamEngine（/api/session/stream SSE +
// /api/rpc 轮询）退役——双域皆被 api-guard 403 的死面；装配侧统一 forge-stream 镜像帧引擎
//（main.ts createForgeStreamEngine）。

// ---------------------------------------------------------------------------
// 视图装配
// ---------------------------------------------------------------------------

export interface ChatDeps {
  readonly api: OfficialApi
  /** 已读游标写缝（bug 1dd4b437——host read-state 单点；装配层注入，缺席静默跳过）。 */
  readonly writeReadState?: (sessionId: string, seq: number) => void
  readonly createEngine: (sessionId: string, sink: SseSink) => StreamEngine
  readonly onOpenDrawer?: () => void
  readonly onOpenHero?: () => void
  readonly onOpenSettings?: () => void
  readonly onOpenDoc?: (path: string) => void
  /** 文档卡 size 回填（forge:proxy/file manifest——装配层注入）。 */
  readonly resolveDocSize?: (path: string) => Promise<number | undefined>
  readonly onWorktreeTap?: () => void
  readonly mode?: string
  readonly worktree?: string
  /** 隧道模式位（1.31——覆盖层文案区分「隧道模式（降级）」/ LAN 断线文案）。 */
  readonly tunnel?: boolean
  /** 会话标题回退（bug：LLM 标题在官方 title 投影不在事件——装配侧自 grouped 注入；事件面优先）。 */
  readonly fallbackTitleRef?: { current: string }
  /** composer 唤醒候选源（feature：/ 命令 + @ 文件 mention——缺席 = 不唤醒）。 */
  readonly suggest?: (kind: '/' | '@') => Promise<readonly { insert: string; label: string; description?: string }[]>
}

type OverlayMode = 'hidden' | 'degraded' | 'offline' | 'pairing'

interface ChatState {
  entries: WireEvent[]
  hasMore: boolean
  page: number
  tailSeq: number
  unread: number
  atBottom: boolean
  loadingOlder: boolean
  overlay: OverlayMode
}

export function createChatView(sessionId: string, deps: ChatDeps): HTMLElement {
  const root = el('div', 'phone-root')
  ensureIconSprite(root)

  // ---- 顶栏 ----
  const topbar = el('div', 'topbar')
  const menuButton = el('button', 'iconbtn')
  menuButton.innerHTML = '<svg class="ic"><use href="#i-menu"/></svg><span class="dot-badge" hidden></span>'
  menuButton.addEventListener('click', () => deps.onOpenDrawer?.())
  const title = el('div', 'title', deps.fallbackTitleRef?.current !== undefined && deps.fallbackTitleRef.current !== '' ? deps.fallbackTitleRef.current : '…')
  const newButton = el('button', 'iconbtn')
  newButton.innerHTML = '<svg class="ic"><use href="#i-new"/></svg>'
  newButton.addEventListener('click', () => deps.onOpenHero?.())
  topbar.append(menuButton, title, newButton)

  // ---- 消息区（唯一滚动面）----
  const view = el('div', 'view')

  // ---- 滚动到底按钮（未读徽标）----
  const jump = el('button', 'jump')
  jump.innerHTML = '<svg class="ic"><use href="#i-down"/></svg>'
  const jumpCount = el('span', 'n')
  jumpCount.hidden = true
  jump.appendChild(jumpCount)
  jump.addEventListener('click', () => {
    state.unread = 0
    syncUnread()
    scrollToBottom()
    writeReadState()
  })

  // ---- 覆盖层（degraded 轻提示 / offline 重试 / 401 全屏重新配对）----
  const overlay = el('div', 'conn-overlay')
  overlay.hidden = true

  const state: ChatState = {
    entries: [],
    hasMore: false,
    page: 1,
    tailSeq: -1,
    unread: 0,
    atBottom: true,
    loadingOlder: false,
    overlay: 'hidden',
  }
  const settler = createAttemptSettler()

  const composer: ComposerHandle = createComposer({
    mode: deps.mode ?? '远征',
    worktree: deps.worktree ?? '',
    modeReadOnly: true,
    suggest: deps.suggest,
    onSend: (text) => void send(text),
    onSettings: () => deps.onOpenSettings?.(),
    onWorktreeTap: () => deps.onWorktreeTap?.(),
  })
  // bug 33b70446（用户裁决 2026-10-22 多次重申）：非 git 项目/未注入 worktree 标签 =
  // 分支控制完全隐藏——chip 初始可见且本视图从不调 setWorktreeVisible，空标签芯片恒挂
  composer.setWorktreeVisible((deps.worktree ?? '') !== '')

  root.append(topbar, view, jump, composer.root, overlay)

  // ---- 渲染 ----
  function renderTurnFold(seg: TurnSegment, bySeq: Map<number, Projection>, activityMap: Map<string, ReturnType<typeof pairToolActivity>[number]>): HTMLElement {
    // 折叠组：段内思考/工具卡原序收入；摘要行 = 桌面端 turn 头同语义（状态·步数·耗时 + 分隔线）
    const meta = turnFoldMeta(state.entries, seg.activitySeqs)
    const details = el('details', 'turn-fold')
    const summary = el('summary')
    const label = meta.durationMs > 0
      ? `${meta.status} · ${meta.steps} 步 · 用时 ${formatDuration(meta.durationMs)}`
      : `${meta.status} · ${meta.steps} 步`
    summary.appendChild(el('span', 'fold-label', label))
    summary.appendChild(el('span', 'fold-line'))
    details.appendChild(summary)
    for (const seq of seg.activitySeqs) {
      const projection = bySeq.get(seq)
      if (projection === undefined) continue
      if (projection.kind === 'tool-call') {
        const activity = activityMap.get(projection.callId)
        if (activity !== undefined) details.appendChild(renderToolCard(activity))
      } else if (isReasoningOnly(projection)) {
        details.appendChild(renderThinkCard(projection.reasoning))
      }
    }
    return details
  }

  function render(): void {
    const projections = projectHistory(state.entries)
    const activities = pairToolActivity(projections)
    const activityByCallId = new Map(activities.map((activity) => [activity.call.callId, activity]))
    const seenCalls = new Set<string>()
    const degradedNarratives = degradedNarrativeSeqs(projections)
    // turn 分段折叠（用户裁决 2026-10-23）：折叠段的活动卡原序收入组，首活动位落组；
    // 边界 = 原始事件流的最后一个 turn/end（v2——官方 turn 边界，尾随活动/打断也正确折叠）
    let lastTurnEndSeq = -1
    for (const entry of state.entries) {
      if (entry.type === 'turn/end' && entry.seq > lastTurnEndSeq) lastTurnEndSeq = entry.seq
    }
    const segments = partitionTurnSegments(projections, lastTurnEndSeq)
    const segBySeq = new Map<number, { seg: TurnSegment; first: boolean }>()
    for (const seg of segments) {
      for (let index = 0; index < seg.activitySeqs.length; index++) {
        segBySeq.set(seg.activitySeqs[index]!, { seg, first: index === 0 })
      }
    }
    const foldEmitted = new Set<number>()
    const bySeq = new Map(projections.map((projection) => [projection.seq, projection] as const))
    view.textContent = ''
    for (const projection of projections) {
      if (projection.kind === 'tool-result') continue
      const segInfo = segBySeq.get(projection.seq)
      if (segInfo?.seg.collapsed === true) {
        if (!foldEmitted.has(segInfo.seg.start)) {
          foldEmitted.add(segInfo.seg.start)
          view.appendChild(renderTurnFold(segInfo.seg, bySeq, activityByCallId))
        }
        continue
      }
      if (projection.kind === 'tool-call') {
        if (seenCalls.has(projection.callId)) continue
        seenCalls.add(projection.callId)
        const activity = activityByCallId.get(projection.callId)
        if (activity !== undefined) view.appendChild(renderToolCard(activity))
        continue
      }
      if (isReasoningOnly(projection)) {
        view.appendChild(renderThinkCard(projection.reasoning))
        continue
      }
      view.appendChild(
        renderCard(projection, {
          onOpenDoc: deps.onOpenDoc,
          resolveDocSize: deps.resolveDocSize,
          ...(projection.kind === 'loop-narrative' && degradedNarratives.has(projection.seq)
            ? { degradedNarrative: true }
            : {}),
        }),
      )
    }
    // 流式瞬态行（settler 子状态机）
    let streaming = false
    for (const row of settler.rows()) {
      if (row.state === 'settled') continue
      streaming = row.state === 'streaming'
      if (row.text !== '' || row.reasoning !== '') {
        if (row.reasoning !== '' && row.text === '') view.appendChild(renderThinkCard(row.reasoning))
        else
          view.appendChild(
            el('div', `msg agent${row.state === 'abandoned' ? ' interrupted' : ''}`, row.text),
          )
      }
      if (row.state === 'abandoned') view.lastElementChild?.appendChild(el('span', 'interrupted-line', '— 已中断 —'))
      else if (streaming) view.lastElementChild?.appendChild(el('span', 'streaming'))
    }
    if (streaming) view.appendChild(el('div', undefined)).appendChild(el('span', 'turn-status', 'Deep diving...'))
    const wasAtBottom = state.atBottom
    if (wasAtBottom) scrollToBottom()
  }

  function scrollToBottom(): void {
    view.scrollTop = view.scrollHeight
  }

  function syncUnread(): void {
    jumpCount.hidden = state.unread === 0
    jumpCount.textContent = String(state.unread)
    jump.hidden = state.atBottom && state.unread === 0
  }

  function syncOverlay(): void {
    overlay.hidden = state.overlay === 'hidden'
    overlay.className = `conn-overlay ${state.overlay}`
    overlay.textContent = ''
    if (state.overlay === 'degraded')
      overlay.appendChild(el('span', undefined, deps.tunnel === true ? '隧道模式（降级），正在重连…' : '连接不稳定，正在重连…'))
    if (state.overlay === 'offline') {
      overlay.appendChild(el('span', undefined, '连接已断开'))
      const retry = el('button', 'retry-btn', '重试')
      retry.addEventListener('click', () => engine.retry())
      overlay.appendChild(retry)
    }
    if (state.overlay === 'pairing') overlay.appendChild(el('span', undefined, '会话已过期，请重新配对'))
    composer.setStale(state.overlay !== 'hidden')
  }

  function setOverlay(mode: OverlayMode): void {
    state.overlay = mode
    syncOverlay()
  }

  function adoptEntries(entries: readonly WireEvent[], countUnread: boolean): void {
    const previousTail = state.tailSeq
    state.entries = mergeBySeq(state.entries, entries)
    state.tailSeq = state.entries.reduce((max, event) => Math.max(max, event.seq), state.tailSeq)
    if (countUnread && !state.atBottom) {
      const fresh = state.entries.filter((event) => event.seq > previousTail)
      state.unread += fresh.length
    }
    render()
    syncUnread()
  }

  // ---- 历史（默认最近 10 条 + 上翻分页）----
  async function loadInitial(): Promise<void> {
    const raw = await deps.api.history(sessionId, HISTORY_PAGE_SIZE)
    const window = coerceHistoryWindow(raw, HISTORY_PAGE_SIZE)
    state.page = 1
    state.entries = []
    state.hasMore = window.hasMore
    state.entries = mergeBySeq(state.entries, window.entries)
    state.tailSeq = state.entries.reduce((max, event) => Math.max(max, event.seq), -1)
    title.textContent = deriveTitle(state.entries)
    render()
    scrollToBottom()
    // bug bee0845e：打开即已读（与抽屉行点击同语义）——非抽屉径（hero/深链）进 chat
    // 也写 host 已读游标，抽屉徽标不再残留全量未读
    writeReadState()
  }

  async function loadOlder(): Promise<void> {
    if (!state.hasMore || state.loadingOlder) return
    state.loadingOlder = true
    try {
      state.page += 1
      const requested = HISTORY_PAGE_SIZE * state.page
      const raw = await deps.api.history(sessionId, requested)
      const window = coerceHistoryWindow(raw, requested)
      const beforeHeight = view.scrollHeight
      const prevScrollTop = view.scrollTop
      const before = state.entries
      state.entries = mergeOlderPage(state.entries, window.entries)
      const gained = state.entries.length - before.length
      state.hasMore = window.hasMore && gained > 0
      render()
      view.scrollTop = prevScrollTop + anchorDelta(beforeHeight, view.scrollHeight)
    } finally {
      state.loadingOlder = false
    }
  }

  view.addEventListener('scroll', () => {
    state.atBottom = isAtBottom(view.scrollTop, view.scrollHeight, view.clientHeight)
    if (state.atBottom && state.unread > 0) {
      state.unread = 0
      syncUnread()
      writeReadState()
    }
    if (view.scrollTop === 0) void loadOlder()
  })

  /** 触底/回底写已读游标（显示层乐观归零；host 单点持久——bug 1dd4b437）。 */
  function writeReadState(): void {
    if (state.tailSeq < 0) return
    deps.writeReadState?.(sessionId, state.tailSeq)
  }

  // bug 会话标题（用户裁决 2026-10-22）：title 回退链 = 事件 session/title → 官方 title
  // 投影（抽屉同行显示源——LLM 标题在投影不在事件）→ 「会话」。投影值经 titleRef 装配侧注入。
  function deriveTitle(entries: readonly WireEvent[]): string {
    for (let index = entries.length - 1; index >= 0; index--) {
      const event = entries[index]
      if (event?.type === 'session/title') {
        return (event.data as { title?: string }).title ?? '…'
      }
    }
    return deps.fallbackTitleRef?.current !== undefined && deps.fallbackTitleRef.current !== ''
      ? deps.fallbackTitleRef.current
      : '会话'
  }

  // ---- 发送（斜杠仲裁单一发送路径）----
  // bug 1eb525b7 后继（裁决 2026-10-22）：prompt 模式按 agent 运行态——运行中 steer 抢占 /
  // 空闲 queue followup 即启（官方 steer 对空闲 agent 恒拒绝）。运行态自活动事件外推。
  let agentRunning = false
  const trackRunning = (events: readonly WireEvent[]): void => {
    for (const event of events) {
      if (event.type === 'api-session/activity') {
        agentRunning = (event.data as { running?: unknown } | null)?.running === true
      }
    }
  }
  async function send(text: string): Promise<void> {
    composer.setSending(true)
    try {
      await sendComposerInput(text, { api: deps.api, sessionId, catalog: [], promptMode: agentRunning ? 'steer' : 'queue' })
    } catch (error) {
      if (error instanceof DisconnectedError) setOverlay('pairing')
    } finally {
      composer.setSending(false)
    }
  }

  // ---- SSE ----
  const sink: SseSink = {
    snapshot(frame) {
      adoptEntries(frame.events, false)
      trackRunning(frame.events)
      title.textContent = deriveTitle(state.entries)
    },
    delta(frame) {
      const event = frame.event as WireEvent & { kind?: string; attemptId?: string }
      if (event.type === 'assistant/live-chunk' && 'attemptId' in (event.data as object)) {
        settler.chunk(event as Parameters<typeof settler.chunk>[0])
        render()
        return
      }
      if (event.kind === 'settle-assistant') {
        settler.settle(event.attemptId ?? '')
        render()
        return
      }
      if (event.kind === 'abandoned') {
        settler.abandon(event.attemptId ?? '')
        render()
        return
      }
      adoptEntries([event], true)
      trackRunning([event])
      title.textContent = deriveTitle(state.entries)
    },
    stateChange(next: SseState) {
      setOverlay(next === 'degraded' ? 'degraded' : next === 'offline' ? 'offline' : 'hidden')
      engine.setPollActive(true)
    },
  }
  const engine = deps.createEngine(sessionId, sink)
  engine.start(sessionId)

  void loadInitial().catch(() => setOverlay('pairing'))

  return root
}

export type { Projection }
