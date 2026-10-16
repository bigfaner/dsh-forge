// 工作区任务库（forge.db）schema 迁移序列。迁移纪律、改 schema 检查清单与数据迁移配方
// 单一来源：docs/conventions/db-migrations.md（已发布迁移禁改语句，只能追加新版本）。
// Hard Rule——本序列经 openDatabase 参数化传入（db/open.ts options），中央 MIGRATIONS 硬编码 import 勿照抄。
// 保留字已清剿（task_type/task_status 等，禁 key/type/status/description）；PRAGMA（WAL / foreign_keys）
// 在 openDatabase 打开时设置，不入迁移语句。
import type { Migration } from '../../db/index.js'

/** 工作区库 schema 版本上限（独立版本线；版本门：库内 version 超出即拒绝打开）。 */
export const FORGE_DB_SCHEMA_VERSION = 3

/**
 * v1（M3 终态·直改）：八域表 + schema_meta + app_key_logs 基建表 + 索引 ×7 + append-only 四触发器。
 * 蓝本 = docs/features/dsh-forge-m3-bootstrap-presets/design/schema.sql；语句顺序与蓝本一致。
 */
export const WORKSPACE_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE schema_meta (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL
)`,
      `CREATE TABLE app_key_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    level       TEXT NOT NULL CONSTRAINT ck_wkl_level CHECK (level IN ('warn', 'error')),
    scope       TEXT NOT NULL CONSTRAINT ck_wkl_scope CHECK (scope IN ('tasks', 'workspace')),
    data_json   TEXT NOT NULL,
    created_at  TEXT NOT NULL
)`,
      `CREATE TABLE features (
    id             TEXT PRIMARY KEY,
    slug           TEXT NOT NULL UNIQUE,
    title          TEXT NOT NULL,
    feature_status TEXT NOT NULL DEFAULT 'prd'
                   CONSTRAINT ck_features_status CHECK (feature_status IN
                     ('prd', 'design', 'tasks', 'in-progress', 'completed', 'archived')),
    summary        TEXT,
    proposal_id    TEXT REFERENCES proposals(id),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
)`,
      `CREATE TABLE feature_documents (
    feature_id  TEXT NOT NULL REFERENCES features(id),
    doc_kind    TEXT NOT NULL,
    rel_path    TEXT NOT NULL,
    summary     TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (feature_id, doc_kind)
)`,
      `CREATE TABLE feature_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    feature_id  TEXT NOT NULL REFERENCES features(id),
    verb        TEXT NOT NULL,
    from_status TEXT,
    to_status   TEXT,
    reason      TEXT,
    actor       TEXT NOT NULL
                CONSTRAINT ck_fr_actor CHECK (actor IN ('plugin-tool', 'ui', 'core')),
    session_id  TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
)`,
      `CREATE INDEX idx_fr_feature ON feature_records(feature_id, id)`,
      `CREATE TRIGGER trg_feature_records_no_update BEFORE UPDATE ON feature_records
BEGIN SELECT RAISE(ABORT, 'feature_records: append-only violation (update)'); END`,
      `CREATE TRIGGER trg_feature_records_no_delete BEFORE DELETE ON feature_records
BEGIN SELECT RAISE(ABORT, 'feature_records: append-only violation (delete)'); END`,
      `CREATE TABLE tasks (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL,
    local_id        TEXT NOT NULL,
    title           TEXT NOT NULL,
    task_type       TEXT NOT NULL,
    task_status     TEXT NOT NULL DEFAULT 'pending'
                    CONSTRAINT ck_tasks_status CHECK (task_status IN
                      ('pending', 'in_progress', 'completed', 'blocked',
                       'suspended', 'interrupted', 'skipped', 'rejected')),
    task_desc       TEXT,
    ac_json         TEXT,
    priority        TEXT CONSTRAINT ck_tasks_priority CHECK (priority IN ('P0', 'P1', 'P2')),
    estimated_time  TEXT,
    vars_json       TEXT,
    source_task_id  TEXT REFERENCES tasks(id),
    blocked_reason  TEXT,
    breaking        INTEGER NOT NULL DEFAULT 0
                    CONSTRAINT ck_tasks_breaking CHECK (breaking IN (0, 1)),
    coverage        REAL,
    complexity      TEXT NOT NULL DEFAULT 'medium'
                    CONSTRAINT ck_tasks_complexity CHECK (complexity IN ('low', 'medium', 'high')),
    surface_key     TEXT,
    surface_type    TEXT,
    source_kind     TEXT NOT NULL
                    CONSTRAINT ck_tasks_source_kind CHECK (source_kind IN ('feature', 'proposal')),
    source_id       TEXT NOT NULL,
    mode            TEXT CONSTRAINT ck_tasks_mode
                    CHECK (mode IN ('expedition', 'blitz') OR mode IS NULL),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    CONSTRAINT uq_tasks_slug_local UNIQUE (slug, local_id)
)`,
      `CREATE INDEX idx_tasks_source_status ON tasks(source_id, task_status)`,
      `CREATE INDEX idx_tasks_source        ON tasks(source_task_id)`,
      `CREATE TABLE task_edges (
    task_id          TEXT NOT NULL REFERENCES tasks(id),
    prerequisite_id  TEXT NOT NULL REFERENCES tasks(id),
    origin           TEXT NOT NULL
                     CONSTRAINT ck_edges_origin CHECK (origin IN ('manual', 'fix-chain', 'autoconfig')),
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    PRIMARY KEY (task_id, prerequisite_id)
)`,
      `CREATE INDEX idx_edges_prerequisite ON task_edges(prerequisite_id)`,
      `CREATE TABLE task_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         TEXT NOT NULL REFERENCES tasks(id),
    verb            TEXT NOT NULL,
    from_status     TEXT,
    to_status       TEXT,
    reason          TEXT,
    summary         TEXT,
    files_json      TEXT,
    ac_json         TEXT,
    record_fields_json TEXT,
    gate_json       TEXT,
    commit_hash     TEXT,
    dispatch_digest TEXT,
    loop_sourced    INTEGER NOT NULL DEFAULT 0
                    CONSTRAINT ck_records_loop_sourced CHECK (loop_sourced IN (0, 1)),
    actor           TEXT NOT NULL
                    CONSTRAINT ck_records_actor CHECK (actor IN ('plugin-tool', 'ui', 'core')),
    session_id      TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
)`,
      `CREATE INDEX idx_records_task    ON task_records(task_id, id)`,
      `CREATE INDEX idx_records_session ON task_records(session_id)`,
      `CREATE TRIGGER trg_task_records_no_update BEFORE UPDATE ON task_records
