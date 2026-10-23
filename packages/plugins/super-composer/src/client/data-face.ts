// data-face —— 替身数据面（提案 §2.4：全部操作走 ctx.conversation.input.for(actx)
// 同一 facade + 同一 session eventSource 订阅——与主 composer / 主 ChatView 同草稿机、
// 同数据渠道）。
//
// bundle 自含纪律（client-plugin 经典 script 形状，open-session.ts 先例）：本文件零
// 外部 import——官方面以结构同型镜像承载：
//   - SessionInput（dsh-client-ui-conversation contract/input.d.ts）——setDraft /
//     submit / focus / state（InputState 快照店：draft/draftRev/phase/occurrences）
//   - slash/input-insert-reference scoped bail 事件（span-CAS + 漂移症状级复核，
//     bug 2d5434d1 判例；open-session.ts insertReferenceAtTail 单源镜像）
//   - InputTriggerController（dsh-client-ui-input-trigger client/controller.d.ts）——
//     menu 快照店 / track（官方 trigger 检测入口）/ arbitrate（↑↓/Enter/Esc 键盘
//     仲裁）/ pick（点击落选）——替身 mention 菜单只做同壳渲染，模型全在官方
//     controller，零自造候选源
//   - SessionEventSource（dsh-api-session-controller contract/events.d.ts）——
//     SessionEventWindow 快照：durable user/assistant message + assistant/live-chunk
//     transient 流式增量
//   - sessions.list 快照活跃会话解析（retainedBy.mainView 在留锚，quote-reference
//     activeSessionIdOf 判例同构）
//
// 全缝 fail-soft：sessions/conversation 缺席或形状漂移 = 投影空态 + 操作 no-op，
// 不抛不炸（替身消失即共享无损——草稿与消息流都在宿主单点）。
import type {
  MiniComposerMessage,
  MiniComposerProps,
  MiniMentionMenu,
} from './mini-composer.js'
import { splitQuoteSegments } from './mini-composer.js'

// ─────────────────────────── 官方面结构同型镜像 ───────────────────────────

/** 官方 SnapshotStore 消费切片（getSnapshot + subscribe） */
export interface SnapshotStoreMirror<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** InputState 消费切片（dsh-client-ui-conversation contract/input.d.ts:236-255） */
export interface InputStateMirror {
  readonly draft: string
  readonly draftRev: number
  readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'
  readonly occurrences?: readonly unknown[]
  readonly queue?: readonly unknown[]
}

/** ReferenceInsert 消费切片（draft-editor contract） */
export interface ReferenceInsertMirror {
  readonly source: string
  readonly ref: string
  readonly label: string
  readonly clipboardText: string
}

/** TokenSpan 消费切片（draft-editor contract——span-CAS 三元组） */
export interface TokenSpanMirror {
  readonly start: number
  readonly end: number
  readonly draftRev: number
}

/** SessionInput 消费切片（contract/input.d.ts:163-194——同一草稿机操作面） */
export interface SessionInputFaceMirror {
  setDraft(text: string): void
  submit(mode?: unknown, source?: 'click' | 'enter'): void
  focus(): void
  insertReference?(ref: ReferenceInsertMirror, span: TokenSpanMirror): boolean
  readonly state: SnapshotStoreMirror<InputStateMirror>
}

/** SessionBinding 消费切片（dsh-api-session-controller sessions/service.d.ts:76-83） */
export interface BindingMirror {
  readonly sessionId: string
  readonly ctx: unknown
  readonly eventSource: EventSourceMirror
  /** ISession 行为缝切片（contract/session.d.ts:122-127——loadOlder 历史分页动词） */
  readonly session?: { readonly loadOlder?: () => Promise<unknown> }
}

/** ISessions 消费切片（binding 寻址 + list 快照） */
export interface SessionsMirror {
  binding(id: string): BindingMirror | undefined
  readonly list: { getSnapshot(): unknown }
}

/** assistant/live-chunk StreamChunk 消费切片（dsh-llm types.d.ts:417-425） */
export interface StreamChunkMirror {
  readonly type?: string
  readonly text?: string
}

