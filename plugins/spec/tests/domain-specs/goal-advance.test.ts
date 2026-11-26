// goal-advance 测试（plugin-spec-roadmaps 1.5，code-design §3）——
// 单测：decideAdvance 六分支×现值矩阵逐格契约（判定表本体锁定 + 决策∈goalMachine 合法边）；
// 集成（内存 sqlite）：start/推进幂等/回退/驳回重触发/零 AC 不触发/no-task-data 不触发/
// 竞窗自愈回退六例 + Spec 链式收口 + emitDiag 桩逐字段断言。
import { describe, expect, it } from "vitest";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import { createForgeSpecsService } from "../../host/domain/specs/service.js";
import { projectKeyOf as deriveProjectKey } from "@dsh-forge/lib-path";
import {
  advanceGoalsIfDue,
  decideAdvance,
  projectGoalAcs,
  type GoalAcProjection,
  type GoalVerbDeps,
} from "../../host/domain/specs/goal-advance.js";
import { finalizeGoal } from "../../host/domain/specs/goal-finalize.js";
import { reviewGoal } from "../../host/domain/specs/goal-review.js";
import { goalMachine, type GoalStatus } from "../../host/domain/status-machines.js";
import type { AcProjectionRow, AcSettlementsFace } from "../../host/tools/projection.js";

const CWD = "Z:\\project\\demo";
const BASE = "2026-01-01T00:00:00.000Z";
let seq = 0;

// ── decideAdvance 纯函数（零替身直喂值对象）──

const PROJ: Record<string, GoalAcProjection> = {
  zeroAc: { acCount: 0, anyNoTaskData: false, hasActivity: false, allMet: false, anyUnmetOrUnmatched: false },
  noData: { acCount: 1, anyNoTaskData: true, hasActivity: false, allMet: false, anyUnmetOrUnmatched: false },
  allMet: { acCount: 1, anyNoTaskData: false, hasActivity: true, allMet: true, anyUnmetOrUnmatched: false },
  unmet: { acCount: 1, anyNoTaskData: false, hasActivity: true, allMet: false, anyUnmetOrUnmatched: true },
  metQuiet: { acCount: 1, anyNoTaskData: false, hasActivity: true, allMet: false, anyUnmetOrUnmatched: false },
};

describe("decideAdvance 六分支×现值矩阵逐格契约（code-design §3 判定表）", () => {
  const matrix: Array<[GoalStatus, GoalAcProjection, string]> = [
    // ① completed 终态 → 恒 hold（人类写入域）
    ["completed", PROJ.allMet, "hold"],
    ["completed", PROJ.unmet, "hold"],
    ["completed", PROJ.zeroAc, "hold"],
    // ② 零 AC → hold
    ["pending", PROJ.zeroAc, "hold"],
    ["in_progress", PROJ.zeroAc, "hold"],
    ["auto_reviewing", PROJ.zeroAc, "hold"],
    ["awaiting_confirmation", PROJ.zeroAc, "hold"],
    // ③ 任一投影 no-task-data → hold
    ["pending", PROJ.noData, "hold"],
    ["in_progress", PROJ.noData, "hold"],
    ["auto_reviewing", PROJ.noData, "hold"],
    ["awaiting_confirmation", PROJ.noData, "hold"],
    // ④ pending ∧ 活动信号 → start
    ["pending", PROJ.allMet, "start"],
    ["pending", PROJ.unmet, "start"],
    // ⑤ in_progress ∧ 全 met → advance
    ["in_progress", PROJ.allMet, "advance"],
    //    in_progress 非全 met → hold
    ["in_progress", PROJ.unmet, "hold"],
    ["in_progress", PROJ.metQuiet, "hold"],
    // ⑥ auto_reviewing / awaiting_confirmation ∧ unmet/unmatched → revert
    ["auto_reviewing", PROJ.unmet, "revert"],
    ["awaiting_confirmation", PROJ.unmet, "revert"],
    //    同态全 met / 静默 → hold（推进归人域）
    ["auto_reviewing", PROJ.allMet, "hold"],
    ["auto_reviewing", PROJ.metQuiet, "hold"],
    ["awaiting_confirmation", PROJ.allMet, "hold"],
    ["awaiting_confirmation", PROJ.metQuiet, "hold"],
  ];

  it("矩阵逐格断言（判定表本体）", () => {
    for (const [current, projection, expected] of matrix) {
      expect(decideAdvance(current, projection), `${current} × ${JSON.stringify(projection)}`).toBe(expected);
    }
  });

  it("决策∈goalMachine 合法边（判定表与边表同源锁定）", () => {
    for (const [current, , decision] of matrix) {
      if (decision === "hold") continue;
      const to = decision === "advance" ? "auto_reviewing" : "in_progress";
      expect(goalMachine.canTransition(current, to).ok, `${decision}: ${current} → ${to}`).toBe(true);
    }
  });

  it("projectGoalAcs 聚面单源：no-task-data 行污染整 goal / unmatched 计回退信号", () => {
    const rows: AcProjectionRow[] = [
      { criterion: "a", state: "met" },
      { criterion: "b", state: "no-task-data" },
    ];
    const p = projectGoalAcs(rows);
    expect(p.anyNoTaskData).toBe(true);
    expect(p.allMet).toBe(false);
    const unmatched: AcProjectionRow[] = [
      { criterion: "a", state: "unmet", unmatched: true },
      { criterion: "b", state: "met" },
    ];
    expect(projectGoalAcs(unmatched).anyUnmetOrUnmatched).toBe(true);
  });
});