BEGIN SELECT RAISE(ABORT, 'task_records: append-only violation (update)'); END`,
      `CREATE TRIGGER trg_task_records_no_delete BEFORE DELETE ON task_records
BEGIN SELECT RAISE(ABORT, 'task_records: append-only violation (delete)'); END`,
      `CREATE TABLE proposals (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    proposal_status TEXT NOT NULL DEFAULT 'draft'
                    CONSTRAINT ck_proposals_status CHECK (proposal_status IN
                      ('draft', 'under-review', 'accepted', 'rejected', 'superseded')),
    rel_path        TEXT,
    author          TEXT,
    mode            TEXT CONSTRAINT ck_proposals_mode
                    CHECK (mode IN ('expedition', 'blitz') OR mode IS NULL),
    superseded_by   TEXT REFERENCES proposals(id),
    decided_at      TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
)`,
      `CREATE TABLE task_session_links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     TEXT NOT NULL REFERENCES tasks(id),
    session_id  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    CONSTRAINT uq_tsl_task_session UNIQUE (task_id, session_id)
)`,
      `CREATE INDEX idx_tsl_session ON task_session_links(session_id)`,
      `CREATE TABLE bugs (
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
    updated_at       TEXT NOT NULL
)`,
      `CREATE INDEX idx_bugs_status ON bugs(bug_status, created_at)`,
    ],
  },
  {
    // v2（migration-hardening 收敛式自愈）：任何 version=1 谱系应用后收敛到同一 v2 终态——
    // ①CREATE TABLE IF NOT EXISTS bugs（21 列终态，fix_approach 内联——旧十表谱系无 bugs 时
    // 全量建表；bugs 已在场的谱系跳过）；②CREATE INDEX IF NOT EXISTS idx_bugs_status；
    // ③守卫式 ALTER TABLE bugs ADD COLUMN fix_approach（列已在场跳过——全新库 v1 20 列 +
    // 本条补列；fix-bug 后谱系同理）。三条谱系（旧十表 v1 / fix-bug 后 v1 / 全新库）终态一致，
    // migrations.lineage.test.ts 夹具回归锁死。
    version: 2,
    statements: [
      {
        sql: `CREATE TABLE IF NOT EXISTS bugs (
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
      },
      `CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(bug_status, created_at)`,
      {
        sql: `ALTER TABLE bugs ADD COLUMN fix_approach TEXT`,
        columnGuard: { table: 'bugs', column: 'fix_approach' },
      },
    ],
  },
  {
    // v3（bug-recurrence-chain）：守卫式 ALTER TABLE bugs ADD COLUMN recurrence_of TEXT——
    // 复发链前驱指针（本条登记时链上时间最近一条的 bug_id；可空 = 链根，悬空引用由域服务
    // 校验拒写，不落 FK 约束）。v2 谱系先例同构：列已在场跳过，既有扁平台账行无损读写，
    // 三谱系终态一致（migrations.lineage.test.ts 夹具回归锁死）。
    version: 3,
    statements: [
      {
        sql: `ALTER TABLE bugs ADD COLUMN recurrence_of TEXT`,
        columnGuard: { table: 'bugs', column: 'recurrence_of' },
      },
    ],
  },
]
