-- ============================================================
-- Schema: dsh-forge M2 · 每工作区任务库  |  Engine: SQLite (better-sqlite3)
-- Generated from: design/er-diagram.md(输入底稿 = docs/proposals/dsh-forge-m2-pipeline/db-schema.md 预设计定稿)
-- 部署: {tasksHome}/{flatten(canonical-path)}@{hash8(canonical-path)}/forge.db
--   tasksHome = env DSH_FORGE_TASKS_HOME > {userData}/forge-workspaces(core resolveTasksHome 单源)
-- 版本: FORGE_DB_SCHEMA_VERSION = 1(独立版本线,与中央 state.db 迁移互不相干)
-- 打开: 惰性首开(每库每进程首次触达)——open+migrate+开库断言;失败 = 工作区隔离(ERR_WORKSPACE_DB_UNAVAILABLE)
-- 纪律: WAL + foreign_keys=ON;ISO-8601 TEXT 时间戳;ck_* 约束命名;FK 一律无 ON DELETE(M2 无删除动词)
-- ⚠ 与八表定稿差异(防照抄):无 feature_records 表(M3);task_records 无 branch/worktree 两列(M3);
--   tasks 无 task_file 列(M2 无写入者,M3 软迁移可回);列名保留字清剿(key/type/status/description 等改名)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- [基建] SCHEMA_META —— 版本表随库(前向迁移唯一机制;applied_at 即一次性时间戳,豁免 updated_at)
CREATE TABLE schema_meta (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL
);

-- [基建] APP_KEY_LOGS —— 工作区关键日志(存储不交叉:任务域日志住工作区库,中央 state.db 零改动;
--                          结构沿 P1 同名表,scope 收窄为任务域值——中央 ck_akl_scope 四值不含 'tasks',
--                          写中央必炸 CHECK,故随库自带)
CREATE TABLE app_key_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    level       TEXT NOT NULL CONSTRAINT ck_wkl_level CHECK (level IN ('warn', 'error')),
    scope       TEXT NOT NULL CONSTRAINT ck_wkl_scope CHECK (scope IN ('tasks', 'workspace')),
    data_json   TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

