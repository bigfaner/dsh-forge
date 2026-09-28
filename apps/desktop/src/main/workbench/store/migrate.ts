// schema_version migrator (task 2.1; v2 segment = M3 task 1.1; v3 segment =
// M4 task 1.1) — application-layer, sequential migrations. node:sqlite has no
// built-in migrator; design (docs/features/dsh-forge-m2/design/schema.sql
// header): schema_version is a single row that only ever moves forward; a
// migration = executing the not yet applied version segments in order. Applied
// segments are immutable — evolution appends a new segment, it never edits an
// old one.

import { backfillStoredIdentity, toComparableKey } from '../projects-identity/normalize.ts'
import type { DatabaseSyncLike } from './db.ts'
import { SCHEMA_V1_SQL } from './schema-v1.ts'
import { SCHEMA_V2_SQL } from './schema-v2.ts'
import { SCHEMA_V3_SQL } from './schema-v3.ts'

/**
 * Context handed to every migration step. The v3 backfill needs the
 * kernel-managed external docs root (`<userData>/workbench/docs`, the same
 * placement rule as ipc/services.ts workbenchPaths.docsRoot) to classify
 * legacy external doc locations under it as 'app'. db.ts derives it from the
 * db placement single source.
 */
export interface MigrationContext {
  readonly docsRoot: string
}

/** One forward migration step. Steps run inside their own transaction. */
export interface SchemaMigration {
  readonly version: number
  readonly up: (db: DatabaseSyncLike, context: MigrationContext | undefined) => void
}

// v4 挂载点:表结构演进在此追加 { version: 4, up: ... };已发布的版本段(v1/v2/v3)不可改写。
const MIGRATIONS: readonly SchemaMigration[] = [
  { version: 1, up: applySchemaV1 },
  { version: 2, up: applySchemaV2 },
  { version: 3, up: (db, context) => applySchemaV3(db, context?.docsRoot) },
]

/** The newest known schema version (the MIGRATIONS tail). */
export const LATEST_SCHEMA_VERSION: number = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0

/** v1: full DDL projection (schema-v1.sql) + the schema_version row, atomic. */
function applySchemaV1(db: DatabaseSyncLike): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(SCHEMA_V1_SQL)
    // 单行纪律:先清后写,重复应用不会堆积行(schema_version 单行递增)。
    db.exec('DELETE FROM schema_version')
    db.exec('INSERT INTO schema_version (version) VALUES (1)')
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // The connection may already be unusable; prefer rethrowing the original error.
    }
    throw error
  }
}

/**
 * v2: M3 incremental migration (task 1.1, design/schema.sql v2 projection) —
 * only-add: 2 ALTER groups (projects / feature_snapshot) + 7 new tables + 6
 * indexes, atomic with the version bump to 2. The M2 v1 tables and their data
 * are untouched.
 */
function applySchemaV2(db: DatabaseSyncLike): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(SCHEMA_V2_SQL)
    // 单行纪律:先清后写,重复应用不会堆积行(schema_version 单行递增)。
    db.exec('DELETE FROM schema_version')
    db.exec('INSERT INTO schema_version (version) VALUES (2)')
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // The connection may already be unusable; prefer rethrowing the original error.
    }
    throw error
  }
}

/**
 * v3: M4 incremental migration (task 1.1, design/schema.sql v3 projection) —
 * only-add: projects ALTER ×10 (D11 三层身份 / archived / sort_order /
 * docs_placement / projection_state) + 2 new tables (project_ui_state /
 * workspace_projection) + 2 indexes, atomic with the version bump to 3 and
 * the in-transaction TS backfill of the new columns for existing rows.
 */
function applySchemaV3(db: DatabaseSyncLike, docsRoot: string | undefined): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(SCHEMA_V3_SQL)
    backfillProjectsV3(db, docsRoot)
    // 单行纪律:先清后写,重复应用不会堆积行(schema_version 单行递增)。
    db.exec('DELETE FROM schema_version')
    db.exec('INSERT INTO schema_version (version) VALUES (3)')
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // The connection may already be unusable; prefer rethrowing the original error.
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// v3 事务内 TS 回填(design/schema.sql 头注 + tech-design §Data Models 迁移回填
// 口径)。归一化管线自任务 1.2 起收编至 workbench/projects-identity/normalize.ts
// (应用层单源:toComparableKey 折叠键 + backfillStoredIdentity best-effort 身份,
// 失败不阻断);此处仅消费,不再持有本地副本。normalize.ts 为纯 fs/path 叶子
// 模块(零 store/repos/registry 依赖),registry→repos→store 分层方向不受影响。
// ---------------------------------------------------------------------------

/**
 * app_state 保留键 `external_doc_authorizations` 的镜像(registry/authorize.ts
 * EXTERNAL_DOC_AUTHORIZATIONS_KEY)。store 层不得上溯 import registry(层级
 * registry→repos→store);该键为 v2 期冻结的 app_state 行键,漂移由 v3 回填
 * 用例钉定。
 */
