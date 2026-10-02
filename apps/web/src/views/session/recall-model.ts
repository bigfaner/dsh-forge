// 召回 tab 视图模型（定位：业务——UF-4 知识召回 tab 的纯派生层，3.8）。
// 数据源 = forge:knowledge/sessionRecall（RecallGroup[]，call_id 聚合——core 3.3 单表直读）；
// 本模块只做「调用分组 → 会话知识分组行」的纯投影，不存状态不落副本（SC2）。
// 投影口径（prd-ui-functions UF-4 Data Requirements + tech-design Interface 2 sessionRecall 注记）：
//   - 统计头：召回次数 = 分组数（= COUNT(DISTINCT call_id)，零命中调用计次不计覆盖）；
//     覆盖条数 = 去重命中条目（身份键 = entryId → frontmatterId → 标题快照兜底——与 core
//     recallStats/hitIdentity 同口径，重建清引用后同一知识条目归并计数）。
//   - 分组行 = 按知识条目折叠（一次调用 × 一条命中 = 一事件；同条目跨调用归并一行）：
//     动词明细（verb × 次数）/ 最近时间（该条目最近事件）/ 热度（hit.heat 原样——按条目
//     使用事件计数，与卡片热度徽章同源；三方一致断言 = 事件 ↔ tab 行 ↔ 卡片热度）。
//   - 索引未命中（entryId = null，重建后 ID 漂移清引用）：行保留 + 行级失效标注，
//     不阻塞列表、不可跳转（AC3 行级失效语义）。
// 边界：禁 import ../knowledge/（依赖铁律③ 同级业务互禁——时间标签等平行小件本地实现）。
import { relativeTime } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RecallGroup, RecallGroupHit, RecallVerb } from '@dsh-forge/contracts'

/** 单个动词计数（行内动词明细 chip 数据） */
export interface RecallVerbCount {
  readonly verb: RecallVerb
  readonly count: number
}

/** 会话知识分组行（视图行——当次 groups 投影派生，不落地） */
export interface RecallRow {
  /** 身份键（entryId → frontmatterId → 标题快照兜底；跨行唯一） */
  readonly key: string
  /** null = 索引未命中（行级失效标注；不可跳转） */
  readonly entryId: number | null
  /** 快照标题（title_snap——抗索引重建；null 兜底「（已删除的知识）」呈现归渲染层） */
  readonly title: string | null
  /** 快照域路径（domain_snap；可空） */
  readonly domainPath: string | null
  /** 动词明细（verb × 次数；按 verb 字典序，确定性） */
  readonly verbs: readonly RecallVerbCount[]
  /** 该条目最近事件时间（ISO-8601） */
  readonly lastAt: string
  /** 该条目事件计数（= 该条目所有命中事件行数——与热度徽章同源的双计数锚） */
  readonly eventCount: number
  /** 热度徽章值（hit.heat 原样——项目级使用事件计数，UI 零再推导） */
  readonly heat: number
}

/**
 * 命中条目身份键（纯函数）：entryId → frontmatterId → 标题快照兜底——与 core
 * browse-service recallStats/hitIdentity 同口径（共享口径注释互指，防漂移）。
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

/** verbs 折叠 → 确定性序（verb 字典序） */
function foldVerbs(counts: Map<RecallVerb, number>): readonly RecallVerbCount[] {
  return [...counts.entries()]
    .map(([verb, count]) => ({ verb, count }))
    .sort((a, b) => (a.verb < b.verb ? -1 : 1))
}

/**
 * 会话知识分组行投影（纯函数）：按身份键折叠命中事件——每行动词明细（verb × 次数）、
 * 最近时间、事件计数、热度（任一命中行的 heat——同条目各行同值，core 单表同源保证）。
 * 行序 = 最近时间降序（最近在前），同刻按身份键升序（确定性）。零命中调用不入行（仅计次）。
 */
export function recallRowsOf(groups: readonly RecallGroup[]): readonly RecallRow[] {
  interface Fold {
    entryId: number | null
    title: string | null
    domainPath: string | null
    verbs: Map<RecallVerb, number>
    lastAt: string
    eventCount: number
    heat: number
  }
  const folded = new Map<string, Fold>()
  for (const group of groups) {
    for (const hit of group.hits) {
      const key = recallHitIdentity(hit)
      const prev = folded.get(key)
      if (prev === undefined) {
        folded.set(key, {
          entryId: hit.entryId,
          title: hit.title,
          domainPath: hit.domainPath,
          verbs: new Map([[group.verb, 1]]),
          lastAt: group.createdAt,
          eventCount: 1,
          heat: hit.heat,
        })
        continue
      }
      prev.verbs.set(group.verb, (prev.verbs.get(group.verb) ?? 0) + 1)
      prev.eventCount += 1
      // 快照取最近事件（createdAt 倒序输入不依赖——逐行比较保序）
      if (group.createdAt > prev.lastAt) {
        prev.lastAt = group.createdAt
        prev.title = hit.title
        prev.domainPath = hit.domainPath
      }
      prev.heat = hit.heat
    }
  }
  const rows: RecallRow[] = [...folded.entries()].map(([key, fold]) => ({
    key,
    entryId: fold.entryId,
    title: fold.title,
    domainPath: fold.domainPath,
    verbs: foldVerbs(fold.verbs),
    lastAt: fold.lastAt,
    eventCount: fold.eventCount,
    heat: fold.heat,
  }))
  rows.sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : a.key < b.key ? -1 : 1))
  return rows
}

/** 行级失效判据（AC3：entryId 未命中 = 索引重建后 ID 漂移/条目已清除） */
export function isRecallRowStale(row: RecallRow): boolean {
  return row.entryId === null
}

/**
 * 最近时间标签（纯函数）：ISO-8601 → 官方 relativeTime 桶化中文标签
 * （与 views/knowledge cardTimeLabel 同语义——同级业务互禁下的平行小件，口径注释互指）。
 * 不可解析原文返回（core 写入面保证 ISO）。
 */
export function recallTimeLabel(iso: string, now: number): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return iso
  const bucket = relativeTime(ts, now)
  switch (bucket.unit) {
    case 'now':
      return '刚刚'
    case 'minutes':
      return `${bucket.n} 分钟前`
    case 'hours':
      return `${bucket.n} 小时前`
    case 'days':
      return `${bucket.n} 天前`
    case 'months':
      return `${bucket.n} 个月前`
    case 'years':
      return `${bucket.n} 年前`
    default: {
      const exhaustive: never = bucket.unit
      throw new Error(`dsh-forge web: 未知相对时间桶：${String(exhaustive)}`)
    }
  }
}
