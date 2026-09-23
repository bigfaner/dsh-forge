// v2 schema DDL as an inline constant — the M3 runtime carrier, same decision
// as v1 (零原生依赖、打包后不依赖资源文件). Source of truth:
// docs/features/dsh-forge-m3/design/schema.sql (v2 增量投影). The design file
// and this constant are kept in sync — statement by statement — by the drift
// guard in apps/desktop/tests/workbench-store.spec.ts (v1 先例延续). Design
// note: the task prose says "5 索引" but the authoritative DDL declares 6 v2
// indexes — the DDL wins.
// Carrier discipline (design/schema.sql header, TECH-data-kernel-001):
//   - only-add: every M2 v1 table and column survives; v2 = 2 ALTER groups
//     (projects / feature_snapshot) + 7 new tables + 6 indexes, all with their
//     row-level CHECK vocabularies (静态词表入 SQL;动态键集留给应用层).
//   - connection-level PRAGMAs (journal_mode = WAL, foreign_keys = ON) are
//     applied per connection by ./db.ts, never by this DDL.
//   - the schema_version row is written by store/migrate.ts after the whole
//     segment applied inside its own transaction; NOT by this DDL.

/**
 * Complete v2 DDL: 6 ALTER statements (2 groups) + 7 new tables
 * (task / dispatch / approval_request / prefs / stage_asset /
 * proposal_snapshot / migration_event) + 6 indexes.
 */
export const SCHEMA_V2_SQL = `-- ---------- v2 ----------

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
  task_key     TEXT NOT NULL,                     -- 看板限定地址 <featureSlug>/<localId>
  feature_slug TEXT NOT NULL,                     -- 冗余列承 v1 方言(索引/分组),与 task_key 前缀一致
  title        TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN
    ('pending','in_progress','completed','blocked','suspended','skipped','rejected')),
  blockers     TEXT NOT NULL DEFAULT '[]',        -- JSON:直接上游本地上游 key 原词(同 feature 命名空间)
  branch       TEXT,
  worktree     INTEGER NOT NULL DEFAULT 0,
  task_type    TEXT,                              -- 任务类型(预合成协议选择键)
  desc_path    TEXT,                              -- 描述 md 相对文档根路径
  updated_by   TEXT NOT NULL DEFAULT 'kernel',    -- actor: session:<id>|external|kernel
                                              -- (v1 快照 source(session|terminal)判定序的权威化演进)
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
  task_key     TEXT NOT NULL,                 -- 看板限定地址;逻辑引用 task(同 session_links 先例,不设 FK)
  state        TEXT NOT NULL CHECK (state IN
    ('starting','running','awaiting','failed','done')),
  session_id   TEXT,                          -- subagent 会话 id,NULL=尚未启动
  prompt_hash  TEXT NOT NULL,                 -- 注入内容 sha256(口径随 spike ③ 裁决:systemPrompt 或组合首条消息)
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
  task_key     TEXT NOT NULL,                 -- 看板限定地址
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
--    feature scope 隶属项目(feature_snapshot PK 含 project_id 同理):
--    scope_id = \`<projectId>/<featureSlug>\` 限定地址,防跨项目同 slug 键碰撞。
CREATE TABLE prefs (
  scope       TEXT NOT NULL CHECK (scope IN ('global','project','feature')),
  scope_id    TEXT NOT NULL DEFAULT '',       -- global='';project=项目id;feature=<projectId>/<featureSlug>
  key         TEXT NOT NULL,                  -- 注册键集内(auto.*/worktree.*/eval.*,surfaces 除外)
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
`