/** SessionEventWindow 消费切片（contract/events.d.ts:20-63——窗口有界：hasMore=true
 * 表示仍有更早历史页，官方 ChatView 经 loadOlder prepend 补齐） */
export interface EventWindowMirror {
  readonly entries: readonly EventEntryMirror[]
  readonly hasMore?: boolean
}

export type EventEntryMirror =
  | { readonly type: 'event'; readonly event: { readonly type: string; readonly seq?: number; readonly data?: unknown } }
  | {
      readonly type: 'transient'
      readonly event: {
        readonly type: 'assistant/live-chunk'
        readonly seq?: number
        readonly data?: { readonly attemptId?: string; readonly chunk?: StreamChunkMirror }
      }
    }

export interface EventSourceMirror extends SnapshotStoreMirror<EventWindowMirror> {}

/** InputTriggerController 消费切片（dsh-client-ui-input-trigger controller.d.ts） */
export interface TriggerControllerMirror {
  readonly menu: SnapshotStoreMirror<MenuStateMirror>
  track(draft: string, caret: number, guard: { readonly tier: 'plain' | 'claimed' | 'frozen' }, draftRev: number): void
  arbitrate(key: 'up' | 'down' | 'enter' | 'escape' | 'tab' | 'tabBack', composing: boolean): 'consumed' | 'pick-highlighted' | 'pass'
  pick(source: string, index: number, action?: 'pick' | 'drill'): void
  dismiss(): void
  /** Space 仲裁（官方 controller.onSpace——复制件 keyboard.space 消费；漂移 = undefined） */
  onSpace?(composing?: boolean): boolean
}

/** MenuState 消费切片（input-trigger core/contract.d.ts） */
export interface MenuStateMirror {
  readonly open: boolean
  readonly groups: readonly {
    readonly source: string
    readonly items: readonly { readonly name: string; readonly label?: string; readonly description?: string }[]
  }[]
  readonly highlight: { readonly source: string; readonly index: number } | null
}

/** 数据面服务组装（真实 ctx 服务切片 → 窄面；任一缺席 = 对应能力空态） */
export interface DataFaceServices {
  readonly sessions?: SessionsMirror
  readonly conversation?: { readonly input: { readonly for: (actx: unknown) => SessionInputFaceMirror | undefined } }
  readonly bail?: (actx: unknown, name: string, payload: unknown) => unknown
  readonly inputTriggers?: { readonly sessionOf: (actx: unknown) => TriggerControllerMirror }
}

// ─────────────────────────── 纯函数 ───────────────────────────

/**
 * 活跃会话解析（官方快照形状——retainedBy.mainView 在留锚；quote-reference 判例同构）。
 */
export function activeSessionIdOf(list: unknown): string | undefined {
  if (typeof list !== 'object' || list === null) return undefined
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return undefined
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return undefined
  }
  const byId = (snapshot as { byId?: unknown } | null)?.byId
  if (typeof byId !== 'object' || byId === null) return undefined
  for (const row of Object.values(byId as Record<string, unknown>)) {
    const id = (row as { id?: unknown } | null)?.id
    const mainView = (row as { retainedBy?: { mainView?: unknown } } | null)?.retainedBy?.mainView
    if (typeof id === 'string' && id !== '' && typeof mainView === 'number' && mainView > 0) return id
  }
  return undefined
}

/**
 * 活跃会话标题解析（1.41 用户裁决——标题栏左侧会话标题）：
 * sessions.list 快照活跃行（activeSessionIdOf 现径）的 `title`（官方 rename/自动
 * title 落的 list 投影列）优先，未命名回落 `displayTitle`（官方 manager 投影的
 * 展示口径 = durable title → project basename → session id，与官方侧栏同源同值）。
 * 快照缺席/形状漂移 fail-soft 回空串。
 */
