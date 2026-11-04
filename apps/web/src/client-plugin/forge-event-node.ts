// loop-event-delivery 1.9 · 消息面事件折叠条目组——Chat 节点定义对（纯模块零 import——
// classic script bundle 自含纪律，progress-node.ts 同型）。
// loop-message-consolidation 1.2：组模型扩收 'forge/progress' 事件（循环进度卡数据源）
// ——progress 条目与消息条目同组 fold、尾成员发射/交棒（新 progress 到达即组块重放，
// 任务行原地更新零新条目）；聚合面归壳树 forge-event-data.ts（数据守卫唯一 runtime
// 消费者纪律——client 树只透传条目）。
//
// forge-progress-card-invariant-hardening 1.3（D1+D3+D4）：
//   - D3 数据即锚：三张 turn 台账（turnStartSeqs/turnEndSeqs/turnHasAnswer）及其
//     fold 分支（turn/start、turn/end、assistant/message）全量拆除——台账追官方私有
//     口径微调即击穿（判例 d44fbaec），条目 turnId 戳随之退役（归属判定不再需要）。
//     anchorSeq = 组末成员真实 seq，每帧从组模型数据重导出。
//   - D1 单快照：visible / anchorSeq 物化决策只由当帧 fold 全量状态现算；
//     previousStateOf 恢复值退出决策路径，仅保留组数据透传（withdrew 断言保活）。
//   - D4 裁决让渡：折叠/位置归属由官方谓词单点裁决，本模块残余官方口径依赖收敛至
//     forgeEventGroupAnchorSeq 单一纯函数入口（契约面注释见该函数）。
//
// forge-progress-card-invariant-hardening 1.4（D2 分态交保 + fail-visible）：
//   - D2 分态交保：曾物化（emit 过）的组 → hidden 交棒必须携带真成员序列与真锚
//     （anchorSeq 从交棒数据重导出——禁止非空组降为 hidden 空组顶掉已渲染卡）；从未
//     物化的组 → 不注册 chat target（回 null——withdrew 断言只禁已物化回 null）+ 诊断留痕。
//   - fail-visible（提案配套纪律 3）：物化缺口/镜像击穿显式诊断站点（诊断通道经
//     setForgeEventNodeDiag 注入面——纯模块零 import 纪律下的合规发射面）。
//
//   ① forgeEventStreamDefinition（状态机，无 target——官方 inboxDefinition 同型）：
//      常量 id 单 Context 折叠全会话 user/message 流 → 分组模型（人类插话 = 分组
//      锚点：插话后事件开新组）。每次 user/message 到达 Context revision++ → 依赖
//      它的组节点全部重放（官方 reader dependency 机械）——组成员集合恒为最新。
//   ② forgeEventGroupDefinition（target 'chat'）：每条 forge 事件消息一个 Context
//      （id = 消息 id——id 键控增量渲染）；buildViewNode 仅组的末成员发射组块节点
//      （anchorSeq = 组末成员真实 seq——组块锚在组尾，后续人类气泡自然排后），其余
//      成员回同 key + visibility:'hidden'（官方增量 flush 禁已物化 target 回 null——
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

/**
 * 诊断发射注入面（D2 fail-visible——AGENTS §7 可观测性纪律）：本模块纯模块零 import
 * （classic script bundle 自含纪律），诊断发射经装配期注入（先例 start-session-wrap.ts
 * deps.warn——client 束属 diagnostic-emit-discipline 豁免面，注入的 warn 即合规诊断
 * 通道）；缺席 = fail-soft 静默（调用点现查在场性，不缓存判定）。
 */
let forgeEventNodeWarn: ((message: string) => void) | undefined

/** 装配缝注入诊断通道（plugin.ts registerEventEntriesNode 调用；传 undefined 摘除） */
export function setForgeEventNodeDiag(warn: ((message: string) => void) | undefined): void {
  forgeEventNodeWarn = warn
}

