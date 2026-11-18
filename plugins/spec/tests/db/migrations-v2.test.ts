// spec.db migrations v2 测试（plugin-spec-roadmaps 1.3，TDD 域逻辑先行）——
// entities.md §1–§7 对读：四新表逐列/CHECK 值域/统一台账迁入/v1 数据行零损/迁移原子性（中断零半态）。
// v1 库模拟 = lib/db openDatabase 仅挂 v1 序列（SPEC_MIGRATIONS，版本门 1）→ 插存量行 →
// 换 openSpecDb（完整 v1+v2 链）重开触发 v2 迁移——与真实升级路径同径。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@dsh-forge/lib-db";
import { SPEC_DB_SCHEMA_VERSION, SPEC_MIGRATIONS, openSpecDb, specDbFileName } from "../../host/db/connection.js";
import { SPEC_MIGRATIONS_V2 } from "../../host/db/migrations/version-2.js";

const NOW = "2026-01-01T00:00:00.000Z";
const homes: string[] = [];

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

/** 建一个停在 v1 版本线的文件库（真实升级路径前置态）。 */
function v1Db(): { home: string } {
  const home = mkdtempSync(join(tmpdir(), "spec-db-v2-"));
  homes.push(home);
  const db = openDatabase(specDbFileName(home), {
    migrations: SPEC_MIGRATIONS,
    schemaVersion: 1,
    domain: "spec",
  });
  db.close();
  return { home };
}

describe("lineage（v2 重建线）", () => {
  it("v2 = 单迁移、版本 2；版本上限 = 2", () => {
    expect(SPEC_MIGRATIONS_V2).toHaveLength(1);
    expect(SPEC_MIGRATIONS_V2[0]!.version).toBe(2);
    expect(SPEC_DB_SCHEMA_VERSION).toBe(2);
  });

  it("全新库：schema_meta spec 域直落 version 2；八域表全在场", () => {
    const home = mkdtempSync(join(tmpdir(), "spec-db-v2-fresh-"));
    homes.push(home);
    const domain = openSpecDb(home);
    try {
      const versions = (
        domain.db.prepare(`SELECT version FROM schema_meta WHERE domain = 'spec' ORDER BY version`).all() as Array<{
          version: number;
        }>
      ).map((r) => r.version);
      expect(versions).toEqual([1, 2]);
      const names = (
        domain.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as Array<{
          name: string;
        }>
      )
        .map((r) => r.name)
        .filter((n) => n.startsWith("spec_"));
      expect(names).toEqual([
        "spec_acs",
        "spec_docs",
        "spec_goals",
        "spec_milestones",
        "spec_reviews",
        "spec_roadmaps",
        "spec_specs",
        "spec_transitions",
      ]);
    } finally {
      domain.db.close();
    }
  });
});

