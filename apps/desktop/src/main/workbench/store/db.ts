// workbench/store — SQLite data-kernel foundation (task 2.1).
//
// Placement per tech-design §Architecture Layer Placement: the Electron main
// process owns the workbench store at <userData>/workbench/workbench.db
// (node:sqlite, Electron ^44 built-in — zero native dependencies, zero new
// packages). Boot contract (§Error Handling / §Error Types & Codes):
//
//   - Boot probe = availability check + 试开库. Any failure surfaces as a
//     structured WorkbenchDbError (ERR_WORKBENCH_DB) that blocks workbench
//     boot — there is no silent no-database degradation path.
//   - A corrupt database file is renamed to workbench.db.corrupt-<ts> (plus
//     its stale -wal/-shm siblings) and an empty database is rebuilt; the
//     backup path rides both the structured log record and the return value
//     so the caller can surface it (明确告知).
//   - PRAGMA journal_mode = WAL + foreign_keys = ON are applied on every
//     connection (they are connection-level settings, not schema).

import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { shellLog } from '../../log.ts'
import { migrateDatabase } from './migrate.ts'

/** The minimal node:sqlite connection surface this store depends on. */
export interface DatabaseSyncLike {
  exec(sql: string): void
  prepare(sql: string): {
    get(...anonymousParameters: unknown[]): unknown
    all(...anonymousParameters: unknown[]): unknown[]
    run(...anonymousParameters: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  }
  close(): void
}

/** The minimal node:sqlite module surface (injectable for probe-failure tests). */
export interface SqliteModuleLike {
  readonly DatabaseSync: new (location: string) => DatabaseSyncLike
}

/**
 * Boot probe / unusable-database failure (explicit startup error path).
 * `code` is the stable machine-readable error code from the tech-design
 * error table; `data` carries the backup path when one was taken.
 */
export class WorkbenchDbError extends Error {
  readonly code = 'ERR_WORKBENCH_DB'

