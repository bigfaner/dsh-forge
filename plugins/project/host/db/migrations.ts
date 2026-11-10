// project.db migrations（新线 v1，plugin-project 1.9）——两表制（projects 实体表 +
// project↔workspaces 关系表，提案「project.db 表结构」DDL 单源）+ project_bugs（裁决 2：
// 新线 version 1 一步建名，21+ 列终态承袭、source_task_id/recurrence_of 剥 FK 降弱引用、
// 行级归属键 project_key NOT NULL）。settings 表不建（裁决 7）。
// Hard Rule——本序列经 openDatabase 参数化传入（lib/db open.ts options），禁硬编码 import 中央序列；
// PRAGMA（WAL / foreign_keys）在 openDatabase 打开时设置，不入迁移语句。
// DDL 快照锚锁「前缀参数 + 表名模板」：表名一律 `${prefix}_*` 模板产出（migrations.snapshot.test.ts）。
import type { Migration } from '@dsh-forge/lib-db'

/** project.db schema 版本上限（独立版本线；version 1 起新线）。 */
export const PROJECT_DB_SCHEMA_VERSION = 1

/** 表名模板（唯一模板面——connection/migrations/repositories 共此单源）。 */
export interface ProjectDbTables {
  projects: string
  workspaces: string
  bugs: string
}

export function projectTableNames(prefix: string): ProjectDbTables {
  return {
    projects: `${prefix}_projects`,
    workspaces: `${prefix}_workspaces`,
    bugs: `${prefix}_bugs`,
  }
}

/**
 * v1 DDL（前缀参数化模板）。默认前缀恒 'project'（单装同前缀——DDL/快照测试单套消灭两形态分叉）。
 * 索引面：部分唯一索引（每 project 至多一条 main 行）/ 联合覆盖索引（workspace_id 反查 project_id
 * covering）/ bugs 状态索引；project_key 列级 UNIQUE 自带隐式唯一索引，不另建单列索引。
 */
export function makeProjectMigrations(prefix: string): Migration[] {
  const t = projectTableNames(prefix)
  return [
    {
      version: 1,
      statements: [
        `CREATE TABLE schema_meta (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL
)`,
        `CREATE TABLE ${t.projects} (
    id                   TEXT PRIMARY KEY,
    project_key          TEXT NOT NULL UNIQUE,
    title                TEXT NOT NULL,
    forge_dir            TEXT NOT NULL,
    forge_dir_external   INTEGER NOT NULL DEFAULT 0 CHECK (forge_dir_external IN (0, 1)),
    worktree_dir         TEXT NOT NULL DEFAULT '',
    sort_order           INTEGER DEFAULT NULL,
    archived             INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
)`,
        `CREATE TABLE ${t.workspaces} (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id           TEXT NOT NULL REFERENCES ${t.projects}(id) ON DELETE CASCADE,
    workspace_id         TEXT NOT NULL,
    ws_path              TEXT NOT NULL,
    member_role          TEXT NOT NULL CHECK (member_role IN ('main', 'worktree')),
    bound_at             TEXT NOT NULL,
    created_at           TEXT NOT NULL,
    UNIQUE (project_id, member_role, ws_path),
    UNIQUE (ws_path)
)`,
        `CREATE UNIQUE INDEX idx_${prefix}_workspaces_main ON ${t.workspaces}(project_id) WHERE member_role = 'main'`,
        `CREATE INDEX idx_${prefix}_workspaces_ws ON ${t.workspaces}(workspace_id, project_id)`,
        `CREATE TABLE ${t.bugs} (
    id                 TEXT PRIMARY KEY,
    project_key        TEXT NOT NULL,
    summary            TEXT NOT NULL,
    bug_desc           TEXT NOT NULL,
    trigger_desc       TEXT NOT NULL,
    expected           TEXT NOT NULL,
    actual             TEXT NOT NULL,
    suspected          TEXT,
    error_type         TEXT,
    bug_status         TEXT NOT NULL DEFAULT 'open'
                       CHECK (bug_status IN ('open', 'fixed', 'unresolved')),
    commit_hash        TEXT,
    worktree           TEXT,
    branch             TEXT,
    unresolved_reason  TEXT,
    fix_approach       TEXT,
    source_task_id     TEXT,
    recurrence_of      TEXT,
    container_slug     TEXT,
    report_session_id  TEXT,
    fix_session_id     TEXT,
    fixer              TEXT,
    reporter           TEXT NOT NULL,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
)`,
        `CREATE INDEX idx_${prefix}_bugs_status ON ${t.bugs}(bug_status, created_at)`,
      ],
    },
  ]
}

/** 默认迁移序列（恒前缀 'project'）。 */
export const PROJECT_MIGRATIONS: readonly Migration[] = makeProjectMigrations('project')