describe("四新表 DDL 逐列一致（entities.md §1/§2/§4/§5）", () => {
  it("v2 重建后显式索引 5 + partial WHERE 子句在场", () => {
    const home = mkdtempSync(join(tmpdir(), "spec-db-v2-idx-"));
    homes.push(home);
    const domain = openSpecDb(home);
    try {
      const idx = new Map(
        (
          domain.db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`).all() as Array<{
            name: string;
            sql: string;
          }>
        ).map((r) => [r.name, r.sql]),
      );
      expect(idx.get("idx_spec_roadmaps_listing")).toContain("project_key, created_at");
      expect(idx.get("idx_spec_trans_entity")).toContain("entity_kind, entity_id, created_at");
      expect(idx.get("idx_spec_reviews_entity")).toContain("entity_kind, entity_id, created_at");
      expect(idx.get("idx_spec_specs_milestone")).toContain("milestone_id, spec_status");
      expect(idx.get("idx_spec_specs_milestone")).toContain("WHERE milestone_id IS NOT NULL");
      expect(idx.has("idx_spec_specs_listing")).toBe(true);
    } finally {
      domain.db.close();
    }
  });

  it("spec_roadmaps：9 列 + uq(project_key,slug) + ac_json json_valid + 四态 CHECK", () => {
    const home = mkdtempSync(join(tmpdir(), "spec-db-v2-rm-"));
    homes.push(home);
    const domain = openSpecDb(home);
    try {
      const cols = (domain.db.pragma("table_info('spec_roadmaps')") as Array<{ name: string }>).map((c) => c.name);
      expect(cols).toEqual([
        "id",
        "project_key",
        "slug",
        "title",
        "brief",
        "ac_json",
        "roadmap_status",
        "created_at",
        "updated_at",
      ]);
      const base = {
        id: "rm-1",
        project_key: "p",
        slug: "r",
        title: "t",
        created_at: NOW,
        updated_at: NOW,
      };
      const insert = domain.db.prepare(
        `INSERT INTO spec_roadmaps (id, project_key, slug, title, ac_json, created_at, updated_at)
         VALUES (@id, @project_key, @slug, @title, @ac_json, @created_at, @updated_at)`,
      );
      insert.run({ ...base, ac_json: "[]" });
      expect(() => insert.run({ ...base, id: "rm-2", ac_json: "[]" })).toThrowError(/UNIQUE/); // uq(project_key, slug)
      expect(() => insert.run({ ...base, id: "rm-3", slug: "r2", ac_json: "not-json" })).toThrowError();
      expect(() =>
        domain.db
          .prepare(
            `INSERT INTO spec_roadmaps (id, project_key, slug, title, ac_json, roadmap_status, created_at, updated_at)
             VALUES ('rm-4', 'p', 'r3', 't', '[]', 'archived', 'x', 'x')`,
          )
          .run(),
      ).toThrowError(/CHECK/); // 四态越界拒
    } finally {
      domain.db.close();
    }
  });

  it("spec_milestones：9 列 + uq(roadmap_id,seq) + 四态 CHECK", () => {
    const home = mkdtempSync(join(tmpdir(), "spec-db-v2-ms-"));
    homes.push(home);
    const domain = openSpecDb(home);
    try {
      const cols = (domain.db.pragma("table_info('spec_milestones')") as Array<{ name: string }>).map((c) => c.name);
      expect(cols).toEqual([
        "id",
        "roadmap_id",
        "seq",
        "title",
        "brief",
        "ac_json",
        "milestone_status",
        "created_at",
        "updated_at",
      ]);
      const insert = domain.db.prepare(
        `INSERT INTO spec_milestones (id, roadmap_id, seq, title, ac_json, created_at, updated_at)
         VALUES (?, 'rm-1', ?, 't', '[]', 'x', 'x')`,
      );
      insert.run("ms-1", 1);
      expect(() => insert.run("ms-2", 1)).toThrowError(/UNIQUE/); // uq(roadmap_id, seq)
      expect(() =>
        domain.db
          .prepare(
            `INSERT INTO spec_milestones (id, roadmap_id, seq, title, ac_json, milestone_status, created_at, updated_at)
             VALUES ('ms-3', 'rm-1', 2, 't', '[]', 'accepted', 'x', 'x')`,
          )
          .run(),
      ).toThrowError(/CHECK/);
    } finally {
      domain.db.close();
    }
  });

  it("spec_transitions 统一台账：8 列、entity_kind 四值 CHECK、from/to 零枚举、append-only 双触发器", () => {
    const home = mkdtempSync(join(tmpdir(), "spec-db-v2-tr-"));
    homes.push(home);
    const domain = openSpecDb(home);
    try {
      const cols = (domain.db.pragma("table_info('spec_transitions')") as Array<{ name: string }>).map((c) => c.name);
      expect(cols).toEqual([
        "id",
        "entity_kind",
        "entity_id",
        "from_status",
        "to_status",
        "note",
        "actor",
        "created_at",
      ]);
      const insert = domain.db.prepare(
        `INSERT INTO spec_transitions (id, entity_kind, entity_id, from_status, to_status, actor, created_at)
         VALUES (?, ?, ?, ?, ?, 'plugin-tool', 'x')`,
      );
      insert.run("tr-1", "roadmap", "rm-1", "任何自由值-from", "任何自由值-to"); // from/to 零 CHECK
      expect(() => insert.run("tr-2", "epic", "e-1", "a", "b")).toThrowError(/CHECK/); // kind 四值越界
      expect(() =>
        domain.db.prepare(`UPDATE spec_transitions SET note = 'x' WHERE id = 'tr-1'`).run(),
      ).toThrowError(/append-only/);
      expect(() => domain.db.prepare(`DELETE FROM spec_transitions WHERE id = 'tr-1'`).run()).toThrowError(
        /append-only/,
      );
    } finally {
      domain.db.close();
    }
  });

  it("spec_reviews：8 列 + verdict 二值 + append-only 双触发器", () => {
    const home = mkdtempSync(join(tmpdir(), "spec-db-v2-rv-"));
    homes.push(home);
    const domain = openSpecDb(home);
    try {
      const cols = (domain.db.pragma("table_info('spec_reviews')") as Array<{ name: string }>).map((c) => c.name);
      expect(cols).toEqual(["id", "entity_kind", "entity_id", "verdict", "content", "gap_note", "actor", "created_at"]);
      const insert = domain.db.prepare(
        `INSERT INTO spec_reviews (id, entity_kind, entity_id, verdict, content, actor, created_at)
         VALUES (?, 'goal', 'g-1', ?, 'c', 'plugin-tool', 'x')`,
      );
      insert.run("rv-1", "passed");
      expect(() => insert.run("rv-2", "pending")).toThrowError(/CHECK/);
      expect(() =>
        domain.db.prepare(`UPDATE spec_reviews SET content = 'x' WHERE id = 'rv-1'`).run(),
      ).toThrowError(/append-only/);
      expect(() => domain.db.prepare(`DELETE FROM spec_reviews WHERE id = 'rv-1'`).run()).toThrowError(/append-only/);
    } finally {
      domain.db.close();
    }
  });

  it("spec_specs 重建：六态 CHECK + milestone_id 列；spec_goals.goal_status 五态 DEFAULT 'pending'", () => {
    const home = mkdtempSync(join(tmpdir(), "spec-db-v2-sp-"));
    homes.push(home);
    const domain = openSpecDb(home);
    try {
      const specCols = (domain.db.pragma("table_info('spec_specs')") as Array<{ name: string }>).map((c) => c.name);
      expect(specCols).toEqual([
        "id",
        "slug",
        "title",
        "spec_status",
        "tiers_json",
        "project_key",
        "created_at",
        "updated_at",
        "milestone_id",
      ]);
      domain.db
        .prepare(
          `INSERT INTO spec_specs (id, slug, title, spec_status, tiers_json, project_key, milestone_id, created_at, updated_at)
           VALUES ('sp-1', 's', 't', 'awaiting_acceptance', '[]', 'p', 'ms-1', 'x', 'x')`,
        )
        .run(); // 六态新值放行
      expect(() =>
        domain.db
          .prepare(`UPDATE spec_specs SET spec_status = 'accepted' WHERE id = 'sp-1'`)
          .run(),
      ).toThrowError(/CHECK/); // v1 旧值拒
      domain.db
        .prepare(
          `INSERT INTO spec_goals (id, spec_id, sort_key, title, created_at, updated_at)
           VALUES ('g-1', 'sp-1', 1, 'g', 'x', 'x')`,
        )
        .run();
      expect(domain.db.prepare(`SELECT goal_status FROM spec_goals WHERE id = 'g-1'`).get()).toEqual({
        goal_status: "pending",
      }); // DEFAULT 'pending' 即时生效
      expect(() =>
        domain.db
          .prepare(`UPDATE spec_goals SET goal_status = 'unknown' WHERE id = 'g-1'`)
          .run(),
      ).toThrowError(/CHECK/);
    } finally {
      domain.db.close();
    }
  });
});

describe("v1 数据行零损（搬行 SELECT 全列 + 守恒）", () => {
  it("存量 specs/goals/acs/docs/transitions 行全量保真：字段逐列一致、台账迁入 entity_kind='spec'", () => {
    const { home } = v1Db();
    const seed = openDatabase(specDbFileName(home), {
      migrations: SPEC_MIGRATIONS,
      schemaVersion: 1,
      domain: "spec",
    });
    seed
      .prepare(
        `INSERT INTO spec_specs (id, slug, title, spec_status, tiers_json, project_key, created_at, updated_at)
         VALUES ('sp-1', 'demo', '标题', 'draft', '[1,2]', 'Z-p@a', 'c1', 'u1'),
                ('sp-2', 'demo2', '标题2', 'draft', '[]', 'Z-p@a', 'c2', 'u2')`,
      )
      .run();
    seed
      .prepare(
        `INSERT INTO spec_goals (id, spec_id, sort_key, title, brief, created_at, updated_at)
         VALUES ('g-1', 'sp-1', 1, 'g', 'b', 'c1', 'u1')`,
      )
      .run();
    seed
      .prepare(
        `INSERT INTO spec_acs (id, goal_id, sort_key, criterion, created_at, updated_at)
         VALUES ('a-1', 'g-1', 1, '判据', 'c1', 'u1')`,
      )
      .run();
    seed
      .prepare(
        `INSERT INTO spec_docs (spec_id, rel_path, created_at, updated_at)
         VALUES ('sp-1', '.forge/specs/demo/SPEC.md', 'c1', 'u1')`,
      )
      .run();
    seed
      .prepare(
        `INSERT INTO spec_transitions (id, spec_id, from_status, to_status, note, actor, created_at)
         VALUES ('tr-1', 'sp-1', 'draft', 'under-review', '提交评审', 'ui', 'c1')`,
      )
      .run();
    seed.close();

    const domain = openSpecDb(home);
    try {
      // specs 行零损（全列逐字段一致 + milestone_id 缺席态 NULL）
      expect(
        domain.db
          .prepare(
            `SELECT id, slug, title, spec_status, tiers_json, project_key, created_at, updated_at, milestone_id
             FROM spec_specs ORDER BY id`,
          )
          .all(),
      ).toEqual([
        {
          id: "sp-1",
          slug: "demo",
          title: "标题",
          spec_status: "draft",
          tiers_json: "[1,2]",
          project_key: "Z-p@a",
          created_at: "c1",
          updated_at: "u1",
          milestone_id: null,
        },
        {
          id: "sp-2",
          slug: "demo2",
          title: "标题2",
          spec_status: "draft",
          tiers_json: "[]",
          project_key: "Z-p@a",
          created_at: "c2",
          updated_at: "u2",
          milestone_id: null,
        },
      ]);
      // 附属表零触碰
      expect(domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_goals`).get()).toEqual({ n: 1 });
      expect(domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_acs`).get()).toEqual({ n: 1 });
      expect(domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_docs`).get()).toEqual({ n: 1 });
      // 台账迁入：entity_kind='spec'、entity_id=旧 spec_id、其余字段逐列一致；goal_status 缺席态
      expect(domain.db.prepare(`SELECT * FROM spec_transitions`).all()).toEqual([
        {
          id: "tr-1",
          entity_kind: "spec",
          entity_id: "sp-1",
          from_status: "draft",
          to_status: "under-review",
          note: "提交评审",
          actor: "ui",
          created_at: "c1",
        },
      ]);
      expect(domain.db.prepare(`SELECT goal_status FROM spec_goals WHERE id = 'g-1'`).get()).toEqual({
        goal_status: "pending",
      });
      // 重建零残留：_new 半态表不存在
      const residue = domain.db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_new'`)
        .all();
      expect(residue).toEqual([]);
    } finally {
      domain.db.close();
    }
  });
});

