// spec-lifecycle 测试（plugin-spec-roadmaps 1.6，code-design §3b 模块⒞-2 + §3c 边沿二）——
// 集成（内存 sqlite）：startSpecImpl 机械段一两写/幂等/非法现值拒 + acceptSpec human-only
// 两支（completed/return note 必填）+ 边沿二链入（acceptSpec 尾推 milestone 待验收）。
import { describe, expect, it } from "vitest";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import { createForgeSpecsService } from "../../host/domain/specs/service.js";
import { acceptSpec, startSpecImpl } from "../../host/domain/specs/spec-lifecycle.js";
import { isSpecError } from "../../host/domain/specs/errors.js";
import type { GoalVerbDeps } from "../../host/domain/specs/goal-advance.js";

const CWD = "Z:\\project\\demo";
const BASE = "2026-01-01T00:00:00.000Z";
let n = 0;

function harness() {
  const domain: SpecDomainDb = openSpecDb(".", { file: ":memory:" });
  const deps: GoalVerbDeps = {
    db: domain.db,
    repos: domain.repos,
    now: () => BASE,
    generateId: () => `id-${String(++n).padStart(4, "0")}`,
  };
  const service = createForgeSpecsService({
    db: domain.db,
    repos: { specs: domain.repos.specs, transitions: domain.repos.transitions, docs: domain.repos.docs },
    writeSpecDoc: () => {},
    now: () => BASE,
    generateId: () => `id-${String(++n).padStart(4, "0")}`,
  });
  const linkMilestone = (specId: string, milestoneId: string) => {
    domain.db.prepare("UPDATE spec_specs SET milestone_id = ? WHERE id = ?").run(milestoneId, specId);
  };
  return { domain, deps, service, linkMilestone };
}

function makeSpec(h: ReturnType<typeof harness>, slug: string) {
  const spec = h.service.createSpec({
    cwd: CWD,
    slug,
    title: slug,
    goals: [{ title: "g1", acs: ["AC one"] }],
    docRelPath: `.forge/specs/${slug}/spec.md`,
  });
  return spec;
}

describe("startSpecImpl（机械段一 approved → in_progress）", () => {
  it("approved → in_progress 单事务两写（台账行留痕）", () => {
    const h = harness();
    const spec = makeSpec(h, "lifecycle-a");
    h.service.transitionSpec({ cwd: CWD, slug: spec.slug, to: "awaiting_approval", actor: "ui" });
    h.service.transitionSpec({ cwd: CWD, slug: spec.slug, to: "approved", actor: "ui" });
    const result = startSpecImpl(h.deps, { projectKey: spec.projectKey, specSlug: spec.slug });
    expect(result).toEqual({ specId: spec.id, from: "approved", to: "in_progress" });
    const after = h.domain.repos.specs.getBySlug(spec.projectKey, spec.slug);
    expect(after?.specStatus).toBe("in_progress");
    const ledger = h.domain.repos.transitions.listByEntity("spec", spec.id);
    const last = ledger[ledger.length - 1];
    expect([last.fromStatus, last.toStatus, last.actor]).toEqual(["approved", "in_progress", "plugin-tool"]);
  });

  it("幂等：现值已 in_progress → null 零写（台账零新行）", () => {
    const h = harness();
    const spec = makeSpec(h, "lifecycle-b");
    h.service.transitionSpec({ cwd: CWD, slug: spec.slug, to: "awaiting_approval", actor: "ui" });
    h.service.transitionSpec({ cwd: CWD, slug: spec.slug, to: "approved", actor: "ui" });
    startSpecImpl(h.deps, { projectKey: spec.projectKey, specSlug: spec.slug });
    const rowsBefore = h.domain.repos.transitions.listByEntity("spec", spec.id).length;
    expect(startSpecImpl(h.deps, { projectKey: spec.projectKey, specSlug: spec.slug })).toBeNull();
    expect(h.domain.repos.transitions.listByEntity("spec", spec.id).length).toBe(rowsBefore);
  });

  it("非法现值（draft）→ ERR_SPEC_ILLEGAL_TRANSITION；spec 缺席 → ERR_SPEC_NOT_FOUND", () => {
    const h = harness();
    const spec = makeSpec(h, "lifecycle-c");
    try {
      startSpecImpl(h.deps, { projectKey: spec.projectKey, specSlug: spec.slug });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_ILLEGAL_TRANSITION");
    }
    try {
      startSpecImpl(h.deps, { projectKey: spec.projectKey, specSlug: "nope" });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_NOT_FOUND");
    }
  });
});

