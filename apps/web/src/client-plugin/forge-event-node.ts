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
/** 官方 Chat 目标键（forgeEventGroupDefinition.target 与 previousStateOf 窄读同源） */
const CHAT_TARGET = 'chat'

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
  /** 执行专家键（claim 时点解析；旧缓存/未解析 = 缺省——窄收镜像 optionalString） */
  readonly expertKey?: string
  readonly scenario?: string
  readonly note?: string
  /** 处置 attempt 序号（triage 处置族专用——载荷字段镜像，缺席/畸形 = 缺省） */
  readonly attempt?: number
  /** 事件时间（Unix epoch ms——起止/耗时取此） */
  readonly at: number
  /** 归属 turn id（fold 时点 currentTurn 戳——bug 6a3ccc4d progress 轨 re-anchor 基准；旧缓存缺省） */
  readonly turnId?: string
}

/** 消息流折叠模型（state-only 单 Context 累积态；closed = 末组已被人类插话收口） */
export interface ForgeEventStreamState {
  readonly groups: readonly ForgeEventGroup[]
  readonly closed: boolean
  /** 当前归属 turn id（turn/start–turn/end 戳——条目归属锚） */
  readonly currentTurn?: string
  /** 各 turn 的 turn/end seq（组卡 re-anchor 基准——anchorSeq ≥ answerAnchorSeq 脱离过程折叠） */
  readonly turnEndSeqs?: Readonly<Record<string, number>>
  /** 各 turn 的 turn/start seq（组卡运行期锚基准——活跃期 anchorSeq = startSeq - 1 < processStartSeq 脱折叠；旧缓存缺省） */
  readonly turnStartSeqs?: Readonly<Record<string, number>>
  /**
   * 各 turn 是否产出过正文 answer（bug 0e5eba85——官方 latestAnswer 选择口径窄镜像：
   * turn/start 初始化 false，此后 assistant/message（surfaceOp 'append'）按官方判定
   * 逐消息覆写——末步 assistant 决定该 turn 有无 answer；缺席 = 旧缓存不参与逃逸
   * 判定，维持 turn/end 现口径）。closed turn 显式 false 时组卡锚顶层逃逸。
   */
  readonly turnHasAnswer?: Readonly<Record<string, boolean>>
}

/** 空模型（fold 单元恒等值） */
export const EMPTY_FORGE_EVENT_STREAM: ForgeEventStreamState = { groups: [], closed: true }

/** 事件消费切片（官方 SessionEvent 结构镜像：type/seq/time/data） */
export interface ForgeMessageEventLike {
  readonly type: string
  readonly seq: number
  readonly time?: number
  /** 官方 SessionEvent surfaceOp（assistant/message 窄读用——bug 0e5eba85 answer 感知） */
  readonly surfaceOp?: unknown
  readonly data?: unknown
}

/** reader.previous 消费切片（官方 ConversationContextReader 窄面——state-only 查找） */
export interface ForgeStreamReader {
  previous(kind: string): { readonly state: unknown } | undefined
}

/** 官方节点座 context 消费切片（buildViewNode 入参——progress-node 同型；match 携带
 *  原始事件供保底现算——official contextSnapshot 透传全量 match 与 current） */
export interface ForgeEventNodeContext {
  readonly key: string
  readonly id: string
  readonly state?: unknown
  readonly start?: { readonly location?: unknown; readonly event?: ForgeMessageEventLike }
  readonly matches?: readonly { readonly location?: unknown; readonly event?: ForgeMessageEventLike }[]
  /** 官方 contextSnapshot.current 窄读（target → 上次物化节点——state 被窗口裁剪 void
   *  后的保真现算源：全量组快照 + 物化锚 + 可见性） */
  readonly current?: { readonly get: (target: string) => unknown }
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

/** 可选正整数位窄收（attempt 处置序号——载荷缺位/畸形 = undefined 不猜） */
function optionalAttempt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined
}

/** 'forge/progress' 载荷 → 组内条目（窄收守卫——必填位缺失/畸形 = undefined 弃事件，fold 原态返回） */
function progressEntryOf(event: ForgeMessageEventLike, data: unknown, turnId: string | undefined): ForgeProgressEntry | undefined {
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
    expertKey: optionalString(raw['expertKey']),
    scenario: optionalString(raw['scenario']),
    note: optionalString(raw['note']),
    ...(optionalAttempt(raw['attempt']) !== undefined ? { attempt: optionalAttempt(raw['attempt']) } : {}),
    at: raw['at'],
    ...(turnId !== undefined ? { turnId } : {}),
  }
}

