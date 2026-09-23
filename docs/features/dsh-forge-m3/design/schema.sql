-- ============================================================
-- dsh-forge M3 数据内核 schema(v2 增量)
-- 基底:M2 workbench.db v1(projects / app_state / session_links /
--   task_snapshot / feature_snapshot / sync_state)—— 全保留,不修改既有列。
-- 本文件 = v2 迁移脚本(内核启动时按 schema_version 顺序执行,事务内)。
-- 引擎:node:sqlite(WAL);单写者 = Electron 主进程内核。
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- v2 ----------

-- 1. projects 增列(权威路由 + 迁移/偏离状态)
ALTER TABLE projects ADD COLUMN data_authority TEXT NOT NULL DEFAULT 'files'
  CHECK (data_authority IN ('files', 'sqlite'));
ALTER TABLE projects ADD COLUMN deviated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN migrated_at TEXT;
ALTER TABLE projects ADD COLUMN backup_path TEXT;

-- 2. feature_snapshot 增列(feature 级偏离)
ALTER TABLE feature_snapshot ADD COLUMN deviated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feature_snapshot ADD COLUMN last_external_at TEXT;

-- 3. task:权威任务表(迁移后 SoT;TS 状态机唯一写入口)
CREATE TABLE task (
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_key     TEXT NOT NULL,
  feature_slug TEXT NOT NULL,
  title        TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN
    ('pending','in_progress','completed','blocked','suspended','skipped','rejected')),
  blockers_json TEXT NOT NULL DEFAULT '[]',   -- 依赖 task_key 数组(JSON)
  branch       TEXT,
  worktree     INTEGER NOT NULL DEFAULT 0,
  task_type    TEXT,                          -- 任务类型(预合成协议选择键)
  desc_path    TEXT,                          -- 描述 md 相对文档根路径
  updated_by   TEXT NOT NULL DEFAULT 'kernel',-- actor: session:*|external|kernel
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (project_id, task_key)
);
CREATE INDEX idx_task_feature ON task(project_id, feature_slug);
CREATE INDEX idx_task_status ON task(project_id, status);

-- 4. dispatch:派发编排(subagent 执行记录;ended_at IS NULL = 在跑)
CREATE TABLE dispatch (
  id           TEXT PRIMARY KEY,              -- uuid
  batch_id     TEXT NOT NULL,                 -- 同批多任务聚合
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feature_slug TEXT NOT NULL,
  task_key     TEXT NOT NULL,                 -- 逻辑引用 task(project_id, task_key)
  state        TEXT NOT NULL CHECK (state IN
    ('starting','running','awaiting','failed','done')),
  session_id   TEXT,                          -- subagent 会话 id,NULL=尚未启动
  prompt_hash  TEXT NOT NULL,                 -- 预合成 systemPrompt sha256
  actor        TEXT NOT NULL,                 -- 派发发起者(人)
  dispatched_at TEXT NOT NULL,
  ended_at     TEXT,
  error        TEXT
);
CREATE INDEX idx_dispatch_project ON dispatch(project_id, state);
CREATE INDEX idx_dispatch_batch ON dispatch(batch_id);

-- 5. approval_request:审批请求(宿主会话审批面路由)
CREATE TABLE approval_request (
  id           TEXT PRIMARY KEY,              -- uuid
  dispatch_id  TEXT NOT NULL REFERENCES dispatch(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_key     TEXT NOT NULL,
  session_id   TEXT NOT NULL,                 -- 来源 subagent 会话
  payload_json TEXT NOT NULL,                 -- 请求正文 + 类别(工作区写入等)
  state        TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','approved','rejected')),
  created_at   TEXT NOT NULL,
  decided_at   TEXT,
  decided_by   TEXT                           -- 审批审计(人)
);
CREATE INDEX idx_approval_state ON approval_request(project_id, state);

-- 6. prefs:三级偏好(单表 scope 化;键集封闭=应用层注册表校验)
CREATE TABLE prefs (
  scope       TEXT NOT NULL CHECK (scope IN ('global','project','feature')),
  scope_id    TEXT NOT NULL DEFAULT '',       -- global='';project=项目id;feature=slug
  key         TEXT NOT NULL,                  -- auto.*/worktree.*/eval.*(surfaces 除外)
  value_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (scope, scope_id, key)
);

-- 7. stage_asset:阶段资产索引(内容留文档根 stages/<stage>.md,派生可重建)
CREATE TABLE stage_asset (
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feature_slug TEXT NOT NULL,
  stage        TEXT NOT NULL CHECK (stage IN
    ('prd','design','tasks','in-progress','completed')),
  path         TEXT NOT NULL,
  generated_at TEXT,
  PRIMARY KEY (project_id, feature_slug, stage)
);

-- 8. proposal_snapshot:提案快照(frontmatter 派生,可重建)
CREATE TABLE proposal_snapshot (
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN
    ('draft','accepted','rejected','superseded')),
  author       TEXT,
  created      TEXT,
  feature_slug TEXT,                          -- NULL=无关联(管线早期)
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (project_id, slug)
);

-- 9. migration_event:迁移/回收审计(结果可回查)
CREATE TABLE migration_event (
  id          TEXT PRIMARY KEY,               -- uuid
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase       TEXT NOT NULL CHECK (phase IN
    ('backup','ingest','verify','switch','archive','rollback','reingest')),
  result      TEXT NOT NULL CHECK (result IN ('ok','fail')),
  detail_json TEXT,
  at          TEXT NOT NULL
);
CREATE INDEX idx_migration_project ON migration_event(project_id, at);
