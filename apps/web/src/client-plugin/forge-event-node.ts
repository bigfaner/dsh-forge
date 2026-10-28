// loop-event-delivery 1.9 · 消息面事件折叠条目组——Chat 节点定义对（纯模块零 import——
// classic script bundle 自含纪律，progress-node.ts 同型）。
// loop-message-consolidation 1.2：组模型扩收 'forge/progress' 事件（循环进度卡数据源）
// ——progress 条目与消息条目同组 fold、尾成员发射/交棒（新 progress 到达即组块重放，
// 任务行原地更新零新条目）；聚合面归壳树 forge-event-data.ts（数据守卫唯一 runtime
// 消费者纪律——client 树只透传条目）。
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
//      回同 key + visibility:'hidden'（官方增量 flush 禁已物化 target 回 null——
//      client.js:2505 withdrew 断言；hidden 保底零重复渲染）。
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

/** 'forge/progress' 会话事件类型键（plugin-forge FORGE_PROGRESS_EVENT_TYPE 字面量镜像——零跨包 import） */
export const FORGE_PROGRESS_EVENT_TYPE = 'forge/progress'
/** progress 组块节点 Context id 前缀（与消息 id 命名空间隔离——1.17 'forge-progress-<seq>' 避撞） */
export const FORGE_EVENT_PROGRESS_ID_PREFIX = 'forge-event-progress-'

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
  /** 归属 turn id（turn/start–turn/end 戳——组卡 re-anchor 基准；旧缓存缺省） */
  readonly turnId?: string
}

/** 一个折叠条目组（组内 forge 事件连续无人类插话） */
export interface ForgeEventGroup {
  /** 组键 = 组首消息 id（纯 progress 组 = `forge-progress-<seq>`） */
  readonly key: string
  /** 组首/组末 seq（组块位置锚 = lastSeq——消息与 progress 条目同轨推进） */
  readonly firstSeq: number
  readonly lastSeq: number
  /** 组内条目（时序） */
  readonly entries: readonly ForgeEventEntry[]
  /** 组内 'forge/progress' 事件条目（1.2 循环进度卡数据源；旧缓存缺省） */
  readonly progress?: readonly ForgeProgressEntry[]
}

/** 组内单条 'forge/progress' 事件条目（plugin-forge ForgeProgressEventData 窄收镜像 + 事件 seq） */
export interface ForgeProgressEntry {
  /** 事件 seq（时序/发射锚） */
  readonly seq: number
  readonly sourceSlug: string
  readonly status: string
  readonly verb: string
  readonly taskKey?: string
  readonly taskTitle?: string
  readonly scenario?: string
  readonly note?: string
  /** 事件时间（Unix epoch ms——起止/耗时取此） */
  readonly at: number
}

