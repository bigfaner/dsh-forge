// v1 schema DDL as an inline constant — the runtime carrier chosen by task 2.1
// (零原生依赖、打包后不依赖资源文件). Source of truth: ./schema-v1.sql,
// itself a projection of docs/features/dsh-forge-m2/design/schema.sql. The
// .sql file and this constant are kept in sync by the drift-guard test in
// apps/desktop/tests/workbench-store.spec.ts — edit both or neither.
// Connection-level PRAGMAs (journal_mode = WAL, foreign_keys = ON) are applied
// per connection by ./db.ts, not by this DDL (see schema-v1.sql header).

/**
 * Complete v1 DDL: 6 domain tables (+ schema_version bookkeeping) and 5
 * indexes, with the row-level CHECK constraints and the SoT partition
 * comments from the design (自有 SoT vs 派生快照可重建).
 */
export const SCHEMA_V1_SQL = `-- ============================================================
-- dsh-forge M2 工作台数据内核 schema · v1 投影(任务 2.1)
-- 来源:docs/features/dsh-forge-m2/design/schema.sql。
-- 运行时载体:store/schema-v1.ts 内联常量(内联常量方案,零原生依赖、
-- 打包后不依赖资源文件);本文件与该常量由 workbench-store.spec.ts
-- 漂移对账测试强制同步。
-- 与 design/schema.sql 的有意差异:两条 PRAGMA(journal_mode/foreign_keys)
-- 为连接级设置,由 store/db.ts 每次开库时应用——foreign_keys 不随库文件
-- 持久化,journal_mode 不能在迁移事务内变更——故不进入本 DDL。
-- 事实源纪律:projects/app_state/session_links = 工作台自有 SoT;
--            task_snapshot/feature_snapshot/sync_state = 派生缓存(可整体重建,
--            事实源 = forge 文件)。
-- 版本迁移:schema_version 单行递增;迁移 = 顺序执行未应用版本段(应用层驱动,
--            node:sqlite 无内建迁移器);版本行由 store/migrate.ts 写入,
--            不在本 DDL 内。
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER NOT NULL,
  applied_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ------------------------------------------------------------
-- v1 · 工作台自有 SoT
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
  id                TEXT NOT NULL PRIMARY KEY,              -- uuid(crypto.randomUUID)
  display_name      TEXT NOT NULL,                          -- 显示名;缺省 = code_root 目录名
  code_root         TEXT NOT NULL UNIQUE,                   -- 代码根目录绝对路径(规范化)
  doc_location_type TEXT NOT NULL CHECK (doc_location_type IN ('in_repo', 'external')),
  doc_location_path TEXT,                                   -- external 时必填;in_repo 恒 NULL
  created_at        TEXT NOT NULL,                          -- ISO 8601 UTC
  last_activated_at TEXT,
  CHECK (
    (doc_location_type = 'in_repo'    AND doc_location_path IS NULL) OR
    (doc_location_type = 'external'   AND doc_location_path IS NOT NULL)
  )
);
-- 注:doc_location_path ≠ code_root 由注册/重指向校验层保证(路径语义校验不入 SQL)。

CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT NOT NULL PRIMARY KEY,          -- 保留键:active_project_id
  value TEXT NOT NULL                       -- JSON 编码
);

CREATE TABLE IF NOT EXISTS session_links (
  id         TEXT NOT NULL PRIMARY KEY,     -- uuid
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_key   TEXT NOT NULL,                 -- forge 任务 ID(如 '2.1');实体在 forge 文件侧,不设 FK
  session_id TEXT NOT NULL,                 -- dsh 会话标识(DF004 通道产物)
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at TEXT NOT NULL,
  ended_at   TEXT,                          -- status='ended' 时非空(应用层维护)
  UNIQUE (project_id, task_key, session_id)
);

CREATE INDEX IF NOT EXISTS idx_session_links_project ON session_links (project_id);
CREATE INDEX IF NOT EXISTS idx_session_links_task    ON session_links (project_id, task_key);

-- ------------------------------------------------------------
-- v1 · 派生快照(可重建;事实源 = forge 文件)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS task_snapshot (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_key    TEXT NOT NULL,
  feature_slug TEXT NOT NULL,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN
    ('pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected')),
  blockers    TEXT NOT NULL DEFAULT '[]',   -- JSON 数组:直接上游 blocker 的 task_key
  branch      TEXT,                         -- 任务执行 git 分支(执行痕迹;无则 NULL)
  worktree    INTEGER NOT NULL DEFAULT 0,
  source      TEXT CHECK (source IN ('session', 'terminal')),  -- 最近一笔变更来源
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (project_id, task_key)
);

CREATE INDEX IF NOT EXISTS idx_task_snapshot_feature ON task_snapshot (project_id, feature_slug);
CREATE INDEX IF NOT EXISTS idx_task_snapshot_status  ON task_snapshot (project_id, status);

CREATE TABLE IF NOT EXISTS feature_snapshot (
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feature_slug   TEXT NOT NULL,
  status         TEXT NOT NULL,             -- manifest 词表透传:prd/design/tasks/in-progress/completed
  doc_kinds      TEXT NOT NULL DEFAULT '[]',-- JSON 数组:实际存在的文档类(⊂ manifest/prd/design/ui/tasks)
  task_total     INTEGER NOT NULL DEFAULT 0,
  task_completed INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (project_id, feature_slug)
);

CREATE INDEX IF NOT EXISTS idx_feature_snapshot_updated ON feature_snapshot (project_id, updated_at);

CREATE TABLE IF NOT EXISTS sync_state (
  project_id   TEXT NOT NULL PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  last_scan_at TEXT,
  status       TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'scanning', 'error')),
  error        TEXT                         -- error 态原因(≤120 字符)
);

-- 应用层迁移器在全部 v1 语句执行成功后写入:
-- DELETE FROM schema_version; INSERT INTO schema_version (version) VALUES (1);
`
