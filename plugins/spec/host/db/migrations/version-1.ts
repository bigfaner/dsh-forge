// spec.db 新线 v1（plugin-spec 1.3）——entities.md DDL 单源直落：
// 五域表（spec_specs / spec_goals / spec_acs / spec_docs / spec_transitions）+ schema_meta
// 机制表；显式索引/唯一对象 4（idx_spec_specs_listing / uq_spec_goals_order /
// uq_spec_acs_order / idx_spec_transitions_spec）+ 表级 UNIQUE uq_spec_specs_project_slug；
// append-only 双触发器仅 spec_transitions。
// 命名纪律（entities.md 文首）：约束/索引/触发器全名 `spec_` 前缀；行级归属键 project_key
// 只在 spec_specs 前导列，四附属表经 FK 传导撤列；零 AUTOINCREMENT——代理键纯 UUID；
// 列名避让 SQL 保留词裸名（spec_status / from_status / to_status）。
// Hard Rule——本序列经 openDatabase 参数化传入（lib/db openDatabase options），
// 禁硬编码 import 中央序列；PRAGMA（WAL / foreign_keys / busy_timeout）在打开时设置，
// 不入迁移语句。schema_meta 为 lib/db 机制基建表（版本线锚），随 v1 顺带创建。
import type { Migration } from "@dsh-forge/lib-db";

/** spec.db schema 版本上限（独立版本线；version 1 起新线）。 */
export const SPEC_DB_SCHEMA_VERSION = 1;

/** 表名常量（唯一模板面——connection/repositories 共此单源；恒 spec_ 前缀）。 */
export interface SpecDbTables {
  specs: string;
  goals: string;
  acs: string;
  docs: string;
  transitions: string;
}

export function specTableNames(): SpecDbTables {
  return {
    specs: "spec_specs",
    goals: "spec_goals",
    acs: "spec_acs",
    docs: "spec_docs",
    transitions: "spec_transitions",
  };
}

/**
 * v1 DDL（entities.md §1–§6 逐字直落——表/列/约束/索引/触发器全名与 entities 单源对读，
 * lineage 测试锚定；语句顺序 = 先表后其索引/触发器，依赖序 specs → goals → acs）。
 */
export const SPEC_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      // lib/db 机制基建表（版本线锚域，entities.md §6①）。
      `CREATE TABLE schema_meta (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL
)`,
      // ── §1 spec_specs（8 列，主体表——归属键唯一落点）──
      `CREATE TABLE spec_specs (
    id           TEXT PRIMARY KEY,                    -- 纯 UUID（写入点 createSpec 生成；业务唯一由 uq_spec_specs_project_slug 承担）
    slug         TEXT NOT NULL,                       -- Spec 文档目录键（.forge/specs/{slug}/）与对外逻辑键
    title        TEXT NOT NULL,
    spec_status   TEXT NOT NULL DEFAULT 'draft'
                  CONSTRAINT ck_spec_specs_status CHECK (spec_status IN
                    ('draft', 'under-review', 'accepted', 'archived')),
    tiers_json   TEXT NOT NULL DEFAULT '[]'
                  CONSTRAINT ck_spec_specs_tiers CHECK (json_valid(tiers_json)),
    project_key  TEXT NOT NULL,                       -- 行级归属键（cwd 纯函数派生，无 default）
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    CONSTRAINT uq_spec_specs_project_slug UNIQUE (project_key, slug)
)`,
      `CREATE INDEX idx_spec_specs_listing ON spec_specs(project_key, spec_status, created_at)`,
      // ── §2 spec_goals（7 列，附属形态；归属经 spec_id FK 传导）──
      `CREATE TABLE spec_goals (
    id          TEXT PRIMARY KEY,                     -- 纯 UUID
    spec_id     TEXT NOT NULL REFERENCES spec_specs(id),
    sort_key    INTEGER NOT NULL,                     -- Goal 呈现序（goal 间无依赖拓扑，纯排序）
    title       TEXT NOT NULL,
    brief       TEXT,                                 -- Goal 简报（拆解上下文承载，可空）
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
)`,
      `CREATE UNIQUE INDEX uq_spec_goals_order ON spec_goals(spec_id, sort_key)`,
      // ── §3 spec_acs（6 列，附属形态；归属经 spec_id→goal_id 两级 FK 传导）──
      `CREATE TABLE spec_acs (
    id          TEXT PRIMARY KEY,                     -- 纯 UUID
    goal_id     TEXT NOT NULL REFERENCES spec_goals(id),
    sort_key    INTEGER NOT NULL,                     -- AC 呈现序
    criterion   TEXT NOT NULL,                        -- 判据原文（逐字精确——对齐键本体）
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
)`,
      `CREATE UNIQUE INDEX uq_spec_acs_order ON spec_acs(goal_id, sort_key)`,
      // ── §4 spec_docs（4 列，1:1 附属形态；spec_id 自然键 PK 零代理 id）──
      `CREATE TABLE spec_docs (
    spec_id     TEXT PRIMARY KEY REFERENCES spec_specs(id),   -- 1:1：登记行以 spec_id 为自然键 PK
    rel_path    TEXT NOT NULL,                          -- 相对项目根路径（createSpec 随参显式）
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
)`,
      // ── §5 spec_transitions（7 列，append-only 流转台账）──
      `CREATE TABLE spec_transitions (
    id          TEXT PRIMARY KEY,                     -- 纯 UUID
    spec_id     TEXT NOT NULL REFERENCES spec_specs(id),
    from_status TEXT NOT NULL
                CONSTRAINT ck_spec_trans_from CHECK (from_status IN
                  ('draft', 'under-review', 'accepted', 'archived')),
    to_status   TEXT NOT NULL
                CONSTRAINT ck_spec_trans_to CHECK (to_status IN
                  ('draft', 'under-review', 'accepted', 'archived')),
    note        TEXT,                                 -- 驳回理由留痕（驳回行服务层强制非空）
    actor       TEXT NOT NULL
                CONSTRAINT ck_spec_trans_actor CHECK (actor IN ('plugin-tool', 'ui')),
    created_at  TEXT NOT NULL
)`,
      `CREATE INDEX idx_spec_transitions_spec ON spec_transitions(spec_id, created_at)`,
      `CREATE TRIGGER trg_spec_transitions_no_update BEFORE UPDATE ON spec_transitions
BEGIN SELECT RAISE(ABORT, 'spec_transitions: append-only violation (update)'); END`,
      `CREATE TRIGGER trg_spec_transitions_no_delete BEFORE DELETE ON spec_transitions
BEGIN SELECT RAISE(ABORT, 'spec_transitions: append-only violation (delete)'); END`,
    ],
  },
];
