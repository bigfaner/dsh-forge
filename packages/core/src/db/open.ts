// SQLite 句柄唯一落点（L1 单写者纪律）：better-sqlite3 句柄只经 openDatabase 产出，
// 全包（及全应用 host 侧）唯一创建口。一切 SQL 走 prepared statements（Hard Rule）——
// pragma 走 better-sqlite3 官方 pragma API，DDL/查询一律 db.prepare()。
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { UnsupportedSchemaVersionError } from './errors.js'
import { MIGRATIONS, SCHEMA_VERSION, type Migration } from './schema.js'

/** 读取库内当前 schema 版本（无 schema_meta 表 = 空库，视作 0）。 */
function readCurrentVersion(db: Database.Database): number {
  const table = db
    .prepare<unknown[], { name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'`,
    )
    .get()
  if (!table) return 0
  const row = db.prepare<unknown[], { v: number | null }>(`SELECT MAX(version) AS v FROM schema_meta`).get()
  return row?.v ?? 0
}

/** 单事务原子应用一条迁移：全部 DDL + schema_meta 版本行，任一步失败整体回滚。 */
function applyMigration(db: Database.Database, migration: Migration): void {
  db.transaction(() => {
    for (const stmt of migration.statements) db.prepare(stmt).run()
    db.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)`).run(
      migration.version,
      new Date().toISOString(),
    )
  })()
}

/**
 * 打开（或创建）应用状态库并校验/推进 schema 版本。
 *
 * 前向门语义（schema.sql 头注）：
 * - 空库 / version < SCHEMA_VERSION → 依序应用待补迁移（前向单向，全 CREATE 无 ALTER）；
 * - version = SCHEMA_VERSION → 直接可用（打开幂等，不重复迁移/插入）；
 * - version > SCHEMA_VERSION → 明确拒绝打开（UnsupportedSchemaVersionError，句柄已关闭）。
 */
export function openDatabase(file: string): Database.Database {
  mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    const current = readCurrentVersion(db)
    if (current > SCHEMA_VERSION) {
      throw new UnsupportedSchemaVersionError(current, SCHEMA_VERSION)
    }
    for (const migration of MIGRATIONS) {
      if (migration.version > current) applyMigration(db, migration)
    }
    return db
  } catch (e) {
    db.close()
    throw e
  }
}
