-- ============================================================
-- Schema: dsh-forge M3 · 每工作区任务库  |  Engine: SQLite (better-sqlite3)
-- Generated from: design/er-diagram.md(输入底稿 = docs/proposals/dsh-forge-m2-pipeline/db-schema.md
--   + M3 提案裁决 + tech-design §Data Models 用户裁决 2026-10-08)
-- 部署: {tasksHome}/{flatten(canonical-path)}@{hash8(canonical-path)}/forge.db
--   tasksHome = env DSH_FORGE_TASKS_HOME > {userData}/forge-workspaces(core resolveTasksHome 单源)
--   logs/     = 同目录 logs/{slug}.jsonl(容器维度业务日志·plugin 写)——非 schema 对象,注记于此
-- 版本: FORGE_DB_SCHEMA_VERSION = 1(v1 直改终态——产品未上线零兼容义务·无迁移路径;
--   开发期存量 dogfood 库废弃:手工删除,发现面重扫)
-- 打开: 惰性首开(每库每进程首次触达)——open+migrate+开库断言;失败 = 工作区隔离(ERR_WORKSPACE_DB_UNAVAILABLE)
-- 纪律: WAL + foreign_keys=ON;ISO-8601 TEXT 时间戳;ck_* 约束命名;FK 一律无 ON DELETE(无删除动词)
-- ⚠ 对 M2 schema 的差异(5 项):+feature_records(域表总数增至 8——feature_records 内联为域表 3);
--   proposals +mode +superseded_by;tasks 源头双列化(source_kind+source_id 取代 feature_id)
--   +mode+ac_json、main_session 砍除;idx_tasks_feature_status → idx_tasks_source_status;
--   迁移机制 = v1 直改(无迁移·存量开发库废弃;features 零改动——恒远征·无 mode 列)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- [基建] SCHEMA_META —— 版本表随库(前向迁移唯一机制;applied_at 即一次性时间戳,豁免 updated_at)
CREATE TABLE schema_meta (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL
);

-- [基建] APP_KEY_LOGS —— 工作区关键日志(结构沿 M2;scope 两值——中央 ck_akl_scope 四值不含,随库自带)
CREATE TABLE app_key_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    level       TEXT NOT NULL CONSTRAINT ck_wkl_level CHECK (level IN ('warn', 'error')),
    scope       TEXT NOT NULL CONSTRAINT ck_wkl_scope CHECK (scope IN ('tasks', 'workspace')),
    data_json   TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

-- [域表 1] FEATURES —— feature 状态 SoT(M3 零改动:恒远征语义,无 mode 列——成链门保证
--           feature ⟹ 成链时 proposal.mode='expedition';UF-4「固定远征」= 硬编码恒真)
CREATE TABLE features (
    id             TEXT PRIMARY KEY,               -- uuid(应用生成;身份与名称分离 §6-31)
    slug           TEXT NOT NULL UNIQUE,           -- 目录名自然键;任务键承载分量(实践不可变)
    title          TEXT NOT NULL,
    feature_status TEXT NOT NULL DEFAULT 'prd'
                   CONSTRAINT ck_features_status CHECK (feature_status IN
                     ('prd', 'design', 'tasks', 'in-progress', 'completed', 'archived')),
    summary        TEXT,                           -- 一句话摘要(未来注入 agent 上下文)
    proposal_id    TEXT REFERENCES proposals(id),  -- 来源谱系身份 FK(远征成链写入·突击提案永无此链)
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

-- [域表 2] FEATURE_DOCUMENTS —— 文档索引(行级开放:doc_kind 受控词汇 TS 单源,无 DB CHECK)
CREATE TABLE feature_documents (
    feature_id  TEXT NOT NULL REFERENCES features(id),
    doc_kind    TEXT NOT NULL,
    rel_path    TEXT NOT NULL,                     -- 相对 forge_dir,正斜杠;可悬空(SC-branch 容错)
    summary     TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (feature_id, doc_kind)
);

-- [域表 3] FEATURE_RECORDS —— feature 域审计(M3 新增·§6-35④ 兑付;append-only 双触发器)
CREATE TABLE feature_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    feature_id  TEXT NOT NULL REFERENCES features(id),
    verb        TEXT NOT NULL,                     -- register/transition/doc-upsert(TS 单源无 CHECK·§6-25 判据;
                                                   --   mode-sync 不存在——features 无 mode 列)
    from_status TEXT,
    to_status   TEXT,
    reason      TEXT,                              -- transition 必带(服务内校验,含弃案归档)
    actor       TEXT NOT NULL
                CONSTRAINT ck_fr_actor CHECK (actor IN ('plugin-tool', 'ui', 'core')),
    session_id  TEXT,                              -- actor 所属 dsh 会话
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL                      -- append-only,恒 = created_at(全表纪律)
);

