// goal-review 测试（plugin-spec-roadmaps 1.5，code-design §4 模块Ⓓ）——
// reviewGoal 驱动状态机（auto_reviewing 档校验 / passed→awaiting_confirmation /
// failed→in_progress 同事务三写）/ reviewObjective 不驱动（只落报告行）。
import { describe, expect, it } from "vitest";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import { createForgeSpecsService } from "../../host/domain/specs/service.js";
import { projectKeyOf as deriveProjectKey } from "@dsh-forge/lib-path";
import { advanceGoalsIfDue, type GoalVerbDeps } from "../../host/domain/specs/goal-advance.js";
import { reviewGoal, reviewObjective } from "../../host/domain/specs/goal-review.js";
import type { AcSettlementsFace } from "../../host/tools/projection.js";

const CWD = "Z:\\project\\demo";
const PK = deriveProjectKey(CWD);
const BASE = "2026-01-01T00:00:00.000Z";
// 台账排序锚 = created_at（同 ms 随机 id 逆序会翻乱读写序——单调时钟决定性排序）
let clock = 0;

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? `unexpected:${String(e)}`;
  }
  throw new Error("expected SpecError");
}

async function harness(): Promise<{ domain: SpecDomainDb; deps: GoalVerbDeps; goalId: string }> {
  const domain = openSpecDb(".", { file: ":memory:" });
  createForgeSpecsService({ db: domain.db, repos: domain.repos, writeSpecDoc: () => {} }).createSpec({
    cwd: CWD,
    slug: "demo-spec",
    title: "演示规格",
    goals: [{ title: "目标一", acs: ["判据 A"] }],
    docRelPath: ".forge/specs/demo-spec/spec.md",
  });
  const metFace: AcSettlementsFace = {
    async matchAcSettlements(_pk, criteria) {
      return { matches: criteria.map((criterion) => ({ criterion, met: true })), unmatched: [] };
    },
  };
  const deps: GoalVerbDeps = {
    db: domain.db,
    repos: domain.repos,
    now: () => new Date(Date.now() + ++clock).toISOString(),
    acSettlementsOf: () => metFace,
  };
  await advanceGoalsIfDue(deps, { projectKey: PK, specSlug: "demo-spec" }); // start
  await advanceGoalsIfDue(deps, { projectKey: PK, specSlug: "demo-spec" }); // advance → auto_reviewing
  const specId = domain.repos.specs.getBySlug(PK, "demo-spec")!.id;
  const goalId = domain.repos.specs.listGoalsBySpec(specId)[0]!.id;
  return { domain, deps, goalId };
}

