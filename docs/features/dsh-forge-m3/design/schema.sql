-- ============================================================
-- dsh-forge M3 数据内核 schema(v2 增量)
-- 基底:M2 workbench.db v1(projects / app_state / session_links /
--   task_snapshot / feature_snapshot / sync_state)—— 全保留,只增不删。
--
-- 载体纪律(对齐 v1 先例,schema-v1.sql 头注):
--   1. 本文件 = 设计投影;运行时载体 = 内联 TS 常量(schema-v2.ts)+
--      store/migrate.ts MIGRATIONS 追加 { version: 2, up: ... }段;
--      两者由 workbench-store.spec 漂移对账测试强制同步。
--   2. 每个版本段在各自事务内顺序执行;schema_version 单行递增、只进不退;
--      库版本 > 已知迁移即拒开(ERR_WORKBENCH_DB,未知数据绝不擦除)。
--   3. PRAGMA(journal_mode=WAL / foreign_keys=ON)为连接级设置,由
--      store/db.ts 每次开库应用 —— 故意不入 DDL。
--
-- 引擎:node:sqlite(WAL);单写者 = Electron 主进程内核。
-- task_key 方言(TECH-data-kernel-003,M2 任务 2.5 裁决):全库统一采用
--   看板限定地址 `<featureSlug>/<localId>`;localId 含 `5.gate` 等非数字
--   相位键(看板全量投影);blockers 原样存同 feature 命名空间的本地上游
--   key(悬空显式标记,不改写 —— diff.ts findDanglingBlockers 先例)。
-- 状态机移植基准(T1):forge-cli Go 源 `pkg/task/statemachine.go` ·
--   `deps.go` · `toposort.go`(Z:\project\ai\forge\forge-cli)。
-- ============================================================

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
--    scope_id = `<projectId>/<featureSlug>` 限定地址,防跨项目同 slug 键碰撞。
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
