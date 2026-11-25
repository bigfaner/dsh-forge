// tool-service（plugin-spec-roadmaps 1.8，tools.md 入参纪律）——工具面组合根：
// 归属键 = 服务层 cwd 纯函数派生单源（deriveProjectKey，M3 先例同径）；actor 由调用径
// 判定（对话 tool 径 = plugin-tool——agent 从不手填，防伪装人类径缝）；milestone 寻径 =
// roadmapSlug + milestoneId（id = UUID 稳定锚，调序/改名不变；seq 不作寻址入参）；goal
// 寻径 = specSlug + goalSeq（goal 不重排 seq 稳定）。域逻辑零重复——全部薄委托
// 1.5/1.6/1.7 service 动词与 M3 forgeSpecs 服务；本文件只做寻径适配、include 封闭枚举
// 校验与详情查询装配（域单源门全量适用）。
import type { DiagEventPayload } from "@dsh-forge/lib-diag";
import type { SpecDomainDb } from "../../db/connection.js";
import type { AcEntry, GoalRow, MilestoneRow, ObjectiveStatus, RoadmapRow, SpecRow, SpecStatus, TransitionActor } from "../../db/row-types.js";
import { SPEC_STATUSES } from "../../db/row-types.js";
import { projectAcsStates, type AcSettlementsFace } from "../../tools/projection.js";
import { parseAcEntries } from "./ac-entries.js";
import { SpecError } from "./errors.js";
import { advanceGoalsIfDue, type GoalVerbDeps } from "./goal-advance.js";
import { finalizeGoal } from "./goal-finalize.js";
import { reviewGoal, reviewObjective } from "./goal-review.js";
import * as milestones from "./milestone-service.js";
import type { ObjectiveWrite } from "./objective-lifecycle.js";
import * as roadmaps from "./roadmap-service.js";
import type { RoadmapAchievementDto } from "./roadmap-service.js";
import { acceptSpec } from "./spec-lifecycle.js";
import { type ForgeSpecsService, type GoalInput, resolveSpecProjectKey } from "./service.js";
import type { GitPorcelainRunner } from "@dsh-forge/lib-path/project-root";
import { specStats, type SpecStatsPayload } from "./spec-stats.js";

/** 组合依赖（SpecVerbDeps/GoalVerbDeps 同形注入——装配面/测试同径组合）。 */
export interface ToolVerbDeps {
  db: SpecDomainDb["db"];
  repos: SpecDomainDb["repos"];
  /** M3 forgeSpecs 服务（域逻辑单一事实源——createSpec/updateSpec/replaceGoals/transitionSpec/listSpecs 薄透传） */
  specs: ForgeSpecsService;
  generateId?: () => string;
  now?: () => string;
  onDiag?: (payload: Omit<DiagEventPayload, "process">) => void;
  /** AC 投影现查缝（task-loop matchAcSettlements 窄面；缺席 = no-task-data 降级） */
  acSettlementsOf?: () => AcSettlementsFace | undefined;
  /** 动作者通道覆写（plugin-spec-roadmaps 1.9——Typert UI 径组装第二实例注入 'ui'；
   *  缺席 = 对话 tool 径缺省 'plugin-tool'，1.8 语义零变化） */
  actor?: TransitionActor;
  /** git porcelain 探针缝（归属键主根归拢 lib 单源消费——测试注桩；缺省 = lib 真探针） */
  gitPorcelain?: GitPorcelainRunner;
}

/** 工具面 actor 常量（对话 tool 径 = 用户动作驱动——agent 零手填缝）。 */
const TOOL_ACTOR: TransitionActor = "plugin-tool";

/** spec 台账尾帧条数（tools.md §一·五「最近 N 条流转行」）。 */
export const TRANSITION_TAIL = 20;

/** include 封闭枚举校验单点（tools.md §一·五——未知值 typed Error 拒）。 */
export function assertInclude(raw: string[] | undefined, allowed: readonly string[]): string[] | undefined {
  if (raw === undefined) return undefined;
  for (const value of raw) {
    if (!allowed.includes(value)) {
      throw new SpecError("ERR_SPEC_INCLUDE_UNKNOWN", `未知 include 值：${value}（封闭枚举：${allowed.join(" | ")}）`, {
        include: raw,
        allowed,
      });
    }
  }
  return raw;
}

