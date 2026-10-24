// migration-hardening 任务 1.2 —— 三谱系夹具收敛回归 + 数据迁移配方示例单测。
// ①收敛回归：任何 version=1 历史谱系（旧十表 v1 / fix-bug 后 v1 / 全新库）经 openDatabase
//   （store 链含 assertStructureSound）开库后收敛到同一 v2 终态——十二表、bugs 21 列、
//   FORGE_DB_SCHEMA_VERSION=2、foreign_key_check 零违例，既有业务行全保留。
// ②数据迁移配方示例（测试序列独立于产品序列——不 import WORKSPACE_MIGRATIONS 的 v2）：
//   加列回填配方（守卫 ADD COLUMN + 撤/复建 append-only 触发器 + UPDATE 回填）与表重建配方
//   （RENAME → 新形 CREATE → INSERT…SELECT 搬数 → DROP，含 FK 子表），验证搬数原子、
//   行保留、defer_foreign_keys 下 COMMIT 校验通过。
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { openDatabase } from '../../db/index.js'
import type { Migration } from '../../db/schema.js'
import { FORGE_DB_SCHEMA_VERSION, WORKSPACE_MIGRATIONS } from './migrations.js'
import { createWorkspaceStore } from './store.js'

const NOW = '2026-10-06T00:00:00.000Z'

let dir: string
afterAll(() => {
  if (dir) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // 临时目录清理 best-effort（句柄回收时序偶发锁文件）——不作为断言面
    }
  }
})
/** 每谱系/配方独占子目录（store 契约：库文件 = {dir}/forge.db） */
const freshWs = (name: string): string => {
  dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-lineage-'))
  const ws = join(dir, name)
  mkdirSync(ws, { recursive: true })
  return ws
}

/** v1 语句集（发布后冻结——历史谱系夹具按真实旧 DDL 取子集构造） */
const V1 = WORKSPACE_MIGRATIONS[0]!.statements
const stmtText = (s: (typeof V1)[number]): string => (typeof s === 'string' ? s : s.sql)

/** 谱系夹具种库：不经 openDatabase 直执 DDL（防迁移序列提前收敛）+ 业务行 + version=1 版本行 */
function buildLineageFixture(file: string, statements: readonly string[]): void {
  const raw = new Database(file)
  try {
    raw.pragma('journal_mode = WAL')
    raw.pragma('foreign_keys = ON')
    for (const sql of statements) raw.exec(sql)
    raw.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (1, ?)`).run(NOW)
    raw
      .prepare(
        `INSERT INTO features (id, slug, title, feature_status, created_at, updated_at) VALUES ('f1', 'demo', '特性', 'prd', ?, ?)`,
      )
      .run(NOW, NOW)
    raw
      .prepare(
        `INSERT INTO proposals (id, slug, title, proposal_status, created_at, updated_at) VALUES ('p1', 'demo-proposal', '提案', 'accepted', ?, ?)`,
      )
      .run(NOW, NOW)
    raw
      .prepare(
        `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, surface_key, surface_type, source_kind, source_id, mode, created_at, updated_at)
         VALUES ('t1', 'demo', '1.1', '任务一', 'coding-feature', 'in_progress', 'web', 'web', 'proposal', 'p1', 'blitz', ?, ?)`,
      )
      .run(NOW, NOW)
    raw
      .prepare(
        `INSERT INTO task_records (task_id, verb, to_status, actor, created_at, updated_at) VALUES ('t1', 'add', 'in_progress', 'core', ?, ?)`,
      )
      .run(NOW, NOW)
    if (statements.some((s) => /CREATE TABLE bugs/i.test(s))) {
      raw
        .prepare(
          `INSERT INTO bugs (id, summary, bug_desc, trigger_desc, expected, actual, bug_status, reporter, created_at, updated_at)
           VALUES ('b1', '摘要', '描述', '触发', '期望', '实际', 'open', 'tester', ?, ?)`,
        )
        .run(NOW, NOW)
    }
  } finally {
    raw.close()
  }
}

/** 旧十表 v1 谱系（2026-10-13 形态：v1 冻结语句集剔 bugs 表 + 索引） */
const V1_TEN_TABLES = V1.map(stmtText).filter((s) => !/bugs/i.test(s))
/** fix-bug 后 v1 谱系（v1 冻结语句集全量：bugs 20 列，无 fix_approach） */
const V1_WITH_BUGS = V1.map(stmtText)

/** 收敛终态断言（store 链 = openDatabase + assertStructureSound 全走） */
function assertConverged(
  db: Database.Database,
  opts: { bugRows: number; businessRows?: boolean },
): void {
  expect(
    db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v,
  ).toBe(FORGE_DB_SCHEMA_VERSION)
  expect(db.pragma('foreign_key_check')).toEqual([])
  const tables = db
    .prepare<unknown[], { name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all()
    .map((r) => r.name)
  expect(tables).toHaveLength(14)
  expect(tables).toContain('bugs')
  expect(tables).toContain('implementation_checkpoints')
  expect(tables).toContain('migration_digests')
  expect(tables).toContain('tasks_surface_archive')
  const bugCols = (db.pragma(`table_info('bugs')`) as Array<{ name: string }>).map((c) => c.name)
  expect(bugCols).toHaveLength(22)
  expect(bugCols[bugCols.length - 2]).toBe('fix_approach')
  expect(bugCols[bugCols.length - 1]).toBe('recurrence_of')
  // v4（surface 退役）：tasks 两列已摘除；存量值无损归档（businessRow 谱系 t1 携带 web/web）
  const taskCols = (db.pragma(`table_info('tasks')`) as Array<{ name: string }>).map((c) => c.name)
  expect(taskCols).not.toContain('surface_key')
  expect(taskCols).not.toContain('surface_type')
  const biz = opts.businessRows === false ? 0 : 1
  expect(
    db
      .prepare<unknown[], { task_id: string; surface_key: string | null; surface_type: string | null }>(
        `SELECT task_id, surface_key, surface_type FROM tasks_surface_archive`,
      )
      .all(),
  ).toEqual(biz === 1 ? [{ task_id: 't1', surface_key: 'web', surface_type: 'web' }] : [])
  // 业务行全保留（全新库无既有业务行——行数断言按谱系预期）
  expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM features`).get()?.n).toBe(biz)
  expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM proposals`).get()?.n).toBe(biz)
  expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM tasks`).get()?.n).toBe(biz)
  expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records`).get()?.n).toBe(biz)
  expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM bugs`).get()?.n).toBe(opts.bugRows)
}

