// 服务域共享纯函数与语句助手（1.7 随迁自 core shared.ts / recall-service.ts /
// browse-service.ts 同构面——行为等价移植；差异：entries 项目键 = ws_path（自持库
// 注册表键同源），recall_logs 保留 project_id 列承载 API 级 projectId 值）。
// 关键异常降级：core 走 app_key_logs；自持域经 storage/diag.ts 事件面（rebuild 事件
// 已含成败路径——SC-10），本文件不再另设关键日志表。
import type Database from 'better-sqlite3'
import type { DomainNode, KnowledgeCard, RecallGroup, RecallQuerySnapshot } from '@dsh-forge/contracts'
import { canonicalWsPath } from '../storage/registry.js'
import { isSafeRelPath } from '../storage/index.js'

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

// ── stage③ C1：FTS5 BM25 三因子检索（提案 §2.1，裁决 #10） ──
//
// 排序内核 = knowledge_fts（FTS5，仅元数据列 title/keywords/summary——裁决 #8 声明边界，
// 正文不进检索面）。已知 tokenizer 边界（非缺陷）：unicode61 将 CJK 连续 run 视为单
// token，词面子串（如「原子幂等」嵌于更长 run）无 token 命中——该类行经 JS 子串补充
// 准入通道（仍仅 title/summary 元数据列）进排序面，以中性分计（bm25 项缺位）。

/**
 * BM25 归一（裁决 #10——不复用查重面平顶 ftsRankOf：该式对命中行恒 1.0 零区分）。
 * bm25 恒 ≤0 且越负越相关 → 1/(1−bm25) 值域 (0,1]；方向修正：提案原式 1/(1−bm25)
 * 随 |bm25| 增大而减小（越相关值越低），与本核「score 降序 = 相关居前」不变量相逆
 * （实测差匹配得 1.0、强匹配得 ~0.8）——取同形反向映射 −bm25/(1−bm25) = 1 − 1/(1−bm25)：
 * 弱命中 →0、强命中 →1，单调升且保留 (0,1) 值域区分（偏差已随任务上报）。
 */
export function bm25Norm(bm25: number): number {
  return -bm25 / (1 - bm25)
}

/** effective_rank 准入因子（1.0→1.0 / 0.6→0.92 / 0.4→0.84 / 0.2→0.76——微调档位） */
export function rankFactorOf(effectiveRank: number): number {
  return 1 + 0.2 * (effectiveRank - 1)
}

/** 热度轻加分（0.05×log(1+heat)——BM25 主导，热度不挤出相关条目） */
export function heatBonusOf(heat: number): number {
  return 0.05 * Math.log(1 + Math.max(0, heat))
}

/**
 * 三因子融合终式（裁决 #2）：score = norm(bm25) × rank因子 + 热度加分（降序 = 相关居前）。
 * bm25 缺位（无词面证据：无过滤全域查询 / 仅子串通道命中）→ norm 取中性 0.5
 * （不与强弱任一端重叠，避免无证据行挤占或沉底）。
 */
export function composeSearchScore(input: { bm25?: number; effectiveRank: number; heat: number }): number {
  const norm = input.bm25 === undefined ? 0.5 : bm25Norm(input.bm25)
  return norm * rankFactorOf(input.effectiveRank) + heatBonusOf(input.heat)
}

/** FTS5 phrase 引号包裹（内嵌引号转义——防 MATCH 注入） */
export function ftsQuote(term: string): string {
  return `"${term.replace(/"/g, '""')}"`
}

/** 检索词面切分（小写；≥2 字符词元——与查重面 ftsMatchOf 同口径） */
export function tokenizeSearchText(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter((t) => t.length >= 2))]
}

/**
 * keywords 列准入 MATCH（逐词 `keywords : "词"` AND——keywords 列空格连接受控词表，
 * 词即 token，等价旧精确 AND 语义）。全部词面缺席 → undefined。
 * 仅作准入通道——bm25 打分用 buildSearchFtsMatch（全列词面，命中行间有 tf/长度区分）。
 */
export function buildKeywordAdmissionMatch(keywords: readonly string[] | undefined): string | undefined {
  const parts: string[] = []
  for (const k of keywords ?? []) {
    const t = k.trim().toLowerCase()
    if (t !== '') parts.push(`keywords : ${ftsQuote(t)}`)
  }
  return parts.length === 0 ? undefined : parts.join(' AND ')
}

/**
 * search 打分 MATCH（全元数据列词面）：keywords 逐词 phrase AND + text 分词 phrase AND
 * （词元须全命中；CJK 子串补充通道另行 JS 判定——见 textSubstringHit）。
 * 全部词面缺席 → undefined（无 MATCH 面，全域中性分排序）。
 */
export function buildSearchFtsMatch(q: { keywords?: readonly string[]; text?: string }): string | undefined {
  const parts: string[] = []
  for (const k of q.keywords ?? []) {
    const t = k.trim().toLowerCase()
    if (t !== '') parts.push(ftsQuote(t))
  }
  const terms = q.text !== undefined ? tokenizeSearchText(q.text) : []
  if (terms.length === 1) parts.push(ftsQuote(terms[0]!))
  else if (terms.length > 1) parts.push(`(${terms.map(ftsQuote).join(' AND ')})`)
  return parts.length === 0 ? undefined : parts.join(' AND ')
}

