// 知识域召回服务（3.2：search / readAbstract 检索面 + knowledge_recall_logs + 热度）。定位：业务。
// 语义（tech-design §Interface 2 + 交互二 + ER KNOWLEDGE_RECALL_LOGS）：
// · search = 索引缓存直读（SC2 零文件扫描——域前缀 SQL 段匹配 + 关键词/文本行内过滤 + 占位分排序）；
//   项目级索引零行（缺失）时静默重建联动（rebuildIndex），重建失败按因降级（见 rebuildMissingIndex）；
//   域过滤零行 ≠ 缺失——合法空结果直接返回，不触发重建（存在性口径 = 无过滤 COUNT，fix-31）。
// · readAbstract = 纯缓存读（正文永不读文件——场景⑤），未命中 = ERR_ENTRY_NOT_FOUND
//   （索引重建后 ID 漂移语义，Error Handling 表明文；故不联动重建——AUTOINCREMENT 重建后 id 不复用）。
// · 两动词均于执行点写 recall_logs：一行 = 调用 × 命中条目、call_id 分组（uuid）、零命中写
//   entry_id=NULL 哨兵行、快照字段（title_snap/domain_snap/frontmatter_id）抗索引重建、
//   query_json/hit_count/duration_ms 调用级字段同 call 各行重复。append-only（Hard Rule：
//   只经本域写入，不更新不删）。
// · 检索异常降级 app_key_logs（scope=recall，只记关键：索引缺失触发重建（自动修复）/ 条目未命中 /
//   重建失败——正常召回轨迹在 recall_logs，成功路径不记关键日志）。app_key_logs 写入为本域
//   自备语句（forge/key-logs 同构 SQL，铁律③ 禁 import ../forge/——共享表经 db/ 句柄单写路径）。
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  EntryAbstract,
  HeatByEntry,
  KnowledgeService,
  ReadAbstractQuery,
  RecallQuerySnapshot,
  RecallVerb,
  SearchHit,
  SearchQuery,
} from '@dsh-forge/contracts'
import { withTransaction } from '../db/index.js'
import { createKnowledgeIndexService, type KnowledgeIndexService } from './index-service.js'
import { EntryNotFoundError, IndexStaleError, InvalidKnowledgeDirError } from './errors.js'

export interface KnowledgeRecallServiceDeps {
  /** SQLite 句柄（db/ 唯一产出；一切 SQL prepared） */
  db: Database.Database
  /** 索引重建缝（缺省 = 本域 index-service；注入缝供测试替身，3.3 装配收口后亦可整体注入） */
  indexService?: Pick<KnowledgeIndexService, 'rebuildIndex'>
}

/** 3.2 服务面：search / readAbstract / heatByEntry（浏览查询面归 3.3） */
export type KnowledgeRecallService = Pick<KnowledgeService, 'search' | 'readAbstract' | 'heatByEntry'>

// ── 占位分权重（PRD「置信度占位排序」——P1 确定性启发式，M+ 置信度模型替换） ──

const KEYWORD_WEIGHT = 2 // 每命中一个检索关键词
const TITLE_WEIGHT = 2 // text 命中标题
const SUMMARY_WEIGHT = 1 // text 命中摘要

/** 打分输入（索引行的可打分子集；keywords 已解析） */
export interface RankableEntry {
  entryId: number
  title: string
  summary: string
  keywords: string[]
}

/** 打分产物（score = 占位置信度；同分按 entryId 升序保证确定性） */
export interface RankedEntry<T extends RankableEntry> {
  entry: T
  score: number
}

/**
 * 行内过滤与占位打分（纯函数）：
 * · keywords = AND 细分（「细分」= 收窄口径——每个检索关键词都须命中条目 keywords；大小写不敏感）
 * · text = 标题/摘要大小写不敏感子串（两者皆不中则排除）
 * · score = KEYWORD_WEIGHT×命中关键词数 + TITLE_WEIGHT/SUMMARY_WEIGHT×text 命中位
 * · 排序 score 降序，同分 entryId 升序
 */
