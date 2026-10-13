// 任务 1.2 测试 —— 工作区库 schema 蓝本对齐 pin（AC1 / G1-12：每工作区 DB 布局
// schema.sql ↔ WORKSPACE_MIGRATIONS 逐条，防漂移）。
// 权威蓝本：docs/features/dsh-forge-m3-bootstrap-presets/design/schema.sql（M3 终态——
// v1 直改裁决③：八域表 + schema_meta + app_key_logs 基建表 + 索引 ×7 + append-only 四触发器；
// FORGE_DB_SCHEMA_VERSION = 1 不变、无迁移路径、存量 dogfood 库废弃手工删除）。
// fix-bug 增补：bugs 单表 + idx_bugs_status 为 v1 直改追加段（不在 M3 蓝本内）——单一来源 =
// .forge/docs/proposals/fix-bug/proposal.md「技术细节·持久化」节，BUGS_DDL 逐条 pin 附加到
// 蓝本对齐面之后（语句顺序：只加不改）。
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FORGE_DB_SCHEMA_VERSION, WORKSPACE_MIGRATIONS } from './migrations.js'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../../../../')
const BLUEPRINT = 'docs/features/dsh-forge-m3-bootstrap-presets/design/schema.sql'

/**
 * fix-bug 提案 DDL（单一来源拷贝——proposal.md「技术细节·持久化」节 SQL，剔注释逐字照建；
 * v1 直改追加段，紧跟蓝本语句集之后）。
 */
const BUGS_DDL = [
  `CREATE TABLE bugs (
    id               TEXT PRIMARY KEY,
    summary          TEXT NOT NULL,   -- 一句话摘要（≤50 字，登记时生成——列表主行 + search 命中面）
    bug_desc         TEXT NOT NULL,   -- Bug：完整描述
    trigger_desc     TEXT NOT NULL,   -- Trigger：复现步骤/输入
    expected         TEXT NOT NULL,   -- Expected：正确行为
    actual           TEXT NOT NULL,   -- Actual：观察到的行为
    suspected        TEXT,            -- Suspected location（file:line——open 态续修线索，可空）
    error_type       TEXT,            -- 错误类型（自由标注——统计维度备料，可空）
    bug_status       TEXT NOT NULL DEFAULT 'open'
                     CONSTRAINT ck_bugs_status
                     CHECK (bug_status IN ('open', 'fixed', 'unresolved')),
    commit_hash      TEXT,            -- ┐
    worktree         TEXT,            -- ├ fixed 证据（回填时写）
    branch           TEXT,            -- ┘
    unresolved_reason TEXT,           -- unresolved 原因（回填时写）
    source_task_id   TEXT REFERENCES tasks(id),  -- coding-fix 委托来源任务（可空）
    report_session_id TEXT,          -- 发现会话（登记时写——工具执行会话自动携带）
    fix_session_id   TEXT,            -- 修复会话（fixed 回填时写——同前）
    reporter         TEXT NOT NULL,   -- 发现者（git user.name，缺席回退 user.email——登记时解析）
    fixer            TEXT,            -- 修复者（同解析规则——fixed 回填时写）
    created_at       TEXT NOT NULL,   -- 登记时刻
    updated_at       TEXT NOT NULL    -- 回填时刻（未回填 = created_at）
)`,
  `CREATE INDEX idx_bugs_status ON bugs(bug_status, created_at)`,
]

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

  it('蓝本语句集 = 迁移语句集（逐条精确匹配，防漂移；fix-bug：+提案 bugs DDL 追加段）', () => {
    const expected = [...blueprintStatements(), ...BUGS_DDL.map(norm)]
    const actual = WORKSPACE_MIGRATIONS.flatMap((m) => m.statements.map(norm))
    expect(actual).toEqual(expected)
  })

  it('十一表 + 八索引 + 四触发器全量承载（八域表 + schema_meta + app_key_logs 基建表 + fix-bug bugs 表）', () => {
    const tables = WORKSPACE_MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /^CREATE TABLE/i.test(norm(s))),
    )
    const indexes = WORKSPACE_MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /^CREATE (?:UNIQUE )?INDEX/i.test(norm(s))),
    )
    const triggers = WORKSPACE_MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /^CREATE TRIGGER/i.test(norm(s))),
    )
    expect(tables).toHaveLength(11)
    expect(indexes).toHaveLength(8)
    expect(triggers).toHaveLength(4)
  })

  it('bugs 单表 20 列（fix-bug 提案持久化节照建；bug_status CHECK 三态 + source_task_id FK）', () => {
    const createBugs = WORKSPACE_MIGRATIONS.flatMap((m) => m.statements).find((s) =>
      /^CREATE TABLE bugs/i.test(norm(s)),
    )
    expect(createBugs).toBeDefined()
    const cols = [...createBugs!.matchAll(/^\s{4}([a-z_]+)\s+(TEXT|INTEGER|REAL)/gm)].map(
      (m) => m[1],
    )
    expect(cols).toEqual([
      'id',
      'summary',
      'bug_desc',
      'trigger_desc',
      'expected',
      'actual',
      'suspected',
      'error_type',
      'bug_status',
      'commit_hash',
      'worktree',
      'branch',
      'unresolved_reason',
      'source_task_id',
      'report_session_id',
      'fix_session_id',
      'reporter',
      'fixer',
      'created_at',
      'updated_at',
    ])
    expect(norm(createBugs!)).toContain(
      "CHECK (bug_status IN ('open', 'fixed', 'unresolved'))",
    )
    expect(norm(createBugs!)).toContain('REFERENCES tasks(id)')
  })

  it('idx_bugs_status(bug_status, created_at) 在场（状态 chips + 排序读面）', () => {
    const idx = WORKSPACE_MIGRATIONS.flatMap((m) => m.statements).find((s) =>
      /^CREATE INDEX idx_bugs_status/i.test(norm(s)),
    )
    expect(norm(idx!)).toBe('CREATE INDEX idx_bugs_status ON bugs(bug_status, created_at)')
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
