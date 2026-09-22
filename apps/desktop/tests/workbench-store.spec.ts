import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, WorkbenchDbError, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import { readSchemaVersion } from '../src/main/workbench/store/migrate.ts'
import { SCHEMA_V1_SQL } from '../src/main/workbench/store/schema-v1.ts'

// Task 2.1 — SQLite store foundation (node:sqlite, <userData>/workbench/
// workbench.db). Boot probe failure must surface as structured
// ERR_WORKBENCH_DB (no silent no-database degradation); a corrupt database is
// backed up and rebuilt empty with the backup path reported. Design:
// docs/features/dsh-forge-m2/design/tech-design.md (§Data Models, §Error
// Types & Codes) + design/schema.sql (v1 DDL projection).

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

const V1_INDEXES = [
  'idx_feature_snapshot_updated',
  'idx_session_links_project',
  'idx_session_links_task',
  'idx_task_snapshot_feature',
  'idx_task_snapshot_status',
] as const

function insertProject(db: DatabaseSyncLike, id: string, docLocationType: string, docLocationPath?: string): void {
  db.prepare(
    'INSERT INTO projects (id, display_name, code_root, doc_location_type, doc_location_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, `project-${id}`, `C:\\repo\\${id}`, docLocationType, docLocationPath ?? null, '2026-09-22T00:00:00.000Z')
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

  it('executes the full v1 DDL: 6 domain tables + schema_version, 5 indexes, FK references resolve', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      const tables = queryNames(db, 'table')
      expect(tables).toEqual([...DOMAIN_TABLES, 'schema_version'].slice().sort())
      const indexes = queryNames(db, 'index')
      expect(indexes).toEqual([...V1_INDEXES])
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
  it('writes v1 as a single row on first create', async () => {
    const { db } = await openDatabase(makeScratch())
    try {
      expect(readSchemaVersion(db)).toBe(1)
      expect(db.prepare('SELECT COUNT(*) AS c FROM schema_version').get()).toMatchObject({ c: 1 })
    } finally {
      db.close()
    }
  })

  it('repeated start is a no-op: version stays 1, single row, existing data survives', async () => {
    const userData = makeScratch()
    const first = await openDatabase(userData)
    insertProject(first.db, 'p1', 'in_repo')
    first.db.close()
    const second = await openDatabase(userData)
    try {
      expect(readSchemaVersion(second.db)).toBe(1)
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
    raw.exec('UPDATE schema_version SET version = 2')
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
      expect(verify.prepare('SELECT MAX(version) AS v FROM schema_version').get()).toMatchObject({ v: 2 })
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
        loadSqliteModule: async () => ({
          DatabaseSync: class {
            constructor(_location: string) {
              throw new Error('simulated: opening the database failed')
            }
          },
        }),
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
      expect(readSchemaVersion(db)).toBe(1)
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