// ── advanceGoalsIfDue 集成（内存 sqlite + createSpecService 同径组合）──

interface Harness {
  domain: SpecDomainDb;
  deps: GoalVerbDeps;
  specSlug: string;
  goalIds: string[];
  diags: Array<Record<string, unknown>>;
  seam: (face: AcSettlementsFace | undefined) => void;
}

async function harness(goalAcs: string[][] = [["判据 A"], ["判据 B"]]): Promise<Harness> {
  const domain = openSpecDb(".", { file: ":memory:" });
  const service = createForgeSpecsService({
    db: domain.db,
    repos: domain.repos,
    writeSpecDoc: () => {},
  });
  await service.createSpec({
    cwd: CWD,
    slug: "demo-spec",
    title: "演示规格",
    goals: goalAcs.map((acs, i) => ({ title: `目标${i + 1}`, acs })),
    docRelPath: ".forge/specs/demo-spec/spec.md",
  });
  const spec = domain.repos.specs.getBySlug(deriveKey(), "demo-spec")!;
  const goalIds = domain.repos.specs.listGoalsBySpec(spec.id).map((g) => g.id);
  const diags: Array<Record<string, unknown>> = [];
  let face: AcSettlementsFace | undefined;
  return {
    domain,
    specSlug: "demo-spec",
    goalIds,
    diags,
    seam: (f) => {
      face = f;
    },
    deps: {
      db: domain.db,
      repos: domain.repos,
      now: () => new Date(Date.now() + ++seq).toISOString(),
      onDiag: (payload) => diags.push({ ...payload }),
      acSettlementsOf: () => face,
    },
  };
}

function deriveKey(): string {
  return deriveProjectKey(CWD);
}

const metFace: AcSettlementsFace = {
  async matchAcSettlements(_projectKey, criteria) {
    return { matches: criteria.map((criterion) => ({ criterion, met: true })), unmatched: [] };
  },
};
const unmetFace: AcSettlementsFace = {
  async matchAcSettlements(_projectKey, criteria) {
    return { matches: criteria.map((criterion) => ({ criterion, met: false, unmatched: true })), unmatched: criteria };
  },
};

