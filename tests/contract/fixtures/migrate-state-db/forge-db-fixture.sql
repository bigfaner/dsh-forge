-- 判例库 fixture：旧工作区库 forge.db（bugs 表 23 列终态 + tasks 最小集）快照（plugin-project 1.18）。
-- 判例四类（dba 圆桌处方 + 验收判据 4）：
--   ① recurrence 整链：b-root → b-child → b-grand（前驱逐位在场）；
--   ② 两态：b-child = fixed（commit_hash/fixer 在场）+ b-grand = unresolved（unresolved_reason）；
--   ③ source_task_id 空·非空：链行非空且在场 + b-nosrc 空；
--   ④ container_slug 空·非空：链行 'feat-a' + b-nosrc NULL。
-- 外加核验失败判例：
--   b-gonesrc  source_task_id = 'task-gone'（不在 tasks）→ 人工清单，禁置 NULL（原值照搬）。
CREATE TABLE schema_meta (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT    NOT NULL
);
CREATE TABLE tasks (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL,
  task_status     TEXT NOT NULL DEFAULT 'completed'
);
INSERT INTO tasks (id, slug) VALUES ('task-a', 'feat-a'), ('task-b', 'feat-b');
CREATE TABLE bugs (
  id               TEXT PRIMARY KEY,
  summary          TEXT NOT NULL,
  bug_desc         TEXT NOT NULL,
  trigger_desc     TEXT NOT NULL,
  expected         TEXT NOT NULL,
  actual           TEXT NOT NULL,
  suspected        TEXT,
  error_type       TEXT,
  bug_status       TEXT NOT NULL DEFAULT 'open'
                   CHECK (bug_status IN ('open', 'fixed', 'unresolved')),
  commit_hash      TEXT,
  worktree         TEXT,
  branch           TEXT,
  unresolved_reason TEXT,
  source_task_id   TEXT REFERENCES tasks(id),
  report_session_id TEXT,
  fix_session_id   TEXT,
  reporter         TEXT NOT NULL,
  fixer            TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  fix_approach     TEXT,
  recurrence_of    TEXT,
  container_slug   TEXT
);
INSERT INTO bugs (id, summary, bug_desc, trigger_desc, expected, actual, suspected, error_type, bug_status,
                  commit_hash, worktree, branch, unresolved_reason, source_task_id, report_session_id, fix_session_id,
                  reporter, fixer, created_at, updated_at, fix_approach, recurrence_of, container_slug)
VALUES
  ('b-root', 'root bug', 'd', 't', 'e', 'a', NULL, 'logic-error', 'open',
   NULL, NULL, NULL, NULL, 'task-a', 'sess-r', NULL, 'alice', NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
   NULL, NULL, 'feat-a'),
  ('b-child', 'child bug', 'd', 't', 'e', 'a', 'suspect.ts:1', 'logic-error', 'fixed',
   'c0ffee01', 'wt', 'main', NULL, 'task-a', 'sess-c', 'sess-c', 'alice', 'bob', '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z',
   'fix approach', 'b-root', 'feat-a'),
  ('b-grand', 'grand bug', 'd', 't', 'e', 'a', NULL, 'race-condition', 'unresolved',
   NULL, NULL, NULL, '三次复现修不好', 'task-b', 'sess-g', NULL, 'carol', NULL, '2026-01-04T00:00:00Z', '2026-01-04T00:00:00Z',
   NULL, 'b-child', NULL),
  ('b-nosrc', 'no source bug', 'd', 't', 'e', 'a', NULL, NULL, 'open',
   NULL, NULL, NULL, NULL, NULL, 'sess-n', NULL, 'dave', NULL, '2026-01-05T00:00:00Z', '2026-01-05T00:00:00Z',
   NULL, NULL, NULL),
  ('b-gonesrc', 'gone source bug', 'd', 't', 'e', 'a', NULL, NULL, 'open',
   NULL, NULL, NULL, NULL, 'task-gone', 'sess-x', NULL, 'erin', NULL, '2026-01-06T00:00:00Z', '2026-01-06T00:00:00Z',
   NULL, NULL, NULL);
