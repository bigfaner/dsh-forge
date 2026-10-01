import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, WorkbenchDbError, type DatabaseSyncLike, type SqliteModuleLike } from '../src/main/workbench/store/db.ts'
import { LATEST_SCHEMA_VERSION, readSchemaVersion } from '../src/main/workbench/store/migrate.ts'
import { SCHEMA_V1_SQL } from '../src/main/workbench/store/schema-v1.ts'
import { SCHEMA_V2_SQL } from '../src/main/workbench/store/schema-v2.ts'
import { SCHEMA_V3_SQL } from '../src/main/workbench/store/schema-v3.ts'

// Task 2.1 — SQLite store foundation (node:sqlite, <userData>/workbench/
// workbench.db). Boot probe failure must surface as structured
// ERR_WORKBENCH_DB (no silent no-database degradation); a corrupt database is
// backed up and rebuilt empty with the backup path reported. Design:
// docs/features/dsh-forge-m2/design/tech-design.md (§Data Models, §Error
// Types & Codes) + design/schema.sql (v1 DDL projection).
//
// Task 1.1 (M3) — schema v2 incremental migration (only-add): 2 ALTER groups
// (projects / feature_snapshot) + 7 new tables + the v2 indexes from
// docs/features/dsh-forge-m3/design/schema.sql, carried by the inline
// SCHEMA_V2_SQL constant and drift-guarded against that design file.
//
// Task 1.1 (M4) — schema v3 incremental migration (only-add): projects
// ALTER ×10 (D11 identity / archived / sort_order / docs_placement /
// projection_state) + 2 new tables (project_ui_state / workspace_projection)
// + 2 indexes from docs/features/dsh-forge-m4/design/schema.sql, carried by
// the inline SCHEMA_V3_SQL constant (drift-guarded) with the in-transaction
// TS backfill of the new columns for existing rows.

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-workbench-store-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

function dbPathOf(userData: string): string {
  return join(userData, 'workbench', 'workbench.db')
}

interface NameRow { readonly name: string }

function queryNames(db: DatabaseSyncLike, type: 'table' | 'index'): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all(type) as NameRow[]
  return rows.map(row => row.name)
}

const DOMAIN_TABLES = [
  'app_state',
  'feature_snapshot',
  'projects',
  'session_links',
  'sync_state',
  'task_snapshot',
] as const

const V2_TABLES = [
  'approval_request',
  'dispatch',
  'migration_event',
  'prefs',
  'proposal_snapshot',
  'stage_asset',
  'task',
] as const

const V1_INDEXES = [
  'idx_feature_snapshot_updated',
  'idx_session_links_project',
  'idx_session_links_task',
  'idx_task_snapshot_feature',
  'idx_task_snapshot_status',
] as const

// The design (docs/features/dsh-forge-m3/design/schema.sql) declares 6 v2
// indexes — the task prose's "5 索引" undercounts; the DDL is authoritative.
const V2_INDEXES = [
  'idx_approval_state',
  'idx_dispatch_batch',
  'idx_dispatch_project',
  'idx_migration_project',
  'idx_task_feature',
  'idx_task_status',
] as const

const V3_TABLES = [
  'project_ui_state',
  'workspace_projection',
] as const

const V3_INDEXES = [
  'idx_projects_code_root_key',
  'idx_projects_sort_order',
] as const

function insertProject(db: DatabaseSyncLike, id: string, docLocationType: string, docLocationPath?: string): void {
  db.prepare(
    'INSERT INTO projects (id, display_name, code_root, doc_location_type, doc_location_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, `project-${id}`, `C:\\repo\\${id}`, docLocationType, docLocationPath ?? null, '2026-09-22T00:00:00.000Z')
}

const TS = '2026-09-23T00:00:00.000Z'

/** Extract the executable statements from a schema text: comments (full-line
 * and trailing) stripped per line BEFORE the ';' split — Chinese comments may
 * contain semicolons — then whitespace normalized. This is the unit compared
 * by the v2 drift guard (v1 precedent: exact-string guard against
 * schema-v1.sql; the design file carries a design header, hence per-statement
 * comparison here). No v2 string literal contains ';' or '--'. */
function sqlStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .map(line => line.replace(/--.*$/, '').trim())
    .filter(line => line !== '')
    .join('\n')
    .split(';')
    .map(statement => statement.replace(/\s+/g, ' ').trim())
    .filter(statement => statement !== '')
}

interface ColumnRow { readonly name: string }

function columnNames(db: DatabaseSyncLike, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnRow[]
  return rows.map(row => row.name)
}

/** Build a genuine v1 database on disk (as left behind by the M2 shell): full
 * v1 DDL, schema_version pinned to 1, optional seeded rows. Used by the
 * v1→v2 upgrade-path tests. */
async function makeV1Database(userData: string, seed?: (db: DatabaseSyncLike) => void): Promise<string> {
  const dbPath = dbPathOf(userData)
  mkdirSync(join(userData, 'workbench'), { recursive: true })
  const { DatabaseSync } = await import('node:sqlite')
  const raw: DatabaseSyncLike = new DatabaseSync(dbPath)
  try {
    raw.exec(SCHEMA_V1_SQL)
    raw.exec('DELETE FROM schema_version')
    raw.exec('INSERT INTO schema_version (version) VALUES (1)')
    seed?.(raw)
  } finally {
    raw.close()
  }
  return dbPath
}

