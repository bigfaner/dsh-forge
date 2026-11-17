// task-loop.db 新线 v1（plugin-task-loop 1.6）——entities.md §3 DDL 单源直落：
// 六表 + 9 CREATE INDEX（含 2 棵 UNIQUE）+ 2 表级 UNIQUE + 6 append-only 触发器。
// 命名纪律（entities.md 文首）：约束/索引/触发器全名 `task_` 前缀——共库 db 级命名空间
// 由全名前缀杜绝；行级归属键 project_key 为容器维度键前导列（task_tasks / task_checkpoints），
// 附属表经 task_id FK 传导归属、不携带 project_key；六表零 AUTOINCREMENT（代理键纯 UUID）。
// Hard Rule——本序列经 openDatabase 参数化传入（lib/db openDatabase options），
// 禁硬编码 import 中央序列；PRAGMA（WAL / foreign_keys / busy_timeout）在打开时设置，
// 不入迁移语句。schema_meta 为 lib/db 机制基建表（版本线锚），随 v1 顺带创建。
// 索引终态（entities.md 文首 + review/index-audit.md）：显式索引/唯一约束对象 11
//（CREATE INDEX ×9 + 表级 UNIQUE ×2）、含 PK 隐式唯一索引共 17 棵 B-tree。
import type { Migration } from "@dsh-forge/lib-db";

/** task-loop.db schema 版本上限（独立版本线；version 1 起新线）。 */
export const TASK_LOOP_DB_SCHEMA_VERSION = 1;

/**
 * 分域版本线锚（R3-dba「锚域不锚表集合」）：openDatabase domain 选项值——
 * 共库形态下版本门只判读本域版本线，spec/knowledge 等异域先行抬升的版本不触发拒开
 * （bug e62f3458 处方）；单装缺省形态同锚（自持库单域独占，语义不变）。
 */
export const TASK_LOOP_DB_SCHEMA_DOMAIN = "task-loop";

/** 表名模板（唯一模板面——connection/后续 repositories 共此单源；恒 task_ 前缀）。 */
export interface TaskDbTables {
  tasks: string;
  settlements: string;
  checkpoints: string;
  edges: string;
  sessionLinks: string;
  records: string;
}

export function taskTableNames(): TaskDbTables {
  return {
    tasks: "task_tasks",
    settlements: "task_settlements",
    checkpoints: "task_checkpoints",
    edges: "task_edges",
    sessionLinks: "task_session_links",
    records: "task_records",
  };
}

/**
 * v1 DDL（entities.md §3 逐字直落——表/列/约束/索引/触发器全名与 entities 单源对读，
 * lineage 测试锚定；语句顺序 = 先表后其索引/触发器，依赖序 tasks 在前）。
 */
