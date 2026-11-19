// spec.db v2（plugin-spec-roadmaps 1.3）——entities.md（v2 正本）§1–§7 单源直落：
// ①spec_roadmaps ②spec_milestones ③spec_specs 重建（六态 CHECK + milestone_id，搬行+守恒校验）
// ④idx_spec_specs_milestone（partial）⑤spec_transitions 重建为四级统一台账（v1 行迁入 entity_kind='spec'）
// ⑥ALTER spec_goals ADD goal_status（五态 DEFAULT 'pending'）⑦spec_reviews（统一复核表）。
// 重建步纪律（entities.md §6）：单事务内「新表 → 搬行 → 行数守恒校验 → DROP 旧 → 换名 → 索引/触发器重建」，
// 任一步失败整体回滚零半态（lib/db applyMigration 单事务 + defer_foreign_keys 承担 FK 暂态悬空）。
// 守恒校验门实现 = 守护行（CASE 计数不等即落 CHECK 越界值 → 语句级 ABORT → 整体回滚），
// 校验通过即删守护行——校验与搬行同事务，零残留。
// FK 重建配方（repo 正本：packages/core migrations.lineage.test.ts「表重建数据迁移配方」）——
// defer_foreign_keys 只把校验延迟到 COMMIT、不豁免暂态违例计数：spec_goals/acs/docs/transitions
// 四子表均 REFERENCES spec_specs(id)，故先撤入零 FK 暂存表、随父表一并 DROP、按 v1 原形复建后回搬；
// spec_transitions 旧表先经暂存表再落统一台账新形（entities.md §6 ⑤ 的搬行源 = 暂存表）。
// 值域映射（用户裁决 2026-11-18）：spec_specs 搬行 spec_status 逐行 CASE 映射
// draft→draft / under-review→awaiting_approval / accepted→approved / archived→completed
// （completed 为 human-only 终态不机械授予，accepted 保守落 approved）——v1 存量非 draft 行
// 映射后全部通过六态 CHECK；台账 from_status/to_status 零 CHECK 直落旧值（历史留痕不改写）。
import type { Migration } from "@dsh-forge/lib-db";

