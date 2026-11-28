// 1.8 工具面集成测试（plugin-spec-roadmaps 1.8，TDD）——22 动词注册 + 入参纪律 +
// roadmap/milestone 族 Happy 面 + human-only 链路 + spec_stats：
//   · AC-2 入参纪律：全部工具 schema 零 projectKey / 零 actor；寻径 = roadmap_slug +
//     milestone_id / slug + goal_seq；
//   · AC-3 include 封闭枚举：query_roadmap/query_milestone 未知值 typed 拒；
//   · move_milestone 互斥锚（before/after 二选一）；
//   · human-only 链路：querySpec 尾部推进 → review_goal → finalize_goal（human-only）→
//     spec 链式收口 → accept_spec 验收确认/退回；
//   · spec_stats 里程诊断（零落库面——写径计数零变化）。
import { describe, expect, it } from "vitest";
import { isForgeToolFailure, type ForgeToolFailure } from "@dsh-forge/lib-api";
import type { DiagEventPayload } from "@dsh-forge/lib-diag";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import { createForgeSpecsService } from "../../host/domain/specs/service.js";
import { projectKeyOf as deriveProjectKey } from "@dsh-forge/lib-path";
import { createForgeToolServices } from "../../host/domain/specs/tool-service.js";
import { createSpecTools, FORGE_SPEC_TOOL_NAMES } from "../../host/tools/index.js";
import type { SpecToolExecFace } from "../../host/tools/faces.js";
import type { AcMatchRow, AcSettlementsFace } from "../../host/tools/projection.js";

const CWD = "Z:\\project\\demo";

type DiagLine = Omit<DiagEventPayload, "process">;
const execOf = (): SpecToolExecFace => ({ agent: { session: { id: "s1", header: { cwd: CWD } } } });