function requireRoadmapBySlug(deps: ToolVerbDeps, projectKey: string, slug: string): RoadmapRow {
  const roadmap = deps.repos.roadmaps.getBySlug(projectKey, slug);
  if (roadmap === undefined) {
    throw new SpecError("ERR_SPEC_ROADMAP_UNKNOWN", `roadmap 不存在：${slug}`, { slug });
  }
  return roadmap;
}

/** milestone 寻径单点：roadmapSlug + milestoneId——id 恒 UUID 稳定锚，跨 roadmap 即缺席。 */
function requireMilestoneOfRoadmap(deps: ToolVerbDeps, roadmapId: string, milestoneId: string): MilestoneRow {
  const milestone = deps.repos.milestones.findById(milestoneId);
  if (milestone === undefined || milestone.roadmapId !== roadmapId) {
    throw new SpecError("ERR_SPEC_MILESTONE_UNKNOWN", `milestone 不存在或不属于该 roadmap：${milestoneId}`, {
      milestoneId,
      roadmapId,
    });
  }
  return milestone;
}

/** goal 寻径单点：specSlug + goalSeq（sortKey 即呈现序——goal 不重排 seq 稳定）。 */
function goalBySeq(specId: string, goals: readonly GoalRow[], goalSeq: number): GoalRow {
  const goal = goals.find((g) => g.sortKey === goalSeq);
  if (goal === undefined) {
    throw new SpecError("ERR_SPEC_GOAL_NOT_FOUND", `goal 不存在：goal_seq=${goalSeq}`, { goalSeq, specId });
  }
  return goal;
}

function requireSpec(deps: ToolVerbDeps, projectKey: string, slug: string): SpecRow {
  const spec = deps.repos.specs.getBySlug(projectKey, slug);
  if (spec === undefined) {
    throw new SpecError("ERR_SPEC_NOT_FOUND", `spec 不存在：${slug}`, { slug });
  }
  return spec;
}

export interface ForgeToolServices {
  // ── Roadmap 族 ──
  createRoadmap(i: { cwd: string; slug: string; title: string; brief?: string; acEntries?: readonly unknown[] }): RoadmapRow;
  updateRoadmap(i: { cwd: string; slug: string; title?: string; brief?: string; acEntries?: readonly unknown[] }): RoadmapRow;
  transitionRoadmap(i: { cwd: string; roadmapSlug: string; to: ObjectiveStatus; note?: string }): RoadmapRow;
  queryRoadmap(i: { cwd: string; slug: string; include?: string[] }): {
    roadmap: RoadmapRow;
    milestones: MilestoneRow[];
    achievement?: RoadmapAchievementDto;
  };
  listRoadmaps(i: { cwd: string }): RoadmapRow[];
  // ── Milestone 族 ──
  createMilestone(i: { cwd: string; roadmapSlug: string; title: string; brief?: string; acEntries?: readonly unknown[] }): MilestoneRow;
  updateMilestone(i: { cwd: string; roadmapSlug: string; milestoneId: string; title?: string; brief?: string; acEntries?: readonly unknown[] }): MilestoneRow;
  moveMilestone(i: { cwd: string; roadmapSlug: string; milestoneId: string; before?: string; after?: string }): milestones.MoveMilestoneResult;
  transitionMilestone(i: { cwd: string; roadmapSlug: string; milestoneId: string; to: ObjectiveStatus; note?: string }): { milestone: MilestoneRow; edgeWrites: readonly ObjectiveWrite[] };
  queryMilestone(i: { cwd: string; roadmapSlug: string; milestoneId: string; include?: string[] }): {
    milestone: MilestoneRow;
    /** 挂链 spec 卡片（specsByMilestone partial 圈行——slug/specStatus 判定列 + goalCount） */
    specs?: Array<{ spec: { id: string; slug: string; specStatus: SpecStatus }; goalCount: number }>;
    achievement?: { completed: boolean; specCount: number; allCompleted: boolean };
  };
  listMilestones(i: { cwd: string; roadmapSlug: string }): MilestoneRow[];
  // ── Spec 增量 / Goal 终审 / 复核 / 诊断 / 详情查询 ──
  acceptSpec(i: { cwd: string; slug: string; decision: "completed" | "return"; note?: string }): { spec: SpecRow; from: string; to: string };
  finalizeGoal(i: { cwd: string; slug: string; goalSeq: number; decision: "completed" | "rejected"; note?: string }): { goal: GoalRow; from: string; to: string };
  reviewGoal(i: { cwd: string; slug: string; goalSeq: number; verdict: "passed" | "failed"; content: string; gapNote?: string }): { review: import("../../db/row-types.js").ReviewRow; goal: GoalRow; from: string; to: string };
  reviewObjective(i: { cwd: string; targetKind: "milestone" | "roadmap"; roadmapSlug: string; milestoneId?: string; verdict: "passed" | "failed"; content: string; gapNote?: string }): import("../../db/row-types.js").ReviewRow;
  specStats(i: { cwd: string }): Promise<SpecStatsPayload>;
  querySpec(i: { cwd: string; slug: string; include?: string[]; sessionId?: string }): Promise<{
    spec: SpecRow;
    goalCount: number;
    goals?: Array<Record<string, unknown>>;
    transitions?: Array<Record<string, unknown>>;
    doc?: { relPath: string };
  }>;
  /** M3 六动词薄透传（createSpec/updateSpec 挂链扩展随服务层签名） */
  specs: ForgeSpecsService;
  /** updateSpec 族（1.17 触发点收口——code-design §模块⒞「触发点收敛服务域两处」：
   *  写动词提交后尾部触发 advanceGoalsIfDue，与 querySpec 同径幂等边沿推进；
   *  推进失败 emitDiag warn 留痕、写动词返回照常，零补偿） */
  updateSpec(i: { cwd: string; slug: string; title?: string; tiers?: string[]; docRelPath?: string; milestoneId?: string | null }): Promise<SpecRow>;
  replaceGoals(i: { cwd: string; slug: string; goals: GoalInput[] }): Promise<SpecRow>;
}

