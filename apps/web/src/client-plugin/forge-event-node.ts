// loop-event-delivery 1.9 · 消息面事件折叠条目组——Chat 节点定义对（纯模块零 import——
// classic script bundle 自含纪律，progress-node.ts 同型）。
//
// 事件径消息 = source.kind 铸造的 user message（faces.ts：forge-dispatch / forge-loop /
// dispatch-loop-settled）。官方 ui-chat input-message 定义把它们归类为不可见 context 行
// （isVisibleChatNode 排除普通 context）——本对定义补折叠条目组渲染面：
//
//   ① forgeEventStreamDefinition（状态机，无 target——官方 inboxDefinition 同型）：
//      常量 id 单 Context 折叠全会话 user/message 流 → 分组模型（人类插话 = 分组
//      锚点：插话后事件开新组）。每次 user/message 到达 Context revision++ → 依赖
//      它的组节点全部重放（官方 reader dependency 机械）——组成员集合恒为最新。
//   ② forgeEventGroupDefinition（target 'chat'）：每条 forge 事件消息一个 Context
//      （id = 消息 id——id 键控增量渲染）；buildViewNode 仅组的末成员发射组块节点
//      （anchorSeq = 末成员 seq——组块锚在组尾，后续人类气泡自然排后），其余成员
//      null（零重复渲染）。
//
// 分组/成员判定全部为纯 fold（日志纯函数——事件重放/会话 fork 保真）。
// 数据守卫归壳树 views/session/forge-event-data.ts（1.17 报障收口先例——守卫归唯一
// runtime 消费者）。

/** forge 事件径消息的 source kind 集合（faces.ts 铸造三值——GUI 折叠判别单源） */
export const FORGE_EVENT_SOURCE_KINDS: readonly string[] = ['forge-dispatch', 'forge-loop', 'dispatch-loop-settled']

/** 组块 Chat 节点 kind（= conversation.chat.node keyed 槽 dispatch 键） */
export const FORGE_EVENT_NODE_KIND = 'forge-event-group'
/** 状态机 Context kind（reader.previous 查找键——两定义同源字符串） */
export const FORGE_EVENT_STREAM_KIND = 'forge-event-stream'
/** 官方 Chat 节点 keyed 槽（progress-node 同名洞） */
export const FORGE_EVENT_NODE_SLOT = 'conversation.chat.node'

/** 组内单条事件条目（消息文本解析产物——徽记/任务/摘要 + 原文整段） */
export interface ForgeEventEntry {
  /** 消息 id（增量渲染行键） */
  readonly id: string
  /** 事件 seq（时序锚） */
  readonly seq: number
  /** 事件时间（Unix epoch ms） */
  readonly time: number
  /** 场景章（文本头 `[forge·X]` 徽记词——启动/领取/完成/阻塞…） */
  readonly badge: string
  /** 任务标题（`任务: `/`任务源: ` 行值；缺省空串） */
  readonly title: string
  /** 摘要（source.summary 单行 headline；缺省回退首行） */
  readonly summary: string
  /** 消息原文（展开详情整段） */
  readonly text: string
}

/** 一个折叠条目组（组内 forge 事件连续无人类插话） */
export interface ForgeEventGroup {
  /** 组键 = 组首消息 id */
  readonly key: string
  /** 组首/组末 seq（组块位置锚 = lastSeq） */
  readonly firstSeq: number
  readonly lastSeq: number
  /** 组内条目（时序） */
  readonly entries: readonly ForgeEventEntry[]
}

/** 消息流折叠模型（state-only 单 Context 累积态；closed = 末组已被人类插话收口） */
export interface ForgeEventStreamState {
  readonly groups: readonly ForgeEventGroup[]
  readonly closed: boolean
}

/** 空模型（fold 单元恒等值） */
export const EMPTY_FORGE_EVENT_STREAM: ForgeEventStreamState = { groups: [], closed: true }

/** 事件消费切片（官方 SessionEvent 结构镜像：type/seq/time/data） */
export interface ForgeMessageEventLike {
  readonly type: string
  readonly seq: number
  readonly time?: number
  readonly data?: unknown
}

/** reader.previous 消费切片（官方 ConversationContextReader 窄面——state-only 查找） */
export interface ForgeStreamReader {
  previous(kind: string): { readonly state: unknown } | undefined
}

