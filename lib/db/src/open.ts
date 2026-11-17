// SQLite 句柄唯一落点（L1 单写者纪律）：better-sqlite3 句柄只经 openDatabase 产出，
// 全包（及全应用 host 侧）唯一创建口。一切 SQL 走 prepared statements（Hard Rule）——
// pragma 走 better-sqlite3 官方 pragma API，DDL/查询一律 db.prepare()。
// 迁移纪律与机制规范（指纹守卫 / 迁移前备份 / defer_foreign_keys / 守卫语句 / 数据迁移配方）
// 单一来源：docs/conventions/db-migrations.md——本文件只承载实现，不复述规范。
// 归并锚（plugin-project 1.7）：自 packages/core/src/db/open.ts git mv 迁入（零语义改动，
// 增 I4 逐连接 foreign_keys 断言——RED 锚①）。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { ForeignKeysUnavailableError, MigrationTamperedError, UnsupportedSchemaVersionError } from './errors.js'
import { MIGRATIONS, SCHEMA_VERSION, type GuardedStatement, type Migration } from './schema.js'

/** busy_timeout 毫秒：锁竞争等持有者落盘的上界（外部写锁在场时写者排队而非即时 SQLITE_BUSY） */
export const BUSY_TIMEOUT_MS = 5_000

/**
 * 开库参数（M2 1.2 参数化缝——Hard Rule：工作区迁移序列经参数传入，禁硬编码 import 中央序列）。
 * 缺省 = 中央 state.db 序列与版本上限：既有调用面（core index.ts 单句柄）零变化。
 */
export interface OpenDatabaseOptions {
  /** 迁移序列（独立版本线按调用方传入；缺省 = 中央 MIGRATIONS） */
  readonly migrations?: readonly Migration[]
  /** 本应用支持的本序列版本上限（版本门：库内 version 超出即拒绝打开；缺省 = 中央 SCHEMA_VERSION） */
  readonly schemaVersion?: number
  /**
   * 分域版本线锚（锚域不锚表集合——共库多域共存处方）：传入即启用 domain 隔离——
   * schema_meta / migration_digests 行按 domain 分域读写（锚 = 域名），版本门只判读本域
   * 版本线，其它域先行抬升的版本不触发拒开；共库各域前缀分表互不越界。
   * 缺席 = 全局单版本线（既有语义零变化——core / 非共库形态不受影响）。
   */
  readonly domain?: string
}

/** 读取库内当前 schema 版本（无 schema_meta 表 = 空库，视作 0；domain 模式只读本域版本线）。 */
function readCurrentVersion(db: Database.Database, domain?: string): number {
  const table = db
    .prepare<unknown[], { name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'`,
    )
    .get()
  if (!table) return 0
  const row =
    domain !== undefined
      ? db.prepare<unknown[], { v: number | null }>(`SELECT MAX(version) AS v FROM schema_meta WHERE domain = ?`).get(domain)
      : db.prepare<unknown[], { v: number | null }>(`SELECT MAX(version) AS v FROM schema_meta`).get()
  return row?.v ?? 0
}

/** 分域锚表形状：schema_meta / migration_digests 复合主键 (domain, version)——各域版本线行互不挤占。 */
const DOMAIN_SCHEMA_META_DDL = `CREATE TABLE schema_meta (
    domain     TEXT NOT NULL,
    version    INTEGER NOT NULL,
    applied_at TEXT NOT NULL,
    PRIMARY KEY (domain, version)
)`
const DOMAIN_DIGEST_DDL = `CREATE TABLE migration_digests (
    domain TEXT NOT NULL,
    version INTEGER NOT NULL,
    digest  TEXT NOT NULL,
    PRIMARY KEY (domain, version)
)`

/** 表列清单（pragma table_info 窄投影）。 */
function columnsOf(db: Database.Database, table: string): string[] {
  return (db.pragma(`table_info('${table}')`) as Array<{ name: string }>).map((c) => c.name)
}

