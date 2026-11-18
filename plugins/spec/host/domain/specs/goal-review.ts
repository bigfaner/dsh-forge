// goal-review（plugin-spec-roadmaps 1.5，code-design §4 模块Ⓓ）——自动复核动词族：
//   · reviewGoal：Goal 档复核——goal 现值须 auto_reviewing；passed → 同事务推进
//     awaiting_confirmation；failed → 同事务回退 in_progress（note = gapNote 摘要）。
//     报告 INSERT 与状态两写同一事务（三写原子——failed 悬挂态窗口零容忍）。
//   · reviewObjective：milestone/roadmap 档复核——只落报告行，不驱动状态机
//     （Objective 机械边沿推进链入既有写点动词事务尾，属后续任务范围）。
// 写入者 = 复核 agent（经 tool 径调用）；人类零填写（entities.md §5 裁决）。
import { withTransaction } from "@dsh-forge/lib-db";
import type { ReviewRow, TransitionActor } from "../../db/row-types.js";
import { goalMachine } from "../status-machines.js";
import { SpecError } from "./errors.js";
import { locateGoal, type GoalVerbDeps } from "./goal-advance.js";

export interface ReviewGoalInput {
  readonly projectKey: string;
  readonly specSlug: string;
  readonly goalId: string;
  readonly verdict: "passed" | "failed";
  /** 报告正文（逐条对照输出——append-only 一次成文） */
  readonly content: string;
  /** 缺口注记（failed 必填——退回定位） */
  readonly gapNote?: string;
  readonly actor: TransitionActor;
}

export interface ReviewedGoal {
  readonly review: ReviewRow;
  readonly goalId: string;
  readonly from: string;
  readonly to: string;
}

export interface ReviewObjectiveInput {
  readonly projectKey: string;
  readonly entityKind: "milestone" | "roadmap";
  readonly entityId: string;
  readonly verdict: "passed" | "failed";
  readonly content: string;
  readonly gapNote?: string;
  readonly actor: TransitionActor;
}

/**
 * Goal 档复核动词（驱动状态机——同事务三写：报告 + goal_status + 统一台账）。
 */
export function reviewGoal(deps: GoalVerbDeps, input: ReviewGoalInput): ReviewedGoal {
  const { repos } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? (() => crypto.randomUUID());
  const spec = repos.specs.getBySlug(input.projectKey, input.specSlug);
  if (spec === undefined) {
    throw new SpecError("ERR_SPEC_NOT_FOUND", `spec 不存在：${input.specSlug}`, { slug: input.specSlug });
  }
  const goal = locateGoal(repos, spec, input.goalId);
  // 档校验：未推进先复核拒（goal 现值须 auto_reviewing）
  if (goal.goalStatus !== "auto_reviewing") {
    throw new SpecError(
      "ERR_SPEC_REVIEW_GOAL_NOT_REVIEWING",
      `goal 未处于 auto_reviewing，复核拒收：现值 ${goal.goalStatus}`,
      { goalId: input.goalId, goalStatus: goal.goalStatus },
    );
  }
  // failed 分派：gap_note 必填（退回定位——DDL gap_note 可空，服务层强制非空）
  if (input.verdict === "failed" && (!input.gapNote || !input.gapNote.trim())) {
    throw new SpecError("ERR_SPEC_REVIEW_GAP_NOTE_REQUIRED", "复核 failed 必须附缺口注记（gap_note 必填）", {
      goalId: input.goalId,
    });
  }
  const to = input.verdict === "passed" ? "awaiting_confirmation" : "in_progress";
  // 合法边兜底（auto_reviewing → {awaiting_confirmation, in_progress} 两边皆合法）
  goalMachine.assertTransition(goal.goalStatus, to);
  const ts = now();
  const review: ReviewRow = {
    id: generateId(),
    entityKind: "goal",
    entityId: goal.id,
    verdict: input.verdict,
    content: input.content,
    gapNote: input.gapNote ?? null,
    actor: input.actor,
    createdAt: ts,
  };
  withTransaction(deps.db, () => {
    repos.reviews.appendReview(review);
    repos.specs.updateGoalStatus(goal.id, to, ts);
    repos.transitions.appendTransition({
      id: generateId(),
      entityKind: "goal",
      entityId: goal.id,
      fromStatus: goal.goalStatus,
      toStatus: to,
      note: input.verdict === "failed" ? (input.gapNote ?? null) : null,
      actor: input.actor,
      createdAt: ts,
    });
  });
  return { review, goalId: goal.id, from: goal.goalStatus, to };
}

/**
 * Objective（milestone/roadmap）档复核动词（不驱动状态机——只落报告行；
 * entityId 存在性守卫 per-kind 单点）。
 */
export function reviewObjective(deps: GoalVerbDeps, input: ReviewObjectiveInput): ReviewRow {
  const { repos } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? (() => crypto.randomUUID());
  if (input.entityKind !== "milestone" && input.entityKind !== "roadmap") {
    throw new SpecError("ERR_SPEC_REVIEW_KIND_INVALID", `非法复核对象档：${input.entityKind}`, {
      entityKind: input.entityKind,
    });
  }
  if (input.verdict === "failed" && (!input.gapNote || !input.gapNote.trim())) {
    throw new SpecError("ERR_SPEC_REVIEW_GAP_NOTE_REQUIRED", "复核 failed 必须附缺口注记（gap_note 必填）", {
      entityId: input.entityId,
    });
  }
  const exists =
    input.entityKind === "milestone"
      ? repos.milestones.findById(input.entityId) !== undefined
      : repos.roadmaps.findById(input.entityId) !== undefined;
  if (!exists) {
    throw new SpecError("ERR_SPEC_NOT_FOUND", `复核对象不存在：${input.entityKind} ${input.entityId}`, {
      entityKind: input.entityKind,
      entityId: input.entityId,
    });
  }
  const review: ReviewRow = {
    id: generateId(),
    entityKind: input.entityKind,
    entityId: input.entityId,
    verdict: input.verdict,
    content: input.content,
    gapNote: input.gapNote ?? null,
    actor: input.actor,
    createdAt: now(),
  };
  withTransaction(deps.db, () => {
    repos.reviews.appendReview(review);
  });
  return review;
}
