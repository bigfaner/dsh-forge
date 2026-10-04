// 任务 2.1 测试 —— openDatabase 行为面（AC1 DDL 零错+索引 / AC2 FK+CHECK 负样例 /
// AC3 schema_meta 前向门 / 事务助手 / WAL）。临时库执行（vitest，Node 直跑 better-sqlite3）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { UnsupportedSchemaVersionError, isUnsupportedSchemaVersionError } from './errors.js'
import { openDatabase } from './open.js'
import { withTransaction } from './transaction.js'
import { isParseableDateStyle } from '../testutil/date-assertions.js'

let dir: string
let seq = 0
// 每个用例独占一个库文件（版本门负样例会给库种入超限版本行，共享路径会毒化后续用例）。
const dbPath = () =>
  join((dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-db-'))), `state-${String(++seq).padStart(3, '0')}.db`)

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function insertProject(db: Database.Database, id: string, wsPath: string) {
  db.prepare(
    `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, knowledge_dir, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `ws-${id}`, wsPath, id, `C:\\ws\\${id}\\.forge`, `C:\\ws\\${id}\\.knowledge`, '2026-10-02T00:00:00.000Z', '2026-10-02T00:00:00.000Z')
}

describe('AC1 全 DDL 在临时库执行零错（五表 + 七索引 + FK pragma）', () => {
  it('打开全新库：五表全部存在', () => {
    const db = openDatabase(dbPath())
    const tables = db
      .prepare<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all()
      .map((r) => r.name)
    expect(tables).toEqual([
      'app_key_logs',
      'knowledge_entries',
      'knowledge_recall_logs',
      'projects',
      'schema_meta',
    ])
    db.close()
  })

  it('七索引全部创建', () => {
    const db = openDatabase(dbPath())
    const indexes = db
      .prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name`)
      .all()
      .map((r) => r.name)
    expect(indexes).toEqual([
      'idx_akl_scope_time',
      'idx_ke_frontmatter_id',
      'idx_ke_project_domain',
      'idx_krl_call',
      'idx_krl_entry',
      'idx_krl_project_session',
      'idx_projects_ws_path',
    ])
    db.close()
  })

  it('journal_mode = WAL（schema.sql 头部 pragma）', () => {
    const db = openDatabase(dbPath())
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    db.close()
  })

  it('foreign_keys = ON（FK 解析前置）', () => {
    const db = openDatabase(dbPath())
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    db.close()
  })
})

describe('AC2 FK 全解析（负样例 + 级联）', () => {
  it('子行引用不存在的 project_id 被拒（SQLITE_CONSTRAINT_FOREIGNKEY）', () => {
    const db = openDatabase(dbPath())
    expect(() =>
      db.prepare(
        `INSERT INTO knowledge_entries (project_id, rel_path, domain_path, title, summary, digest, indexed_at)
         VALUES ('missing-project', 'a.md', '编程', 't', 's', 'd', '2026-10-02T00:00:00.000Z')`,
      ).run(),
    ).toThrowError(/FOREIGN KEY/)
    db.close()
  })

  it('ON DELETE CASCADE 生效：删项目 → 知识条目与召回日志随行清除', () => {
    const db = openDatabase(dbPath())
    insertProject(db, 'p1', 'C:\\ws\\p1')
    db.prepare(
      `INSERT INTO knowledge_entries (project_id, rel_path, domain_path, title, summary, digest, indexed_at)
       VALUES ('p1', 'a.md', '编程', 't', 's', 'd', '2026-10-02T00:00:00.000Z')`,
    ).run()
    db.prepare(
      `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, hit_count, created_at)
       VALUES ('p1', 'c1', 's1', 'search', 1, 1, '2026-10-02T00:00:00.000Z')`,
    ).run()
    db.prepare(`DELETE FROM projects WHERE id = ?`).run('p1')
    expect(db.prepare(`SELECT COUNT(*) AS n FROM knowledge_entries WHERE project_id='p1'`).get()).toEqual({ n: 0 })
    expect(db.prepare(`SELECT COUNT(*) AS n FROM knowledge_recall_logs WHERE project_id='p1'`).get()).toEqual({ n: 0 })
    db.close()
  })

  it('entry_id 引用不存在的 knowledge_entries 被拒（可空 FK 仍校验解析）', () => {
    const db = openDatabase(dbPath())
    insertProject(db, 'p2', 'C:\\ws\\p2')
    expect(() =>
      db.prepare(
        `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, hit_count, created_at)
         VALUES ('p2', 'c1', 's1', 'read-abstract', 9999, 1, '2026-10-02T00:00:00.000Z')`,
      ).run(),
    ).toThrowError(/FOREIGN KEY/)
    db.close()
  })
})