/**
 * assistant message 是否构成正文 answer（bug 0e5eba85——官方 latestAnswer 选择口径
 * 窄镜像：含非空 text 块（tool-call/reasoning 不计正文）且不含 tool-call 块——后者
 * 官方 latestAnswer 直接判 null）。
 */
function isAnswerMessage(content: unknown): boolean {
  if (!Array.isArray(content)) return false
  let hasText = false
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const type = (block as { type?: unknown }).type
    if (type === 'tool-call') return false
    if (type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string' && text.trim() !== '') hasText = true
    }
  }
  return hasText
}

/** turn 序号规一（官方 SessionEventMap 'turn/start'/'turn/end' 载荷 = { turn: number }——
 *  数值序号转字符串键；字符串兼容旧缓存形状。bug d44fbaec：只认字符串曾致 turn 追踪恒失效，
 *  组卡锚不脱 turn 过程折叠） */
function turnKeyOf(turn: unknown): string | undefined {
  return typeof turn === 'number' && Number.isFinite(turn) ? String(turn) : typeof turn === 'string' && turn !== '' ? turn : undefined
}

/** 条目 turnId 兜底归属（bug c75df032）：currentTurn 缺席时到达的 forge 条目——取
 *  turn/end seq ≥ 条目 seq 的最近一个 turn（条目落其过程区间内的已记录 turn）；
 *  无任何覆盖 turn = undefined 不猜。 */
function fallbackTurnIdOf(seq: number, turnEndSeqs: Readonly<Record<string, number>> | undefined): string | undefined {
  if (turnEndSeqs === undefined) return undefined
  let best: string | undefined
  let bestSeq = Number.POSITIVE_INFINITY
  for (const [turnId, endSeq] of Object.entries(turnEndSeqs)) {
    if (endSeq >= seq && endSeq < bestSeq) {
      bestSeq = endSeq
      best = turnId
    }
  }
  return best
}