describe('三谱系夹具收敛回归（v2 收敛式：任一 version=1 谱系 → 同一 v2 终态）', () => {
  it('谱系 A·旧十表 v1 库（无 bugs）→ v2 全量建表（21 列），守卫 ALTER 跳过', () => {
    const ws = freshWs('a-ten-tables')
    buildLineageFixture(join(ws, 'forge.db'), V1_TEN_TABLES)
    const store = createWorkspaceStore({ resolveDir: () => ws })
    const db = store.ensureOpen('p1')
    assertConverged(db, { bugRows: 0 })
    store.dispose()
  })

  it('谱系 B·fix-bug 后 v1 库（bugs 20 列无 fix_approach）→ CREATE 跳过、守卫 ALTER 补列，bug 行保留', () => {
    const ws = freshWs('b-fix-bug-v1')
    buildLineageFixture(join(ws, 'forge.db'), V1_WITH_BUGS)
    const store = createWorkspaceStore({ resolveDir: () => ws })
    const db = store.ensureOpen('p1')
    assertConverged(db, { bugRows: 1 })
    const bug = db
      .prepare<unknown[], { id: string; fix_approach: string | null }>(
        `SELECT id, fix_approach, recurrence_of FROM bugs WHERE id = 'b1'`,
      )
      .get()
    expect(bug).toEqual({ id: 'b1', fix_approach: null, recurrence_of: null })
    // 既有扁平台账行在新列上照常读写（新列可空——v3 无损断言）
    db.prepare(`UPDATE bugs SET recurrence_of = 'b1' WHERE id = 'b1'`).run()
    expect(
      db.prepare<unknown[], { recurrence_of: string | null }>(`SELECT recurrence_of FROM bugs WHERE id = 'b1'`).get(),
    ).toEqual({ recurrence_of: 'b1' })
    store.dispose()
  })

  it('谱系 C·全新库 → v1 建 bugs 20 列 + v2 守卫 ALTER 补列，终态与 A/B 一致', () => {
    const ws = freshWs('c-fresh')
    const store = createWorkspaceStore({ resolveDir: () => ws })
    const db = store.ensureOpen('p1')
    assertConverged(db, { bugRows: 0, businessRows: false })
    store.dispose()
  })
})

