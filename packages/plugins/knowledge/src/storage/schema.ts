// 自持库 schema 版本线（knowledge-stage1 A2 前两弹）：schema_meta 前向迁移骨架 + v1 初始版本行。
// 前向单向：只追加新版本 StorageMigration（不直改已发布版本）；版本门在 open.ts
//（库内 version 超出本代码上限 = 拒开）。v1 只含 schema_meta + 注册表（projects）；
// entries/recall_logs 等表由后续任务按 v2+ 追加（轻量种子迁移任务承接）。
// 独立版本线：与 core state.db 的 MIGRATIONS 无关（零 core 依赖——SC-2 铁律）。

/** 一次前向迁移 = 版本号 + 语句集（单事务原子应用——open.ts applyMigrations） */
export interface StorageMigration {
  readonly version: number
  readonly statements: readonly string[]
}

/** 本插件支持的自持库 schema 版本上限（版本门：库内 version 超出即拒绝打开） */
export const STORAGE_SCHEMA_VERSION = 1

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
]