CREATE INDEX idx_fr_feature ON feature_records(feature_id, id);

CREATE TRIGGER trg_feature_records_no_update BEFORE UPDATE ON feature_records
BEGIN SELECT RAISE(ABORT, 'feature_records: append-only violation (update)'); END;
CREATE TRIGGER trg_feature_records_no_delete BEFORE DELETE ON feature_records
BEGIN SELECT RAISE(ABORT, 'feature_records: append-only violation (delete)'); END;

-- [域表 4] TASKS —— 任务实体 + 七态 + 容器双轨(M3 直改:source 双列取代 feature_id;
--           mode 创建时快照;ac_json = AC gate 数据面;main_session 砍除——老 forge 形态约束残留)
CREATE TABLE tasks (
    id              TEXT PRIMARY KEY,              -- uuid(应用生成)——records/edges/links FK 与前端引用锚
    slug            TEXT NOT NULL,                 -- agent 自然键 ① ≡ 容器 slug(feature|proposal·服务不变量)
    local_id        TEXT NOT NULL,                 -- agent 自然键 ②(混合分配:数值顺延 / fix-N·disc-N 前缀)
    title           TEXT NOT NULL,
    task_type       TEXT NOT NULL,                 -- TaskType 20 值 TS 单源,无 DB CHECK(§5-7)
    task_status     TEXT NOT NULL DEFAULT 'pending'
                    CONSTRAINT ck_tasks_status CHECK (task_status IN
                      ('pending', 'in_progress', 'completed', 'blocked',
                       'suspended', 'skipped', 'rejected')),
    task_desc       TEXT,                          -- 内容负载(Hard Rules/参照列表等自由文本,C11)
    ac_json         TEXT,                          -- 验收标准清单(JSON string[];NULL = 无 AC 任务不校验)
    priority        TEXT CONSTRAINT ck_tasks_priority CHECK (priority IN ('P0', 'P1', 'P2')),
    estimated_time  TEXT,                          -- 如 '1-2h'(autoconfig 产出语义)
    vars_json       TEXT,                          -- --var 注入变量(JSON 编码)
    source_task_id  TEXT REFERENCES tasks(id),     -- fix 链源(id 自引用;链深 ≤6 服务内校验)
    blocked_reason  TEXT,
    breaking        INTEGER NOT NULL DEFAULT 0
                    CONSTRAINT ck_tasks_breaking CHECK (breaking IN (0, 1)),
    coverage        REAL,                          -- 覆盖阈值小数;NULL = 全局默认(三级优先)
    complexity      TEXT NOT NULL DEFAULT 'medium'
                    CONSTRAINT ck_tasks_complexity CHECK (complexity IN ('low', 'medium', 'high')),
    surface_key     TEXT,
    surface_type    TEXT,
    source_kind     TEXT NOT NULL
                    CONSTRAINT ck_tasks_source_kind CHECK (source_kind IN ('feature', 'proposal')),
    source_id       TEXT NOT NULL,                 -- 通用源头唯一标识 → features.id | proposals.id
                                                    --   (多态引用无 DB FK·引用完整性 = 服务不变量 + 校验动词)
    mode            TEXT CONSTRAINT ck_tasks_mode
                    CHECK (mode IN ('expedition', 'blitz') OR mode IS NULL),
                                                    -- 创建时容器 mode 快照(feature 容器恒 expedition;
                                                    -- proposal 容器取 proposals.mode·可 NULL)·人工变更不回溯
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    CONSTRAINT uq_tasks_slug_local UNIQUE (slug, local_id)  -- agent 自然键查捞(slug/localId 识别)
);

CREATE INDEX idx_tasks_source_status ON tasks(source_id, task_status);  -- 容器列表+chips+写时增量断言
CREATE INDEX idx_tasks_source        ON tasks(source_task_id);         -- fix 链溯源/链深计数

