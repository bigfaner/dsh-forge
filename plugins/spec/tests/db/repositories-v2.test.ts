// repo 层 v2 四表读写面集成测试（plugin-spec-roadmaps 1.4，code-design §6）——
// 内存 sqlite + v2 迁移后 schema：roadmap/milestone/transitions/reviews 全读写面 +
// spec-repo specsByMilestone 聚合派生读面。排序锚纪律断言：乱序插入 → 索引序出；
// append-only 双触发器 UPDATE/DELETE ABORT 断言。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import { SpecError } from "../../host/domain/specs/errors.js";

const homes: string[] = [];

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function db(): SpecDomainDb {
  const home = mkdtempSync(join(tmpdir(), "spec-repos-v2-"));
  homes.push(home);
  return openSpecDb(home);
}

const BASE = "2026-01-01T00:00:00.000Z";

function roadmapRow(overrides: Partial<Parameters<SpecDomainDb["repos"]["roadmaps"]["insertRoadmap"]>[0]> = {}) {
  return {
    id: "rm-1",
    projectKey: "p",
    slug: "roadmap-a",
    title: "路线图",
    brief: null as string | null,
    acJson: [{ id: "ac-1", criterion: "判据一" }] as Array<{ id: string; criterion: string }>,
    roadmapStatus: "pending" as const,
    createdAt: BASE,
    updatedAt: BASE,
    ...overrides,
  };
}

describe("roadmap-repo（code-design §6）", () => {
  it("insertRoadmap / getBySlug 点查 / updateRoadmapFields / updateStatus 往返", () => {
    const d = db();
    try {
      d.repos.roadmaps.insertRoadmap(roadmapRow());
      const got = d.repos.roadmaps.getBySlug("p", "roadmap-a");
      expect(got).toEqual({
        id: "rm-1",
        projectKey: "p",
        slug: "roadmap-a",
        title: "路线图",
        brief: null,
        acJson: [{ id: "ac-1", criterion: "判据一" }],
        roadmapStatus: "pending",
        createdAt: BASE,
        updatedAt: BASE,
      });
      expect(d.repos.roadmaps.getBySlug("p", "absent")).toBeUndefined();

      d.repos.roadmaps.updateRoadmapFields("rm-1", { title: "新题", brief: "简报" }, "u1");
      const patched = d.repos.roadmaps.getBySlug("p", "roadmap-a");
      expect(patched?.title).toBe("新题");
      expect(patched?.brief).toBe("简报");
      expect(patched?.acJson).toEqual([{ id: "ac-1", criterion: "判据一" }]);

      d.repos.roadmaps.updateStatus("rm-1", "in_progress", "u2");
      expect(d.repos.roadmaps.getBySlug("p", "roadmap-a")?.roadmapStatus).toBe("in_progress");
    } finally {
      d.db.close();
    }
  });

  it("uq(project_key, slug) 重号拒；listByProject listing 索引序（乱序插入 created_at 序出）", () => {
    const d = db();
    try {
      d.repos.roadmaps.insertRoadmap(roadmapRow());
      expect(() => d.repos.roadmaps.insertRoadmap(roadmapRow({ id: "rm-x" }))).toThrowError(/UNIQUE/);

      d.repos.roadmaps.insertRoadmap(roadmapRow({ id: "rm-3", slug: "b", createdAt: "2026-01-03", updatedAt: "2026-01-03" }));
      d.repos.roadmaps.insertRoadmap(roadmapRow({ id: "rm-2", slug: "c", createdAt: "2026-01-02", updatedAt: "2026-01-02" }));
      d.repos.roadmaps.insertRoadmap(roadmapRow({ id: "rm-0", slug: "d", projectKey: "other", createdAt: "2025-01-01", updatedAt: "2025-01-01" }));
      const listed = d.repos.roadmaps.listByProject("p");
      expect(listed.map((r) => r.id)).toEqual(["rm-1", "rm-2", "rm-3"]);
    } finally {
      d.db.close();
    }
  });
});