export function sessionTitleOf(list: unknown): string {
  if (typeof list !== 'object' || list === null) return ''
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return ''
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return ''
  }
  const id = activeSessionIdOf(list)
  if (id === undefined) return ''
  const row = (snapshot as { byId?: Record<string, unknown> } | null)?.byId?.[id]
  if (typeof row !== 'object' || row === null) return ''
  const title = (row as { title?: unknown }).title
  if (typeof title === 'string' && title !== '') return title
  const displayTitle = (row as { displayTitle?: unknown }).displayTitle
  if (typeof displayTitle === 'string' && displayTitle !== '') return displayTitle
  return ''
}

/** PromptContentPart 文本拼合（text parts 投影；非文本 part 跳过——消息流只投文本）。 */
export function messageTextOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (typeof (part as { text?: unknown })?.text === 'string' ? (part as { text: string }).text : ''))
    .join('')
}

/**
 * session eventSource 窗口投影（纯归约——全量重算，无内部累积状态）：
 * durable `user/message`（data = message）/ `assistant/message`（data.message）→
 * 消息行；transient `assistant/live-chunk` 按 attemptId 聚合 text-delta → 流式行
 *（id = live:<attemptId>）；transient 在场 = streaming。非消息事件跳过。
 */
export function projectEventWindow(window: { readonly entries?: readonly EventEntryMirror[] }): {
  readonly messages: readonly MiniComposerMessage[]
  readonly streaming: boolean
} {
  const messages: MiniComposerMessage[] = []
  const live = new Map<string, { index: number; text: string }>()
  for (const entry of window.entries ?? []) {
    if (entry.type === 'transient') {
      if (entry.event.type !== 'assistant/live-chunk') continue
      const attemptId = entry.event.data?.attemptId
      const text = entry.event.data?.chunk?.text
      if (typeof attemptId !== 'string' || typeof text !== 'string') continue
      const known = live.get(attemptId)
      if (known === undefined) {
        live.set(attemptId, { index: messages.length, text })
        messages.push({ id: `live:${attemptId}`, role: 'assistant', content: text })
      } else {
        known.text += text
        messages[known.index] = { id: `live:${attemptId}`, role: 'assistant', content: known.text }
      }
      continue
    }
    const type = entry.event.type
    if (type === 'user/message') {
      const message = entry.event.data as { id?: unknown; content?: unknown } | undefined
      if (typeof message?.id !== 'string') continue
      messages.push({ id: message.id, role: 'user', content: messageTextOf(message.content) })
    } else if (type === 'assistant/message') {
      const message = (entry.event.data as { message?: { id?: unknown; content?: unknown } } | undefined)?.message
      if (typeof message?.id !== 'string') continue
      messages.push({ id: message.id, role: 'assistant', content: messageTextOf(message.content) })
    }
  }
  return { messages, streaming: live.size > 0 }
}

/** InputState.phase → 官方 TriggerGuard tier（claimed: '/' 抑制 '@' 活；frozen: 全停）。 */
export function trackGuardOf(phase: InputStateMirror['phase']): 'plain' | 'claimed' | 'frozen' {
  if (phase === 'submitting') return 'frozen'
  if (phase === 'plain') return 'plain'
  return 'claimed'
}

/**
 * span-CAS 构造（草稿 detect 末尾 + 当前 draftRev）。fix-19 对齐官方 span-map 平面
 * 契约（quote-reference bug 043166fc 同源判例）：chip 在 detect 投影坍缩为单字符，
 * InputState.draft 是 clipboard 投影——occurrences 反推 detect 尾 = draft.length −
 * Σ(chip 长 − 1)；clipboard 平面旧径在 chip 在稿时 span.end 越界 → bail 拒绝 →
 * 替身径插入静默被吞。
 */
export function tailSpanOf(state: InputStateMirror): TokenSpanMirror {
  const chipExtra = (state.occurrences ?? []).reduce<number>((n, occ) => {
    const len = (occ as { length?: unknown } | null | undefined)?.length
    return n + (typeof len === 'number' && Number.isFinite(len) ? Math.max(0, len - 1) : 0)
  }, 0)
  const at = state.draft.length - chipExtra
  return { start: at, end: at, draftRev: state.draftRev }
}