/** 消息流折叠模型（state-only 单 Context 累积态；closed = 末组已被人类插话收口） */
export interface ForgeEventStreamState {
  readonly groups: readonly ForgeEventGroup[]
  readonly closed: boolean
  /** 当前归属 turn id（turn/start–turn/end 戳——条目归属锚） */
  readonly currentTurn?: string
  /** 各 turn 的 turn/end seq（组卡 re-anchor 基准——anchorSeq ≥ answerAnchorSeq 脱离过程折叠） */
  readonly turnEndSeqs?: Readonly<Record<string, number>>
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

/** 官方节点座 context 消费切片（buildViewNode 入参——progress-node 同型；match 携带
 *  原始事件供 seq 兜底锚——official contextSnapshot 透传全量 match） */
export interface ForgeEventNodeContext {
  readonly key: string
  readonly id: string
  readonly state?: unknown
  readonly start?: { readonly location?: unknown; readonly event?: { readonly seq?: number } }
  readonly matches?: readonly { readonly location?: unknown; readonly event?: { readonly seq?: number } }[]
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

/** 单条消息 → 条目（文本解析 + summary headline 回退首行剥徽记；畸形消息保底原样） */
function entryOf(event: ForgeMessageEventLike, data: ForgeMessageDataLike, turnId: string | undefined): ForgeEventEntry {
  const text = messageText(data)
  const firstLine = text.split('\n')[0] ?? ''
  const summaryRaw = (data.source as { summary?: unknown } | undefined)?.summary
  const summary =
    typeof summaryRaw === 'string' && summaryRaw !== ''
      ? summaryRaw
      : firstLine.replace(/^\[forge·[^\]]+\]\s*/, '')
  return {
    id: String(data.id),
    seq: event.seq,
    time: typeof event.time === 'number' ? event.time : 0,
    badge: forgeEventBadge(text),
    title: forgeEventTitle(text),
    summary,
    text,
    ...(turnId !== undefined ? { turnId } : {}),
  }
}

/** 可选字符串位窄收（非空串才收——载荷缺位/畸形 = undefined 不猜） */
function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** 'forge/progress' 载荷 → 组内条目（窄收守卫——必填位缺失/畸形 = undefined 弃事件，fold 原态返回） */
function progressEntryOf(event: ForgeMessageEventLike, data: unknown): ForgeProgressEntry | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const raw = data as Record<string, unknown>
  if (typeof raw['sourceSlug'] !== 'string' || raw['sourceSlug'] === '') return undefined
  if (typeof raw['at'] !== 'number' || !Number.isFinite(raw['at'])) return undefined
  return {
    seq: event.seq,
    sourceSlug: raw['sourceSlug'],
    status: optionalString(raw['status']) ?? '',
    verb: optionalString(raw['verb']) ?? '',
    taskKey: optionalString(raw['taskKey']),
    taskTitle: optionalString(raw['taskTitle']),
    scenario: optionalString(raw['scenario']),
    note: optionalString(raw['note']),
    at: raw['at'],
  }
}

/** turn 序号规一（官方 SessionEventMap 'turn/start'/'turn/end' 载荷 = { turn: number }——
 *  数值序号转字符串键；字符串兼容旧缓存形状。bug d44fbaec：只认字符串曾致 turn 追踪恒失效，
 *  组卡锚不脱 turn 过程折叠） */
function turnKeyOf(turn: unknown): string | undefined {
  return typeof turn === 'number' && Number.isFinite(turn) ? String(turn) : typeof turn === 'string' && turn !== '' ? turn : undefined
}