function hasTable(db: Database.Database, table: string): boolean {
  return (
    db.prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table) !==
    undefined
  )
}

/**
 * 分域锚表确保（domain 模式专用，打开期机制级——不占迁移版本号）：
 * - 缺表 → 直接落分域形状；
 * - 旧形状（无 domain 列，全局单版本线时代遗留）→ 整表重建为 (domain, version) 复合主键，
 *   存量行以 domain='' 保留（认领段按指纹判据归位到本域，见 adoptLegacyRows）。
 */
function ensureDomainAnchorTables(db: Database.Database): void {
  if (!hasTable(db, 'schema_meta')) {
    db.exec(DOMAIN_SCHEMA_META_DDL)
  } else if (!columnsOf(db, 'schema_meta').includes('domain')) {
    db.exec(`ALTER TABLE schema_meta RENAME TO schema_meta_domain_upgrade`)
    db.exec(DOMAIN_SCHEMA_META_DDL)
    db.exec(`INSERT INTO schema_meta (domain, version, applied_at) SELECT '', version, applied_at FROM schema_meta_domain_upgrade`)
    db.exec(`DROP TABLE schema_meta_domain_upgrade`)
  }
  if (!hasTable(db, 'migration_digests')) {
    db.exec(DOMAIN_DIGEST_DDL)
  } else if (!columnsOf(db, 'migration_digests').includes('domain')) {
    db.exec(`ALTER TABLE migration_digests RENAME TO migration_digests_domain_upgrade`)
    db.exec(DOMAIN_DIGEST_DDL)
    db.exec(`INSERT INTO migration_digests (domain, version, digest) SELECT '', version, digest FROM migration_digests_domain_upgrade`)
    db.exec(`DROP TABLE migration_digests_domain_upgrade`)
  }
}

/**
 * 旧线行认领（domain 模式——旧全局单版本线库升级到分域读法的归位段，两判据）：
 * ① 指纹判据（主判据）：migration_digests 存量 domain='' 行与本域迁移语句集指纹逐版本比对，
 *    命中即把该版本的 schema_meta / migration_digests 行归位为本域——单装旧库升级零重迁移；
 *    共库异域行指纹不命中、零误领（异域高版本行继续留在 domain='' 不触发本域版本门）。
 * ② 空指纹兜底：migration_digests 全空（指纹机制前历史库 / 迁移脚本直建库）时按版本号
 *    归位 ≤ 本域上限的存量行——指纹缺失时以「单域独占库」为唯一可信前提（共库场景指纹表
 *    必非空，兜底分支不触达）。
 */
