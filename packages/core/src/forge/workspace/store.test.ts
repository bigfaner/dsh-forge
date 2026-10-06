// 任务 1.2 测试 —— ForgeWorkspaceStore 惰性多句柄生命周期（AC2 惰性链 / AC3 库缺席补建 /
// AC4 失败隔离 / AC5 dispose + AC1 DDL·触发器·CHECK 行为面）。临时 SQLite 夹具（db.test.ts 形制）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { openDatabase } from '../../db/index.js'
import { isUnsupportedSchemaVersionError } from '../../db/index.js'
import { isWorkspaceDbUnavailableError, WorkspaceDbUnavailableError } from './errors.js'
import { FORGE_DB_SCHEMA_VERSION, WORKSPACE_MIGRATIONS } from './migrations.js'
import { createWorkspaceStore } from './store.js'

const NOW = '2026-10-06T00:00:00.000Z'

let dir: string
let seq = 0
// 每用例独占一个工作区目录（版本门/健全性负样例会种入异常库，共享路径会毒化后续用例）。
const wsDir = () =>
  join((dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-ws-'))), `ws-${String(++seq).padStart(3, '0')}`)

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** 以工作区迁移序列直开库（夹具种库用——不经 store，防循环依赖断言） */
function openWorkspaceDb(file: string): Database.Database {
  return openDatabase(file, { migrations: WORKSPACE_MIGRATIONS, schemaVersion: FORGE_DB_SCHEMA_VERSION })
}

/** 种入损坏库文件（目录先建——模拟磁盘在位但库文件非 SQLite 形态） */
function writeCorruptDb(ws: string): void {
  mkdirSync(ws, { recursive: true })
  writeFileSync(join(ws, 'forge.db'), Buffer.from('not a sqlite database at all'))
}

function seedFeature(db: Database.Database, id = 'f1'): void {
  db.prepare(
    `INSERT INTO features (id, slug, title, feature_status, created_at, updated_at) VALUES (?, ?, ?, 'prd', ?, ?)`,
  ).run(id, `demo-feature-${id}`, `特性 ${id}`, NOW, NOW)
}

function seedTask(db: Database.Database, taskId = 't1'): void {
  db.prepare(
    `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, feature_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 'f1', ?, ?)`,
  ).run(taskId, 'demo-feature-f1', '1.1', '任务一', 'coding.feature', NOW, NOW)
}

describe('AC1 全 DDL 在临时库执行零错（九表 + 六索引 + 双触发器 + FK/CHECK 负样例）', () => {
  it('首开空目录：九表全部在场（七域表 + schema_meta + app_key_logs）', () => {
    const store = createWorkspaceStore({ resolveDir: () => wsDir() })
    const db = store.ensureOpen('p1')
    const tables = db
      .prepare<unknown[], { name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all()
      .map((r) => r.name)
    expect(tables).toEqual([
      'app_key_logs',
      'feature_documents',
      'features',
      'proposals',
      'schema_meta',
      'task_edges',
      'task_records',
      'task_session_links',
      'tasks',
    ])
    store.dispose()
  })

  it('六索引全部创建（idx_* 前缀）', () => {
    const store = createWorkspaceStore({ resolveDir: () => wsDir() })
    const db = store.ensureOpen('p1')
    const indexes = db
      .prepare<unknown[], { name: string }>(
        `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name`,
      )
      .all()
      .map((r) => r.name)
    expect(indexes).toEqual([
      'idx_edges_prerequisite',
      'idx_records_session',
      'idx_records_task',
      'idx_tasks_feature_status',
      'idx_tasks_source',
      'idx_tsl_session',
    ])
    store.dispose()
  })

  it('WAL + foreign_keys 打开即设（schema.sql 头部 pragma）', () => {
    const store = createWorkspaceStore({ resolveDir: () => wsDir() })
    const db = store.ensureOpen('p1')
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    store.dispose()
  })

  it('FK 全解析：引用不存在的 feature_id 被拒（FK 一律无 ON DELETE——负样例即 DML 校验证明）', () => {
    const store = createWorkspaceStore({ resolveDir: () => wsDir() })
    const db = store.ensureOpen('p1')
    expect(() =>
      db.prepare(
        `INSERT INTO tasks (id, slug, local_id, title, task_type, feature_id, created_at, updated_at)
         VALUES ('t9', 's', '1', 't', 'coding.feature', 'missing-feature', ?, ?)`,
      ).run(NOW, NOW),
    ).toThrowError(/FOREIGN KEY/)
    store.dispose()
  })

  it('append-only 双触发器拒绝 UPDATE / DELETE（B.5 触发器 ABORT 锚）', () => {
    const store = createWorkspaceStore({ resolveDir: () => wsDir() })
    const db = store.ensureOpen('p1')
    seedFeature(db)
    seedTask(db)
    db.prepare(
      `INSERT INTO task_records (task_id, verb, actor, created_at, updated_at) VALUES ('t1', 'add', 'ui', ?, ?)`,
    ).run(NOW, NOW)
    expect(() =>
      db.prepare(`UPDATE task_records SET summary = 'x' WHERE task_id = 't1'`).run(),
    ).toThrowError(/append-only violation \(update\)/)
    expect(() => db.prepare(`DELETE FROM task_records WHERE task_id = 't1'`).run()).toThrowError(
      /append-only violation \(delete\)/,
    )
    store.dispose()
  })

  it('CHECK 全集负样例（七态任务态 / 六态 feature / 三值 origin / actor / priority）', () => {
    const store = createWorkspaceStore({ resolveDir: () => wsDir() })
    const db = store.ensureOpen('p1')
    seedFeature(db)
    const insertTask = db.prepare(
      `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, priority, feature_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'f1', ?, ?)`,
    )
    expect(() => insertTask.run('a', 'demo-feature-f1', '1', 't', 'coding.feature', 'done', 'P0', NOW, NOW)).toThrowError(
      /CHECK/,
    )
    expect(() => insertTask.run('b', 'demo-feature-f1', '2', 't', 'coding.feature', 'pending', 'P9', NOW, NOW)).toThrowError(
      /CHECK/,
    )
    expect(() => insertTask.run('c', 'demo-feature-f1', '3', 't', 'coding.feature', 'pending', 'P1', NOW, NOW)).not.toThrow()

    expect(() =>
      db
        .prepare(
          `INSERT INTO features (id, slug, title, feature_status, created_at, updated_at) VALUES ('fx', 'sx', 't', ?, ?, ?)`,
        )
        .run('shipped', NOW, NOW),
    ).toThrowError(/CHECK/)

    seedTask(db, 't2')
    expect(() =>
      db
        .prepare(
          `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at) VALUES ('t1', 't2', ?, ?, ?)`,
        )
        .run('magic', NOW, NOW),
    ).toThrowError(/CHECK/)

    expect(() =>
      db
        .prepare(`INSERT INTO task_records (task_id, verb, actor, created_at, updated_at) VALUES ('t1', 'add', ?, ?, ?)`)
        .run('agent', NOW, NOW),
    ).toThrowError(/CHECK/)
    store.dispose()
  })

  it('工作区 app_key_logs scope 独立两值：tasks/workspace 收，中央域值炸 CHECK（写中央必炸对偶证明）', () => {
    const store = createWorkspaceStore({ resolveDir: () => wsDir() })
    const db = store.ensureOpen('p1')
    const insert = db.prepare(`INSERT INTO app_key_logs (level, scope, data_json, created_at) VALUES ('warn', ?, '{}', ?)`)
    expect(() => insert.run('tasks', NOW)).not.toThrow()
    expect(() => insert.run('workspace', NOW)).not.toThrow()
    expect(() => insert.run('reconcile', NOW)).toThrowError(/CHECK/)
    store.dispose()
  })
})

describe('AC2 ensureOpen 惰性链（openDatabase 参数化 → 版本门 → 迁移 → 结构健全性检查）', () => {
  it('惰性 + 句柄常驻：两次 ensureOpen 返回同一实例（进程内每库一柄）', () => {
    const store = createWorkspaceStore({ resolveDir: () => wsDir() })
    const first = store.ensureOpen('p1')
    const second = store.ensureOpen('p1')
    expect(second).toBe(first)
    expect(first.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(
      FORGE_DB_SCHEMA_VERSION,
    )
    store.dispose()
  })

  it('版本门（独立版本线）：库内 version=2 → ERR_WORKSPACE_DB_UNAVAILABLE（cause=UnsupportedSchemaVersionError）', () => {
    const ws = wsDir()
    const db = openWorkspaceDb(join(ws, 'forge.db'))
    db.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (2, '2099-01-01T00:00:00.000Z')`).run()
    db.close()

    const store = createWorkspaceStore({ resolveDir: () => ws })
    try {
      store.ensureOpen('p1')
      expect.unreachable('版本门负样例须拒绝')
    } catch (e) {
      expect(isWorkspaceDbUnavailableError(e)).toBe(true)
      const err = e as WorkspaceDbUnavailableError
      expect(err.code).toBe('ERR_WORKSPACE_DB_UNAVAILABLE')
      expect(err.data.projectId).toBe('p1')
      expect(err.data.dir).toBe(ws)
      expect(isUnsupportedSchemaVersionError(err.cause)).toBe(true)
      // 库不可写（openDatabase 已关闭句柄）→ 记账降级 child 控制台（不崩、可断言）
      expect(err.data.error).toBeTruthy()
    } finally {
      store.dispose()
    }
  })

  it('结构健全性检查·表在场：同版本但缺域表（DROP tasks）→ 隔离 + 工作区 app_key_logs 记账（scope tasks）', () => {
    const ws = wsDir()
    const db = openWorkspaceDb(join(ws, 'forge.db'))
    db.exec(`DROP TABLE tasks`)
    db.close()

    const store = createWorkspaceStore({ resolveDir: () => ws })
    expect(() => store.ensureOpen('p1')).toThrowError(WorkspaceDbUnavailableError)
    // 句柄在手（openDatabase 成功、健全性检查失败）→ 隔离记账落工作区库（读写回查）
    const raw = new Database(join(ws, 'forge.db'))
    const rows = raw.prepare<unknown[], { level: string; scope: string; data_json: string }>(
      `SELECT level, scope, data_json FROM app_key_logs ORDER BY id`,
    ).all()
    raw.close()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.level).toBe('error')
    expect(rows[0]?.scope).toBe('tasks')
    const data = JSON.parse(String(rows[0]?.data_json)) as { projectId?: string; dir?: string }
    expect(data.projectId).toBe('p1')
    expect(data.dir).toBe(ws)
    store.dispose()
  })

  it('结构健全性检查·表在场：中央 state.db 形态同版本库 → 拒绝（记账命中中央 scope CHECK 自动降级）', () => {
    const ws = wsDir()
    openDatabase(join(ws, 'forge.db')).close() // 中央五表 v1（同版本线数值、异形态）
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const store = createWorkspaceStore({ resolveDir: () => ws })
    expect(() => store.ensureOpen('p1')).toThrowError(WorkspaceDbUnavailableError)
    // 中央 ck_akl_scope 四值不含 'tasks' → 记账写炸 CHECK → 降级 child 控制台（不崩）
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('p1')
    store.dispose()
  })

  it('结构健全性检查·foreign_key_check：违例行在场 → 拒绝（恒轻量开库断言）', () => {
    const ws = wsDir()
    const db = openWorkspaceDb(join(ws, 'forge.db'))
    db.pragma('foreign_keys = OFF')
    db.prepare(
      `INSERT INTO task_records (task_id, verb, actor, created_at, updated_at) VALUES ('ghost', 'add', 'ui', ?, ?)`,
    ).run(NOW, NOW)
    db.close()

    const store = createWorkspaceStore({ resolveDir: () => ws })
    expect(() => store.ensureOpen('p1')).toThrowError(WorkspaceDbUnavailableError)
    store.dispose()
  })
})

describe('AC3 库文件缺席 → 新建 v1 + 发现面扫描协作者挂点（1.3 接线）', () => {
  it('缺席补建：新建 v1 + onFirstCreate 恰好一次（projectId + 句柄）；句柄缓存后不再触发', () => {
    const ws = wsDir()
    const hook = vi.fn()
    const store = createWorkspaceStore({ resolveDir: () => ws, onFirstCreate: hook })

    const db = store.ensureOpen('p1')
    expect(hook).toHaveBeenCalledTimes(1)
    expect(hook).toHaveBeenCalledWith('p1', db)
    expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(1)

    store.ensureOpen('p1')
    expect(hook).toHaveBeenCalledTimes(1)
    store.dispose()
  })

  it('既有库在场（文件存在）→ 不触发首建协作者（P1 存量工作区升级 M2 只走开库链）', () => {
    const ws = wsDir()
    openWorkspaceDb(join(ws, 'forge.db')).close()
    const hook = vi.fn()
    const store = createWorkspaceStore({ resolveDir: () => ws, onFirstCreate: hook })

    store.ensureOpen('p1')
    expect(hook).not.toHaveBeenCalled()
    store.dispose()
  })

  it('首建协作者失败 = fail-soft：不隔离不抛，工作区 app_key_logs 记账（scope workspace），句柄照常可用', () => {
    const ws = wsDir()
    const boom = (): void => {
      throw new Error('discovery-scan-boom')
    }
    const store = createWorkspaceStore({ resolveDir: () => ws, onFirstCreate: boom })

    const db = store.ensureOpen('p1') // 不抛——协作者失败 fail-soft
    const rows = db.prepare<unknown[], { level: string; scope: string; data_json: string }>(
      `SELECT level, scope, data_json FROM app_key_logs`,
    ).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.level).toBe('error')
    expect(rows[0]?.scope).toBe('workspace')
    expect(String(rows[0]?.data_json)).toContain('discovery-scan-boom')
    seedFeature(db) // 句柄仍可用
    expect(db.prepare(`SELECT COUNT(*) AS n FROM features`).get()).toEqual({ n: 1 })
    store.dispose()
  })
})

describe('AC4 开库/迁移失败 = 工作区隔离（不抛断用户流程；其余库照常）', () => {
  it('库文件损坏 → ERR_WORKSPACE_DB_UNAVAILABLE（typed error 完整面）+ 记账降级 child 控制台', () => {
    const ws = wsDir()
    writeCorruptDb(ws)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const store = createWorkspaceStore({ resolveDir: () => ws })
    try {
      store.ensureOpen('p1')
      expect.unreachable('损坏库须隔离拒绝')
    } catch (e) {
      expect(isWorkspaceDbUnavailableError(e)).toBe(true)
      const err = e as WorkspaceDbUnavailableError
      expect(err.code).toBe('ERR_WORKSPACE_DB_UNAVAILABLE')
      expect(err.data.projectId).toBe('p1')
      expect(err.name).toBe('WorkspaceDbUnavailableError')
    }
    store.dispose()
  })

  it('隔离 fail-fast：同工作区重复触达抛同一 error 实例（单事件单条不重复记账）', () => {
    const ws = wsDir()
    writeCorruptDb(ws)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const store = createWorkspaceStore({ resolveDir: () => ws })
    let first: unknown
    try {
      store.ensureOpen('p1')
    } catch (e) {
      first = e
    }
    expect(first).toBeInstanceOf(WorkspaceDbUnavailableError)
    expect(() => store.ensureOpen('p1')).toThrowError(first as Error) // 同一实例
    store.dispose()
  })

  it('工作区隔离互不影响：A 损坏隔离，B 照常开库可用', () => {
    const dirs = new Map<string, string>([
      ['pa', wsDir()],
      ['pb', wsDir()],
    ])
    writeCorruptDb(dirs.get('pa')!)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const store = createWorkspaceStore({ resolveDir: (id) => dirs.get(id)! })
    expect(() => store.ensureOpen('pa')).toThrowError(WorkspaceDbUnavailableError)
    const b = store.ensureOpen('pb')
    seedFeature(b)
    expect(b.prepare(`SELECT COUNT(*) AS n FROM features`).get()).toEqual({ n: 1 })
    store.dispose()
  })
})

describe('AC5 store.dispose（进程内常驻句柄统一关闭；3.4 接插件 disposer host 侧收口）', () => {
  it('dispose 关闭全部句柄；此后 ensureOpen 重开新句柄', () => {
    const dirs = new Map<string, string>([
      ['pa', wsDir()],
      ['pb', wsDir()],
    ])
    const store = createWorkspaceStore({ resolveDir: (id) => dirs.get(id)! })
    const a = store.ensureOpen('pa')
    const b = store.ensureOpen('pb')
    store.dispose()
    expect(() => a.prepare(`SELECT 1`)).toThrowError(/not open|closed/)
    expect(() => b.prepare(`SELECT 1`)).toThrowError(/not open|closed/)

    const reopened = store.ensureOpen('pa') // dispose 后可重开（新句柄）
    expect(reopened).not.toBe(a)
    reopened.close()
  })

  it('dispose 幂等（空柄/重复调用不抛）', () => {
    const store = createWorkspaceStore({ resolveDir: () => wsDir() })
    store.dispose()
    store.dispose()
  })
})
