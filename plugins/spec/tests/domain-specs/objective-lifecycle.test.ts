// objective-lifecycle 集成测试（plugin-spec-roadmaps 1.6，code-design §3c 模块⒞-3）——
// 链式收口：createMilestone 首位即开工 + roadmap 开工 + I7 台账行 / transitionMilestone
// 尾推后继开工 + roadmap 待验收 / moveMilestone 重排重判 / C5 roadmap 终态守卫 /
// 两写原子性（链中断全回滚）。
import { describe, expect, it } from "vitest";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import type { ObjectiveStatus } from "../../host/db/row-types.js";
import {
  createMilestone,
  moveMilestone,
  transitionMilestone,
  type ObjectiveVerbDeps,
} from "../../host/domain/specs/objective-lifecycle.js";
import { isSpecError } from "../../host/domain/specs/errors.js";

const BASE = "2026-01-01T00:00:00.000Z";
let n = 0;

function harness() {
  const domain: SpecDomainDb = openSpecDb(".", { file: ":memory:" });
  const deps: ObjectiveVerbDeps = {
    db: domain.db,
    repos: domain.repos,
    now: () => BASE,
    generateId: () => `id-${String(++n).padStart(4, "0")}`,
  };
  const makeRoadmap = (status: ObjectiveStatus = "pending") => {
    const id = `rm-${++n}`;
    domain.repos.roadmaps.insertRoadmap({
      id, projectKey: "demo", slug: `rm-${id}`, title: id, brief: null, acJson: [],
      roadmapStatus: status, createdAt: BASE, updatedAt: BASE,
    });
    return id;
  };
  const statusOf = (id: string) => domain.repos.milestones.findById(id)?.milestoneStatus;
  return { domain, deps, makeRoadmap, statusOf };
}

describe("createMilestone（C2 首位开工 + I7 台账 + roadmap 开工 + C5 终态守卫）", () => {
  it("首位 milestone 创建即开工 + roadmap pending → in_progress（两条台账行 actor='plugin-tool'）", () => {
    const h = harness();
    const rm = h.makeRoadmap();
    const m1 = createMilestone(h.deps, { roadmapId: rm, title: "m1" });
    expect(m1.seq).toBe(1);
    expect(h.statusOf(m1.id)).toBe("in_progress");
    expect(h.domain.repos.roadmaps.findById(rm)?.roadmapStatus).toBe("in_progress");
    const mLedger = h.domain.repos.transitions.listByEntity("milestone", m1.id);
    expect(mLedger).toHaveLength(1);
    expect([mLedger[0].fromStatus, mLedger[0].toStatus, mLedger[0].actor]).toEqual(["pending", "in_progress", "plugin-tool"]);
    const rLedger = h.domain.repos.transitions.listByEntity("roadmap", rm);
    expect([rLedger[0].fromStatus, rLedger[0].toStatus]).toEqual(["pending", "in_progress"]);
  });

  it("第二位 milestone 落 pending（零台账行）——roadmap 不重复开工", () => {
    const h = harness();
    const rm = h.makeRoadmap();
    createMilestone(h.deps, { roadmapId: rm, title: "m1" });
    const m2 = createMilestone(h.deps, { roadmapId: rm, title: "m2" });
    expect(m2.seq).toBe(2);
    expect(h.statusOf(m2.id)).toBe("pending");
    expect(h.domain.repos.transitions.listByEntity("milestone", m2.id)).toHaveLength(0);
    expect(h.domain.repos.transitions.listByEntity("roadmap", rm)).toHaveLength(1);
  });

  it("C5 守卫：向 completed roadmap 追加 → ERR_SPEC_ROADMAP_TERMINAL（零新行）", () => {
    const h = harness();
    const rm = h.makeRoadmap("completed");
    try {
      createMilestone(h.deps, { roadmapId: rm, title: "m1" });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_ROADMAP_TERMINAL");
    }
    expect(h.domain.repos.milestones.listByRoadmap(rm)).toHaveLength(0);
  });
});