  constructor(message: string, readonly data?: Record<string, unknown>) {
    super(message)
    this.name = 'WorkbenchDbError'
  }
}

/** An opened, migrated workbench database. */
export interface OpenDatabaseResult {
  readonly db: DatabaseSyncLike
  readonly path: string
  /**
   * Set when a corrupt database was found: the old file (and its stale
   * -wal/-shm siblings) was renamed to `backupPath` and an empty database
   * rebuilt in its place.
   */
  readonly recovery?: { readonly backupPath: string }
}

/** Test seams for the node:sqlite module (production: dynamic import). */
export interface OpenDatabaseDeps {
  loadSqliteModule?: () => SqliteModuleLike | Promise<SqliteModuleLike>
}

const WORKBENCH_DIR = 'workbench'
const DB_FILE_NAME = 'workbench.db'

/**
 * Canonical workbench database file path for a userData root (single source
 * for the `<userData>/workbench/workbench.db` placement rule). Migration
 * backup (task 1.4) resolves the live db artifacts through this helper so it
 * can never drift from the boot-time placement.
 */
export function resolveWorkbenchDbPath(userDataPath: string): string {
  return join(userDataPath, WORKBENCH_DIR, DB_FILE_NAME)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Default node:sqlite loader. `process.features.sqlite` is only a fast
 * negative hint (it stays undefined on builds that do ship the module,
 * observed on Node 24.x), so the authoritative probe is the dynamic import
 * plus the trial open — both covered here.
 */
async function loadSqliteModuleDefault(): Promise<SqliteModuleLike> {
  // ProcessFeatures does not declare `sqlite` (module presence varies by
  // build), hence the double cast.
  const features = process.features as unknown as { sqlite?: boolean }
  if (features.sqlite === false) {
    throw new Error('process.features.sqlite is false — this runtime was built without node:sqlite')
  }
  const mod = (await import('node:sqlite')) as unknown as SqliteModuleLike
  if (typeof mod.DatabaseSync !== 'function') {
    throw new Error('node:sqlite is present but exports no DatabaseSync')
  }
  return mod
}

/** 试开库: open an in-memory database and run a trivial statement through it. */
function trialOpen(mod: SqliteModuleLike): void {
  const probe = new mod.DatabaseSync(':memory:')
  try {
    probe.prepare('SELECT 1 AS ok').get()
  } finally {
    probe.close()
  }
}

/**
 * Resolve a verified node:sqlite module (the boot probe). Any failure here is
 * a structured, boot-blocking ERR_WORKBENCH_DB — never degraded past this.
 */
async function resolveSqliteModule(deps: OpenDatabaseDeps): Promise<SqliteModuleLike> {
  const load = deps.loadSqliteModule ?? loadSqliteModuleDefault
  try {
    const mod = await load()
    trialOpen(mod)
    return mod
  } catch (error) {
    throw new WorkbenchDbError(
      `workbench boot probe failed: node:sqlite is unavailable or unusable (${errorMessage(error)}) — refusing to start the workbench without its database`,
    )
  }
}

/**
 * Open the database file, apply the connection PRAGMAs and migrate to the
 * latest schema. On failure the handle is closed (renames on win32 require
 * it) and the raw error is rethrown for the caller to classify. `docsRoot`
 * (kernel-managed external docs root) feeds the v3 backfill's legacy
 * external → 'app' classification.
 */
function openAndMigrate(mod: SqliteModuleLike, dbPath: string, docsRoot: string): DatabaseSyncLike {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new mod.DatabaseSync(dbPath)
  try {
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')
    migrateDatabase(db, { docsRoot })
    return db
  } catch (error) {
    try {
      db.close()
    } catch {
      // The connection may already be unusable; prefer rethrowing the original error.
    }
    throw error
  }
}

/** SQLite result codes for unusable file content: 26 = NOTADB, 11 = CORRUPT. */
const CORRUPTION_ERROR_CODES = new Set([11, 26])
const CORRUPTION_MESSAGE_PATTERN = /file is not a database|database disk image is malformed|malformed database schema/i

/** Whether an open/migrate failure looks like database-file corruption. */
function isCorruption(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const errcode = (error as { errcode?: unknown }).errcode
    if (typeof errcode === 'number' && CORRUPTION_ERROR_CODES.has(errcode)) return true
  }
  return error instanceof Error && CORRUPTION_MESSAGE_PATTERN.test(error.message)
}

/**
 * Rename the corrupt database (and its stale -wal/-shm siblings) aside as
 * workbench.db.corrupt-<ts>. The WAL siblings must travel with the backup: a
 * stale -wal left at the live path would be recovered by SQLite on top of the
 * rebuilt database and corrupt it again.
 */
function backupCorruptDatabase(dbPath: string): string {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  let backupPath = `${dbPath}.corrupt-${stamp}`
  for (let i = 1; existsSync(backupPath); i += 1) backupPath = `${dbPath}.corrupt-${stamp}-${String(i)}`
  renameSync(dbPath, backupPath)
  for (const suffix of ['-wal', '-shm']) {
    const sibling = `${dbPath}${suffix}`
    if (existsSync(sibling)) renameSync(sibling, `${backupPath}${suffix}`)
  }
  return backupPath
}

/**
 * Open (or create) the workbench database at
 * `<userData>/workbench/workbench.db` and migrate it to the latest schema.
 *
 * Failure contract: every unusable outcome rejects as a
 * {@link WorkbenchDbError} (ERR_WORKBENCH_DB) so the workbench boot can block
 * on it — there is no silent no-database mode. The one self-healing path is
 * a corrupt database: back up, rebuild empty, continue, and report the
 * backup path via `recovery` (and a structured log record).
 */
export async function openDatabase(
  userDataPath: string,
  deps: OpenDatabaseDeps = {},
): Promise<OpenDatabaseResult> {
  // Probe first: a failed probe must leave no filesystem state behind.
  const mod = await resolveSqliteModule(deps)
  const dbPath = join(userDataPath, WORKBENCH_DIR, DB_FILE_NAME)
  // v3 回填的 app 管理文档根(<userData>/workbench/docs —— 与 ipc/services.ts
  // workbenchPaths.docsRoot 同一放置规则,自 db 放置单一源推导)。
  const docsRoot = join(dirname(dbPath), 'docs')
  try {
    const db = openAndMigrate(mod, dbPath, docsRoot)
    return { db, path: dbPath }
  } catch (error) {
    if (error instanceof WorkbenchDbError) throw error
    if (!existsSync(dbPath) || !isCorruption(error)) {
      throw new WorkbenchDbError(`workbench database at ${dbPath} cannot be opened or migrated (${errorMessage(error)})`)
    }
    let backupPath: string
    try {
      backupPath = backupCorruptDatabase(dbPath)
    } catch (backupError) {
      throw new WorkbenchDbError(
        `workbench database is corrupt and the backup failed (${errorMessage(backupError)})`,
        { dbPath },
      )
    }
    try {
      const db = openAndMigrate(mod, dbPath, docsRoot)
      shellLog.warn({
        code: 'ERR_WORKBENCH_DB',
        message: 'workbench database was corrupt; the original file was backed up and an empty database rebuilt',
        data: { backupPath, dbPath },
      })
      return { db, path: dbPath, recovery: { backupPath } }
    } catch (rebuildError) {
      throw new WorkbenchDbError(
        `workbench database was corrupt and the rebuilt database failed to initialize (${errorMessage(rebuildError)})`,
        { backupPath, dbPath },
      )
    }
  }
}
