-- 判例库 fixture：旧中央 state.db（projects 表，中央 v3 终态谱系）快照（plugin-project 1.18）。
-- 判例行：
--   proj-alpha  正常注册（registry 快照在场）——拆两表主判例；
--   proj-beta   workspace_id 不在 registry —— degraded 判例（消失→degraded+diag，禁删禁自动重挂）；
--   proj-gamma  归档行 + 手动排序——字段承袭判例（archived / sort_order 原值照搬）。
-- ws_path 为静态字面量（在场性对账走 --registry 快照，不依赖本机文件系统）。
CREATE TABLE schema_meta (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT    NOT NULL
);
CREATE TABLE projects (
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
);
CREATE UNIQUE INDEX idx_projects_ws_path ON projects(ws_path);
ALTER TABLE projects ADD COLUMN worktree_dir TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN sort_order INTEGER DEFAULT NULL;
INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, knowledge_dir, worktree_dir, sort_order, archived, created_at, updated_at)
VALUES
  ('proj-alpha', 'ws-alpha', 'C:\ws\alpha', 'Alpha', 'C:\ws\alpha\.forge', 'C:\ws\alpha\.knowledge', 'C:\ws\alpha\.forge\worktrees', NULL, 0, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
  ('proj-beta',  'ws-gone',  'C:\ws\beta',  'Beta',  'C:\ws\beta\.forge',  'C:\ws\beta\.knowledge',  '', NULL, 0, '2026-01-03T00:00:00Z', '2026-01-04T00:00:00Z'),
  ('proj-gamma', 'ws-gamma', 'C:\ws\gamma', 'Gamma', 'C:\ws\gamma\.forge', 'C:\ws\gamma\.knowledge', 'C:\ws\gamma\.forge\worktrees', 2, 1, '2026-01-05T00:00:00Z', '2026-01-06T00:00:00Z');
