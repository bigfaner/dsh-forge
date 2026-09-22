// schema_version migrator (task 2.1) — application-layer, sequential
// migrations. node:sqlite has no built-in migrator; design
// (docs/features/dsh-forge-m2/design/schema.sql header): schema_version is a
// single row that only ever moves forward; a migration = executing the not
// yet applied version segments in order. Applied segments are immutable —
// evolution appends a new segment, it never edits an old one.

import type { DatabaseSyncLike } from './db.ts'
import { SCHEMA_V1_SQL } from './schema-v1.ts'

/** One forward migration step. Steps run inside their own transaction. */
export interface SchemaMigration {
  readonly version: number
  readonly up: (db: DatabaseSyncLike) => void
}

// v2 挂载点:表结构演进在此追加 { version: 2, up: ... };已发布的版本段不可改写。
const MIGRATIONS: readonly SchemaMigration[] = [
  { version: 1, up: applySchemaV1 },
]

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
export function migrateDatabase(db: DatabaseSyncLike): MigrationOutcome {
  const from = readSchemaVersion(db)
  const latest = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0
  if (from > latest) {
    throw new Error(
      `workbench database schema version ${String(from)} is newer than the latest known migration ${String(latest)} — refusing to touch it`,
    )
  }
  let to = from
  for (const migration of MIGRATIONS) {
    if (migration.version <= from) continue
    migration.up(db)
    to = migration.version
  }
  return { from, to }
}
