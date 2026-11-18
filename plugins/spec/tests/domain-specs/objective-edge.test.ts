// objective-edge 判定表契约测试（plugin-spec-roadmaps 1.6，code-design §3c）——
// 五族 × 现值矩阵逐格断言（判定表本体锁定）+ 决策 ∈ 对应状态机合法边。
import { describe, expect, it } from "vitest";
import {
  decideObjectiveEdge,
  type ObjectiveEdgeTrigger,
} from "../../host/domain/specs/objective-edge.js";
import { milestoneMachine, roadmapMachine, specMachine } from "../../host/domain/status-machines.js";

const TRIGGERS: Record<string, ObjectiveEdgeTrigger> = {
  msStart: { family: "milestone-start", predecessorsAllCompleted: true },
  msStartBlocked: { family: "milestone-start", predecessorsAllCompleted: false },
  msAccept: { family: "milestone-accept", subordinatesAllCompleted: true },
  msAcceptBlocked: { family: "milestone-accept", subordinatesAllCompleted: false },
  rmStart: { family: "roadmap-start" },
  rmAccept: { family: "roadmap-accept", milestonesAllCompleted: true },
  rmAcceptBlocked: { family: "roadmap-accept", milestonesAllCompleted: false },
  selfHeal: { family: "spec-self-heal", goalsAllCompleted: false },
  selfHealCalm: { family: "spec-self-heal", goalsAllCompleted: true },
};

describe("decideObjectiveEdge 五族×现值矩阵逐格契约（code-design §3c 判定表）", () => {
  it("边沿一 milestone-start：pending ∧ 前序全 completed → advance；其余全 hold", () => {
    expect(decideObjectiveEdge("pending", TRIGGERS.msStart)).toBe("advance");
    expect(decideObjectiveEdge("pending", TRIGGERS.msStartBlocked)).toBe("hold");
    expect(decideObjectiveEdge("in_progress", TRIGGERS.msStart)).toBe("hold");
    expect(decideObjectiveEdge("awaiting_acceptance", TRIGGERS.msStart)).toBe("hold");
    expect(decideObjectiveEdge("completed", TRIGGERS.msStart)).toBe("hold");
  });

  it("边沿二 milestone-accept：in_progress ∧ 挂链 specs 全 completed → advance；未全/其它现值 hold", () => {
    expect(decideObjectiveEdge("in_progress", TRIGGERS.msAccept)).toBe("advance");
    expect(decideObjectiveEdge("in_progress", TRIGGERS.msAcceptBlocked)).toBe("hold");
    expect(decideObjectiveEdge("pending", TRIGGERS.msAccept)).toBe("hold");
    expect(decideObjectiveEdge("awaiting_acceptance", TRIGGERS.msAccept)).toBe("hold");
    expect(decideObjectiveEdge("completed", TRIGGERS.msAccept)).toBe("hold");
  });

  it("roadmap-start：pending（首个 milestone 创建）→ advance；开工后恒 hold", () => {
    expect(decideObjectiveEdge("pending", TRIGGERS.rmStart)).toBe("advance");
    expect(decideObjectiveEdge("in_progress", TRIGGERS.rmStart)).toBe("hold");
    expect(decideObjectiveEdge("awaiting_acceptance", TRIGGERS.rmStart)).toBe("hold");
    expect(decideObjectiveEdge("completed", TRIGGERS.rmStart)).toBe("hold");
  });

  it("边沿三 roadmap-accept：in_progress ∧ 全 milestones completed → advance；未全/其它现值 hold", () => {
    expect(decideObjectiveEdge("in_progress", TRIGGERS.rmAccept)).toBe("advance");
    expect(decideObjectiveEdge("in_progress", TRIGGERS.rmAcceptBlocked)).toBe("hold");
    expect(decideObjectiveEdge("pending", TRIGGERS.rmAccept)).toBe("hold");
    expect(decideObjectiveEdge("awaiting_acceptance", TRIGGERS.rmAccept)).toBe("hold");
    expect(decideObjectiveEdge("completed", TRIGGERS.rmAccept)).toBe("hold");
  });

  it("竞窗回拉 spec-self-heal：awaiting_acceptance ∧ Goals 非全 completed → advance；全 completed/其它现值 hold", () => {
    expect(decideObjectiveEdge("awaiting_acceptance", TRIGGERS.selfHeal)).toBe("advance");
    expect(decideObjectiveEdge("awaiting_acceptance", TRIGGERS.selfHealCalm)).toBe("hold");
    expect(decideObjectiveEdge("in_progress", TRIGGERS.selfHeal)).toBe("hold");
    expect(decideObjectiveEdge("completed", TRIGGERS.selfHeal)).toBe("hold");
  });

  it("advance 决策 ∈ 对应状态机合法边（判定表与边表同源锁定）", () => {
    expect(milestoneMachine.canTransition("pending", "in_progress").ok).toBe(true);
    expect(milestoneMachine.canTransition("in_progress", "awaiting_acceptance").ok).toBe(true);
    expect(roadmapMachine.canTransition("pending", "in_progress").ok).toBe(true);
    expect(roadmapMachine.canTransition("in_progress", "awaiting_acceptance").ok).toBe(true);
    expect(specMachine.canTransition("awaiting_acceptance", "in_progress").ok).toBe(true);
  });
});