/** 诊断站点（物化缺口/镜像击穿显式上报——零静默吞卡） */
function forgeEventNodeDiag(message: string): void {
  forgeEventNodeWarn?.(message)
}
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
}

/** 消息流折叠模型（state-only 单 Context 累积态；closed = 末组已被人类插话收口）。
 *  D3：turn 台账字段全量退役——折叠只认成员序列，turn 生命周期事件零参与。 */
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

/** 官方节点座 context 消费切片（buildViewNode 入参——progress-node 同型；match 携带
 *  原始事件供保底现算——official contextSnapshot 透传全量 match 与 current） */
export interface ForgeEventNodeContext {
  readonly key: string
  readonly id: string
  readonly state?: unknown
  readonly start?: { readonly location?: unknown; readonly event?: ForgeMessageEventLike }
  readonly matches?: readonly { readonly location?: unknown; readonly event?: ForgeMessageEventLike }[]
  /** 官方 contextSnapshot.current 窄读（target → 上次物化节点——D1 后仅作组数据
   *  透传源，不参与 visible/anchorSeq 物化决策） */
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
function entryOf(event: ForgeMessageEventLike, data: ForgeMessageDataLike): ForgeEventEntry {
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
    expertKey: optionalString(raw['expertKey']),
    scenario: optionalString(raw['scenario']),
    note: optionalString(raw['note']),
    ...(optionalAttempt(raw['attempt']) !== undefined ? { attempt: optionalAttempt(raw['attempt']) } : {}),
    at: raw['at'],
  }
}

/** fold 单元：一条事件 → 下一模型（纯函数——重放保真；他形事件原引用返回）。
 *  D3：只认 user/message（forge 源/人类插话）与 'forge/progress' 两类——
 *  turn/start、turn/end、assistant/message 台账分支全量拆除（零参与折叠）。 */
