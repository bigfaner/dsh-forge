// milestone-service 集成测试（plugin-spec-roadmaps 1.7，code-design §1 模块ⓐ）——CRUD
// （create 挂链 ac address 指向校验 / update / getMilestone 父 slug+seq 寻径 / list）；
// moveMilestone 互斥/锚点/原子性见 objective-lifecycle.test.ts（1.6 写点单源回归面）。
import { describe, expect, it } from "vitest";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import {
  createMilestone,
  getMilestone,
  listMilestones,
  updateMilestone,
  type MilestoneVerbDeps,
} from "../../host/domain/specs/milestone-service.js";
import { createRoadmap } from "../../host/domain/specs/roadmap-service.js";
import { isSpecError } from "../../host/domain/specs/errors.js";

const BASE = "2026-01-01T00:00:00.000Z";
let n = 0;

function harness() {
  const domain: SpecDomainDb = openSpecDb(".", { file: ":memory:" });
  const deps: MilestoneVerbDeps = {
    db: domain.db,
    repos: domain.repos,
    now: () => BASE,
    generateId: () => `id-${String(++n).padStart(4, "0")}`,
  };
  const roadmap = createRoadmap(deps, {
    projectKey: "demo",
    slug: `rm-${++n}`,
    title: "产品目标",
    acEntries: [
      { id: "r1", criterion: "AC 一" },
      { id: "r2", criterion: "AC 二" },
    ],
  });
  return { domain, deps, roadmap };
}

describe("milestone CRUD（milestone-service 面）", () => {
  it("createMilestone：address 指向在场即落行（seq 链内赋序 + 边沿写点单源仍 objective-lifecycle）", () => {
    const h = harness();
    const m = createMilestone(h.deps, {
      roadmapId: h.roadmap.id,
      title: "模块一",
      acEntries: [{ id: "mc1", criterion: "模块 AC", address: "r1" }],
    });
    expect(m.seq).toBe(1);
    expect(h.domain.repos.milestones.findById(m.id)?.acJson[0]?.address).toBe("r1");
  });

  it("createMilestone：address 指向缺失 → ERR_SPEC_AC_ADDRESS_UNKNOWN 携缺失清单（零新行）", () => {
    const h = harness();
    try {
      createMilestone(h.deps, {
        roadmapId: h.roadmap.id,
        title: "模块一",
        acEntries: [{ id: "mc1", criterion: "模块 AC", address: "ghost" }],
      });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_AC_ADDRESS_UNKNOWN");
      expect(isSpecError(e) && e.data.missingIds).toEqual(["ghost"]);
    }
    expect(h.domain.repos.milestones.listByRoadmap(h.roadmap.id)).toHaveLength(0);
  });

  it("updateMilestone：title/brief/ac_json 修订；address 校验同门", () => {
    const h = harness();
    const m = createMilestone(h.deps, { roadmapId: h.roadmap.id, title: "模块一" });
    const updated = updateMilestone(h.deps, { milestoneId: m.id, title: "改题", brief: "边界" });
    expect(updated.title).toBe("改题");
    expect(updated.brief).toBe("边界");
    try {
      updateMilestone(h.deps, {
        milestoneId: m.id,
        acEntries: [{ id: "mc2", criterion: "x", address: "ghost" }],
      });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_AC_ADDRESS_UNKNOWN");
    }
    // 拒绝路径零落列
    expect(h.domain.repos.milestones.findById(m.id)?.title).toBe("改题");
  });

  it("getMilestone（父 slug + seq 寻径）：命中/缺席 undefined", () => {
    const h = harness();
    const m1 = createMilestone(h.deps, { roadmapId: h.roadmap.id, title: "m1" });
    const m2 = createMilestone(h.deps, { roadmapId: h.roadmap.id, title: "m2" });
    expect(getMilestone(h.deps, { projectKey: "demo", roadmapSlug: h.roadmap.slug, seq: 2 })?.id).toBe(m2.id);
    expect(getMilestone(h.deps, { projectKey: "demo", roadmapSlug: h.roadmap.slug, seq: 9 })).toBeUndefined();
    expect(getMilestone(h.deps, { projectKey: "demo", roadmapSlug: "ghost", seq: 1 })).toBeUndefined();
    expect(m1.seq).toBe(1);
  });

  it("listMilestones：uq 前缀 seq 序", () => {
    const h = harness();
    const m1 = createMilestone(h.deps, { roadmapId: h.roadmap.id, title: "m1" });
    const m2 = createMilestone(h.deps, { roadmapId: h.roadmap.id, title: "m2" });
    expect(listMilestones(h.deps, h.roadmap.id).map((m) => m.id)).toEqual([m1.id, m2.id]);
  });
});
