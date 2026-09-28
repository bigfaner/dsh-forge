// v3 schema DDL as an inline constant — the M4 runtime carrier, same decision
// as v1/v2 (零原生依赖、打包后不依赖资源文件). Source of truth:
// docs/features/dsh-forge-m4/design/schema.sql (v3 增量投影). The design file
// and this constant are kept in sync — statement by statement — by the drift
// guard in apps/desktop/tests/workbench-store.spec.ts (v1/v2 先例延续).
// Carrier discipline (design/schema.sql header, TECH-data-kernel-001):
//   - only-add: every M2 v1 and M3 v2 table/column survives; v3 = projects
//     ALTER ×10 (D11 三层身份 / archived / sort_order / docs_placement /
//     projection_state) + 2 new tables (project_ui_state / workspace_projection)
//     + 2 indexes, all with their row-level CHECK vocabularies.
//   - connection-level PRAGMAs (journal_mode = WAL, foreign_keys = ON) are
//     applied per connection by ./db.ts, never by this DDL.
//   - the schema_version row is written by store/migrate.ts after the whole
//     segment applied inside its own transaction; NOT by this DDL.
//   - the identity/placement/order columns of EXISTING rows are backfilled by
//     TS inside the v3 transaction (store/migrate.ts), not by this DDL.

/**
 * Complete v3 DDL: 10 ALTER statements (projects) + 2 new tables
 * (project_ui_state / workspace_projection) + 2 indexes.
 */
export const SCHEMA_V3_SQL = `-- ---------- v3 ----------

-- 1. projects 增列:D11 三层身份 + 生命周期 + 证据三档落位 + 投影状态
ALTER TABLE projects ADD COLUMN code_root_key TEXT;                       -- 平台折叠比较键(UNIQUE 落此列)
ALTER TABLE projects ADD COLUMN identity_dev TEXT;                        -- 物理仲裁位(激活复验回写)
ALTER TABLE projects ADD COLUMN identity_ino TEXT;                        -- 仅仲裁不作键(FAT/网络不稳)
ALTER TABLE projects ADD COLUMN identity_verified INTEGER NOT NULL DEFAULT 1;  -- realpath 失败(网络盘离线)=0
ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;      -- 归档 ≠ 删除(workspace 保留)
ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;    -- 注册序;投影同名同序的 forge 侧权威
ALTER TABLE projects ADD COLUMN docs_placement TEXT NOT NULL DEFAULT 'legacy'
  CHECK (docs_placement IN ('repo-existing','repo-new','app','custom','legacy'));
ALTER TABLE projects ADD COLUMN custom_authorized INTEGER NOT NULL DEFAULT 0;  -- 仓外授权仅高级自定义
ALTER TABLE projects ADD COLUMN projection_state TEXT NOT NULL DEFAULT 'pending'
  CHECK (projection_state IN ('pending','healthy','degraded','deviation'));
ALTER TABLE projects ADD COLUMN workspace_id TEXT;                        -- dsh WorkspaceId(信息位,重建后由 ensure 更新)
CREATE UNIQUE INDEX idx_projects_code_root_key ON projects(code_root_key);
CREATE INDEX idx_projects_sort_order ON projects(sort_order);

-- 2. project_ui_state:布局记忆(C9 分屏/C10 多窗口/树收起态;项目删除随清除)
CREATE TABLE project_ui_state (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  layout_json TEXT NOT NULL DEFAULT '{}',   -- ProjectLayout v1(应用层 schema 白名单校验,失败重置默认)
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (project_id)
);

-- 3. workspace_projection:单向投影期望快照(权威 = projects;偏差 = diff 实况,明细不落表)
CREATE TABLE workspace_projection (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,               -- 最近成功投影的 dsh WorkspaceId
  path        TEXT NOT NULL,                -- 期望投影路径 = anchor canonical(ensure 定位键)
  title       TEXT NOT NULL,                -- 最近成功 title(改名偏差 diff 基线)
  order_idx   INTEGER NOT NULL,             -- 期望序 = projects.sort_order
  pushed_at   TEXT NOT NULL,                -- 最近成功 push 时间
  last_error  TEXT,                         -- degraded 原因(上游错误码映射),NULL
  PRIMARY KEY (project_id)
);
`