/** v2 迁移（version 2——SPEC_DB_SCHEMA_VERSION = 2 见 version-1 版本上限）。 */
export const SPEC_MIGRATIONS_V2: readonly Migration[] = [
  {
    version: 2,
    statements: [
      // ── ① spec_roadmaps（9 列，容器表——内置 ac_json + roadmap_status 四态）──
      `CREATE TABLE spec_roadmaps (
    id           TEXT PRIMARY KEY,                    -- 纯 UUID
    project_key  TEXT NOT NULL,                       -- 行级归属键（容器表唯一落点）
    slug         TEXT NOT NULL,                       -- 对外逻辑键（queryRoadmap 定位主径）
    title        TEXT NOT NULL,
    brief        TEXT,                                -- 目标简报（可空——title 一句话足够时省略）
    ac_json      TEXT NOT NULL DEFAULT '[]'
                 CONSTRAINT ck_spec_roadmaps_ac CHECK (json_valid(ac_json)),
    roadmap_status TEXT NOT NULL DEFAULT 'pending'
                 CONSTRAINT ck_spec_roadmaps_status CHECK (roadmap_status IN
                   ('pending', 'in_progress', 'awaiting_acceptance', 'completed')),
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    CONSTRAINT uq_spec_roadmaps_project_slug UNIQUE (project_key, slug)
)`,
      `CREATE INDEX idx_spec_roadmaps_listing ON spec_roadmaps(project_key, created_at)`,
      // ── ② spec_milestones（9 列——roadmap_id 承载归属 + seq 序键 + milestone_status 四态）──
      `CREATE TABLE spec_milestones (
    id          TEXT PRIMARY KEY,                     -- 纯 UUID
    roadmap_id  TEXT NOT NULL,                        -- 承载归属：必属某 roadmap（逻辑关联→spec_roadmaps.id·零 FK·服务层守卫）
    seq         INTEGER NOT NULL,                     -- 推进序（同 roadmap 下按序突击）
    title       TEXT NOT NULL,
    brief       TEXT,                                 -- 目标简报（可空——承载的 roadmap AC 分解思路/边界）
    ac_json     TEXT NOT NULL DEFAULT '[]'
                CONSTRAINT ck_spec_milestones_ac CHECK (json_valid(ac_json)),
    milestone_status TEXT NOT NULL DEFAULT 'pending'
                CONSTRAINT ck_spec_milestones_status CHECK (milestone_status IN
                  ('pending', 'in_progress', 'awaiting_acceptance', 'completed')),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    CONSTRAINT uq_spec_milestones_order UNIQUE (roadmap_id, seq)
)`,
      // ── ③⑤ 前置：spec_specs 四子表行撤入零 FK 暂存表（FK 重建配方——见文件头注）──
      `CREATE TABLE spec_goals_v1_tmp (
    id          TEXT PRIMARY KEY,
    spec_id     TEXT NOT NULL,
    sort_key    INTEGER NOT NULL,
    title       TEXT NOT NULL,
    brief       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
)`,
      `INSERT INTO spec_goals_v1_tmp (id, spec_id, sort_key, title, brief, created_at, updated_at)
SELECT id, spec_id, sort_key, title, brief, created_at, updated_at FROM spec_goals`,
      `CREATE TABLE spec_acs_v1_tmp (
    id          TEXT PRIMARY KEY,
    goal_id     TEXT NOT NULL,
    sort_key    INTEGER NOT NULL,
    criterion   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
)`,
      `INSERT INTO spec_acs_v1_tmp (id, goal_id, sort_key, criterion, created_at, updated_at)
SELECT id, goal_id, sort_key, criterion, created_at, updated_at FROM spec_acs`,
      `CREATE TABLE spec_docs_v1_tmp (
    spec_id     TEXT PRIMARY KEY,
    rel_path    TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
)`,
      `INSERT INTO spec_docs_v1_tmp (spec_id, rel_path, created_at, updated_at)
SELECT spec_id, rel_path, created_at, updated_at FROM spec_docs`,
      `CREATE TABLE spec_transitions_v1_tmp (
    id          TEXT PRIMARY KEY,
    spec_id     TEXT NOT NULL,
    from_status TEXT NOT NULL,
    to_status   TEXT NOT NULL,
    note        TEXT,
    actor       TEXT NOT NULL,
    created_at  TEXT NOT NULL
)`,
      `INSERT INTO spec_transitions_v1_tmp (id, spec_id, from_status, to_status, note, actor, created_at)
SELECT id, spec_id, from_status, to_status, note, actor, created_at FROM spec_transitions`,
      // ── ③ spec_specs 重建（v1 全列 + milestone_id + spec_status 六态 CHECK）──
      `CREATE TABLE spec_specs_new (
    id           TEXT PRIMARY KEY,                    -- 纯 UUID（写入点 createSpec 生成；业务唯一由 uq_spec_specs_project_slug 承担）
    slug         TEXT NOT NULL,                       -- Spec 文档目录键（.forge/specs/{slug}/）与对外逻辑键
    title        TEXT NOT NULL,
    spec_status   TEXT NOT NULL DEFAULT 'draft'
                  CONSTRAINT ck_spec_specs_status CHECK (spec_status IN
                    ('draft', 'awaiting_approval', 'approved', 'in_progress',
                     'awaiting_acceptance', 'completed')),
    tiers_json   TEXT NOT NULL DEFAULT '[]'
                 CONSTRAINT ck_spec_specs_tiers CHECK (json_valid(tiers_json)),
    project_key  TEXT NOT NULL,                       -- 行级归属键（cwd 纯函数派生，无 default）
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    milestone_id  TEXT,                                -- 可空 = 未挂链缺席态（逻辑关联→spec_milestones.id·零 FK·服务层守卫）
    CONSTRAINT uq_spec_specs_project_slug UNIQUE (project_key, slug)
)`,
      `INSERT INTO spec_specs_new (id, slug, title, spec_status, tiers_json, project_key, created_at, updated_at, milestone_id)
SELECT id, slug, title,
  CASE spec_status
    WHEN 'under-review' THEN 'awaiting_approval'
    WHEN 'accepted'     THEN 'approved'
    WHEN 'archived'     THEN 'completed'
    ELSE spec_status
  END,
  tiers_json, project_key, created_at, updated_at, NULL
FROM spec_specs`,
      // 行数守恒校验门：计数不等 → 守护行落 CHECK 越界值 → ABORT → 整体回滚
      `INSERT INTO spec_specs_new (id, slug, title, spec_status, tiers_json, project_key, created_at, updated_at)
SELECT 'spec-migration-conservation-guard', '', '',
  CASE WHEN (SELECT COUNT(*) FROM spec_specs) = (SELECT COUNT(*) FROM spec_specs_new)
       THEN 'draft' ELSE 'guard-abort' END,
  '[]', '', '', ''`,
      `DELETE FROM spec_specs_new WHERE id = 'spec-migration-conservation-guard'`,
      // 撤旧（子表先行——零暂态违例计数）+ 换名
      `DROP TABLE spec_docs`,
      `DROP TABLE spec_acs`,
      `DROP TABLE spec_goals`,
      `DROP TABLE spec_transitions`,
      `DROP TABLE spec_specs`,
      `ALTER TABLE spec_specs_new RENAME TO spec_specs`,
      // 索引/触发器按 v1 清单在新表重建（v1 双触发器仅台账表——specs 无触发器；uq 为表级约束随建表落）
      `CREATE INDEX idx_spec_specs_listing ON spec_specs(project_key, spec_status, created_at)`,
      // ── 子表按 v1 原形复建 + 回搬 + 清暂存（goals → acs → docs 拓扑序）──
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
      `INSERT INTO spec_goals (id, spec_id, sort_key, title, brief, created_at, updated_at)
SELECT id, spec_id, sort_key, title, brief, created_at, updated_at FROM spec_goals_v1_tmp`,
      `DROP TABLE spec_goals_v1_tmp`,
      `CREATE TABLE spec_acs (
    id          TEXT PRIMARY KEY,                     -- 纯 UUID
    goal_id     TEXT NOT NULL REFERENCES spec_goals(id),
    sort_key    INTEGER NOT NULL,                     -- AC 呈现序
    criterion   TEXT NOT NULL,                        -- 判据原文（逐字精确——对齐键本体）
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
)`,
      `CREATE UNIQUE INDEX uq_spec_acs_order ON spec_acs(goal_id, sort_key)`,
      `INSERT INTO spec_acs (id, goal_id, sort_key, criterion, created_at, updated_at)
SELECT id, goal_id, sort_key, criterion, created_at, updated_at FROM spec_acs_v1_tmp`,
      `DROP TABLE spec_acs_v1_tmp`,
      `CREATE TABLE spec_docs (
    spec_id     TEXT PRIMARY KEY REFERENCES spec_specs(id),   -- 1:1：登记行以 spec_id 为自然键 PK
    rel_path    TEXT NOT NULL,                          -- 相对项目根路径（createSpec 随参显式）
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
)`,
      `INSERT INTO spec_docs (spec_id, rel_path, created_at, updated_at)
SELECT spec_id, rel_path, created_at, updated_at FROM spec_docs_v1_tmp`,
      `DROP TABLE spec_docs_v1_tmp`,
      // ── ④ idx_spec_specs_milestone（partial——NULL 未挂链行拒之索引外）──
      `CREATE INDEX idx_spec_specs_milestone ON spec_specs(milestone_id, spec_status) WHERE milestone_id IS NOT NULL`,
      // ── ⑤ spec_transitions 重建为统一台账（§4 形态：entity_kind 四值 + from/to 零 CHECK；
      //      搬行源 = v1 暂存表，entity_kind='spec'——entities.md §3 迁入形态）──
      `CREATE TABLE spec_transitions_new (
    id           TEXT PRIMARY KEY,                    -- 纯 UUID
    entity_kind  TEXT NOT NULL
                 CONSTRAINT ck_spec_trans_kind CHECK (entity_kind IN
                   ('spec', 'goal', 'milestone', 'roadmap')),
    entity_id    TEXT NOT NULL,                       -- 逻辑关联→各实体表 id（零 FK·服务层守卫）
    from_status  TEXT NOT NULL,                       -- 流转源态（值域 per-kind 应用层校验——DDL 零枚举）
    to_status    TEXT NOT NULL,                       -- 流转目标态（值域校验同上）
    note         TEXT,                                -- 驳回/退回理由留痕（驳回/退回行服务层强制非空）
    actor        TEXT NOT NULL
                 CONSTRAINT ck_spec_trans_actor CHECK (actor IN ('plugin-tool', 'ui')),
    created_at   TEXT NOT NULL
)`,
      `INSERT INTO spec_transitions_new (id, entity_kind, entity_id, from_status, to_status, note, actor, created_at)
SELECT id, 'spec', spec_id, from_status, to_status, note, actor, created_at
FROM spec_transitions_v1_tmp`,
      // 行数守恒校验门（同 ③ 形态）
      `INSERT INTO spec_transitions_new (id, entity_kind, entity_id, from_status, to_status, actor, created_at)
SELECT 'spec-migration-conservation-guard',
  CASE WHEN (SELECT COUNT(*) FROM spec_transitions_v1_tmp) = (SELECT COUNT(*) FROM spec_transitions_new)
       THEN 'spec' ELSE 'guard-abort' END,
  '', 'draft', 'draft', 'plugin-tool', ''`,
      `DELETE FROM spec_transitions_new WHERE id = 'spec-migration-conservation-guard'`,
      `DROP TABLE spec_transitions_v1_tmp`,
      `ALTER TABLE spec_transitions_new RENAME TO spec_transitions`,
      `CREATE INDEX idx_spec_trans_entity ON spec_transitions(entity_kind, entity_id, created_at)`,
      `CREATE TRIGGER trg_spec_trans_no_update BEFORE UPDATE ON spec_transitions
BEGIN SELECT RAISE(ABORT, 'spec_transitions: append-only violation (update)'); END`,
      `CREATE TRIGGER trg_spec_trans_no_delete BEFORE DELETE ON spec_transitions
BEGIN SELECT RAISE(ABORT, 'spec_transitions: append-only violation (delete)'); END`,
      // ── ⑥ spec_goals 状态列（五态 DEFAULT 'pending'——存量行 = 未开始处理缺席态即时生效）──
      `ALTER TABLE spec_goals ADD COLUMN goal_status  TEXT NOT NULL DEFAULT 'pending'
               CONSTRAINT ck_spec_goals_status CHECK (goal_status IN
                 ('pending', 'in_progress', 'auto_reviewing', 'awaiting_confirmation', 'completed'))`,
      // ── ⑦ spec_reviews（8 列，四级统一复核表，append-only）──
      `CREATE TABLE spec_reviews (
    id           TEXT PRIMARY KEY,                    -- 纯 UUID
    entity_kind  TEXT NOT NULL
                 CONSTRAINT ck_spec_reviews_kind CHECK (entity_kind IN
                   ('spec', 'goal', 'milestone', 'roadmap')),
    entity_id    TEXT NOT NULL,                       -- 逻辑关联→各实体表 id（零 FK·服务层守卫）
    verdict      TEXT NOT NULL
                 CONSTRAINT ck_spec_reviews_verdict CHECK (verdict IN ('passed', 'failed')),
    content      TEXT NOT NULL,                       -- 报告正文（逐条对照输出 / 验收对照摘要）
    gap_note     TEXT,                                -- 缺口注记（failed 服务层强制非空——退回定位）
    actor        TEXT NOT NULL
                 CONSTRAINT ck_spec_reviews_actor CHECK (actor IN ('plugin-tool', 'ui')),
    created_at   TEXT NOT NULL
)`,
      `CREATE INDEX idx_spec_reviews_entity ON spec_reviews(entity_kind, entity_id, created_at)`,
      `CREATE TRIGGER trg_spec_reviews_no_update BEFORE UPDATE ON spec_reviews
BEGIN SELECT RAISE(ABORT, 'spec_reviews: append-only violation (update)'); END`,
      `CREATE TRIGGER trg_spec_reviews_no_delete BEFORE DELETE ON spec_reviews
BEGIN SELECT RAISE(ABORT, 'spec_reviews: append-only violation (delete)'); END`,
    ],
  },
];
