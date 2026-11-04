// knowledge 插件服务面（1.7 A2 服务切换）：core 八法随迁为插件服务面——行为等价
//（rebuildIndex/search/readAbstract/listEntries/getEntryDetail/heatByEntry/sessionRecall/browse，
// 供数 = 自持库 storage/）。两级解析（用户裁决 Q19）：projectId →（config 静态绑定表）
// → wsPath →（自持注册表 canonical 键）→ 注册行（knowledge_dir）。
// 键口径：knowledge_entries 项目键 = ws_path（注册表键同源）；knowledge_recall_logs
// project_id 列承载 API 级 projectId 值（种子迁移行同口径——旧 core id 快照列不违）。
// 关键异常降级：core 走 app_key_logs；本域经 storage rebuild 事件面（SC-10），检索面
// 异常语义（EntryNotFound/IndexStale/InvalidDir 三码）逐字保留。
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import type Database from 'better-sqlite3'
import { joinDirSegment } from '@dsh-forge/path-key'
import type {
  DomainNode,
  EntryDetail,
  HeatByEntry,
  KnowledgeCard,
  ListEntriesQuery,
  RecallGroup,
  RecallQuerySnapshot,
  RecallVerb,
  SessionRecallQuery,
} from '@dsh-forge/contracts'
import { withImmediateTransaction } from '../storage/concurrency.js'
import { canonicalWsPath, createKnowledgeRegistry } from '../storage/registry.js'
import { rebuildKnowledgeIndex } from '../storage/rebuild.js'
import { InvalidKnowledgeDirError as StorageInvalidKnowledgeDirError } from '../storage/scan.js'
import { KNOWLEDGE_REGISTER_EVENT, emitStorageDiag, storageDiag, type DiagEmitter } from '../storage/diag.js'
import { EntryNotFoundError, IndexStaleError, InvalidKnowledgeDirError } from './errors.js'
import {
  aggregateDomainTree,
  groupRecallRows,
  isNonEmptyString,
  normalizeUpdated,
  parseKeywords,
  prepareHeatByEntry,
  rankEntries,
  selectRowsByDomain,
  type RecallRow,
} from './internal.js'
import type {
  BrowseKnowledgeService,
  EntryAbstract,
  ReadAbstractQuery,
  SearchHit,
  SearchQuery,
} from './types.js'