/** 官方节点座 context 消费切片（buildViewNode 入参——progress-node 同型） */
export interface ForgeEventNodeContext {
  readonly key: string
  readonly id: string
  readonly state?: unknown
  readonly start?: { readonly location?: unknown }
  readonly matches?: readonly { readonly location?: unknown }[]
}

/** user/message 数据消费切片（faces.ts forgeUserMessage 铸造形状镜像） */
interface ForgeMessageDataLike {
  readonly id?: unknown
  readonly content?: unknown
  readonly source?: unknown
}

function isForgeSource(source: unknown): boolean {
  if (typeof source !== 'object' || source === null) return false
  return FORGE_EVENT_SOURCE_KINDS.includes((source as { kind?: unknown }).kind as string)
}

/** 消息文本（content 首个 text block——官方 ContentBlock 窄读） */
function messageText(data: ForgeMessageDataLike): string {
  const content = data.content
  if (!Array.isArray(content)) return ''
  for (const block of content) {
    if (typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') return text
    }
  }
  return ''
}

/** 场景章（首行 `[forge·X]` 徽记词；缺省空串） */
export function forgeEventBadge(text: string): string {
  return /^\[forge·([^\]]+)\]/.exec(text)?.[1] ?? ''
}

/** 任务标题（`任务: `/`任务源: ` 行值——首个命中；缺省空串） */
export function forgeEventTitle(text: string): string {
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    for (const key of ['任务: ', '任务源: ']) {
      if (line.startsWith(key)) return line.slice(key.length).trim()
    }
  }
  return ''
}

/** 单条消息 → 条目（文本解析 + summary headline 回退首行；畸形消息保底原样） */
function entryOf(event: ForgeMessageEventLike, data: ForgeMessageDataLike): ForgeEventEntry {
  const text = messageText(data)
  const firstLine = text.split('\n')[0] ?? ''
  const summaryRaw = (data.source as { summary?: unknown } | undefined)?.summary
  const summary = typeof summaryRaw === 'string' && summaryRaw !== '' ? summaryRaw : firstLine
  return {
    id: String(data.id),
    seq: event.seq,
    time: typeof event.time === 'number' ? event.time : 0,
    badge: forgeEventBadge(text),
    title: forgeEventTitle(text),
    summary,
    text,
  }
}

/** fold 单元：一条 user/message → 下一模型（纯函数——重放保真；他形消息原引用返回） */
export function foldForgeEventMessage(state: ForgeEventStreamState, event: ForgeMessageEventLike): ForgeEventStreamState {
  if (event?.type !== 'user/message') return state
  const data = event.data as ForgeMessageDataLike | undefined
  const id = data !== undefined && typeof data.id === 'string' && data.id !== '' ? data.id : undefined
  if (data === undefined || id === undefined) return state
  const source = data.source
  if (isForgeSource(source)) {
    const entry = entryOf(event, data)
    const last = state.groups.at(-1)
    // 末组在场且未被插话收口 → 追加行（增量）；否则（首组 / 插话后）开新组
    if (last !== undefined && !state.closed) {
      return {
        closed: false,
        groups: [
          ...state.groups.slice(0, -1),
          { key: last.key, firstSeq: last.firstSeq, lastSeq: entry.seq, entries: [...last.entries, entry] },
        ],
      }
    }
    return { closed: false, groups: [...state.groups, { key: id, firstSeq: entry.seq, lastSeq: entry.seq, entries: [entry] }] }
  }
  if ((source as { kind?: unknown } | undefined)?.kind === 'user') {
    // 人类插话 = 分组锚点：下一枚 forge 事件开新组（前组保留——条目不删）
    return { groups: state.groups, closed: true }
  }
  return state
}

/**
 * 状态机定义（uiConversation.events.register 消费形状——无 target 的 state-only
 * Context，official inboxDefinition 同型：常量 id 单 Context 累积全会话消息流，
 * publication 'none' 零渲染成本；revision 随每次 user/message 递增驱动组节点重放）。
 */