export function foldForgeEventMessage(state: ForgeEventStreamState, event: ForgeMessageEventLike): ForgeEventStreamState {
  // 'forge/progress' 事件（1.2 循环进度卡数据源）：同组 fold 语义——开组中追加 progress
  // 条目（lastSeq 推进 = 组尾轨）；插话后/首枚开新组。畸形载荷原引用返回零污染。
  if (event?.type === FORGE_PROGRESS_EVENT_TYPE) {
    const entry = progressEntryOf(event, event.data)
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
    const entry = entryOf(event, data)
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
 * D3：match 只认 user/message 与 'forge/progress'——turn/assistant 事件不再命中
 * （零 revision 抖动、零台账）。
 */
export const forgeEventStreamDefinition = {
  kind: FORGE_EVENT_STREAM_KIND,
  match: (event: ForgeMessageEventLike): { id: string; role: 'start' } | null =>
    event !== undefined && (event.type === 'user/message' || event.type === FORGE_PROGRESS_EVENT_TYPE)
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
  /** 组卡锚 seq = 组末成员真实 seq（每帧从组模型数据重导出——见 forgeEventGroupAnchorSeq） */
  readonly anchorSeq: number
}

/** stream 状态消费窄读（形状防御——他形不猜） */
function streamStateOf(value: unknown): ForgeEventStreamState | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = value as { groups?: unknown; closed?: unknown }
  if (!Array.isArray(raw.groups) || typeof raw.closed !== 'boolean') return undefined
  return value as ForgeEventStreamState
}

/**
 * 组卡锚 seq（D3+D4 单一纯函数入口——数据即锚 + 裁决让渡）：
 * 返回组末成员（entries/progress 双轨取真实尾成员）的 seq；空组回 group.lastSeq。
 * 每帧从组模型数据重导出，不依赖任何跨帧台账。
 *
 * 契约面声明（官方口径依赖逐条标注；版本 pin：@deepseek-ai/dsh-client-ui-chat@0.2.0-rc.2，
 * 升级须显式核销下述各条——walkthrough 六形态走查后核销）：
 *  - [公开 API] ChatConversationViewNode.anchorSeq 数值锚字段——官方节点契约公开面
 *    （dsh-client-ui-chat client.js:2438 buildNode 透传组块节点全量字段）。
 *  - [事实行为] 官方按 anchorSeq 排座 + turn 过程折叠谓词收纳过程段成员（私有实现，
 *    TURN_PROCESS_INDEPENDENT_KINDS 硬编码 Set 无白名单通道）——本模块不再预判
 *    折叠区间（台账路线拆除，判例 d44fbaec），锚定组末真实 seq 后落位/折叠归属由
 *    官方谓词单点裁决（裁决让渡）。
 *  - [私有镜像] FORGE_PROGRESS_EVENT_TYPE 镜像 plugin-forge FORGE_PROGRESS_EVENT_TYPE
 *    字面量（同仓内常量、零跨包 import——升版本同步核销字符串）。
 *  - [公开 API] user/message content blocks（ContentBlock {type:'text',text}）与
 *    source 字段形状——官方 SessionEvent 公开载荷面。
 *  - [事实行为] 已物化 target 回 null 即抛（client.js:2505 withdrew 断言）——
 *    hidden 保底面（buildViewNode）据此永不为 null。
 */
export function forgeEventGroupAnchorSeq(group: ForgeEventGroup): number {
  const lastMsg = group.entries.at(-1)
  const lastProgress = group.progress?.at(-1)
  const tail = (lastProgress?.seq ?? -1) > (lastMsg?.seq ?? -1) ? lastProgress : lastMsg
  return tail?.seq ?? group.lastSeq
}

/**
 * 组块节点定义（target 'chat'）：每条 forge 事件消息一个 Context（id = 消息 id——
 * id 键控增量渲染）。发射判定 = start 时点经 reader 窄读 stream 状态（挂依赖——
 * 新消息到达 stream revision++ → 全体组 Context 重放，末成员交棒：渲染面恒一组
 * 一块、位置恒锚组尾（anchorSeq = 组末成员真实 seq，每帧重导出——D3）。
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
      anchorSeq: forgeEventGroupAnchorSeq(group),
    }
  },
  update: (context: { state: ForgeEventGroupNodeState }): ForgeEventGroupNodeState => context.state,
  publication: (): 'none' => 'none',
  buildViewNode: (context: ForgeEventNodeContext & { state?: ForgeEventGroupNodeState }): unknown => {
    // withdrew 红线：已物化 target 永不回 null（官方钦定，dsh-client-ui-conversation
    // client.js:2505 buildTargetUpserts 对「已物化」target 回 null 即抛 withdrew
    // materialized target）——bug ede8af10：官方 replayContexts/refreshStarts 对窗口外
    // start match 置 context.state = void 0——Context 仍留 contextsByTarget，
    // state===undefined ≠ 从未物化。D2 起只有「从未物化」态可 null（见下）。
    //
    // D2 分态交保（曾物化 / 从未物化两态分治——hidden 空组形态在本路径不可产出）：
    //   - 曾物化（context.current 持上次物化真数据）：state 缺席帧 hidden 交棒必须携带
    //     真成员序列与真锚（anchorSeq 从交棒数据经 forgeEventGroupAnchorSeq 重导出）——
    //     禁非空组降为空组顶掉已渲染卡（判例 fafc1fb7 根治面）。
    //   - 从未物化（无当帧组数据 + 无上次物化数据）：不注册 chat target（回 null——
    //     withdrew 断言只禁「已物化回 null」，从未物化可 null）+ 诊断留痕（fail-visible）。
    const state = streamStateOk(context.state) ? context.state : undefined
    const stateGroup = state?.group
    // 当帧组数据为空（start 保底空组/窗口裁剪）→ 交棒数据（上次物化真数据）接管
    const stateGroupEmpty =
      stateGroup === undefined || (stateGroup.entries.length === 0 && (stateGroup.progress?.length ?? 0) === 0)
    const previousGroup = stateGroupEmpty ? previousStateOf(context.current, context.id) : undefined
    const group = stateGroupEmpty ? previousGroup : stateGroup
    if (group === undefined) {
      forgeEventNodeDiag(
        `[dswf-client] forge-event-node 物化缺口：id=${context.id} 无当帧 fold 组数据且从未物化——不注册 chat 节点（fail-visible 留痕）`,
      )
      return null
    }
    // location 契约必填（ChatConversationViewNode.location——官方 store updateTurnKind
    // 直读 location.kind）：start/matches 携带 location 则透传，否则 unresolved。
    const location = context.start?.location ?? context.matches?.[0]?.location ?? { kind: 'unresolved' }
    const visible = group === stateGroup && state !== undefined && state.emit
    return {
      key: context.key,
      kind: FORGE_EVENT_NODE_KIND,
      id: context.id,
      target: CHAT_TARGET,
      // D2/D3 真锚：从组模型数据（当帧或交棒）重导出组末成员真实 seq——不从恢复帧快照
      anchorSeq: forgeEventGroupAnchorSeq(group),
      location,
      visibility: visible ? 'visible' : 'hidden',
      data: {
        key: group.key,
        firstSeq: group.firstSeq,
        lastSeq: group.lastSeq,
        isLatest: group === stateGroup ? (state?.isLatest ?? false) : false,
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
 * 透传面（bug ede8af10 + D1）：context.current 上次物化节点窄读——state 被官方窗口
 * 裁剪/replay 置 void 后，Context 仍留 contextsByTarget 且 current 保有上次物化节点。
 * D1 起只透传组模型数据（key/firstSeq/lastSeq/entries/progress——hidden 节点组快照
 * 不丢、不触 withdrew 断言）；visible / anchorSeq / isLatest 物化决策一律不由恢复值
 * 参与（D2：state 缺席 = hidden 交棒携本数据，锚经 forgeEventGroupAnchorSeq 重导出）。
 * 空内容/畸形 = undefined（镜像击穿诊断留痕后弃置——fail-visible）。
 */
function previousStateOf(current: unknown, id: string): ForgeEventGroup | undefined {
  if (typeof current !== 'object' || current === null) return undefined
  const get = (current as { get?: unknown }).get
  if (typeof get !== 'function') return undefined
  const node = (get as (target: string) => unknown).call(current, CHAT_TARGET)
  if (typeof node !== 'object' || node === null) return undefined
  const raw = node as { data?: unknown }
  const data = raw.data as { key?: unknown; firstSeq?: unknown; lastSeq?: unknown; entries?: unknown; progress?: unknown } | undefined
  // 镜像击穿 fail-visible：上次物化节点在场但数据形状不可读（entries 非数组/全空）——
  // 显式留痕后走 null 分态（此前曾物化现不可恢复 = 物化缺口）
  if (data === undefined || !Array.isArray(data.entries)) {
    forgeEventNodeDiag(`[dswf-client] forge-event-node 镜像击穿：id=${id} 上次物化节点 data 形状不可读（entries 非数组）——交棒数据弃置`)
    return undefined
  }
  const entries = data.entries
  const progress = Array.isArray(data.progress) ? data.progress : []
  if (entries.length === 0 && progress.length === 0) {
    forgeEventNodeDiag(`[dswf-client] forge-event-node 镜像击穿：id=${id} 上次物化节点为空组数据（entries/progress 全空）——交棒数据弃置`)
    return undefined
  }
  const lastSeq = typeof data.lastSeq === 'number' && Number.isFinite(data.lastSeq) ? data.lastSeq : 0
  const key = typeof data.key === 'string' && data.key !== '' ? data.key : id
  return {
    key,
    firstSeq: typeof data.firstSeq === 'number' && Number.isFinite(data.firstSeq) ? data.firstSeq : lastSeq,
    lastSeq,
    entries,
    ...(progress.length > 0 ? { progress } : {}),
  }
}
