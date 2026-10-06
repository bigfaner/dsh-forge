// 工作区任务库（forge.db）schema v1 前向迁移（任务 1.2）——单一来源对齐
// docs/features/dsh-forge-m2-pipeline/design/schema.sql（蓝本逐条拷贝，migrations.test.ts pin 防漂移）。
// 独立版本线：FORGE_DB_SCHEMA_VERSION 与中央 state.db 迁移互不相干（schema.sql 头注）；
// Hard Rule——本序列经 openDatabase 参数化传入（db/open.ts options），中央 MIGRATIONS 硬编码 import 勿照抄。
// 前向单向：只追加新版本 Migration（全 CREATE 无 ALTER）；保留字已清剿（task_type/task_status 等，禁 key/type/status/description）。
// PRAGMA（WAL / foreign_keys）在 openDatabase 打开时设置，不入迁移语句。
import type { Migration } from '../../db/index.js'

/** 工作区库 schema 版本上限（独立版本线；版本门：库内 version 超出即拒绝打开）。 */
export const FORGE_DB_SCHEMA_VERSION = 1

/**
 * v1（M2）：七域表 + schema_meta + app_key_logs 基建表 + 索引 ×6 + append-only 双触发器。
 * 蓝本 = docs/features/dsh-forge-m2-pipeline/design/schema.sql；语句顺序与蓝本一致。
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
      `CREATE TABLE tasks (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL,
    local_id        TEXT NOT NULL,
    title           TEXT NOT NULL,
    task_type       TEXT NOT NULL,
    task_status     TEXT NOT NULL DEFAULT 'pending'
                    CONSTRAINT ck_tasks_status CHECK (task_status IN
                      ('pending', 'in_progress', 'completed', 'blocked',
                       'suspended', 'skipped', 'rejected')),
    task_desc       TEXT,
    priority        TEXT CONSTRAINT ck_tasks_priority CHECK (priority IN ('P0', 'P1', 'P2')),
    estimated_time  TEXT,
    vars_json       TEXT,
    source_task_id  TEXT REFERENCES tasks(id),
    blocked_reason  TEXT,
    main_session    INTEGER NOT NULL DEFAULT 0
                    CONSTRAINT ck_tasks_main_session CHECK (main_session IN (0, 1)),
    breaking        INTEGER NOT NULL DEFAULT 0
                    CONSTRAINT ck_tasks_breaking CHECK (breaking IN (0, 1)),
    coverage        REAL,
    complexity      TEXT NOT NULL DEFAULT 'medium'
                    CONSTRAINT ck_tasks_complexity CHECK (complexity IN ('low', 'medium', 'high')),
    surface_key     TEXT,
    surface_type    TEXT,
    feature_id      TEXT NOT NULL REFERENCES features(id),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    CONSTRAINT uq_tasks_slug_local UNIQUE (slug, local_id)
)`,
      `CREATE INDEX idx_tasks_feature_status ON tasks(feature_id, task_status)`,
      `CREATE INDEX idx_tasks_source         ON tasks(source_task_id)`,
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
    gate_json       TEXT,
    commit_hash     TEXT,
    dispatch_digest TEXT,
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
    ],
  },
]
