// 知识域浏览查询服务（3.3：listEntries / getEntryDetail / sessionRecall；3.5：browse 域树聚合
// ——forge:knowledge/browse 通道 handler 本体挂接）。定位：业务。
// 语义（tech-design §Interface 2 + ER KNOWLEDGE_RECALL_LOGS + UF-4/UF-6）：
// · listEntries = 索引缓存直读（title/summary/keywords/status/domainPath）+ 事件热度 join
//   （heatByEntry 同口径单表计数）+ updated 展示位按需读文件（frontmatter.updated 缺省 mtime；
//   schema 无 updated 列（蓝本），文件读取失败回退 indexed_at——浏览韧性，卡片不因外部删除缺位）；
//   domainPrefix = 目录路径段前缀（与 search 同口径：= 前缀 或 前缀/… 子域，不误吞段首相似域）；
//   keyword = keywords 维度细分（大小写不敏感子串——工具栏「关键词搜索」）；兼作域树聚合数据源
//   （aggregateDomainTree：目录即域 ≤3 层，节点计数含子域，与域前缀过滤同口径）。
// · getEntryDetail = 元数据（索引）与正文（文件按需读取）分离返回：body = frontmatter 块之后
//   的 Markdown 正文（数据侧保证不含 frontmatter）；authors/updated 取文件 frontmatter
//   （缺省 mtime / null）。索引行未命中或源文件不可读 → ERR_ENTRY_NOT_FOUND（详情面无法供正文）。
// · sessionRecall = 召回 tab 数据源，knowledge_recall_logs 单表直读（SC2 同源，禁投影表）：
//   分组 = call_id 聚合（最近在前）；统计头口径 recallStats——次数 = COUNT(DISTINCT call_id)
//   （零命中调用计次）、覆盖 = 去重命中条目；分组行 = 条目快照展开（title_snap/domain_snap 抗
//   索引重建）+ 动词明细 + 最近时间 + 热度徽章（entry_id 计数，重建清引用后按 frontmatter_id
//   兜底分组——ER「热度兜底分组键」）。
// · 索引缺失（项目级无过滤 COUNT 零行）静默重建联动同 search——域过滤零行 = 合法空结果
//   不触发重建（存在性口径同 3.2，fix-31；ERR_INDEX_STALE 语义）；浏览路径关键日志记
//   scope='index'（ER 记名域③：索引自动修复/重建失败；成功召回轨迹不在此记）。
// app_key_logs 写入为本域自备语句（forge/key-logs 同构 SQL，铁律③ 禁 import ../forge/——
// 共享表经 db/ 句柄单写路径）。浏览查询面零写 recall_logs（召回动词归 3.2 检索面）。
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import type Database from 'better-sqlite3'
import type {
  DomainNode,
  EntryDetail,
  KnowledgeCard,
  KnowledgeService,
  ListEntriesQuery,
  RecallGroup,
  RecallGroupHit,
  RecallQuerySnapshot,
  SessionRecallQuery,
} from '@dsh-forge/contracts'
import { createKnowledgeIndexService, type KnowledgeIndexService } from './index-service.js'
import { EntryNotFoundError, IndexStaleError, InvalidKnowledgeDirError } from './errors.js'

export interface KnowledgeBrowseServiceDeps {
  /** SQLite 句柄（db/ 唯一产出；一切 SQL prepared） */
  db: Database.Database
  /** 索引重建缝（缺省 = 本域 index-service；注入缝供测试替身与装配收口共享实例） */
  indexService?: Pick<KnowledgeIndexService, 'rebuildIndex'>
}

/** browse 聚合入参（forge:knowledge/browse 通道负载同构——dto/rpc.ts browse 行） */
export interface BrowseQuery {
  projectId: string
}

/** 3.5 browse 聚合面（通道 handler 本体）：listEntries 兼作底表 → aggregateDomainTree 域树 */
export interface KnowledgeBrowseFace {
  browse(q: BrowseQuery): Promise<DomainNode[]>
}

/** 3.3 服务面 + 3.5 browse 聚合：listEntries / getEntryDetail / sessionRecall / browse */
export type KnowledgeBrowseService = Pick<KnowledgeService, 'listEntries' | 'getEntryDetail' | 'sessionRecall'> &
  KnowledgeBrowseFace

// ── 纯函数：域树聚合（forge:knowledge/browse 消费） ──

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

// ── 纯函数：统计头口径（UF-4 召回 tab 统计头数据源） ──