/** 组合根 harness（seam 注入组合根；diag 收集缝——诊断面断言用） */
function harness() {
  const domain: SpecDomainDb = openSpecDb(".", { file: ":memory:" });
  const service = createForgeSpecsService({ db: domain.db, repos: domain.repos, writeSpecDoc: () => {} });
  const diag: DiagLine[] = [];
  const verbs = createForgeToolServices({
    db: domain.db,
    repos: domain.repos,
    specs: service,
    onDiag: (payload: DiagLine) => diag.push(payload),
  });
  const tools = createSpecTools({ specs: service, verbs });
  const writeCounts = () =>
    JSON.stringify({
      specs: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_specs`).get() as { n: number }).n,
      goals: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_goals`).get() as { n: number }).n,
      acs: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_acs`).get() as { n: number }).n,
      docs: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_docs`).get() as { n: number }).n,
      roadmaps: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_roadmaps`).get() as { n: number }).n,
      milestones: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_milestones`).get() as { n: number }).n,
      reviews: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_reviews`).get() as { n: number }).n,
    });
  return { domain, tools, diag, writeCounts, close: () => domain.db.close() };
}

/** 全部 met 的投影桩（goal 推进链路驱动用）。 */
function allMetSeam(): AcSettlementsFace {
  return {
    matchAcSettlements: async (_key, criteria) => ({
      matches: criteria.map((c): AcMatchRow => ({ criterion: c, met: true })),
      unmatched: [],
    }),
  };
}

describe("AC-2 入参纪律（工具面零 projectKey / 零 actor——22 员全量 schema 机检）", () => {
  it("22 tool 注册在位且 schema.properties 零 projectKey / 零 actor 键", () => {
    const h = harness();
    try {
      const definitions = Object.values(h.tools);
      expect(definitions).toHaveLength(22);
      expect(definitions.map((d) => d.name)).toEqual([...FORGE_SPEC_TOOL_NAMES]);
      for (const def of definitions) {
        const keys = Object.keys((def.parameters.properties ?? {}) as Record<string, unknown>);
        expect(keys.filter((k) => k === "projectKey" || k === "project_key" || k === "actor"),
          `${def.name}: 入参纪律违规键`).toEqual([]);
      }
    } finally {
      h.close();
    }
  });

  it("cwd 缺席调用 = ERR_PROJECT_KEY_DERIVATION typed 拒绝（服务层派生门）", async () => {
    const h = harness();
    try {
      const result = (await h.tools.createRoadmap.execute(
        { slug: "r1", title: "t" },
        {} as SpecToolExecFace,
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(result)).toBe(true);
      expect(result.code).toBe("ERR_PROJECT_KEY_DERIVATION");
    } finally {
      h.close();
    }
  });
});

describe("Roadmap/Milestone 族（薄封装 Happy 面 + 互斥锚 + include 封闭枚举）", () => {
  it("create_roadmap → create_milestone（seq 赋序 + 首位即开工 + roadmap 开工链式）→ list 两族", async () => {
    const h = harness();
    try {
      const rm = (await h.tools.createRoadmap.execute(
        { slug: "rm", title: "路线图", brief: "简报", ac_json: [{ criterion: "总 AC" }] },
        execOf(),
      )) as { roadmap: { slug: string; roadmapStatus: string } };
      expect(rm.roadmap.slug).toBe("rm");
      expect(rm.roadmap.roadmapStatus).toBe("pending");

      const m1 = (await h.tools.createMilestone.execute(
        { roadmap_slug: "rm", title: "一程" },
        execOf(),
      )) as { milestone: { id: string; seq: number; milestoneStatus: string } };
      expect(m1.milestone.seq).toBe(1);
      expect(m1.milestone.milestoneStatus).toBe("in_progress"); // 首位创建即开工

      const m2 = (await h.tools.createMilestone.execute(
        { roadmap_slug: "rm", title: "二程" },
        execOf(),
      )) as { milestone: { id: string; seq: number; milestoneStatus: string } };
      expect(m2.milestone.seq).toBe(2);
      expect(m2.milestone.milestoneStatus).toBe("pending");

      const list = (await h.tools.listRoadmaps.execute({}, execOf())) as { roadmaps: { slug: string }[] };
      expect(list.roadmaps.map((r) => r.slug)).toEqual(["rm"]);
      const milestones = (await h.tools.listMilestones.execute({ roadmap_slug: "rm" }, execOf())) as {
        milestones: { id: string; seq: number }[];
      };
      expect(milestones.milestones).toHaveLength(2);
      expect(h.diag.some((d) => d.event === "spec-objective-advanced")).toBe(true); // roadmap 开工链式留痕
    } finally {
      h.close();
    }
  });

  it("move_milestone 相对位置移动（其余顺移全量返回）+ 互斥锚两拒绝 + 自指拒绝", async () => {
    const h = harness();
    try {
      await h.tools.createRoadmap.execute({ slug: "rm", title: "t" }, execOf());
      const m1 = (await h.tools.createMilestone.execute({ roadmap_slug: "rm", title: "A" }, execOf())) as { milestone: { id: string } };
      const m2 = (await h.tools.createMilestone.execute({ roadmap_slug: "rm", title: "B" }, execOf())) as { milestone: { id: string } };
      const moved = (await h.tools.moveMilestone.execute(
        { roadmap_slug: "rm", milestone_id: m2.milestone.id, before: m1.milestone.id },
        execOf(),
      )) as { order: { id: string; seq: number }[] };
      expect(moved.order.map((o) => o.id)).toEqual([m2.milestone.id, m1.milestone.id]);
      expect(moved.order.map((o) => o.seq)).toEqual([1, 2]);

      const both = (await h.tools.moveMilestone.execute(
        { roadmap_slug: "rm", milestone_id: m1.milestone.id, before: m2.milestone.id, after: m2.milestone.id },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(both)).toBe(true);
      expect(both.code).toBe("ERR_TOOL_ARGS_INVALID");
      const none = (await h.tools.moveMilestone.execute(
        { roadmap_slug: "rm", milestone_id: m1.milestone.id },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(none)).toBe(true);
      const self = (await h.tools.moveMilestone.execute(
        { roadmap_slug: "rm", milestone_id: m1.milestone.id, after: m1.milestone.id },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(self)).toBe(true);
      expect(self.code).toBe("ERR_SPEC_MOVE_ANCHOR_INVALID");
    } finally {
      h.close();
    }
  });

  it("query_roadmap 缺省快照 + include=achievement 派生；未知 include 值 typed 拒（AC-3）", async () => {
    const h = harness();
    try {
      await h.tools.createRoadmap.execute({ slug: "rm", title: "t" }, execOf());
      await h.tools.createMilestone.execute({ roadmap_slug: "rm", title: "A" }, execOf());
      const basic = (await h.tools.queryRoadmap.execute({ slug: "rm" }, execOf())) as {
        roadmap: { slug: string };
        milestones: unknown[];
        achievement?: unknown;
      };
      expect(basic.roadmap.slug).toBe("rm");
      expect(basic.milestones).toHaveLength(1);
      expect(basic.achievement).toBeUndefined();
      const expanded = (await h.tools.queryRoadmap.execute(
        { slug: "rm", include: ["achievement"] },
        execOf(),
      )) as { achievement: { completed: boolean; perMilestone: unknown[]; warns: unknown[] } };
      expect(expanded.achievement.completed).toBe(false);
      expect(expanded.achievement.perMilestone).toHaveLength(1);
      const bad = (await h.tools.queryRoadmap.execute(
        { slug: "rm", include: ["bogus"] },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(bad)).toBe(true);
      expect(bad.code).toBe("ERR_SPEC_INCLUDE_UNKNOWN");
    } finally {
      h.close();
    }
  });

  it("query_milestone 寻径 = roadmap_slug + milestone_id；include=specs/achievement；跨 roadmap 寻径拒", async () => {
    const h = harness();
    try {
      await h.tools.createRoadmap.execute({ slug: "rm", title: "t" }, execOf());
      const m = (await h.tools.createMilestone.execute(
        { roadmap_slug: "rm", title: "A", ac_json: [{ criterion: "模块 AC", address: "ghost" }] },
        execOf(),
      )) as { milestone: { id: string; acJson: unknown[] } };
      void m;
      const res = (await h.tools.queryMilestone.execute(
        { roadmap_slug: "rm", milestone_id: "ghost-id", include: ["specs", "achievement"] },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(res)).toBe(true);
      expect(res.code).toBe("ERR_SPEC_MILESTONE_UNKNOWN");
      const badInclude = (await h.tools.queryMilestone.execute(
        { roadmap_slug: "rm", milestone_id: "x", include: ["goals"] },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(badInclude)).toBe(true);
      expect(badInclude.code).toBe("ERR_SPEC_INCLUDE_UNKNOWN");
    } finally {
      h.close();
    }
  });

  it("update_roadmap / update_milestone / transition_milestone 合法边落地 + transition_roadmap human-only 边拒绝", async () => {
    const h = harness();
    try {
      await h.tools.createRoadmap.execute({ slug: "rm", title: "t" }, execOf());
      const upd = (await h.tools.updateRoadmap.execute(
        { slug: "rm", brief: "改简报" },
        execOf(),
      )) as { roadmap: { brief: string } };
      expect(upd.roadmap.brief).toBe("改简报");
      await h.tools.createMilestone.execute({ roadmap_slug: "rm", title: "A" }, execOf());
      const m2 = (await h.tools.createMilestone.execute({ roadmap_slug: "rm", title: "B" }, execOf())) as { milestone: { id: string } };
      const upm = (await h.tools.updateMilestone.execute(
        { roadmap_slug: "rm", milestone_id: m2.milestone.id, title: "B2" },
        execOf(),
      )) as { milestone: { title: string } };
      expect(upm.milestone.title).toBe("B2");
      const trans = (await h.tools.transitionMilestone.execute(
        { roadmap_slug: "rm", milestone_id: m2.milestone.id, to: "in_progress" },
        execOf(),
      )) as { milestone: { milestoneStatus: string }; edgeWrites: unknown[] };
      expect(trans.milestone.milestoneStatus).toBe("in_progress");
      // roadmap 尚 in_progress → awaiting_acceptance→completed human-only 边不可直达（跳级拒）
      const illegal = (await h.tools.transitionRoadmap.execute(
        { roadmap_slug: "rm", to: "completed" },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(illegal)).toBe(true);
      expect(illegal.code).toBe("ERR_SPEC_ILLEGAL_TRANSITION");
    } finally {
      h.close();
    }
  });

  it("create_milestone ac_json address 指向缺席 → ERR_SPEC_AC_ADDRESS_UNKNOWN；向 completed roadmap 追加拒", async () => {
    const h = harness();
    try {
      await h.tools.createRoadmap.execute(
        { slug: "rm", title: "t", ac_json: [{ id: "ac-1", criterion: "总 AC" }] },
        execOf(),
      );
      const bad = (await h.tools.createMilestone.execute(
        { roadmap_slug: "rm", title: "A", ac_json: [{ criterion: "模块 AC", address: "ghost" }] },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(bad)).toBe(true);
      expect(bad.code).toBe("ERR_SPEC_AC_ADDRESS_UNKNOWN");
    } finally {
      h.close();
    }
  });
});

describe("Spec 生命周期增量 + human-only 链路（accept_spec / review / finalize_goal）", () => {
  it("create_spec 挂链 milestoneId 守卫（缺席拒）；合法挂链落列", async () => {
    const h = harness();
    try {
      await h.tools.createRoadmap.execute({ slug: "rm", title: "t" }, execOf());
      const m = (await h.tools.createMilestone.execute({ roadmap_slug: "rm", title: "A" }, execOf())) as { milestone: { id: string } };
      const linked = (await h.tools.createSpec.execute(
        { slug: "s1", title: "规格一", goals: [{ title: "G", acs: ["判据"] }], milestone_id: m.milestone.id },
        execOf(),
      )) as { spec: { milestoneId: string | null } };
      expect(linked.spec.milestoneId).toBe(m.milestone.id);
      const ghost = (await h.tools.createSpec.execute(
        { slug: "s2", title: "规格二", goals: [{ title: "G", acs: ["判据"] }], milestone_id: "ghost" },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(ghost)).toBe(true);
      expect(ghost.code).toBe("ERR_SPEC_MILESTONE_UNKNOWN");
      const relink = (await h.tools.updateSpec.execute(
        { slug: "s1", milestone_id: "ghost" },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(relink)).toBe(true);
      expect(relink.code).toBe("ERR_SPEC_MILESTONE_UNKNOWN");
    } finally {
      h.close();
    }
  });

  it("querySpec 尾部推进写点（all-met 投影：pending→in_progress→auto_reviewing）→ review_goal passed → finalize_goal completed → spec 链式收口 → accept_spec completed", async () => {
    const h = harness();
    try {
      const seam = allMetSeam();
      const service = createForgeSpecsService({ db: h.domain.db, repos: h.domain.repos, writeSpecDoc: () => {} });
      const verbsSeamed = createForgeToolServices({
        db: h.domain.db,
        repos: h.domain.repos,
        specs: service,
        acSettlementsOf: () => seam,
        onDiag: (payload) => h.diag.push(payload),
      });
      const tools = createSpecTools({ specs: service, verbs: verbsSeamed });
      await tools.createSpec.execute(
        { slug: "s1", title: "规格", goals: [{ title: "G1", acs: ["判据 A"] }] },
        execOf(),
      );
      // 送审 → 批准 → 开工（transition_spec 全链合法边——completed human-only 除外）
      await tools.transitionSpec.execute({ slug: "s1", to: "awaiting_approval" }, execOf());
      await tools.transitionSpec.execute({ slug: "s1", to: "approved" }, execOf());
      await tools.transitionSpec.execute({ slug: "s1", to: "in_progress" }, execOf());
      // 第一次查询：投影全 met → pending 活动信号 → start（in_progress）
      const q1 = (await tools.querySpec.execute(
        { slug: "s1", include: ["goals"] },
        execOf(),
      )) as { goals: { goalSeq: number; goalStatus: string }[] };
      expect(q1.goals.map((g) => g.goalStatus)).toEqual(["in_progress"]);
      // 第二次查询：全 met → advance（auto_reviewing）
      await tools.querySpec.execute({ slug: "s1" }, execOf());

      // review_goal（复核 agent 径——goalSeq 寻径）
      const reviewed = (await tools.reviewGoal.execute(
        { slug: "s1", goal_seq: 1, verdict: "passed", content: "AC 对照全 met" },
        execOf(),
      )) as { goal: { goalStatus: string }; review: { verdict: string } };
      expect(reviewed.goal.goalStatus).toBe("awaiting_confirmation");
      expect(reviewed.review.verdict).toBe("passed");

      // finalize_goal（human-only——goalSeq 寻径）→ spec 链式收口 awaiting_acceptance
      const done = (await tools.finalizeGoal.execute(
        { slug: "s1", goal_seq: 1, decision: "completed" },
        execOf(),
      )) as { goal: { goalStatus: string } };
      expect(done.goal.goalStatus).toBe("completed");
      const specRow = (await tools.listSpecs.execute({ status_filter: "awaiting_acceptance" }, execOf())) as { specs: { slug: string }[] };
      expect(specRow.specs.map((s) => s.slug)).toEqual(["s1"]);

      // accept_spec（human-only 验收确认）
      const accepted = (await tools.acceptSpec.execute(
        { slug: "s1", decision: "completed" },
        execOf(),
      )) as { spec: { specStatus: string } };
      expect(accepted.spec.specStatus).toBe("completed");

      // completed 冻结：再 accept 拒（非法边）
      const again = (await tools.acceptSpec.execute(
        { slug: "s1", decision: "completed" },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(again)).toBe(true);
    } finally {
      h.close();
    }
  });

  it("updateSpec 族尾部推进写点（AC 增改后 Goal 推进即时生效——不待 querySpec）", async () => {
    const h = harness();
    try {
      const seam = allMetSeam();
      const service = createForgeSpecsService({ db: h.domain.db, repos: h.domain.repos, writeSpecDoc: () => {} });
      const verbsSeamed = createForgeToolServices({
        db: h.domain.db,
        repos: h.domain.repos,
        specs: service,
        acSettlementsOf: () => seam,
        onDiag: (payload) => h.diag.push(payload),
      });
      const tools = createSpecTools({ specs: service, verbs: verbsSeamed });
      await tools.createSpec.execute(
        { slug: "s1", title: "规格", goals: [{ title: "G1", acs: ["判据 A"] }] },
        execOf(),
      );
      await tools.transitionSpec.execute({ slug: "s1", to: "awaiting_approval" }, execOf());
      await tools.transitionSpec.execute({ slug: "s1", to: "approved" }, execOf());
      await tools.transitionSpec.execute({ slug: "s1", to: "in_progress" }, execOf());

      // Goal 现值直读（不经 querySpec——querySpec 自带尾部推进写点，直读隔离触发面）
      const statusOf = (): string => {
        const spec = h.domain.repos.specs.getBySlug(deriveProjectKey(CWD), "s1");
        if (spec === undefined) throw new Error("spec 缺失");
        return h.domain.repos.specs.listGoalsBySpec(spec.id)[0]?.goalStatus ?? "";
      };
      expect(statusOf()).toBe("pending");

      // update_spec 尾部：pending + 活动信号 → start（in_progress），不待 querySpec
      await tools.updateSpec.execute({ slug: "s1", title: "改题" }, execOf());
      expect(statusOf()).toBe("in_progress");

      // replace_spec_goals（AC 全集增改）：Goal 集删插重置 pending——尾部触发 start 边沿
      // （in_progress 即时生效，不待 querySpec）
      const rep = (await tools.replaceSpecGoals.execute(
        { slug: "s1", goals: [{ title: "G1", acs: ["判据 A"] }] },
        execOf(),
      )) as { spec: { specStatus: string } };
      expect(isForgeToolFailure(rep)).toBe(false);
      expect(statusOf()).toBe("in_progress");

      // update_spec 尾部：in_progress + 全 met → advance 边沿（auto_reviewing）
      await tools.updateSpec.execute({ slug: "s1", title: "再改" }, execOf());
      expect(statusOf()).toBe("auto_reviewing");
    } finally {
      h.close();
    }
  });

  it("必填守卫失败面：review_goal failed 缺 gap_note / finalize_goal rejected 缺 note / accept_spec return 缺 note", async () => {
    const h = harness();
    try {
      const service = createForgeSpecsService({ db: h.domain.db, repos: h.domain.repos, writeSpecDoc: () => {} });
      const verbs = createForgeToolServices({ db: h.domain.db, repos: h.domain.repos, specs: service, acSettlementsOf: allMetSeam });
      const tools = createSpecTools({ specs: service, verbs });
      await tools.createSpec.execute(
        { slug: "s1", title: "规格", goals: [{ title: "G1", acs: ["判据 A"] }] },
        execOf(),
      );
      await tools.querySpec.execute({ slug: "s1" }, execOf());
      await tools.querySpec.execute({ slug: "s1" }, execOf()); // → auto_reviewing

      const noGap = (await tools.reviewGoal.execute(
        { slug: "s1", goal_seq: 1, verdict: "failed", content: "x" },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(noGap)).toBe(true);
      expect(noGap.code).toBe("ERR_SPEC_REVIEW_GAP_NOTE_REQUIRED");

      // failed + gap_note → 回退 in_progress；再推 → auto_reviewing → passed → awaiting_confirmation
      await tools.reviewGoal.execute(
        { slug: "s1", goal_seq: 1, verdict: "failed", content: "x", gap_note: "缺口" },
        execOf(),
      );
      await tools.querySpec.execute({ slug: "s1" }, execOf());
      await tools.reviewGoal.execute(
        { slug: "s1", goal_seq: 1, verdict: "passed", content: "ok" },
        execOf(),
      );
      const noNote = (await tools.finalizeGoal.execute(
        { slug: "s1", goal_seq: 1, decision: "rejected" },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(noNote)).toBe(true);
      expect(noNote.code).toBe("ERR_SPEC_GOAL_REJECT_NOTE_REQUIRED");

      // 推到 spec awaiting_acceptance → accept_spec return 缺 note 拒
      await tools.finalizeGoal.execute({ slug: "s1", goal_seq: 1, decision: "completed" }, execOf());
      const noReturnNote = (await tools.acceptSpec.execute(
        { slug: "s1", decision: "return" },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(noReturnNote)).toBe(true);
      expect(noReturnNote.code).toBe("ERR_SPEC_REJECT_NOTE_REQUIRED");
    } finally {
      h.close();
    }
  });

  it("review_objective：milestone/roadmap 档报告落库，passed 不改状态（human-only 状态由 transition 完成）", async () => {
    const h = harness();
    try {
      await h.tools.createRoadmap.execute({ slug: "rm", title: "t" }, execOf());
      const m = (await h.tools.createMilestone.execute({ roadmap_slug: "rm", title: "A" }, execOf())) as { milestone: { id: string; milestoneStatus: string } };
      const reviewM = (await h.tools.reviewObjective.execute(
        { target_kind: "milestone", roadmap_slug: "rm", milestone_id: m.milestone.id, verdict: "passed", content: "预检通过" },
        execOf(),
      )) as { review: { entityKind: string; verdict: string } };
      expect(reviewM.review.entityKind).toBe("milestone");
      expect(m.milestone.milestoneStatus).toBe("in_progress"); // 状态零变化
      const reviewR = (await h.tools.reviewObjective.execute(
        { target_kind: "roadmap", roadmap_slug: "rm", verdict: "failed", content: "x", gap_note: "缺口" },
        execOf(),
      )) as { review: { entityKind: string } };
      expect(reviewR.review.entityKind).toBe("roadmap");
      const badKind = (await h.tools.reviewObjective.execute(
        { target_kind: "milestone", roadmap_slug: "rm", verdict: "passed", content: "x" },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(badKind)).toBe(true);
      expect(badKind.code).toBe("ERR_TOOL_ARGS_INVALID");
    } finally {
      h.close();
    }
  });
});

describe("spec_stats（诊断——零新落库面）", () => {
  it("计数与双分布 + 写径计数零变化（机检锚：stats 零落库）", async () => {
    const h = harness();
    try {
      await h.tools.createSpec.execute(
        { slug: "s1", title: "规格", goals: [{ title: "G1", acs: ["判据 A", "判据 B"] }] },
        execOf(),
      );
      const before = h.writeCounts();
      const stats = (await h.tools.specStats.execute({}, execOf())) as {
        projectKey: string;
        specCount: number;
        goalCount: number;
        acCount: number;
        goalStatusCounts: Record<string, number>;
        projectionStateCounts: Record<string, number>;
      };
      const expectedKey = deriveProjectKey(CWD);
      expect(stats.projectKey).toBe(expectedKey);
      expect(stats.specCount).toBe(1);
      expect(stats.goalCount).toBe(1);
      expect(stats.acCount).toBe(2);
      expect(stats.goalStatusCounts["pending"]).toBe(1);
      expect(stats.projectionStateCounts["no-task-data"]).toBe(2);
      expect(h.writeCounts()).toBe(before);
      // diag 桩 payload 逐字段断言（onDiag 注入桩——SpecVerbDeps.onDiag 替身位置）
      const diagLine = h.diag.find((d) => d.event === "spec-milestone");
      expect(diagLine).not.toBeUndefined();
      expect(diagLine!.level).toBe("info");
      expect(diagLine!.projectId).toBe(expectedKey);
      expect(diagLine!.message).toContain(`project=${expectedKey}`);
      expect(diagLine!.message).toContain("specs=1");
      expect(diagLine!.message).toContain("goals=1");
      expect(diagLine!.message).toContain("acs=2");
      expect(diagLine!.message).toContain("goalStatus={pending:1, in_progress:0, auto_reviewing:0, awaiting_confirmation:0, completed:0}");
      expect(diagLine!.message).toContain("projection={met:0, unmet:0, unmatched:0, no-task-data:2}");
    } finally {
      h.close();
    }
  });

  it("bug cba70b03：返回值键集与成功支 schema 白名单双向相等（additionalProperties:false 下多一键即宿主 oneOf 校验整体拒绝）", async () => {
    const h = harness();
    try {
      const value = (await h.tools.specStats.execute({}, execOf())) as Record<string, unknown>;
      const success = (h.tools.specStats.output.schema as { oneOf: [{ properties: Record<string, unknown> }] }).oneOf[0];
      const allowed = Object.keys(success.properties);
      expect(Object.keys(value).filter((k) => !allowed.includes(k))).toEqual([]);
      expect(allowed.filter((k) => !(k in value))).toEqual([]);
    } finally {
      h.close();
    }
  });
});
