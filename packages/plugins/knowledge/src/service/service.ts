// knowledge 插件服务面（stage② 1.4 v4 形收口）：读面（rebuildIndex/search/
// readAbstract/listEntries/getEntryDetail/heatByEntry/sessionRecall/browse）按 v4 实体表
//（entries 全局 slug id + 版本行 + FTS 权威面）供数；写门三法（write/read/confirm）
// 经 write.ts 网关。两级解析（用户裁决 Q19）：projectId →（config 静态绑定表）→
// wsPath →（自持注册表 canonical 键）→ 注册行（knowledge_dir）。
// 项目域归属（v4 实体表全局无项目键——§2.9）：条目 id ∈ 其任一版本文件落在该项目
// knowledge_dir 下的 id 集（每调用期 SQL 子查询现算——判例 d24a4464：read/search 解析
// 须每调用期求值，禁装配期静态快照）。
// 召回准入（§2.4 裁决 #10）：同 id 有 confirmed 版时 unconfirmed 权威投影不进召回；
// 0.4/0.2 两档经回流（滞回限次+冷却，阈值归 config）保留轻量召回出口；readAbstract/
// read 对 unconfirmed 拒且不露存在性。
import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
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
import { FRONTMATTER_DOMAIN_MAX_DEPTH } from '@dsh-forge/contracts'
import { withImmediateTransaction } from '../storage/concurrency.js'
import { canonicalWsPath, createKnowledgeRegistry } from '../storage/registry.js'
import { rebuildKnowledgeIndex } from '../storage/rebuild.js'
import { InvalidKnowledgeDirError as StorageInvalidKnowledgeDirError } from '../storage/scan.js'
import {
  KNOWLEDGE_BACKFLOW_EVENT,
  KNOWLEDGE_CONFIRM_EVENT,
  KNOWLEDGE_DOMAIN_UPDATE_EVENT,
  KNOWLEDGE_ENTRY_MOVE_EVENT,
  KNOWLEDGE_META_EDIT_EVENT,
  KNOWLEDGE_REJECT_EVENT,
  KNOWLEDGE_REGISTER_EVENT,
  emitStorageDiag,
  storageDiag,
  type DiagEmitter,
} from '../storage/diag.js'
import { EntryNotFoundError, IndexStaleError, InvalidKnowledgeDirError } from './errors.js'
import {
  aggregateDomainTree,
  applyStatusFilter,
  buildKeywordAdmissionMatch,
  buildSearchFtsMatch,
  collectEntryIdsUnderDir,
  composeSearchScore,
  escapeLike,
  groupRecallRows,
  isNonEmptyString,
  normalizeUpdated,
  prepareHeatByEntry,
  textSubstringHit,
  validateDomainPath,
  type RecallRow,
} from './internal.js'
import { createWriteGateway } from './write.js'
import { createSupersedeGateway } from './supersede.js'
import { createScanRegister } from './scan-register.js'
import { createReviewGateway } from './review.js'
import type {
  BackflowConfig,
  BrowseKnowledgeService,
  EntryAbstract,
  EntryActionResult,
  KnowledgeConfirmBatchQuery,
  KnowledgeConfirmOutcome,
  KnowledgeConfirmQuery,
  KnowledgeCreateDomainOutcome,
  KnowledgeCreateDomainQuery,
  KnowledgeMoveEntryQuery,
  KnowledgeReadOutcome,
  KnowledgeReadQuery,
  KnowledgeRejectBatchQuery,
  KnowledgeUpdateEntryQuery,
  KnowledgeWriteOutcome,
  KnowledgeWriteQuery,
  ReadAbstractQuery,
  SearchHit,
  SearchQuery,
  SetDomainDescriptionQuery,
} from './types.js'

/** 服务工厂入参 */
export interface KnowledgeServiceDeps {
  /** 自持库句柄（storage/open.ts 唯一产出；一切 SQL prepared） */
  readonly db: Database.Database
  /** 两级解析第一级：projectId → wsPath（config 静态绑定表反向——session.ts createWsPathResolver；未命中回查注册行 project_id 列） */
  readonly resolveWsPath: (projectId: string) => string | undefined
  /** 装配期注入诊断发射面（rebuild 事件域——SC-10；缺席走 diag.ts 兜底） */
  readonly emit?: DiagEmitter
  /** 回流配置面（§2.4：阈值归插件 config，非代码常量——滞回限次/冷却窗/两档分阈） */
  readonly backflow?: BackflowConfig
  /**
   * 索引重建缝（缺省 = storage rebuildKnowledgeIndex；注入缝供测试替身）。
   */
  readonly rebuild?: (wsPath: string, opts: { emit?: DiagEmitter; silent?: boolean }) => { indexed: number; skipped: number }
}