const EXTERNAL_DOC_AUTHORIZATIONS_KEY = 'external_doc_authorizations'

/** 仓外授权在案判定(app_state external_doc_authorizations;防御读:无行/坏
 * JSON/畸形条目 → 空集 —— 回填只读,不修复)。键统一折叠后比对。 */
function readAuthorizedDocPathKeys(db: DatabaseSyncLike): ReadonlySet<string> {
  const keys = new Set<string>()
  const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(EXTERNAL_DOC_AUTHORIZATIONS_KEY) as
    | { value: string }
    | undefined
  if (row === undefined || typeof row.value !== 'string') return keys
  try {
    const parsed: unknown = JSON.parse(row.value)
    if (!Array.isArray(parsed)) return keys
    for (const entry of parsed) {
      if (typeof entry === 'object' && entry !== null && typeof (entry as { path?: unknown }).path === 'string') {
        keys.add(toComparableKey((entry as { path: string }).path))
      }
    }
  } catch {
    // 损坏 JSON → 视为无授权在案。
  }
  return keys
}

/**
 * 存量行回填(design/schema.sql 头注 + er-diagram Change Impact):
 * - code_root_key/identity ← 归一化管线 best-effort(fs 失败走字符串回退,
 *   不阻断);
 * - in_repo → 'repo-existing';external 位于内核 docsRoot 之下 → 'app';
 *   其余 external → 'custom'(授权在案 → custom_authorized=1);
 * - sort_order ← created_at 注册序(并列按 id 稳定);
 * - projection_state='pending' / archived=0 / workspace_id=NULL 由 ALTER
 *   DEFAULT 承载,无需回写。
 * 折叠键碰撞由 idx_projects_code_root_key(UNIQUE)在 UPDATE 处显式暴露 →
 * 整段回滚 = 迁移失败(≤20 项目规模可接受,er-diagram 口径)。
 */
function backfillProjectsV3(db: DatabaseSyncLike, docsRoot: string | undefined): void {
  const docsRootKey = docsRoot === undefined ? null : toComparableKey(docsRoot)
  const authorizedKeys = readAuthorizedDocPathKeys(db)
  const rows = db
    .prepare('SELECT id, code_root, doc_location_type, doc_location_path FROM projects ORDER BY created_at ASC, id ASC')
    .all() as Array<{ id: string; code_root: string; doc_location_type: string; doc_location_path: string | null }>
  const update = db.prepare(
    'UPDATE projects SET code_root_key = ?, identity_dev = ?, identity_ino = ?, identity_verified = ?, docs_placement = ?, custom_authorized = ?, sort_order = ? WHERE id = ?',
  )
  rows.forEach((row, index) => {
    const backfill = backfillStoredIdentity(row.code_root)
    // 无法归类的行(理论不可达:v1 行级 CHECK 保证两值)→ 'legacy' 迁移前值冻结。
    let docsPlacement = 'legacy'
    let customAuthorized: 0 | 1 = 0
    if (row.doc_location_type === 'in_repo') {
      docsPlacement = 'repo-existing'
    } else if (row.doc_location_type === 'external' && row.doc_location_path !== null) {
      const pathKey = toComparableKey(row.doc_location_path)
      if (docsRootKey !== null && (pathKey === docsRootKey || pathKey.startsWith(`${docsRootKey}/`))) {
        docsPlacement = 'app'
      } else {
        docsPlacement = 'custom'
        customAuthorized = authorizedKeys.has(pathKey) ? 1 : 0
      }
    }
    update.run(
      backfill.codeRootKey,
      backfill.identityDev,
      backfill.identityIno,
      backfill.identityVerified,
      docsPlacement,
      customAuthorized,
      index,
      row.id,
    )
  })
}

/**
 * Read the applied schema version (0 when nothing has been applied yet —
 * the schema_version table itself is created by v1).
 */
export function readSchemaVersion(db: DatabaseSyncLike): number {
  const tableExists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'")
    .get()
  if (tableExists === undefined) return 0
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null } | undefined
  return row?.v ?? 0
}

/** Result of a migration pass: the version range that was walked this run. */
export interface MigrationOutcome {
  readonly from: number
  readonly to: number
}

/**
 * Bring the database up to the latest known schema version.
 * @throws Error when the stored version is newer than the latest known
 *   migration (database opened by a newer shell build) — the caller
 *   (db.ts) surfaces that as ERR_WORKBENCH_DB without touching the file:
 *   the version must stay monotonic and unknown data is never wiped.
 */
export function migrateDatabase(db: DatabaseSyncLike, context?: MigrationContext): MigrationOutcome {
  const from = readSchemaVersion(db)
  const latest = LATEST_SCHEMA_VERSION
  if (from > latest) {
    throw new Error(
      `workbench database schema version ${String(from)} is newer than the latest known migration ${String(latest)} — refusing to touch it`,
    )
  }
  let to = from
  for (const migration of MIGRATIONS) {
    if (migration.version <= from) continue
    migration.up(db, context)
    to = migration.version
  }
  return { from, to }
}
