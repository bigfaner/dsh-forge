// 任务 2.1 测试 —— openDatabase 行为面（AC1 DDL 零错+索引 / AC2 FK+CHECK 负样例 /
// AC3 schema_meta 前向门 / 事务助手 / WAL）。临时库执行（vitest，Node 直跑 better-sqlite3）。
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { isMigrationTamperedError, MigrationTamperedError, UnsupportedSchemaVersionError, isUnsupportedSchemaVersionError } from './errors.js'
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
      .prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all()
      .map((r) => r.name)
    expect(tables).toEqual([
      'app_key_logs',
      'knowledge_entries',
      'knowledge_recall_logs',
      'migration_digests',
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
      'migration_digests',
      'projects',
      'schema_meta',
    ])
    db.close()
  })
})

describe('openDatabase 参数化迁移序列（M2 1.2：工作区库独立版本线经参数传入，Hard Rule——禁硬编码 import 中央序列）', () => {
  /** 与中央五表完全相异的假想迁移序列（独立版本线形制对拍：版本表随 v1 + 单表 + 单索引——
   *  序列契约 = 首迁移自带 schema_meta 建表，与中央 v1 形制一致） */
  const altMigrations = [
    {
      version: 1,
      statements: [
        `CREATE TABLE schema_meta (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL
)`,
        `CREATE TABLE alt_widgets (
    id    TEXT PRIMARY KEY,
    label TEXT NOT NULL
)`,
        `CREATE INDEX idx_alt_widgets_label ON alt_widgets(label)`,
      ],
    },
  ] as const

  it('传入自定义序列：空库按参数序列迁移到参数版本上限', () => {
    const db = openDatabase(dbPath(), { migrations: altMigrations, schemaVersion: 1 })
    const tables = db
      .prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all()
      .map((r) => r.name)
    expect(tables).toEqual(['alt_widgets', 'migration_digests', 'schema_meta'])
    expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(1)
    db.close()
  })

  it('参数序列的版本门独立于中央版本：库内 version 超出参数上限即拒绝', () => {
    const path = dbPath()
    const db = openDatabase(path, { migrations: altMigrations, schemaVersion: 1 })
    db.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (2, '2099-01-01T00:00:00.000Z')`).run()
    db.close()

    // 同一库：中央默认（支持上限同为 1）与参数序列同拒；typed error 两端版本号可见
    expect(() => openDatabase(path, { migrations: altMigrations, schemaVersion: 1 })).toThrowError(UnsupportedSchemaVersionError)
    expect(() => openDatabase(path)).toThrowError(UnsupportedSchemaVersionError)
  })

  it('缺省参数 = 中央 state.db 序列（既有调用面零变化）', () => {
    const db = openDatabase(dbPath())
    expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM projects`).get()?.n).toBe(0)
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

// ---------------------------------------------------------------------------
// migration-hardening 1.1：守卫语句 + 迁移指纹守卫 + 迁移前备份 + 原子性
// ---------------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10)

/** 独立版本线测试序列：v1 建表 + v2 守卫式加列（与中央五表相异，形制契约同中央）。 */
const guardMigrations = [
  {
    version: 1,
    statements: [
      `CREATE TABLE schema_meta (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL
)`,
      `CREATE TABLE alt_widgets (
    id    TEXT PRIMARY KEY,
    label TEXT NOT NULL
)`,
      `CREATE INDEX idx_alt_widgets_label ON alt_widgets(label)`,
    ],
  },
  {
    version: 2,
    statements: [
      { sql: `ALTER TABLE alt_widgets ADD COLUMN extra TEXT`, columnGuard: { table: 'alt_widgets', column: 'extra' } },
    ],
  },
] as const

describe('守卫语句：columnGuard 命中跳过 / 未命中执行', () => {
  it('未命中（列缺席）：守卫语句执行，列被补上', () => {
    const db = openDatabase(dbPath(), { migrations: guardMigrations, schemaVersion: 2 })
    const columns = db.pragma(`table_info('alt_widgets')`) as Array<{ name: string }>
    expect(columns.map((c) => c.name)).toContain('extra')
    db.close()
  })

  it('命中（列已在场）：守卫语句跳过不报错（多谱系收敛）', () => {
    // 直接构造「列已在场」的 v2 库（模拟另一谱系），守卫 ALTER 若执行必炸（duplicate column）。
    const path = dbPath()
    const raw = new Database(path)
    raw.exec(`
      CREATE TABLE schema_meta (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_meta VALUES (1, '2026-10-02T00:00:00.000Z'), (2, '2026-10-02T00:00:00.000Z');
      CREATE TABLE alt_widgets (id TEXT PRIMARY KEY, label TEXT NOT NULL, extra TEXT);
    `)
    raw.close()

    const db = openDatabase(path, { migrations: guardMigrations, schemaVersion: 2 })
    expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(2)
    const columns = db.pragma(`table_info('alt_widgets')`) as Array<{ name: string }>
    expect(columns.filter((c) => c.name === 'extra')).toHaveLength(1)
    db.close()
  })
})

describe('迁移指纹守卫：记录 / 校验 / 篡改拒开 / 回填幂等', () => {
  it('迁移应用成功 → 同事务记录语句集 sha-256 指纹', () => {
    const db = openDatabase(dbPath())
    const rows = db.prepare<unknown[], { version: number; digest: string }>(
      `SELECT version, digest FROM migration_digests`,
    ).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.version).toBe(1)
    expect(rows[0]?.digest).toMatch(/^[0-9a-f]{64}$/)
    db.close()
  })

  it('已录指纹与代码哈希不一致 → MigrationTamperedError（含版本号 + 处置指引），不做任何半套迁移', () => {
    const path = dbPath()
    const db = openDatabase(path, { migrations: guardMigrations, schemaVersion: 1 })
    db.close()

    // 同版本直改语句（v1 的建表语句被篡改）+ 携带待应用 v2 → 开库必须在版本门处明确拒开
    const tampered = [
      { ...guardMigrations[0], statements: [...guardMigrations[0].statements.slice(0, 1), `CREATE TABLE alt_widgets (id TEXT PRIMARY KEY, label TEXT NOT NULL, renamed TEXT)`] },
      guardMigrations[1],
    ]
    expect(() => openDatabase(path, { migrations: tampered, schemaVersion: 2 })).toThrowError(MigrationTamperedError)
    try {
      openDatabase(path, { migrations: tampered, schemaVersion: 2 })
    } catch (e) {
      expect(isMigrationTamperedError(e)).toBe(true)
      expect((e as MigrationTamperedError).version).toBe(1)
      expect(e instanceof Error && e.message).toContain('1')
      expect(e instanceof Error && e.message).toContain('恢复')
    }

    // 半套校验：v2 未被应用（守卫先于迁移执行），库仍为 v1 原状；原序列可正常打开
    const check = new Database(path)
    expect(check.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(1)
    const columns = check.pragma(`table_info('alt_widgets')`) as Array<{ name: string }>
    expect(columns.map((c) => c.name)).not.toContain('extra')
    check.close()
    const ok = openDatabase(path, { migrations: guardMigrations, schemaVersion: 2 })
    ok.close()
  })

  it('历史库（指纹缺席）首开按当前代码回填，幂等：重开不再回填、不报错', () => {
    const path = dbPath()
    // 模拟历史库：无 migration_digests 表的 v1 库
    const raw = new Database(path)
    raw.exec(`
      CREATE TABLE schema_meta (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_meta VALUES (1, '2026-10-02T00:00:00.000Z');
      CREATE TABLE alt_widgets (id TEXT PRIMARY KEY, label TEXT NOT NULL);
    `)
    raw.close()

    const db1 = openDatabase(path, { migrations: guardMigrations, schemaVersion: 1 })
    const rows = db1.prepare<unknown[], { version: number }>(`SELECT version FROM migration_digests`).all()
    expect(rows).toEqual([{ version: 1 }])
    db1.close()

    const db2 = openDatabase(path, { migrations: guardMigrations, schemaVersion: 1 })
    expect(db2.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM migration_digests`).get()).toEqual({ n: 1 })
    db2.close()
  })
})

describe('迁移前自动备份（VACUUM INTO，按目标版本覆盖，失败 fail-closed）', () => {
  it('存在待应用迁移的既有库：先落 {file}.bak-{日期}-pre-v{目标版本}', () => {
    const path = dbPath()
    openDatabase(path, { migrations: guardMigrations, schemaVersion: 1 }).close()
    const db = openDatabase(path, { migrations: guardMigrations, schemaVersion: 2 })
    db.close()
    expect(existsSync(`${path}.bak-${today()}-pre-v2`)).toBe(true)
  })

  it('备份按目标版本覆盖保留一份（VACUUM INTO 全量快照替换旧内容）', () => {
    const path = dbPath()
    openDatabase(path, { migrations: guardMigrations, schemaVersion: 1 }).close()
    writeFileSync(`${path}.bak-${today()}-pre-v2`, 'stale-marker')
    const db = openDatabase(path, { migrations: guardMigrations, schemaVersion: 2 })
    db.close()
    // 快照为合法 SQLite 库（非 stale 文本），且含源库数据
    const bak = new Database(`${path}.bak-${today()}-pre-v2`, { readonly: true })
    expect(bak.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM schema_meta`).get()?.n).toBe(1)
    bak.close()
  })

  it('备份失败 → fail-closed：不应用任何迁移，库文件原状', () => {
    const path = dbPath()
    openDatabase(path, { migrations: guardMigrations, schemaVersion: 1 }).close()
    // 占据备份目标路径：VACUUM INTO 必失败 → 整体拒开
    mkdirSync(`${path}.bak-${today()}-pre-v2`)
    expect(() => openDatabase(path, { migrations: guardMigrations, schemaVersion: 2 })).toThrowError()

    const check = new Database(path)
    expect(check.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(1)
    expect(check.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM pragma_table_info('alt_widgets') WHERE name='extra'`).get()?.n).toBe(0)
    check.close()
  })
})

describe('迁移原子性 + defer_foreign_keys', () => {
  it('语句中途失败 → 整体回滚：无半套结构与版本行，业务数据原状', () => {
    const path = dbPath()
    const seed = openDatabase(path, { migrations: guardMigrations, schemaVersion: 1 })
    seed.prepare(`INSERT INTO alt_widgets (id, label) VALUES ('w1', 'keep-me')`).run()
    seed.close()

    const broken = [
      guardMigrations[0],
      {
        version: 2,
        statements: [
          `CREATE TABLE alt_gadgets (id TEXT PRIMARY KEY)`,
          `THIS IS NOT VALID SQL`,
        ],
      },
    ]
    expect(() => openDatabase(path, { migrations: broken, schemaVersion: 2 })).toThrowError()

    const check = new Database(path)
    expect(check.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(1)
    expect(check.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM sqlite_master WHERE name='alt_gadgets'`).get()?.n).toBe(0)
    expect(check.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM alt_widgets WHERE id='w1'`).get()?.n).toBe(1)
    expect(check.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM migration_digests WHERE version=2`).get()?.n).toBe(0)
    check.close()
  })

  it('迁移事务 defer_foreign_keys = ON：暂态 FK 悬空允许，COMMIT 时校验通过', () => {
    // 子表先建 + 子行先插（引用尚未存在的父表），父表随后建——defer 下 COMMIT 才校验，全通过。
    const deferred = [
      guardMigrations[0],
      {
        version: 2,
        statements: [
          `CREATE TABLE alt_children (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES alt_parents(id))`,
          `CREATE TABLE alt_parents (id TEXT PRIMARY KEY)`,
          `INSERT INTO alt_children (id, parent_id) VALUES ('c1', 'p1')`,
          `INSERT INTO alt_parents (id) VALUES ('p1')`,
        ],
      },
    ]
    const db = openDatabase(dbPath(), { migrations: deferred, schemaVersion: 2 })
    expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM pragma_foreign_key_check`).get()?.n).toBe(0)
    db.close()
  })
})