describe('openDatabase — fresh create (AC1, AC2)', () => {
  it('creates <userData>/workbench/workbench.db with WAL + foreign_keys in effect', async () => {
    const userData = makeScratch()
    const { db, path } = await openDatabase(userData)
    try {
      expect(path).toBe(dbPathOf(userData))
      expect(existsSync(path)).toBe(true)
      expect(db.prepare('PRAGMA journal_mode').get()).toMatchObject({ journal_mode: 'wal' })
      expect(db.prepare('PRAGMA foreign_keys').get()).toMatchObject({ foreign_keys: 1 })
    } finally {
      db.close()
    }
  })

  it('executes the full DDL (v1 + v2 + v3): 15 domain tables + schema_version, all indexes', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      const tables = queryNames(db, 'table')
      expect(tables).toEqual([...DOMAIN_TABLES, ...V2_TABLES, ...V3_TABLES, 'schema_version'].slice().sort())
      const indexes = queryNames(db, 'index')
      expect(indexes).toEqual([...V1_INDEXES, ...V2_INDEXES, ...V3_INDEXES].slice().sort())
    } finally {
      db.close()
    }
  })

  it('schema-v1.ts inline constant mirrors store/schema-v1.sql (projection drift guard)', () => {
    const sqlFile = readFileSync(new URL('../src/main/workbench/store/schema-v1.sql', import.meta.url), 'utf8')
    expect(SCHEMA_V1_SQL.trim()).toBe(sqlFile.trim())
  })
})

describe('schema_version migrator (AC3)', () => {
  it('writes the latest known version as a single row on first create', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      expect(readSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
      expect(db.prepare('SELECT COUNT(*) AS c FROM schema_version').get()).toMatchObject({ c: 1 })
    } finally {
      db.close()
    }
  })

  it('repeated start is a no-op: version stays at the latest, single row, existing data survives', async () => {
    const userData = makeScratch()
    const first = await openDatabase(userData)
    insertProject(first.db, 'p1', 'in_repo')
    first.db.close()
    const second = await openDatabase(userData)
    try {
      expect(readSchemaVersion(second.db)).toBe(LATEST_SCHEMA_VERSION)
      expect(second.db.prepare('SELECT COUNT(*) AS c FROM schema_version').get()).toMatchObject({ c: 1 })
      expect(second.db.prepare('SELECT COUNT(*) AS c FROM projects').get()).toMatchObject({ c: 1 })
      expect(second.recovery).toBeUndefined()
    } finally {
      second.db.close()
    }
  })

  it('refuses a database from a newer schema (version stays monotonic, file untouched)', async () => {
    const userData = makeScratch()
    const first = await openDatabase(userData)
    first.db.close()
    const { DatabaseSync } = await import('node:sqlite')
    const raw = new DatabaseSync(dbPathOf(userData))
    raw.prepare('UPDATE schema_version SET version = ?').run(LATEST_SCHEMA_VERSION + 1)
    raw.close()

    let caught: unknown
    try {
      await openDatabase(userData)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(WorkbenchDbError)
    expect((caught as WorkbenchDbError).code).toBe('ERR_WORKBENCH_DB')
    expect((caught as WorkbenchDbError).message).toMatch(/newer/)

    // Non-corruption failure must never wipe user data: no backup taken, version intact.
    const strayBackups = readdirSync(join(userData, 'workbench')).filter(name => name.includes('.corrupt-'))
    expect(strayBackups).toEqual([])
    const verify = new DatabaseSync(dbPathOf(userData))
    try {
      expect(verify.prepare('SELECT MAX(version) AS v FROM schema_version').get()).toMatchObject({ v: LATEST_SCHEMA_VERSION + 1 })
    } finally {
      verify.close()
    }
  })
})

describe('row-level CHECK + FK enforcement (AC2)', () => {
  it('rejects projects rows that violate the doc-location row CHECK / column CHECK', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'ok-in-repo', 'in_repo')
      insertProject(db, 'ok-external', 'external', 'C:\\docs\\elsewhere')
      expect(() => insertProject(db, 'bad-in-repo-with-path', 'in_repo', 'C:\\docs\\x')).toThrow(/constraint/i)
      expect(() => insertProject(db, 'bad-external-no-path', 'external')).toThrow(/constraint/i)
      expect(() => insertProject(db, 'bad-type', 'somewhere_else')).toThrow(/constraint/i)
      expect(db.prepare('SELECT COUNT(*) AS c FROM projects').get()).toMatchObject({ c: 2 })
    } finally {
      db.close()
    }
  })

  it('rejects task_snapshot rows outside the 7-state status vocabulary', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'p1', 'in_repo')
      const insert = (status: string): void => {
        db.prepare(
          'INSERT INTO task_snapshot (project_id, task_key, feature_slug, title, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run('p1', '2.1', 'dsh-forge-m2', 'store foundation', status, '2026-09-22T00:00:00.000Z')
      }
      insert('in_progress')
      expect(() => insert('bogus')).toThrow(/constraint/i)
      expect(db.prepare('SELECT COUNT(*) AS c FROM task_snapshot').get()).toMatchObject({ c: 1 })
    } finally {
      db.close()
    }
  })

  it('enforces FK integrity and the session_links uniqueness contract', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'p1', 'in_repo')
      const insertLink = (projectId: string, sessionId: string): void => {
        db.prepare(
          'INSERT INTO session_links (id, project_id, task_key, session_id, started_at) VALUES (?, ?, ?, ?, ?)',
        ).run(`link-${sessionId}`, projectId, '2.1', sessionId, '2026-09-22T00:00:00.000Z')
      }
      insertLink('p1', 'session-a')
      // FK: referenced project does not exist.
      expect(() => insertLink('no-such-project', 'session-b')).toThrow(/constraint/i)
      // UNIQUE (project_id, task_key, session_id).
      expect(() => insertLink('p1', 'session-a')).toThrow(/constraint/i)
      expect(db.prepare('SELECT COUNT(*) AS c FROM session_links').get()).toMatchObject({ c: 1 })
    } finally {
      db.close()
    }
  })
})