describe("acceptSpec（human-only completed / return）+ 边沿二链入", () => {
  it("human-only actor 守卫：非法通道 → ERR_SPEC_ACTOR_INVALID", () => {
    const h = harness();
    const spec = makeSpec(h, "accept-a");
    try {
      acceptSpec(h.deps, { projectKey: spec.projectKey, specSlug: spec.slug, decision: "completed", actor: "agent" as never });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_ACTOR_INVALID");
    }
  });

  it("前置守卫：非 awaiting_acceptance → ERR_SPEC_ILLEGAL_TRANSITION", () => {
    const h = harness();
    const spec = makeSpec(h, "accept-b");
    try {
      acceptSpec(h.deps, { projectKey: spec.projectKey, specSlug: spec.slug, decision: "completed", actor: "ui" });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_ILLEGAL_TRANSITION");
    }
  });

  it("return：note 必填拒 → 附理由退回 in_progress（台账 note 留痕）", () => {
    const h = harness();
    const spec = makeSpec(h, "accept-c");
    h.domain.repos.specs.updateStatus(spec.id, "awaiting_acceptance", BASE);
    try {
      acceptSpec(h.deps, { projectKey: spec.projectKey, specSlug: spec.slug, decision: "return", actor: "ui" });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_REJECT_NOTE_REQUIRED");
    }
    const result = acceptSpec(h.deps, {
      projectKey: spec.projectKey,
      specSlug: spec.slug,
      decision: "return",
      note: "交付缺口",
      actor: "ui",
    });
    expect(result.to).toBe("in_progress");
    const ledger = h.domain.repos.transitions.listByEntity("spec", spec.id);
    const last = ledger[ledger.length - 1];
    expect([last.fromStatus, last.toStatus, last.note]).toEqual(["awaiting_acceptance", "in_progress", "交付缺口"]);
  });

  it("completed：awaiting_acceptance → completed（human-only 写点）", () => {
    const h = harness();
    const spec = makeSpec(h, "accept-d");
    h.domain.repos.specs.updateStatus(spec.id, "awaiting_acceptance", BASE);
    const result = acceptSpec(h.deps, { projectKey: spec.projectKey, specSlug: spec.slug, decision: "completed", actor: "plugin-tool" });
    expect(result.to).toBe("completed");
    expect(h.domain.repos.specs.getBySlug(spec.projectKey, spec.slug)?.specStatus).toBe("completed");
  });

  it("边沿二链入（acceptSpec 尾待验收）：milestone in_progress ∧ 挂链 specs 全 completed → 同事务 milestone awaiting_acceptance 两写", () => {
    const h = harness();
    const ts = BASE;
    h.domain.repos.roadmaps.insertRoadmap({
      id: "rm-1", projectKey: "demo", slug: "rm", title: "rm", brief: null, acJson: [],
      roadmapStatus: "in_progress", createdAt: ts, updatedAt: ts,
    });
    h.domain.repos.milestones.insertMilestone({
      id: "ms-1", roadmapId: "rm-1", title: "m1", brief: null, acJson: [],
      milestoneStatus: "in_progress", createdAt: ts, updatedAt: ts,
    });
    const s1 = makeSpec(h, "edge2-a");
    const s2 = makeSpec(h, "edge2-b");
    h.linkMilestone(s1.id, "ms-1");
    h.linkMilestone(s2.id, "ms-1");
    for (const s of [s1, s2]) {
      h.domain.repos.specs.updateStatus(s.id, "in_progress", ts);
      for (const g of h.domain.repos.specs.listGoalsBySpec(s.id)) {
        h.domain.repos.specs.updateGoalStatus(g.id, "completed", ts);
      }
    }
    // s1 先 completed：s2 仍 in_progress → 零链写
    h.domain.repos.specs.updateStatus(s1.id, "awaiting_acceptance", ts);
    const r1 = acceptSpec(h.deps, { projectKey: s1.projectKey, specSlug: s1.slug, decision: "completed", actor: "ui" });
    expect(r1.milestoneWrite).toBeUndefined();
    expect(h.domain.repos.milestones.findById("ms-1")?.milestoneStatus).toBe("in_progress");
    // s2 completed：挂链 specs 全 completed → 同事务链写
    h.domain.repos.specs.updateStatus(s2.id, "awaiting_acceptance", ts);
    const r2 = acceptSpec(h.deps, { projectKey: s2.projectKey, specSlug: s2.slug, decision: "completed", actor: "ui" });
    expect(r2.milestoneWrite).toEqual({ milestoneId: "ms-1", from: "in_progress", to: "awaiting_acceptance" });
    expect(h.domain.repos.milestones.findById("ms-1")?.milestoneStatus).toBe("awaiting_acceptance");
    const mLedger = h.domain.repos.transitions.listByEntity("milestone", "ms-1");
    const last = mLedger[mLedger.length - 1];
    expect([last.fromStatus, last.toStatus, last.actor]).toEqual(["in_progress", "awaiting_acceptance", "ui"]);
  });
});
