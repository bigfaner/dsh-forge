// 自持库 schema 版本线（knowledge-stage1 A2 前两弹）：schema_meta 前向迁移骨架 + v1 初始版本行。
// 前向单向：只追加新版本 StorageMigration（不直改已发布版本）；版本门在 open.ts
//（库内 version 超出本代码上限 = 拒开）。v1 只含 schema_meta + 注册表（projects）；
// entries/recall_logs 等表由后续任务按 v2+ 追加（轻量种子迁移任务承接）。
// 独立版本线：与 core state.db 的 MIGRATIONS 无关（零 core 依赖——SC-2 铁律）。
// v2（轻量种子迁移任务）：entries 索引缓存 + recall_logs 召回轨迹 + seed_migration
// 幂等标记表——entries/recall_logs 零 FK（裁决：不建 FK 重映射机械；recall_logs 的
// project_id 为旧 core id 快照列，行集等价口径，不作 join 键）。

/** 一次前向迁移 = 版本号 + 语句集（单事务原子应用——open.ts applyMigrations） */
export interface StorageMigration {
  readonly version: number
  readonly statements: readonly string[]
}

/** 本插件支持的自持库 schema 版本上限（版本门：库内 version 超出即拒绝打开） */
export const STORAGE_SCHEMA_VERSION = 3

/**
 * v1：schema_meta（版本线本体）+ 自持注册表 projects。
 * 注册键 = ws_path canonical（realpath 归一——open.ts/registry.ts canonicalWsPath），
 * knowledge_dir 列承载项目知识库目录（种子迁移任务自此列承接 core projects.knowledge_dir）。
 */
export const STORAGE_MIGRATIONS: readonly StorageMigration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE schema_meta (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL
)`,
      `CREATE TABLE projects (
    ws_path       TEXT PRIMARY KEY,
    knowledge_dir TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
)`,
    ],
  },
  {
    // v2（轻量种子迁移）：entries 索引缓存（项目键 = ws_path canonical——注册表键同源；
    // rel_path 唯一约束同 core knowledge_entries 口径）+ recall_logs（core 列集快照拷贝、
    // 零 FK——entry_id 旧缓存引用随 entries 零迁天然悬空，行保留只承载热度史）+
    // seed_migration 迁移幂等标记（source 键 → 完成态，二次启动零重复迁移零重复事件）。
    version: 2,
    statements: [
      `CREATE TABLE knowledge_entries (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ws_path        TEXT    NOT NULL,
    frontmatter_id TEXT,
    rel_path       TEXT    NOT NULL,
    domain_path    TEXT    NOT NULL,
    title          TEXT    NOT NULL,
    summary        TEXT    NOT NULL,
    keywords       TEXT    NOT NULL DEFAULT '[]',
    status         TEXT    NOT NULL DEFAULT 'draft',
    digest         TEXT    NOT NULL,
    indexed_at     TEXT    NOT NULL,
    CONSTRAINT uq_ke_ws_rel_path UNIQUE (ws_path, rel_path)
)`,
      `CREATE INDEX idx_ke_ws_domain ON knowledge_entries(ws_path, domain_path)`,
      `CREATE INDEX idx_ke_frontmatter_id ON knowledge_entries(frontmatter_id)`,
      `CREATE TABLE knowledge_recall_logs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     TEXT    NOT NULL,
    call_id        TEXT    NOT NULL,
    session_id     TEXT    NOT NULL,
    verb           TEXT    NOT NULL,
    entry_id       INTEGER,
    frontmatter_id TEXT,
    title_snap     TEXT,
    domain_snap    TEXT,
    query_json     TEXT,
    hit_count      INTEGER NOT NULL,
    duration_ms    INTEGER,
    created_at     TEXT    NOT NULL,
    CONSTRAINT ck_krl_verb CHECK (verb IN ('search', 'read-abstract'))
)`,
      `CREATE INDEX idx_krl_project_session ON knowledge_recall_logs(project_id, session_id, created_at)`,
      `CREATE INDEX idx_krl_call ON knowledge_recall_logs(call_id)`,
      `CREATE INDEX idx_krl_entry ON knowledge_recall_logs(entry_id, frontmatter_id)`,
      `CREATE TABLE seed_migration (
    source        TEXT PRIMARY KEY,
    migrated_at   TEXT    NOT NULL,
    registry_rows INTEGER NOT NULL,
    recall_rows   INTEGER NOT NULL
)`,
    ],
  },
  {
    // v3（fix-2 一级解析动态化）：注册表增 project_id 列（API 级 projectId——运行期
    // registerProject 落列；可空：种子迁移/预置行无该值）。服务面两级解析第一级在
    // config 静态表未命中时回查本列（动态注册项目无需重启即命中）。
    version: 3,
    statements: [`ALTER TABLE projects ADD COLUMN project_id TEXT`],
  },
]
