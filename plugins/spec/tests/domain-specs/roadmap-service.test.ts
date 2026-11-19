// roadmap-service 集成测试（plugin-spec-roadmaps 1.7，code-design §1 模块ⓐ）——CRUD +
// transitionRoadmap 守卫 + confirmRoadmapAchieved 前置守卫 + queryRoadmapAchievement
// 聚合派生五分支（内存 sqlite，测试侧 deps 同径组合）。
import { describe, expect, it } from "vitest";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import type { RoadmapRow, SpecRow } from "../../host/db/row-types.js";
import {
  confirmRoadmapAchieved,
  createRoadmap,
  getRoadmapBySlug,
  listRoadmaps,
  queryRoadmapAchievement,
  transitionRoadmap,
  updateRoadmap,
  type RoadmapVerbDeps,
} from "../../host/domain/specs/roadmap-service.js";
import { createMilestone, type MilestoneVerbDeps } from "../../host/domain/specs/milestone-service.js";
import { isSpecError } from "../../host/domain/specs/errors.js";

const BASE = "2026-01-01T00:00:00.000Z";
let n = 0;

function harness() {
  const domain: SpecDomainDb = openSpecDb(".", { file: ":memory:" });
  const diagPayloads: Array<{ event: string; level: string; message: string }> = [];
  const onDiag = (p: { event: string; level: string; message: string }) =>
    diagPayloads.push({ event: p.event, level: p.level, message: p.message });
  const deps: RoadmapVerbDeps = {
    db: domain.db,
    repos: domain.repos,
    now: () => BASE,
    generateId: () => `id-${String(++n).padStart(4, "0")}`,
    onDiag,
  };
  const milestoneDeps = deps as MilestoneVerbDeps;
  const insertSpec = (milestoneId: string, slug: string, specStatus: SpecRow["specStatus"]): string => {
    const id = `sp-${++n}`;
    domain.repos.specs.insert({
      id, slug, title: slug, specStatus, tiers: [], projectKey: "demo",
      milestoneId, createdAt: BASE, updatedAt: BASE,
    });
    return id;
  };
  const makeMilestone = (roadmapId: string, addresses: string[]): string =>
    createMilestone(milestoneDeps, {
      roadmapId,
      title: `m-${++n}`,
      acEntries: addresses.map((a, i) => ({ id: `mc-${n}-${i}`, criterion: `模块 AC ${i}`, address: a })),
    }).id;
  return { domain, deps, milestoneDeps, diagPayloads, insertSpec, makeMilestone };
}

function makeRoadmap(deps: RoadmapVerbDeps, acIds: string[] = []): RoadmapRow {
  return createRoadmap(deps, {
    projectKey: "demo",
    slug: `rm-${++n}`,
    title: "产品目标",
    acEntries: acIds.map((id) => ({ id, criterion: `AC ${id}` })),
  });
}

describe("roadmap CRUD", () => {
  it("createRoadmap 落 pending 行（ac_json 服务层结构化）；slug 重复 → ERR_SPEC_DUPLICATE_SLUG", () => {
    const h = harness();
    const rm = makeRoadmap(h.deps, ["r1"]);
    expect(rm.roadmapStatus).toBe("pending");
    expect(rm.acJson).toEqual([{ id: "r1", criterion: "AC r1" }]);
    expect(getRoadmapBySlug(h.deps, { projectKey: "demo", slug: rm.slug })).not.toBeUndefined();
    try {
      createRoadmap(h.deps, { projectKey: "demo", slug: rm.slug, title: "dup" });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_DUPLICATE_SLUG");
    }
  });

  it("updateRoadmap 修订 title/brief/ac_json；getBySlug 缺席 → undefined；listRoadmaps 时序", () => {
    const h = harness();
    const rm1 = makeRoadmap(h.deps);
    const rm2 = makeRoadmap(h.deps);
    const updated = updateRoadmap(h.deps, { projectKey: "demo", slug: rm1.slug, title: "改题", brief: "简报" });
    expect(updated.title).toBe("改题");
    expect(updated.brief).toBe("简报");
    expect(getRoadmapBySlug(h.deps, { projectKey: "demo", slug: "ghost" })).toBeUndefined();
    expect(listRoadmaps(h.deps, "demo").map((r) => r.id)).toEqual([rm1.id, rm2.id]);
  });

  it("updateRoadmap ac_json 结构非法 → ERR_SPEC_AC_INVALID", () => {
    const h = harness();
    const rm = makeRoadmap(h.deps);
    try {
      updateRoadmap(h.deps, { projectKey: "demo", slug: rm.slug, acEntries: [{ id: "x", criterion: "" }] });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_AC_INVALID");
    }
  });
});