describe("transitionMilestone（边沿一 尾开工 + 边沿三 roadmap 待验收）", () => {
  it("m1 completed → m2 同事务开工（台账 pending→in_progress）；m2 completed → roadmap awaiting_acceptance", () => {
    const h = harness();
    const rm = h.makeRoadmap();
    const m1 = createMilestone(h.deps, { roadmapId: rm, title: "m1" });
    const m2 = createMilestone(h.deps, { roadmapId: rm, title: "m2" });
    // m1 走到 awaiting_acceptance（前置状态由验收流制造——测试直写现值）
    h.domain.repos.milestones.updateStatus(m1.id, "awaiting_acceptance", BASE);
    transitionMilestone(h.deps, { milestoneId: m1.id, to: "completed", actor: "plugin-tool" });
    expect(h.statusOf(m1.id)).toBe("completed");
    // 边沿一：m2 前序全 completed → 同事务开工
    expect(h.statusOf(m2.id)).toBe("in_progress");
    const m2Ledger = h.domain.repos.transitions.listByEntity("milestone", m2.id);
    expect([m2Ledger[0].fromStatus, m2Ledger[0].toStatus]).toEqual(["pending", "in_progress"]);
    // 边沿三不触发（m2 未 completed）
    expect(h.domain.repos.roadmaps.findById(rm)?.roadmapStatus).toBe("in_progress");
    // m2 completed → roadmap awaiting_acceptance
    h.domain.repos.milestones.updateStatus(m2.id, "awaiting_acceptance", BASE);
    transitionMilestone(h.deps, { milestoneId: m2.id, to: "completed", actor: "ui" });
    expect(h.domain.repos.roadmaps.findById(rm)?.roadmapStatus).toBe("awaiting_acceptance");
    const rLedger = h.domain.repos.transitions.listByEntity("roadmap", rm);
    const last = rLedger[rLedger.length - 1];
    expect([last.fromStatus, last.toStatus]).toEqual(["in_progress", "awaiting_acceptance"]);
  });

  it("守卫：in_progress 直确认 completed → ERR_SPEC_ILLEGAL_TRANSITION；退回 note 必填", () => {
    const h = harness();
    const rm = h.makeRoadmap();
    const m1 = createMilestone(h.deps, { roadmapId: rm, title: "m1" });
    try {
      transitionMilestone(h.deps, { milestoneId: m1.id, to: "completed", actor: "ui" });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_ILLEGAL_TRANSITION");
    }
    h.domain.repos.milestones.updateStatus(m1.id, "awaiting_acceptance", BASE);
    try {
      transitionMilestone(h.deps, { milestoneId: m1.id, to: "in_progress", actor: "ui" });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_REJECT_NOTE_REQUIRED");
    }
  });

  it("两写原子性：台账写中断 → 整体回滚（现值与台账零变化）", () => {
    const h = harness();
    const rm = h.makeRoadmap();
    const m1 = createMilestone(h.deps, { roadmapId: rm, title: "m1" });
    const m2 = createMilestone(h.deps, { roadmapId: rm, title: "m2" });
    h.domain.repos.milestones.updateStatus(m1.id, "awaiting_acceptance", BASE);
    const rowsBefore = h.domain.repos.transitions.listByEntity("milestone", m1.id).length;
    const orig = h.domain.repos.transitions.appendTransition.bind(h.domain.repos.transitions);
    (h.domain.repos.transitions as unknown as { appendTransition: () => void }).appendTransition = () => {
      throw new Error("sabotage");
    };
    try {
      transitionMilestone(h.deps, { milestoneId: m1.id, to: "completed", actor: "plugin-tool" });
      throw new Error("should throw");
    } catch (e) {
      expect((e as Error).message).toBe("sabotage");
    }
    (h.domain.repos.transitions as unknown as { appendTransition: () => void }).appendTransition = orig;
    expect(h.statusOf(m1.id)).toBe("awaiting_acceptance");
    expect(h.statusOf(m2.id)).toBe("pending");
    expect(h.domain.repos.transitions.listByEntity("milestone", m1.id).length).toBe(rowsBefore);
  });
});