/** fold 单元：一条事件 → 下一模型（纯函数——重放保真；他形事件原引用返回） */
export function foldForgeEventMessage(state: ForgeEventStreamState, event: ForgeMessageEventLike): ForgeEventStreamState {
  if (event?.type === 'turn/start') {
    const turnId = turnKeyOf((event.data as { turn?: unknown } | undefined)?.turn)
    return turnId !== undefined ? { ...state, currentTurn: turnId } : state
  }
  if (event?.type === 'turn/end') {
    const turnId = turnKeyOf((event.data as { turn?: unknown } | undefined)?.turn)
    if (turnId === undefined) return state
    return {
      ...state,
      currentTurn: state.currentTurn === turnId ? undefined : state.currentTurn,
      turnEndSeqs: { ...state.turnEndSeqs, [turnId]: event.seq },
    }
  }
  // 'forge/progress' 事件（1.2 循环进度卡数据源）：同组 fold 语义——开组中追加 progress
  // 条目（lastSeq 推进 = 组尾轨）；插话后/首枚开新组。畸形载荷原引用返回零污染。
  if (event?.type === FORGE_PROGRESS_EVENT_TYPE) {
    const entry = progressEntryOf(event, event.data)
    if (entry === undefined) return state
    const last = state.groups.at(-1)
    if (last !== undefined && !state.closed) {
      return {
        closed: false,
        currentTurn: state.currentTurn,
        turnEndSeqs: state.turnEndSeqs,
        groups: [
          ...state.groups.slice(0, -1),
          {
            key: last.key,
            firstSeq: last.firstSeq,
            lastSeq: entry.seq,
            entries: last.entries,
            progress: [...(last.progress ?? []), entry],
          },
        ],
      }
    }
    return {
      closed: false,
      currentTurn: state.currentTurn,
      turnEndSeqs: state.turnEndSeqs,
      groups: [
        ...state.groups,
        { key: `forge-progress-${entry.seq}`, firstSeq: entry.seq, lastSeq: entry.seq, entries: [], progress: [entry] },
      ],
    }
  }
  if (event?.type !== 'user/message') return state
  const data = event.data as ForgeMessageDataLike | undefined
  const id = data !== undefined && typeof data.id === 'string' && data.id !== '' ? data.id : undefined
  if (data === undefined || id === undefined) return state
  const source = data.source
  if (isForgeSource(source)) {
    const entry = entryOf(event, data, state.currentTurn)
    const last = state.groups.at(-1)
    // 末组在场且未被插话收口 → 追加行（增量）；否则（首组 / 插话后）开新组
    if (last !== undefined && !state.closed) {
      return {
        closed: false,
        currentTurn: state.currentTurn,
        turnEndSeqs: state.turnEndSeqs,
        groups: [
          ...state.groups.slice(0, -1),
          { key: last.key, firstSeq: last.firstSeq, lastSeq: entry.seq, entries: [...last.entries, entry], progress: last.progress },
        ],
      }
    }
    return {
      closed: false,
      currentTurn: state.currentTurn,
      turnEndSeqs: state.turnEndSeqs,
      groups: [...state.groups, { key: id, firstSeq: entry.seq, lastSeq: entry.seq, entries: [entry] }],
    }
  }
  if ((source as { kind?: unknown } | undefined)?.kind === 'user') {
    // 人类插话 = 分组锚点：下一枚 forge 事件开新组（前组保留——条目不删）
    return { groups: state.groups, closed: true, currentTurn: state.currentTurn, turnEndSeqs: state.turnEndSeqs }
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
    event !== undefined &&
    (event.type === 'user/message' || event.type === 'turn/start' || event.type === 'turn/end' || event.type === FORGE_PROGRESS_EVENT_TYPE)
      ? { id: 'stream', role: 'start' }
      : null,
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
  /**
   * 组卡锚 seq：所属 turn 已结束 = 该 turn 的 turn/end seq（≥ answerAnchorSeq——脱离
   * Turn 过程折叠，卡片落回复下方，文档卡片同位）；turn 未结束 = 组末 seq（活跃 turn
   * 过程折叠恒开——卡可见随组尾）。
   */
  readonly anchorSeq: number
}

/** stream 状态消费窄读（形状防御——他形不猜） */
function streamStateOf(value: unknown): ForgeEventStreamState | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = value as { groups?: unknown; closed?: unknown }
  if (!Array.isArray(raw.groups) || typeof raw.closed !== 'boolean') return undefined
  return value as ForgeEventStreamState
}

/** 组卡锚 seq（纯函数）：末到达为消息条目且所属 turn 已结束 = 该 turn 的 turn/end seq
 *  （≥ answerAnchorSeq——脱离 Turn 过程折叠，卡片落回复下方）；末到达为 progress 条目
 *  （活跃进度轨）或 turn 缺席 = 组末 seq（lastSeq——消息与 progress 同轨推进）。 */
export function forgeEventGroupAnchorSeq(group: ForgeEventGroup, turnEndSeqs: Readonly<Record<string, number>> | undefined): number {
  const last = group.entries.at(-1)
  const lastProgressSeq = group.progress?.at(-1)?.seq ?? -1
  if (last !== undefined && lastProgressSeq < last.seq) {
    const end = last.turnId !== undefined ? turnEndSeqs?.[last.turnId] : undefined
    if (end !== undefined) return end
  }
  return group.lastSeq
}

/**
 * 组块节点定义（target 'chat'）：每条 forge 事件消息一个 Context（id = 消息 id——
 * id 键控增量渲染）。发射判定 = start 时点经 reader 窄读 stream 状态（挂依赖——
 * 新消息/turn 生命周期到达 stream revision++ → 全体组 Context 重放，末成员交棒：
 * 渲染面恒一组一块、位置恒锚组尾；turn 结束后 re-anchor 到 turn/end seq——卡片落
 * 回复下方，脱离过程折叠）。
 */