export function createForgeToolServices(deps: ToolVerbDeps): ForgeToolServices {
  // 归属键派生单点（M3 写侧归拢——工具面动词全量经此，worktree cwd 归拢主根键；
  // 域服务径由 service 层 keyOf 单点承担，本面只覆盖 repo 直读动词与投影查询键）
  const projectKeyOf = (cwd: string): string => resolveSpecProjectKey(cwd, deps.gitPorcelain).key;

  function parseAc(raw: readonly unknown[] | undefined, allowAddress: boolean): AcEntry[] | undefined {
    if (raw === undefined) return undefined;
    return parseAcEntries(raw, {
      ...(allowAddress ? { allowAddress: true } : {}),
      ...(deps.generateId !== undefined ? { generateId: deps.generateId } : {}),
    });
  }

  // 尾部推进写点（updateSpec 族——code-design §模块⒞「触发点收敛服务域两处」收口，
  // querySpec 消费先例同径）：写动词提交后幂等边沿推进；推进失败 emitDiag warn 留痕、
  // 写动词返回照常（幂等边沿下次触发自然重试，零补偿）。
  async function advanceTail(projectKey: string, slug: string, cwd: string): Promise<void> {
    try {
      await advanceGoalsIfDue(deps as GoalVerbDeps, { projectKey, specSlug: slug });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      deps.onDiag?.({
        event: "spec-goal-advanced",
        level: "warn",
        message: `Goal 推进事务失败（幂等边沿——下次触发自然重试，零补偿）：spec=${slug} ${message}`,
        projectId: projectKey,
        cwd,
      });
    }
  }

  return {
    specs: deps.specs,

    async updateSpec(i) {
      const projectKey = projectKeyOf(i.cwd);
      const spec = deps.specs.updateSpec({
        cwd: i.cwd,
        slug: i.slug,
        ...(i.title !== undefined ? { title: i.title } : {}),
        ...(i.tiers !== undefined ? { tiers: i.tiers } : {}),
        ...(i.docRelPath !== undefined ? { docRelPath: i.docRelPath } : {}),
        ...(i.milestoneId !== undefined ? { milestoneId: i.milestoneId } : {}),
      });
      await advanceTail(projectKey, i.slug, i.cwd);
      return spec;
    },

    async replaceGoals(i) {
      const projectKey = projectKeyOf(i.cwd);
      const spec = deps.specs.replaceGoals({ cwd: i.cwd, slug: i.slug, goals: i.goals });
      await advanceTail(projectKey, i.slug, i.cwd);
      return spec;
    },

    createRoadmap(i) {
      const projectKey = projectKeyOf(i.cwd);
      return roadmaps.createRoadmap(deps, {
        projectKey,
        slug: i.slug,
        title: i.title,
        ...(i.brief !== undefined ? { brief: i.brief } : {}),
        ...(parseAc(i.acEntries, false) !== undefined ? { acEntries: parseAc(i.acEntries, false)! } : {}),
      });
    },

    updateRoadmap(i) {
      const projectKey = projectKeyOf(i.cwd);
      return roadmaps.updateRoadmap(deps, {
        projectKey,
        slug: i.slug,
        ...(i.title !== undefined ? { title: i.title } : {}),
        ...(i.brief !== undefined ? { brief: i.brief } : {}),
        ...(parseAc(i.acEntries, false) !== undefined ? { acEntries: parseAc(i.acEntries, false)! } : {}),
      });
    },

    transitionRoadmap(i) {
      const projectKey = projectKeyOf(i.cwd);
      const roadmap = requireRoadmapBySlug(deps, projectKey, i.roadmapSlug);
      return roadmaps.transitionRoadmap(deps, {
        roadmapId: roadmap.id,
        to: i.to,
        ...(i.note !== undefined ? { note: i.note } : {}),
        actor: deps.actor ?? TOOL_ACTOR,
      });
    },

    queryRoadmap(i) {
      const projectKey = projectKeyOf(i.cwd);
      const include = assertInclude(i.include, ["achievement"]);
      const roadmap = roadmaps.getRoadmapBySlug(deps, { projectKey, slug: i.slug });
      if (roadmap === undefined) {
        throw new SpecError("ERR_SPEC_ROADMAP_UNKNOWN", `roadmap 不存在：${i.slug}`, { slug: i.slug });
      }
      const milestoneRows = milestones.listMilestones(deps, roadmap.id);
      const achievement = include?.includes("achievement") === true
        ? roadmaps.queryRoadmapAchievement(deps, { projectKey, slug: i.slug })
        : undefined;
      return { roadmap, milestones: milestoneRows, ...(achievement !== undefined ? { achievement } : {}) };
    },

    listRoadmaps(i) {
      return roadmaps.listRoadmaps(deps, projectKeyOf(i.cwd));
    },

    createMilestone(i) {
      const projectKey = projectKeyOf(i.cwd);
      const roadmap = requireRoadmapBySlug(deps, projectKey, i.roadmapSlug);
      return milestones.createMilestone(deps, {
        roadmapId: roadmap.id,
        title: i.title,
        ...(i.brief !== undefined ? { brief: i.brief } : {}),
        ...(parseAc(i.acEntries, true) !== undefined ? { acEntries: parseAc(i.acEntries, true)! } : {}),
      });
    },

    updateMilestone(i) {
      const projectKey = projectKeyOf(i.cwd);
      const roadmap = requireRoadmapBySlug(deps, projectKey, i.roadmapSlug);
      requireMilestoneOfRoadmap(deps, roadmap.id, i.milestoneId);
      return milestones.updateMilestone(deps, {
        milestoneId: i.milestoneId,
        ...(i.title !== undefined ? { title: i.title } : {}),
        ...(i.brief !== undefined ? { brief: i.brief } : {}),
        ...(parseAc(i.acEntries, true) !== undefined ? { acEntries: parseAc(i.acEntries, true)! } : {}),
      });
    },

    moveMilestone(i) {
      const projectKey = projectKeyOf(i.cwd);
      const roadmap = requireRoadmapBySlug(deps, projectKey, i.roadmapSlug);
      requireMilestoneOfRoadmap(deps, roadmap.id, i.milestoneId);
      return milestones.moveMilestone(deps, {
        roadmapId: roadmap.id,
        milestoneId: i.milestoneId,
        anchor: {
          ...(i.before !== undefined ? { before: i.before } : {}),
          ...(i.after !== undefined ? { after: i.after } : {}),
        },
      });
    },

    transitionMilestone(i) {
      const projectKey = projectKeyOf(i.cwd);
      const roadmap = requireRoadmapBySlug(deps, projectKey, i.roadmapSlug);
      requireMilestoneOfRoadmap(deps, roadmap.id, i.milestoneId);
      return milestones.transitionMilestone(deps, {
        milestoneId: i.milestoneId,
        to: i.to,
        ...(i.note !== undefined ? { note: i.note } : {}),
        actor: deps.actor ?? TOOL_ACTOR,
      });
    },

    queryMilestone(i) {
      const projectKey = projectKeyOf(i.cwd);
      const include = assertInclude(i.include, ["specs", "achievement"]);
      const roadmap = requireRoadmapBySlug(deps, projectKey, i.roadmapSlug);
      const milestone = requireMilestoneOfRoadmap(deps, roadmap.id, i.milestoneId);
      const linked = deps.repos.specs.specsByMilestone(milestone.id).map((spec) => ({
        spec,
        goalCount: deps.repos.specs.listGoalsBySpec(spec.id).length,
      }));
      const allCompleted = linked.every((s) => s.spec.specStatus === "completed");
      const achievement = include?.includes("achievement") === true
        ? { completed: linked.length > 0 && allCompleted, specCount: linked.length, allCompleted }
        : undefined;
      return {
        milestone,
        ...(include?.includes("specs") === true ? { specs: linked } : {}),
        ...(achievement !== undefined ? { achievement } : {}),
      };
    },

    listMilestones(i) {
      const projectKey = projectKeyOf(i.cwd);
      const roadmap = requireRoadmapBySlug(deps, projectKey, i.roadmapSlug);
      return milestones.listMilestones(deps, roadmap.id);
    },

    acceptSpec(i) {
      const projectKey = projectKeyOf(i.cwd);
      const result = acceptSpec(deps, {
        projectKey,
        specSlug: i.slug,
        decision: i.decision,
        ...(i.note !== undefined ? { note: i.note } : {}),
        actor: deps.actor ?? TOOL_ACTOR,
      });
      return { spec: requireSpec(deps, projectKey, i.slug), from: result.from, to: result.to };
    },

    finalizeGoal(i) {
      const projectKey = projectKeyOf(i.cwd);
      const spec = requireSpec(deps, projectKey, i.slug);
      const goal = goalBySeq(spec.id, deps.repos.specs.listGoalsBySpec(spec.id), i.goalSeq);
      const result = finalizeGoal(deps, {
        projectKey,
        specSlug: i.slug,
        goalId: goal.id,
        decision: i.decision,
        ...(i.note !== undefined ? { note: i.note } : {}),
        actor: deps.actor ?? TOOL_ACTOR,
      });
      return { goal: { ...goal, goalStatus: result.to as GoalRow["goalStatus"] }, from: result.from, to: result.to };
    },

    reviewGoal(i) {
      const projectKey = projectKeyOf(i.cwd);
      const spec = requireSpec(deps, projectKey, i.slug);
      const goal = goalBySeq(spec.id, deps.repos.specs.listGoalsBySpec(spec.id), i.goalSeq);
      const result = reviewGoal(deps, {
        projectKey,
        specSlug: i.slug,
        goalId: goal.id,
        verdict: i.verdict,
        content: i.content,
        ...(i.gapNote !== undefined ? { gapNote: i.gapNote } : {}),
        actor: deps.actor ?? TOOL_ACTOR,
      });
      return { review: result.review, goal: { ...goal, goalStatus: result.to as GoalRow["goalStatus"] }, from: result.from, to: result.to };
    },

    reviewObjective(i) {
      const projectKey = projectKeyOf(i.cwd);
      const roadmap = requireRoadmapBySlug(deps, projectKey, i.roadmapSlug);
      const entityId = i.targetKind === "milestone"
        ? requireMilestoneOfRoadmap(deps, roadmap.id, i.milestoneId ?? "").id
        : roadmap.id;
      return reviewObjective(deps, {
        projectKey,
        entityKind: i.targetKind,
        entityId,
        verdict: i.verdict,
        content: i.content,
        ...(i.gapNote !== undefined ? { gapNote: i.gapNote } : {}),
        actor: deps.actor ?? TOOL_ACTOR,
      });
    },

    async specStats(i) {
      return specStats(deps, { projectKey: projectKeyOf(i.cwd) });
    },

    async querySpec(i) {
      const projectKey = projectKeyOf(i.cwd);
      const include = assertInclude(i.include, ["goals", "acProjection", "latestReviews", "transitions"]);
      const chain = deps.repos.specs.parentChain(projectKey, i.slug);
      if (chain === undefined) {
        throw new SpecError("ERR_SPEC_NOT_FOUND", `spec 不存在：${i.slug}`, { slug: i.slug });
      }
      const doc = deps.repos.docs.getBySpec(chain.spec.id);
      const wantGoals = include?.includes("goals") === true;
      const wantProjection = include?.includes("acProjection") === true;
      const wantReviews = include?.includes("latestReviews") === true;
      const wantTransitions = include?.includes("transitions") === true;

      // 尾部推进写点前置执行（tools.md querySpec 行——投影零写点的必然后承）：出参装配
      // 前完成幂等边沿推进（读动词携带写点——agent 拿到的即推进后现值）；推进失败
      // emitDiag warn 留痕、查询主体照常（幂等边沿下次查询自然重触发，零补偿）。
      try {
        await advanceGoalsIfDue(deps as GoalVerbDeps, {
          projectKey,
          specSlug: i.slug,
          ...(i.sessionId !== undefined ? { sessionId: i.sessionId } : {}),
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        deps.onDiag?.({
          event: "spec-goal-advanced",
          level: "warn",
          message: `Goal 推进事务失败（幂等边沿——下次触发自然重试，零补偿）：spec=${i.slug} ${message}`,
          projectId: projectKey,
          ...(i.sessionId !== undefined ? { sessionId: i.sessionId } : {}),
        });
      }
      // 推进后重读 goals 现值（写点后快照——出参即现值）
      const goalsNow = deps.repos.specs.listGoalsBySpec(chain.spec.id);
      const acsByGoal = new Map(goalsNow.map((g) => [g.id, deps.repos.specs.listAcsByGoal(g.id)]));

      // 投影现算（include=acProjection 时一次 matchAcSettlements 全 spec 共享；缝缺席/
      // 抛错 = 全 AC no-task-data 降级——diag 留痕不静默，与 M3 querySpec 判型同径）
      let projectionByCriterion: Map<string, { state: string; unmatched?: true }> | undefined;
      if (wantProjection) {
        const criteria = chain.goals.flatMap((g) => g.acs.map((ac) => ac.criterion));
        let aggregate: Awaited<ReturnType<AcSettlementsFace["matchAcSettlements"]>> | undefined;
        let degradedBy = "absent";
        try {
          const face = deps.acSettlementsOf?.();
          if (face !== undefined) {
            degradedBy = "";
            aggregate = await face.matchAcSettlements(projectKey, criteria);
          }
        } catch {
          aggregate = undefined;
          degradedBy = "throw";
        }
        projectionByCriterion = new Map(
          projectAcsStates(criteria, aggregate).map((row) => [row.criterion, { state: row.state, ...(row.unmatched === true ? { unmatched: true } : {}) }]),
        );
        if (degradedBy !== "") {
          deps.onDiag?.({
            event: "spec-ac-projection-absent",
            level: degradedBy === "throw" ? "warn" : "info",
            message: `AC 投影降级：${degradedBy === "throw" ? "matchAcSettlements 调用抛错" : "task-loop 服务缺席"}——全 AC 无任务数据 spec=${i.slug}`,
            projectId: projectKey,
            ...(i.sessionId !== undefined ? { sessionId: i.sessionId } : {}),
            cwd: i.cwd,
          });
        }
        const unmatched = [...projectionByCriterion.entries()].filter(([, p]) => p.unmatched === true);
        if (unmatched.length > 0) {
          deps.onDiag?.({
            event: "spec-ac-projection-unmatched",
            level: "warn",
            message: `AC 投影 unmatched 非空（漂移信号）：spec=${i.slug} 判据=[${unmatched.map(([c]) => c).join("；")}]`,
            projectId: projectKey,
            ...(i.sessionId !== undefined ? { sessionId: i.sessionId } : {}),
            cwd: i.cwd,
          });
        }
      }

      const goals = goalsNow.map((goal) => {
        const acs = acsByGoal.get(goal.id) ?? [];
        const entry: Record<string, unknown> = {
          goalId: goal.id,
          goalSeq: goal.sortKey,
          title: goal.title,
          ...(goal.brief !== null ? { brief: goal.brief } : {}),
          goalStatus: goal.goalStatus,
        };
        if (wantProjection) {
          entry["acs"] = acs.map((ac) => ({
            criterion: ac.criterion,
            state: projectionByCriterion?.get(ac.criterion)?.state ?? "no-task-data",
          }));
        }
        if (wantReviews) {
          const latest = deps.repos.reviews.latestByEntity("goal", goal.id);
          if (latest !== undefined) {
            entry["latestReview"] = {
              verdict: latest.verdict,
              ...(latest.gapNote !== null ? { gapNote: latest.gapNote } : {}),
              createdAt: latest.createdAt,
            };
          }
        }
        return entry;
      });

      const goalsSection = wantGoals || wantProjection || wantReviews;
      return {
        spec: chain.spec,
        goalCount: chain.goals.length,
        ...(goalsSection ? { goals } : {}),
        ...(wantTransitions
          ? { transitions: deps.repos.transitions.listBySpec(chain.spec.id).slice(-TRANSITION_TAIL) as unknown as Array<Record<string, unknown>> }
          : {}),
        ...(doc !== undefined ? { doc: { relPath: doc.relPath } } : {}),
      };
    },
  };
}

// 寻径单点与词表再导出（工具面/测试复用）
export { goalBySeq, requireMilestoneOfRoadmap, TOOL_ACTOR, SPEC_STATUSES };