export function rankEntries<T extends RankableEntry>(entries: readonly T[], input: { keywords?: string[]; text?: string }): RankedEntry<T>[] {
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

// ── 行形状 ──

interface EntryRow {
  id: number
  frontmatter_id: string | null
  domain_path: string
  title: string
  summary: string
  keywords: string
  status: string
}

/** EntryRow 的可打分形态（keywords 解码为 string[]——覆盖存储态 JSON 字符串） */
type RankableRow = Omit<EntryRow, 'keywords'> & RankableEntry

/** recall_logs 单行插入参数（列序） */
type RecallLogParams = readonly [
  projectId: string,
  callId: string,
  sessionId: string,
  verb: RecallVerb,
  entryId: number | null,
  frontmatterId: string | null,
  titleSnap: string | null,
  domainSnap: string | null,
  queryJson: string,
  hitCount: number,
  durationMs: number,
  createdAt: string,
]

/** 一次召回调用的日志写入输入（N 命中 N 行；零命中 = 哨兵行） */
interface RecallLogWrite {
  projectId: string
  callId: string
  sessionId: string
  verb: RecallVerb
  hits: readonly { entryId: number; frontmatterId: string | null; titleSnap: string; domainSnap: string }[]
  query: RecallQuerySnapshot
  hitCount: number
  durationMs: number
}

/** LIKE 通配转义（% _ \）——域前缀 SQL 段匹配防通配符注入（Security Mitigations：prepared + 输入规整） */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** 关键日志级别（ER CHECK level IN ('warn','error')——scope 固定 'recall' 由语句字面量保证） */
type RecallLogLevel = 'warn' | 'error'

/** 调用参数快照（query_json 形状 = RecallQuerySnapshot；仅记在位的过滤维度） */
function searchSnapshot(q: SearchQuery): RecallQuerySnapshot {
  const snap: RecallQuerySnapshot = {}
  if (q.domainPrefix !== undefined) snap.domainPrefix = q.domainPrefix
  if (q.keywords !== undefined) snap.keywords = q.keywords
  if (q.text !== undefined) snap.text = q.text
  return snap
}

/**
 * 召回服务工厂。服务面三法均为缓存直读 + 执行点日志写入；projectId 未命中 fail-loud
 * 裸错（非六码，同 3.1 rebuildIndex / forge 域先例）。
 */
export function createKnowledgeRecallService(deps: KnowledgeRecallServiceDeps): KnowledgeRecallService {
  const { db } = deps
  const indexService = deps.indexService ?? createKnowledgeIndexService({ db })

  const selectProject = db.prepare<unknown[], { id: string }>(`SELECT id FROM projects WHERE id = ?`)
  const selectAll = db.prepare<unknown[], EntryRow>(
    `SELECT id, frontmatter_id, domain_path, title, summary, keywords, status
     FROM knowledge_entries WHERE project_id = ? ORDER BY id`,
  )
  const selectByDomain = db.prepare<[string, string, string], EntryRow>(
    `SELECT id, frontmatter_id, domain_path, title, summary, keywords, status
     FROM knowledge_entries
     WHERE project_id = ? AND (domain_path = ? OR domain_path LIKE ? ESCAPE '\\')
     ORDER BY id`,
  )
  const selectEntry = db.prepare<[string, number], EntryRow>(
    `SELECT id, frontmatter_id, domain_path, title, summary, keywords, status
     FROM knowledge_entries WHERE project_id = ? AND id = ?`,
  )
  // 索引存在性口径（fix-31）：项目级无过滤 COUNT——域过滤查询零行 ≠ 索引缺失（agent 探索
  // 常态），误判即整库重建（entryId 全换 + clearRecallEntryRefs 清热度链 + 日志刷屏）。
  const countEntries = db.prepare<unknown[], { c: number }>(
    `SELECT COUNT(*) AS c FROM knowledge_entries WHERE project_id = ?`,
  )
  const selectHeat = db.prepare<unknown[], { entry_id: number; heat: number }>(
    `SELECT entry_id, COUNT(*) AS heat FROM knowledge_recall_logs
     WHERE project_id = ? AND entry_id IS NOT NULL GROUP BY entry_id ORDER BY entry_id`,
  )
  const insertRecallLog = db.prepare(
    `INSERT INTO knowledge_recall_logs (
       project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap, domain_snap,
       query_json, hit_count, duration_ms, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertKeyLog = db.prepare(
    `INSERT INTO app_key_logs (level, scope, message, data_json, created_at) VALUES (?, 'recall', ?, ?, ?)`,
  )

  /** 关键日志（只记关键：重建触发/未命中/失败；成功召回轨迹在 recall_logs，不在此记） */
  function recordRecallKeyLog(level: RecallLogLevel, message: string, data: Record<string, unknown>): void {
    insertKeyLog.run(level, message, JSON.stringify(data), new Date().toISOString())
  }

  /** 一次调用的事务原子写入：N 命中 N 行；零命中 = 单哨兵行（entry_id NULL / hit_count 0 / 快照 NULL） */
  function writeRecallLog(write: RecallLogWrite): void {
    const createdAt = new Date().toISOString() // 执行点时间（同 call 各行一致）
    const queryJson = JSON.stringify(write.query) // 同 call 各行重复
    withTransaction(db, () => {
      if (write.hits.length === 0) {
        const row: RecallLogParams = [
          write.projectId, write.callId, write.sessionId, write.verb,
          null, null, null, null, queryJson, 0, write.durationMs, createdAt,
        ]
        insertRecallLog.run(...row)
        return
      }
      for (const hit of write.hits) {
        const row: RecallLogParams = [
          write.projectId, write.callId, write.sessionId, write.verb,
          hit.entryId, hit.frontmatterId, hit.titleSnap, hit.domainSnap,
          queryJson, write.hitCount, write.durationMs, createdAt,
        ]
        insertRecallLog.run(...row)
      }
    })
  }

  /**
   * 索引缺失（项目级零行）静默重建联动（ERR_INDEX_STALE 语义）：
   * · 成功 → warn 记自动修复事件（单事件单条）后由调用方直读新索引（空目录合法 = 空结果）
   * · 失败 → 按因降级：目录不可达原样上抛 InvalidKnowledgeDirError（Hard Rule 2 六码面）；
   *   其余异常包装 IndexStaleError（索引仍缺失，检索中止）——均先落 app_key_logs(error)
   */
  async function rebuildMissingIndex(projectId: string): Promise<void> {
    try {
      const report = await indexService.rebuildIndex(projectId)
      recordRecallKeyLog('warn', 'search 索引缺失触发静默重建', { projectId, indexed: report.indexed, skipped: report.skipped })
    } catch (cause) {
      if (cause instanceof InvalidKnowledgeDirError) {
        recordRecallKeyLog('error', 'search 静默重建失败：知识目录不可达', { projectId, reason: cause.message })
        throw cause
      }
      const reason = cause instanceof Error ? cause.message : String(cause)
      recordRecallKeyLog('error', 'search 静默重建失败（索引仍缺失）', { projectId, reason })
      throw new IndexStaleError({ projectId, reason }, cause)
    }
  }

  function requireProject(projectId: string, verb: string): void {
    if (selectProject.get(projectId) === undefined) {
      throw new Error(`项目不存在：${verb}(${projectId})——id 未命中 projects 行`)
    }
  }

  /** 域前缀可选的缓存行读取（undefined = 全域；空串 = 根域；尾 '/' 归一） */
  function selectRows(q: SearchQuery): EntryRow[] {
    if (q.domainPrefix === undefined) return selectAll.all(q.projectId)
    const prefix = q.domainPrefix.replace(/\/+$/, '')
    return selectByDomain.all(q.projectId, prefix, `${escapeLike(prefix)}/%`)
  }

  /** 打分产物 → SearchHit（摘要先行六字段） */
  function rankedToHits(ranked: readonly RankedEntry<RankableRow>[]): SearchHit[] {
    return ranked.map(({ entry, score }) => ({
      entryId: entry.id,
      frontmatterId: entry.frontmatter_id,
      title: entry.title,
      summary: entry.summary,
      domainPath: entry.domain_path,
      score,
    }))
  }

  return {
    async search(q: SearchQuery): Promise<SearchHit[]> {
      const startMs = Date.now()
      requireProject(q.projectId, 'search')

      // 索引缓存直读：域前缀 SQL 段匹配（= 前缀 或 前缀/… 子域；ESCAPE 防通配注入）
      const rows: EntryRow[] = selectRows(q)
      if (rows.length === 0 && countEntries.get(q.projectId)!.c === 0) {
        await rebuildMissingIndex(q.projectId) // 项目级零行 = 索引缺失 → 静默重建联动（检索本身零文件扫描）
        rows.push(...selectRows(q)) // 域零行（索引在）= 合法空结果；空目录重建后仍零行亦合法
      }

      const rankable: RankableRow[] = rows.map((r) => ({ ...r, entryId: r.id, keywords: JSON.parse(r.keywords) as string[] }))
      const ranked = rankEntries(rankable, q)
      const limited = q.limit !== undefined && q.limit > 0 ? ranked.slice(0, q.limit) : ranked
      const hits = rankedToHits(limited)

      writeRecallLog({
        projectId: q.projectId,
        callId: randomUUID(), // 一次调用分组键
        sessionId: q.sessionId ?? '', // 缺省空串 = 无会话上下文（不进任何会话 tab）
        verb: 'search',
        hits: hits.map((h) => ({
          entryId: h.entryId, frontmatterId: h.frontmatterId, titleSnap: h.title, domainSnap: h.domainPath,
        })),
        query: searchSnapshot(q),
        hitCount: hits.length, // = 本次调用返回（= 落行）数；limit 截断后口径一致
        durationMs: Date.now() - startMs, // 执行点耗时（M7 trace 前置）
      })
      return hits
    },

    async readAbstract(q: ReadAbstractQuery): Promise<EntryAbstract> {
      const startMs = Date.now()
      requireProject(q.projectId, 'readAbstract')

      const row = selectEntry.get(q.projectId, q.entryId)
      if (row === undefined) {
        // 未命中 = ID 漂移语义（Error Handling 表 404 行）——warn 记关键异常后抛六码（不联动重建：
        // 零行索引时 entryId 必来自旧索引，AUTOINCREMENT 重建后 id 不复用，重建无济于命中）
        recordRecallKeyLog('warn', 'read-abstract 条目未命中（索引重建后 ID 漂移或未入索引）', {
          projectId: q.projectId, entryId: q.entryId,
        })
        throw new EntryNotFoundError({ projectId: q.projectId, entryId: q.entryId })
      }

      writeRecallLog({
        projectId: q.projectId,
        callId: randomUUID(),
        sessionId: q.sessionId ?? '',
        verb: 'read-abstract',
        hits: [{ entryId: row.id, frontmatterId: row.frontmatter_id, titleSnap: row.title, domainSnap: row.domain_path }],
        query: { entryId: q.entryId },
        hitCount: 1,
        durationMs: Date.now() - startMs,
      })
      return {
        entryId: row.id,
        title: row.title,
        summary: row.summary, // 摘要先行——正文不读（场景⑤）
        keywords: JSON.parse(row.keywords) as string[],
        status: row.status,
        domainPath: row.domain_path,
      }
    },

    async heatByEntry(projectId: string): Promise<HeatByEntry> {
      // 热度口径 = 按条目 COUNT(*)（search 命中与 read-abstract 各计一次；哨兵行 entry_id NULL 不计）
      return new Map(selectHeat.all(projectId).map((r) => [r.entry_id, r.heat]))
    },
  }
}
