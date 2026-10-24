// 任务 1.2 测试 —— 工作区库 schema 蓝本对齐 pin（AC1 / G1-12：每工作区 DB 布局
// schema.sql ↔ WORKSPACE_MIGRATIONS 逐条，防漂移）。
// 权威蓝本：docs/features/dsh-forge-m3-bootstrap-presets/design/schema.sql（M3 终态——
// 八域表 + schema_meta + app_key_logs 基建表 + 索引 ×7 + append-only 四触发器）。
// fix-bug 增补：bugs 单表 + idx_bugs_status 为 v1 追加段（不在 M3 蓝本内）——单一来源 =
// .forge/docs/proposals/fix-bug/proposal.md「技术细节·持久化」节，BUGS_DDL 逐条 pin 附加到
// 蓝本对齐面之后（语句顺序：只加不改）。
// migration-hardening 增补：v2 收敛式（CREATE TABLE IF NOT EXISTS bugs 21 列终态 + 守卫式
// ALTER 补列）——三谱系收敛，migrations.lineage.test.ts 夹具回归锁死；已发布迁移禁改语句
// （头注纪律，指纹守卫 MigrationTamperedError 兜底）。
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type MigrationStatement } from '../../db/schema.js'
import { FORGE_DB_SCHEMA_VERSION, WORKSPACE_MIGRATIONS } from './migrations.js'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../../../../')
const BLUEPRINT = 'docs/features/dsh-forge-m3-bootstrap-presets/design/schema.sql'

/**
 * fix-bug 提案 DDL（单一来源拷贝——proposal.md「技术细节·持久化」节 SQL，剔注释逐字照建；
 * v1 追加段，紧跟蓝本语句集之后）。
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

/** v2 收敛式三条语句的 SQL 文本 pin（守卫字段不在文本面——守卫语义由 lineage 测试行为锁死） */
const BUGS_V2_SQL = [
  `CREATE TABLE IF NOT EXISTS bugs (
    id               TEXT PRIMARY KEY,
    summary          TEXT NOT NULL,
    bug_desc         TEXT NOT NULL,
    trigger_desc     TEXT NOT NULL,
    expected         TEXT NOT NULL,
    actual           TEXT NOT NULL,
    suspected        TEXT,
    error_type       TEXT,
    bug_status       TEXT NOT NULL DEFAULT 'open'
                     CONSTRAINT ck_bugs_status
                     CHECK (bug_status IN ('open', 'fixed', 'unresolved')),
    commit_hash      TEXT,
    worktree         TEXT,
    branch           TEXT,
    unresolved_reason TEXT,
    source_task_id   TEXT REFERENCES tasks(id),
    report_session_id TEXT,
    fix_session_id   TEXT,
    reporter         TEXT NOT NULL,
    fixer            TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    fix_approach     TEXT
)`,
  `CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(bug_status, created_at)`,
  `ALTER TABLE bugs ADD COLUMN fix_approach TEXT`,
]

/** v3（bug-recurrence-chain）：守卫式 ALTER bugs ADD COLUMN recurrence_of（v2 谱系先例同构） */
const BUGS_V3_SQL = [`ALTER TABLE bugs ADD COLUMN recurrence_of TEXT`]

/**
 * 机械①（forge-verification-hardening）v5：implementation_checkpoints 实现检查点流水 DDL
 * pin（proposal.md「实体设计」节为契约单源）。
 */
const CHECKPOINTS_V5_SQL = [
  `CREATE TABLE implementation_checkpoints (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id           TEXT NOT NULL REFERENCES proposals(id),
    mark                  TEXT NOT NULL
                          CONSTRAINT ck_impl_cp_mark CHECK (mark IN
                            ('first-pass-complete', 'retro-done', 'review-wave-N',
                             'stabilized', 'merged', 'derived-to-child')),
    wave_seq              INTEGER,
    created_at            TEXT NOT NULL,
    base_commit_hash      TEXT NOT NULL,
    tasks_total           INTEGER NOT NULL,
    commits_total         INTEGER NOT NULL,
    fixes_total           INTEGER NOT NULL,
    evidence_debts_total  INTEGER NOT NULL
)`,
  `CREATE UNIQUE INDEX uq_impl_cp_milestone ON implementation_checkpoints(proposal_id, mark, wave_seq)
     WHERE mark IN ('first-pass-complete', 'retro-done', 'review-wave-N', 'stabilized', 'merged')`,
  `CREATE INDEX idx_impl_cp_proposal ON implementation_checkpoints(proposal_id, created_at)`,
  `CREATE TRIGGER trg_impl_cp_no_update BEFORE UPDATE ON implementation_checkpoints
BEGIN SELECT RAISE(ABORT, 'implementation_checkpoints: append-only violation (update)'); END`,
  `CREATE TRIGGER trg_impl_cp_no_delete BEFORE DELETE ON implementation_checkpoints
BEGIN SELECT RAISE(ABORT, 'implementation_checkpoints: append-only violation (delete)'); END`,
]

