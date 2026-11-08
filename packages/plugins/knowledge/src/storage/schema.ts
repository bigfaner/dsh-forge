// 自持库 schema 版本线（knowledge-stage1 A2 前两弹）：schema_meta 前向迁移骨架 + v1 初始版本行。
// 前向单向：只追加新版本 StorageMigration（不直改已发布版本）；版本门在 open.ts
//（库内 version 超出本代码上限 = 拒开）。v1 只含 schema_meta + 注册表（projects）；
// entries/recall_logs 等表由后续任务按 v2+ 追加（轻量种子迁移任务承接）。
// 独立版本线：与 core state.db 的 MIGRATIONS 无关（零 core 依赖——SC-2 铁律）。
import type Database from 'better-sqlite3'
// v2（轻量种子迁移任务）：entries 索引缓存 + recall_logs 召回轨迹 + seed_migration
// 幂等标记表——entries/recall_logs 零 FK（裁决：不建 FK 重映射机械；recall_logs 的
// project_id 为旧 core id 快照列，行集等价口径，不作 join 键）。

/**
 * 一次前向迁移 = 版本号 + 语句集（单事务原子应用——open.ts applyMigrations）。
 * downgradeStatements = 逆向语句集（降级同事务原子应用——downgradeKnowledgeSchema）：
 * 恢复前一版本形态（缓存表恢复空表——语义由 rebuild 再生；业务账/注册行数据完整保留）。
 */
export interface StorageMigration {
  readonly version: number
  readonly statements: readonly string[]
  readonly downgradeStatements?: readonly string[]
  /**
   * 降级前置门（v7 起——同 downgradeStatements 先例的接口扩展）：逐版降级循环消费，
   * 目标版本低于本版时先过 guard 再落 downgradeStatements。guard 体 fail-loud（抛错
   * 即中止，schema_meta 不动——降级零半步）。v6 及以下无 guard——既有降级链零波及。
   */
  readonly downgradeGuard?: (db: Database.Database) => void
}

/**
 * 本插件支持的自持库 schema 版本上限（版本门：库内 version 超出即拒绝打开）。
 * v7（stage④ 1.3——提案 §2.1/§2.2/§2.3 DDL 面）：minor +1 起算基线（后续 coding 任务 patch +1）。
 */