/** 服务工厂入参 */
export interface KnowledgeServiceDeps {
  /** 自持库句柄（storage/open.ts 唯一产出；一切 SQL prepared） */
  readonly db: Database.Database
  /** 两级解析第一级：projectId → wsPath（config 静态绑定表反向——session.ts createWsPathResolver；未命中回查注册行 project_id 列） */
  readonly resolveWsPath: (projectId: string) => string | undefined
  /** 装配期注入诊断发射面（rebuild 事件域——SC-10；缺席走 diag.ts 兜底） */
  readonly emit?: DiagEmitter
  /**
   * 索引重建缝（缺省 = storage rebuildKnowledgeIndex；注入缝供测试替身——core
   * index-service 注入缝同型先例，行为等价面测试 ERR_INDEX_STALE 降级路径）。
   */
  readonly rebuild?: (wsPath: string, opts: { emit?: DiagEmitter; silent?: boolean }) => { indexed: number; skipped: number }
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

/** EntryRow 的可打分形态（keywords 解码为 string[]） */
type RankableRow = Omit<EntryRow, 'keywords'> & { entryId: number; keywords: string[] }

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

/** 调用参数快照（query_json 形状 = RecallQuerySnapshot；仅记在位的过滤维度） */
function searchSnapshot(q: SearchQuery): RecallQuerySnapshot {
  const snap: RecallQuerySnapshot = {}
  if (q.domainPrefix !== undefined) snap.domainPrefix = q.domainPrefix
  if (q.keywords !== undefined) snap.keywords = q.keywords
  if (q.text !== undefined) snap.text = q.text
  return snap
}

/**
 * 惰性 prepared 语句（stage② v4 过渡态）：首次访问才 prepare——旧形语句对 v4 新形表
 * 的列校验延迟到调用点，装配/服务注册面不受过渡期 schema 形态牵动；调用点 fail-loud
 * （SqliteError 裸错上抛——零静默）。
 */
function lazyStatement<Bind extends unknown[] = unknown[], Result = unknown>(
  db: Database.Database,
  sql: string,
): Database.Statement<Bind, Result> {
  let stmt: Database.Statement<Bind, Result> | undefined
  return new Proxy({} as Database.Statement<Bind, Result>, {
    get(_target, prop) {
      stmt ??= db.prepare<Bind, Result>(sql)
      const value = Reflect.get(stmt as object, prop)
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(stmt) : value
    },
  })
}

/**
 * 服务面工厂（八法）。projectId 未命中绑定表/注册行 fail-loud 裸错（非六码——core 先例
 * 同语义：fail-loud 原样上抛）。rebuildIndex 经 storage rebuild 单源（含埋点与事务纪律）。
 */
export function createKnowledgeService(deps: KnowledgeServiceDeps): BrowseKnowledgeService {
  const { db } = deps
  const emit = deps.emit
  // stage② 起 rebuild 为整库再生（实体表全局无项目键——storage/rebuild.ts v4）；wsPath
  // 仅保留缝签名（服务面 stage② 改写任务收口后随接口退役）。
  const rebuild = deps.rebuild ?? ((wsPath: string, opts: { emit?: DiagEmitter; silent?: boolean }) =>
    rebuildKnowledgeIndex(db, opts))

  /** 重建包装：storage 内部 InvalidKnowledgeDirError（无 code/data）→ 服务边界六码面（core 行为等价） */
  function runRebuild(wsPath: string, opts: { emit?: DiagEmitter; silent?: boolean }): { indexed: number; skipped: number } {
    try {
      return rebuild(wsPath, opts)
    } catch (cause) {
      if (cause instanceof StorageInvalidKnowledgeDirError) {
        const row = selectRegistryRow.get(canonicalWsPath(wsPath)) as { knowledge_dir: string } | undefined
        throw new InvalidKnowledgeDirError({ knowledgeDir: cause.knowledgeDir ?? row?.knowledge_dir }, cause)
      }
      throw cause
    }
  }

  // ── 两级解析：projectId → wsPath（config 静态表，未命中回查注册行 project_id 列——fix-2
  //    动态化：运行期 registerProject 落列，无需重启/无绑定表文件）→ 注册行（canonical 键存在性） ──
  const selectRegistryRow = db.prepare<unknown[], { ws_path: string; knowledge_dir: string }>(
    `SELECT ws_path, knowledge_dir FROM knowledge_registry WHERE ws_path = ?`,
  )
  const selectWsPathByProjectId = db.prepare<[string], { ws_path: string }>(
    `SELECT ws_path FROM knowledge_registry WHERE project_id = ?`,
  )

  /** projectId → { wsPath, knowledgeDir }（两级任一未命中 fail-loud） */
  function requireProject(projectId: string, verb: string): { wsPath: string; knowledgeDir: string } {
    const bound = deps.resolveWsPath(projectId) ?? selectWsPathByProjectId.get(projectId)?.ws_path
    const row = bound === undefined ? undefined : selectRegistryRow.get(canonicalWsPath(bound))
    if (row === undefined) {
      throw new Error(`项目不存在：${verb}(${projectId})——id 未命中绑定表/注册行`)
    }
    return { wsPath: row.ws_path, knowledgeDir: row.knowledge_dir }
  }

  // ── 语句（工厂内一次性 prepared） ──
  // stage② v4 过渡态：下述旧形缓存查询（v2 knowledge_entries 项目键/rel_path 形态——v4
  // 已由 slug id 实体表承接）改惰性 prepare——装配/服务 provide 照常加载，检索面首次
  // 调用对旧列 fail-loud 裸错；服务面 stage② 改写任务按 §2.9 新形收口后退役。
  const selectAll = lazyStatement<unknown[], EntryRow>(db,
    `SELECT id, frontmatter_id, domain_path, title, summary, keywords, status
     FROM knowledge_entries WHERE ws_path = ? ORDER BY id`,
  )
  const selectByDomain = lazyStatement<[string, string, string], EntryRow>(db,
    `SELECT id, frontmatter_id, domain_path, title, summary, keywords, status
     FROM knowledge_entries
     WHERE ws_path = ? AND (domain_path = ? OR domain_path LIKE ? ESCAPE '\\')
     ORDER BY id`,
  )
  // 浏览底表（rel_path 供按需读文件；indexed_at 供 updated 回退）
  const browseAll = lazyStatement<unknown[], BrowseEntryRow>(db,
    `SELECT id, domain_path, title, summary, keywords, status, rel_path, indexed_at
     FROM knowledge_entries WHERE ws_path = ? ORDER BY domain_path, id`,
  )
  const browseByDomain = lazyStatement<[string, string, string], BrowseEntryRow>(db,
    `SELECT id, domain_path, title, summary, keywords, status, rel_path, indexed_at
     FROM knowledge_entries
     WHERE ws_path = ? AND (domain_path = ? OR domain_path LIKE ? ESCAPE '\\')
     ORDER BY domain_path, id`,
  )
  const selectEntry = lazyStatement<[string, number], EntryRow>(db,
    `SELECT id, frontmatter_id, domain_path, title, summary, keywords, status
     FROM knowledge_entries WHERE ws_path = ? AND id = ?`,
  )
  const selectDetailEntry = lazyStatement<[string, number], DetailEntryRow>(db,
    `SELECT id, frontmatter_id, domain_path, title, summary, keywords, status, rel_path, indexed_at
     FROM knowledge_entries WHERE ws_path = ? AND id = ?`,
  )
  // 索引存在性口径（core fix-31 同口径）：项目级无过滤 COUNT——域过滤零行 ≠ 索引缺失
  const countEntries = lazyStatement<unknown[], { c: number }>(db,
    `SELECT COUNT(*) AS c FROM knowledge_entries WHERE ws_path = ?`,
  )
  const selectHeatByEntry = prepareHeatByEntry(db)
  const selectHeatByFrontmatterId = db.prepare<unknown[], { frontmatter_id: string; heat: number }>(
    `SELECT frontmatter_id, COUNT(*) AS heat FROM knowledge_recall_logs
     WHERE project_id = ? AND frontmatter_id IS NOT NULL GROUP BY frontmatter_id`,
  )
  const insertRecallLog = db.prepare(
    `INSERT INTO knowledge_recall_logs (
       project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap, domain_snap,
       query_json, hit_count, duration_ms, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectSessionRows = db.prepare<[string, string], RecallRow>(
    `SELECT call_id, verb, entry_id, frontmatter_id, title_snap, domain_snap, query_json, hit_count, duration_ms, created_at
     FROM knowledge_recall_logs WHERE project_id = ? AND session_id = ? ORDER BY created_at, id`,
  )

  /** 一次调用的事务原子写入：N 命中 N 行；零命中 = 单哨兵行（entry_id NULL / hit_count 0 / 快照 NULL） */
  function writeRecallLog(write: {
    projectId: string
    callId: string
    sessionId: string
    verb: RecallVerb
    hits: readonly { entryId: number; frontmatterId: string | null; titleSnap: string; domainSnap: string }[]
    query: RecallQuerySnapshot
    hitCount: number
    durationMs: number
  }): void {
    const createdAt = new Date().toISOString()
    const queryJson = JSON.stringify(write.query)
    withImmediateTransaction(db, () => {
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

  /** 打分产物 → SearchHit（摘要先行六字段） */
  function rankedToHits(ranked: readonly { entry: RankableRow; score: number }[]): SearchHit[] {
    return ranked.map(({ entry, score }) => ({
      entryId: entry.id,
      frontmatterId: entry.frontmatter_id,
      title: entry.title,
      summary: entry.summary,
      domainPath: entry.domain_path,
      score,
    }))
  }

  /** 索引缺失（项目级零行）静默重建联动（core rebuildMissingIndex 同语义）：
   *  失败按因降级——目录不可达原样上抛 InvalidKnowledgeDirError；其余包装 IndexStaleError。 */
  async function rebuildMissingIndex(projectId: string, wsPath: string): Promise<void> {
    try {
      runRebuild(wsPath, { emit, silent: true })
    } catch (cause) {
      if (cause instanceof InvalidKnowledgeDirError) throw cause
      throw new IndexStaleError({ projectId, reason: String((cause as Error)?.message ?? cause) }, cause)
    }
  }

  /** 卡片 updated 展示位：按需读文件 frontmatter（缺省 mtime）；不可读回退本次索引时间 */
  function readCardUpdated(knowledgeDir: string, row: BrowseEntryRow): string {
    try {
      const absPath = join(knowledgeDir, ...row.rel_path.split('/'))
      const mtimeMs = statSync(absPath).mtimeMs
      const content = readFileSync(absPath, 'utf8')
      return normalizeUpdated(matter(content).data.updated, mtimeMs)
    } catch {
      return row.indexed_at // 外部删除/不可读：卡片仍在（索引直读），展示位回退最后已知索引时间
    }
  }

  /** 注册表 upsert 单源（storage/registry.ts——canonical 键 + 幂等） */
  const registry = createKnowledgeRegistry(db)

  /** 注册行写入（第九法——1.15 进表径）：目录缺则递归建（fix-39 建面语义随 knowledge_dir
   *  列退役迁本域）→ upsert 注册行（幂等，projectId 落 project_id 列——fix-2 一级解析
   *  动态化）；成败均发 knowledge-register 事件（SC-10）。
   *  建目录失败 = 抛（host wiring 侧 fail-soft 记账，不抛断项目注册）。 */
  async function registerProjectRow(input: { wsPath: string; knowledgeDir?: string; projectId?: string }): Promise<void> {
    const dir = input.knowledgeDir ?? joinDirSegment(input.wsPath, '.knowledge')
    try {
      mkdirSync(dir, { recursive: true })
    } catch (cause) {
      emitStorageDiag(
        emit,
        storageDiag('error', KNOWLEDGE_REGISTER_EVENT, `知识目录建失败，注册行未落：${dir}：${String(cause)}`, {
          cwd: input.wsPath,
          projectId: input.projectId,
          stack: cause instanceof Error ? cause.stack : undefined,
        }),
      )
      throw cause
    }
    const row = registry.upsert(input.wsPath, dir, input.projectId)
    emitStorageDiag(
      emit,
      storageDiag('info', KNOWLEDGE_REGISTER_EVENT, `注册行落表：${row.wsPath} → ${row.knowledgeDir}`, {
        cwd: input.wsPath,
        projectId: row.projectId ?? input.projectId,
      }),
    )
  }

  // ── 浏览底表（browse 聚合与通道面共用同一实现——底表口径不漂移） ──
  const listEntries = async (q: ListEntriesQuery): Promise<KnowledgeCard[]> => {
    const { wsPath, knowledgeDir } = requireProject(q.projectId, 'listEntries')

    let rows = selectRowsByDomain(browseAll, browseByDomain, { wsPath, domainPrefix: q.domainPrefix })
    if (rows.length === 0 && countEntries.get(wsPath)!.c === 0) {
      await rebuildMissingIndex(q.projectId, wsPath)
      rows = selectRowsByDomain(browseAll, browseByDomain, { wsPath, domainPrefix: q.domainPrefix })
    }

    const keyword = q.keyword?.trim().toLowerCase() ?? ''
    const heatByEntry = new Map(selectHeatByEntry.all(q.projectId).map((r) => [r.entry_id, r.heat] as const))

    return rows
      .filter((row) => {
        if (keyword === '') return true
        const keywords = parseKeywords(row.keywords)
        return keywords.some((k) => k.toLowerCase().includes(keyword))
      })
      .map((row) => ({
        entryId: row.id,
        title: row.title,
        summary: row.summary,
        keywords: parseKeywords(row.keywords),
        status: row.status,
        domainPath: row.domain_path,
        updated: readCardUpdated(knowledgeDir, row),
        heat: heatByEntry.get(row.id) ?? 0,
      }))
  }

  return {
    async rebuildIndex(projectId: string) {
      const { wsPath } = requireProject(projectId, 'rebuildIndex')
      return runRebuild(wsPath, { emit })
    },

    async search(q: SearchQuery): Promise<SearchHit[]> {
      const startMs = Date.now()
      const { wsPath } = requireProject(q.projectId, 'search')

      const rows: EntryRow[] = selectRowsByDomain(selectAll, selectByDomain, { wsPath, domainPrefix: q.domainPrefix })
      if (rows.length === 0 && countEntries.get(wsPath)!.c === 0) {
        await rebuildMissingIndex(q.projectId, wsPath)
        rows.push(...selectRowsByDomain(selectAll, selectByDomain, { wsPath, domainPrefix: q.domainPrefix }))
      }

      const rankable: RankableRow[] = rows.map((r) => ({ ...r, entryId: r.id, keywords: parseKeywords(r.keywords) }))
      const ranked = rankEntries(rankable, q)
      const limited = q.limit !== undefined && q.limit > 0 ? ranked.slice(0, q.limit) : ranked
      const hits = rankedToHits(limited)

      writeRecallLog({
        projectId: q.projectId,
        callId: randomUUID(),
        sessionId: q.sessionId ?? '',
        verb: 'search',
        hits: hits.map((h) => ({
          entryId: h.entryId, frontmatterId: h.frontmatterId, titleSnap: h.title, domainSnap: h.domainPath,
        })),
        query: searchSnapshot(q),
        hitCount: hits.length,
        durationMs: Date.now() - startMs,
      })
      return hits
    },

    async readAbstract(q: ReadAbstractQuery): Promise<EntryAbstract> {
      const startMs = Date.now()
      const { wsPath } = requireProject(q.projectId, 'readAbstract')

      const row = selectEntry.get(wsPath, q.entryId)
      if (row === undefined) {
        // 未命中 = ID 漂移语义（Error Handling 表 404 行）——不联动重建（AUTOINCREMENT 重建后 id 不复用）
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
        summary: row.summary,
        keywords: parseKeywords(row.keywords),
        status: row.status,
        domainPath: row.domain_path,
      }
    },

    listEntries,

    async getEntryDetail(q): Promise<EntryDetail> {
      const { wsPath, knowledgeDir } = requireProject(q.projectId, 'getEntryDetail')

      const row = selectDetailEntry.get(wsPath, q.entryId)
      if (row === undefined) {
        throw new EntryNotFoundError({ projectId: q.projectId, entryId: q.entryId })
      }

      const absPath = join(knowledgeDir, ...row.rel_path.split('/'))
      let parsed: { data: Record<string, unknown>; body: string }
      let mtimeMs: number
      try {
        mtimeMs = statSync(absPath).mtimeMs
        const { data, content } = matter(readFileSync(absPath, 'utf8'))
        parsed = { data: data as Record<string, unknown>, body: content.trim() }
      } catch (cause) {
        throw new EntryNotFoundError({ projectId: q.projectId, entryId: q.entryId, reason: `源文件不可读：${row.rel_path}` }, cause)
      }

      return {
        entryId: row.id,
        title: row.title,
        summary: row.summary,
        keywords: parseKeywords(row.keywords),
        status: row.status,
        domainPath: row.domain_path,
        authors: isNonEmptyString(parsed.data.authors) ? parsed.data.authors : null,
        updated: normalizeUpdated(parsed.data.updated, mtimeMs),
        body: parsed.body,
      }
    },

    async heatByEntry(projectId: string): Promise<HeatByEntry> {
      requireProject(projectId, 'heatByEntry')
      return new Map(selectHeatByEntry.all(projectId).map((r) => [r.entry_id, r.heat]))
    },

    async sessionRecall(q: SessionRecallQuery): Promise<RecallGroup[]> {
      requireProject(q.projectId, 'sessionRecall')

      const rows = selectSessionRows.all(q.projectId, q.sessionId)
      if (rows.length === 0) return []

      const heatByEntry = new Map(selectHeatByEntry.all(q.projectId).map((r) => [r.entry_id, r.heat] as const))
      const heatByFrontmatterId = new Map(
        selectHeatByFrontmatterId.all(q.projectId).map((r) => [r.frontmatter_id, r.heat] as const),
      )
      return groupRecallRows(rows, heatByEntry, heatByFrontmatterId)
    },

    async browse(q: { projectId: string }): Promise<DomainNode[]> {
      return aggregateDomainTree(await listEntries({ projectId: q.projectId }))
    },

    registerProject: registerProjectRow,
  }
}
