// SQLite 句柄唯一落点（L1 单写者纪律）：better-sqlite3 句柄只经 openDatabase 产出，
// 全包（及全应用 host 侧）唯一创建口。一切 SQL 走 prepared statements（Hard Rule）——
// pragma 走 better-sqlite3 官方 pragma API，DDL/查询一律 db.prepare()。
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { UnsupportedSchemaVersionError } from './errors.js'
import { MIGRATIONS, SCHEMA_VERSION, type Migration } from './schema.js'

/**
 * 开库参数（M2 1.2 参数化缝——Hard Rule：工作区迁移序列经参数传入，禁硬编码 import 中央序列）。
 * 缺省 = 中央 state.db 序列与版本上限：既有调用面（core index.ts 单句柄）零变化。
 */
export interface OpenDatabaseOptions {
  /** 迁移序列（独立版本线按调用方传入；缺省 = 中央 MIGRATIONS） */
  readonly migrations?: readonly Migration[]
  /** 本应用支持的本序列版本上限（版本门：库内 version 超出即拒绝打开；缺省 = 中央 SCHEMA_VERSION） */
  readonly schemaVersion?: number
}

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
export function openDatabase(file: string, options: OpenDatabaseOptions = {}): Database.Database {
  const migrations = options.migrations ?? MIGRATIONS
  const schemaVersion = options.schemaVersion ?? SCHEMA_VERSION
  mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    const current = readCurrentVersion(db)
    if (current > schemaVersion) {
      throw new UnsupportedSchemaVersionError(current, schemaVersion)
    }
    for (const migration of migrations) {
      if (migration.version > current) applyMigration(db, migration)
    }
    return db
  } catch (e) {
    db.close()
    throw e
  }
}
