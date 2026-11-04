// 服务域共享纯函数与语句助手（1.7 随迁自 core shared.ts / recall-service.ts /
// browse-service.ts 同构面——行为等价移植；差异：entries 项目键 = ws_path（自持库
// 注册表键同源），recall_logs 保留 project_id 列承载 API 级 projectId 值）。
// 关键异常降级：core 走 app_key_logs；自持域经 storage/diag.ts 事件面（rebuild 事件
// 已含成败路径——SC-10），本文件不再另设关键日志表。
import type Database from 'better-sqlite3'
import type { DomainNode, KnowledgeCard, RecallGroup, RecallQuerySnapshot } from '@dsh-forge/contracts'

/** LIKE 通配转义（% _ \）——域前缀 SQL 段匹配防通配符注入（prepared + 输入规整） */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/**
 * 域前缀可选的缓存行读取（undefined = 全域；空串 = 根域；尾 '/' 归一——search 与
 * listEntries 同口径：= 前缀 或 前缀/… 子域，段前缀不做子串误匹配）。
 */
export function selectRowsByDomain<R>(
  selectAll: { all(wsPath: string): R[] },
  selectByDomain: { all(wsPath: string, prefix: string, pattern: string): R[] },
  q: { wsPath: string; domainPrefix?: string },
): R[] {
  if (q.domainPrefix === undefined) return selectAll.all(q.wsPath)
  const prefix = q.domainPrefix.replace(/\/+$/, '')
  return selectByDomain.all(q.wsPath, prefix, `${escapeLike(prefix)}/%`)
}

/** 索引行 keywords 列解码（存储态 JSON 字符串 → string[]——写入面单一来源保证形状可解析） */
export function parseKeywords(stored: string): string[] {
  return JSON.parse(stored) as string[]
}

/** 非空字符串判定（空串/纯空白视同缺失） */
export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

/** updated 展示位归一：非空串直传 / Date 字面量（js-yaml 产物）ISO-8601 化 / 其余取缺省（fallbackMs 毫秒） */
export function normalizeUpdated(value: unknown, fallbackMs: number): string {
  if (isNonEmptyString(value)) return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  return new Date(fallbackMs).toISOString()
}

/** 事件热度语句（heatByEntry 同口径单表计数：search 命中与 read-abstract 各计一次、哨兵行
 *  entry_id NULL 天然排除——recall 热度面与 browse 热度徽章共享；ORDER BY entry_id 确定性）。 */
export function prepareHeatByEntry(
  db: Database.Database,
): Database.Statement<unknown[], { entry_id: number; heat: number }> {
  return db.prepare<unknown[], { entry_id: number; heat: number }>(
    `SELECT entry_id, COUNT(*) AS heat FROM knowledge_recall_logs
     WHERE project_id = ? AND entry_id IS NOT NULL GROUP BY entry_id ORDER BY entry_id`,
  )
}

// ── 占位打分（PRD「置信度占位排序」——P1 确定性启发式，M+ 置信度模型替换） ──

const KEYWORD_WEIGHT = 2 // 每命中一个检索关键词
const TITLE_WEIGHT = 2 // text 命中标题
const SUMMARY_WEIGHT = 1 // text 命中摘要

/** 打分输入（索引行的可打分子集；keywords 已解析） */
interface RankableEntry {
  entryId: number
  title: string
  summary: string
  keywords: string[]
}

/** 打分产物（score = 占位置信度；同分按 entryId 升序保证确定性） */
interface RankedEntry<T extends RankableEntry> {
  entry: T
  score: number
}

/**
 * 行内过滤与占位打分（core recall-service 同构移植）：
 * · keywords = AND 细分（每个检索关键词都须命中条目 keywords；大小写不敏感）
 * · text = 标题/摘要大小写不敏感子串（两者皆不中则排除）
 * · score = KEYWORD_WEIGHT×命中关键词数 + TITLE_WEIGHT/SUMMARY_WEIGHT×text 命中位
 * · 排序 score 降序，同分 entryId 升序
 */
