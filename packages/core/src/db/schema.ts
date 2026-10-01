// schema v1 前向迁移（单一来源对齐 design/schema.sql——蓝本逐条拷贝，schema.test.ts pin 防漂移）。
// 前向单向：只追加新版本 Migration（全 CREATE 无 ALTER），旧应用打开新 schema 由版本门明确拒绝。
// 本文件为机制层零域语义代码：表名/列名是蓝本蓝图本身，不含任何表消费逻辑。

/** 一次前向迁移 = 一个版本号 + 一组 DDL 语句（单事务原子应用）。 */
export interface Migration {
  readonly version: number
  readonly statements: readonly string[]
}

/** 本应用支持的 schema 版本上限（版本门：库内 version 超出即拒绝打开）。 */
export const SCHEMA_VERSION = 1

/**
 * v1（P1 MVP）：五表 + 七索引，蓝本 = docs/features/dsh-forge-p1-mvp/design/schema.sql。
 * 语句顺序与蓝本一致（先表后其索引）；PRAGMA（WAL / foreign_keys）在 openDatabase 打开时设置。
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE schema_meta (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL
)`,
      `CREATE TABLE projects (
    id                   TEXT PRIMARY KEY,
    workspace_id         TEXT NOT NULL UNIQUE,
    ws_path              TEXT NOT NULL,
    name                 TEXT NOT NULL,
    forge_dir            TEXT NOT NULL,
    forge_dir_external   INTEGER NOT NULL DEFAULT 0,
    knowledge_dir        TEXT NOT NULL,
    archived             INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    CONSTRAINT ck_projects_external CHECK (forge_dir_external IN (0, 1))
)`,
      `CREATE UNIQUE INDEX idx_projects_ws_path ON projects(ws_path)`,
      `CREATE TABLE knowledge_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    frontmatter_id  TEXT,
    rel_path        TEXT    NOT NULL,
    domain_path     TEXT    NOT NULL,
    title           TEXT    NOT NULL,
    summary         TEXT    NOT NULL,
    keywords        TEXT    NOT NULL DEFAULT '[]',
    status          TEXT    NOT NULL DEFAULT 'draft',
    digest          TEXT    NOT NULL,
    indexed_at      TEXT    NOT NULL,
    CONSTRAINT uq_ke_project_rel_path UNIQUE (project_id, rel_path)
)`,
      `CREATE INDEX idx_ke_project_domain   ON knowledge_entries(project_id, domain_path)`,
      `CREATE INDEX idx_ke_frontmatter_id   ON knowledge_entries(frontmatter_id)`,
      `CREATE TABLE knowledge_recall_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    call_id         TEXT    NOT NULL,
    session_id      TEXT    NOT NULL,
    verb            TEXT    NOT NULL,
    entry_id        INTEGER REFERENCES knowledge_entries(id),
    frontmatter_id  TEXT,
    title_snap      TEXT,
    domain_snap     TEXT,
    query_json      TEXT,
    hit_count       INTEGER NOT NULL,
    duration_ms     INTEGER,
    created_at      TEXT    NOT NULL,
    CONSTRAINT ck_krl_verb CHECK (verb IN ('search', 'read-abstract'))
)`,
      `CREATE INDEX idx_krl_project_session ON knowledge_recall_logs(project_id, session_id, created_at)`,
      `CREATE INDEX idx_krl_call            ON knowledge_recall_logs(call_id)`,
      `CREATE INDEX idx_krl_entry           ON knowledge_recall_logs(entry_id, frontmatter_id)`,
      `CREATE TABLE app_key_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    level       TEXT NOT NULL,
    scope       TEXT NOT NULL,
    message     TEXT NOT NULL,
    data_json   TEXT,
    created_at  TEXT NOT NULL,
    CONSTRAINT ck_akl_level CHECK (level IN ('warn', 'error')),
    CONSTRAINT ck_akl_scope CHECK (scope IN ('compensation', 'reconcile', 'index', 'recall'))
)`,
      `CREATE INDEX idx_akl_scope_time ON app_key_logs(scope, created_at)`,
    ],
  },
]