export const STORAGE_SCHEMA_VERSION = 7

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
  {
    // v4（stage② A1 存储地基——提案 §2.2/§2.8/§2.9）：实体六表 + FTS5 + 注册表改名。
    // · projects → knowledge_registry（ALTER RENAME：行集零重建，数据完整迁移）；
    // · 旧 knowledge_entries（v2 项目键缓存）退役 DROP——纯缓存可 rebuild 再生，语义
    //   升级由本版新表承接（§2.9：新 KNOWLEDGE_ENTRIES 主键 = slug id，全局无项目键）；
    // · KNOWLEDGE_ENTRIES（三态 status CHECK + effective_rank 四档 CHECK + procedure_tag
    //   + merged_into + domain）+ KNOWLEDGE_ENTRY_VERSIONS（(id, version_ts) 版本键 +
    //   file_path 对账锚唯一）+ KNOWLEDGE_SYNONYMS（词表配置面）+
    //   KNOWLEDGE_MERGE_LEDGER（归并审计账——业务账，永不在 rebuild 白名单内）+
    //   knowledge_fts（FTS5 虚表——纯派生可 drop 重建）；
    // · knowledge_recall_logs（v2 落地）为第六实体，本版不动（业务账）。
    // downgrade = 恢复 v3 形态：新表全撤、旧 knowledge_entries 缓存空表重建（rebuild 再生）、
    // 注册表改回 projects（数据完整保留）。
    version: 4,
    statements: [
      `ALTER TABLE projects RENAME TO knowledge_registry`,
      `DROP TABLE knowledge_entries`,
      `CREATE TABLE knowledge_entries (
    id                   TEXT PRIMARY KEY,
    title                TEXT    NOT NULL,
    title_norm           TEXT    NOT NULL,
    type                 TEXT,
    procedure_tag        INTEGER NOT NULL DEFAULT 0,
    status               TEXT    NOT NULL CHECK (status IN ('unconfirmed', 'confirmed', 'superseded')),
    effective_rank       REAL    NOT NULL CHECK (effective_rank IN (0.2, 0.4, 0.6, 1.0)),
    confirmed_version_id TEXT,
    merged_into          TEXT,
    domain               TEXT    NOT NULL,
    updated_at           TEXT    NOT NULL
)`,
      `CREATE INDEX idx_kentries_domain ON knowledge_entries(domain)`,
      `CREATE INDEX idx_kentries_merged_into ON knowledge_entries(merged_into)`,
      `CREATE TABLE knowledge_entry_versions (
    id           TEXT NOT NULL,
    version_ts   TEXT NOT NULL,
    file_path    TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    recorded_at  TEXT NOT NULL,
    PRIMARY KEY (id, version_ts)
)`,
      `CREATE UNIQUE INDEX idx_kev_file_path ON knowledge_entry_versions(file_path)`,
      `CREATE TABLE knowledge_synonyms (
    term_norm      TEXT PRIMARY KEY,
    canonical_term TEXT NOT NULL
)`,
      `CREATE TABLE knowledge_merge_ledger (
    seq       INTEGER PRIMARY KEY AUTOINCREMENT,
    winner_id TEXT NOT NULL,
    loser_id  TEXT NOT NULL,
    reason    TEXT,
    actor     TEXT NOT NULL CHECK (actor IN ('agent', 'human')),
    merged_at TEXT NOT NULL
)`,
      `CREATE VIRTUAL TABLE knowledge_fts USING fts5(id UNINDEXED, title, keywords, summary)`,
    ],
    downgradeStatements: [
      `DROP TABLE knowledge_fts`,
      `DROP TABLE knowledge_merge_ledger`,
      `DROP TABLE knowledge_synonyms`,
      `DROP TABLE knowledge_entry_versions`,
      `DROP TABLE knowledge_entries`,
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
      `ALTER TABLE knowledge_registry RENAME TO projects`,
    ],
  },
  {
    // v5（knowledge-stage2-followups #1——用户裁决 2026-11-05）：归并台账表改名
    // knowledge_merge_ledger → knowledge_supersede_ledger（ALTER RENAME——v4 存量库
    // 行集零重建，台账数据完整迁移）。downgrade = 改回旧名（数据完整保留）。
    version: 5,
    statements: [`ALTER TABLE knowledge_merge_ledger RENAME TO knowledge_supersede_ledger`],
    downgradeStatements: [`ALTER TABLE knowledge_supersede_ledger RENAME TO knowledge_merge_ledger`],
  },
  {
    // v6（stage③ 1.3——提案 §2.2 KNOWLEDGE_DOMAINS 详设）：域简介表（目录元数据非条目，
    // DB 权威——不适用「条目文件权威」铁律）。主键 = (ws_path, domain)：ws_path 关联
    // knowledge_registry 主键（裁决 #7：project_id 可空无 UNIQUE、FK 不可建——ws_path
    // 关联零迁移成本）；domain = 域相对路径（≤3 层，注册目录相对）；description NULL =
    // 无简介（动态段降级显示）；updated_at = 简介最后写入时点。全库零 FK——注册行注销
    // 时该 ws_path 域行由注销径应用层级联手删（registry.remove）。存量域初始化由
    // rebuild/register 对账首跑补行（description NULL——rebuild.ts 同事务对账）。
    // downgrade = DROP TABLE（域行纯目录元数据，简介可重录；schema_meta 行随
    // downgradeKnowledgeSchema 删）。
    version: 6,
    statements: [
      `CREATE TABLE knowledge_domains (
    ws_path     TEXT    NOT NULL,
    domain      TEXT    NOT NULL,
    description TEXT,
    updated_at  TEXT    NOT NULL,
    PRIMARY KEY (ws_path, domain)
)`,
    ],
    downgradeStatements: [`DROP TABLE knowledge_domains`],
  },
  {
    // v7（stage④ 1.3——提案 §2.1/§2.2/§2.3 DDL 八列 + verb 枚举扩）：
    // · knowledge_registry 增 scope TEXT NOT NULL DEFAULT 'project'（ALTER——零重建，存量行
    //   落默认值；无 DB CHECK，二值校验落应用层 + 迁移测试 pin）；
    // · recall_logs 表重建（CHECK 不可 ALTER——v2 落地的 ck_krl_verb 两值扩四值
    //   search/read-abstract/read/browse）：新形 CREATE 承载七新列（feedback INTEGER NOT NULL
    //   DEFAULT 0 / feedback_note TEXT / feedback_at TEXT / turn_seq INTEGER / trigger_snap TEXT /
    //   score REAL / content_snap TEXT，后六者可空零约束——三值校验/feedback=0 双 NULL 保证
    //   /截断 2000 均落应用层，写入面 = feedback.ts 单入口）+ 业务行全量搬移（含 id 保序——
    //   entry_id/热度归属零漂移）+ 三索引 idx_krl_* 复建；
    // · feedback 不入 CHECK 的耦合警示：若加 CHECK（IN (0,1,-1)），降级语句重建旧形表时
    //   搬移非三值行会被拒——CHECK 会使 downgrade 复杂化，故约束面恒留应用层；
    // · downgradeGuard 拒降门：feedback <> 0 OR turn_seq IS NOT NULL 行在场即 fail-loud
    //   （trigger_snap 不入门——纯展示快照，降级丢失零账本完整性影响；turn_seq 新写入恒
    //   非 NULL ⇒ 实质永拒降为账本完整性优先的设计行为，legacy/派生失败 NULL 行除外）。
    // · downgrade = 恢复 v6 形态：registry.scope 撤（DROP COLUMN——sqlite ≥3.35）+
    //   recall_logs 回 v2 列集两值 CHECK（业务行全量搬回 + id 保序 + 索引复建）。
    version: 7,
    statements: [
      `ALTER TABLE knowledge_registry ADD COLUMN scope TEXT NOT NULL DEFAULT 'project'`,
      `CREATE TABLE knowledge_recall_logs_new (
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
    feedback       INTEGER NOT NULL DEFAULT 0,
    feedback_note  TEXT,
    feedback_at    TEXT,
    turn_seq       INTEGER,
    trigger_snap   TEXT,
    score          REAL,
    content_snap   TEXT,
    CONSTRAINT ck_krl_verb CHECK (verb IN ('search', 'read-abstract', 'read', 'browse'))
)`,
      `INSERT INTO knowledge_recall_logs_new (
    id, project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap, domain_snap,
    query_json, hit_count, duration_ms, created_at
  ) SELECT
    id, project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap, domain_snap,
    query_json, hit_count, duration_ms, created_at
  FROM knowledge_recall_logs`,
      `DROP TABLE knowledge_recall_logs`,
      `ALTER TABLE knowledge_recall_logs_new RENAME TO knowledge_recall_logs`,
      `CREATE INDEX idx_krl_project_session ON knowledge_recall_logs(project_id, session_id, created_at)`,
      `CREATE INDEX idx_krl_call ON knowledge_recall_logs(call_id)`,
      `CREATE INDEX idx_krl_entry ON knowledge_recall_logs(entry_id, frontmatter_id)`,
    ],
    downgradeStatements: [
      `ALTER TABLE knowledge_registry DROP COLUMN scope`,
      `CREATE TABLE knowledge_recall_logs_new (
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
      `INSERT INTO knowledge_recall_logs_new (
    id, project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap, domain_snap,
    query_json, hit_count, duration_ms, created_at
  ) SELECT
    id, project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap, domain_snap,
    query_json, hit_count, duration_ms, created_at
  FROM knowledge_recall_logs`,
      `DROP TABLE knowledge_recall_logs`,
      `ALTER TABLE knowledge_recall_logs_new RENAME TO knowledge_recall_logs`,
      `CREATE INDEX idx_krl_project_session ON knowledge_recall_logs(project_id, session_id, created_at)`,
      `CREATE INDEX idx_krl_call ON knowledge_recall_logs(call_id)`,
      `CREATE INDEX idx_krl_entry ON knowledge_recall_logs(entry_id, frontmatter_id)`,
    ],
    downgradeGuard: (db) => {
      const row = db
        .prepare<unknown[], { n: number }>(
          `SELECT COUNT(*) AS n FROM knowledge_recall_logs WHERE feedback <> 0 OR turn_seq IS NOT NULL`,
        )
        .get()
      if (row !== undefined && row.n > 0) {
        throw new Error(
          `版本 7 拒降：recall_logs 反馈/轮次归因账本行在场（feedback <> 0 OR turn_seq IS NOT NULL 共 ${row.n} 行）——账本完整性优先，降级会丢弃该列族`,
        )
      }
    },
  },
]

/**
 * 降级（独立事务可 downgrade）：从库内当前版本逐版回退至 targetVersion——每版
 * downgradeStatements 单事务原子应用并删该版 schema_meta 行。降级路径数据保全口径：
 * 注册行（projects/knowledge_registry）行集不动，缓存表恢复空表（rebuild 再生）。
 * targetVersion 超出当前库版本或本代码版本线 = 裸错（调用方 fail-loud）。
 */
export function downgradeKnowledgeSchema(db: Database.Database, targetVersion: number): number {
  const current = db.prepare<unknown[], { v: number | null }>(`SELECT MAX(version) AS v FROM schema_meta`).get()
  const from = current?.v ?? 0
  if (targetVersion >= from) {
    throw new Error(`降级目标 ${targetVersion} 不低于库内版本 ${from}——非降级路径`)
  }
  const steps = [...STORAGE_MIGRATIONS]
    .filter((m) => m.version > targetVersion && m.version <= from)
    .sort((a, b) => b.version - a.version)
  for (const migration of steps) {
    const stmts = migration.downgradeStatements
    if (stmts === undefined) {
      throw new Error(`版本 ${migration.version} 无降级语句集——不可降级`)
    }
    if (migration.downgradeGuard !== undefined) {
      migration.downgradeGuard(db) // 拒降门先于语句集：fail-loud 即整段中止（schema_meta 零半步）
    }
    db.transaction(() => {
      for (const stmt of stmts) db.prepare(stmt).run()
      db.prepare(`DELETE FROM schema_meta WHERE version = ?`).run(migration.version)
    })()
  }
  return targetVersion
}