-- [域表 5] TASK_EDGES —— 前置依赖边(等待方→前置方;PK = 出度方向;id 引用;同容器约束 = 服务不变量)
CREATE TABLE task_edges (
    task_id          TEXT NOT NULL REFERENCES tasks(id),
    prerequisite_id  TEXT NOT NULL REFERENCES tasks(id),
    origin           TEXT NOT NULL
                     CONSTRAINT ck_edges_origin CHECK (origin IN ('manual', 'fix-chain', 'autoconfig')),
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,                -- 边不可变,恒 = created_at
    PRIMARY KEY (task_id, prerequisite_id)
);
CREATE INDEX idx_edges_prerequisite ON task_edges(prerequisite_id);    -- 恢复钩子反查/后继派生

-- [域表 6] TASK_RECORDS —— 执行与审计(append-only 双触发器;M2 形态不动——branch/worktree 仍顺延)
CREATE TABLE task_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         TEXT NOT NULL REFERENCES tasks(id),
    verb            TEXT NOT NULL,                 -- 6 值 TS 单源无 CHECK:
                                                    --   add/claim/submit/transition/auto-restore/auto-block
    from_status     TEXT,
    to_status       TEXT,
    reason          TEXT,                          -- transition 与 blocked submit 必带(服务内校验)
    summary         TEXT,                          -- 执行摘要(keyDecisions 等自由文本)
    files_json      TEXT,                          -- 实际改动文件清单(JSON 路径数组)
    gate_json       TEXT,                          -- {compile,fmt,lint,test[,coverage]}——gate 任务数字摘要承载体
    commit_hash     TEXT,
    dispatch_digest TEXT,                          -- claim 简报指纹 sha-256 前 12 hex(全文 = worker 会话日志)
    actor           TEXT NOT NULL
                    CONSTRAINT ck_records_actor CHECK (actor IN ('plugin-tool', 'ui', 'core')),
    session_id      TEXT,                          -- claim = 派发会话 / submit = 执行会话(两形态混存·相异判)
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL                  -- append-only,恒 = created_at
);

CREATE INDEX idx_records_task    ON task_records(task_id, id);
CREATE INDEX idx_records_session ON task_records(session_id);

CREATE TRIGGER trg_task_records_no_update BEFORE UPDATE ON task_records
BEGIN SELECT RAISE(ABORT, 'task_records: append-only violation (update)'); END;
CREATE TRIGGER trg_task_records_no_delete BEFORE DELETE ON task_records
BEGIN SELECT RAISE(ABORT, 'task_records: append-only violation (delete)'); END;

-- [域表 7] PROPOSALS —— 提案五态 + mode 溯源(M3:+mode 列;features 恒远征故无对位列)
CREATE TABLE proposals (
    id              TEXT PRIMARY KEY,              -- uuid(应用生成)
    slug            TEXT NOT NULL UNIQUE,          -- 目录名自然键;可改名(关联走 id)
    title           TEXT NOT NULL,
    proposal_status TEXT NOT NULL DEFAULT 'draft'
                    CONSTRAINT ck_proposals_status CHECK (proposal_status IN
                      ('draft', 'under-review', 'accepted', 'rejected', 'superseded')),
    rel_path        TEXT,                          -- proposal.md 相对 forge_dir(SC4 浏览锚点)
    author          TEXT,
    mode            TEXT CONSTRAINT ck_proposals_mode
                    CHECK (mode IN ('expedition', 'blitz') OR mode IS NULL),
                                                    -- 溯源(创建时写入·UI mode chip;NULL = 扫描吸收旧提案缺省占位;
                                                    --   成链门:accepted && mode='expedition' 才 registerFeature)
    superseded_by   TEXT REFERENCES proposals(id),  -- 谱系取代链(M3·UF-1 谱系右列):superseded 转移时写入
                                                    --   (transitionProposal 必带 supersededBy·目标在场校验)
    decided_at      TEXT,                          -- 裁决时刻(→accepted/rejected 时写;打回/superseded 不改写)
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- [域表 8] TASK_SESSION_LINKS —— 任务↔会话挂接(纯关联事实;唯一写源 = claim,upsert-ignore)
CREATE TABLE task_session_links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     TEXT NOT NULL REFERENCES tasks(id),
    session_id  TEXT NOT NULL,                     -- dsh 会话 id(账本本体在 dsh)
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    CONSTRAINT uq_tsl_task_session UNIQUE (task_id, session_id)   -- 同任务同会话幂等
);

CREATE INDEX idx_tsl_session ON task_session_links(session_id);    -- 会话头挂接 pill 反查
