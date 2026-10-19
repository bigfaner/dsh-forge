// schema 前向迁移（单一来源对齐 design/schema.sql——蓝本逐条拷贝，schema.test.ts pin 防漂移）。
// 前向单向：只追加新版本 Migration（不直改已发布版本）；旧应用打开新 schema 由版本门明确拒绝。
// 本文件为机制层零域语义代码：表名/列名是蓝本蓝图本身，不含任何表消费逻辑。

/**
 * 守卫语句：SQLite 无 ADD/DROP COLUMN IF [NOT] EXISTS——columnGuard 命中（table.column 已在场）时
 * 跳过该语句不执行；dropGuard 命中（table.column 不在场）时跳过（仅列在场才执行——DROP 类
 * 收敛语句用）。两种守卫使同一语句可安全落在多谱系库上（收敛式迁移）。
 */
export interface GuardedStatement {
  readonly sql: string
  readonly columnGuard?: { readonly table: string; readonly column: string }
  readonly dropGuard?: { readonly table: string; readonly column: string }
}

/** 单条迁移语句：裸 SQL 或带列守卫的收敛语句。 */
export type MigrationStatement = string | GuardedStatement

/** 一次前向迁移 = 一个版本号 + 一组语句（单事务原子应用）。 */
export interface Migration {
  readonly version: number
  readonly statements: readonly MigrationStatement[]
}

/** 本应用支持的 schema 版本上限（版本门：库内 version 超出即拒绝打开）。 */
export const SCHEMA_VERSION = 2

/**
 * worktree_dir 存量行回填语句（纯 SQL——默认绝对路径相对各行 ws_path 解析 `.forge/worktrees/`：
 * 分隔符按 ws_path 内含 `\` 判别（Windows canonical realpath = 反斜杠），与注册链默认派生
 * （node:path join）同口径；守卫配方 = docs/conventions/db-migrations.md §4.1 加列回填）。
 */
export const WORKTREE_DIR_BACKFILL_SQL = `UPDATE projects SET worktree_dir =
    ws_path
    || (CASE WHEN instr(ws_path, '\\') > 0 THEN '\\' ELSE '/' END)
    || '.forge'
    || (CASE WHEN instr(ws_path, '\\') > 0 THEN '\\' ELSE '/' END)
    || 'worktrees'
  WHERE worktree_dir = ''`

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
  {
    // v2（worktree-branch-management 1.6）：projects 新增 worktree_dir NOT NULL 配置列
    // （对齐 forge_dir 先例——提案「数据模型近零变更」裁决；取值恒非空：注册未输入即落
    // 默认值绝对路径，杜绝默认值演进时存量行与实际目录对不上）。收敛式两语句：
    // ①守卫式 ALTER ADD COLUMN（列已在场谱系跳过——workspace/migrations.ts columnGuard 先例；
    //   NOT NULL 经 DEFAULT '' 落地，回填后由写入链恒供真值）；
    // ②存量行回填：worktree_dir = ws_path 解析的 `.forge/worktrees/` 绝对路径（§4.1 加列
    //   回填配方——projects 无 append-only 触发器，UPDATE 直行）。
    // 全新库：v1 建表（无 worktree_dir）→ 本版补列（零行，回填 no-op）。终态一致。
    version: 2,
    statements: [
      {
        sql: `ALTER TABLE projects ADD COLUMN worktree_dir TEXT NOT NULL DEFAULT ''`,
        columnGuard: { table: 'projects', column: 'worktree_dir' },
      },
      WORKTREE_DIR_BACKFILL_SQL,
    ],
  },
]