export const TASK_LOOP_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      // lib/db 机制基建表（版本线锚域，entities.md §6.1「schema_meta 版本线锚域」）——
      // IF NOT EXISTS：共库形态锚表由先开域（或 lib/db 分域机制）建立，本域不重 建（bug e62f3458）。
      `CREATE TABLE IF NOT EXISTS schema_meta (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL
)`,
      // ── §3.1 task_tasks（19 列）──
      `CREATE TABLE task_tasks (
    id              TEXT PRIMARY KEY,                      -- 纯 UUID（写入点 addTask/batchAddTasks 生成；业务唯一由 uq_task_tasks_project_slug_local 承担）
    slug            TEXT NOT NULL,                         -- 容器键（通用执行容器，无容器主表）
    local_id        TEXT NOT NULL,
    title           TEXT NOT NULL,
    task_type       TEXT NOT NULL,
    task_status     TEXT NOT NULL DEFAULT 'pending'
                    CONSTRAINT ck_task_tasks_status CHECK (task_status IN
                      ('pending', 'in_progress', 'completed', 'blocked',
                       'suspended', 'interrupted', 'skipped', 'rejected')),
    brief           TEXT,                                  -- 任务简报正文内容源（worker 简报 TITLE 后裸文本段）
    ac_json         TEXT,                                  -- AC 承担面（任务定义侧清单）——task 唯一验收承接面
    priority        TEXT CONSTRAINT ck_task_tasks_priority CHECK (priority IN ('P0', 'P1', 'P2')),
    estimated_time  TEXT,                                  -- 未来 UI 消费预留；当前读取面 = list/query 卡片透传
    scope_json      TEXT,                                  -- 受影响文件范围（结构化对象 JSON）
    context_json    TEXT,                                  -- 附加上下文注入（KEY=VALUE JSON）
    fix_of_task_id  TEXT REFERENCES task_tasks(id),        -- fix 链前驱（域内 FK 可空）——fix 判别单源
    breaking        INTEGER NOT NULL DEFAULT 0
                    CONSTRAINT ck_task_tasks_breaking CHECK (breaking IN (0, 1)),
    coverage_threshold REAL,                               -- 验收阈值期望值（0–1；实测面在 settlements gate_coverage）
    complexity      TEXT NOT NULL DEFAULT 'medium'
                    CONSTRAINT ck_task_tasks_complexity CHECK (complexity IN ('low', 'medium', 'high')),
    project_key       TEXT NOT NULL,                       -- 行级归属键（cwd 纯函数派生，无 default）
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    CONSTRAINT uq_task_tasks_project_slug_local UNIQUE (project_key, slug, local_id)
)`,
      `CREATE INDEX idx_task_tasks_container ON task_tasks(project_key, slug, task_status)`,
      `CREATE INDEX idx_task_tasks_fix       ON task_tasks(fix_of_task_id)`,
      // ── §3.2 task_settlements（9 列，append-only）──
      `CREATE TABLE task_settlements (
    id            TEXT PRIMARY KEY,                        -- 定位键（纯 UUID）——全局单调性由 (created_at, seq) 承担，id 仅 tiebreaker
    task_id       TEXT NOT NULL REFERENCES task_tasks(id), -- 任务定位；归属/容器维度经 JOIN tasks 传导
    seq           INTEGER NOT NULL,                        -- 同 task_id 链内单调递增
    fix_root_id   TEXT,                                    -- fix 链身份列：链首结算行 id（可空 = 非 fix 链）
    result        TEXT NOT NULL CONSTRAINT ck_task_settle_result
                    CHECK (result IN ('success', 'blocked')),
    ac_results_json TEXT NOT NULL DEFAULT '[]',            -- AC 核销快照（[{criterion, met, evidence?}] 单列同位）
    commit_hash   TEXT,                                    -- fix density 口径消费列
    evidence_json TEXT,                                    -- submit 全语义载荷终态聚合（success/blocked 两形同构）
    created_at    TEXT NOT NULL                            -- 原结算时戳
)`,
      `CREATE UNIQUE INDEX uq_task_settle_seq ON task_settlements(task_id, seq)`,
      `CREATE TRIGGER trg_task_settlements_no_update BEFORE UPDATE ON task_settlements
BEGIN SELECT RAISE(ABORT, 'task_settlements: append-only violation (update)'); END`,
      `CREATE TRIGGER trg_task_settlements_no_delete BEFORE DELETE ON task_settlements
BEGIN SELECT RAISE(ABORT, 'task_settlements: append-only violation (delete)'); END`,
      // ── §3.3 task_checkpoints（11 列，append-only；project_key 前导）──
      `CREATE TABLE task_checkpoints (
    id                    TEXT PRIMARY KEY,                -- 纯 UUID（定位键）
    project_key             TEXT NOT NULL,
    slug        TEXT NOT NULL,                             -- 弱引用锚，零 FK
    mark                  TEXT NOT NULL
                          CONSTRAINT ck_task_cp_mark CHECK (mark IN
                            ('first-pass-complete', 'retro-done', 'review-wave-N',
                             'stabilized', 'merged', 'derived-to-child')),
    wave_seq              INTEGER,
    created_at            TEXT NOT NULL,
    base_commit_hash      TEXT NOT NULL,
    tasks_total           INTEGER NOT NULL,
    commits_total         INTEGER NOT NULL,
    fixes_total           INTEGER NOT NULL,
    evidence_debts_total  INTEGER NOT NULL
)`,
      `CREATE UNIQUE INDEX uq_task_cp_milestone ON task_checkpoints(project_key, slug, mark, wave_seq)
  WHERE mark IN ('first-pass-complete', 'retro-done', 'review-wave-N', 'stabilized', 'merged')`,
      `CREATE INDEX idx_task_cp_container ON task_checkpoints(project_key, slug, created_at)`,
      `CREATE TRIGGER trg_task_checkpoints_no_update BEFORE UPDATE ON task_checkpoints
BEGIN SELECT RAISE(ABORT, 'task_checkpoints: append-only violation (update)'); END`,
      `CREATE TRIGGER trg_task_checkpoints_no_delete BEFORE DELETE ON task_checkpoints
BEGIN SELECT RAISE(ABORT, 'task_checkpoints: append-only violation (delete)'); END`,
      // ── §3.4 三附属表（归属经 task_id FK 传导）──
      `CREATE TABLE task_edges (
    task_id          TEXT NOT NULL REFERENCES task_tasks(id),
    prerequisite_id  TEXT NOT NULL REFERENCES task_tasks(id),
    origin           TEXT NOT NULL
                     CONSTRAINT ck_task_edges_origin CHECK (origin IN ('manual', 'fix-chain', 'autoconfig')),
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    PRIMARY KEY (task_id, prerequisite_id)
)`,
      `CREATE INDEX idx_task_edges_prerequisite ON task_edges(prerequisite_id)`,
      `CREATE TABLE task_session_links (
    id          TEXT PRIMARY KEY,                      -- 纯 UUID（定位键）
    task_id     TEXT NOT NULL REFERENCES task_tasks(id),
    session_id  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    CONSTRAINT uq_task_tsl_task_session UNIQUE (task_id, session_id)
)`,
      `CREATE INDEX idx_task_tsl_session ON task_session_links(session_id)`,
      `CREATE TABLE task_records (
    id                 TEXT PRIMARY KEY,               -- 纯 UUID（定位键）
    task_id            TEXT NOT NULL REFERENCES task_tasks(id),
    verb               TEXT NOT NULL,
    from_status        TEXT,
    to_status          TEXT,
    note               TEXT,                           -- 非 submit 动词语境载荷（reason+summary 归一）
    payload_json       TEXT,                           -- 非 submit 动词的结构化载荷位
    dispatch_digest    TEXT,
    loop_sourced       INTEGER NOT NULL DEFAULT 0
                       CONSTRAINT ck_task_records_loop CHECK (loop_sourced IN (0, 1)),
    actor              TEXT NOT NULL
                       CONSTRAINT ck_task_records_actor CHECK (actor IN ('plugin-tool', 'ui', 'core')),
    session_id         TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
)`,
      `CREATE INDEX idx_task_records_task    ON task_records(task_id, created_at)`,
      `CREATE INDEX idx_task_records_session ON task_records(session_id)`,
      `CREATE TRIGGER trg_task_records_no_update BEFORE UPDATE ON task_records
BEGIN SELECT RAISE(ABORT, 'task_records: append-only violation (update)'); END`,
      `CREATE TRIGGER trg_task_records_no_delete BEFORE DELETE ON task_records
BEGIN SELECT RAISE(ABORT, 'task_records: append-only violation (delete)'); END`,
    ],
  },
];
