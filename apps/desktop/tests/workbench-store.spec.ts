import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, WorkbenchDbError, type DatabaseSyncLike, type SqliteModuleLike } from '../src/main/workbench/store/db.ts'
import { LATEST_SCHEMA_VERSION, readSchemaVersion } from '../src/main/workbench/store/migrate.ts'
import { SCHEMA_V1_SQL } from '../src/main/workbench/store/schema-v1.ts'
import { SCHEMA_V2_SQL } from '../src/main/workbench/store/schema-v2.ts'

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

  it('executes the full DDL (v1 + v2): 13 domain tables + schema_version, all indexes', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      const tables = queryNames(db, 'table')
      expect(tables).toEqual([...DOMAIN_TABLES, ...V2_TABLES, 'schema_version'].slice().sort())
      const indexes = queryNames(db, 'index')
      expect(indexes).toEqual([...V1_INDEXES, ...V2_INDEXES].slice().sort())
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

  it('upgrades a v1 database in place to v2: version bump, v1 rows verbatim, new columns default (AC3, AC5)', async () => {
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
      expect(LATEST_SCHEMA_VERSION).toBe(2)
      expect(readSchemaVersion(db)).toBe(2)
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

  it('reopening an upgraded v2 database is a no-op (AC3, idempotent re-run)', async () => {
    const userData = makeScratch()
    await makeV1Database(userData, db => insertProject(db, 'p1', 'in_repo'))
    const first = await openDatabase(userData)
    expect(readSchemaVersion(first.db)).toBe(2)
    first.db.prepare(
      'INSERT INTO prefs (scope, scope_id, key, value_json, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run('global', '', 'auto.dispatch', '{"mode":"batch"}', TS)
    first.db.close()

    const second = await openDatabase(userData)
    try {
      expect(readSchemaVersion(second.db)).toBe(2)
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