/** 配方夹具基建：version=1 手工形态库 + schema_meta 版本行 */
function buildRecipeFixture(file: string, ddl: readonly string[]): void {
  const raw = new Database(file)
  try {
    for (const sql of ddl) raw.exec(sql)
    raw.exec(`CREATE TABLE schema_meta (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`)
    raw.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (1, ?)`).run(NOW)
  } finally {
    raw.close()
  }
}

describe('数据迁移配方示例·加列回填（守卫 ADD COLUMN + 撤/复建触发器 + UPDATE 回填）', () => {
  const BASE_DDL = [
    `CREATE TABLE memos (id TEXT PRIMARY KEY, title TEXT NOT NULL)`,
    `CREATE TRIGGER trg_memos_no_update BEFORE UPDATE ON memos
     BEGIN SELECT RAISE(ABORT, 'memos: append-only violation (update)'); END`,
    `CREATE TRIGGER trg_memos_no_delete BEFORE DELETE ON memos
     BEGIN SELECT RAISE(ABORT, 'memos: append-only violation (delete)'); END`,
  ]
  const TRG_RESTORED = `CREATE TRIGGER trg_memos_no_update BEFORE UPDATE ON memos
BEGIN SELECT RAISE(ABORT, 'memos: append-only violation (update)'); END`
  const RECIPE: Migration = {
    version: 2,
    statements: [
      {
        sql: `ALTER TABLE memos ADD COLUMN category TEXT`,
        columnGuard: { table: 'memos', column: 'category' },
      },
      `DROP TRIGGER IF EXISTS trg_memos_no_update`,
      `UPDATE memos SET category = 'legacy-' || id`,
      TRG_RESTORED,
    ],
  }

  it('回填生效 + 触发器复建（append-only 语义回归）+ 行保留 + FK/版本收敛', () => {
    const file = join(freshWs('recipe-backfill'), 'recipe.db')
    buildRecipeFixture(file, BASE_DDL)
    {
      const raw = new Database(file)
      raw.prepare(`INSERT INTO memos (id, title) VALUES ('m1', '一'), ('m2', '二'), ('m3', '三')`).run()
      raw.close()
    }
    const db = openDatabase(file, { migrations: [RECIPE], schemaVersion: 2 })
    const cats = db
      .prepare<unknown[], { id: string; category: string }>(`SELECT id, category FROM memos ORDER BY id`)
      .all()
    expect(cats).toEqual([
      { id: 'm1', category: 'legacy-m1' },
      { id: 'm2', category: 'legacy-m2' },
      { id: 'm3', category: 'legacy-m3' },
    ])
    // 触发器按原文复建——UPDATE 再次被拒
    expect(() => db.prepare(`UPDATE memos SET title = 'x' WHERE id = 'm1'`).run()).toThrowError(
      /memos: append-only violation \(update\)/,
    )
    expect(db.prepare(`SELECT COUNT(*) AS n FROM memos`).get()).toEqual({ n: 3 })
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.close()
  })

  it('原子性：回填序列中途失败 → 整体回滚（无半套结构与版本行，数据原状）', () => {
    const file = join(freshWs('recipe-backfill-atomic'), 'recipe.db')
    buildRecipeFixture(file, BASE_DDL)
    {
      const raw = new Database(file)
      raw.prepare(`INSERT INTO memos (id, title) VALUES ('m1', '一')`).run()
      raw.close()
    }
    const broken: Migration = {
      version: 2,
      statements: [
        {
          sql: `ALTER TABLE memos ADD COLUMN category TEXT`,
          columnGuard: { table: 'memos', column: 'category' },
        },
        `DROP TRIGGER IF EXISTS trg_memos_no_update`,
        `UPDATE memos SET category = missing_column || id`,
      ],
    }
    expect(() => openDatabase(file, { migrations: [broken], schemaVersion: 2 })).toThrowError(/no such column/)
    const raw = new Database(file)
    const cols = (raw.pragma(`table_info('memos')`) as Array<{ name: string }>).map((c) => c.name)
    expect(cols).toEqual(['id', 'title'])
    expect(raw.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(1)
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM memos`).get()).toEqual({ n: 1 })
    // 触发器原状在场
    expect(() => raw.prepare(`UPDATE memos SET title = 'x'`).run()).toThrowError(/append-only violation/)
    raw.close()
  })
})

