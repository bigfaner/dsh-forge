// 自持库初始化（open 唯一落点）：库目录创建显式权限位（判例 cd85fde5——mkdir 随 umask
// 可落 700，须显式 chmod）+ 并发纪律 PRAGMA（WAL + busy_timeout + foreign_keys，
// 总纲 §2.10）+ schema_meta 版本线（前向门：空库/落后 → 补迁移；超上限 → 拒开）。
// 短事务纪律由 concurrency.ts withImmediateTransaction 承载（写入面单点）。
import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { STORAGE_MIGRATIONS, STORAGE_SCHEMA_VERSION } from './schema.js'
import { BUSY_TIMEOUT_MS } from './concurrency.js'

/** 库目录显式权限位（不随 umask——判例 cd85fde5） */
export const KNOWLEDGE_DB_DIR_MODE = 0o755

/** 库内当前 schema 版本（无 schema_meta 表 = 空库，视作 0） */
function readCurrentVersion(db: Database.Database): number {
  const table = db
    .prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'`)
    .get()
  if (!table) return 0
  const row = db.prepare<unknown[], { v: number | null }>(`SELECT MAX(version) AS v FROM schema_meta`).get()
  return row?.v ?? 0
}

/** 库目录确保 + 显式权限（mkdir recursive 后 chmod——umask 不可依赖） */
export function ensureKnowledgeDbDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  chmodSync(dir, KNOWLEDGE_DB_DIR_MODE)
}

/**
 * 打开（或创建）自持知识库：
 * - 目录显式权限位（cd85fde5）；
 * - WAL + busy_timeout(BUSY_TIMEOUT_MS) + foreign_keys（多项目共用单库的跨项目写并发承载）；
 * - 版本门：库内 version 超出 STORAGE_SCHEMA_VERSION → 拒开（句柄已关）；空库/落后 →
 *   依序单事务应用待补迁移（每版落 schema_meta 版本行）——打开幂等。
 */
export function openKnowledgeDatabase(file: string): Database.Database {
  ensureKnowledgeDbDir(dirname(file))
  const db = new Database(file)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`)
    db.pragma('foreign_keys = ON')

    const current = readCurrentVersion(db)
    if (current > STORAGE_SCHEMA_VERSION) {
      throw new Error(
        `knowledge storage: schema version ${current} exceeds supported ${STORAGE_SCHEMA_VERSION}（更宿主形态的库——拒开）`,
      )
    }
    const pending = STORAGE_MIGRATIONS.filter((m) => m.version > current)
    for (const migration of pending) {
      db.transaction(() => {
        for (const stmt of migration.statements) db.prepare(stmt).run()
        db.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)`).run(
          migration.version,
          new Date().toISOString(),
        )
      })()
    }
    return db
  } catch (e) {
    db.close()
    throw e
  }
}