/** text 子串补充准入通道（大小写不敏感子串——title/summary 仅元数据列；CJK run 边界兜底） */
export function textSubstringHit(title: string, summary: string, text: string): boolean {
  const t = text.trim().toLowerCase()
  if (t === '') return false
  return title.toLowerCase().includes(t) || summary.toLowerCase().includes(t)
}

// ── 共享域路径校验（stage③ §2.2：setDomainDescription 与 write 严契约同一校验函数） ──

/**
 * 域路径校验（拒收返回原因串，合法返回 undefined）：非空 / ≤3 层 / ≤500 字符 /
 * 无点前导段 / 字符集（isSafeRelPath 受控词面）。write 侧空串 = 根域合法由调用方先行放行。
 */
export function validateDomainPath(domain: string): string | undefined {
  if (domain.trim() === '') return '空域路径'
  if (domain.length > 500) return `域路径超长（${domain.length} > 500）`
  const segments = domain.split('/')
  if (segments.some((s) => s === '' || s.startsWith('.'))) return '空段或点前导段'
  if (segments.length > 3) return `域层级超限（${segments.length} > 3）`
  if (!isSafeRelPath(`${domain}/x.md`)) return '非法相对路径（字符集/形态）'
  return undefined
}

// ── 项目域归属单一助手（评审中：topDomainIndexOf 与 service.projectEntryIds 双写收敛） ──

/**
 * 域归属单一事实源：knowledge_dir 前缀匹配（任一版本文件落在 knowledge_dir 下即属
 * 该项目域——JS 侧 startsWith 双分隔符匹配，免 LIKE ESCAPE 转义域）。
 * 规模上界：对传入的版本行集单次线性扫（O(V) 行级、无逐条 SQL）；动态段每 turn 恰
 * 一次全表扫（topDomainIndexOf 供数径），无逐条查询放大——上界 = 库内全部版本行数
 * （V）与全部条目行数（E），SQLite prepared 语句常驻。
 */
export function collectEntryIdsUnderDir(
  versionRows: readonly { readonly id: string; readonly file_path: string }[],
  knowledgeDir: string,
): Set<string> {
  const dirPosix = knowledgeDir.replace(/[\\/]+$/, '')
  const ids = new Set<string>()
  for (const v of versionRows) {
    if (v.file_path.startsWith(`${dirPosix}/`) || v.file_path.startsWith(`${dirPosix}\\`)) ids.add(v.id)
  }
  return ids
}

// ── stage③ C2：动态段顶域计数（提案 §2.2 计数口径——每 turn 实时聚合，免缓存） ──

/** 顶域计数行（动态域索引段 text 函数消费） */
export interface TopDomainStat {
  /** 顶域（domain 首段——JS 侧截取） */
  readonly domain: string
  /** 条目计数（confirmed + unconfirmed 计、superseded/redirect 不计） */
  readonly entryCount: number
  /** 域简介（KNOWLEDGE_DOMAINS 联查；NULL = 无简介，动态段降级显示） */
  readonly description: string | null
}

/**
 * 顶域索引（计数口径——提案 §2.2 评审补）：
 * · 裁剪 = knowledge_entry_versions.file_path 落在该 ws_path 注册行知识目录前缀的
 *   条目 id 集（entries 全局表，registry 联裁至当前库）；
 * · status 过滤 = confirmed/unconfirmed 计入；superseded 不计；redirect
 *   （merged_into 非空）不计；
 * · 顶域 = domain 首段 JS 截取（根域文件 domain='' 不计）；简介联 knowledge_domains。
 * 输出序 = 计数降序、域名升序（确定性）。未注册 ws_path → 空数组。
 */
export function topDomainIndexOf(db: Database.Database, wsPath: string): TopDomainStat[] {
  const row = db
    .prepare<[string], { knowledge_dir: string }>(`SELECT knowledge_dir FROM knowledge_registry WHERE ws_path = ?`)
    .get(canonicalWsPath(wsPath))
  if (row === undefined) return []
  const ids = collectEntryIdsUnderDir(
    db.prepare<unknown[], { id: string; file_path: string }>(`SELECT id, file_path FROM knowledge_entry_versions`).all(),
    row.knowledge_dir,
  )
  const counts = new Map<string, number>()
  for (const e of db
    .prepare<unknown[], { id: string; status: string; merged_into: string | null; domain: string }>(
      `SELECT id, status, merged_into, domain FROM knowledge_entries`,
    )
    .all()) {
    if (!ids.has(e.id)) continue
    if (e.status !== 'confirmed' && e.status !== 'unconfirmed') continue
    if (e.merged_into !== null && e.merged_into !== '') continue
    const top = e.domain.split('/')[0] ?? ''
    if (top === '') continue
    counts.set(top, (counts.get(top) ?? 0) + 1)
  }
  const descriptions = new Map(
    db
      .prepare<[string], { domain: string; description: string | null }>(
        `SELECT domain, description FROM knowledge_domains WHERE ws_path = ?`,
      )
      .all(canonicalWsPath(wsPath))
      .map((r) => [r.domain, r.description] as const),
  )
  return [...counts.entries()]
    .map(([domain, entryCount]) => ({ domain, entryCount, description: descriptions.get(domain) ?? null }))
    .sort((a, b) => b.entryCount - a.entryCount || (a.domain < b.domain ? -1 : 1))
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
