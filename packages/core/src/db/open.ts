// SQLite 句柄唯一落点（L1 单写者纪律）：better-sqlite3 句柄只经 openDatabase 产出，
// 全包（及全应用 host 侧）唯一创建口。一切 SQL 走 prepared statements（Hard Rule）——
// pragma 走 better-sqlite3 官方 pragma API，DDL/查询一律 db.prepare()。
// 迁移纪律与机制规范（指纹守卫 / 迁移前备份 / defer_foreign_keys / 守卫语句 / 数据迁移配方）
// 单一来源：docs/conventions/db-migrations.md——本文件只承载实现，不复述规范。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { MigrationTamperedError, UnsupportedSchemaVersionError } from './errors.js'
import { MIGRATIONS, SCHEMA_VERSION, type GuardedStatement, type Migration } from './schema.js'

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

/** 语句集指纹：sha-256（语句序列的 JSON 序列化——守卫形态的 sql 与 columnGuard 都参与哈希）。 */
function digestOf(migration: Migration): string {
  return createHash('sha256').update(JSON.stringify(migration.statements)).digest('hex')
}

/** 基建表 migration_digests（机制级，不占迁移版本号；IF NOT EXISTS 幂等）。 */
function ensureDigestTable(db: Database.Database): void {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS migration_digests (
    version INTEGER PRIMARY KEY,
    digest  TEXT    NOT NULL
)`,
  ).run()
}

/**
 * 指纹守卫：对库内已应用的每个版本校验当前代码语句集指纹。
 * - 缺席（历史库）→ 按当前代码一次性回填（bootstrap，接受现状为正典）；
 * - 不一致 → MigrationTamperedError（已发布迁移被直改，明确拒开）。
 */
function verifyAndBootstrapDigests(db: Database.Database, migrations: readonly Migration[], current: number): void {
  const applied = migrations.filter((m) => m.version <= current)
  for (const migration of applied) {
    const digest = digestOf(migration)
    const row = db.prepare<unknown[], { digest: string }>(
      `SELECT digest FROM migration_digests WHERE version = ?`,
    ).get(migration.version)
    if (!row) {
      db.prepare(`INSERT INTO migration_digests (version, digest) VALUES (?, ?)`).run(migration.version, digest)
    } else if (row.digest !== digest) {
      throw new MigrationTamperedError(migration.version)
    }
  }
}

/** columnGuard 命中判定：表存在且列已在场 → 跳过该语句。 */
function columnExists(db: Database.Database, guard: NonNullable<GuardedStatement['columnGuard']>): boolean {
  const columns = db.pragma(`table_info('${guard.table}')`) as Array<{ name: string }>
  return columns.some((c) => c.name === guard.column)
}

/**
 * 单事务原子应用一条迁移：
 * - 事务开头机制级 `PRAGMA defer_foreign_keys = ON`（FK 校验延迟到 COMMIT——表重建期间允许暂态引用悬空）；
 * - columnGuard 命中（列已在场）的语句跳过，其余依序执行；
 * - 成功后同事务记录语句集 sha-256 指纹 + schema_meta 版本行，任一步失败整体回滚。
 */
function applyMigration(db: Database.Database, migration: Migration): void {
  db.transaction(() => {
    db.pragma('defer_foreign_keys = ON')
    for (const stmt of migration.statements) {
      if (typeof stmt !== 'string' && stmt.columnGuard && columnExists(db, stmt.columnGuard)) continue
      db.prepare(typeof stmt === 'string' ? stmt : stmt.sql).run()
    }
    db.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)`).run(
      migration.version,
      new Date().toISOString(),
    )
    db.prepare(`INSERT INTO migration_digests (version, digest) VALUES (?, ?)`).run(migration.version, digestOf(migration))
  })()
}

/**
 * 迁移前自动备份：`VACUUM INTO '{file}.bak-{日期}-pre-v{目标版本}'`（按目标版本覆盖保留一份）。
 * 用 VACUUM INTO 而非裸拷贝：库开 WAL，裸拷主文件丢最近事务；VACUUM INTO 产出含全部已提交数据的完整快照。
 * 失败 fail-closed：抛错，不应用任何迁移。
 */
function backupBeforeMigrations(db: Database.Database, file: string, targetVersion: number): void {
  const today = new Date().toISOString().slice(0, 10)
  const backupFile = `${file}.bak-${today}-pre-v${targetVersion}`
  if (existsSync(backupFile)) unlinkSync(backupFile)
  const escaped = backupFile.replaceAll("'", "''")
  db.exec(`VACUUM INTO '${escaped}'`)
}

/**
 * 打开（或创建）应用状态库并校验/推进 schema 版本。
 *
 * 前向门语义（schema.sql 头注）：
 * - 空库 / version < SCHEMA_VERSION → 依序应用待补迁移（前向单向）；
 * - version = SCHEMA_VERSION → 直接可用（打开幂等，不重复迁移/插入）；
 * - version > SCHEMA_VERSION → 明确拒绝打开（UnsupportedSchemaVersionError，句柄已关闭）。
 *
 * 加固语义（指纹守卫 / 迁移前 VACUUM INTO 备份 fail-closed / defer_foreign_keys）见
 * docs/conventions/db-migrations.md §3——此处只承载实现。
 */
export function openDatabase(file: string, options: OpenDatabaseOptions = {}): Database.Database {
  const migrations = options.migrations ?? MIGRATIONS
  const schemaVersion = options.schemaVersion ?? SCHEMA_VERSION
  const fileExisted = existsSync(file)
  mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    const current = readCurrentVersion(db)
    if (current > schemaVersion) {
      throw new UnsupportedSchemaVersionError(current, schemaVersion)
    }
    ensureDigestTable(db)
    verifyAndBootstrapDigests(db, migrations, current)

    const pending = migrations.filter((m) => m.version > current && m.version <= schemaVersion)
    if (pending.length > 0 && fileExisted) {
      backupBeforeMigrations(db, file, Math.max(...pending.map((m) => m.version)))
    }
    for (const migration of pending) applyMigration(db, migration)
    return db
  } catch (e) {
    db.close()
    throw e
  }
}