function ledgerCount(domain: SpecDomainDb): number {
  return (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_transitions`).get() as { n: number }).n;
}
function goalStatus(domain: SpecDomainDb, goalId: string): string {
  return (domain.db.prepare(`SELECT goal_status FROM spec_goals WHERE id = ?`).get(goalId) as { goal_status: string })
    .goal_status;
}

describe("advanceGoalsIfDue 集成（验收六例 + 链式收口 + diag 桩）", () => {
  it("① start：pending ∧ 投影出现活动信号 → in_progress（台账 from='pending'）", async () => {
    const h = await harness();
    try {
      h.seam(metFace);
      const applied = await advanceGoalsIfDue(h.deps, { projectKey: deriveKey(), specSlug: h.specSlug });
      expect(applied.map((a) => [a.decision, a.to])).toEqual([
        ["start", "in_progress"],
        ["start", "in_progress"],
      ]);
      expect(goalStatus(h.domain, h.goalIds[0]!)).toBe("in_progress");
      const ledger = h.domain.repos.transitions.listByEntity("goal", h.goalIds[0]!);
      expect(ledger).toHaveLength(1);
      expect([ledger[0]!.fromStatus, ledger[0]!.toStatus, ledger[0]!.actor]).toEqual(["pending", "in_progress", "plugin-tool"]);
    } finally {
      h.domain.db.close();
    }
  });

  it("② 推进幂等：重复调用第二次零新行零出参", async () => {
    const h = await harness();
    try {
      h.seam(metFace);
      await advanceGoalsIfDue(h.deps, { projectKey: deriveKey(), specSlug: h.specSlug }); // start
      await advanceGoalsIfDue(h.deps, { projectKey: deriveKey(), specSlug: h.specSlug }); // advance
      const before = ledgerCount(h.domain);
      const second = await advanceGoalsIfDue(h.deps, { projectKey: deriveKey(), specSlug: h.specSlug });
      expect(second).toEqual([]);
      expect(ledgerCount(h.domain)).toBe(before);
      expect(goalStatus(h.domain, h.goalIds[0]!)).toBe("auto_reviewing");
    } finally {
      h.domain.db.close();
    }
  });

  it("③ 回退：auto_reviewing ∧ unmet → in_progress（台账留痕）", async () => {
    const h = await harness();
    try {
      h.seam(metFace);
      await advanceGoalsIfDue(h.deps, { projectKey: deriveKey(), specSlug: h.specSlug });
      await advanceGoalsIfDue(h.deps, { projectKey: deriveKey(), specSlug: h.specSlug });
      h.seam(unmetFace);
      const applied = await advanceGoalsIfDue(h.deps, { projectKey: deriveKey(), specSlug: h.specSlug });
      expect(applied.every((a) => a.decision === "revert" && a.to === "in_progress")).toBe(true);
      expect(goalStatus(h.domain, h.goalIds[1]!)).toBe("in_progress");
    } finally {
      h.domain.db.close();
    }
  });

  it("④ 驳回重触发：finalize rejected → in_progress → 全 met 再推进 auto_reviewing", async () => {
    const h = await harness([["判据 A"]]);
    try {
      h.seam(metFace);
      await advanceGoalsIfDue(h.deps, { projectKey: deriveKey(), specSlug: h.specSlug });
      await advanceGoalsIfDue(h.deps, { projectKey: deriveKey(), specSlug: h.specSlug });
      finalizeGoal(h.deps, {
        projectKey: deriveKey(),
        specSlug: h.specSlug,
        goalId: h.goalIds[0]!,
        decision: "rejected",
        note: "AC3 未落实",
        actor: "plugin-tool",
      });
      expect(goalStatus(h.domain, h.goalIds[0]!)).toBe("in_progress");
      const applied = await advanceGoalsIfDue(h.deps, { projectKey: deriveKey(), specSlug: h.specSlug });
      expect(applied.map((a) => a.decision)).toEqual(["advance"]);
      expect(goalStatus(h.domain, h.goalIds[0]!)).toBe("auto_reviewing");
    } finally {
      h.domain.db.close();
    }
  });

  it("⑤ 零 AC 不触发：零 AC goal 恒 hold（零流转行）", async () => {
    const h = await harness([[]]);
    try {
      h.seam(metFace);
      const applied = await advanceGoalsIfDue(h.deps, { projectKey: deriveKey(), specSlug: h.specSlug });
      expect(applied).toEqual([]);
      expect(ledgerCount(h.domain)).toBe(0);
    } finally {
      h.domain.db.close();
    }
  });

  it("⑥ no-task-data 不触发：投影缝缺席 → 全 AC 无据 hold（零流转行）", async () => {
    const h = await harness();
    try {
      h.seam(undefined);
      const applied = await advanceGoalsIfDue(h.deps, { projectKey: deriveKey(), specSlug: h.specSlug });
      expect(applied).toEqual([]);
      expect(ledgerCount(h.domain)).toBe(0);
    } finally {
      h.domain.db.close();
    }
  });

  it("⑦ C4 竞窗机械自愈：Goal 驳回悬窗——revert 尾追加 spec 回拉（awaiting_acceptance → in_progress，note='auto: goal reverted'）", async () => {
    const h = await harness([["判据 A"], ["判据 B"]]);
    try {
      const pk = deriveKey();
      const spec = h.domain.repos.specs.getBySlug(pk, h.specSlug)!;
      h.seam(metFace);
      await advanceGoalsIfDue(h.deps, { projectKey: pk, specSlug: h.specSlug });
      await advanceGoalsIfDue(h.deps, { projectKey: pk, specSlug: h.specSlug });
      // Goal1 复核 passed → human-only 终审确认；Goal2 回退悬窗 + spec 竞窗置 awaiting_acceptance
      // （Spec 机械段一/二写点属后续任务范围——测试以 repo 现值写径直接置态）
      reviewGoal(h.deps, { projectKey: pk, specSlug: h.specSlug, goalId: h.goalIds[0]!, verdict: "passed", content: "ok", actor: "plugin-tool" });
      finalizeGoal(h.deps, { projectKey: pk, specSlug: h.specSlug, goalId: h.goalIds[0]!, decision: "completed", actor: "ui" });
      h.domain.repos.specs.updateStatus(spec.id, "awaiting_acceptance", BASE);
      // 自愈触发：Goal2 投影回退信号 → goal revert + spec 同事务机械回拉
      h.seam(unmetFace);
      const applied = await advanceGoalsIfDue(h.deps, { projectKey: pk, specSlug: h.specSlug });
      expect(applied.map((a) => [a.decision, a.goalId])).toEqual([["revert", h.goalIds[1]!]]);
      const specAfter = h.domain.repos.specs.getBySlug(pk, h.specSlug)!;
      expect(specAfter.specStatus).toBe("in_progress");
      const specLedger = h.domain.repos.transitions.listByEntity("spec", specAfter.id);
      const last = specLedger[specLedger.length - 1]!;
      expect([last.fromStatus, last.toStatus, last.note]).toEqual(["awaiting_acceptance", "in_progress", "auto: goal reverted"]);
      expect(goalStatus(h.domain, h.goalIds[1]!)).toBe("in_progress");
    } finally {
      h.domain.db.close();
    }
  });

  it("⑧ Spec 链式收口：Goals 全 completed 边沿 + spec in_progress → 同事务 awaiting_acceptance 两写", async () => {
    const h = await harness([["判据 A"], ["判据 B"]]);
    try {
      const pk = deriveKey();
      const spec = h.domain.repos.specs.getBySlug(pk, h.specSlug)!;
      // Spec 机械段写点属后续任务范围——测试以 repo 现值写径直接置 in_progress
      h.domain.repos.specs.updateStatus(spec.id, "in_progress", BASE);
      h.seam(metFace);
      await advanceGoalsIfDue(h.deps, { projectKey: pk, specSlug: h.specSlug });
      await advanceGoalsIfDue(h.deps, { projectKey: pk, specSlug: h.specSlug });
      // 第一例：复核 passed → human-only 终审确认——边沿未齐，spec 停 in_progress
      reviewGoal(h.deps, { projectKey: pk, specSlug: h.specSlug, goalId: h.goalIds[0]!, verdict: "passed", content: "ok", actor: "plugin-tool" });
      finalizeGoal(h.deps, { projectKey: pk, specSlug: h.specSlug, goalId: h.goalIds[0]!, decision: "completed", actor: "ui" });
      expect(h.domain.repos.specs.getBySlug(pk, h.specSlug)!.specStatus).toBe("in_progress");
      // 第二例 completed：Goals 全 completed 边沿达成——同事务 spec awaiting_acceptance 两写
      reviewGoal(h.deps, { projectKey: pk, specSlug: h.specSlug, goalId: h.goalIds[1]!, verdict: "passed", content: "ok", actor: "plugin-tool" });
      finalizeGoal(h.deps, { projectKey: pk, specSlug: h.specSlug, goalId: h.goalIds[1]!, decision: "completed", actor: "ui" });
      const specDone = h.domain.repos.specs.getBySlug(pk, h.specSlug)!;
      expect(specDone.specStatus).toBe("awaiting_acceptance");
      const specLedger = h.domain.repos.transitions.listByEntity("spec", specDone.id);
      const last = specLedger[specLedger.length - 1]!;
      expect([last.fromStatus, last.toStatus, last.note]).toEqual(["in_progress", "awaiting_acceptance", null]);
    } finally {
      h.domain.db.close();
    }
  });

  it("emitDiag 桩逐字段断言：spec-goal-advanced / spec-goal-reverted（event/message/projectId/sessionId）", async () => {
    const h = await harness([["判据 A"]]);
    try {
      const pk = deriveKey();
      h.seam(metFace);
      await advanceGoalsIfDue(h.deps, { projectKey: pk, specSlug: h.specSlug, sessionId: "s-1" });
      await advanceGoalsIfDue(h.deps, { projectKey: pk, specSlug: h.specSlug, sessionId: "s-1" });
      h.seam(unmetFace);
      await advanceGoalsIfDue(h.deps, { projectKey: pk, specSlug: h.specSlug, sessionId: "s-1" });
      const advanced = h.diags.filter((d) => d.event === "spec-goal-advanced");
      const reverted = h.diags.filter((d) => d.event === "spec-goal-reverted");
      expect(advanced).toHaveLength(2);
      expect(reverted).toHaveLength(1);
      for (const d of [...advanced, ...reverted]) {
        expect(d.level).toBe("info");
        expect(typeof d.message).toBe("string");
        expect((d.message as string).length).toBeGreaterThan(0);
        expect(d.projectId).toBe(pk);
        expect(d.sessionId).toBe("s-1");
      }
      expect((reverted[0]!.message as string)).toContain("回退");
    } finally {
      h.domain.db.close();
    }
  });

  it("spec 不存在 → ERR_SPEC_NOT_FOUND", async () => {
    const h = await harness();
    try {
      h.seam(metFace);
      await expect(
        advanceGoalsIfDue(h.deps, { projectKey: deriveKey(), specSlug: "ghost" }),
      ).rejects.toMatchObject({ code: "ERR_SPEC_NOT_FOUND" });
    } finally {
      h.domain.db.close();
    }
  });
});
