// input-history client 面核心（composer-correction 分支 packages/plugins/composer-correction/
// src/client/input-history.ts 判例移植内联——共享逻辑各自内联，零对参考分支构建期依赖）：
//   历史源 = 本会话已发送用户消息文本按发送序（订阅官方 user/message 事件流；
//   会话切换即切源）；readline 习惯键位——空草稿或光标在首行行首时 ArrowUp 翻上一条、
//   ArrowDown 回翻、翻回起点恢复翻阅前暂存的未提交草稿；多行草稿编辑中（光标不在
//   首行行首且未翻阅）保持原生光标移动。
// 零 dsh-forge 依赖：上游事件/草稿面以结构同型镜像窄接口承载。

// ---------------------------------------------------------------------------
// 会话事件流消费窄面（官方 dsh-session 事件切片——event-source.ts 装配真实订阅）
// ---------------------------------------------------------------------------

/** 官方会话事件结构切片（本面只读 type/seq/data） */
export interface HistorySessionEvent {
  readonly type: string
  readonly seq: number
  readonly data?: unknown
}

/** 会话事件 feed（官方 Session 事件流消费切片：快照 + 订阅） */
export interface HistoryEventFeed {
  snapshot(): readonly HistorySessionEvent[]
  subscribe(listener: () => void): () => void
}

/** 人工来源切片（官方 UserMessage.source.kind === 'user'） */
interface UserMessageDataSlice {
  readonly source?: { readonly kind?: string }
  readonly content?: readonly { readonly type?: string; readonly text?: string }[]
}

/** 人工发送的 user/message 判定（append-origin 人工消息） */
export function isSentUserMessageEvent(event: HistorySessionEvent): boolean {
  if (event.type !== 'user/message') return false
  const data = event.data as UserMessageDataSlice | undefined
  return data?.source?.kind === 'user'
}

/** user/message 事件文本提取（多段 text 拼接；无文本段 = undefined） */
export function userMessageTextOf(event: HistorySessionEvent): string | undefined {
  const data = event.data as UserMessageDataSlice | undefined
  const parts = (data?.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
  if (parts.length === 0) return undefined
  return parts.join('')
}

/** 历史条目（seq = 发送序锚） */
export interface HistoryEntry {
  readonly seq: number
  readonly text: string
}

/** 事件流 → 历史条目（按 seq 发送序；无文本的人工消息跳过） */
export function historyEntriesOf(events: readonly HistorySessionEvent[]): HistoryEntry[] {
  const entries: HistoryEntry[] = []
  for (const event of events) {
    if (!isSentUserMessageEvent(event)) continue
    const text = userMessageTextOf(event)
    if (text !== undefined) entries.push({ seq: event.seq, text })
  }
  return entries
}

// ---------------------------------------------------------------------------
// 历史源（单会话：订阅 feed，条目随事件重算）
// ---------------------------------------------------------------------------

export interface InputHistorySource {
  readonly sessionId: string
  entries(): readonly HistoryEntry[]
  subscribe(listener: () => void): () => void
  /** 释放 feed 订阅（attach 换源 / handle dispose 时调用——旧源订阅同步释放，幂等） */
  dispose(): void
}

/** 单会话历史源：条目惰性取 feed 快照重算（feed = 事实源），订阅负责失效通知 */
export function createHistorySource(sessionId: string, feed: HistoryEventFeed): InputHistorySource {
  const listeners = new Set<() => void>()
  let feedDisposed = false
  let feedActive = true
  let disposeFeed = feed.subscribe(notify)
  function notify(): void {
    for (const listener of listeners) listener()
  }
  // 惰性订阅：listener 归零即释放 feed 订阅；dispose() 前再 subscribe 可重订恢复通知
  // （Root cause: 旧实现归零即置 feedDisposed=true 不可逆——重订阅得到死源）
  const releaseFeed = (): void => {
    if (!feedActive) return
    feedActive = false
    disposeFeed()
  }
  const resubscribe = (): void => {
    if (feedActive || feedDisposed) return
    disposeFeed = feed.subscribe(notify)
    feedActive = true
  }
  return {
    sessionId,
    entries: () => historyEntriesOf(feed.snapshot()),
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      resubscribe()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) releaseFeed()
      }
    },
    dispose(): void {
      feedDisposed = true
      releaseFeed()
    },
  }
}

// ---------------------------------------------------------------------------
// readline 翻阅状态机（纯决策——无副作用，键位绑定层执行草稿写入）
// ---------------------------------------------------------------------------

/** 翻阅态：index = 当前回忆条目下标（null = 未翻阅）；stash = 翻阅前暂存草稿 */
export interface BrowseState {
  readonly index: number | null
  readonly stash: string
}

export const initialBrowseState: BrowseState = { index: null, stash: '' }

/** 单步判定结果：handled = 拦截（草稿置为 text 并吞键）；未拦截 = 原生光标移动 */
export type BrowseStep = { readonly handled: false } | { readonly handled: true; readonly text: string }

export interface BrowseOutcome {
  readonly state: BrowseState
  readonly step: BrowseStep
}

/**
 * ArrowUp：未翻阅时仅草稿为空或光标在首行行首（caret=0）触发——暂存当前草稿、翻出
 * 最后一条；翻阅中逐条上翻（已在最旧一条则停住，仍吞键）；用户编辑了回忆文本 = 以
 * 编辑稿为新的暂存起点重新翻起。无历史或不满足触发条件 = 不拦截（原生光标移动）。
 */