export const forgeEventGroupDefinition = {
  kind: 'forge-event-group-view',
  target: 'chat',
  match: (event: ForgeMessageEventLike): { id: string; role: 'start' } | null => {
    if (event === undefined || event.type === undefined) return null
    if (event.type === FORGE_PROGRESS_EVENT_TYPE) {
      return { id: `${FORGE_EVENT_PROGRESS_ID_PREFIX}${String(event.seq)}`, role: 'start' }
    }
    if (event.type !== 'user/message') return null
    const data = event.data as ForgeMessageDataLike | undefined
    if (data === undefined || typeof data.id !== 'string' || data.id === '') return null
    return isForgeSource(data.source) ? { id: data.id, role: 'start' } : null
  },
  start: (_context: unknown, match: { event: ForgeMessageEventLike }, reader: ForgeStreamReader): ForgeEventGroupNodeState => {
    const seq = match.event.seq
    const isProgress = match.event.type === FORGE_PROGRESS_EVENT_TYPE
    const msgId = isProgress ? `${FORGE_EVENT_PROGRESS_ID_PREFIX}${String(seq)}` : String((match.event.data as ForgeMessageDataLike).id)
    const stream = streamStateOf(reader?.previous?.(FORGE_EVENT_STREAM_KIND)?.state)
    const group = stream?.groups.find((candidate) =>
      isProgress
        ? (candidate.progress?.some((entry) => entry.seq === seq) ?? false)
        : candidate.entries.some((entry) => entry.id === msgId),
    )
    if (stream === undefined || group === undefined)
      return { emit: false, isLatest: false, group: { key: msgId, firstSeq: seq, lastSeq: seq, entries: [] }, seq, anchorSeq: seq }
    const last = stream.groups.at(-1)
    return {
      emit: group.lastSeq === seq,
      isLatest: last !== undefined && last.key === group.key,
      group,
      seq,
      anchorSeq: forgeEventGroupAnchorSeq(group, stream.turnEndSeqs),
    }
  },
  update: (context: { state: ForgeEventGroupNodeState }): ForgeEventGroupNodeState => context.state,
  publication: (): 'none' => 'none',
  buildViewNode: (context: ForgeEventNodeContext & { state?: ForgeEventGroupNodeState }): unknown => {
    // 永不回 null（官方钦定，dsh-client-ui-conversation client.js:2505 buildTargetUpserts
    // 对已物化 target 回 null 即抛 withdrew materialized target）。Root cause: 官方
    // replayContexts（client.js:2248-2257）在 Context 的 start match 被窗口/裁剪淘汰后
    // 置 context.state = void 0——Context 仍留 contextsByTarget 且 context.current 保有
    // 上次物化节点，state===undefined ≠ 从未物化；0c48a365 只保了 state 在场路径，漏此
    // 分支致 withdrew 复发。undefined 亦回同 key 同 id（与首物化严格一致）visibility
    // :'hidden' 保底节点——锚 seq 以 start/matches 携带的事件 seq 兜底，零数据可给空组。
    const state = streamStateOk(context.state) ? context.state : undefined
    const fallbackSeq = context.start?.event?.seq ?? context.matches?.[0]?.event?.seq ?? 0
    const group = state?.group ?? { key: context.id, firstSeq: fallbackSeq, lastSeq: fallbackSeq, entries: [] }
    // location 契约必填（ChatConversationViewNode.location——官方 store updateTurnKind
    // 直读 location.kind）：start/matches 携带 location 则透传，否则 unresolved。
    const location = context.start?.location ?? context.matches?.[0]?.location ?? { kind: 'unresolved' }
    const visible = state !== undefined && state.emit && (group.entries.length > 0 || (group.progress?.length ?? 0) > 0)
    return {
      key: context.key,
      kind: FORGE_EVENT_NODE_KIND,
      id: context.id,
      target: 'chat',
      anchorSeq: state?.anchorSeq ?? fallbackSeq,
      location,
      visibility: visible ? 'visible' : 'hidden',
      data: {
        key: group.key,
        firstSeq: group.firstSeq,
        lastSeq: group.lastSeq,
        isLatest: state?.isLatest ?? false,
        entries: group.entries,
        progress: group.progress ?? [],
      },
    }
  },
}

/** 组节点状态形状守卫（官方快照透传面畸形不猜——回退 undefined 走 hidden 保底） */
function streamStateOk(value: unknown): value is ForgeEventGroupNodeState {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as { emit?: unknown }).emit === 'boolean' && typeof (value as { group?: unknown }).group === 'object'
}