/** 命中条目身份键（去重口径：entry_id → frontmatter_id 兜底 → 标题快照兜底） */
function hitIdentity(hit: RecallGroupHit): string {
  if (hit.entryId !== null) return `e:${hit.entryId}`
  if (hit.frontmatterId !== null) return `f:${hit.frontmatterId}`
  return `t:${hit.title ?? ''}`
}

/**
 * 召回统计头：次数 = 分组数（= COUNT(DISTINCT call_id)，零命中调用计次不计覆盖）；
 * 覆盖 = 去重命中条目（身份键去重——重建清引用后按 frontmatter_id 归并同一知识条目）。
 */
export function recallStats(groups: readonly RecallGroup[]): { calls: number; covered: number } {
  const covered = new Set<string>()
  for (const group of groups) {
    for (const hit of group.hits) covered.add(hitIdentity(hit))
  }
  return { calls: groups.length, covered: covered.size }
}

// ── 行形状 ──

/** 浏览面条目行（rel_path 供按需读文件；indexed_at 供 updated 回退） */
interface BrowseEntryRow {
  id: number
  domain_path: string
  title: string
  summary: string
  keywords: string
  status: string
  rel_path: string
  indexed_at: string
}

/** 详情行（较浏览行多 frontmatter_id） */
interface DetailEntryRow extends BrowseEntryRow {
  frontmatter_id: string | null
}

