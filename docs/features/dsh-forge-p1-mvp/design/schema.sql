-- ============================================================
-- Schema: dsh-forge P1（MVP）  |  Engine: SQLite (better-sqlite3)
-- Generated from: design/er-diagram.md
-- 部署: {app-data}/dsh-forge/state.db (应用 profile, Electron main 持有句柄)
-- 版本: SCHEMA_VERSION = 1 (迁移前向单向; 旧应用打开新 schema 拒绝)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- [NEW] SCHEMA_META — schema 版本表 (前向迁移唯一机制)
CREATE TABLE schema_meta (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL
);

-- [NEW] PROJECTS — 项目记录 (唯一 SoT; dsh workspace 为外键引用, 账本本体在 dsh)
CREATE TABLE projects (
    id                   TEXT PRIMARY KEY,                       -- 应用生成 uuid
    workspace_id         TEXT NOT NULL UNIQUE,                   -- dsh workspace uuid (引用)
    ws_path              TEXT NOT NULL,                          -- canonical path (对账钥匙)
    name                 TEXT NOT NULL,                          -- 展示名 (默认取文件夹名)
    forge_dir            TEXT NOT NULL,                          -- 文档位置 = forge 目录
    forge_dir_external   INTEGER NOT NULL DEFAULT 0,             -- 0=仓内 1=仓外 (路径关系自动推导)
    knowledge_dir        TEXT NOT NULL,                          -- 知识库目录
    archived             INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    CONSTRAINT ck_projects_external CHECK (forge_dir_external IN (0, 1))
);

CREATE UNIQUE INDEX idx_projects_ws_path ON projects(ws_path);

-- [NEW] KNOWLEDGE_ENTRIES — 知识索引缓存 (派生缓存, 可按 project 整表重建; SC2 豁免)
CREATE TABLE knowledge_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    frontmatter_id  TEXT,                                          -- 稳定 ID (M6 转正; P1 可 NULL)
    rel_path        TEXT    NOT NULL,                              -- 相对知识目录路径
    domain_path     TEXT    NOT NULL,                              -- 域 = 目录路径派生 (≤3 层)
    title           TEXT    NOT NULL,
    summary         TEXT    NOT NULL,
    keywords         TEXT    NOT NULL DEFAULT '[]',                  -- frontmatter.keywords 数组 (JSON 编码)
    status          TEXT    NOT NULL DEFAULT 'draft',
    digest          TEXT    NOT NULL,                              -- 内容摘要 (对账变更检测)
    indexed_at      TEXT    NOT NULL,
    CONSTRAINT uq_ke_project_rel_path UNIQUE (project_id, rel_path)
);

CREATE INDEX idx_ke_project_domain   ON knowledge_entries(project_id, domain_path);
CREATE INDEX idx_ke_frontmatter_id   ON knowledge_entries(frontmatter_id);

-- [NEW] KNOWLEDGE_RECALL_LOGS — 知识召回日志 (SoT, append-only; 一行 = 一次调用 × 一个命中条目)
--        单表双消费面: 会话召回 tab 数据源 (call_id 聚合) + 热度/置信度信号 (按条目计数);
--        零命中调用写 entry_id=NULL 哨兵行; 快照字段抗索引重建; 与 app_key_logs 完全分离
CREATE TABLE knowledge_recall_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    call_id         TEXT    NOT NULL,                             -- 一次调用的分组键 (uuid, 同调用各行共享)
    session_id      TEXT    NOT NULL,                             -- dsh 会话 id (tab 分组键)
    verb            TEXT    NOT NULL,
    entry_id        INTEGER REFERENCES knowledge_entries(id),     -- NULL = 零命中哨兵行 / 条目已重建清除
    frontmatter_id  TEXT,                                         -- 稳定 ID 快照 (热度兜底分组)
    title_snap      TEXT,                                         -- 命中条目标题快照 (抗重建失真)
    domain_snap     TEXT,                                         -- 命中条目域快照
    query_json      TEXT,                                         -- 调用参数快照 (同 call 各行重复)
    hit_count       INTEGER NOT NULL,                             -- 该调用命中数 (零命中哨兵行 = 0)
    duration_ms     INTEGER,                                      -- 调用耗时毫秒 (M7 trace 消费)
    created_at      TEXT    NOT NULL,                             -- 召回执行点时间
    CONSTRAINT ck_krl_verb CHECK (verb IN ('search', 'read-abstract'))
);

CREATE INDEX idx_krl_project_session ON knowledge_recall_logs(project_id, session_id, created_at);
CREATE INDEX idx_krl_call            ON knowledge_recall_logs(call_id);
CREATE INDEX idx_krl_entry           ON knowledge_recall_logs(entry_id, frontmatter_id);

-- [NEW] APP_KEY_LOGS — 关键日志 (append-only; 非流水账: 仅异常/失败/自动修复/孤儿发现,
--        单事件单条—处置结果并入 data_json; 常规成功路径一律不记)
CREATE TABLE app_key_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    level       TEXT NOT NULL,
    scope       TEXT NOT NULL,                                    -- compensation|reconcile|index|recall
    message     TEXT NOT NULL,
    data_json   TEXT,                                             -- 结构化附载 (workspaceId/原因/处置结果)
    created_at  TEXT NOT NULL,
    CONSTRAINT ck_akl_level CHECK (level IN ('warn', 'error')),
    CONSTRAINT ck_akl_scope CHECK (scope IN ('compensation', 'reconcile', 'index', 'recall'))
);

CREATE INDEX idx_akl_scope_time ON app_key_logs(scope, created_at);

-- 初始版本行 (迁移函数写入; 应用启动时校验 version <= 支持上限, 超出明确拒绝)
-- INSERT INTO schema_meta(version, applied_at) VALUES (1, /* ISO-8601 now */);
