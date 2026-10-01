// 任务 2.1 测试 —— schema 蓝本对齐 pin（AC4：迁移函数与 DDL 单一来源对齐 design/schema.sql）。
// 权威来源：docs/features/dsh-forge-p1-mvp/design/schema.sql（五表 + 七索引唯一蓝本）。
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS, SCHEMA_VERSION } from './schema.js'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../../../')
const BLUEPRINT = 'docs/features/dsh-forge-p1-mvp/design/schema.sql'

/** 语句归一化（空白折叠）后比对——蓝本与代码的排版差异不应导致语义漂移。 */
const norm = (s: string) =>
  s
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

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

describe('AC4 迁移 DDL 与 design/schema.sql 单一来源对齐', () => {
  it('蓝本文件在库内可解析（pin 前置条件）', () => {
    expect(existsSync(resolve(ROOT, BLUEPRINT))).toBe(true)
  })

  it('蓝本语句集 = 迁移语句集（逐条精确匹配，防漂移）', () => {
    const expected = blueprintStatements()
    const actual = MIGRATIONS.flatMap((m) => m.statements.map(norm))
    expect(actual).toEqual(expected)
  })

  it('五表 + 七索引全量承载（DDL executes / indexes created 合并覆盖 AC1）', () => {
    const tables = MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /^CREATE TABLE/i.test(norm(s))),
    )
    const indexes = MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /^CREATE (?:UNIQUE )?INDEX/i.test(norm(s))),
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
