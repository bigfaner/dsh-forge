// 任务 1.2 测试 —— 工作区库 schema 蓝本对齐 pin（AC1 / G1-12：每工作区 DB 布局
// schema.sql ↔ WORKSPACE_MIGRATIONS 逐条，防漂移）。
// 权威蓝本：docs/features/dsh-forge-m2-pipeline/design/schema.sql
// （七域表 + schema_meta + app_key_logs 基建表 + 索引 ×6 + append-only 双触发器）。
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FORGE_DB_SCHEMA_VERSION, WORKSPACE_MIGRATIONS } from './migrations.js'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../../../../')
const BLUEPRINT = 'docs/features/dsh-forge-m2-pipeline/design/schema.sql'

/** 语句归一化（剔注释 + 空白折叠）后比对——蓝本与代码的排版差异不应导致语义漂移。 */
const norm = (s: string) =>
  s
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function blueprintStatements(): string[] {
  const sql = readFileSync(resolve(ROOT, BLUEPRINT), 'utf8')
  // 先剔除行注释再切分（蓝本中文注释内可含分号，先 split 会把后半段注释并入后续语句）。
  // 触发体内部自带分号（BEGIN … RAISE(…); END）——切分后续接未完结的 CREATE TRIGGER 段，
  // 以 END 收口后再比对（工作区蓝本独有；中央 p1 蓝本无触发器）。
  const segments = sql
    .replace(/--[^\n]*/g, '\n')
    .split(';')
    .map((s) => norm(s))
    .filter((s) => s.length > 0)
  const out: string[] = []
  for (const seg of segments) {
    const prev = out[out.length - 1]
    if (prev !== undefined && /^CREATE TRIGGER/i.test(prev) && !/ END$/i.test(prev)) {
      out[out.length - 1] = `${prev}; ${seg}`
      continue
    }
    out.push(seg)
  }
  return out.filter((s) => /^CREATE (TABLE|UNIQUE INDEX|INDEX|TRIGGER)/i.test(s))
}

describe('AC1 工作区 MIGRATIONS 与 design/schema.sql 单一来源对齐（G1-12 逐条 pin）', () => {
  it('蓝本文件在库内可解析（pin 前置条件）', () => {
    expect(existsSync(resolve(ROOT, BLUEPRINT))).toBe(true)
  })

  it('蓝本语句集 = 迁移语句集（逐条精确匹配，防漂移）', () => {
    const expected = blueprintStatements()
    const actual = WORKSPACE_MIGRATIONS.flatMap((m) => m.statements.map(norm))
    expect(actual).toEqual(expected)
  })

  it('九表 + 六索引 + 双触发器全量承载（七域表 + schema_meta + app_key_logs 基建表）', () => {
    const tables = WORKSPACE_MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /^CREATE TABLE/i.test(norm(s))),
    )
    const indexes = WORKSPACE_MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /^CREATE (?:UNIQUE )?INDEX/i.test(norm(s))),
    )
    const triggers = WORKSPACE_MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /^CREATE TRIGGER/i.test(norm(s))),
    )
    expect(tables).toHaveLength(9)
    expect(indexes).toHaveLength(6)
    expect(triggers).toHaveLength(2)
  })

  it('迁移版本序列从 1 连续递增至 FORGE_DB_SCHEMA_VERSION（独立版本线，前向单向）', () => {
    expect(WORKSPACE_MIGRATIONS.map((m) => m.version)).toEqual(
      Array.from({ length: FORGE_DB_SCHEMA_VERSION }, (_, i) => i + 1),
    )
    expect(FORGE_DB_SCHEMA_VERSION).toBe(1)
  })

  it('FK 一律无 ON DELETE（Hard Rule——M2 无删除动词）', () => {
    const fkStatements = WORKSPACE_MIGRATIONS.flatMap((m) => m.statements).filter((s) =>
      /REFERENCES/i.test(s),
    )
    expect(fkStatements.length).toBeGreaterThan(0)
    for (const stmt of fkStatements) {
      expect(norm(stmt), stmt).not.toMatch(/ON DELETE/i)
    }
  })
})