-- [域表 1] FEATURES —— feature 状态 SoT(manifest 库内化:状态/标题/摘要)
CREATE TABLE features (
    id             TEXT PRIMARY KEY,               -- uuid(应用生成;身份与名称分离 §6-31)
    slug           TEXT NOT NULL UNIQUE,           -- 目录名自然键;任务键承载分量(实践不可变)
    title          TEXT NOT NULL,
    feature_status TEXT NOT NULL DEFAULT 'prd'
                   CONSTRAINT ck_features_status CHECK (feature_status IN
                     ('prd', 'design', 'tasks', 'in-progress', 'completed', 'archived')),
    summary        TEXT,                           -- 一句话摘要(未来注入 agent 上下文)
    proposal_id    TEXT REFERENCES proposals(id),  -- 来源谱系身份 FK(建表序不校验引用序,DML 时校验)
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

-- [域表 2] FEATURE_DOCUMENTS —— 文档索引(行级开放:doc_kind 受控词汇 TS 单源,无 DB CHECK)
CREATE TABLE feature_documents (
    feature_id  TEXT NOT NULL REFERENCES features(id),   -- id 关联(2026-10-06 设计裁决)
    doc_kind    TEXT NOT NULL,
    rel_path    TEXT NOT NULL,                           -- 相对 forge_dir,正斜杠;可悬空(SC-branch 容错)
    summary     TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (feature_id, doc_kind)
);

-- [域表 3] TASKS —— 任务实体 + 七态(代理主键 id:FK/前端引用锚,slug 改名零级联——2026-10-06 用户裁决)
CREATE TABLE tasks (
    id              TEXT PRIMARY KEY,                -- uuid(应用生成)——records/edges/links FK 与前端引用锚
    slug            TEXT NOT NULL,                   -- agent 自然键 ①(feature slug;与 feature_id→features.slug 服务同步)
    local_id        TEXT NOT NULL,                   -- agent 自然键 ②(混合分配:数值顺延 / fix-N·disc-N 前缀,§6-35⑦)
    title           TEXT NOT NULL,
    task_type       TEXT NOT NULL,                   -- TaskType 20 值 TS 单源,无 DB CHECK(§5-7)
    task_status     TEXT NOT NULL DEFAULT 'pending'
                    CONSTRAINT ck_tasks_status CHECK (task_status IN
                      ('pending', 'in_progress', 'completed', 'blocked',
                       'suspended', 'skipped', 'rejected')),
    task_desc       TEXT,                            -- 内容负载(Hard Rules/参照列表等自由文本,C11)
    priority        TEXT CONSTRAINT ck_tasks_priority CHECK (priority IN ('P0', 'P1', 'P2')),
    estimated_time  TEXT,                            -- 如 '1-2h'(autoconfig 产出语义)
    vars_json       TEXT,                            -- --var 注入变量(JSON 编码)
    source_task_id  TEXT REFERENCES tasks(id),       -- fix 链源(id 自引用;链深 ≤6 服务内校验)
    blocked_reason  TEXT,
    main_session    INTEGER NOT NULL DEFAULT 0
                    CONSTRAINT ck_tasks_main_session CHECK (main_session IN (0, 1)),
    breaking        INTEGER NOT NULL DEFAULT 0
                    CONSTRAINT ck_tasks_breaking CHECK (breaking IN (0, 1)),
    coverage        REAL,                            -- 覆盖阈值小数;NULL = 全局默认(三级优先)
    complexity      TEXT NOT NULL DEFAULT 'medium'
                    CONSTRAINT ck_tasks_complexity CHECK (complexity IN ('low', 'medium', 'high')),
    surface_key     TEXT,
    surface_type    TEXT,
    feature_id      TEXT NOT NULL REFERENCES features(id),  -- 显式 FK(id 关联;slug 列 ≡ feature slug 由服务不变量 + validateFeatureTasks 断言)
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    CONSTRAINT uq_tasks_slug_local UNIQUE (slug, local_id)  -- agent 自然键查捞(slug/localId 识别)
);

CREATE INDEX idx_tasks_feature_status ON tasks(feature_id, task_status);  -- 列表+七态 chips+写时增量断言
CREATE INDEX idx_tasks_source         ON tasks(source_task_id);         -- fix 链溯源/链深计数

-- [域表 4] TASK_EDGES —— 前置依赖边(等待方→前置方;PK = 出度方向;复合主键即存储级去重;id 引用——slug 改名零级联)
CREATE TABLE task_edges (
    task_id          TEXT NOT NULL REFERENCES tasks(id),
    prerequisite_id  TEXT NOT NULL REFERENCES tasks(id),
    origin           TEXT NOT NULL
                     CONSTRAINT ck_edges_origin CHECK (origin IN ('manual', 'fix-chain', 'autoconfig')),
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,                  -- 边不可变,updated_at 恒 = created_at
    PRIMARY KEY (task_id, prerequisite_id)
    -- 同 feature 边约束(§6-15)移交服务不变量 + validateFeatureTasks(id 引用后边行无 slug 可比——DB CHECK 退役)
);
CREATE INDEX idx_edges_prerequisite ON task_edges(prerequisite_id);     -- 恢复钩子反查/后继派生(物理加速 §6-19)

-- [域表 5] TASK_RECORDS —— 执行与审计(append-only 双触发器机械防线)
CREATE TABLE task_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         TEXT NOT NULL REFERENCES tasks(id),
    verb            TEXT NOT NULL,                   -- 6 值 TS 单源无 CHECK(§6-32③):
                                                    --   add/claim/submit/transition/auto-restore/auto-block
    from_status     TEXT,
    to_status       TEXT,
    reason          TEXT,                            -- transition 与 blocked submit 必带(服务内校验)
    summary         TEXT,                            -- 执行摘要(keyDecisions 等自由文本)
    files_json      TEXT,                            -- 实际改动文件清单(JSON 路径数组;submit 入参或 commit 查找回填)
    gate_json       TEXT,                            -- {compile,fmt,lint,test[,coverage]}
    commit_hash     TEXT,
    dispatch_digest TEXT,                            -- claim 简报指纹 sha-256 前 12 hex(全文 = dsh 子会话日志,§6-11)
    actor           TEXT NOT NULL
                    CONSTRAINT ck_records_actor CHECK (actor IN ('plugin-tool', 'ui', 'core')),
    session_id      TEXT,                            -- claim = 派发会话 / submit = 执行会话(两形态混存,S8:按相异判)
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL                    -- append-only,恒 = created_at
    -- ⚠ M3 前向软迁移预留:branch / worktree 两列不在 M2 落地(db-schema §2.4 警告)
);

CREATE INDEX idx_records_task    ON task_records(task_id, id);
CREATE INDEX idx_records_session ON task_records(session_id);

CREATE TRIGGER trg_task_records_no_update BEFORE UPDATE ON task_records
BEGIN SELECT RAISE(ABORT, 'task_records: append-only violation (update)'); END;
CREATE TRIGGER trg_task_records_no_delete BEFORE DELETE ON task_records
BEGIN SELECT RAISE(ABORT, 'task_records: append-only violation (delete)'); END;

-- [域表 6] PROPOSALS —— 提案五态承载(管线完整消费 = M3)
CREATE TABLE proposals (
    id              TEXT PRIMARY KEY,                -- uuid(应用生成)
    slug            TEXT NOT NULL UNIQUE,            -- 目录名自然键;可改名(关联走 id)
    title           TEXT NOT NULL,
    proposal_status TEXT NOT NULL DEFAULT 'draft'
                    CONSTRAINT ck_proposals_status CHECK (proposal_status IN
                      ('draft', 'under-review', 'accepted', 'rejected', 'superseded')),
    rel_path        TEXT,                            -- proposal.md 相对 forge_dir(SC4 浏览锚点)
    author          TEXT,
    decided_at      TEXT,                            -- 裁决时刻(→accepted/rejected 时写;打回/superseded 不改写)
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- [域表 7] TASK_SESSION_LINKS —— 任务↔会话挂接(纯关联事实;唯一写源 = claim,upsert-ignore)
CREATE TABLE task_session_links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     TEXT NOT NULL REFERENCES tasks(id),
    session_id  TEXT NOT NULL,                       -- dsh 会话 id(账本本体在 dsh)
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    CONSTRAINT uq_tsl_task_session UNIQUE (task_id, session_id)   -- 同任务同会话幂等
);

CREATE INDEX idx_tsl_session ON task_session_links(session_id);    -- 会话头挂接 pill 反查