describe('数据迁移配方示例·表重建（新形 CREATE → INSERT…SELECT 搬数 → DROP 旧表 → RENAME 回正名，含 FK 子表）', () => {
  const BASE_DDL = [
    `CREATE TABLE widgets (id TEXT PRIMARY KEY, size INTEGER NOT NULL, label TEXT)`,
    `CREATE TABLE widget_parts (id TEXT PRIMARY KEY, widget_id TEXT NOT NULL REFERENCES widgets(id), name TEXT NOT NULL)`,
  ]
  // 配方顺序 = defer_foreign_keys 只把校验延迟到 COMMIT、不豁免中途语句的暂态违例计数
  // （DROP 被引用父表、向引用缺席父表的子表搬数都会在 COMMIT 处爆炸）。故表重建配方：
  // 子表行先撤入无 FK 暂存表 → 新形父表搬数 → DROP 子/父 → RENAME 回正名 → 按原形复建
  // 子表并回搬 → 清暂存——任一语句零暂态违例，COMMIT 时 FK 统一校验通过。
  const RECIPE: Migration = {
    version: 2,
    statements: [
      `CREATE TABLE widget_parts_tmp (id TEXT PRIMARY KEY, widget_id TEXT NOT NULL, name TEXT NOT NULL)`,
      `INSERT INTO widget_parts_tmp SELECT * FROM widget_parts`,
      `CREATE TABLE widgets_new (id TEXT PRIMARY KEY, dimensions INTEGER NOT NULL, label TEXT)`,
      `INSERT INTO widgets_new (id, dimensions, label) SELECT id, size, label FROM widgets`,
      `DROP TABLE widget_parts`,
      `DROP TABLE widgets`,
      `ALTER TABLE widgets_new RENAME TO widgets`,
      `CREATE TABLE widget_parts (id TEXT PRIMARY KEY, widget_id TEXT NOT NULL REFERENCES widgets(id), name TEXT NOT NULL)`,
      `INSERT INTO widget_parts SELECT * FROM widget_parts_tmp`,
      `DROP TABLE widget_parts_tmp`,
    ],
  }

  it('搬数完整 + 子表行保留 + defer FK 下 COMMIT 校验通过', () => {
    const file = join(freshWs('recipe-rebuild'), 'recipe.db')
    buildRecipeFixture(file, BASE_DDL)
    {
      const raw = new Database(file)
      raw
        .prepare(`INSERT INTO widgets (id, size, label) VALUES ('w1', 1, '甲'), ('w2', 2, '乙'), ('w3', 3, '丙')`)
        .run()
      raw
        .prepare(`INSERT INTO widget_parts (id, widget_id, name) VALUES ('p1', 'w1', '钉'), ('p2', 'w3', '铆')`)
        .run()
      raw.close()
    }
    const db = openDatabase(file, { migrations: [RECIPE], schemaVersion: 2 })
    const moved = db
      .prepare<unknown[], { id: string; dimensions: number; label: string }>(
        `SELECT id, dimensions, label FROM widgets ORDER BY id`,
      )
      .all()
    expect(moved).toEqual([
      { id: 'w1', dimensions: 1, label: '甲' },
      { id: 'w2', dimensions: 2, label: '乙' },
      { id: 'w3', dimensions: 3, label: '丙' },
    ])
    expect(db.prepare(`SELECT COUNT(*) AS n FROM widget_parts`).get()).toEqual({ n: 2 })
    expect(db.pragma('foreign_key_check')).toEqual([])
    const legacy = db
      .prepare<unknown[], { name: string }>(
        `SELECT name FROM sqlite_master WHERE name IN ('widgets_new', 'widget_parts_tmp')`,
      )
      .get()
    expect(legacy).toBeUndefined()
    db.close()
  })

  it('原子性：搬数中途失败 → 整体回滚（旧表结构原状、子表行保留、版本不推进）', () => {
    const file = join(freshWs('recipe-rebuild-atomic'), 'recipe.db')
    buildRecipeFixture(file, BASE_DDL)
    {
      const raw = new Database(file)
      raw.prepare(`INSERT INTO widgets (id, size, label) VALUES ('w1', 1, '甲')`).run()
      raw.prepare(`INSERT INTO widget_parts (id, widget_id, name) VALUES ('p1', 'w1', '钉')`).run()
      raw.close()
    }
    const broken: Migration = {
      version: 2,
      statements: [
        `CREATE TABLE widget_parts_tmp (id TEXT PRIMARY KEY, widget_id TEXT NOT NULL, name TEXT NOT NULL)`,
        `INSERT INTO widget_parts_tmp SELECT * FROM widget_parts`,
        `CREATE TABLE widgets_new (id TEXT PRIMARY KEY, dimensions INTEGER NOT NULL, label TEXT)`,
        `INSERT INTO widgets_new (id, dimensions, label) SELECT id, size FROM widgets`,
        `DROP TABLE widget_parts`,
        `DROP TABLE widgets`,
        `ALTER TABLE widgets_new RENAME TO widgets`,
        `CREATE TABLE widget_parts (id TEXT PRIMARY KEY, widget_id TEXT NOT NULL REFERENCES widgets(id), name TEXT NOT NULL)`,
        `INSERT INTO widget_parts SELECT * FROM widget_parts_tmp`,
        `DROP TABLE widget_parts_tmp`,
      ],
    }
    expect(() => openDatabase(file, { migrations: [broken], schemaVersion: 2 })).toThrowError()
    const raw = new Database(file)
    const cols = (raw.pragma(`table_info('widgets')`) as Array<{ name: string }>).map((c) => c.name)
    expect(cols).toEqual(['id', 'size', 'label'])
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM widgets`).get()).toEqual({ n: 1 })
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM widget_parts`).get()).toEqual({ n: 1 })
    expect(raw.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(1)
    expect(raw.pragma('foreign_key_check')).toEqual([])
    raw.close()
  })
})