describe("迁移原子性（中断零半态）", () => {
  it("v2 迁移中途失败 → 整体回滚：版本线停 1、v1 行零损、v2 表零残留", () => {
    const { home } = v1Db();
    const seed = openDatabase(specDbFileName(home), {
      migrations: SPEC_MIGRATIONS,
      schemaVersion: 1,
      domain: "spec",
    });
    seed
      .prepare(
        `INSERT INTO spec_specs (id, slug, title, spec_status, tiers_json, project_key, created_at, updated_at)
         VALUES ('sp-1', 'demo', '标题', 'draft', '[]', 'Z-p@a', 'c1', 'u1'),
                ('sp-2', 'demo2', '标题2', 'under-review', '[]', 'Z-p@a', 'c2', 'u2')`,
      )
      .run();
    seed
      .prepare(
        `INSERT INTO spec_transitions (id, spec_id, from_status, to_status, actor, created_at)
         VALUES ('tr-1', 'sp-1', 'draft', 'under-review', 'ui', 'c1')`,
      )
      .run();
    seed.close();

    // 破损 v2 = 正本语句全量 + 尾部注入必败语句（模拟迁移中断）——lib/db 单事务包裹，
    // 任一语句失败整体回滚（defer_foreign_keys + transaction 由机制层承担）。
    const broken = {
      version: 2,
      statements: [...SPEC_MIGRATIONS_V2[0]!.statements, `SELECT * FROM no_such_table_xyz`],
    };
    expect(() =>
      openDatabase(specDbFileName(home), {
        migrations: [...SPEC_MIGRATIONS, broken],
        schemaVersion: 2,
        domain: "spec",
      }),
    ).toThrowError();

    // 回滚后重开（v1 链可开 = 版本线未抬升）：行零损 + 无 v2 半态表
    const back = openDatabase(specDbFileName(home), {
      migrations: SPEC_MIGRATIONS,
      schemaVersion: 1,
      domain: "spec",
    });
    try {
      expect(back.prepare(`SELECT COUNT(*) AS n FROM spec_specs`).get()).toEqual({ n: 2 });
      expect(back.prepare(`SELECT COUNT(*) AS n FROM spec_transitions`).get()).toEqual({ n: 1 });
      expect(
        back.prepare(`SELECT spec_status FROM spec_specs WHERE id = 'sp-2'`).get(),
      ).toEqual({ spec_status: "under-review" }); // v1 形态原样（值域映射未落半态）
      const v2Tables = back
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'spec_%'`)
        .all()
        .map((r) => (r as { name: string }).name)
        .filter((n) => ["spec_roadmaps", "spec_milestones", "spec_reviews", "spec_specs_new", "spec_transitions_new"].includes(n));
      expect(v2Tables).toEqual([]);
    } finally {
      back.close();
    }
  });
});

describe("v1 四态行搬行值域映射（draft→draft / under-review→awaiting_approval / accepted→approved / archived→completed）", () => {
  it("v1 存量非 draft 行搬行后全部通过 v2 六态 CHECK：逐行映射落位 + 行数守恒（4/4）", () => {
    const { home } = v1Db();
    const seed = openDatabase(specDbFileName(home), {
      migrations: SPEC_MIGRATIONS,
      schemaVersion: 1,
      domain: "spec",
    });
    seed
      .prepare(
        `INSERT INTO spec_specs (id, slug, title, spec_status, tiers_json, project_key, created_at, updated_at)
         VALUES ('sp-1', 'd', '草稿', 'draft', '[]', 'Z-p@a', 'c1', 'u1'),
                ('sp-2', 'r', '送审', 'under-review', '[]', 'Z-p@a', 'c2', 'u2'),
                ('sp-3', 'a', '接受', 'accepted', '[]', 'Z-p@a', 'c3', 'u3'),
                ('sp-4', 'h', '归档', 'archived', '[]', 'Z-p@a', 'c4', 'u4')`,
      )
      .run();
    seed.close();

    const domain = openSpecDb(home);
    try {
      const rows = domain.db
        .prepare(`SELECT id, spec_status FROM spec_specs ORDER BY id`)
        .all() as Array<{ id: string; spec_status: string }>;
      expect(rows).toEqual([
        { id: "sp-1", spec_status: "draft" },
        { id: "sp-2", spec_status: "awaiting_approval" },
        { id: "sp-3", spec_status: "approved" },
        { id: "sp-4", spec_status: "completed" },
      ]);
      // 行数守恒：v1 4 行 → v2 4 行，零丢行零残留
      expect(rows).toHaveLength(4);
      const residue = domain.db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_new'`)
        .all();
      expect(residue).toEqual([]);
    } finally {
      domain.db.close();
    }
  });
});