/** sessionRecall 原始行 */
interface RecallRow {
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

/** LIKE 通配转义（% _ \）——域前缀 SQL 段匹配防通配符注入（Security Mitigations，与 3.2 同口径） */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** 展示位 updated 归一：非空串直传 / Date 字面量 ISO 化（js-yaml 日期产物） / 其余取缺省 */
function displayUpdated(value: unknown, fallbackMs: number): string {
  if (typeof value === 'string' && value.trim() !== '') return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  return new Date(fallbackMs).toISOString()
}

/** 非空字符串（authors 缺省判定） */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

/** 关键日志级别（ER CHECK level IN ('warn','error')——scope 固定 'index' 由语句字面量保证） */
type IndexLogLevel = 'warn' | 'error'

/**
 * 浏览查询服务工厂。三法均为直读面（零写 recall_logs）；projectId 未命中 fail-loud 裸错
 * （非六码，同 3.1/3.2 先例）。
 */
export function createKnowledgeBrowseService(deps: KnowledgeBrowseServiceDeps): KnowledgeBrowseService {
  const { db } = deps
  const indexService = deps.indexService ?? createKnowledgeIndexService({ db })

  const selectProject = db.prepare<unknown[], { id: string }>(`SELECT id FROM projects WHERE id = ?`)
  const selectKnowledgeDir = db.prepare<unknown[], { knowledge_dir: string }>(
    `SELECT knowledge_dir FROM projects WHERE id = ?`,
  )
  const selectAll = db.prepare<unknown[], BrowseEntryRow>(
    `SELECT id, domain_path, title, summary, keywords, status, rel_path, indexed_at
     FROM knowledge_entries WHERE project_id = ? ORDER BY domain_path, id`,
  )
  const selectByDomain = db.prepare<[string, string, string], BrowseEntryRow>(
    `SELECT id, domain_path, title, summary, keywords, status, rel_path, indexed_at
     FROM knowledge_entries
     WHERE project_id = ? AND (domain_path = ? OR domain_path LIKE ? ESCAPE '\\')
     ORDER BY domain_path, id`,
  )
  const selectEntry = db.prepare<[string, number], DetailEntryRow>(
    `SELECT id, frontmatter_id, domain_path, title, summary, keywords, status, rel_path, indexed_at
     FROM knowledge_entries WHERE project_id = ? AND id = ?`,
  )
  // 索引存在性口径（fix-31，与 3.2 search 同口径）：项目级无过滤 COUNT——域过滤查询零行
  // ≠ 索引缺失，误判即整库重建（entryId 全换 + 热度链引用清空 + 日志刷屏）。
  const countEntries = db.prepare<unknown[], { c: number }>(
    `SELECT COUNT(*) AS c FROM knowledge_entries WHERE project_id = ?`,
  )
  const selectHeatByEntry = db.prepare<unknown[], { entry_id: number; heat: number }>(
    `SELECT entry_id, COUNT(*) AS heat FROM knowledge_recall_logs
     WHERE project_id = ? AND entry_id IS NOT NULL GROUP BY entry_id`,
  )
  const selectHeatByFrontmatterId = db.prepare<unknown[], { frontmatter_id: string; heat: number }>(
    `SELECT frontmatter_id, COUNT(*) AS heat FROM knowledge_recall_logs
     WHERE project_id = ? AND frontmatter_id IS NOT NULL GROUP BY frontmatter_id`,
  )
  const selectSessionRows = db.prepare<[string, string], RecallRow>(
    `SELECT call_id, verb, entry_id, frontmatter_id, title_snap, domain_snap, query_json, hit_count, duration_ms, created_at
     FROM knowledge_recall_logs WHERE project_id = ? AND session_id = ? ORDER BY created_at, id`,
  )
  const insertKeyLog = db.prepare(
    `INSERT INTO app_key_logs (level, scope, message, data_json, created_at) VALUES (?, 'index', ?, ?, ?)`,
  )

  function recordIndexKeyLog(level: IndexLogLevel, message: string, data: Record<string, unknown>): void {
    insertKeyLog.run(level, message, JSON.stringify(data), new Date().toISOString())
  }

  function requireProject(projectId: string, verb: string): void {
    if (selectProject.get(projectId) === undefined) {
      throw new Error(`项目不存在：${verb}(${projectId})——id 未命中 projects 行`)
    }
  }

  /**
   * 索引缺失（项目级零行）静默重建联动（ERR_INDEX_STALE 语义，同 search 面口径）：
   * 成功 → warn 记自动修复（ER「自动修复」关键事件，scope=index）；失败 → 按因降级：
   * 目录不可达原样上抛 InvalidKnowledgeDirError；其余包装 IndexStaleError——均先落 error。
   */
  async function rebuildMissingIndex(projectId: string): Promise<void> {
    try {
      const report = await indexService.rebuildIndex(projectId)
      recordIndexKeyLog('warn', 'listEntries 索引缺失触发静默重建', { projectId, indexed: report.indexed, skipped: report.skipped })
    } catch (cause) {
      if (cause instanceof InvalidKnowledgeDirError) {
        recordIndexKeyLog('error', 'listEntries 静默重建失败：知识目录不可达', { projectId, reason: cause.message })
        throw cause
      }
      const reason = cause instanceof Error ? cause.message : String(cause)
      recordIndexKeyLog('error', 'listEntries 静默重建失败（索引仍缺失）', { projectId, reason })
      throw new IndexStaleError({ projectId, reason }, cause)
    }
  }

  /** 域前缀可选的缓存行读取（undefined = 全域；空串 = 根域；尾 '/' 归一——与 search 同口径） */
  function selectRows(q: ListEntriesQuery): BrowseEntryRow[] {
    if (q.domainPrefix === undefined) return selectAll.all(q.projectId)
    const prefix = q.domainPrefix.replace(/\/+$/, '')
    return selectByDomain.all(q.projectId, prefix, `${escapeLike(prefix)}/%`)
  }

  /** 卡片 updated 展示位：按需读文件 frontmatter（缺省 mtime）；不可读回退本次索引时间 */
  function readCardUpdated(knowledgeDir: string, row: BrowseEntryRow): string {
    try {
      const absPath = join(knowledgeDir, ...row.rel_path.split('/'))
      const mtimeMs = statSync(absPath).mtimeMs
      const content = readFileSync(absPath, 'utf8')
      return displayUpdated(matter(content).data.updated, mtimeMs)
    } catch {
      return row.indexed_at // 外部删除/不可读：卡片仍在（索引直读），展示位回退最后已知索引时间
    }
  }

  /** listEntries 本体（browse 聚合与通道面共用同一实现——底表口径不漂移） */
  const listEntries = async (q: ListEntriesQuery): Promise<KnowledgeCard[]> => {
    requireProject(q.projectId, 'listEntries')

    let rows = selectRows(q)
    if (rows.length === 0 && countEntries.get(q.projectId)!.c === 0) {
      await rebuildMissingIndex(q.projectId) // 项目级零行 = 索引缺失 → 静默重建联动（进面板按需重建）
      rows = selectRows(q) // 域零行（索引在）= 合法空结果；空目录重建后仍零行亦合法
    }

    const keyword = q.keyword?.trim().toLowerCase() ?? ''
    const heatByEntry = new Map(selectHeatByEntry.all(q.projectId).map((r) => [r.entry_id, r.heat] as const))
    const knowledgeDir = selectKnowledgeDir.get(q.projectId)!.knowledge_dir

    return rows
      .filter((row) => {
        if (keyword === '') return true // 关键词细分 = keywords 维度（大小写不敏感子串）
        const keywords = JSON.parse(row.keywords) as string[]
        return keywords.some((k) => k.toLowerCase().includes(keyword))
      })
      .map((row) => ({
        entryId: row.id,
        title: row.title,
        summary: row.summary,
        keywords: JSON.parse(row.keywords) as string[],
        status: row.status,
        domainPath: row.domain_path,
        updated: readCardUpdated(knowledgeDir, row),
        heat: heatByEntry.get(row.id) ?? 0, // 热度徽章 = 使用事件计数（heatByEntry 同源单表）
      }))
  }

  return {
    /** 3.5：域树聚合（forge:knowledge/browse handler 本体）——listEntries 全域底表 → 纯函数聚合 */
    browse: async (q: BrowseQuery): Promise<DomainNode[]> => aggregateDomainTree(await listEntries({ projectId: q.projectId })),

    listEntries,

    async getEntryDetail(q): Promise<EntryDetail> {
      requireProject(q.projectId, 'getEntryDetail')

      const row = selectEntry.get(q.projectId, q.entryId)
      if (row === undefined) {
        throw new EntryNotFoundError({ projectId: q.projectId, entryId: q.entryId }) // ID 漂移语义（404 行）
      }

      // 正文按需读取（元数据与正文分离）：body = frontmatter 块之后的 Markdown（不含 frontmatter）
      const absPath = join(selectKnowledgeDir.get(q.projectId)!.knowledge_dir, ...row.rel_path.split('/'))
      let parsed: { data: Record<string, unknown>; body: string }
      let mtimeMs: number
      try {
        mtimeMs = statSync(absPath).mtimeMs
        const { data, content } = matter(readFileSync(absPath, 'utf8'))
        parsed = { data: data as Record<string, unknown>, body: content.trim() }
      } catch (cause) {
        // 索引行在而源文件不可读（外部删除）——详情面无法供正文，404 语义交 UI 错误态
        throw new EntryNotFoundError({ projectId: q.projectId, entryId: q.entryId, reason: `源文件不可读：${row.rel_path}` }, cause)
      }

      return {
        entryId: row.id,
        title: row.title, // 元数据 = 索引直读（同 readAbstract 口径）
        summary: row.summary,
        keywords: JSON.parse(row.keywords) as string[],
        status: row.status,
        domainPath: row.domain_path,
        authors: isNonEmptyString(parsed.data.authors) ? parsed.data.authors : null,
        updated: displayUpdated(parsed.data.updated, mtimeMs), // 缺省取文件 mtime
        body: parsed.body,
      }
    },

    async sessionRecall(q: SessionRecallQuery): Promise<RecallGroup[]> {
      requireProject(q.projectId, 'sessionRecall')

      const rows = selectSessionRows.all(q.projectId, q.sessionId)
      if (rows.length === 0) return []

      // 热度徽章数据（项目级使用事件计数，heatByEntry 同源）：entry_id 计数 + frontmatter_id 兜底
      const heatByEntry = new Map(selectHeatByEntry.all(q.projectId).map((r) => [r.entry_id, r.heat] as const))
      const heatByFrontmatterId = new Map(
        selectHeatByFrontmatterId.all(q.projectId).map((r) => [r.frontmatter_id, r.heat] as const),
      )

      const groups: RecallGroup[] = []
      let current: RecallGroup | null = null
      for (const row of rows) {
        if (current === null || current.callId !== row.call_id) {
          // 同 call 各行共享调用级字段；query_json 由本域写入面保证可解析（防御 null → null）
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
            createdAt: row.created_at, // 最近时间（同 call 各行一致 = 执行点时间）
            hits: [],
          }
          groups.push(current)
        }
        // 零命中哨兵行（entry_id/frontmatter_id/title_snap 全 NULL）不展开为命中
        if (row.entry_id === null && row.frontmatter_id === null && row.title_snap === null) continue
        current.hits.push({
          entryId: row.entry_id, // null = 条目已重建清除（行保留；UI 行级失效标注归 3.8）
          frontmatterId: row.frontmatter_id,
          title: row.title_snap, // 快照抗索引重建
          domainPath: row.domain_snap,
          heat: row.entry_id !== null
            ? (heatByEntry.get(row.entry_id) ?? 0)
            : row.frontmatter_id !== null
              ? (heatByFrontmatterId.get(row.frontmatter_id) ?? 0) // 兜底分组键（ER）
              : 0,
        })
      }
      groups.reverse() // 最近调用在前（tab 时序：新事件置顶，即时累积可见）
      return groups
    },
  }
}