describe("milestone-repo（code-design §6：seq 赋序 + roadmap 终态守卫 + reassignSeq 两步法）", () => {
  it("insertMilestone 链内 max+1 赋序；completed roadmap 终态守卫拒", () => {
    const d = db();
    try {
      d.repos.roadmaps.insertRoadmap(roadmapRow());
      const m1 = d.repos.milestones.insertMilestone({
        id: "ms-1",
        roadmapId: "rm-1",
        title: "m1",
        brief: null,
        acJson: [],
        milestoneStatus: "pending",
        createdAt: BASE,
        updatedAt: BASE,
      });
      const m2 = d.repos.milestones.insertMilestone({
        id: "ms-2",
        roadmapId: "rm-1",
        title: "m2",
        brief: null,
        acJson: [],
        milestoneStatus: "pending",
        createdAt: BASE,
        updatedAt: BASE,
      });
      expect(m1.seq).toBe(1);
      expect(m2.seq).toBe(2);

      d.repos.roadmaps.updateStatus("rm-1", "completed", "u1");
      try {
        d.repos.milestones.insertMilestone({
          id: "ms-3",
          roadmapId: "rm-1",
          title: "m3",
          brief: null,
          acJson: [],
          milestoneStatus: "pending",
          createdAt: BASE,
          updatedAt: BASE,
        });
        expect.unreachable("completed roadmap 追加须拒");
      } catch (e) {
        expect(e).toBeInstanceOf(SpecError);
        expect((e as SpecError).code).toBe("ERR_SPEC_ROADMAP_TERMINAL");
      }
    } finally {
      d.db.close();
    }
  });

  it("findById / updateFields / listByRoadmap seq 序（乱序插入 seq 序出）", () => {
    const d = db();
    try {
      d.repos.roadmaps.insertRoadmap(roadmapRow());
      d.repos.milestones.insertMilestone({ id: "ms-1", roadmapId: "rm-1", title: "a", brief: null, acJson: [], milestoneStatus: "pending", createdAt: BASE, updatedAt: BASE });
      d.repos.milestones.insertMilestone({ id: "ms-2", roadmapId: "rm-1", title: "b", brief: null, acJson: [], milestoneStatus: "pending", createdAt: BASE, updatedAt: BASE });
      d.repos.milestones.insertMilestone({ id: "ms-3", roadmapId: "rm-1", title: "c", brief: null, acJson: [], milestoneStatus: "pending", createdAt: BASE, updatedAt: BASE });

      expect(d.repos.milestones.findById("ms-2")?.title).toBe("b");
      expect(d.repos.milestones.findById("absent")).toBeUndefined();

      d.repos.milestones.updateFields("ms-2", { title: "b2", acJson: [{ id: "ac-9", criterion: "c" }] }, "u1");
      const got = d.repos.milestones.findById("ms-2");
      expect(got?.title).toBe("b2");
      expect(got?.acJson).toEqual([{ id: "ac-9", criterion: "c" }]);

      const listed = d.repos.milestones.listByRoadmap("rm-1");
      expect(listed.map((m) => m.seq)).toEqual([1, 2, 3]);
    } finally {
      d.db.close();
    }
  });

  it("reassignSeq 两步法：重排落位、UNIQUE 全程不炸、其余行零残留负值", () => {
    const d = db();
    try {
      d.repos.roadmaps.insertRoadmap(roadmapRow());
      for (const [id, title] of [["ms-1", "a"], ["ms-2", "b"], ["ms-3", "c"]] as const) {
        d.repos.milestones.insertMilestone({ id, roadmapId: "rm-1", title, brief: null, acJson: [], milestoneStatus: "pending", createdAt: BASE, updatedAt: BASE });
      }
      // ms-3 移到首位：seq 1←ms-3, 2←ms-1, 3←ms-2（两步写：临时负值区 → 目标值）
      d.repos.milestones.reassignSeq("rm-1", [
        { id: "ms-3", seq: 1 },
        { id: "ms-1", seq: 2 },
        { id: "ms-2", seq: 3 },
      ], "u1");
      const listed = d.repos.milestones.listByRoadmap("rm-1");
      expect(listed.map((m) => m.id)).toEqual(["ms-3", "ms-1", "ms-2"]);
      expect(listed.every((m) => m.seq > 0)).toBe(true);
      const minRow = d.db.prepare(`SELECT MIN(seq) AS n FROM spec_milestones WHERE roadmap_id = 'rm-1'`).get() as { n: number };
      expect(minRow.n).toBe(1);
    } finally {
      d.db.close();
    }
  });
});