describe('AC2 CHECK 约束负样例（verb / level / scope / forge_dir_external）', () => {
  it('forge_dir_external 仅 0/1；2 被拒', () => {
    const db = openDatabase(dbPath())
    const insert = db.prepare(
      `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, forge_dir_external, knowledge_dir, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    expect(() =>
      insert.run('px', 'ws-px', 'C:\\ws\\px', 'px', 'C:\\ws\\px\\.forge', 2, 'C:\\ws\\px\\.knowledge', '2026-10-02T00:00:00.000Z', '2026-10-02T00:00:00.000Z'),
    ).toThrowError(/CHECK/)
    expect(() =>
      insert.run('p0', 'ws-p0', 'C:\\ws\\p0', 'p0', 'C:\\ws\\p0\\.forge', 0, 'C:\\ws\\p0\\.knowledge', '2026-10-02T00:00:00.000Z', '2026-10-02T00:00:00.000Z'),
    ).not.toThrow()
    expect(() =>
      insert.run('p1x', 'ws-p1x', 'C:\\ws\\p1x', 'p1x', 'C:\\ws\\p1x\\.forge', 1, 'C:\\ws\\p1x\\.knowledge', '2026-10-02T00:00:00.000Z', '2026-10-02T00:00:00.000Z'),
    ).not.toThrow()
    db.close()
  })

  it('verb 仅 search / read-abstract；fetch 被拒', () => {
    const db = openDatabase(dbPath())
    insertProject(db, 'pv', 'C:\\ws\\pv')
    const insert = db.prepare(
      `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, hit_count, created_at)
       VALUES ('pv', 'c1', 's1', ?, 0, '2026-10-02T00:00:00.000Z')`,
    )
    expect(() => insert.run('fetch')).toThrowError(/CHECK/)
    expect(() => insert.run('search')).not.toThrow()
    expect(() => insert.run('read-abstract')).not.toThrow()
    db.close()
  })

  it('level 仅 warn / error；info 被拒', () => {
    const db = openDatabase(dbPath())
    const insert = db.prepare(
      `INSERT INTO app_key_logs (level, scope, message, created_at) VALUES (?, 'reconcile', 'm', '2026-10-02T00:00:00.000Z')`,
    )
    expect(() => insert.run('info')).toThrowError(/CHECK/)
    expect(() => insert.run('warn')).not.toThrow()
    expect(() => insert.run('error')).not.toThrow()
    db.close()
  })

  it('scope 仅四记名域；debug 被拒', () => {
    const db = openDatabase(dbPath())
    const insert = db.prepare(
      `INSERT INTO app_key_logs (level, scope, message, created_at) VALUES ('warn', ?, 'm', '2026-10-02T00:00:00.000Z')`,
    )
    for (const scope of ['compensation', 'reconcile', 'index', 'recall']) {
      expect(() => insert.run(scope), scope).not.toThrow()
    }
    expect(() => insert.run('debug')).toThrowError(/CHECK/)
    db.close()
  })
})

describe('AC3 schema_meta 前向门', () => {
  it('v1 写入 applied_at（ISO-8601）；重开幂等不重复插入', () => {
    const path = dbPath()
    const db = openDatabase(path)
    const rows = db.prepare<unknown[], { version: number; applied_at: string }>(
      `SELECT version, applied_at FROM schema_meta`,
    ).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.version).toBe(1)
    expect(isParseableDateStyle(rows[0]?.applied_at ?? '')).toBe(true)
    db.close()

    const db2 = openDatabase(path)
    expect(db2.prepare(`SELECT COUNT(*) AS n FROM schema_meta`).get()).toEqual({ n: 1 })
    db2.close()
  })

  it('version 超支持上限 → 明确拒绝打开（含两端版本号的 typed error）', () => {
    const path = dbPath()
    const db = openDatabase(path)
    db.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (2, '2099-01-01T00:00:00.000Z')`).run()
    db.close()

    expect(() => openDatabase(path)).toThrowError(UnsupportedSchemaVersionError)
    try {
      openDatabase(path)
    } catch (e) {
      expect(isUnsupportedSchemaVersionError(e)).toBe(true)
      const err = e as UnsupportedSchemaVersionError
      expect(err.currentVersion).toBe(2)
      expect(err.supportedVersion).toBe(1)
      expect(err.message).toContain('2')
      expect(err.message).toContain('1')
    }
  })

  it('无 schema_meta 的裸库文件 → 视为 v0 并前向迁移到 v1（current < 最新版路径）', () => {
    const path = dbPath()
    // 直接用 better-sqlite3 建一个零表库文件（模拟 v0：任何未记版本的库），
    // openDatabase 须补齐全部迁移（全 CREATE 无 ALTER）。
    const raw = new Database(path)
    raw.close()

    const db = openDatabase(path)
    expect(db.prepare(`SELECT COUNT(*) AS n FROM schema_meta`).get()).toEqual({ n: 1 })
    const tables = db
      .prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all()
      .map((r) => r.name)
    expect(tables).toEqual([
      'app_key_logs',
      'knowledge_entries',
      'knowledge_recall_logs',
      'projects',
      'schema_meta',
    ])
    db.close()
  })
})

describe('事务助手 withTransaction', () => {
  it('成功路径整体提交', () => {
    const db = openDatabase(dbPath())
    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO app_key_logs (level, scope, message, created_at) VALUES ('warn', 'index', 'ok', '2026-10-02T00:00:00.000Z')`,
      ).run()
    })
    expect(db.prepare(`SELECT COUNT(*) AS n FROM app_key_logs`).get()).toEqual({ n: 1 })
    db.close()
  })

  it('异常路径整体回滚', () => {
    const db = openDatabase(dbPath())
    expect(() =>
      withTransaction(db, () => {
        db.prepare(
          `INSERT INTO app_key_logs (level, scope, message, created_at) VALUES ('error', 'index', 'boom', '2026-10-02T00:00:00.000Z')`,
        ).run()
        throw new Error('rollback-me')
      }),
    ).toThrowError('rollback-me')
    expect(db.prepare(`SELECT COUNT(*) AS n FROM app_key_logs`).get()).toEqual({ n: 0 })
    db.close()
  })
})