describe("reviewGoal（驱动状态机）", () => {
  it("passed：同事务三写（报告 + awaiting_confirmation + 台账）", async () => {
    const h = await harness();
    try {
      const out = reviewGoal(h.deps, {
        projectKey: PK, specSlug: "demo-spec", goalId: h.goalId, verdict: "passed", content: "逐条对照输出", actor: "plugin-tool",
      });
      expect([out.from, out.to]).toEqual(["auto_reviewing", "awaiting_confirmation"]);
      expect(out.review.entityKind).toBe("goal");
      expect(out.review.gapNote).toBeNull();
      const status = (h.domain.db.prepare(`SELECT goal_status FROM spec_goals WHERE id = ?`).get(h.goalId) as { goal_status: string }).goal_status;
      expect(status).toBe("awaiting_confirmation");
      expect(h.domain.repos.reviews.latestByEntity("goal", h.goalId)?.content).toBe("逐条对照输出");
      const ledger = h.domain.repos.transitions.listByEntity("goal", h.goalId);
      expect([ledger[ledger.length - 1]!.fromStatus, ledger[ledger.length - 1]!.toStatus]).toEqual([
        "auto_reviewing",
        "awaiting_confirmation",
      ]);
    } finally {
      h.domain.db.close();
    }
  });

  it("failed：同事务三写（报告 + 回退 in_progress + 台账 note=gapNote 摘要）", async () => {
    const h = await harness();
    try {
      const out = reviewGoal(h.deps, {
        projectKey: PK, specSlug: "demo-spec", goalId: h.goalId, verdict: "failed", content: "对照失败", gapNote: "AC1 未达成", actor: "plugin-tool",
      });
      expect([out.from, out.to]).toEqual(["auto_reviewing", "in_progress"]);
      expect(out.review.gapNote).toBe("AC1 未达成");
      const status = (h.domain.db.prepare(`SELECT goal_status FROM spec_goals WHERE id = ?`).get(h.goalId) as { goal_status: string }).goal_status;
      expect(status).toBe("in_progress");
      const ledger = h.domain.repos.transitions.listByEntity("goal", h.goalId);
      expect(ledger[ledger.length - 1]!.note).toBe("AC1 未达成");
    } finally {
      h.domain.db.close();
    }
  });

  it("failed 缺 gap_note → ERR_SPEC_REVIEW_GAP_NOTE_REQUIRED（零写入）", async () => {
    const h = await harness();
    try {
      expect(codeOf(() =>
        reviewGoal(h.deps, { projectKey: PK, specSlug: "demo-spec", goalId: h.goalId, verdict: "failed", content: "x", actor: "plugin-tool" }),
      )).toBe("ERR_SPEC_REVIEW_GAP_NOTE_REQUIRED");
      expect((h.domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_reviews`).get() as { n: number }).n).toBe(0);
    } finally {
      h.domain.db.close();
    }
  });

  it("未推进先复核（pending 现值）→ ERR_SPEC_REVIEW_GOAL_NOT_REVIEWING", async () => {
    const domain = openSpecDb(".", { file: ":memory:" });
    try {
      createForgeSpecsService({ db: domain.db, repos: domain.repos, writeSpecDoc: () => {} }).createSpec({
        cwd: CWD, slug: "s2", title: "二", goals: [{ title: "g", acs: ["c"] }], docRelPath: ".forge/specs/s2/spec.md",
      });
      const deps: GoalVerbDeps = { db: domain.db, repos: domain.repos };
      const gid = domain.repos.specs.listGoalsBySpec(domain.repos.specs.getBySlug(PK, "s2")!.id)[0]!.id;
      expect(codeOf(() =>
        reviewGoal(deps, { projectKey: PK, specSlug: "s2", goalId: gid, verdict: "passed", content: "x", actor: "plugin-tool" }),
      )).toBe("ERR_SPEC_REVIEW_GOAL_NOT_REVIEWING");
    } finally {
      domain.db.close();
    }
  });
});

describe("reviewObjective（不驱动状态机——只落报告行）", () => {
  it("milestone/roadmap 报告落行 + 状态列零变化", async () => {
    const domain = openSpecDb(".", { file: ":memory:" });
    try {
      const repos = domain.repos;
      repos.roadmaps.insertRoadmap({
        id: "rm-1", projectKey: PK, slug: "rm", title: "路线图", brief: null, acJson: [],
        roadmapStatus: "in_progress", createdAt: BASE, updatedAt: BASE,
      });
      const milestone = repos.milestones.insertMilestone({
        id: "ms-1", roadmapId: "rm-1", title: "m1", brief: null, acJson: [],
        milestoneStatus: "in_progress", createdAt: BASE, updatedAt: BASE,
      });
      const deps: GoalVerbDeps = { db: domain.db, repos };
      const review = reviewObjective(deps, {
        projectKey: PK, entityKind: "milestone", entityId: milestone.id, verdict: "passed", content: "验收对照摘要", actor: "plugin-tool",
      });
      expect(review.entityKind).toBe("milestone");
      expect(repos.reviews.latestByEntity("milestone", milestone.id)?.content).toBe("验收对照摘要");
      expect(repos.milestones.findById(milestone.id)?.milestoneStatus).toBe("in_progress");
      expect((domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_transitions`).get() as { n: number }).n).toBe(0);

      reviewObjective(deps, {
        projectKey: PK, entityKind: "roadmap", entityId: "rm-1", verdict: "failed", content: "x", gapNote: "缺口", actor: "plugin-tool",
      });
      expect(repos.reviews.latestByEntity("roadmap", "rm-1")?.gapNote).toBe("缺口");
      expect(repos.roadmaps.findById("rm-1")?.roadmapStatus).toBe("in_progress");
    } finally {
      domain.db.close();
    }
  });

  it("守卫枚举：非法档 / 对象不存在 / failed 缺 gap_note", async () => {
    const domain = openSpecDb(".", { file: ":memory:" });
    try {
      const deps: GoalVerbDeps = { db: domain.db, repos: domain.repos };
      expect(codeOf(() =>
        reviewObjective(deps, { projectKey: PK, entityKind: "goal" as never, entityId: "x", verdict: "passed", content: "x", actor: "plugin-tool" }),
      )).toBe("ERR_SPEC_REVIEW_KIND_INVALID");
      expect(codeOf(() =>
        reviewObjective(deps, { projectKey: PK, entityKind: "milestone", entityId: "ghost", verdict: "passed", content: "x", actor: "plugin-tool" }),
      )).toBe("ERR_SPEC_NOT_FOUND");
      expect(codeOf(() =>
        reviewObjective(deps, { projectKey: PK, entityKind: "roadmap", entityId: "ghost", verdict: "failed", content: "x", actor: "plugin-tool" }),
      )).toBe("ERR_SPEC_REVIEW_GAP_NOTE_REQUIRED");
    } finally {
      domain.db.close();
    }
  });
});
