/**
 * chat 对话主视图（根 `#/chat/:sessionId`）——只做装配：
 * 顶栏 + 消息区（唯一滚动面）+ 滚动到底（未读计数）+ composer 底行 +
 * 断线/重新配对覆盖层 + 历史分页（默认 10 条，hasMore 驱动、滚动锚保持）。
 *
 * 纯逻辑面（单测主战场）：HistoryWindow 收敛 / 分页合并 / 滚动锚差值 / 未读推进。
 */
import type { OfficialApi } from '../core/api.ts'
import { DisconnectedError } from '../core/api.ts'
import { readCursorKey, writeReadCursor, type KeyValueStore } from '../core/read-cursor.ts'
import { sendComposerInput } from '../core/rpc.ts'
import { createSseEngine, type SseSink, type SseState } from '../core/sse.ts'
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

export function defaultStreamEngine(sessionId: string, sink: SseSink): StreamEngine {
  return createSseEngine(
    {
      openSource: (url, handlers) => {
        const source = new EventSource(url)
        source.addEventListener('snapshot', (event) => handlers.onSnapshot((event as MessageEvent).data as string))
        source.addEventListener('event', (event) => handlers.onEvent((event as MessageEvent).data as string))
        source.onopen = () => handlers.onOpen()
        source.onerror = () => handlers.onError()
        return source
      },
      poll: () =>
        fetch(`/api/rpc`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ method: 'session.history', payload: { sessionId, maxMessages: 1 } }),
        }).then((response) => {
          if (response.status === 401) throw new DisconnectedError()
        }),
      now: () => Date.now(),
      setTimeout: (handler, timeoutMs) => window.setTimeout(handler, timeoutMs),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
      requestFrame: (fn) => requestAnimationFrame(() => fn()),
    },
    sink,
  )
}

// ---------------------------------------------------------------------------
// 视图装配
// ---------------------------------------------------------------------------

export interface ChatDeps {
  readonly api: OfficialApi
  /** 已读游标载体（mobile 页 localStorage——1.12 裁决：host read-state 面不建）。 */
  readonly store?: KeyValueStore | null
  /** 游标键配对域（与 drawer readCursorKey 同源对账）。 */
  readonly pairDomain?: string
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
  const title = el('div', 'title', '…')
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
    onSend: (text) => void send(text),
    onSettings: () => deps.onOpenSettings?.(),
    onWorktreeTap: () => deps.onWorktreeTap?.(),
  })

  root.append(topbar, view, jump, composer.root, overlay)

  // ---- 渲染 ----
  function render(): void {
    const projections = projectHistory(state.entries)
    const activities = pairToolActivity(projections)
    const activityByCallId = new Map(activities.map((activity) => [activity.call.callId, activity]))
    const seenCalls = new Set<string>()
    const degradedNarratives = degradedNarrativeSeqs(projections)
    view.textContent = ''
    for (const projection of projections) {
      if (projection.kind === 'tool-result') continue
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
    if (state.overlay === 'degraded') overlay.appendChild(el('span', undefined, '连接不稳定，正在重连…'))
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

  /** 触底/回底写已读游标（显示层乐观归零；drawer 打开/轮询按同键对账，1.12）。 */
  function writeReadState(): void {
    if (state.tailSeq < 0) return
    writeReadCursor(readStore, readCursorKey(deps.pairDomain ?? 'default'), sessionId, state.tailSeq)
  }
  const readStore: KeyValueStore | null =
    deps.store === undefined
      ? typeof window !== 'undefined' && window.localStorage
        ? window.localStorage
        : null
      : deps.store

  function deriveTitle(entries: readonly WireEvent[]): string {
    for (let index = entries.length - 1; index >= 0; index--) {
      const event = entries[index]
      if (event?.type === 'session/title') {
        return (event.data as { title?: string }).title ?? '…'
      }
    }
    return '会话'
  }

  // ---- 发送（斜杠仲裁单一发送路径）----
  async function send(text: string): Promise<void> {
    composer.setSending(true)
    try {
      await sendComposerInput(text, { api: deps.api, sessionId, catalog: [] })
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
