// 任务 2.1 测试 —— schema 蓝本对齐 pin（AC4：迁移函数与 DDL 单一来源对齐 design/schema.sql）。
// 权威来源：docs/features/dsh-forge-p1-mvp/design/schema.sql（五表 + 七索引唯一蓝本）。
// project-manual-order 1.1 增补：v3 sort_order 列 pin + 迁移行为单测（存量首启一次迁移 /
// 二次启动零迁移 / 失败回滚无半迁移 / 全新空库链路走完）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { openDatabase } from './index.js'
import { MIGRATIONS, SCHEMA_VERSION, WORKTREE_DIR_BACKFILL_SQL } from './schema.js'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../../../')
const BLUEPRINT = 'docs/features/dsh-forge-p1-mvp/design/schema.sql'

/** 语句归一化（空白折叠）后比对——蓝本与代码的排版差异不应导致语义漂移。 */
const norm = (s: string) =>
  s
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** MigrationStatement → SQL 文本（守卫形态取 sql 字段——中央序列全裸 SQL，类型面兜守卫扩展）。 */
const stmtText = (s: import('./schema.js').MigrationStatement): string =>
  norm(typeof s === 'string' ? s : s.sql)

function blueprintStatements(): string[] {
  const sql = readFileSync(resolve(ROOT, BLUEPRINT), 'utf8')
  // 先剔除行注释再切分：蓝本中文注释内含分号（如「唯一 SoT;」「整表重建; SC2」），
  // 先 split 会把后半段注释并入后续语句导致整条 CREATE 丢失。
  return sql
    .replace(/--[^\n]*/g, '\n')
    .split(';')
    .map((s) => norm(s))
    .filter((s) => /^CREATE (TABLE|UNIQUE INDEX|INDEX)/i.test(s))
}

/** v2 收敛式语句的 SQL 文本 pin（守卫字段不在文本面——守卫语义由 db.test.ts 行为锁死）。 */
const PROJECTS_V2_SQL = [
  `ALTER TABLE projects ADD COLUMN worktree_dir TEXT NOT NULL DEFAULT ''`,
  WORKTREE_DIR_BACKFILL_SQL,
]

describe('AC4 迁移 DDL 与 design/schema.sql 单一来源对齐', () => {
  it('蓝本文件在库内可解析（pin 前置条件）', () => {
    expect(existsSync(resolve(ROOT, BLUEPRINT))).toBe(true)
  })

  it('蓝本语句集 = v1 迁移语句集（逐条精确匹配，防漂移；v2 收敛段另行 pin）', () => {
    const expected = blueprintStatements()
    const actual = MIGRATIONS.find((m) => m.version === 1)!.statements.map(stmtText)
    expect(actual).toEqual(expected)
  })

  it('v2 收敛式：守卫式 ALTER 补 worktree_dir NOT NULL（projects）+ 存量回填（ws_path 解析 .forge/worktrees）', () => {
    const v2 = MIGRATIONS.find((m) => m.version === 2)
    expect(v2?.statements.map(stmtText)).toEqual(PROJECTS_V2_SQL.map(norm))
    const stmts = v2!.statements
    expect(stmts[0]).toEqual({
      sql: `ALTER TABLE projects ADD COLUMN worktree_dir TEXT NOT NULL DEFAULT ''`,
      columnGuard: { table: 'projects', column: 'worktree_dir' },
    })
    expect(stmtText(stmts[1]!)).toContain(`'.forge'`)
    expect(stmtText(stmts[1]!)).toContain(`'worktrees'`)
    expect(stmtText(stmts[1]!)).toMatch(/WHERE worktree_dir = ''$/)
  })

  it('五表 + 七索引全量承载（DDL executes / indexes created 合并覆盖 AC1）', () => {
    const tables = MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /^CREATE TABLE/i.test(stmtText(s))),
    )
    const indexes = MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /^CREATE (?:UNIQUE )?INDEX/i.test(stmtText(s))),
    )
    expect(tables).toHaveLength(5)
    expect(indexes).toHaveLength(7)
  })

  it('迁移版本序列从 1 连续递增至 SCHEMA_VERSION（前向单向）', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(
      Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1),
    )
  })

  it('v3（project-manual-order）：守卫式 ALTER projects ADD COLUMN sort_order INTEGER DEFAULT NULL（无回填——存量行保持 NULL）', () => {
    expect(SCHEMA_VERSION).toBe(3)
    const v3 = MIGRATIONS.find((m) => m.version === 3)
    expect(v3?.statements).toEqual([
      {
        sql: `ALTER TABLE projects ADD COLUMN sort_order INTEGER DEFAULT NULL`,
        columnGuard: { table: 'projects', column: 'sort_order' },
      },
    ])
  })
})

// ── project-manual-order 1.1：v3 迁移行为单测（临时库逐用例独占） ──