describe("transitions-repo 统一台账（entity_kind/entity_id）", () => {
  it("appendTransition 四级写入 + listByEntity idx 前缀序（乱序 created_at 序出）", () => {
    const d = db();
    try {
      const t = (id: string, kind: "spec" | "goal" | "milestone" | "roadmap", entityId: string, createdAt: string) => ({
        id,
        entityKind: kind,
        entityId,
        fromStatus: "pending",
        toStatus: "in_progress",
        note: null,
        actor: "plugin-tool" as const,
        createdAt,
      });
      d.repos.transitions.appendTransition(t("t3", "roadmap", "rm-1", "2026-01-03"));
      d.repos.transitions.appendTransition(t("t1", "roadmap", "rm-1", "2026-01-01"));
      d.repos.transitions.appendTransition(t("t2", "roadmap", "rm-1", "2026-01-02"));
      d.repos.transitions.appendTransition(t("g1", "goal", "g-1", "2026-01-01"));

      const listed = d.repos.transitions.listByEntity("roadmap", "rm-1");
      expect(listed.map((r) => r.id)).toEqual(["t1", "t2", "t3"]);
      expect(d.repos.transitions.listByEntity("goal", "g-1").map((r) => r.id)).toEqual(["g1"]);
      expect(d.repos.transitions.listByEntity("roadmap", "absent")).toEqual([]);
    } finally {
      d.db.close();
    }
  });

  it("collectByGroup 分组归集：逐 (kind,id) 索引序出、应用层归并", () => {
    const d = db();
    try {
      const t = (id: string, kind: "spec" | "goal", entityId: string, createdAt: string) => ({
        id,
        entityKind: kind,
        entityId,
        fromStatus: "a",
        toStatus: "b",
        note: null,
        actor: "ui" as const,
        createdAt,
      });
      d.repos.transitions.appendTransition(t("s1", "spec", "sp-1", "2026-01-01"));
      d.repos.transitions.appendTransition(t("s2", "spec", "sp-1", "2026-01-02"));
      d.repos.transitions.appendTransition(t("g1", "goal", "g-1", "2026-01-01"));

      const grouped = d.repos.transitions.collectByGroup([
        { entityKind: "spec", entityId: "sp-1" },
        { entityKind: "goal", entityId: "g-1" },
      ]);
      expect(grouped.get("spec:sp-1")?.map((r) => r.id)).toEqual(["s1", "s2"]);
      expect(grouped.get("goal:g-1")?.map((r) => r.id)).toEqual(["g1"]);
    } finally {
      d.db.close();
    }
  });

  it("append-only 双触发器：UPDATE/DELETE ABORT", () => {
    const d = db();
    try {
      d.repos.transitions.appendTransition({ id: "t1", entityKind: "spec", entityId: "sp-1", fromStatus: "a", toStatus: "b", note: null, actor: "ui", createdAt: BASE });
      d.repos.reviews.appendReview({ id: "rv-1", entityKind: "goal", entityId: "g-1", verdict: "passed", content: "ok", gapNote: null, actor: "plugin-tool", createdAt: BASE });
      expect(() => d.db.prepare(`UPDATE spec_transitions SET note = 'x' WHERE id = 't1'`).run()).toThrowError(/append-only/);
      expect(() => d.db.prepare(`DELETE FROM spec_transitions WHERE id = 't1'`).run()).toThrowError(/append-only/);
      expect(() => d.db.prepare(`UPDATE spec_reviews SET content = 'x' WHERE id = 'rv-1'`).run()).toThrowError(/append-only/);
      expect(() => d.db.prepare(`DELETE FROM spec_reviews WHERE id = 'rv-1'`).run()).toThrowError(/append-only/);
    } finally {
      d.db.close();
    }
  });

  it("v1 兼容径：append/listBySpec 委托统一台账（entity_kind='spec'）", () => {
    const d = db();
    try {
      d.repos.transitions.append({ id: "t1", specId: "sp-1", fromStatus: "draft", toStatus: "awaiting_approval", note: null, actor: "ui", createdAt: BASE });
      const listed = d.repos.transitions.listBySpec("sp-1");
      expect(listed).toHaveLength(1);
      expect(listed[0]?.specId).toBe("sp-1");
      expect(d.repos.transitions.listByEntity("spec", "sp-1")).toHaveLength(1);
    } finally {
      d.db.close();
    }
  });
});

describe("reviews-repo（appendReview + latestByEntity）", () => {
  it("多轮复核全史保全；latestByEntity created_at 尾列逆序取首", () => {
    const d = db();
    try {
      d.repos.reviews.appendReview({ id: "rv-1", entityKind: "goal", entityId: "g-1", verdict: "failed", content: "v1", gapNote: "缺", actor: "plugin-tool", createdAt: "2026-01-01" });
      d.repos.reviews.appendReview({ id: "rv-2", entityKind: "goal", entityId: "g-1", verdict: "passed", content: "v2", gapNote: null, actor: "plugin-tool", createdAt: "2026-01-03" });
      d.repos.reviews.appendReview({ id: "rv-3", entityKind: "goal", entityId: "g-2", verdict: "passed", content: "other", gapNote: null, actor: "ui", createdAt: "2026-01-02" });

      const latest = d.repos.reviews.latestByEntity("goal", "g-1");
      expect(latest?.id).toBe("rv-2");
      expect(latest?.verdict).toBe("passed");
      expect(d.repos.reviews.latestByEntity("goal", "absent")).toBeUndefined();
    } finally {
      d.db.close();
    }
  });
});

describe("聚合派生读面：spec-repo specsByMilestone（partial 索引圈行）", () => {
  it("milestone_id 等值圈行出 spec_status；NULL 未挂链行拒之索引外", () => {
    const d = db();
    try {
      const ins = d.db.prepare(
        `INSERT INTO spec_specs (id, slug, title, spec_status, tiers_json, project_key, milestone_id, created_at, updated_at)
         VALUES (?, ?, 't', ?, '[]', 'p', ?, ?, ?)`,
      );
      ins.run("sp-1", "a", "completed", "ms-1", "2026-01-02", "2026-01-02");
      ins.run("sp-2", "b", "in_progress", "ms-1", "2026-01-01", "2026-01-01");
      ins.run("sp-3", "c", "draft", null, "2026-01-01", "2026-01-01");

      const specs = d.repos.specs.specsByMilestone("ms-1");
      expect(specs.map((s) => s.id)).toEqual(["sp-2", "sp-1"]); // created_at 索引序
      expect(specs.map((s) => s.specStatus)).toEqual(["in_progress", "completed"]);
      expect(d.repos.specs.specsByMilestone("absent")).toEqual([]);
    } finally {
      d.db.close();
    }
  });
});