describe("transitionRoadmap（状态机驱动 + noteRequired 守卫）", () => {
  it("非法流转拒 + 台账两写；completed 出口逆边拒", () => {
    const h = harness();
    const rm = makeRoadmap(h.deps);
    try {
      transitionRoadmap(h.deps, { roadmapId: rm.id, to: "completed", actor: "ui" });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_ILLEGAL_TRANSITION");
    }
    transitionRoadmap(h.deps, { roadmapId: rm.id, to: "in_progress", actor: "plugin-tool" });
    const ledger = h.domain.repos.transitions.listByEntity("roadmap", rm.id);
    expect(ledger).toHaveLength(1);
    expect([ledger[0].fromStatus, ledger[0].toStatus]).toEqual(["pending", "in_progress"]);
    try {
      transitionRoadmap(h.deps, { roadmapId: rm.id, to: "pending", actor: "ui" });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_ILLEGAL_TRANSITION");
    }
  });

  it("验收退回（→ in_progress）note 必填 → ERR_SPEC_REJECT_NOTE_REQUIRED", () => {
    const h = harness();
    const rm = makeRoadmap(h.deps);
    transitionRoadmap(h.deps, { roadmapId: rm.id, to: "in_progress", actor: "ui" });
    transitionRoadmap(h.deps, { roadmapId: rm.id, to: "awaiting_acceptance", actor: "plugin-tool" });
    try {
      transitionRoadmap(h.deps, { roadmapId: rm.id, to: "in_progress", actor: "ui" });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_REJECT_NOTE_REQUIRED");
    }
  });
});

describe("confirmRoadmapAchieved（聚合派生前置守卫）", () => {
  it("未达成（非 awaiting_acceptance / 派生未达成）→ ERR_SPEC_CONFIRM_NOT_ACHIEVED", () => {
    const h = harness();
    const rm = makeRoadmap(h.deps, ["r1"]);
    const m = h.makeMilestone(rm.id, ["r1"]);
    h.insertSpec(m, "spec-a", "in_progress");
    // 现值 pending：状态机守卫拒
    try {
      confirmRoadmapAchieved(h.deps, { roadmapId: rm.id, actor: "ui" });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_CONFIRM_NOT_ACHIEVED");
    }
    // 推到 awaiting_acceptance（首个 milestone 创建边沿已开工）但派生未达成：聚合守卫拒
    transitionRoadmap(h.deps, { roadmapId: rm.id, to: "awaiting_acceptance", actor: "plugin-tool" });
    try {
      confirmRoadmapAchieved(h.deps, { roadmapId: rm.id, actor: "ui" });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_CONFIRM_NOT_ACHIEVED");
    }
  });

  it("达成（全 milestones completed）→ 确认两写落 completed + 台账行", () => {
    const h = harness();
    const rm = makeRoadmap(h.deps, ["r1"]);
    const m = h.makeMilestone(rm.id, ["r1"]);
    h.insertSpec(m, "spec-a", "completed");
    // roadmap 已被首个 milestone 创建边沿推至 in_progress——直推待验收
    transitionRoadmap(h.deps, { roadmapId: rm.id, to: "awaiting_acceptance", actor: "plugin-tool" });
    const confirmed = confirmRoadmapAchieved(h.deps, { roadmapId: rm.id, actor: "ui", note: "验收通过" });
    expect(confirmed.roadmapStatus).toBe("completed");
    const ledger = h.domain.repos.transitions.listByEntity("roadmap", rm.id);
    const last = ledger[ledger.length - 1];
    expect([last.fromStatus, last.toStatus, last.actor, last.note]).toEqual(["awaiting_acceptance", "completed", "ui", "验收通过"]);
  });
});

describe("queryRoadmapAchievement（读面装配——聚合派生五分支 + warns diag）", () => {
  it("部分 / 混合 / 全 completed 三分支推进 + 零承载 warn 经 emitDiag info 留痕", () => {
    const h = harness();
    // 部分：m1 全 completed、m2 未
    const rm = makeRoadmap(h.deps, ["r1", "r2", "r3"]);
    const m1 = h.makeMilestone(rm.id, ["r1"]);
    const m2 = h.makeMilestone(rm.id, ["r2"]);
    h.insertSpec(m1, "s1", "completed");
    const s2 = h.insertSpec(m2, "s2", "in_progress");
    let dto = queryRoadmapAchievement(h.deps, { projectKey: "demo", slug: rm.slug });
    expect(dto.completed).toBe(false); // 部分
    expect(dto.perMilestone[0]).toMatchObject({ allCompleted: true, specCount: 1 });
    expect(dto.perMilestone[1]).toMatchObject({ allCompleted: false });
    expect(dto.warns.map((w) => w.acId)).toEqual(["r3"]); // 零承载 warn
    expect(h.diagPayloads.some((p) => p.event === "spec-achievement-derive" && p.level === "info")).toBe(true);

    // 混合：m2 内 completed + 非 completed → 仍 false
    h.insertSpec(m2, "s3", "completed");
    dto = queryRoadmapAchievement(h.deps, { projectKey: "demo", slug: rm.slug });
    expect(dto.completed).toBe(false); // 混合

    // 全 completed → true
    h.domain.repos.specs.updateStatus(s2, "completed", BASE);
    dto = queryRoadmapAchievement(h.deps, { projectKey: "demo", slug: rm.slug });
    expect(dto.completed).toBe(true);
  });

  it("未挂链（milestone 零 specs）→ allCompleted false", () => {
    const h = harness();
    const rm = makeRoadmap(h.deps);
    h.makeMilestone(rm.id, []);
    const dto = queryRoadmapAchievement(h.deps, { projectKey: "demo", slug: rm.slug });
    expect(dto.completed).toBe(false);
    expect(dto.perMilestone[0]).toMatchObject({ specCount: 0, allCompleted: false });
  });
});