export const forgeEventStreamDefinition = {
  kind: FORGE_EVENT_STREAM_KIND,
  match: (event: ForgeMessageEventLike): { id: string; role: 'start' } | null =>
    event !== undefined && event.type === 'user/message' ? { id: 'stream', role: 'start' } : null,
  start: (_context: unknown, match: { event: ForgeMessageEventLike }, reader: ForgeStreamReader): ForgeEventStreamState => {
    const base = reader?.previous?.(FORGE_EVENT_STREAM_KIND)?.state
    return foldForgeEventMessage(typeof base === 'object' && base !== null ? (base as ForgeEventStreamState) : EMPTY_FORGE_EVENT_STREAM, match.event)
  },
  update: (context: { state: ForgeEventStreamState }, match: { event: ForgeMessageEventLike }): ForgeEventStreamState =>
    foldForgeEventMessage(context.state, match.event),
  publication: (): 'none' => 'none',
}

/** 组块节点定义状态（发射判定 + 组模型快照——start 时点经 reader 窄读 stream 即时求值） */
export interface ForgeEventGroupNodeState {
  /** 我是所在组末成员（组块唯一发射者——他成员 null 零重复渲染） */
  readonly emit: boolean
  /** 所在组为最新组（组块默认展开；前组默认收起） */
  readonly isLatest: boolean
  /** 组模型快照 */
  readonly group: ForgeEventGroup
  /** 本消息 seq（发射时点 = 组末 seq——anchorSeq 锚） */
  readonly seq: number
}

/** stream 状态消费窄读（形状防御——他形不猜） */
function streamStateOf(value: unknown): ForgeEventStreamState | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = value as { groups?: unknown; closed?: unknown }
  if (!Array.isArray(raw.groups) || typeof raw.closed !== 'boolean') return undefined
  return value as ForgeEventStreamState
}

/**
 * 组块节点定义（target 'chat'）：每条 forge 事件消息一个 Context（id = 消息 id——
 * id 键控增量渲染）。发射判定 = start 时点经 reader 窄读 stream 状态（挂依赖——
 * 新消息到达 stream revision++ → 全体组 Context 重放，末成员交棒：渲染面恒
 * 一组一块、位置恒锚组尾）。
 */
export const forgeEventGroupDefinition = {
  kind: 'forge-event-group-view',
  target: 'chat',
  match: (event: ForgeMessageEventLike): { id: string; role: 'start' } | null => {
    if (event === undefined || event.type !== 'user/message') return null
    const data = event.data as ForgeMessageDataLike | undefined
    if (data === undefined || typeof data.id !== 'string' || data.id === '') return null
    return isForgeSource(data.source) ? { id: data.id, role: 'start' } : null
  },
  start: (_context: unknown, match: { event: ForgeMessageEventLike }, reader: ForgeStreamReader): ForgeEventGroupNodeState => {
    const msgId = String((match.event.data as ForgeMessageDataLike).id)
    const seq = match.event.seq
    const stream = streamStateOf(reader?.previous?.(FORGE_EVENT_STREAM_KIND)?.state)
    const group = stream?.groups.find((candidate) => candidate.entries.some((entry) => entry.id === msgId))
    if (stream === undefined || group === undefined) return { emit: false, isLatest: false, group: { key: msgId, firstSeq: seq, lastSeq: seq, entries: [] }, seq }
    const last = stream.groups.at(-1)
    return {
      emit: group.entries.at(-1)?.id === msgId,
      isLatest: last !== undefined && last.key === group.key,
      group,
      seq,
    }
  },
  update: (context: { state: ForgeEventGroupNodeState }): ForgeEventGroupNodeState => context.state,
  publication: (): 'none' => 'none',
  buildViewNode: (context: ForgeEventNodeContext & { state?: ForgeEventGroupNodeState }): unknown | null => {
    const state = context.state
    if (state === undefined || !state.emit || state.group.entries.length === 0) return null
    // location 契约必填（ChatConversationViewNode.location——官方 store updateTurnKind
    // 直读 location.kind）：start/matches 携带 location 则透传，否则 unresolved。
    const location = context.start?.location ?? context.matches?.[0]?.location ?? { kind: 'unresolved' }
    return {
      key: context.key,
      kind: FORGE_EVENT_NODE_KIND,
      id: context.id,
      target: 'chat',
      anchorSeq: state.seq,
      location,
      visibility: 'visible',
      data: { key: state.group.key, firstSeq: state.group.firstSeq, lastSeq: state.group.lastSeq, isLatest: state.isLatest, entries: state.group.entries },
    }
  },
}