describe("moveMilestone（C1 重排重判）", () => {
  it("重排致 pending 前序全 completed → 同事务开工（零活性延迟）；新前序未完成者保持 pending", () => {
    const h = harness();
    const rm = h.makeRoadmap();
    const m1 = createMilestone(h.deps, { roadmapId: rm, title: "m1" });
    const m2 = createMilestone(h.deps, { roadmapId: rm, title: "m2" });
    const m3 = createMilestone(h.deps, { roadmapId: rm, title: "m3" });
    h.domain.repos.milestones.updateStatus(m1.id, "awaiting_acceptance", BASE);
    transitionMilestone(h.deps, { milestoneId: m1.id, to: "completed", actor: "plugin-tool" });
    // 此时 m2 已被边沿一开工；把 m2 拉回 pending 模拟重排前悬置态
    h.domain.repos.milestones.updateStatus(m2.id, "pending", BASE);
    h.domain.repos.transitions.appendTransition({
      id: `id-${String(++n).padStart(4, "0")}`, entityKind: "milestone", entityId: m2.id,
      fromStatus: "in_progress", toStatus: "pending", note: null, actor: "plugin-tool", createdAt: BASE,
    });
    // m3 移到最前（seq1，零前序）→ 同事务开工；m2 排 m3（in_progress 非 completed）后 → 保持 pending
    const result = moveMilestone(h.deps, { roadmapId: rm, milestoneId: m3.id, anchor: { before: m1.id } });
    expect(result.assignments.map((a) => a.id)).toEqual([m3.id, m1.id, m2.id]);
    expect(h.statusOf(m3.id)).toBe("in_progress");
    expect(h.statusOf(m2.id)).toBe("pending");
    const m3Ledger = h.domain.repos.transitions.listByEntity("milestone", m3.id);
    const last = m3Ledger[m3Ledger.length - 1];
    expect([last.fromStatus, last.toStatus]).toEqual(["pending", "in_progress"]);
  });

  it("锚点校验：双锚/锚点自身/锚点缺席 → ERR_SPEC_MOVE_ANCHOR_INVALID", () => {
    const h = harness();
    const rm = h.makeRoadmap();
    const m1 = createMilestone(h.deps, { roadmapId: rm, title: "m1" });
    const m2 = createMilestone(h.deps, { roadmapId: rm, title: "m2" });
    for (const anchor of [{ before: m1.id, after: m2.id }, { after: "ghost" }]) {
      try {
        moveMilestone(h.deps, { roadmapId: rm, milestoneId: m1.id, anchor });
        throw new Error("should throw");
      } catch (e) {
        expect(isSpecError(e) && e.code).toBe("ERR_SPEC_MOVE_ANCHOR_INVALID");
      }
    }
  });

  it("两步重排原子性：中断 → seq 零残留（无负值、零状态变化）", () => {
    const h = harness();
    const rm = h.makeRoadmap();
    const m1 = createMilestone(h.deps, { roadmapId: rm, title: "m1" });
    const m2 = createMilestone(h.deps, { roadmapId: rm, title: "m2" });
    const orig = h.domain.repos.milestones.updateStatus.bind(h.domain.repos.milestones);
    (h.domain.repos.milestones as unknown as { updateStatus: () => void }).updateStatus = () => {
      throw new Error("sabotage");
    };
    try {
      moveMilestone(h.deps, { roadmapId: rm, milestoneId: m2.id, anchor: { before: m1.id } });
      throw new Error("should throw");
    } catch (e) {
      expect((e as Error).message).toBe("sabotage");
    }
    (h.domain.repos.milestones as unknown as { updateStatus: () => void }).updateStatus = orig;
    // reassignSeq 与开工两写同事务回滚：seq 原序零残留、状态零变化
    const ordered = h.domain.repos.milestones.listByRoadmap(rm);
    expect(ordered.map((m) => [m.id, m.seq])).toEqual([[m1.id, 1], [m2.id, 2]]);
    expect(h.statusOf(m1.id)).toBe("in_progress");
    expect(h.statusOf(m2.id)).toBe("pending");
  });
});
