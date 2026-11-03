// 首用 rebuild 再生（A2 轻量种子迁移：entries 零迁——索引缓存自知识目录全量再生）。
// 项目键 = ws_path canonical（注册表键同源）；整表事务重建（BEGIN IMMEDIATE 单事务
// 删旧插新——幂等，重跑零重复零漂移）。埋点：knowledge-index-rebuild 事件域——成功
// info / 静默重建（首用自动触发）warn / 失败 error（零静默）。
import { readFileSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { withImmediateTransaction } from './concurrency.js'
import { canonicalWsPath } from './registry.js'
import { parseKnowledgeFile } from './parser.js'
import { scanKnowledgeDir } from './scan.js'
import { KNOWLEDGE_REBUILD_EVENT, emitStorageDiag, storageDiag, type DiagEmitter } from './diag.js'

/** 重建报告（IndexReport 同形——indexed 入索引数 / skipped 容错跳过数） */
export interface RebuildReport {
  readonly indexed: number
  readonly skipped: number
}

/** 重建入参（emit = 装配期注入诊断发射面；silent = 首用静默重建——warn 级埋点） */
export interface RebuildOptions {
  readonly emit?: DiagEmitter
  readonly silent?: boolean
}

/** entries 行插入参数序 = 列序 */
type EntryRowParams = readonly [
  wsPath: string,
  frontmatterId: string | null,
  relPath: string,
  domainPath: string,
  title: string,
  summary: string,
  keywords: string,
  status: string,
  digest: string,
  indexedAt: string,
]

/**
 * rebuildKnowledgeIndex(wsPath)：注册表查 knowledge_dir → 扫描 → 解析 → 单事务
 * 删旧插新。文件读取/解析失败计入 skipped（容错不硬拒）；知识目录不可达/非法抛
 * InvalidKnowledgeDirError；wsPath 未命中注册表 fail-loud 裸错。一切终态均有
 * knowledge-index-rebuild 诊断事件（成功/静默 warn/失败 error）。
 */
export function rebuildKnowledgeIndex(
  db: Database.Database,
  wsPath: string,
  opts: RebuildOptions = {},
): RebuildReport {
  const key = canonicalWsPath(wsPath)
  const project = db
    .prepare<unknown[], { knowledge_dir: string }>(`SELECT knowledge_dir FROM projects WHERE ws_path = ?`)
    .get(key)
  if (project === undefined) {
    throw new Error(`注册行不存在：rebuildKnowledgeIndex(${wsPath})——wsPath 未命中自持注册表`)
  }

  try {
    const candidates = scanKnowledgeDir(project.knowledge_dir)
    const indexedAt = new Date().toISOString()
    const rows: EntryRowParams[] = []
    let skipped = 0
    for (const f of candidates) {
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
        const { frontmatter: fm } = outcome.entry
        rows.push([
          key,
          fm.id ?? null,
          f.relPath,
          outcome.entry.domainPath,
          fm.title,
          fm.summary,
          JSON.stringify(fm.keywords),
          fm.status,
          outcome.entry.digest,
          indexedAt,
        ])
      } catch {
        skipped += 1 // 读取失败（权限/编码）：容错跳过，不硬拒
      }
    }

    const deleteByWs = db.prepare(`DELETE FROM knowledge_entries WHERE ws_path = ?`)
    const insertEntry = db.prepare(
      `INSERT INTO knowledge_entries (
         ws_path, frontmatter_id, rel_path, domain_path, title, summary, keywords, status, digest, indexed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    // 整表事务重建：单飞（BEGIN IMMEDIATE——多项目共用单库的并发承载）
    withImmediateTransaction(db, () => {
      deleteByWs.run(key)
      for (const row of rows) insertEntry.run(...row)
    })

    emitStorageDiag(
      opts.emit,
      storageDiag(
        opts.silent === true ? 'warn' : 'info',
        KNOWLEDGE_REBUILD_EVENT,
        opts.silent === true
          ? `索引缺失触发静默重建：indexed=${rows.length} skipped=${skipped}`
          : `索引重建成功：indexed=${rows.length} skipped=${skipped}`,
        { cwd: key },
      ),
    )
    return { indexed: rows.length, skipped }
  } catch (cause) {
    emitStorageDiag(
      opts.emit,
      storageDiag('error', KNOWLEDGE_REBUILD_EVENT, `索引重建失败：${String(cause)}`, {
        cwd: key,
        stack: cause instanceof Error ? cause.stack : undefined,
      }),
    )
    throw cause
  }
}
