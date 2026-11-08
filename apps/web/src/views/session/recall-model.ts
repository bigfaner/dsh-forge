// 召回 tab 视图模型（定位：业务——UF-4 知识召回 tab 的纯派生层；stage④ 1.8 召回卡片
// 重写：分组轴升级 turn 汇总——一 turn 一卡，展开态按 call 分节四 verb 分型）。
// 数据源 = forge:knowledge/sessionRecall（RecallGroup[]，call_id 聚合——core 单表直读；
// turn 聚合归本消费面执行——契约 recall-record-channel.md §1 S11）。本模块只做
// 「调用分组 → 轮卡投影 + 函数头文本」的纯投影，不存状态不落副本（SC2）。
// 口径（ui/card-design.md §1）：
//   - 分组键 = turn_seq；NULL 归「轮次未锚」单卡兜底；卡序 = turn_seq 降序（未锚卡殿后）。
//   - L1 触发输入降级链（宁缺不假）：首个 call trigger_snap → 首个 query text（legacy）
//     → null（渲染层兜底「—」）。
//   - L2 top = 轮内首个 verb='read' 调用的条目名（采纳语义，与热度 read=1.0 口径同源）；
//     无 read 调用 = 缺席（不退化为首个 search 命中——不发明降级形态）。
//   - scope 徽 = 全轮命中行 scope 去重集；命中总数 = Σ hit_count。
//   - 函数式工具 chip（节头）：全参实参展示（省略的参数不显示；keywords 已退役不出现，
//     legacy 行 keywords 「｜」拼接；search text 展示层按词元「|」拼接——query_json 快照
//     仍是空格分隔原文本，非数据变更）。
//   - 热度/slug（frontmatterId）/rank 为机械与管理信号，不上卡片（INV-4；数据面保留）。
//   - read-abstract/browse 出参的 summary/keywords/status 字段未在通道 RecallGroupHit
//     契约（S1–S12）内——卡片按宁缺不假降级呈现（字段补齐须先修订契约再进实现）。
//   - 展开态归因区时间 = 该轮末次调用时点 LocaleDatetime（YYYY/MM/DD HH:mm:ss 本地时刻）。
// 边界：禁 import ../knowledge/（依赖铁律③ 同级业务互禁）；时间标签不依赖相对时刻
// （卡片为历史台账——绝对时刻自含，不随刷新漂移）。
import type {
  EntryScope,
  RecallGroup,
  RecallGroupHit,
  RecallQuerySnapshot,
  RecallVerb,
} from '@dsh-forge/contracts'

/** 单个动词计数（卡片 L2 工具统计 chip 数据） */
export interface RecallVerbCount {
  readonly verb: RecallVerb
  readonly count: number
}

/**
 * 命中条目身份键（纯函数）：entryId → frontmatterId → 标题快照兜底——统计头覆盖数
 * 去重锚（与 core browse-service recallStats/hitIdentity 同口径，共享口径注释互指）。
 */
export function recallHitIdentity(hit: RecallGroupHit): string {
  if (hit.entryId !== null) return `e:${hit.entryId}`
  if (hit.frontmatterId !== null) return `f:${hit.frontmatterId}`
  return `t:${hit.title ?? ''}`
}

/**
 * 召回统计头（纯函数）：次数 = 分组数（零命中调用计次）；覆盖 = 去重命中条目数
 * （身份键去重——重建清引用后按 frontmatterId 归并同一知识条目）。
 */
export function recallStatsOf(groups: readonly RecallGroup[]): { calls: number; covered: number } {
  const covered = new Set<string>()
  for (const group of groups) {
    for (const hit of group.hits) covered.add(recallHitIdentity(hit))
  }
  return { calls: groups.length, covered: covered.size }
}

/** call 时序升序比较（节序 = 调用时序；同刻按 callId 稳定序） */
function callOrder(a: RecallGroup, b: RecallGroup): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.callId < b.callId ? -1 : 1
}

/** verb 工具统计（纯函数）：四动词 canonical 序（search/read/read-abstract/browse）× 计数，零计缺席 */
export function recallVerbCountsOf(groups: readonly RecallGroup[]): readonly RecallVerbCount[] {
  const order: readonly RecallVerb[] = ['search', 'read', 'read-abstract', 'browse']
  return order
    .map((verb) => ({ verb, count: groups.filter((group) => group.verb === verb).length }))
    .filter((entry) => entry.count > 0)
}

/** top（纯函数）：轮内首个 verb='read' 调用的首个命中条目名；无 read 调用/零命中 = null（缺席） */
export function recallTopOf(groups: readonly RecallGroup[]): string | null {
  const read = groups.filter((group) => group.verb === 'read').sort(callOrder)[0]
  return read?.hits[0]?.title ?? null
}

/**
 * 触发输入（纯函数）：降级链 = 首个 call（时序升序）trigger_snap → 首个 query text
 * （legacy 快照）→ null（渲染层兜底「—」）。
 */
export function recallTriggerOf(groups: readonly RecallGroup[]): string | null {
  const calls = [...groups].sort(callOrder)
  for (const call of calls) {
    if (call.triggerSnap !== null) return call.triggerSnap
  }
  for (const call of calls) {
    const text = call.query?.text
    if (text !== undefined && text !== '') return text
  }
  return null
}

/** scope 徽集（纯函数）：全轮命中行 scope 去重——project 在前、global 在后（确定性） */
export function recallScopesOf(groups: readonly RecallGroup[]): readonly EntryScope[] {
  const scopes = new Set<EntryScope>()
  for (const group of groups) {
    for (const hit of group.hits) scopes.add(hit.scope)
  }
  return (['project', 'global'] as const).filter((scope) => scopes.has(scope))
}

