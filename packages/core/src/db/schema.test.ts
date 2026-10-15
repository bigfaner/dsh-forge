// 任务 2.1 测试 —— schema 蓝本对齐 pin（AC4：迁移函数与 DDL 单一来源对齐 design/schema.sql）。
// 权威来源：docs/features/dsh-forge-p1-mvp/design/schema.sql（五表 + 七索引唯一蓝本）。
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
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
})
