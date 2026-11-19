// spec.db migrations v1 负样例（plugin-spec 1.3，TDD 域逻辑先行）——
// lineage + 约束负样例（数据库级不变量，非应用层）：归属键 NOT NULL 无 default /
// FK 传导 / 业务唯一 / 排序唯一 / CHECK 枚举 / append-only 双触发器。
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SPEC_DB_SCHEMA_VERSION,
  SPEC_MIGRATIONS,
  openSpecDb,
  specDbFileName,
  type SpecDomainDb,
} from "../../host/db/connection.js";

const homes: string[] = [];

function mem(): SpecDomainDb {
  return openSpecDb(".", { file: ":memory:" });
}

function fileDb(): { domain: SpecDomainDb; home: string } {
  const home = mkdtempSync(join(tmpdir(), "spec-db-mig-"));
  homes.push(home);
  return { domain: openSpecDb(home), home };
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

const NOW = "2026-01-01T00:00:00.000Z";

function insertSpec(domain: SpecDomainDb, patch: Record<string, unknown> = {}): void {
  const row = {
    id: "sp-1",
    slug: "demo",
    title: "t",
    spec_status: "draft",
    tiers_json: "[]",
    project_key: "Z-project-dsh@aaaaaaaa",
    created_at: NOW,
    updated_at: NOW,
    ...patch,
  };
  domain.db
    .prepare(
      `INSERT INTO spec_specs (id, slug, title, spec_status, tiers_json, project_key, created_at, updated_at)
       VALUES (@id, @slug, @title, @spec_status, @tiers_json, @project_key, @created_at, @updated_at)`,
    )
    .run(row);
}

function insertGoal(domain: SpecDomainDb, patch: Record<string, unknown> = {}): void {
  const row = {
    id: "g-1",
    spec_id: "sp-1",
    sort_key: 1,
    title: "g",
    brief: null,
    created_at: NOW,
    updated_at: NOW,
    ...patch,
  };
  domain.db
    .prepare(
      `INSERT INTO spec_goals (id, spec_id, sort_key, title, brief, created_at, updated_at)
       VALUES (@id, @spec_id, @sort_key, @title, @brief, @created_at, @updated_at)`,
    )
    .run(row);
}

describe("lineage（v1 新线）", () => {
  it("v1 = 首迁移、schema 版本上限 = 2（v2 重建线见 migrations-v2 测试）", () => {
    expect(SPEC_MIGRATIONS).toHaveLength(1);
    expect(SPEC_MIGRATIONS[0]!.version).toBe(1);
    expect(SPEC_DB_SCHEMA_VERSION).toBe(2);
  });

  it("全新库：schema_meta 落 version 1+2；打开幂等（重开不重迁移、数据保留）", () => {
    const { domain, home } = fileDb();
    try {
      insertSpec(domain);
      domain.db.close();
      const second = openSpecDb(home);
      expect(second.tables.specs).toBe("spec_specs");
      expect(
        (second.db.prepare(`SELECT version FROM schema_meta ORDER BY version`).all() as Array<{ version: number }>).map(
          (r) => r.version,
        ),
      ).toEqual([1, 2]);
      expect(second.db.prepare(`SELECT id FROM spec_specs`).all()).toEqual([{ id: "sp-1" }]);
      second.db.close();
    } finally {
      // fileDb branch closes inside; guard for failure before close
    }
  });

  it("落点：{home}/forge/db/spec/spec.db（开库即落盘，单装）", () => {
    const home = mkdtempSync(join(tmpdir(), "spec-db-path-"));
    homes.push(home);
    expect(specDbFileName(home)).toBe(join(home, "forge", "db", "spec", "spec.db"));
    const domain = openSpecDb(home);
    try {
      expect(existsSync(specDbFileName(home))).toBe(true);
      expect(domain.db.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(String(domain.db.pragma("journal_mode", { simple: true })).toLowerCase()).toBe("wal");
    } finally {
      domain.db.close();
    }
  });

  it("表清单：八域表 + schema_meta（机制基建），零多余域表", () => {
    const domain = mem();
    try {
      const names = (
        domain.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as Array<{ name: string }>
      )
        .map((r) => r.name)
        .filter((n) => !n.startsWith("schema_") && n !== "migration_digests" && n !== "sqlite_sequence");
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

describe("归属键纪律（NOT NULL 无 default，派生失败拒写即建表级保证）", () => {
  it("project_key 缺列拒写（无 default——缺列即 NOT NULL 拒绝）", () => {
    const domain = mem();
    try {
      expect(() =>
        domain.db
          .prepare(
            `INSERT INTO spec_specs (id, slug, title, spec_status, tiers_json, created_at, updated_at)
             VALUES ('sp-x', 's', 't', 'draft', '[]', 'x', 'x')`,
          )
          .run(),
      ).toThrowError(/NOT NULL/);
    } finally {
      domain.db.close();
    }
  });

  it("project_key 显式 NULL 拒写", () => {
    const domain = mem();
    try {
      expect(() => insertSpec(domain, { project_key: null })).toThrowError(/NOT NULL/);
    } finally {
      domain.db.close();
    }
  });

  it("业务唯一 UNIQUE(project_key, slug)：同 project 撞 slug 拒写、跨 project 同 slug 放行", () => {
    const domain = mem();
    try {
      insertSpec(domain);
      expect(() => insertSpec(domain, { id: "sp-2" })).toThrowError(/UNIQUE/);
      insertSpec(domain, { id: "sp-3", project_key: "Z-other@bbbbbbbb" });
    } finally {
      domain.db.close();
    }
  });
});

describe("FK 传导（附属表撤列归属）", () => {
  it("spec_goals.spec_id 悬空拒写；spec_acs.goal_id 悬空拒写", () => {
    const domain = mem();
    try {
      insertSpec(domain);
      expect(() => insertGoal(domain, { spec_id: "no-such" })).toThrowError(/FOREIGN KEY/);
      insertGoal(domain);
      expect(() =>
        domain.db
          .prepare(
            `INSERT INTO spec_acs (id, goal_id, sort_key, criterion, created_at, updated_at)
             VALUES ('a-1', 'no-such', 1, 'c', 'x', 'x')`,
          )
          .run(),
      ).toThrowError(/FOREIGN KEY/);
    } finally {
      domain.db.close();
    }
  });
});

describe("排序唯一 + CHECK 枚举", () => {
  it("uq_spec_goals_order：同 spec 撞 sort_key 拒写", () => {
    const domain = mem();
    try {
      insertSpec(domain);
      insertGoal(domain);
      expect(() => insertGoal(domain, { id: "g-2" })).toThrowError(/UNIQUE/);
    } finally {
      domain.db.close();
    }
  });

  it("uq_spec_acs_order：同 goal 撞 sort_key 拒写", () => {
    const domain = mem();
    try {
      insertSpec(domain);
      insertGoal(domain);
      const insertAc = domain.db.prepare(
        `INSERT INTO spec_acs (id, goal_id, sort_key, criterion, created_at, updated_at)
         VALUES (?, 'g-1', 1, 'c', 'x', 'x')`,
      );
      insertAc.run("a-1");
      expect(() => insertAc.run("a-2")).toThrowError(/UNIQUE/);
    } finally {
      domain.db.close();
    }
  });

  it("spec_status CHECK 四态越界拒写；tiers_json 非良构 JSON 拒写", () => {
    const domain = mem();
    try {
      expect(() => insertSpec(domain, { id: "sp-2", slug: "s2", spec_status: "published" })).toThrowError(/CHECK/);
      expect(() => insertSpec(domain, { id: "sp-3", slug: "s3", tiers_json: "not-json" })).toThrowError();
    } finally {
      domain.db.close();
    }
  });
});

describe("spec_transitions append-only 双触发器", () => {
  function seedTransition(domain: SpecDomainDb): void {
    insertSpec(domain);
    domain.db
      .prepare(
        `INSERT INTO spec_transitions (id, entity_kind, entity_id, from_status, to_status, note, actor, created_at)
         VALUES ('tr-1', 'spec', 'sp-1', 'draft', 'under-review', NULL, 'plugin-tool', 'x')`,
      )
      .run();
  }

  it("UPDATE 被 ABORT（append-only violation）", () => {
    const domain = mem();
    try {
      seedTransition(domain);
      expect(() =>
        domain.db.prepare(`UPDATE spec_transitions SET note = 'tampered' WHERE id = 'tr-1'`).run(),
      ).toThrowError(/append-only/);
    } finally {
      domain.db.close();
    }
  });

  it("DELETE 被 ABORT（append-only violation）", () => {
    const domain = mem();
    try {
      seedTransition(domain);
      expect(() => domain.db.prepare(`DELETE FROM spec_transitions WHERE id = 'tr-1'`).run()).toThrowError(
        /append-only/,
      );
    } finally {
      domain.db.close();
    }
  });

  it("actor CHECK：非法通道拒写（值域兜底）", () => {
    const domain = mem();
    try {
      insertSpec(domain);
      expect(() =>
        domain.db
          .prepare(
            `INSERT INTO spec_transitions (id, entity_kind, entity_id, from_status, to_status, note, actor, created_at)
             VALUES ('tr-2', 'spec', 'sp-1', 'draft', 'under-review', NULL, 'agent', 'x')`,
          )
          .run(),
      ).toThrowError(/CHECK/);
    } finally {
      domain.db.close();
    }
  });
});

describe("DDL 快照锚（已发布迁移语句禁改——防抖动）", () => {
  it("v1 语句集快照", () => {
    const sql = SPEC_MIGRATIONS[0]!.statements.map((s) => (typeof s === "string" ? s : s.sql));
    expect(sql).toMatchSnapshot();
  });
});