// ── 行形状（v4：entries 权威投影 + FTS 权威面 join） ──

interface EntryRow {
  rid: number
  id: string
  title: string
  summary: string
  keywords: string
  status: string
  domain_path: string
  effective_rank: number
  confirmed_version_id: string | null
}

/** 浏览面条目行 */
interface BrowseEntryRow {
  rid: number
  id: string
  title: string
  summary: string
  keywords: string
  status: string
  domain_path: string
  effective_rank: number
  confirmed_version_id: string | null
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

/** FTS keywords 列解码（空格连接受控词表 → string[]——写入面单一来源保证形状可解析） */
function splitKeywords(stored: string): string[] {
  return stored.split(/\s+/).filter((k) => k !== '')
}

/** 回流滞回账（每对（id, 版本档）限次 + 冷却窗——服务实例内存态；级次与阈值为 config 面） */
interface BackflowPairState {
  count: number
  windowStart: number
}

/**
 * 回流滞回缺省（每对 2 次 / 24h 冷却——§2.4 裁决 9）。分阈跨内核校准（stage③ C1）：
 * 旧词面核 score 为整权词面计分（词命中 ≥2），旧缺省 1 即「词面命中」档；BM25 三因子
 * 核 score = norm(bm25)×rank 因子 + 热度加分（典型关键词命中行 norm≈0.3–0.7），0.25
 * 对应「词面命中且 rank≥0.4」档回流——闸位语义（限次+冷却）原样，仅分阈随核校准。
 */
const DEFAULT_BACKFLOW = {
  maxPerPair: 2,
  cooldownMs: 24 * 60 * 60 * 1000,
  conflictThreshold: 0.25,
  supersededThreshold: 0.25,
}

/**
 * 服务面工厂。projectId 未命中绑定表/注册行 fail-loud 裸错（非六码——core 先例
 * 同语义）。rebuildIndex 经 storage rebuild 单源（含埋点与事务纪律）。
 */
export function createKnowledgeService(deps: KnowledgeServiceDeps): BrowseKnowledgeService {
  const { db } = deps
  const emit = deps.emit
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

  // ── 项目域归属（v4：版本文件前缀——每调用期求值；JS 侧 startsWith 双分隔符匹配，
  //    免 LIKE ESCAPE 转义域） ──

  /** knowledgeDir → 该项目域内的条目 id 集（任一版本文件落在 knowledge_dir 下——
   *  归属判定单一事实源 internal.collectEntryIdsUnderDir，与动态段顶域聚合同口径） */
  function projectEntryIds(knowledgeDir: string): Set<string> {
    return collectEntryIdsUnderDir(selectVersionPaths.all(), knowledgeDir)
  }

  const ENTRY_COLUMNS = `e.rowid AS rid, e.id, e.title, e.status, e.domain AS domain_path, e.effective_rank, e.confirmed_version_id, f.summary, f.keywords`

  const selectAll = db.prepare<unknown[], EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM knowledge_entries e JOIN knowledge_fts f ON f.id = e.id`,
  )
  const selectByDomain = db.prepare<[string, string], EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM knowledge_entries e JOIN knowledge_fts f ON f.id = e.id
     WHERE (e.domain = ? OR e.domain LIKE ? ESCAPE '\\')`,
  )
  const browseAllStmt = db.prepare<unknown[], BrowseEntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM knowledge_entries e JOIN knowledge_fts f ON f.id = e.id ORDER BY e.domain, e.id`,
  )
  const browseByDomainStmt = db.prepare<[string, string], BrowseEntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM knowledge_entries e JOIN knowledge_fts f ON f.id = e.id
     WHERE (e.domain = ? OR e.domain LIKE ? ESCAPE '\\') ORDER BY e.domain, e.id`,
  )