describe('boot probe failure — structured ERR_WORKBENCH_DB (AC4)', () => {
  it('module load failure rejects with a structured ERR_WORKBENCH_DB and touches no filesystem state', async () => {
    const userData = makeScratch()
    let caught: unknown
    try {
      await openDatabase(userData, {
        loadSqliteModule: async () => {
          throw new Error('No such built-in module: node:sqlite')
        },
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(WorkbenchDbError)
    const workbenchError = caught as WorkbenchDbError
    expect(workbenchError.code).toBe('ERR_WORKBENCH_DB')
    expect(workbenchError.message).toMatch(/probe/)
    // Probe runs before any filesystem work: no half-created database state.
    expect(existsSync(join(userData, 'workbench'))).toBe(false)
  })

  it('trial-open failure rejects with a structured ERR_WORKBENCH_DB', async () => {
    let caught: unknown
    try {
      await openDatabase(makeScratch(), {
        // The mock only implements the constructor — the trial open throws
        // before any connection member is used, hence the double cast.
        loadSqliteModule: async () =>
          ({
            DatabaseSync: class {
              constructor(_location: string) {
                throw new Error('simulated: opening the database failed')
              }
            },
          }) as unknown as SqliteModuleLike,
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(WorkbenchDbError)
    expect((caught as WorkbenchDbError).code).toBe('ERR_WORKBENCH_DB')
  })

  it('an unwritable db location (open failure) rejects with a structured ERR_WORKBENCH_DB', async () => {
    const userData = makeScratch()
    // `workbench` exists as a plain file: the db path cannot be created/opened.
    writeFileSync(join(userData, 'workbench'), 'not a directory')
    let caught: unknown
    try {
      await openDatabase(userData)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(WorkbenchDbError)
    expect((caught as WorkbenchDbError).code).toBe('ERR_WORKBENCH_DB')
  })
})

describe('corrupt database recovery — backup then rebuild (AC5)', () => {
  it('backs up the corrupt file (plus stale -wal), rebuilds an empty usable db, reports the backup path', async () => {
    const userData = makeScratch()
    const dbPath = dbPathOf(userData)
    mkdirSync(join(userData, 'workbench'), { recursive: true })
    const garbage = 'definitely not a sqlite database — garbage payload'
    writeFileSync(dbPath, garbage)
    // A stale WAL sibling must be carried away with the backup, or SQLite would
    // try to recover it on top of the rebuilt database.
    writeFileSync(`${dbPath}-wal`, 'stale write-ahead-log garbage')

    const { db, recovery } = await openDatabase(userData)
    try {
      expect(recovery?.backupPath).toMatch(/workbench\.db\.corrupt-/)
      expect(existsSync(recovery?.backupPath ?? '')).toBe(true)
      expect(readFileSync(recovery?.backupPath ?? '', 'utf8')).toBe(garbage)
      // Live location is a fresh, migrated, usable database.
      expect(readSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
      expect(queryNames(db, 'table')).toContain('projects')
      // The stale WAL never survives at a live path: SQLite discards an
      // invalid WAL during the failed open, and whatever remains is carried
      // into the backup by the recovery path. If a -wal traveled with the
      // backup it must hold the stale garbage; the live -wal (a fresh WAL of
      // the rebuilt connection, or absent after checkpoint) never does.
      const backupWal = `${recovery?.backupPath ?? ''}-wal`
      if (existsSync(backupWal)) expect(readFileSync(backupWal, 'utf8')).toBe('stale write-ahead-log garbage')
      const liveWal = `${dbPath}-wal`
      expect(!existsSync(liveWal) || readFileSync(liveWal, 'utf8') !== 'stale write-ahead-log garbage').toBe(true)
    } finally {
      db.close()
    }
  })
})

describe('v2 incremental migration (task 1.1)', () => {
  it('applies the v2 segment on fresh create: both ALTER groups add columns with the designed defaults (AC1, AC5)', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      // ALTER group 1: projects gains the authority/migration columns; every
      // v1 column survives (only-add).
      expect(columnNames(db, 'projects')).toEqual(
        expect.arrayContaining(['id', 'display_name', 'code_root', 'doc_location_type', 'doc_location_path', 'created_at', 'last_activated_at', 'data_authority', 'deviated', 'migrated_at', 'backup_path']),
      )
      // ALTER group 2: feature_snapshot gains the deviation columns.
      expect(columnNames(db, 'feature_snapshot')).toEqual(
        expect.arrayContaining(['project_id', 'feature_slug', 'status', 'doc_kinds', 'task_total', 'task_completed', 'updated_at', 'deviated', 'last_external_at']),
      )
      // A v1-shaped insert (no new columns) still works and picks up defaults.
      insertProject(db, 'p1', 'in_repo')
      db.prepare(
        'INSERT INTO feature_snapshot (project_id, feature_slug, status, doc_kinds, task_total, task_completed, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run('p1', 'dsh-forge-m2', 'tasks', '[]', 3, 1, TS)
      expect(db.prepare('SELECT data_authority, deviated, migrated_at, backup_path FROM projects').get()).toEqual({
        data_authority: 'files', deviated: 0, migrated_at: null, backup_path: null,
      })
      expect(db.prepare('SELECT deviated, last_external_at FROM feature_snapshot').get()).toEqual({
        deviated: 0, last_external_at: null,
      })
    } finally {
      db.close()
    }
  })

  it('schema-v2.ts inline constant reconciles with design/schema.sql statement by statement (AC2, drift guard)', () => {
    const designSql = readFileSync(
      new URL('../../../docs/features/dsh-forge-m3/design/schema.sql', import.meta.url),
      'utf8',
    )
    const design = sqlStatements(designSql)
    // Anti-vacuous guard: the v2 segment is 6 ALTER + 7 CREATE TABLE +
    // 6 CREATE INDEX = 19 statements. A parser regression would otherwise
    // compare two empty arrays and pass.
    expect(design).toHaveLength(19)
    expect(sqlStatements(SCHEMA_V2_SQL)).toEqual(design)
  })

  it('upgrades a v1 database in place to v3 (walking v2 + v3): version bump, v1 rows verbatim, new columns default (AC3, AC5)', async () => {
    const userData = makeScratch()
    await makeV1Database(userData, (db) => {
      insertProject(db, 'p1', 'in_repo')
      db.prepare(
        'INSERT INTO task_snapshot (project_id, task_key, feature_slug, title, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('p1', '2.1', 'dsh-forge-m2', 'store foundation', 'completed', TS)
      db.prepare(
        'INSERT INTO feature_snapshot (project_id, feature_slug, status, doc_kinds, task_total, task_completed, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run('p1', 'dsh-forge-m2', 'completed', '["tasks"]', 6, 6, TS)
      db.prepare(
        'INSERT INTO session_links (id, project_id, task_key, session_id, started_at) VALUES (?, ?, ?, ?, ?)',
      ).run('link-1', 'p1', '2.1', 'session-a', TS)
      db.prepare("INSERT INTO app_state (key, value) VALUES ('active_project_id', '\"p1\"')").run()
    })

    const { db, recovery } = await openDatabase(userData)
    try {
      expect(recovery).toBeUndefined()
      expect(LATEST_SCHEMA_VERSION).toBe(3)
      expect(readSchemaVersion(db)).toBe(3)
      expect(db.prepare('SELECT COUNT(*) AS c FROM schema_version').get()).toMatchObject({ c: 1 })
      // v1 data verbatim — zero destruction:
      expect(db.prepare('SELECT COUNT(*) AS c FROM projects').get()).toMatchObject({ c: 1 })
      expect(db.prepare('SELECT task_key, feature_slug, title, status FROM task_snapshot').all()).toEqual([
        { task_key: '2.1', feature_slug: 'dsh-forge-m2', title: 'store foundation', status: 'completed' },
      ])
      expect(db.prepare('SELECT feature_slug, status, task_total, task_completed FROM feature_snapshot').all()).toEqual([
        { feature_slug: 'dsh-forge-m2', status: 'completed', task_total: 6, task_completed: 6 },
      ])
      expect(db.prepare('SELECT task_key, session_id, status FROM session_links').all()).toEqual([
        { task_key: '2.1', session_id: 'session-a', status: 'active' },
      ])
      expect(db.prepare('SELECT value FROM app_state').get()).toEqual({ value: '"p1"' })
      // The v2 ALTER columns materialized with their defaults:
      expect(db.prepare('SELECT data_authority, deviated FROM projects').get()).toEqual({ data_authority: 'files', deviated: 0 })
      expect(db.prepare('SELECT deviated FROM feature_snapshot').get()).toEqual({ deviated: 0 })
      // v2 objects all present on the upgraded library:
      expect(queryNames(db, 'table')).toEqual(expect.arrayContaining([...V2_TABLES]))
      expect(queryNames(db, 'index')).toEqual(expect.arrayContaining([...V2_INDEXES]))
    } finally {
      db.close()
    }
  })

  it('v2 segment is atomic: a mid-segment failure rolls back the ALTERs and leaves the v1 library untouched (AC1)', async () => {
    const userData = makeScratch()
    const dbPath = await makeV1Database(userData, (db) => {
      insertProject(db, 'p1', 'in_repo')
      // Name collision with the segment's CREATE TABLE task: the segment runs
      // its 6 ALTERs first, then dies here — everything must roll back with it.
      db.exec('CREATE TABLE task (sentinel INTEGER)')
    })

    let caught: unknown
    try {
      await openDatabase(userData)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(WorkbenchDbError)
    expect((caught as WorkbenchDbError).message).toMatch(/migrat/)

    const { DatabaseSync } = await import('node:sqlite')
    const verify = new DatabaseSync(dbPath)
    try {
      expect(verify.prepare('SELECT MAX(version) AS v FROM schema_version').get()).toMatchObject({ v: 1 })
      expect(verify.prepare('SELECT COUNT(*) AS c FROM schema_version').get()).toMatchObject({ c: 1 })
      // The ALTERs that had already run inside the segment were rolled back
      // with it — no half-migration state:
      expect(columnNames(verify, 'projects')).not.toContain('data_authority')
      expect(verify.prepare('SELECT COUNT(*) AS c FROM projects').get()).toMatchObject({ c: 1 })
      // Not corruption: no backup was taken, the file was left as-is.
      expect(readdirSync(join(userData, 'workbench')).filter(name => name.includes('.corrupt-'))).toEqual([])
    } finally {
      verify.close()
    }
  })

  it('reopening an upgraded database is a no-op (AC3, idempotent re-run)', async () => {
    const userData = makeScratch()
    await makeV1Database(userData, db => insertProject(db, 'p1', 'in_repo'))
    const first = await openDatabase(userData)
    expect(readSchemaVersion(first.db)).toBe(3)
    first.db.prepare(
      'INSERT INTO prefs (scope, scope_id, key, value_json, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run('global', '', 'auto.dispatch', '{"mode":"batch"}', TS)
    first.db.close()

    const second = await openDatabase(userData)
    try {
      expect(readSchemaVersion(second.db)).toBe(3)
      expect(second.db.prepare('SELECT COUNT(*) AS c FROM schema_version').get()).toMatchObject({ c: 1 })
      expect(second.db.prepare("SELECT value_json FROM prefs WHERE scope = 'global' AND scope_id = '' AND key = 'auto.dispatch'").get())
        .toEqual({ value_json: '{"mode":"batch"}' })
      expect(second.db.prepare('SELECT COUNT(*) AS c FROM projects').get()).toMatchObject({ c: 1 })
      expect(second.recovery).toBeUndefined()
    } finally {
      second.db.close()
    }
  })
})

describe('v2 row-level CHECK vocabularies (task 1.1, AC4)', () => {
  it('task.status accepts the 7 states and rejects anything else', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'p1', 'in_repo')
      let seq = 0
      const insert = (status: string): void => {
        seq += 1
        db.prepare(
          'INSERT INTO task (project_id, task_key, feature_slug, title, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run('p1', `feat/${String(seq)}`, 'feat', 't', status, TS)
      }
      for (const status of ['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected']) insert(status)
      expect(() => insert('bogus')).toThrow(/constraint/i)
      expect(db.prepare('SELECT COUNT(*) AS c FROM task').get()).toMatchObject({ c: 7 })
    } finally {
      db.close()
    }
  })

  it('dispatch.state accepts the 5 states and rejects anything else', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'p1', 'in_repo')
      const insert = (id: string, state: string): void => {
        db.prepare(
          'INSERT INTO dispatch (id, batch_id, project_id, feature_slug, task_key, state, prompt_hash, actor, dispatched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(id, `batch-${id}`, 'p1', 'feat', 'feat/1.1', state, 'sha256', 'human', TS)
      }
      for (const state of ['starting', 'running', 'awaiting', 'failed', 'done']) insert(state, state)
      expect(() => insert('bogus', 'bogus')).toThrow(/constraint/i)
      expect(db.prepare('SELECT COUNT(*) AS c FROM dispatch').get()).toMatchObject({ c: 5 })
    } finally {
      db.close()
    }
  })

  it('approval_request.state accepts the 3 states (pending default) and rejects anything else', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'p1', 'in_repo')
      db.prepare(
        'INSERT INTO dispatch (id, batch_id, project_id, feature_slug, task_key, state, prompt_hash, actor, dispatched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run('d1', 'b1', 'p1', 'feat', 'feat/1.1', 'running', 'sha256', 'human', TS)
      // Default state = pending when the column is omitted:
      db.prepare(
        'INSERT INTO approval_request (id, dispatch_id, project_id, task_key, session_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run('a-default', 'd1', 'p1', 'feat/1.1', 'session-x', '{}', TS)
      const insert = (id: string, state: string): void => {
        db.prepare(
          'INSERT INTO approval_request (id, dispatch_id, project_id, task_key, session_id, payload_json, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(id, 'd1', 'p1', 'feat/1.1', 'session-x', '{}', state, TS)
      }
      insert('a-approved', 'approved')
      insert('a-rejected', 'rejected')
      expect(() => insert('a-bogus', 'maybe')).toThrow(/constraint/i)
      expect(db.prepare('SELECT COUNT(*) AS c FROM approval_request').get()).toMatchObject({ c: 3 })
      expect(db.prepare("SELECT state FROM approval_request WHERE id = 'a-default'").get()).toEqual({ state: 'pending' })
    } finally {
      db.close()
    }
  })

  it('prefs.scope accepts global/project/feature and rejects anything else', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      const insert = (scope: string): void => {
        db.prepare(
          'INSERT INTO prefs (scope, scope_id, key, value_json, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run(scope, '', 'auto.dispatch', '{}', TS)
      }
      insert('global')
      insert('project')
      insert('feature')
      expect(() => insert('user')).toThrow(/constraint/i)
      expect(db.prepare('SELECT COUNT(*) AS c FROM prefs').get()).toMatchObject({ c: 3 })
    } finally {
      db.close()
    }
  })

  it('stage_asset.stage accepts the 5 stages and rejects anything else', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'p1', 'in_repo')
      const insert = (stage: string): void => {
        db.prepare('INSERT INTO stage_asset (project_id, feature_slug, stage, path) VALUES (?, ?, ?, ?)')
          .run('p1', 'feat', stage, `features/feat/stages/${stage}.md`)
      }
      for (const stage of ['prd', 'design', 'tasks', 'in-progress', 'completed']) insert(stage)
      expect(() => insert('frozen')).toThrow(/constraint/i)
      expect(db.prepare('SELECT COUNT(*) AS c FROM stage_asset').get()).toMatchObject({ c: 5 })
    } finally {
      db.close()
    }
  })

  it('proposal_snapshot.status accepts the 4 states and rejects anything else', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'p1', 'in_repo')
      const insert = (slug: string, status: string): void => {
        db.prepare('INSERT INTO proposal_snapshot (project_id, slug, status, updated_at) VALUES (?, ?, ?, ?)')
          .run('p1', slug, status, TS)
      }
      for (const status of ['draft', 'accepted', 'rejected', 'superseded']) insert(status, status)
      expect(() => insert('bogus', 'bogus')).toThrow(/constraint/i)
      expect(db.prepare('SELECT COUNT(*) AS c FROM proposal_snapshot').get()).toMatchObject({ c: 4 })
    } finally {
      db.close()
    }
  })

  it('migration_event.phase/result accept their vocabularies and reject anything else', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'p1', 'in_repo')
      const insert = (id: string, phase: string, result: string): void => {
        db.prepare('INSERT INTO migration_event (id, project_id, phase, result, at) VALUES (?, ?, ?, ?, ?)')
          .run(id, 'p1', phase, result, TS)
      }
      for (const [index, phase] of ['backup', 'ingest', 'verify', 'switch', 'archive', 'rollback', 'reingest'].entries()) {
        insert(`e-${String(index)}`, phase, 'ok')
      }
      insert('e-fail', 'ingest', 'fail')
      expect(() => insert('e-bad-phase', 'restore', 'ok')).toThrow(/constraint/i)
      expect(() => insert('e-bad-result', 'backup', 'partial')).toThrow(/constraint/i)
      expect(db.prepare('SELECT COUNT(*) AS c FROM migration_event').get()).toMatchObject({ c: 8 })
    } finally {
      db.close()
    }
  })

  it('enforces v2 FK integrity (task → projects, approval_request → dispatch/projects)', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'p1', 'in_repo')
      // Valid chain resolves: project → dispatch → approval_request.
      db.prepare(
        'INSERT INTO dispatch (id, batch_id, project_id, feature_slug, task_key, state, prompt_hash, actor, dispatched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run('d1', 'b1', 'p1', 'feat', 'feat/1.1', 'running', 'sha256', 'human', TS)
      db.prepare(
        'INSERT INTO approval_request (id, dispatch_id, project_id, task_key, session_id, payload_json, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run('a1', 'd1', 'p1', 'feat/1.1', 'session-x', '{}', 'pending', TS)
      // Dangling parents are rejected.
      expect(() => db.prepare(
        'INSERT INTO task (project_id, task_key, feature_slug, title, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('no-such-project', 'feat/9', 'feat', 't', 'pending', TS)).toThrow(/constraint/i)
      expect(() => db.prepare(
        'INSERT INTO approval_request (id, dispatch_id, project_id, task_key, session_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run('a2', 'no-such-dispatch', 'p1', 'feat/1.2', 'session-y', '{}', TS)).toThrow(/constraint/i)
      expect(db.prepare('SELECT COUNT(*) AS c FROM approval_request').get()).toMatchObject({ c: 1 })
    } finally {
      db.close()
    }
  })
})

describe('v3 incremental migration (task 1.1)', () => {
  /** v2 库 fixture(M3 壳遗留):full v1+v2 DDL,schema_version = 2,可选种子行。 */
  async function makeV2Database(userData: string, seed?: (db: DatabaseSyncLike) => void): Promise<string> {
    const dbPath = dbPathOf(userData)
    mkdirSync(join(userData, 'workbench'), { recursive: true })
    const { DatabaseSync } = await import('node:sqlite')
    const raw: DatabaseSyncLike = new DatabaseSync(dbPath)
    try {
      raw.exec(SCHEMA_V1_SQL)
      raw.exec(SCHEMA_V2_SQL)
      raw.exec('DELETE FROM schema_version')
      raw.exec('INSERT INTO schema_version (version) VALUES (2)')
      seed?.(raw)
    } finally {
      raw.close()
    }
    return dbPath
  }

  /** 平台折叠口径(与 migrate.ts 回填一致:win32 大写折叠,其他平台原样)。 */
  const fold = (path: string): string => (process.platform === 'win32' ? path.toUpperCase() : path)

  interface SeedProjectInput {
    readonly id: string
    readonly codeRoot: string
    readonly type: 'in_repo' | 'external'
    readonly docPath?: string
    readonly createdAt: string
  }

  /** Raw v1 方言 insert(绕过 repos 注册链:回填测试只关心已存在的行)。 */
  function insertSeedProject(db: DatabaseSyncLike, input: SeedProjectInput): void {
    db.prepare(
      'INSERT INTO projects (id, display_name, code_root, doc_location_type, doc_location_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(input.id, input.id, input.codeRoot, input.type, input.docPath ?? null, input.createdAt)
  }

  it('applies the v3 segment on fresh create: 10 new projects columns + 2 new tables + 2 indexes; a v1-shaped insert picks up the designed defaults (AC1, AC5)', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      expect(queryNames(db, 'table')).toEqual(expect.arrayContaining([...V3_TABLES]))
      expect(queryNames(db, 'index')).toEqual(expect.arrayContaining([...V3_INDEXES]))
      expect(columnNames(db, 'projects')).toEqual(
        expect.arrayContaining([
          'code_root_key', 'identity_dev', 'identity_ino', 'identity_verified',
          'archived', 'sort_order', 'docs_placement', 'custom_authorized',
          'projection_state', 'workspace_id',
        ]),
      )
      insertProject(db, 'p1', 'in_repo')
      expect(db.prepare(
        'SELECT code_root_key, identity_dev, identity_ino, identity_verified, archived, sort_order, docs_placement, custom_authorized, projection_state, workspace_id FROM projects',
      ).get()).toEqual({
        code_root_key: null, identity_dev: null, identity_ino: null, identity_verified: 1,
        archived: 0, sort_order: 0, docs_placement: 'legacy', custom_authorized: 0,
        projection_state: 'pending', workspace_id: null,
      })
    } finally {
      db.close()
    }
  })

  it('schema-v3.ts inline constant reconciles with the m4 design/schema.sql statement by statement (drift guard)', () => {
    const designSql = readFileSync(
      new URL('../../../docs/features/dsh-forge-m4/design/schema.sql', import.meta.url),
      'utf8',
    )
    const design = sqlStatements(designSql)
    // Anti-vacuous guard: the v3 segment is 10 ALTER + 2 CREATE TABLE +
    // 2 CREATE INDEX = 14 statements.
    expect(design).toHaveLength(14)
    expect(sqlStatements(SCHEMA_V3_SQL)).toEqual(design)
  })

  it('upgrades a v2 database in place to v3 with the in-transaction backfill matrix, then reruns as a no-op (AC2, AC3, AC5)', async () => {
    const userData = makeScratch()
    const repoScratch = makeScratch()
    const realRepo = join(repoScratch, 'repo-alpha')
    mkdirSync(realRepo, { recursive: true })
    const realRepoKey = fold(realpathSync.native(realRepo).replaceAll('\\', '/'))
    const docsRoot = join(userData, 'workbench', 'docs')
    const customDocPath = join(repoScratch, 'forge-docs').replaceAll('\\', '/')
    await makeV2Database(userData, (db) => {
      // created_at 升序 = 期望的 sort_order 注册序(0..3)。
      insertSeedProject(db, { id: 'p-offline', codeRoot: 'C:/repos/gone-project', type: 'in_repo', createdAt: '2026-09-20T00:00:00.000Z' })
      insertSeedProject(db, { id: 'p-inrepo', codeRoot: realRepo.replaceAll('\\', '/'), type: 'in_repo', createdAt: '2026-09-21T00:00:00.000Z' })
      insertSeedProject(db, {
        id: 'p-app', codeRoot: 'C:/code/app-hosted', type: 'external',
        docPath: join(docsRoot, 'app-hosted').replaceAll('\\', '/'), createdAt: '2026-09-22T00:00:00.000Z',
      })
      insertSeedProject(db, {
        id: 'p-custom', codeRoot: 'C:/code/custom-project', type: 'external',
        docPath: customDocPath, createdAt: '2026-09-23T00:00:00.000Z',
      })
      // 授权在案(registry/authorize.ts 的 app_state 保留键,原样形态)。
      db.prepare('INSERT INTO app_state (key, value) VALUES (?, ?)').run(
        'external_doc_authorizations',
        JSON.stringify([{ path: customDocPath, authorizedAt: '2026-09-23T00:00:00.000Z' }]),
      )
      // v2 自有数据(零破坏断言用)。
      db.prepare(
        'INSERT INTO task (project_id, task_key, feature_slug, title, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('p-custom', 'feat/1.1', 'feat', 'v2 task row', 'completed', TS)
      db.prepare(
        'INSERT INTO prefs (scope, scope_id, key, value_json, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run('project', 'p-inrepo', 'auto.dispatch', '{"mode":"batch"}', TS)
    })

    const { db, recovery } = await openDatabase(userData)
    try {
      expect(recovery).toBeUndefined()
      expect(LATEST_SCHEMA_VERSION).toBe(3)
      expect(readSchemaVersion(db)).toBe(3)
      expect(db.prepare('SELECT COUNT(*) AS c FROM schema_version').get()).toMatchObject({ c: 1 })

      // —— 回填矩阵 ——
      interface V3Row {
        readonly id: string
        readonly code_root_key: string | null
        readonly identity_dev: string | null
        readonly identity_ino: string | null
        readonly identity_verified: number
        readonly docs_placement: string
        readonly custom_authorized: number
        readonly sort_order: number
        readonly projection_state: string
        readonly archived: number
        readonly workspace_id: string | null
      }
      const rows = db.prepare(
        'SELECT id, code_root_key, identity_dev, identity_ino, identity_verified, docs_placement, custom_authorized, sort_order, projection_state, archived, workspace_id FROM projects',
      ).all() as V3Row[]
      const byId = new Map(rows.map(row => [row.id, row]))
      // realpath 失败(路径已不存在)→ 字符串回退 + identity_verified=0,物理位留空。
      expect(byId.get('p-offline')).toMatchObject({
        code_root_key: fold('C:/repos/gone-project'), identity_dev: null, identity_ino: null,
        identity_verified: 0, docs_placement: 'repo-existing', custom_authorized: 0,
        sort_order: 0, projection_state: 'pending', archived: 0, workspace_id: null,
      })
      // realpath 成功 → 折叠比较键 + (dev,ino) 物理位 + verified=1。
      expect(byId.get('p-inrepo')).toMatchObject({
        code_root_key: realRepoKey, identity_verified: 1, docs_placement: 'repo-existing',
        custom_authorized: 0, sort_order: 1, projection_state: 'pending',
      })
      expect(byId.get('p-inrepo')?.identity_dev).toEqual(expect.any(String))
      expect(byId.get('p-inrepo')?.identity_ino).toEqual(expect.any(String))
      // external 位于内核 docsRoot 之下 → 'app'(无需仓外授权位)。
      expect(byId.get('p-app')).toMatchObject({
        docs_placement: 'app', custom_authorized: 0, sort_order: 2, projection_state: 'pending',
      })
      // external 他处 + 授权在案 → 'custom' + custom_authorized=1。
      expect(byId.get('p-custom')).toMatchObject({
        docs_placement: 'custom', custom_authorized: 1, sort_order: 3, projection_state: 'pending',
      })
      // 回填只读:app 管理文档根未被置备(置备属注册/重指向动词)。
      expect(existsSync(docsRoot)).toBe(false)

      // —— v1/v2 数据零破坏 ——
      expect(db.prepare('SELECT COUNT(*) AS c FROM projects').get()).toMatchObject({ c: 4 })
      expect(db.prepare('SELECT task_key, feature_slug, title, status FROM task').all()).toEqual([
        { task_key: 'feat/1.1', feature_slug: 'feat', title: 'v2 task row', status: 'completed' },
      ])
      expect(db.prepare("SELECT value_json FROM prefs WHERE scope = 'project' AND scope_id = 'p-inrepo' AND key = 'auto.dispatch'").get())
        .toEqual({ value_json: '{"mode":"batch"}' })
      expect(db.prepare('SELECT COUNT(*) AS c FROM app_state').get()).toMatchObject({ c: 1 })
    } finally {
      db.close()
    }

    // 幂等重跑:升级后再开库 = no-op(版本不退、行数不变、回填值稳定)。
    const second = await openDatabase(userData)
    try {
      expect(second.recovery).toBeUndefined()
      expect(readSchemaVersion(second.db)).toBe(3)
      expect(second.db.prepare('SELECT COUNT(*) AS c FROM schema_version').get()).toMatchObject({ c: 1 })
      expect(second.db.prepare('SELECT COUNT(*) AS c FROM projects').get()).toMatchObject({ c: 4 })
      expect(second.db.prepare("SELECT code_root_key, identity_verified FROM projects WHERE id = 'p-inrepo'").get())
        .toEqual({ code_root_key: realRepoKey, identity_verified: 1 })
    } finally {
      second.db.close()
    }
  })

  it('a folded code_root_key collision fails the migration explicitly (AC2: 折叠键碰撞 = 迁移失败显式暴露)', async () => {
    const userData = makeScratch()
    const dbPath = await makeV2Database(userData, (db) => {
      // v1 UNIQUE(code_root) 大小写敏感:两行存储值不同,win32 折叠后同键。
      insertSeedProject(db, { id: 'p-a', codeRoot: 'C:/repos/alpha', type: 'in_repo', createdAt: TS })
      insertSeedProject(db, { id: 'p-b', codeRoot: 'c:/repos/ALPHA', type: 'in_repo', createdAt: TS })
    })

    let caught: unknown
    try {
      await openDatabase(userData)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(WorkbenchDbError)
    expect((caught as WorkbenchDbError).message).toMatch(/migrat/)

    const { DatabaseSync } = await import('node:sqlite')
    const verify = new DatabaseSync(dbPath)
    try {
      // 整段回滚:版本停在 2,v3 增列未落地,库文件原样(非损坏,无备份)。
      expect(verify.prepare('SELECT MAX(version) AS v FROM schema_version').get()).toMatchObject({ v: 2 })
      expect(verify.prepare('SELECT COUNT(*) AS c FROM schema_version').get()).toMatchObject({ c: 1 })
      expect(columnNames(verify, 'projects')).not.toContain('code_root_key')
      expect(verify.prepare('SELECT COUNT(*) AS c FROM projects').get()).toMatchObject({ c: 2 })
      expect(readdirSync(join(userData, 'workbench')).filter(name => name.includes('.corrupt-'))).toEqual([])
    } finally {
      verify.close()
    }
  })

  it('v3 segment is atomic: a mid-segment failure rolls back the ALTERs and leaves the v2 library untouched (AC1)', async () => {
    const userData = makeScratch()
    const dbPath = await makeV2Database(userData, (db) => {
      insertSeedProject(db, { id: 'p1', codeRoot: 'C:/repos/alpha', type: 'in_repo', createdAt: TS })
      // 与段内 CREATE TABLE project_ui_state 撞名:10 条 ALTER 已跑,死在这里
      // —— 整段必须随之回滚,不留半迁移态。
      db.exec('CREATE TABLE project_ui_state (sentinel INTEGER)')
    })

    let caught: unknown
    try {
      await openDatabase(userData)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(WorkbenchDbError)
    expect((caught as WorkbenchDbError).message).toMatch(/migrat/)

    const { DatabaseSync } = await import('node:sqlite')
    const verify = new DatabaseSync(dbPath)
    try {
      expect(verify.prepare('SELECT MAX(version) AS v FROM schema_version').get()).toMatchObject({ v: 2 })
      expect(verify.prepare('SELECT COUNT(*) AS c FROM schema_version').get()).toMatchObject({ c: 1 })
      expect(columnNames(verify, 'projects')).not.toContain('code_root_key')
      expect(verify.prepare('SELECT COUNT(*) AS c FROM projects').get()).toMatchObject({ c: 1 })
      expect(readdirSync(join(userData, 'workbench')).filter(name => name.includes('.corrupt-'))).toEqual([])
    } finally {
      verify.close()
    }
  })

  it('idx_projects_code_root_key enforces fold-key uniqueness (AC1)', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'p1', 'in_repo')
      insertProject(db, 'p2', 'external', 'C:/docs/p2')
      const setKey = (id: string, key: string): void => {
        db.prepare('UPDATE projects SET code_root_key = ? WHERE id = ?').run(key, id)
      }
      setKey('p1', 'C:/REPOS/A')
      // UNIQUE 落比较键列:同键的第二行被拒。折叠本身是应用层单源(D11:不用
      // NOCASE —— 索引按存储值判重,写入面恒存折叠键;折叠碰撞在回填的
      // 迁移失败用例中显式暴露)。
      expect(() => setKey('p2', 'C:/REPOS/A')).toThrow(/constraint/i)
      setKey('p2', 'C:/REPOS/B')
      expect(db.prepare('SELECT COUNT(*) AS c FROM projects WHERE code_root_key IS NOT NULL').get()).toMatchObject({ c: 2 })
    } finally {
      db.close()
    }
  })

  it('v3 FK contracts: CASCADE clears both new tables on project delete; dangling parents rejected (AC1)', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'p1', 'in_repo')
      db.prepare('INSERT INTO project_ui_state (project_id, updated_at) VALUES (?, ?)').run('p1', TS)
      db.prepare(
        'INSERT INTO workspace_projection (project_id, workspace_id, path, title, order_idx, pushed_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('p1', 'ws-1', 'C:/code/p1', 'p1', 0, TS)
      // layout_json 落默认 '{}'。
      expect(db.prepare('SELECT layout_json FROM project_ui_state').get()).toEqual({ layout_json: '{}' })
      // FK:引用不存在的项目被拒(两张新表各一腿)。
      expect(() => db.prepare('INSERT INTO project_ui_state (project_id, updated_at) VALUES (?, ?)').run('no-such-project', TS)).toThrow(/constraint/i)
      expect(() => db.prepare(
        'INSERT INTO workspace_projection (project_id, workspace_id, path, title, order_idx, pushed_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('no-such-project', 'ws-2', 'C:/x', 'x', 0, TS)).toThrow(/constraint/i)
      // CASCADE:项目删除 → 两张 1:1 子表随之清除。
      db.prepare('DELETE FROM projects WHERE id = ?').run('p1')
      expect(db.prepare('SELECT COUNT(*) AS c FROM project_ui_state').get()).toMatchObject({ c: 0 })
      expect(db.prepare('SELECT COUNT(*) AS c FROM workspace_projection').get()).toMatchObject({ c: 0 })
    } finally {
      db.close()
    }
  })
})

describe('v3 row-level CHECK vocabularies (task 1.1, AC4)', () => {
  it('docs_placement accepts the 5 values and rejects anything else', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'p1', 'in_repo')
      const setPlacement = (value: string): void => {
        db.prepare('UPDATE projects SET docs_placement = ? WHERE id = ?').run(value, 'p1')
      }
      for (const value of ['repo-existing', 'repo-new', 'app', 'custom', 'legacy']) setPlacement(value)
      expect(() => setPlacement('inside-repo')).toThrow(/constraint/i)
      expect(db.prepare('SELECT docs_placement FROM projects').get()).toEqual({ docs_placement: 'legacy' })
    } finally {
      db.close()
    }
  })

  it('projection_state accepts the 4 values and rejects anything else', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      insertProject(db, 'p1', 'in_repo')
      const setState = (value: string): void => {
        db.prepare('UPDATE projects SET projection_state = ? WHERE id = ?').run(value, 'p1')
      }
      for (const value of ['pending', 'healthy', 'degraded', 'deviation']) setState(value)
      expect(() => setState('unknown')).toThrow(/constraint/i)
      expect(db.prepare('SELECT projection_state FROM projects').get()).toEqual({ projection_state: 'deviation' })
    } finally {
      db.close()
    }
  })
})