function adoptLegacyRows(db: Database.Database, migrations: readonly Migration[], domain: string, schemaVersion: number): void {
  const digestRows = hasTable(db, 'migration_digests')
    ? (db.prepare<unknown[], { version: number; digest: string }>(`SELECT version, digest FROM migration_digests WHERE domain = ''`).all())
    : []
  const claimedVersions: number[] = []
  if (digestRows.length > 0) {
    const byVersion = new Map(digestRows.map((r) => [r.version, r.digest]))
    for (const migration of migrations) {
      if (byVersion.get(migration.version) === digestOf(migration)) claimedVersions.push(migration.version)
    }
  } else {
    for (const migration of migrations) {
      if (migration.version <= schemaVersion) claimedVersions.push(migration.version)
    }
  }
  if (claimedVersions.length === 0) return
  const placeholders = claimedVersions.map(() => '?').join(', ')
  db.prepare(`UPDATE migration_digests SET domain = ? WHERE domain = '' AND version IN (${placeholders})`).run(domain, ...claimedVersions)
  db.prepare(`UPDATE schema_meta SET domain = ? WHERE domain = '' AND version IN (${placeholders})`).run(domain, ...claimedVersions)
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
function verifyAndBootstrapDigests(
  db: Database.Database,
  migrations: readonly Migration[],
  current: number,
  domain?: string,
): void {
  const applied = migrations.filter((m) => m.version <= current)
  for (const migration of applied) {
    const digest = digestOf(migration)
    const row =
      domain !== undefined
        ? db
            .prepare<unknown[], { digest: string }>(`SELECT digest FROM migration_digests WHERE version = ? AND domain = ?`)
            .get(migration.version, domain)
        : db.prepare<unknown[], { digest: string }>(`SELECT digest FROM migration_digests WHERE version = ?`).get(migration.version)
    if (!row) {
      if (domain !== undefined) {
        db.prepare(`INSERT INTO migration_digests (domain, version, digest) VALUES (?, ?, ?)`).run(domain, migration.version, digest)
      } else {
        db.prepare(`INSERT INTO migration_digests (version, digest) VALUES (?, ?)`).run(migration.version, digest)
      }
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
function applyMigration(db: Database.Database, migration: Migration, domain?: string): void {
  db.transaction(() => {
    db.pragma('defer_foreign_keys = ON')
    for (const stmt of migration.statements) {
      if (typeof stmt !== 'string') {
        if (stmt.columnGuard && columnExists(db, stmt.columnGuard)) continue
        if (stmt.dropGuard && !columnExists(db, stmt.dropGuard)) continue
      }
      db.prepare(typeof stmt === 'string' ? stmt : stmt.sql).run()
    }
    if (domain !== undefined) {
      db.prepare(`INSERT INTO schema_meta (domain, version, applied_at) VALUES (?, ?, ?)`).run(
        domain,
        migration.version,
        new Date().toISOString(),
      )
      db.prepare(`INSERT INTO migration_digests (domain, version, digest) VALUES (?, ?, ?)`).run(domain, migration.version, digestOf(migration))
    } else {
      db.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)`).run(migration.version, new Date().toISOString())
      db.prepare(`INSERT INTO migration_digests (version, digest) VALUES (?, ?)`).run(migration.version, digestOf(migration))
    }
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
  const domain = options.domain
  const fileExisted = existsSync(file)
  mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  try {
    db.pragma('journal_mode = WAL')
    // busy_timeout（65e7a104 H-B）：外部连接持写锁（BEGIN IMMEDIATE）期间写语句即时 SQLITE_BUSY
    // 失败——锁竞争等持有者落盘（5s 上界），补偿链不再被瞬时外部写锁误触发。
    db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`)
    db.pragma('foreign_keys = ON')
    // I4 逐连接断言（RED 锚①）：foreign_keys 是 per-connection PRAGMA，写入不等于生效——
    // 回读非 1 即 throw 拒开（SQLite 编译剔除 FK 等环境异常时约束静默失效，必须 fail-closed）。
    if ((db.pragma('foreign_keys', { simple: true }) as number) !== 1) {
      throw new ForeignKeysUnavailableError()
    }

    // 分域版本线（锚域不锚表集合）：锚表先确保/升级为分域形状，旧线行按指纹认领归位，
    // 版本门随后只判读本域版本线。
    if (domain !== undefined) ensureDomainAnchorTables(db)
    if (domain !== undefined) adoptLegacyRows(db, migrations, domain, schemaVersion)
    const current = readCurrentVersion(db, domain)
    if (current > schemaVersion) {
      throw new UnsupportedSchemaVersionError(current, schemaVersion)
    }
    ensureDigestTable(db)
    verifyAndBootstrapDigests(db, migrations, current, domain)

    const pending = migrations.filter((m) => m.version > current && m.version <= schemaVersion)
    if (pending.length > 0 && fileExisted) {
      backupBeforeMigrations(db, file, Math.max(...pending.map((m) => m.version)))
    }
    for (const migration of pending) applyMigration(db, migration, domain)
    return db
  } catch (e) {
    db.close()
    throw e
  }
}