export function rankEntries<T extends RankableEntry>(
  entries: readonly T[],
  input: { keywords?: string[]; text?: string },
): RankedEntry<T>[] {
  const queryKeywords = (input.keywords ?? [])
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k !== '')
  const text = input.text?.trim().toLowerCase() ?? ''
  const ranked: RankedEntry<T>[] = []
  for (const entry of entries) {
    const entryKeywords = new Set(entry.keywords.map((k) => k.trim().toLowerCase()))
    const matched = queryKeywords.filter((k) => entryKeywords.has(k))
    if (matched.length !== queryKeywords.length) continue // AND 细分：缺一即排除
    let score = KEYWORD_WEIGHT * matched.length
    if (text !== '') {
      const inTitle = entry.title.toLowerCase().includes(text)
      const inSummary = entry.summary.toLowerCase().includes(text)
      if (!inTitle && !inSummary) continue
      score += (inTitle ? TITLE_WEIGHT : 0) + (inSummary ? SUMMARY_WEIGHT : 0)
    }
    ranked.push({ entry, score })
  }
  ranked.sort((a, b) => b.score - a.score || a.entry.entryId - b.entry.entryId)
  return ranked
}

// ── 域树聚合（forge:knowledge/browse 消费） ──

/**
 * 域树聚合（listEntries 兼作聚合底表）：目录即域 ≤3 层（索引已裁剪超层），节点计数含子域
 * （与域前缀过滤同口径）；根域文件（domainPath=''）不生成节点（域树 = 目录树）。输出序
 * depth 升序再 domainPath 升序（父先于子，确定性）。
 */
export function aggregateDomainTree(cards: readonly KnowledgeCard[]): DomainNode[] {
  const counts = new Map<string, number>()
  for (const card of cards) {
    const segments = card.domainPath.split('/').filter((s) => s !== '')
    for (let depth = 1; depth <= segments.length; depth += 1) {
      const path = segments.slice(0, depth).join('/')
      counts.set(path, (counts.get(path) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([domainPath, entryCount]) => {
      const segments = domainPath.split('/')
      return { domainPath, label: segments[segments.length - 1]!, depth: segments.length, entryCount }
    })
    .sort((a, b) => a.depth - b.depth || (a.domainPath < b.domainPath ? -1 : 1))
}

// ── sessionRecall 行分组聚合 ──

/** sessionRecall 原始行（单表直读形状） */
export interface RecallRow {
  call_id: string
  verb: 'search' | 'read-abstract'
  entry_id: number | null
  frontmatter_id: string | null
  title_snap: string | null
  domain_snap: string | null
  query_json: string | null
  hit_count: number
  duration_ms: number | null
  created_at: string
}

/**
 * call_id 分组聚合（纯函数）：同 call 各行共享调用级字段 → 单 RecallGroup；零命中哨兵行
 * 不展开为命中；热度徽章 = 项目级事件计数（entry_id → frontmatter_id 兜底）；输出最近调用在前。
 */
export function groupRecallRows(
  rows: readonly RecallRow[],
  heatByEntry: ReadonlyMap<number, number>,
  heatByFrontmatterId: ReadonlyMap<string, number>,
): RecallGroup[] {
  const groups: RecallGroup[] = []
  let current: RecallGroup | null = null
  for (const row of rows) {
    if (current === null || current.callId !== row.call_id) {
      let query: RecallQuerySnapshot | null = null
      if (row.query_json !== null) {
        try {
          query = JSON.parse(row.query_json) as RecallQuerySnapshot
        } catch {
          query = null
        }
      }
      current = {
        callId: row.call_id,
        verb: row.verb,
        query,
        hitCount: row.hit_count,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
        hits: [],
      }
      groups.push(current)
    }
    if (row.entry_id === null && row.frontmatter_id === null && row.title_snap === null) continue
    current.hits.push({
      entryId: row.entry_id,
      frontmatterId: row.frontmatter_id,
      title: row.title_snap,
      domainPath: row.domain_snap,
      heat: row.entry_id !== null
        ? (heatByEntry.get(row.entry_id) ?? 0)
        : row.frontmatter_id !== null
          ? (heatByFrontmatterId.get(row.frontmatter_id) ?? 0)
          : 0,
    })
  }
  groups.reverse()
  return groups
}