/** 插入事实复核（bug 2d5434d1 症状级：occurrences 增长 ∨ 草稿尾接 clipboardText）。 */
export function referenceApplied(
  before: { readonly occurrences?: readonly unknown[] },
  after: { readonly draft: string; readonly occurrences?: readonly unknown[] },
  clipboardText: string,
): boolean {
  if (after.occurrences !== undefined && before.occurrences !== undefined && after.occurrences.length > before.occurrences.length) {
    return true
  }
  return clipboardText.length > 0 && after.draft.endsWith(clipboardText)
}

// ─────────────────────────── 数据面 ───────────────────────────

/** 替身数据面（操作 + 投影 + mention 同壳面；实例可用 dispose 摘订阅）。 */
export interface SuperComposerDataFace {
  /** 活跃会话 binding（缺席 = undefined——全部操作降空态） */
  activeBinding(): BindingMirror | undefined
  /** 草稿投影（draft + chip 计数；会话缺席 = 空态） */
  draftProjection(): { readonly draft: string; readonly chipCount: number }
  /** 官方 input state 全量快照（复制件 surrogate-composer 的 phase/queue 消费面） */
  inputState(): InputStateMirror | undefined
  /** 整体替换草稿（同一草稿机 setDraft 同径） */
  setDraft(text: string): void
  /** 草稿尾插入原生引用 chip（span-CAS + bail slash/input-insert-reference 官方径） */
  insertReference(reference: ReferenceInsertMirror): boolean
  /**
   * chip 保持文本插入（fix-19 单写者正门：bail slash/input-insert-text + span-CAS；
   * 复制件回写与替身径文本插入共用——官方 editor 动词，chip 节点零损伤）。
   */
  insertText(text: string, span: TokenSpanMirror): boolean
  /** 进入提交（官方发送链 submit 同径——mode 透传 busyEnter 投影，含 slash 仲裁与默认 sink） */
  submit(mode?: unknown, source?: 'click' | 'enter'): void
  /** 消息流投影（同一 eventSource 快照——durable + 流式增量 + streaming 旗标） */
  streamProjection(): { readonly messages: readonly MiniComposerMessage[]; readonly streaming: boolean }
  /** 活跃会话标题投影（sessions.list title/displayTitle 口径；会话缺席 = 空串） */
  titleProjection(): string
  /** mention 官方 controller（inputTriggers.sessionOf；服务/会话缺席 = undefined） */
  mention(): TriggerControllerMirror | undefined
  /** 官方 trigger 检测入口转发（草稿/光标变更时调用——菜单开合由官方 controller 决定） */
  trackMention(draft: string, caret: number): void
  /**
   * 变更订阅（input state store + eventSource 扇出；返回退订）。
   * 单订阅者契约（评审 C2）：本面状态即单槽——二次 subscribe 会覆写 listOff 并与
   * 前一订阅共享 inputOffs（前订阅退订会连带拆掉后订阅的每会话源）。当前唯一消费方
   * = mountMiniComposer 的单一 render 扇出；新增订阅方须先经扇出聚合，不得直订。
   */
  subscribe(listener: () => void): () => void
  /** 订阅补挂重试（晚序服务就绪后调用——全源挂上 = true） */
  syncSubscriptions(listener: () => void): boolean
  /** 全量摘订阅 */
  dispose(): void
}

function faceOf(services: DataFaceServices): SessionInputFaceMirror | undefined {
  const binding = bindingOf(services)
  if (binding === undefined) return undefined
  try {
    return services.conversation?.input.for(binding.ctx) ?? undefined
  } catch {
    return undefined
  }
}

