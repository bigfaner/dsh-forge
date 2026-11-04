// rebuild 再生（stage② A1：文档权威对账——提案 §2.2/§2.4/§2.8）。DB 两缓存表 + FTS5
// 纯派生：整库单事务 DELETE → 从各注册行知识目录 md frontmatter 逐行重建等价（含
// merged_into/redirect 再生与四档 effective_rank 派生）。作用域白名单 = knowledge_entries
// + knowledge_entry_versions + knowledge_fts——业务账（knowledge_merge_ledger /
// knowledge_recall_logs）永不在 rebuild 波及面。文件亡 → 记录亡：库内版本行对账文件缺失
// → 记录随整表重建同步消失，并按缺失前状态发 knowledge-entry-purge 埋点
// （unconfirmed=info / confirmed 与 superseded=warn——已审知识意外丢失应被看见），
// 无孤儿中间态。id 缺席的存量文件不入实体表（skipped 计数——存量收编任务补发 id 后入表）。
import { readFileSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { withImmediateTransaction } from './concurrency.js'
import { parseKnowledgeFile } from './parser.js'
import { scanKnowledgeDir } from './scan.js'
import {
  KNOWLEDGE_PURGE_EVENT,
  KNOWLEDGE_REBUILD_EVENT,
  emitStorageDiag,
  storageDiag,
  type DiagEmitter,
} from './diag.js'

/** 条目三态（提案 §2.2：unconfirmed | confirmed | superseded） */
export const ENTRY_STATUS_VALUES = ['unconfirmed', 'confirmed', 'superseded'] as const
export type EntryStatus = (typeof ENTRY_STATUS_VALUES)[number]

/** effective_rank 四档（派生列值域 = schema v4 CHECK 约束同源） */
export type EffectiveRank = 0.2 | 0.4 | 0.6 | 1.0

/** 重建报告（indexed = 入实体表条目数 / skipped = 容错跳过文件数 / purged = 对账删除的亡文件版本行数） */
export interface RebuildReport {
  readonly indexed: number
  readonly skipped: number
  readonly purged: number
}

/** 重建入参（emit = 装配期注入诊断发射面；silent = 首用静默重建——warn 级埋点） */
export interface RebuildOptions {
  readonly emit?: DiagEmitter
  readonly silent?: boolean
}

/**
 * status 归一：stage② 三态外（stage① 遗留 draft/active 等）→ unconfirmed（缺省态——
 * 纯新条目口径；存量收编任务回写正本 status）。
 */
export function normalizeEntryStatus(raw: string): EntryStatus {
  return (ENTRY_STATUS_VALUES as readonly string[]).includes(raw) ? (raw as EntryStatus) : 'unconfirmed'
}

/** title_norm 归一：小写 + 空白折叠（查重检索索引口径） */
export function normalizeTitleNorm(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * effective_rank 派生优先级链（提案 §2.2，INV-D 机检同源）：
 * merged_into ≠ 空 → 0.2（redirect 沉底）＞ confirmed → 1.0 ＞ unconfirmed → 0.6
 * ＞ supersedes 语义冲突 → 0.4 ＞ superseded → 0.2。
 */
export function deriveEffectiveRank(
  status: EntryStatus,
  mergedInto: string | undefined,
  conflict: boolean,
): EffectiveRank {
  if (mergedInto !== undefined && mergedInto !== '') return 0.2
  if (status === 'confirmed') return 1.0
  if (status === 'unconfirmed') return 0.6
  if (conflict) return 0.4
  return 0.2
}

/** 单版本（一个 md 文件）再生产物 */
interface RebuiltVersion {
  readonly id: string
  readonly versionTs: string
  readonly filePath: string
  readonly contentHash: string
  readonly recordedAt: string
  readonly status: EntryStatus
  readonly title: string
  readonly titleNorm: string
  readonly type: string | undefined
  readonly procedureTag: boolean
  readonly mergedInto: string | undefined
  readonly supersedes: string | undefined
  readonly keywords: readonly string[]
  readonly summary: string
  readonly domain: string
  readonly updatedAt: string
}

/** 单条目聚合（版本链 + 权威投影） */
interface RebuiltEntry {
  readonly id: string
  readonly versions: RebuiltVersion[]
}

/**
 * 权威版本选择：confirmed 版本（多个取最新 version_ts）优先；否则最新 version_ts。
 * （entries 行只投影权威版本——提案 §2.2；其余版本落版本表 + FTS 轻量索引。）
 */
function pickAuthority(versions: readonly RebuiltVersion[]): RebuiltVersion {
  const confirmed = versions.filter((v) => v.status === 'confirmed')
  const pool = confirmed.length > 0 ? confirmed : versions
  return pool.reduce((a, b) => (a.versionTs >= b.versionTs ? a : b))
}

/** supersedes 语义冲突判定：权威版本 supersedes 锚不在本条目版本链内（悬空锚） */
function isConflicting(auth: RebuiltVersion, entry: RebuiltEntry): boolean {
  return (
    auth.supersedes !== undefined && !entry.versions.some((v) => v.versionTs === auth.supersedes)
  )
}

/**
 * rebuildKnowledgeIndex（整库再生）：注册行全集 → 各知识目录扫描解析 → 版本链聚合 →
 * 单事务 DELETE 两缓存表 + FTS 后全量重建。对账前置：库内版本行 file_path 缺失于盘上
 * 文件集 → purge 埋点（分级）后随重建消失。知识目录不可达 fail-loud 上抛。
 */
export function rebuildKnowledgeIndex(db: Database.Database, opts: RebuildOptions = {}): RebuildReport {
  try {
    const registryRows = db
      .prepare<unknown[], { ws_path: string; knowledge_dir: string }>(
        `SELECT ws_path, knowledge_dir FROM knowledge_registry ORDER BY ws_path`,
      )
      .all()
    const recordedAt = new Date().toISOString()

    // 逐目录扫描 → 解析 → 版本聚合（(id, version_ts) 撞键后到者 skipped）
    const entries = new Map<string, RebuiltVersion[]>()
    const seenVersionKeys = new Set<string>()
    const liveFilePaths = new Set<string>()
    let skipped = 0
    for (const row of registryRows) {
      for (const f of scanKnowledgeDir(row.knowledge_dir)) {
        try {
          const content = readFileSync(f.absPath, 'utf8')
          const outcome = parseKnowledgeFile({
            relPath: f.relPath,
            domainPath: f.domainPath,
            domainDepth: f.domainDepth,
            content,
            mtime: new Date(f.mtimeMs),
          })
          if (!outcome.ok) {
            skipped += 1
            continue
          }
          const { frontmatter: fm, meta } = outcome.entry
          const id = meta.id
          if (id === undefined || id.trim() === '') {
            skipped += 1 // id 缺席：不入实体表（存量收编任务补发 id）
            continue
          }
          const versionTs =
            meta.versionTs ?? new Date(f.mtimeMs).toISOString() // version_ts 缺席回退 mtime
          const key = `${id}\u0000${versionTs}`
          if (seenVersionKeys.has(key)) {
            skipped += 1 // 同 (id, version_ts) 撞版本键：后到者跳过
            continue
          }
          seenVersionKeys.add(key)
          liveFilePaths.add(f.absPath)
          const version: RebuiltVersion = {
            id,
            versionTs,
            filePath: f.absPath,
            contentHash: outcome.entry.digest,
            recordedAt,
            status: normalizeEntryStatus(fm.status),
            title: fm.title,
            titleNorm: normalizeTitleNorm(fm.title),
            type: meta.type,
            procedureTag: meta.procedure === true,
            mergedInto: meta.mergedInto,
            supersedes: meta.supersedes,
            keywords: fm.keywords,
            summary: fm.summary,
            domain: outcome.entry.domainPath,
            updatedAt: fm.updated ?? recordedAt,
          }
          const list = entries.get(id)
          if (list === undefined) entries.set(id, [version])
          else list.push(version)
        } catch {
          skipped += 1 // 读取失败（权限/编码）：容错跳过，不硬拒
        }
      }
    }

    // 对账前置：库内版本行文件缺失 → knowledge-entry-purge 分级埋点（随重建同步消失）
    const priorVersions = db
      .prepare<
        unknown[],
        { id: string; version_ts: string; file_path: string; status: string | null }
      >(
        `SELECT v.id, v.version_ts, v.file_path, e.status
           FROM knowledge_entry_versions v LEFT JOIN knowledge_entries e ON e.id = v.id`,
      )
      .all()
    let purged = 0
    for (const prior of priorVersions) {
      if (liveFilePaths.has(prior.file_path)) continue
      purged += 1
      emitStorageDiag(
        opts.emit,
        storageDiag(
          prior.status === 'unconfirmed' ? 'info' : 'warn',
          KNOWLEDGE_PURGE_EVENT,
          `条目版本文件缺失，记录同步删除：${prior.id}@${prior.version_ts}（${prior.file_path}）`,
          { cwd: prior.file_path },
        ),
      )
    }

    // 权威投影 + 派生列
    const entryRows: Array<{
      id: string
      title: string
      titleNorm: string
      type: string | null
      procedureTag: number
      status: EntryStatus
      effectiveRank: EffectiveRank
      confirmedVersionId: string | null
      mergedInto: string | null
      domain: string
      updatedAt: string
      auth: RebuiltVersion
    }> = []
    for (const [id, versions] of entries) {
      const auth = pickAuthority(versions)
      const confirmedPool = versions.filter((v) => v.status === 'confirmed')
      const confirmed =
        confirmedPool.length > 0
          ? confirmedPool.reduce((a, b) => (a.versionTs >= b.versionTs ? a : b))
          : undefined
      entryRows.push({
        id,
        title: auth.title,
        titleNorm: auth.titleNorm,
        type: auth.type ?? null,
        procedureTag: auth.procedureTag ? 1 : 0,
        status: auth.status,
        effectiveRank: deriveEffectiveRank(auth.status, auth.mergedInto, isConflicting(auth, { id, versions })),
        confirmedVersionId: confirmed?.versionTs ?? null,
        mergedInto: auth.mergedInto ?? null,
        domain: auth.domain,
        updatedAt: auth.updatedAt,
        auth,
      })
    }

    const insertEntry = db.prepare(
      `INSERT INTO knowledge_entries (
         id, title, title_norm, type, procedure_tag, status, effective_rank,
         confirmed_version_id, merged_into, domain, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertVersion = db.prepare(
      `INSERT INTO knowledge_entry_versions (id, version_ts, file_path, content_hash, recorded_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    const insertFts = db.prepare(
      `INSERT INTO knowledge_fts (id, title, keywords, summary) VALUES (?, ?, ?, ?)`,
    )

    // 整库事务重建（BEGIN IMMEDIATE——白名单 = 两缓存表 + FTS；业务账零波及）
    withImmediateTransaction(db, () => {
      db.prepare(`DELETE FROM knowledge_fts`).run()
      db.prepare(`DELETE FROM knowledge_entry_versions`).run()
      db.prepare(`DELETE FROM knowledge_entries`).run()
      for (const e of entryRows) {
        insertEntry.run(
          e.id,
          e.title,
          e.titleNorm,
          e.type,
          e.procedureTag,
          e.status,
          e.effectiveRank,
          e.confirmedVersionId,
          e.mergedInto,
          e.domain,
          e.updatedAt,
        )
        insertFts.run(e.id, e.title, e.auth.keywords.join(' '), e.auth.summary)
      }
      for (const e of entries.values()) {
        for (const v of e) {
          insertVersion.run(v.id, v.versionTs, v.filePath, v.contentHash, v.recordedAt)
        }
      }
    })

    emitStorageDiag(
      opts.emit,
      storageDiag(
        opts.silent === true ? 'warn' : 'info',
        KNOWLEDGE_REBUILD_EVENT,
        opts.silent === true
          ? `索引缺失触发静默重建：indexed=${entryRows.length} skipped=${skipped} purged=${purged}`
          : `索引重建成功：indexed=${entryRows.length} skipped=${skipped} purged=${purged}`,
        { cwd: registryRows.length > 0 ? registryRows[0]!.ws_path : undefined },
      ),
    )
    return { indexed: entryRows.length, skipped, purged }
  } catch (cause) {
    emitStorageDiag(
      opts.emit,
      storageDiag('error', KNOWLEDGE_REBUILD_EVENT, `索引重建失败：${String(cause)}`, {
        stack: cause instanceof Error ? cause.stack : undefined,
      }),
    )
    throw cause
  }
}