let behaviorDir: string | undefined
afterAll(() => {
  if (behaviorDir) rmSync(behaviorDir, { recursive: true, force: true })
})
const behaviorFile = (name: string): string => {
  behaviorDir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-schema-v3-'))
  const file = join(behaviorDir, name)
  mkdirSync(behaviorDir, { recursive: true })
  return file
}

/** 存量 v2 形态库（直执 v1+v2 冻结语句 + 种一行 + version=2 版本行——不经 openDatabase） */
function buildLegacyV2(file: string): void {
  const raw = new Database(file)
  try {
    for (const stmt of [...MIGRATIONS[0]!.statements, ...MIGRATIONS[1]!.statements]) {
      raw.prepare(typeof stmt === 'string' ? stmt : stmt.sql).run()
    }
    raw
      .prepare(
        `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, knowledge_dir, created_at, updated_at)
         VALUES ('p1', 'w1', 'Z:\\proj', 'proj', 'Z:\\proj\\.forge', 'Z:\\proj\\.knowledge', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      .run()
    raw.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (2, '2026-01-01T00:00:00.000Z')`).run()
  } finally {
    raw.close()
  }
}

describe('v3 sort_order 迁移行为（project-manual-order 1.1）', () => {
  it('存量 v2 库首启自动执行一次：版本到位 + v3 指纹落 migration_digests + 存量行 sort_order 保持 NULL', () => {
    const file = behaviorFile('legacy-v2.db')
    buildLegacyV2(file)
    const db = openDatabase(file)
    expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(3)
    const digest = db.prepare<unknown[], { digest: string }>(`SELECT digest FROM migration_digests WHERE version = 3`).get()
    expect(digest?.digest).toBeTruthy()
    const cols = (db.pragma(`table_info('projects')`) as Array<{ name: string }>).map((c) => c.name)
    expect(cols).toContain('sort_order')
    expect(db.prepare<unknown[], { sort_order: number | null }>(`SELECT sort_order FROM projects WHERE id = 'p1'`).get()).toEqual({
      sort_order: null,
    })
    db.close()
  })

  it('二次启动零迁移语句执行：schema_meta v3 行仍恰一条（版本行未重复插入）、digest 不变', () => {
    const file = behaviorFile('legacy-v2-reopen.db')
    buildLegacyV2(file)
    const first = openDatabase(file)
    const digestBefore = first.prepare<unknown[], { digest: string }>(`SELECT digest FROM migration_digests WHERE version = 3`).get()
    const appliedBefore = first
      .prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM schema_meta WHERE version = 3`)
      .get()?.n
    first.close()
    const second = openDatabase(file)
    expect(
      second.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM schema_meta WHERE version = 3`).get()?.n,
    ).toBe(appliedBefore)
    expect(second.prepare<unknown[], { digest: string }>(`SELECT digest FROM migration_digests WHERE version = 3`).get()).toEqual(
      digestBefore,
    )
    second.close()
  })

  it('全新空库首启：迁移链一次走完，projects 表含 sort_order 列且新行默认 NULL', () => {
    const file = behaviorFile('fresh.db')
    const db = openDatabase(file)
    expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(3)
    const cols = (db.pragma(`table_info('projects')`) as Array<{ name: string }>).map((c) => c.name)
    expect(cols).toContain('sort_order')
    db.prepare(
      `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, knowledge_dir, created_at, updated_at)
       VALUES ('p1', 'w1', 'Z:\\proj', 'proj', 'Z:\\proj\\.forge', 'Z:\\proj\\.knowledge', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    ).run()
    expect(db.prepare<unknown[], { sort_order: number | null }>(`SELECT sort_order FROM projects`).get()).toEqual({
      sort_order: null,
    })
    db.close()
  })

  it('人为注入迁移失败：事务回滚——schema 版本不变、无 sort_order 列、存量行原状（无半迁移）', () => {
    const file = behaviorFile('legacy-v2-broken.db')
    buildLegacyV2(file)
    const broken = {
      version: 3,
      statements: [
        {
          sql: `ALTER TABLE projects ADD COLUMN sort_order INTEGER DEFAULT NULL`,
          columnGuard: { table: 'projects', column: 'sort_order' },
        },
        `UPDATE projects SET sort_order = missing_column`, // 人为失败注入点
      ],
    } as const
    expect(() =>
      openDatabase(file, { migrations: [...MIGRATIONS.slice(0, 2), broken], schemaVersion: 3 }),
    ).toThrowError(/no such column/)
    const raw = new Database(file)
    try {
      expect(raw.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(2)
      const cols = (raw.pragma(`table_info('projects')`) as Array<{ name: string }>).map((c) => c.name)
      expect(cols).not.toContain('sort_order')
      expect(raw.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM projects`).get()).toEqual({ n: 1 })
    } finally {
      raw.close()
    }
  })
})
