-- ============================================================
-- dsh-forge M4 数据内核 schema(v3 增量 · 项目中心工作台)
-- 基底:M2 v1 + M3 v2 —— 全保留,只增不删。
--
-- 载体纪律(对齐 v1/v2 先例):
--   1. 本文件 = 设计投影;运行时载体 = 内联 TS 常量(schema-v3.ts)
--      + store/migrate.ts MIGRATIONS 追加 { version: 3, up: ... }段
--      (含 TS 回填),两者由 workbench-store.spec 漂移对账测试强制同步。
--   2. 每个版本段在各自事务内顺序执行;schema_version 单行递增、只进不退;
--      库版本 > 已知迁移即拒开(ERR_WORKBENCH_DB,未知数据绝不擦除)。
--   3. PRAGMA(journal_mode=WAL / foreign_keys=ON)为连接级设置,由
--      store/db.ts 每次开库应用 —— 故意不入 DDL。
--
-- v3 回填(事务内 TS,失败不阻断):
--   code_root_key/identity ← 归一化管线(realpath best-effort;失败 →
--   字符串回退 + identity_verified=0);in_repo → 'repo-existing';
--   external → 'custom'(授权在案)/ 'app';sort_order ← created_at 序;
--   存量 projection_state = 'pending'(待对账收数)。
-- 身份口径 = docs/decisions/project-storage-and-knowledge.md §5.5(D11)。
-- ============================================================

-- ---------- v3 ----------

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
