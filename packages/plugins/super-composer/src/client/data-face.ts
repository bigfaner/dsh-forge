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

/** SessionEventWindow 消费切片（contract/events.d.ts:20-63） */
export interface EventWindowMirror {
  readonly entries: readonly EventEntryMirror[]
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

/** span-CAS 构造（草稿末尾 + 当前 draftRev——open-session.ts tailSpanOf 同源）。 */
export function tailSpanOf(state: InputStateMirror): TokenSpanMirror {
  return { start: state.draft.length, end: state.draft.length, draftRev: state.draftRev }
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
  /** 草稿投影（draft + occurrences chip 行计数；会话缺席 = 空态） */
  draftProjection(): { readonly draft: string; readonly chipCount: number }
  /** 整体替换草稿（同一草稿机 setDraft 同径） */
  setDraft(text: string): void
  /** 草稿尾插入原生引用 chip（span-CAS + bail slash/input-insert-reference 官方径） */
  insertReference(reference: ReferenceInsertMirror): boolean
  /** 进入提交（官方发送链 submit 同径——含 slash 仲裁与默认 sink） */
  submit(): void
  /** 消息流投影（同一 eventSource 快照——durable + 流式增量 + streaming 旗标） */
  streamProjection(): { readonly messages: readonly MiniComposerMessage[]; readonly streaming: boolean }
  /** mention 官方 controller（inputTriggers.sessionOf；服务/会话缺席 = undefined） */
  mention(): TriggerControllerMirror | undefined
  /** 官方 trigger 检测入口转发（草稿/光标变更时调用——菜单开合由官方 controller 决定） */
  trackMention(draft: string, caret: number): void
  /** 变更订阅（input state store + eventSource 扇出；返回退订） */
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

  const attachSessionSubs = (listener: () => void): boolean => {
    const binding = bindingOf(services)
    if (binding === undefined) return false
    let attachedAnything = false
    if (!stateSubAttached) {
      const state = faceOf(services)?.state
      if (state?.subscribe !== undefined) {
        try {
          const off = state.subscribe(listener)
          if (typeof off === 'function') inputOffs.add(off)
          stateSubAttached = true
          attachedAnything = true
        } catch {
          // fail-soft（下一轮重试）
        }
      }
    }
    if (!menuSubAttached) {
      const triggers = services.inputTriggers
      if (triggers !== undefined) {
        try {
          const menu = triggers.sessionOf(binding.ctx)?.menu
          if (typeof menu?.subscribe === 'function') {
            const off = menu.subscribe(listener)
            if (typeof off === 'function') inputOffs.add(off)
            menuSubAttached = true
            attachedAnything = true
          }
        } catch {
          // fail-soft（下一轮重试）
        }
      }
    }
    if (!eventSourceSubAttached) {
      try {
        const off = binding.eventSource.subscribe(listener)
        if (typeof off === 'function') inputOffs.add(off)
        eventSourceSubAttached = true
        attachedAnything = true
      } catch {
        // fail-soft（下一轮重试）
      }
    }
    return attachedAnything
  }

  const onSources = (listener: () => void): void => {
    // sessions.list 订阅恒挂（会话后到——挂载时 binding 缺席也要在会话在留后扇出
    // 重渲染并补挂每会话源订阅）
    try {
      const list = (services.sessions as { list?: { subscribe?: (l: () => void) => () => void } } | undefined)?.list
      if (typeof list?.subscribe === 'function') {
        const off = list.subscribe(() => {
          attachSessionSubs(listener)
          listener()
        })
        if (typeof off === 'function') inputOffs.add(off)
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
      return { draft: state?.draft ?? '', chipCount: state?.occurrences?.length ?? 0 }
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
    submit() {
      try {
        faceOf(services)?.submit(undefined, 'enter')
      } catch {
        // fail-soft
      }
    },
    streamProjection() {
      const binding = bindingOf(services)
      if (binding === undefined) return { messages: [], streaming: false }
      try {
        return projectEventWindow(binding.eventSource.getSnapshot())
      } catch {
        return { messages: [], streaming: false }
      }
    },
    mention() {
      const binding = bindingOf(services)
      const triggers = services.inputTriggers
      if (binding === undefined || triggers === undefined) return undefined
      try {
        return triggers.sessionOf(binding.ctx)
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
        for (const off of inputOffs) {
          try {
            off()
          } catch {
            // fail-soft
          }
        }
        inputOffs.clear()
      }
    },
    syncSubscriptions(listener) {
      if (disposed) return true
      return attachSessionSubs(listener)
    },
    dispose() {
      disposed = true
      for (const off of inputOffs) {
        try {
          off()
        } catch {
          // fail-soft
        }
      }
      inputOffs.clear()
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
    title: '',
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