/** 语句归一化（剔注释 + 空白折叠）后比对——蓝本与代码的排版差异不应导致语义漂移。 */
const norm = (s: string) =>
  s
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** MigrationStatement → SQL 文本（守卫形态取 sql 字段——守卫列由行为测试另行锁死）。 */
const stmtText = (s: MigrationStatement): string => norm(typeof s === 'string' ? s : s.sql)

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

  it('蓝本语句集 = 迁移语句集（逐条精确匹配，防漂移；+fix-bug bugs DDL 追加段 + v2 收敛段 + v4 surface 退役段 + v5 checkpoints 段）', () => {
    const expected = [
      ...blueprintStatements(),
      ...BUGS_DDL.map(norm),
      ...BUGS_V2_SQL.map(norm),
      ...BUGS_V3_SQL.map(norm),
      ...WORKSPACE_MIGRATIONS[3]!.statements.map(stmtText),
      ...CHECKPOINTS_V5_SQL.map(norm),
    ]
    const actual = WORKSPACE_MIGRATIONS.flatMap((m) => m.statements.map(stmtText))
    expect(actual).toEqual(expected)
  })

  it('十四表 + 十一索引 + 六触发器全量承载（八域表 + schema_meta + app_key_logs + migration_digests 外的 v2 收敛 bugs 表 + v4 归档表 + v5 检查点表；fix-bug bugs 表 + v2 IF NOT EXISTS 形态）', () => {
    const tables = WORKSPACE_MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /^CREATE TABLE/i.test(stmtText(s))),
    )
    const indexes = WORKSPACE_MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /^CREATE (?:UNIQUE )?INDEX/i.test(stmtText(s))),
    )
    const triggers = WORKSPACE_MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /^CREATE TRIGGER/i.test(stmtText(s))),
    )
    expect(tables).toHaveLength(14)
    expect(indexes).toHaveLength(11)
    expect(triggers).toHaveLength(6)
  })

  it('bugs 单表 20 列（fix-bug 提案持久化节照建；bug_status CHECK 三态 + source_task_id FK）', () => {
    const createBugs = WORKSPACE_MIGRATIONS.flatMap((m) => m.statements).find((s) =>
      /^CREATE TABLE bugs/i.test(stmtText(s)),
    )
    expect(createBugs).toBeDefined()
    const cols = [...stmtText(createBugs!).matchAll(/\b([a-z_]+)\s+(TEXT|INTEGER|REAL)/g)].map(
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
    expect(stmtText(createBugs!)).toContain(
      "CHECK (bug_status IN ('open', 'fixed', 'unresolved'))",
    )
    expect(stmtText(createBugs!)).toContain('REFERENCES tasks(id)')
  })

  it('idx_bugs_status(bug_status, created_at) 在场（状态 chips + 排序读面）', () => {
    const idx = WORKSPACE_MIGRATIONS.flatMap((m) => m.statements).find((s) =>
      /^CREATE INDEX idx_bugs_status/i.test(stmtText(s)),
    )
    expect(stmtText(idx!)).toBe('CREATE INDEX idx_bugs_status ON bugs(bug_status, created_at)')
  })

  it('迁移版本序列从 1 连续递增至 FORGE_DB_SCHEMA_VERSION（独立版本线，前向单向）', () => {
    expect(WORKSPACE_MIGRATIONS.map((m) => m.version)).toEqual(
      Array.from({ length: FORGE_DB_SCHEMA_VERSION }, (_, i) => i + 1),
    )
    expect(FORGE_DB_SCHEMA_VERSION).toBe(5)
  })

  it('v5（机械①）：implementation_checkpoints DDL——partial unique index 圈定里程碑唯一约束 + 时序索引 + append-only 双触发器', () => {
    const v5 = WORKSPACE_MIGRATIONS.find((m) => m.version === 5)
    expect(v5?.statements.map(stmtText)).toEqual(CHECKPOINTS_V5_SQL.map(norm))
    const createTable = stmtText(v5!.statements[0]!)
    // 零业务引用字段：十列全量 pin（id/proposal_id/mark/wave_seq/created_at/base_commit_hash + 四列计数快照）
    expect(createTable).toContain('REFERENCES proposals(id)')
    for (const col of [
      'proposal_id',
      'mark',
      'wave_seq',
      'created_at',
      'base_commit_hash',
      'tasks_total',
      'commits_total',
      'fixes_total',
      'evidence_debts_total',
    ]) {
      expect(createTable).toContain(col)
    }
    // 唯一约束仅作用于五类里程碑标记（partial index；derived-to-child 豁免）
    const uq = stmtText(v5!.statements[1]!)
    expect(uq).toContain('UNIQUE INDEX uq_impl_cp_milestone')
    expect(uq).toContain('WHERE mark IN')
    expect(uq).not.toContain('derived-to-child')
    // 时序查询主径
    expect(stmtText(v5!.statements[2]!)).toBe(
      'CREATE INDEX idx_impl_cp_proposal ON implementation_checkpoints(proposal_id, created_at)',
    )
  })

  it('v4：surface 退役——归档表 + 存量归档 + 守卫式 DROP COLUMN×2（dropGuard：列不在场跳过）', () => {
    const v4 = WORKSPACE_MIGRATIONS.find((m) => m.version === 4)
    const stmts = v4!.statements
    expect(stmts).toHaveLength(4)
    expect(stmtText(stmts[0]!)).toContain('CREATE TABLE IF NOT EXISTS tasks_surface_archive')
    expect(stmtText(stmts[1]!)).toContain('INSERT INTO tasks_surface_archive')
    expect(stmtText(stmts[1]!)).toContain('WHERE surface_key IS NOT NULL OR surface_type IS NOT NULL')
    expect(stmts[2]).toEqual({
      sql: `ALTER TABLE tasks DROP COLUMN surface_key`,
      dropGuard: { table: 'tasks', column: 'surface_key' },
    })
    expect(stmts[3]).toEqual({
      sql: `ALTER TABLE tasks DROP COLUMN surface_type`,
      dropGuard: { table: 'tasks', column: 'surface_type' },
    })
  })

  it('v3：守卫式 ALTER bugs ADD COLUMN recurrence_of（可空前驱指针——既有扁平台账行无损）', () => {
    const v3 = WORKSPACE_MIGRATIONS.find((m) => m.version === 3)
    expect(v3?.statements.map(stmtText)).toEqual(BUGS_V3_SQL.map(norm))
    const stmts = v3!.statements
    expect(stmts).toHaveLength(1)
    expect(stmts[0]).toEqual({
      sql: `ALTER TABLE bugs ADD COLUMN recurrence_of TEXT`,
      columnGuard: { table: 'bugs', column: 'recurrence_of' },
    })
  })

  it('v2 收敛式：CREATE IF NOT EXISTS bugs（21 列含 fix_approach 内联）+ CREATE INDEX IF NOT EXISTS + 守卫式 ALTER 补列', () => {
    const v2 = WORKSPACE_MIGRATIONS.find((m) => m.version === 2)
    expect(v2?.statements.map(stmtText)).toEqual(BUGS_V2_SQL.map(norm))
    // 守卫字段逐条 pin：①IF NOT EXISTS 建表无守卫；③ALTER 带 bugs.fix_approach 列守卫
    const stmts = v2!.statements
    expect('columnGuard' in (stmts[0] as object)).toBe(false)
    expect(stmts[2]).toEqual({
      sql: `ALTER TABLE bugs ADD COLUMN fix_approach TEXT`,
      columnGuard: { table: 'bugs', column: 'fix_approach' },
    })
    // 21 列终态（20 列 + fix_approach 内联）
    const createIfNotExists = stmtText(stmts[0]!)
    expect(createIfNotExists).toContain('IF NOT EXISTS')
    const cols = [...createIfNotExists.matchAll(/\b([a-z_]+)\s+(TEXT|INTEGER|REAL)/g)].map((m) => m[1])
    expect(cols).toHaveLength(21)
    expect(cols[cols.length - 1]).toBe('fix_approach')
  })

  it('FK 一律无 ON DELETE（Hard Rule——M2 无删除动词）', () => {
    const fkStatements = WORKSPACE_MIGRATIONS.flatMap((m) => m.statements).filter((s) =>
      /REFERENCES/i.test(stmtText(s)),
    )
    expect(fkStatements.length).toBeGreaterThan(0)
    for (const stmt of fkStatements) {
      expect(stmtText(stmt), stmtText(stmt)).not.toMatch(/ON DELETE/i)
    }
  })
})
