// goal-finalize 测试（plugin-spec-roadmaps 1.5，code-design §4 模块Ⓓ）——
// 合法边表逐格（合法边 + 非法枚举）/ note 必填 / human-only actor 守卫 / 单事务两写。
import { describe, expect, it } from "vitest";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import { createForgeSpecsService } from "../../host/domain/specs/service.js";
import { projectKeyOf as deriveProjectKey } from "@dsh-forge/lib-path";
import { advanceGoalsIfDue, type GoalVerbDeps } from "../../host/domain/specs/goal-advance.js";
import { assertHumanActor, finalizeGoal } from "../../host/domain/specs/goal-finalize.js";
import { reviewGoal } from "../../host/domain/specs/goal-review.js";
import type { AcSettlementsFace } from "../../host/tools/projection.js";

const CWD = "Z:\\project\\demo";
const PK = deriveProjectKey(CWD);
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

/** 推进到 awaiting_confirmation（复核 passed——Ⓓ 前置档态）。 */
function toAwaiting(h: { deps: GoalVerbDeps; goalId: string }): void {
  reviewGoal(h.deps, {
    projectKey: PK, specSlug: "demo-spec", goalId: h.goalId, verdict: "passed", content: "逐条对照通过", actor: "plugin-tool",
  });
}

describe("finalizeGoal（human-only 终审）", () => {
  it("completed：awaiting_confirmation → completed（两写 + 台账 actor 审计锚）", async () => {
    const h = await harness();
    try {
      toAwaiting(h);
      const done = finalizeGoal(h.deps, {
        projectKey: PK, specSlug: "demo-spec", goalId: h.goalId, decision: "completed", actor: "ui",
      });
      expect([done.from, done.to, done.actor]).toEqual(["awaiting_confirmation", "completed", "ui"]);
      const ledger = h.domain.repos.transitions.listByEntity("goal", h.goalId);
      const last = ledger[ledger.length - 1]!;
      expect([last.fromStatus, last.toStatus, last.actor]).toEqual(["awaiting_confirmation", "completed", "ui"]);
    } finally {
      h.domain.db.close();
    }
  });

  it("rejected：awaiting_confirmation → in_progress（note 必填 + 台账留痕）", async () => {
    const h = await harness();
    try {
      toAwaiting(h);
      const rejected = finalizeGoal(h.deps, {
        projectKey: PK, specSlug: "demo-spec", goalId: h.goalId, decision: "rejected", note: "AC2 未落实", actor: "plugin-tool",
      });
      expect([rejected.from, rejected.to]).toEqual(["awaiting_confirmation", "in_progress"]);
      expect(rejected.note).toBe("AC2 未落实");
      const ledger = h.domain.repos.transitions.listByEntity("goal", h.goalId);
      expect(ledger[ledger.length - 1]!.note).toBe("AC2 未落实");
    } finally {
      h.domain.db.close();
    }
  });

  it("驳回缺 note → ERR_SPEC_GOAL_REJECT_NOTE_REQUIRED", async () => {
    const h = await harness();
    try {
      toAwaiting(h);
      expect(codeOf(() =>
        finalizeGoal(h.deps, { projectKey: PK, specSlug: "demo-spec", goalId: h.goalId, decision: "rejected", actor: "ui" }),
      )).toBe("ERR_SPEC_GOAL_REJECT_NOTE_REQUIRED");
    } finally {
      h.domain.db.close();
    }
  });

  it("跳级/非法边拒（ERR_SPEC_GOAL_ILLEGAL_TRANSITION 携 from/to）", async () => {
    const h = await harness();
    try {
      // auto_reviewing → completed 跳级（跳过 awaiting_confirmation 人审档）
      expect(codeOf(() =>
        finalizeGoal(h.deps, { projectKey: PK, specSlug: "demo-spec", goalId: h.goalId, decision: "completed", actor: "ui" }),
      )).toBe("ERR_SPEC_GOAL_ILLEGAL_TRANSITION");
    } finally {
      h.domain.db.close();
    }
    const domain2 = openSpecDb(".", { file: ":memory:" });
    try {
      createForgeSpecsService({ db: domain2.db, repos: domain2.repos, writeSpecDoc: () => {} }).createSpec({
        cwd: CWD, slug: "s2", title: "二", goals: [{ title: "g", acs: ["c"] }], docRelPath: ".forge/specs/s2/spec.md",
      });
      const deps2: GoalVerbDeps = { db: domain2.db, repos: domain2.repos };
      const gid = domain2.repos.specs.listGoalsBySpec(domain2.repos.specs.getBySlug(PK, "s2")!.id)[0]!.id;
      // pending → completed 跳级
      expect(codeOf(() =>
        finalizeGoal(deps2, { projectKey: PK, specSlug: "s2", goalId: gid, decision: "completed", actor: "ui" }),
      )).toBe("ERR_SPEC_GOAL_ILLEGAL_TRANSITION");
    } finally {
      domain2.db.close();
    }
  });

  it("actor 非法通道拒（human-only 守卫单点 assertHumanActor）", () => {
    expect(codeOf(() => assertHumanActor("agent" as never))).toBe("ERR_SPEC_ACTOR_INVALID");
  });

  it("goal 不存在 / 不属该 spec → ERR_SPEC_GOAL_NOT_FOUND", async () => {
    const h = await harness();
    try {
      expect(codeOf(() =>
        finalizeGoal(h.deps, { projectKey: PK, specSlug: "demo-spec", goalId: "ghost", decision: "completed", actor: "ui" }),
      )).toBe("ERR_SPEC_GOAL_NOT_FOUND");
    } finally {
      h.domain.db.close();
    }
  });
});