function bindingOf(services: DataFaceServices): BindingMirror | undefined {
  const sessions = services.sessions
  if (sessions === undefined) return undefined
  try {
    const id = activeSessionIdOf(sessions.list)
    if (id === undefined) return undefined
    return sessions.binding(id) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * 替身数据面组装：全部操作经活跃会话 binding.ctx 寻址的官方 SessionInput facade，
 * 全部投影读同一 state 快照店与同一 eventSource。服务缺席 / 会话未在留 / 面漂移 =
 * 投影空态 + 操作 no-op（不抛）。
 */
export function createSuperComposerDataFace(services: DataFaceServices): SuperComposerDataFace {
  const inputOffs = new Set<() => void>()
  let disposed = false
  // 每会话源订阅分源判据（Root cause: 会话与 conversation 服务均可能晚于挂载 provide
  // ——单标志会把「首次补挂失败」误判为已挂，受控值投影/mention 菜单永不重渲染。
  // state/menu 依赖 conversation —— 由 syncSubscriptions 重试补挂直至各源挂上）
  let stateSubAttached = false
  let menuSubAttached = false
  let eventSourceSubAttached = false
  // 每会话订阅的 binding 身份（bug 1d1e07af）：活跃会话变更（sessions.list 主会话切换
  // ∨ 同 id 会话 scope 重物化铸造新 binding）时，旧会话的 state/menu/eventSource store
  // 永不再发布当前会话的事实——须摘旧重挂，单标志闩锁会把替身钉死在首会话的 store 上
  //（chip 行/草稿投影「冻结」假象；官方 DOM 绑定链本身健康，face 与可见编辑器同代纪）。
  let attachedBinding: unknown
  // sessions.list 订阅退订（生命周期级——不在会话切换摘除面：detach 时或正处在 list
  // 通知回调内，摘自身通知源不安全且会断掉后续会话变更扇出）
  let listOff: (() => void) | undefined
  // 历史分页单飞闩锁 + 有界上界（bug e9fec642：防重入拉页；20 页 = 官方 loadOlder
  // 每页 ≥50 条的上万条余量，超界收敛为只投影当前窗口）
  let drainInFlight = false
  const DRAIN_MAX_PAGES = 20
  const drainHistory = (binding: BindingMirror): void => {
    if (drainInFlight) return
    const loadOlder = binding.session?.loadOlder
    if (typeof loadOlder !== 'function') return
    drainInFlight = true
    void (async () => {
      try {
        for (let page = 0; page < DRAIN_MAX_PAGES; page++) {
          if (binding.eventSource.getSnapshot().hasMore !== true) return
          await loadOlder()
        }
      } catch {
        // fail-soft：loadOlder 失败（快照 openState/loadingOlder 承载）只降本面
      } finally {
        drainInFlight = false
      }
    })()
  }

  const detachSessionSubs = (): void => {
    for (const off of inputOffs) {
      try {
        off()
      } catch {
        // fail-soft
      }
    }
    inputOffs.clear()
    stateSubAttached = false
    menuSubAttached = false
    eventSourceSubAttached = false
  }

  const attachSessionSubs = (listener: () => void): boolean => {
    const binding = bindingOf(services)
    if (binding === undefined) return false
    if (attachedBinding !== undefined && attachedBinding !== binding) detachSessionSubs()
    attachedBinding = binding
    if (!stateSubAttached) {
      const state = faceOf(services)?.state
      if (state?.subscribe !== undefined) {
        try {
          const off = state.subscribe(listener)
          if (typeof off === 'function') inputOffs.add(off)
          stateSubAttached = true
        } catch {
          // fail-soft（下一轮重试）
        }
      }
    }
    if (!menuSubAttached) {
      const triggers = services.inputTriggers
      if (triggers !== undefined) {
        try {
          const sessionOf = triggers.sessionOf
          const menu = typeof sessionOf === 'function' ? sessionOf(binding.ctx)?.menu : undefined
          if (typeof menu?.subscribe === 'function') {
            const off = menu.subscribe(listener)
            if (typeof off === 'function') inputOffs.add(off)
            menuSubAttached = true
          }
        } catch {
          // fail-soft（下一轮重试——sessionOf 可因会话在留态抛，服务就绪后重试可达）
        }
      }
    }
    if (!eventSourceSubAttached) {
      try {
        const off = binding.eventSource.subscribe(listener)
        if (typeof off === 'function') inputOffs.add(off)
        eventSourceSubAttached = true
      } catch {
        // fail-soft（下一轮重试）
      }
    }
    return stateSubAttached && menuSubAttached && eventSourceSubAttached
  }

  const onSources = (listener: () => void): void => {
    // sessions.list 订阅恒挂（会话后到——挂载时 binding 缺席也要在会话在留后扇出
    // 重渲染并补挂每会话源订阅）
    try {
      const list = (services.sessions as { list?: { subscribe?: (l: () => void) => () => void } } | undefined)?.list
      if (typeof list?.subscribe === 'function') {
        const off = list.subscribe(() => {
          // bug 1d1e07af 续：摘旧重挂不得在 sessions.list 通知循环内同步进行——循环内
          // 触发会话 scope 解析/每会话 store 订阅变更会与官方 list-change applier
          //（agent-preset apply → ctx 代理链）交织，真机实测 Maximum call stack 递归
          // 爆栈；出循环微任务执行，语义不变（list 扇出仍是变更后必达）。
          queueMicrotask(() => {
            // bug 0b94b710：dispose 后已排队微任务仍会重挂订阅并对已 unmount root 调
            // listener → render——微任务体首行 disposed 守卫（Root cause: 微任务延迟体
            // 与 dispose 无 happens-before，出循环重挂决策必须在执行时点复核存活态）。
            if (disposed) return
            attachSessionSubs(listener)
            listener()
          })
        })
        // bug 1d1e07af：list 退订走独立生命周期（不入 inputOffs——会话切换摘旧订阅时
        // 不得摘掉 list 扇出源，且 detach 可发生在 list 通知回调内）
        if (typeof off === 'function') listOff = off
      }
    } catch {
      // fail-soft
    }
    attachSessionSubs(listener)
  }

  return {
    activeBinding: () => bindingOf(services),
    draftProjection() {
      const state = readState(services)
      const draft = state?.draft ?? ''
      // chip 计数双源（复制件切换后官方 editor 不再承载替身 chips）：官方 occurrences
      // 在场取官方；替身本地 chip 的机器侧痕迹 = 草稿内引用 token（quote-reference
      // 序列化形状）计数——两源取大（同草稿机，不会双计同一 chip）。
      const tokenCount = splitQuoteSegments(draft).filter((s) => s.kind === 'quote').length
      return { draft, chipCount: Math.max(state?.occurrences?.length ?? 0, tokenCount) }
    },
    inputState() {
      return readState(services)
    },
    setDraft(text) {
      try {
        faceOf(services)?.setDraft(text)
      } catch {
        // fail-soft
      }
    },
    insertReference(reference) {
      const binding = bindingOf(services)
      const face = faceOf(services)
      const bail = services.bail
      if (binding === undefined || face === undefined || bail === undefined) return false
      const before = readState(services)
      if (before === undefined) return false
      let applied: unknown
      try {
        applied = bail(binding.ctx, 'slash/input-insert-reference', { reference, span: tailSpanOf(before) })
      } catch {
        return false
      }
      if (applied !== true) {
        // 漂移症状级复核（bug 2d5434d1）：返回值漂移但插入事实已落 = 同判成功。
        let after: InputStateMirror | undefined
        try {
          after = face.state?.getSnapshot()
        } catch {
          return false
        }
        if (after === undefined || !referenceApplied(before, after, reference.clipboardText)) return false
      }
      try {
        face.focus()
      } catch {
        // best effort（插入已落——还焦失败不回滚）
      }
      return true
    },
    insertText(text, span) {
      const bail = services.bail
      const binding = bindingOf(services)
      if (bail === undefined || binding === undefined) return false
      try {
        return bail(binding.ctx, 'slash/input-insert-text', { text, span }) === true
      } catch {
        return false
      }
    },
    submit(mode, source) {
      try {
        faceOf(services)?.submit(mode, source)
      } catch {
        // fail-soft
      }
    },
    streamProjection() {
      const binding = bindingOf(services)
      if (binding === undefined) return { messages: [], streaming: false }
      let window: EventWindowMirror
      try {
        window = binding.eventSource.getSnapshot()
      } catch {
        return { messages: [], streaming: false }
      }
      // bug e9fec642：窗口有界（官方 follow 开场快照截尾 maxMessages=500/turnWindow，
      // hasMore=true = 仍有更早 durable 历史）——经 binding.session.loadOlder 官方动词
      // 按页 prepend 补齐（fire-and-forget，每页发布驱动既有订阅重渲染），对齐官方
      // ChatView 取数面。session 面缺席 = 静默跳过（仅投影当前窗口）。
      if (window.hasMore === true) drainHistory(binding)
      return projectEventWindow(window)
    },
    titleProjection() {
      try {
        return sessionTitleOf(services.sessions?.list)
      } catch {
        return ''
      }
    },
    mention() {
      const binding = bindingOf(services)
      const triggers = services.inputTriggers
      if (binding === undefined || triggers === undefined) return undefined
      try {
        const sessionOf = triggers.sessionOf
        if (typeof sessionOf !== 'function') return undefined
        return sessionOf(binding.ctx)
      } catch {
        return undefined
      }
    },
    trackMention(draft, caret) {
      const controller = services.inputTriggers === undefined ? undefined : this.mention()
      if (controller === undefined) return
      const state = readState(services)
      if (state === undefined) return
      try {
        controller.track(draft, caret, { tier: trackGuardOf(state.phase) }, state.draftRev)
      } catch {
        // fail-soft
      }
    },
    subscribe(listener) {
      if (disposed) return () => undefined
      onSources(listener)
      return () => {
        detachSessionSubs()
        attachedBinding = undefined
        try {
          listOff?.()
        } catch {
          // fail-soft
        }
        listOff = undefined
      }
    },
    syncSubscriptions(listener) {
      if (disposed) return true
      return attachSessionSubs(listener)
    },
    dispose() {
      disposed = true
      detachSessionSubs()
      attachedBinding = undefined
      try {
        listOff?.()
      } catch {
        // fail-soft
      }
      listOff = undefined
    },
  }
}

function readState(services: DataFaceServices): InputStateMirror | undefined {
  try {
    return faceOf(services)?.state?.getSnapshot()
  } catch {
    return undefined
  }
}

// ─────────────────────────── 卡片装配适配 ───────────────────────────

/** 替身 mention 菜单同壳面 = MiniMentionMenu（mini-composer.tsx 定义——模型在官方 controller）。 */

/** 官方 controller menu 快照 → 卡片 mention 面（菜单闭 = undefined）。 */
export function mentionMenuOf(face: SuperComposerDataFace): MiniMentionMenu | undefined {
  const controller = face.mention()
  if (controller === undefined) return undefined
  let menu: MenuStateMirror
  try {
    menu = controller.menu.getSnapshot()
  } catch {
    return undefined
  }
  if (!menu.open) return undefined
  return {
    open: true,
    groups: menu.groups,
    highlight: menu.highlight,
    onArbitrate: (key) => {
      try {
        return controller.arbitrate(key, false)
      } catch {
        return 'pass'
      }
    },
    onPick: (source, index) => {
      try {
        controller.pick(source, index)
      } catch {
        // fail-soft
      }
    },
  }
}

/**
 * 数据面 → 卡片 props 装配（投影读取 + 回调走同一 facade；额外 props 覆写注入）。
 * 提醒：投影是快照——宿主在 face.subscribe 回调里 rerender 即得流式增量上屏。
 */
export function miniComposerPropsOf(
  face: SuperComposerDataFace,
  extra?: Partial<MiniComposerProps>,
): MiniComposerProps {
  const draft = face.draftProjection()
  const stream = face.streamProjection()
  return {
    title: face.titleProjection(),
    draft: draft.draft,
    chipCount: draft.chipCount,
    messages: stream.messages,
    streaming: stream.streaming,
    onDraftChange: (text, caret) => {
      face.setDraft(text)
      face.trackMention(text, caret ?? text.length)
    },
    onSend: () => {
      face.submit()
    },
    onExitFullscreen: () => undefined,
    ...extra,
  }
}