/** fold 单元：一条事件 → 下一模型（纯函数——重放保真；他形事件原引用返回） */
export function foldForgeEventMessage(state: ForgeEventStreamState, event: ForgeMessageEventLike): ForgeEventStreamState {
  if (event?.type === 'turn/start') {
    const turnId = turnKeyOf((event.data as { turn?: unknown } | undefined)?.turn)
    if (turnId === undefined) return state
    return {
      ...state,
      currentTurn: turnId,
      turnStartSeqs: { ...state.turnStartSeqs, [turnId]: event.seq },
      // bug 0e5eba85：新 turn 初始化无 answer（缺席 = 旧缓存不参与逃逸判定——
      // 形状防御同 turnStartSeqs 风格）；此后由 assistant/message 逐消息覆写。
      turnHasAnswer: { ...state.turnHasAnswer, [turnId]: state.turnHasAnswer?.[turnId] === true },
    }
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
  // bug 0e5eba85：assistant/message fold——per-turn 正文 answer 感知（官方 latestAnswer
  // 选择口径窄镜像：surfaceOp 'append' + data.message.content 判定，逐消息覆写——末步
  // assistant 决定该 turn 有无 answer）。畸形载荷 / turn 归属缺席原引用返回零污染。
  // 消费面见 forgeEventGroupAnchorSeq（closed turn 无 answer → 锚顶层逃逸）。
  if (event?.type === 'assistant/message') {
    const message = (event.data as { message?: unknown } | undefined)?.message
    if (event.surfaceOp !== 'append' || typeof message !== 'object' || message === null) return state
    const turnId = state.currentTurn
    if (turnId === undefined) return state
    return { ...state, turnHasAnswer: { ...state.turnHasAnswer, [turnId]: isAnswerMessage((message as { content?: unknown }).content) } }
  }
  // 'forge/progress' 事件（1.2 循环进度卡数据源）：同组 fold 语义——开组中追加 progress
  // 条目（lastSeq 推进 = 组尾轨）；插话后/首枚开新组。畸形载荷原引用返回零污染。
  if (event?.type === FORGE_PROGRESS_EVENT_TYPE) {
    // bug c75df032：currentTurn 缺席（如终局 settle 先于 wake turn/start 到达）时
    // 兜底归属覆盖条目 seq 的已记录 turn——锚可脱其过程折叠体。
    const entry = progressEntryOf(event, event.data, state.currentTurn ?? fallbackTurnIdOf(event.seq, state.turnEndSeqs))
    if (entry === undefined) return state
    const last = state.groups.at(-1)
    if (last !== undefined && !state.closed) {
      return {
        ...state,
        closed: false,
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
      ...state,
      closed: false,
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
    const entry = entryOf(event, data, state.currentTurn ?? fallbackTurnIdOf(event.seq, state.turnEndSeqs))
    const last = state.groups.at(-1)
    // 末组在场且未被插话收口 → 追加行（增量）；否则（首组 / 插话后）开新组
    if (last !== undefined && !state.closed) {
      return {
        ...state,
        closed: false,
        groups: [
          ...state.groups.slice(0, -1),
          { key: last.key, firstSeq: last.firstSeq, lastSeq: entry.seq, entries: [...last.entries, entry], progress: last.progress },
        ],
      }
    }
    return {
      ...state,
      closed: false,
      groups: [...state.groups, { key: id, firstSeq: entry.seq, lastSeq: entry.seq, entries: [entry] }],
    }
  }
  if ((source as { kind?: unknown } | undefined)?.kind === 'user') {
    // 人类插话 = 分组锚点：下一枚 forge 事件开新组（前组保留——条目不删）
    return { ...state, closed: true }
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
    (event.type === 'user/message' ||
      event.type === 'turn/start' ||
      event.type === 'turn/end' ||
      event.type === 'assistant/message' ||
      event.type === FORGE_PROGRESS_EVENT_TYPE)
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
   * Turn 过程折叠，卡片落回复下方，文档卡片同位）；所属 turn 活跃（有 turn/start 记录、
   * 无 turn/end）= turnStartSeq - 1——< processStartSeq 脱离过程折叠区间，运行期顶层
   * 常驻展开（用户裁决 2026-10-31）；无 turn 记录 = 组末 seq 不猜。
   * bug 0e5eba85：closed turn 无正文 answer（turnHasAnswer 缺席）同取
   * turnStartSeq - 1 顶层逃逸——answerAnchorSeq=null 时 turn/end 锚仍落过程折叠体。
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

/** 组卡锚 seq（纯函数）：组末到达条目（消息或 progress——bug 6a3ccc4d 前只认消息条目，
 *  progress 轨活跃时锚滞留组末 seq 落入过程折叠体、turn 结束后不重锚）。
 *  - 所属 turn 已结束（turnEndSeqs 有记录）= 该 turn 的 turn/end seq（≥ answerAnchorSeq
 *    ——脱离 Turn 过程折叠，卡片落会话流顶层回复下方，文档卡片同位）。
 *  - 所属 turn 活跃（turnStartSeqs 有记录、无 turn/end）= turnStartSeq - 1——官方
 *    processMember 判据（dsh-client-ui-chat client.js:1689；processStartSeq =
 *    turn.start?.seq client.js:10050）下 anchorSeq < processStartSeq 即非过程成员：
 *    循环活跃期间卡片不随「已完成分析/已调用工具」过程段折叠收纳，顶层常驻展开。
 *  - 无 turn 记录（旧缓存）= 走下方回落分支，不猜。 */
export function forgeEventGroupAnchorSeq(
  group: ForgeEventGroup,
  turnEndSeqs: Readonly<Record<string, number>> | undefined,
  turnStartSeqs: Readonly<Record<string, number>> | undefined,
  turnHasAnswer?: Readonly<Record<string, boolean>>,
): number {
  const lastMsg = group.entries.at(-1)
  const lastProgress = group.progress?.at(-1)
  const tail = (lastProgress?.seq ?? -1) > (lastMsg?.seq ?? -1) ? lastProgress : lastMsg
  if (tail?.turnId !== undefined) {
    const end = turnEndSeqs?.[tail.turnId]
    if (end !== undefined) {
      // bug 0e5eba85：closed turn 无正文 answer（官方 latestAnswer 返 null →
      // answerAnchorSeq=null → 折叠谓词恒 true，锚=turn/end 仍落过程折叠体被吞）→
      // 锚取 turn.start - 1 顶层逃逸。落位从「回复下方」退为「回复上方」是可接受
      // 代价——可见性优先（panel 有记录而 chat 无卡的活体反例 session-7a3d2530）。
      // 仅显式 false（本会话 turn/start 起追踪过）才逃逸；缺席 = 旧缓存维持现口径。
      if (turnHasAnswer?.[tail.turnId] === false) {
        const escaped = turnStartSeqs?.[tail.turnId]
        if (escaped !== undefined) return escaped - 1
      }
      return end
    }
    const start = turnStartSeqs?.[tail.turnId]
    if (start !== undefined) return start - 1
  }
  // bug c75df032 回落分支：尾条目 turnId 缺省/未记录（如终局 settle 先于 turn/start 到达、
  // 旧缓存无 turn 戳）时不再原样回 group.lastSeq——那可落已收起 turn 的过程折叠体（折叠
  // 收起后卡被吞）。改取 ≥ group.lastSeq 的最小已记录 turn/end seq（≥ answerAnchorSeq，
  // 组卡落回复下方）；无任何 ≥ 记录才回组末 seq。
  let candidate: number | undefined
  for (const endSeq of Object.values(turnEndSeqs ?? {})) {
    if (endSeq >= group.lastSeq && (candidate === undefined || endSeq < candidate)) candidate = endSeq
  }
  return candidate ?? group.lastSeq
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
      anchorSeq: forgeEventGroupAnchorSeq(group, stream.turnEndSeqs, stream.turnStartSeqs, stream.turnHasAnswer),
    }
  },
  update: (context: { state: ForgeEventGroupNodeState }): ForgeEventGroupNodeState => context.state,
  publication: (): 'none' => 'none',
  buildViewNode: (context: ForgeEventNodeContext & { state?: ForgeEventGroupNodeState }): unknown => {
    // 永不回 null（官方钦定，dsh-client-ui-conversation client.js:2505 buildTargetUpserts
    // 对已物化 target 回 null 即抛 withdrew materialized target）。bug ede8af10：官方
    // replayContexts/refreshStarts 对窗口外 start match 置 context.state = void 0——
    // Context 仍留 contextsByTarget，state===undefined ≠ 从未物化；0c48a365 的 hidden
    // 保底使卡消失永不自愈。保底现算取 ① context.current 上次物化快照（组模型/锚/
    // 可见性全量保真：visible 保 visible 卡自愈、hidden 交棒保 hidden）。bug 141624ed：
    // 不再有「携带事件现算源②」——buildNode 以单参 contextSnapshot 调 buildViewNode
    // （client.js:2438），座上无 reader，携带成员是否组末不可判定；现算单条目组会在
    // 非末成员被裁时产出 key=自身 id 的可见碎片卡（破坏末成员唯一发射者），故让位
    // hidden 空组（同 key 同 id，零 withdrew；已物化卡的自愈由 ① 承担）。① 也零数据
    // 才落 hidden 空组（与首物化严格同 key 同 id，零重复渲染零 withdrew）。
    const state = streamStateOk(context.state) ? context.state : previousStateOf(context.current, context.id)
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
      target: CHAT_TARGET,
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

/** 组节点状态形状守卫（官方快照透传面畸形不猜——回退 undefined 走保底现算） */
function streamStateOk(value: unknown): value is ForgeEventGroupNodeState {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as { emit?: unknown }).emit === 'boolean' && typeof (value as { group?: unknown }).group === 'object'
}

/**
 * 保底现算源①（bug ede8af10）：context.current 上次物化节点窄读——state 被官方窗口
 * 裁剪/replay 置 void 后，Context 仍留 contextsByTarget 且 current 保有上次物化节点
 * （全量组快照 + 物化锚 + 可见性）。visible 保 visible（卡自愈）、hidden 交棒保
 * hidden（发射语义保真）；空内容/畸形 = undefined 让位 hidden 空组（bug 141624ed：
 * 携带成员组归属在 contextSnapshot 内不可判定——无现算源②）。
 */
function previousStateOf(current: unknown, id: string): ForgeEventGroupNodeState | undefined {
  if (typeof current !== 'object' || current === null) return undefined
  const get = (current as { get?: unknown }).get
  if (typeof get !== 'function') return undefined
  const node = (get as (target: string) => unknown).call(current, CHAT_TARGET)
  if (typeof node !== 'object' || node === null) return undefined
  const raw = node as { visibility?: unknown; anchorSeq?: unknown; data?: unknown }
  const data = raw.data as { key?: unknown; firstSeq?: unknown; lastSeq?: unknown; isLatest?: unknown; entries?: unknown; progress?: unknown } | undefined
  if (data === undefined || !Array.isArray(data.entries)) return undefined
  const entries = data.entries
  const progress = Array.isArray(data.progress) ? data.progress : []
  if (entries.length === 0 && progress.length === 0) return undefined
  const lastSeq = typeof data.lastSeq === 'number' && Number.isFinite(data.lastSeq) ? data.lastSeq : 0
  const key = typeof data.key === 'string' && data.key !== '' ? data.key : id
  return {
    emit: raw.visibility === 'visible',
    isLatest: data.isLatest === true,
    group: {
      key,
      firstSeq: typeof data.firstSeq === 'number' && Number.isFinite(data.firstSeq) ? data.firstSeq : lastSeq,
      lastSeq,
      entries,
      ...(progress.length > 0 ? { progress } : {}),
    },
    seq: lastSeq,
    anchorSeq: typeof raw.anchorSeq === 'number' && Number.isFinite(raw.anchorSeq) ? raw.anchorSeq : lastSeq,
  }
}