/** 目录即域（≤3 层）——knowledgeDir 现盘目录枚举（隐藏目录跳过；每调用期实时对账） */
function listDomainDirs(knowledgeDir: string, maxDepth: number): string[] {
  const out: string[] = []
  const walk = (rel: string[], depth: number): void => {
    if (depth > maxDepth) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(join(knowledgeDir, ...rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const child = [...rel, entry.name]
      out.push(child.join('/'))
      walk(child, depth + 1)
    }
  }
  walk([], 1)
  return out
}
  const selectEntryByRowid = db.prepare<[number], BrowseEntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM knowledge_entries e JOIN knowledge_fts f ON f.id = e.id WHERE e.rowid = ?`,
  )
  /** 项目条目数（域归属 id 集大小对账 entries 行——版本在而 entries 缺 = 0 面子） */
  const countProjectEntries = (knowledgeDir: string): number => projectEntryIds(knowledgeDir).size

  /** 项目域行读取（全域/域前缀——JS 侧按 id 集过滤） */
  function selectRows<R extends { id: string }>(
    stmt: { all(...a: unknown[]): R[] },
    knowledgeDir: string,
    prefix: string | undefined,
    ...args: unknown[]
  ): R[] {
    const ids = projectEntryIds(knowledgeDir)
    const rows = args.length === 0 ? stmt.all() : (stmt as { all(...a: unknown[]): R[] }).all(...args)
    return rows.filter((r) => ids.has(r.id))
  }

  const selectVersionPaths = db.prepare<unknown[], { id: string; file_path: string }>(
    `SELECT id, file_path FROM knowledge_entry_versions`,
  )
  const selectAuthorityFile = db.prepare<[string], { version_ts: string; file_path: string }>(
    `SELECT version_ts, file_path FROM knowledge_entry_versions WHERE id = ? ORDER BY version_ts DESC`,
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
  // stage③ C1：FTS5 BM25 检索面（仅元数据列——knowledge_fts 列面 = title/keywords/summary，
  // 裁决 #8 声明边界：正文不进检索面，缺失由 knowledge_read/grep 兜底）
  const selectFtsBm25 = db.prepare<[string], { id: string; bm25: number }>(
    `SELECT id, bm25(knowledge_fts) AS bm25 FROM knowledge_fts WHERE knowledge_fts MATCH ?`,
  )
  // stage③ C2：域简介 upsert（KNOWLEDGE_DOMAINS——setDomainDescription 单写径）
  const upsertDomainDescription = db.prepare<[string, string, string, string]>(
    `INSERT INTO knowledge_domains (ws_path, domain, description, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(ws_path, domain) DO UPDATE SET description = excluded.description, updated_at = excluded.updated_at`,
  )

  /** 一次调用的事务原子写入：N 命中 N 行；零命中 = 单哨兵行（entry_id NULL / hit_count 0 / 快照 NULL） */
  function writeRecallLog(write: {
    projectId: string
    callId: string
    sessionId: string
    verb: RecallVerb
    hits: readonly { entryId: number | null; frontmatterId: string | null; titleSnap: string; domainSnap: string }[]
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

  /** 打分产物 → SearchHit（摘要先行 + 四档 effective_rank——CT-WG-12） */
  type HitSource = { rid: number; id: string; title: string; summary: string; domain_path: string; effective_rank: number }
function rankedToHits(ranked: readonly { entry: HitSource; score: number }[]): SearchHit[] {
    return ranked.map(({ entry, score }) => ({
      entryId: entry.rid,
      frontmatterId: entry.id,
      title: entry.title,
      summary: entry.summary,
      domainPath: entry.domain_path,
      score,
      effectiveRank: entry.effective_rank,
    }))
  }

  /** 索引缺失（项目级零行）静默重建联动：失败按因降级（core rebuildMissingIndex 同语义） */
  async function rebuildMissingIndex(projectId: string, wsPath: string): Promise<void> {
    try {
      runRebuild(wsPath, { emit, silent: true })
    } catch (cause) {
      if (cause instanceof InvalidKnowledgeDirError) throw cause
      throw new IndexStaleError({ projectId, reason: String((cause as Error)?.message ?? cause) }, cause)
    }
  }

  /** 卡片 updated 展示位：权威版本文件 frontmatter.updated（缺省 mtime）；不可读回退当前时间 */
  function readCardUpdated(row: BrowseEntryRow): string {
    const versions = selectAuthorityFile.all(row.id)
    const authority = versions.find((v) => v.version_ts === row.confirmed_version_id) ?? versions[0]
    if (authority === undefined) return new Date().toISOString()
    try {
      const mtimeMs = statSync(authority.file_path).mtimeMs
      const content = readFileSync(authority.file_path, 'utf8')
      return normalizeUpdated(matter(content).data.updated, mtimeMs)
    } catch {
      return new Date().toISOString()
    }
  }

  /** 注册表 upsert 单源（storage/registry.ts——canonical 键 + 幂等） */
  const registry = createKnowledgeRegistry(db)

  /** 注册行写入（第九法）：目录缺则递归建 → upsert 注册行（幂等，projectId 落 project_id 列）；
   *  成败均发 knowledge-register 事件（SC-10）。建目录失败 = 抛（host wiring 侧 fail-soft 记账）。 */
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
    // F1（1.7 真机发现）：注册径触发入库 rebuild——绑定会话首 turn 动态段供数就位，
    // 不依赖 listEntries 静默重建。失败 best-effort（注册行已落、留 error 埋点；
    // 后续 listEntries 仍按既有 IndexStale 静默重建兜底）。
    try {
      runRebuild(input.wsPath, { emit, silent: true })
    } catch (cause) {
      emitStorageDiag(
        emit,
        storageDiag('error', KNOWLEDGE_REGISTER_EVENT, `注册后入库重建失败（首 turn 兜底转 listEntries 静默重建）：${row.wsPath}（${String(cause)}）`, {
          cwd: row.wsPath,
          projectId: input.projectId,
          stack: cause instanceof Error ? cause.stack : undefined,
        }),
      )
    }
  }

  // ── 回流滞回（§2.4：0.4/0.2 两档轻量召回出口——每对限次 + 冷却；diag 区分震荡/误判） ──
  const backflowCfg = { ...DEFAULT_BACKFLOW, ...deps.backflow }
  const backflowLedger = new Map<string, BackflowPairState>()

  /**
   * 回流闸：0.4/0.2 档命中是否放行进召回。每对（id+档）窗内限 maxPerPair 次，
   * 冷却窗内超额 → 拒并记 warn（震荡回流——supersedes 判定需人工复核提示）；
   * 放行记 info（误判回流——回流命中即观测点）。
   */
  function backflowGate(id: string, rank: number, score: number): boolean {
    const threshold = rank <= 0.2 ? backflowCfg.supersededThreshold : backflowCfg.conflictThreshold
    if (score < threshold) return false
    const pairKey = `${id}@${rank}`
    const now = Date.now()
    const state = backflowLedger.get(pairKey)
    if (state !== undefined && now - state.windowStart < backflowCfg.cooldownMs) {
      if (state.count >= backflowCfg.maxPerPair) {
        emitStorageDiag(
          emit,
          storageDiag('warn', KNOWLEDGE_BACKFLOW_EVENT, `震荡回流拦截：${id}（rank ${rank}）冷却窗内已回流 ${state.count} 次——supersedes 判定建议人工复核`, { cwd: id }),
        )
        return false
      }
      state.count += 1
    } else {
      backflowLedger.set(pairKey, { count: 1, windowStart: now })
    }
    emitStorageDiag(
      emit,
      storageDiag('info', KNOWLEDGE_BACKFLOW_EVENT, `回流命中：${id}（rank ${rank}，score ${score}）——疑似 supersedes 误判回流`, { cwd: id }),
    )
    return true
  }

  // ── 写门三法（write.ts 网关——knowledgeDir 每调用期传入） ──
  const gateway = createWriteGateway({ db, emit })

  // ── distill 归并执行面（merge.ts——§2.6 裁决 #8 四件套） ──
  const supersedes = createSupersedeGateway({ db, emit })

  // ── 存量收编面（scan-register.ts——scan 只读体检 + register 幂等注册） ──
  const scanRegister = createScanRegister({ db, emit })

  // ── 人工裁决写面（review.ts——confirmBatch/rejectBatch/moveEntry/updateEntry/createDomain；
  //    entryId→slug 映射在本门面（selectEntryByRowid 惯例），通道层/host 零解析） ──
  const review = createReviewGateway({ db, emit })

  /** entryId 批量 → slug id 解析（selectEntryByRowid 惯例；未命中不入 gateway 批） */
  function resolveEntrySlugs(entryIds: readonly number[]): { slugs: string[]; slugByEntry: Map<number, string> } {
    const slugByEntry = new Map<number, string>()
    const slugs: string[] = []
    for (const eid of entryIds) {
      const row = selectEntryByRowid.get(eid)
      if (row !== undefined && !slugByEntry.has(eid)) {
        slugByEntry.set(eid, row.id)
        slugs.push(row.id)
      }
    }
    return { slugs, slugByEntry }
  }

  /** 批量执行编排：entryId→slug 解析 → gateway 集合批 → 按 entryId 序合并回执（未命中 = not-found + warn 埋点） */
  async function runEntryBatch(
    entryIds: readonly number[],
    event: string,
    run: (ids: readonly string[]) => Promise<Map<string, EntryActionResult>>,
  ): Promise<EntryActionResult[]> {
    const { slugs, slugByEntry } = resolveEntrySlugs(entryIds)
    const gatewayResults = await run(slugs)
    return entryIds.map((eid): EntryActionResult => {
      const slug = slugByEntry.get(eid)
      if (slug === undefined) {
        emitStorageDiag(emit, storageDiag('warn', event, `entryId 未命中：${eid}（actor=human）`))
        return { entryId: eid, outcome: 'failure', code: 'not-found', message: `entryId 未命中：${eid}` }
      }
      return gatewayResults.get(slug) ?? { entryId: eid, outcome: 'failure', code: 'not-found', message: `条目未回执：${slug}` }
    })
  }

  // ── 浏览底表（browse 聚合与通道面共用同一实现——底表口径不漂移） ──
  const listEntries = async (q: ListEntriesQuery): Promise<KnowledgeCard[]> => {
    const { wsPath, knowledgeDir } = requireProject(q.projectId, 'listEntries')

    const prefix = q.domainPrefix === undefined ? undefined : q.domainPrefix.replace(/\/+$/, '')
    let rows: BrowseEntryRow[] =
      prefix === undefined
        ? selectRows(browseAllStmt, knowledgeDir, prefix)
        : selectRows(browseByDomainStmt, knowledgeDir, prefix, prefix, `${escapeLike(prefix)}/%`)
    if (rows.length === 0 && countProjectEntries(knowledgeDir) === 0) {
      await rebuildMissingIndex(q.projectId, wsPath)
      rows =
        prefix === undefined
          ? selectRows(browseAllStmt, knowledgeDir, prefix)
          : selectRows(browseByDomainStmt, knowledgeDir, prefix, prefix, `${escapeLike(prefix)}/%`)
    }
    // statusFilter 服务端执行（1.4——零客户端过滤语义铁律维持）
    rows = applyStatusFilter(rows, q.statusFilter)

    const keyword = q.keyword?.trim().toLowerCase() ?? ''
    const heatByEntry = new Map(selectHeatByEntry.all(q.projectId).map((r) => [r.entry_id, r.heat] as const))

    return rows
      .filter((row) => {
        if (keyword === '') return true
        const keywords = splitKeywords(row.keywords)
        return keywords.some((k) => k.toLowerCase().includes(keyword))
      })
      .map((row) => ({
        entryId: row.rid,
        title: row.title,
        summary: row.summary,
        keywords: splitKeywords(row.keywords),
        status: row.status,
        domainPath: row.domain_path,
        updated: readCardUpdated(row),
        heat: heatByEntry.get(row.rid) ?? 0,
      }))
  }

  return {
    async rebuildIndex(projectId: string) {
      const { wsPath } = requireProject(projectId, 'rebuildIndex')
      return runRebuild(wsPath, { emit })
    },

    async search(q: SearchQuery): Promise<SearchHit[]> {
      const startMs = Date.now()
      const { wsPath, knowledgeDir } = requireProject(q.projectId, 'search')

      const prefix = q.domainPrefix === undefined ? undefined : q.domainPrefix.replace(/\/+$/, '')
      let rows: EntryRow[] =
        prefix === undefined
          ? selectRows(selectAll, knowledgeDir, prefix)
          : selectRows(selectByDomain, knowledgeDir, prefix, prefix, `${escapeLike(prefix)}/%`)
      if (rows.length === 0 && countProjectEntries(knowledgeDir) === 0) {
        await rebuildMissingIndex(q.projectId, wsPath)
        rows =
          prefix === undefined
            ? selectRows(selectAll, knowledgeDir, prefix)
            : selectRows(selectByDomain, knowledgeDir, prefix, prefix, `${escapeLike(prefix)}/%`)
      }

      // ── stage③ C1：FTS5 BM25 三因子排序（裁决 #2/#10——内核切换，准入语义原样） ──
      // 通道语义：keywords = keywords 列逐词 AND（FTS phrase，等价旧精确 AND）；
      // text = FTS 词元 AND ∪ JS 子串补充通道（CJK run 单 token 边界——internal.ts 注释）。
      const queryKeywords = (q.keywords ?? [])
        .map((k) => k.trim().toLowerCase())
        .filter((k) => k !== '')
      const text = q.text?.trim() ?? ''
      const ftsIdsOf = (match: string): ReadonlyMap<string, number> => {
        try {
          return new Map(selectFtsBm25.all(match).map((r) => [r.id, r.bm25] as const))
        } catch {
          return new Map() // MATCH 语法异常（空词面等）= 词面通道零候选，不硬拒
        }
      }
      const combined = buildSearchFtsMatch({ keywords: q.keywords, text: q.text })
      const combinedBm25 = combined === undefined ? new Map<string, number>() : ftsIdsOf(combined)
      const keywordMatch = buildKeywordAdmissionMatch(q.keywords)
      const keywordBm25 =
        keywordMatch === undefined ? new Map<string, number>() : ftsIdsOf(keywordMatch)
      const textMatch = text === '' ? undefined : buildSearchFtsMatch({ text: q.text })
      const textBm25 = textMatch === undefined ? new Map<string, number>() : ftsIdsOf(textMatch)

      const heatByEntry = new Map(selectHeatByEntry.all(q.projectId).map((r) => [r.entry_id, r.heat] as const))
      const scored: { entry: EntryRow; score: number }[] = []
      for (const r of rows) {
        // 准入通道（缺省通道维度恒过）
        if (queryKeywords.length > 0 && !keywordBm25.has(r.id)) continue
        if (text !== '' && !textBm25.has(r.id) && !textSubstringHit(r.title, r.summary, text)) continue
        // 三因子：bm25 取整查询（keywords∧text）命中面；仅子串通道命中行缺位 → 中性分
        const bm25 = combinedBm25.get(r.id)
        const score = composeSearchScore({
          ...(bm25 !== undefined ? { bm25 } : {}),
          effectiveRank: r.effective_rank,
          heat: heatByEntry.get(r.rid) ?? 0,
        })
        scored.push({ entry: r, score })
      }
      scored.sort((a, b) => b.score - a.score || a.entry.rid - b.entry.rid)

      const admitted: { entry: HitSource; score: number }[] = []
      for (const { entry, score } of scored) {
        // 条件式召回排除（裁决 #10）：同 id 有 confirmed 版时 unconfirmed 权威投影不进召回
        if (entry.status === 'unconfirmed' && entry.confirmed_version_id !== null) continue
        // 0.4/0.2 两档 = 回流对象（滞回闸放行才进召回；分阈跨内核校准见 DEFAULT_BACKFLOW 注）
        if (entry.effective_rank <= 0.4) {
          if (!backflowGate(entry.id, entry.effective_rank, score)) continue
        }
        admitted.push({ entry, score })
      }
      const limited = q.limit !== undefined && q.limit > 0 ? admitted.slice(0, q.limit) : admitted
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
      requireProject(q.projectId, 'readAbstract')

      const row = selectEntryByRowid.get(q.entryId)
      if (row === undefined) {
        throw new EntryNotFoundError({ projectId: q.projectId, entryId: q.entryId })
      }
      // 准入（CT-WG-14 O2 同口径）：unconfirmed 拒摘要且不露存在性（EntryNotFound 语义面）
      if (row.status === 'unconfirmed') {
        throw new EntryNotFoundError({ projectId: q.projectId, entryId: q.entryId })
      }

      writeRecallLog({
        projectId: q.projectId,
        callId: randomUUID(),
        sessionId: q.sessionId ?? '',
        verb: 'read-abstract',
        hits: [{ entryId: row.rid, frontmatterId: row.id, titleSnap: row.title, domainSnap: row.domain_path }],
        query: { entryId: q.entryId },
        hitCount: 1,
        durationMs: Date.now() - startMs,
      })
      return {
        entryId: row.rid,
        title: row.title,
        summary: row.summary,
        keywords: splitKeywords(row.keywords),
        status: row.status,
        domainPath: row.domain_path,
      }
    },

    listEntries,

    async getEntryDetail(q): Promise<EntryDetail> {
      const { knowledgeDir } = requireProject(q.projectId, 'getEntryDetail')

      const row = selectEntryByRowid.get(q.entryId)
      if (row === undefined) {
        throw new EntryNotFoundError({ projectId: q.projectId, entryId: q.entryId })
      }
      // 项目域归属 + 权威版本文件（confirmed 指针优先，缺省最新版本）
      const versions = selectAuthorityFile.all(row.id)
      const authority = versions.find((v) => v.version_ts === row.confirmed_version_id) ?? versions[0]
      if (authority === undefined) {
        throw new EntryNotFoundError({ projectId: q.projectId, entryId: q.entryId })
      }
      if (!authority.file_path.startsWith(`${knowledgeDir}/`) && !authority.file_path.startsWith(`${knowledgeDir}\\`)) {
        throw new EntryNotFoundError({ projectId: q.projectId, entryId: q.entryId })
      }

      let parsed: { data: Record<string, unknown>; body: string }
      let mtimeMs: number
      try {
        mtimeMs = statSync(authority.file_path).mtimeMs
        const { data, content } = matter(readFileSync(authority.file_path, 'utf8'))
        parsed = { data: data as Record<string, unknown>, body: content.trim() }
      } catch (cause) {
        throw new EntryNotFoundError({ projectId: q.projectId, entryId: q.entryId, reason: `源文件不可读：${authority.file_path}` }, cause)
      }

      return {
        entryId: row.rid,
        title: row.title,
        summary: row.summary,
        keywords: splitKeywords(row.keywords),
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
      // 徽记口径（1.4）：恒走未过滤 listEntries 独立查询面（不带 statusFilter）——
      // unconfirmedCount 与 entryCount 同底表聚合，「哪里有待审核」不随状态过滤抖动
      const { knowledgeDir } = requireProject(q.projectId, 'browse')
      const nodes = aggregateDomainTree(await listEntries({ projectId: q.projectId }))
      // 目录即域并集（H2 新目录即时在场）：knowledgeDir 现盘目录树（≤3 层，目录即域）
      // 含零条目域/带外 mkdir 目录——条目聚合不含即补入（计数 0）；序 = depth 升序再路径升序
      const byPath = new Map(nodes.map((node) => [node.domainPath, node]))
      for (const domain of listDomainDirs(knowledgeDir, FRONTMATTER_DOMAIN_MAX_DEPTH)) {
        const segments = domain.split('/')
        for (let i = 1; i <= segments.length; i++) {
          const path = segments.slice(0, i).join('/')
          if (byPath.has(path)) continue
          const node: DomainNode = {
            domainPath: path,
            label: segments[i - 1] ?? '',
            depth: i,
            entryCount: 0,
            unconfirmedCount: 0,
          }
          byPath.set(path, node)
          nodes.push(node)
        }
      }
      return nodes.sort((a, b) => a.depth - b.depth || (a.domainPath < b.domainPath ? -1 : 1))
    },

    registerProject: registerProjectRow,

    write: async (q: KnowledgeWriteQuery): Promise<KnowledgeWriteOutcome> => {
      const { knowledgeDir } = requireProject(q.projectId, 'write')
      return gateway.write(q, knowledgeDir)
    },

    read: async (q: KnowledgeReadQuery): Promise<KnowledgeReadOutcome> => {
      const { knowledgeDir } = requireProject(q.projectId, 'read')
      return gateway.read(q, knowledgeDir)
    },

    confirm: async (q: KnowledgeConfirmQuery): Promise<KnowledgeConfirmOutcome> => {
      requireProject(q.projectId, 'confirm')
      return gateway.confirm(q)
    },

    scanKnowledge: async (q: { projectId: string }) => {
      const { knowledgeDir } = requireProject(q.projectId, 'scanKnowledge')
      return scanRegister.scanKnowledge(knowledgeDir)
    },

    registerKnowledge: (q) => scanRegister.registerKnowledge(q),

    // ── stage③ §2.2 C2：域简介写径（服务方法非 tool；校验与 write 严契约同源） ──
    async setDomainDescription(q: SetDomainDescriptionQuery): Promise<void> {
      const rejectMsg = (detail: string): never => {
        emitStorageDiag(
          emit,
          storageDiag('warn', KNOWLEDGE_DOMAIN_UPDATE_EVENT, `域简介写入拒收：${detail}`, { cwd: q.wsPath }),
        )
        throw new Error(`setDomainDescription 拒收：${detail}`)
      }
      const invalid = validateDomainPath(q.domain)
      if (invalid !== undefined) rejectMsg(invalid)
      if (typeof q.description !== 'string' || q.description.trim() === '') {
        rejectMsg('简介缺失（非空一句）')
      }
      const ws = canonicalWsPath(q.wsPath)
      const row = selectRegistryRow.get(ws)
      if (row === undefined) rejectMsg(`工作区未注册：${ws}`)
      const updatedAt = new Date().toISOString()
      withImmediateTransaction(db, () => {
        upsertDomainDescription.run(ws, q.domain, q.description, updatedAt)
      })
      emitStorageDiag(
        emit,
        storageDiag('info', KNOWLEDGE_DOMAIN_UPDATE_EVENT, `域简介落表：${ws} / ${q.domain}`, { cwd: ws }),
      )
    },

    supersedeEntry: async (q) => {
      const { knowledgeDir } = requireProject(q.projectId, 'supersedeEntry')
      return supersedes.supersede(q, knowledgeDir)
    },

    reinstateEntry: async (q) => {
      requireProject(q.projectId, 'reinstateEntry')
      return supersedes.reinstate(q)
    },

    // ── knowledge-review-ui 1.4：人工裁决写面（entryAction 通道服务面——entryId→slug 门面解析） ──

    confirmBatch: async (q: KnowledgeConfirmBatchQuery): Promise<EntryActionResult[]> => {
      requireProject(q.projectId, 'confirmBatch')
      return runEntryBatch(q.entryIds, KNOWLEDGE_CONFIRM_EVENT, (ids) => review.confirmBatch(ids))
    },

    rejectBatch: async (q: KnowledgeRejectBatchQuery): Promise<EntryActionResult[]> => {
      requireProject(q.projectId, 'rejectBatch')
      return runEntryBatch(q.entryIds, KNOWLEDGE_REJECT_EVENT, (ids) => review.rejectBatch(ids))
    },

    moveEntry: async (q: KnowledgeMoveEntryQuery): Promise<EntryActionResult> => {
      const { wsPath, knowledgeDir } = requireProject(q.projectId, 'moveEntry')
      const row = selectEntryByRowid.get(q.entryId)
      if (row === undefined) {
        emitStorageDiag(emit, storageDiag('warn', KNOWLEDGE_ENTRY_MOVE_EVENT, `改域拒收：entryId 未命中 ${q.entryId}（actor=human）`, { projectId: q.projectId }))
        return { entryId: q.entryId, outcome: 'failure', code: 'not-found', message: `entryId 未命中：${q.entryId}` }
      }
      const result = await review.moveEntry({ id: row.id, targetDomain: q.targetDomain, wsPath, knowledgeDir })
      return result.outcome === 'success' ? result : { ...result, entryId: q.entryId }
    },

    updateEntry: async (q: KnowledgeUpdateEntryQuery): Promise<EntryActionResult> => {
      const { knowledgeDir } = requireProject(q.projectId, 'updateEntry')
      const row = selectEntryByRowid.get(q.entryId)
      if (row === undefined) {
        emitStorageDiag(emit, storageDiag('warn', KNOWLEDGE_META_EDIT_EVENT, `元数据编辑拒收：entryId 未命中 ${q.entryId}（actor=human）`, { projectId: q.projectId }))
        return { entryId: q.entryId, outcome: 'failure', code: 'not-found', message: `entryId 未命中：${q.entryId}` }
      }
      const result = await review.updateEntry({
        id: row.id,
        title: q.title,
        keywords: q.keywords,
        summary: q.summary,
        body: q.body,
        knowledgeDir,
      })
      return result.outcome === 'success' ? result : { ...result, entryId: q.entryId }
    },

    createDomain: async (q: KnowledgeCreateDomainQuery): Promise<KnowledgeCreateDomainOutcome> => {
      const { wsPath, knowledgeDir } = requireProject(q.projectId, 'createDomain')
      return review.createDomain({ domain: q.domain, wsPath, knowledgeDir })
    },
  }
}