/** 轮卡投影（视图卡——当次 groups 派生，不落地） */
export interface RecallTurnCard {
  /** 卡片身份键（'turn:3' / 'turn:null'——React key 与 e2e 锚） */
  readonly key: string
  /** 轮次序（null = 轮次未锚兜底卡） */
  readonly turnSeq: number | null
  /** 触发输入（L1 摘要 + Tooltip 全文唯一数据源；null = 渲染层兜底「—」） */
  readonly trigger: string | null
  /** 命中总数（Σ hit_count；0 = 零命中轮卡） */
  readonly hitTotal: number
  /** scope 徽集（去重确定性序） */
  readonly scopes: readonly EntryScope[]
  /** 工具统计（四动词 ×N canonical 序） */
  readonly verbs: readonly RecallVerbCount[]
  /** top = 首个被 read 条目名（无 read 调用 = null → 右组缺席） */
  readonly top: string | null
  /** 本轮末次调用时点（ISO-8601——归因区 LocaleDatetime 数据源） */
  readonly lastAt: string
  /** 节集 = 该轮全部调用（时序升序——节序即调用时序） */
  readonly calls: readonly RecallGroup[]
}

/**
 * 轮卡列表投影（纯函数）：分组键 turn_seq——NULL 行归「轮次未锚」单卡兜底；卡序 =
 * turn_seq 降序（未锚卡殿后）；轮内节序 = 调用时序升序。零事件 = 空列表。
 */
export function recallTurnsOf(groups: readonly RecallGroup[]): readonly RecallTurnCard[] {
  const turns = new Map<number | null, RecallGroup[]>()
  for (const group of groups) {
    const bucket = turns.get(group.turnSeq)
    if (bucket === undefined) turns.set(group.turnSeq, [group])
    else bucket.push(group)
  }
  const cards: RecallTurnCard[] = [...turns.entries()].map(([turnSeq, calls]) => {
    const ordered = [...calls].sort(callOrder)
    return {
      key: turnSeq === null ? 'turn:null' : `turn:${String(turnSeq)}`,
      turnSeq,
      trigger: recallTriggerOf(ordered),
      hitTotal: ordered.reduce((sum, call) => sum + call.hitCount, 0),
      scopes: recallScopesOf(ordered),
      verbs: recallVerbCountsOf(ordered),
      top: recallTopOf(ordered),
      lastAt: ordered.reduce((last, call) => (call.createdAt > last ? call.createdAt : last), ordered[0]?.createdAt ?? ''),
      calls: ordered,
    }
  })
  cards.sort((a, b) => {
    if (a.turnSeq === null) return 1
    if (b.turnSeq === null) return -1
    return b.turnSeq - a.turnSeq
  })
  return cards
}

/** 函数头实参片段（字符串值双引号包裹；数值/布尔裸值——与函数调用语法同构） */
function argPart(key: string, value: string): string {
  return `${key}="${value}"`
}

/** 函数头数值实参片段（裸值） */
function argNumPart(key: string, value: number): string {
  return `${key}=${String(value)}`
}

/** search text 展示层拼接（纯函数）：空格分词 → 「|」连接（query_json 快照仍是原文本） */
export function recallSearchTextJoin(text: string): string {
  return text.split(/\s+/).filter((token) => token !== '').join('|')
}

/**
 * 函数式调用头文本（纯函数）：全参实参、省略的参数不显示；search text 按「|」词元拼接；
 * legacy keywords 「｜」拼接；query 快照缺席 = 裸动词名（宁缺不假）。
 */
export function recallCallHead(group: RecallGroup): string {
  const query: RecallQuerySnapshot | null = group.query
  if (query === null) return group.verb
  switch (group.verb) {
    case 'search': {
      const parts: string[] = []
      if (query.text !== undefined) parts.push(`"${recallSearchTextJoin(query.text)}"`)
      if (query.domainPrefix !== undefined) parts.push(argPart('domain_prefix', query.domainPrefix))
      if (query.keywords !== undefined) parts.push(argPart('keywords', query.keywords.join('｜')))
      if (query.limit !== undefined) parts.push(argNumPart('limit', query.limit))
      return parts.length === 0 ? group.verb : `search(${parts.join(', ')})`
    }
    case 'read': {
      const id = query.frontmatterId ?? (query.entryId !== undefined ? String(query.entryId) : undefined)
      return id === undefined ? group.verb : `read("${id}")`
    }
    case 'read-abstract': {
      const id = query.frontmatterId ?? (query.entryId !== undefined ? String(query.entryId) : undefined)
      return id === undefined ? group.verb : `read_abstract("${id}")`
    }
    case 'browse': {
      const parts: string[] = []
      if (query.domain !== undefined) parts.push(`"${query.domain}"`)
      if (query.offset !== undefined) parts.push(argNumPart('offset', query.offset))
      if (query.limit !== undefined) parts.push(argNumPart('limit', query.limit))
      if (query.order !== undefined) parts.push(argPart('order', query.order))
      return parts.length === 0 ? group.verb : `browse(${parts.join(', ')})`
    }
  }
}

/**
 * 归因区时刻标签（纯函数）：ISO-8601 → 本地时刻 `YYYY/MM/DD HH:mm:ss`（LocaleDatetime
 * 口径——卡片为历史台账，绝对时刻自含不随刷新漂移）；不可解析原文返回（core 写入面保证 ISO）。
 */
export function recallDatetimeLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** score 元组标签（纯函数）：两位小数；null = 无元组（非 search 命中/哨兵行） */
export function recallScoreLabel(score: number | null): string | null {
  return score === null ? null : `(score ${score.toFixed(2)})`
}