export function browseUp(
  state: BrowseState,
  entries: readonly HistoryEntry[],
  draft: string,
  caret: number,
): BrowseOutcome {
  if (entries.length === 0) return { state, step: { handled: false } }
  if (state.index === null && draft !== '' && caret !== 0) {
    // 多行草稿编辑中——保持原生光标移动（不触发翻阅）
    return { state, step: { handled: false } }
  }
  if (state.index === null) {
    return {
      state: { index: entries.length - 1, stash: draft },
      step: { handled: true, text: entries[entries.length - 1]!.text },
    }
  }
  const current = entries[state.index]
  if (current === undefined || draft !== current.text) {
    // 回忆文本被编辑（readline 同径）：编辑稿成为新的暂存，光标退到相邻上一条
    const next = Math.max(0, state.index - 1)
    return {
      state: { index: next, stash: draft },
      step: { handled: true, text: entries[next]!.text },
    }
  }
  const next = Math.max(0, state.index - 1)
  return { state: { ...state, index: next }, step: { handled: true, text: entries[next]!.text } }
}

/**
 * ArrowDown：仅翻阅中拦截——未翻到最旧回翻一位；翻过最新一条恢复翻阅前暂存草稿
 * （翻阅态解除）。未翻阅 = 不拦截（原生光标移动）。
 */
export function browseDown(state: BrowseState, entries: readonly HistoryEntry[], draft: string): BrowseOutcome {
  if (state.index === null) return { state, step: { handled: false } }
  const current = entries[state.index]
  if (current === undefined || draft !== current.text) {
    // 回忆文本被编辑（readline 同径）：恢复翻阅前暂存草稿，翻阅态解除
    return { state: initialBrowseState, step: { handled: true, text: state.stash } }
  }
  if (state.index < entries.length - 1) {
    const next = state.index + 1
    return { state: { ...state, index: next }, step: { handled: true, text: entries[next]!.text } }
  }
  // 翻过最新一条：恢复暂存的未提交草稿
  return { state: initialBrowseState, step: { handled: true, text: state.stash } }
}

// ---------------------------------------------------------------------------
// 键位绑定（窄缝——按键源 + 草稿缝由消费者注入，零官方 composer 改制）
// ---------------------------------------------------------------------------

/** 按键手势切片（DOM KeyboardEvent 消费切片——preventDefault = 吞键） */
export interface HistoryKeyGesture {
  readonly key: string
  preventDefault(): void
}

/** 按键源窄面（composer DOM 捕获段订阅——官方 keymap 保留面之外的按键经此接入） */
export interface HistoryKeySource {
  subscribe(handler: (gesture: HistoryKeyGesture) => void): () => void
}

/** 草稿缝窄面（官方 conversation.input 会话寻址缝消费切片——读草稿/光标、整体置稿） */
export interface HistoryDraftSeam {
  getDraft(): string
  getCaret(): number
  setDraft(text: string): void
}

export interface InputHistoryHandle {
  /** 切换历史源（会话切换：换 feed 订阅，翻阅态与暂存重置） */
  attach(sessionId: string, feed: HistoryEventFeed): void
  /** 当前历史源会话 id（未 attach = undefined） */
  attachedSession(): string | undefined
  /** 当前历史条目（未 attach = []） */
  entries(): readonly HistoryEntry[]
  /** 键位绑定（返回退订 disposer；幂等） */
  bind(keys: HistoryKeySource, draft: HistoryDraftSeam): () => void
  /** 全量清理（退订按键源与会话源；幂等） */
  dispose(): void
}

/** 键位绑定 + 历史源编排（会话内输入历史翻阅唯一入口） */
export function createInputHistory(): InputHistoryHandle {
  let source: InputHistorySource | undefined
  let bound = false
  let disposeKeys: (() => void) | undefined

  const handleKey = (gesture: HistoryKeyGesture, draft: HistoryDraftSeam): void => {
    if (source === undefined) return
    if (gesture.key === 'ArrowUp') {
      const outcome = browseUp(currentState(), source.entries(), draft.getDraft(), draft.getCaret())
      if (outcome.step.handled) {
        draft.setDraft(outcome.step.text)
        gesture.preventDefault()
      }
      state = outcome.state
      return
    }
    if (gesture.key === 'ArrowDown') {
      const outcome = browseDown(currentState(), source.entries(), draft.getDraft())
      if (outcome.step.handled) {
        draft.setDraft(outcome.step.text)
        gesture.preventDefault()
      }
      state = outcome.state
    }
    // 其余按键不归本面（官方 keymap / 编辑器原生语义保持）
  }

  let state: BrowseState = initialBrowseState
  const currentState = (): BrowseState => state
  const resetBrowse = (): void => {
    state = initialBrowseState
  }

  return {
    attach(sessionId: string, feed: HistoryEventFeed): void {
      resetBrowse()
      // 换源即释放旧源 feed 订阅（含零 listener 场景——旧订阅不随 GC 消失，必须显式释放）
      source?.dispose()
      source = createHistorySource(sessionId, feed)
    },
    attachedSession: () => source?.sessionId,
    entries: () => source?.entries() ?? [],
    bind(keys: HistoryKeySource, draft: HistoryDraftSeam): () => void {
      if (bound && disposeKeys !== undefined) disposeKeys()
      disposeKeys = keys.subscribe((gesture) => handleKey(gesture, draft))
      bound = true
      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        disposeKeys?.()
        disposeKeys = undefined
        bound = false
      }
    },
    dispose(): void {
      disposeKeys?.()
      disposeKeys = undefined
      bound = false
      resetBrowse()
      source?.dispose()
      source = undefined
    },
  }
}
