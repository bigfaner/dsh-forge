// goal-finalize（plugin-spec-roadmaps 1.5，code-design §4 模块Ⓓ）——Goal 终审动词
// （human-only）：终审确认（awaiting_confirmation → completed）与人工驳回
//（awaiting_confirmation → in_progress，note 必填）。
// human-only 守卫单点 = assertHumanActor（终审动词仅经对话 tool 径 / UI 径两合法入口——
// agent 会话自动终审禁止 = 工具 description 显式声明 + skill 面纪律）；
// completed 边仅本动词可写（机检锚 tests/structure/goal-human-only.test.ts：
// goal_status 含 completed 的 UPDATE 全包仅本文件）。
// 合法边判定真源 = goalMachine 边表（status-machine.md §4 映射 #2——assert 薄委托，
// typed Error 直译 ERR_SPEC_GOAL_ILLEGAL_TRANSITION 携 from/to）。
import { withTransaction } from "@dsh-forge/lib-db";
import type { TransitionActor } from "../../db/row-types.js";
import { goalMachine } from "../status-machines.js";
import { SpecError } from "./errors.js";
import { locateGoal, type GoalVerbDeps } from "./goal-advance.js";

/** 终审决策值域（确认达成 / 驳回退回——note 区分径）。 */
export type GoalFinalizeDecision = "completed" | "rejected";

/** human-only 守卫单点（Ⓓ/⒞-2 消费同函数——actor 值域 = 用户动作通道两值）。 */
export function assertHumanActor(actor: TransitionActor): void {
  if (actor !== "plugin-tool" && actor !== "ui") {
    throw new SpecError("ERR_SPEC_ACTOR_INVALID", `非法动作者通道：${actor}`, { actor });
  }
}

export interface FinalizeGoalInput {
  readonly projectKey: string;
  readonly specSlug: string;
  readonly goalId: string;
  readonly decision: GoalFinalizeDecision;
  /** 驳回必填理由（completed 可空——终审审计留痕可附注） */
  readonly note?: string;
  readonly actor: TransitionActor;
}

export interface FinalizedGoal {
  readonly goalId: string;
  readonly from: string;
  readonly to: string;
  readonly decision: GoalFinalizeDecision;
  readonly note: string | null;
  readonly actor: TransitionActor;
}

/**
 * 终审动词（单事务两写：goal_status UPDATE + 统一台账 append——驳回行 note 强制非空，
 * completed 行 actor = 终审审计锚）。
 */
export function finalizeGoal(deps: GoalVerbDeps, input: FinalizeGoalInput): FinalizedGoal {
  assertHumanActor(input.actor);
  const { repos } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? (() => crypto.randomUUID());
  const spec = repos.specs.getBySlug(input.projectKey, input.specSlug);
  if (spec === undefined) {
    throw new SpecError("ERR_SPEC_NOT_FOUND", `spec 不存在：${input.specSlug}`, { slug: input.specSlug });
  }
  const goal = locateGoal(repos, spec, input.goalId);
  const to = input.decision === "completed" ? "completed" : "in_progress";
  // 合法边判定单源 goalMachine（非法边 → typed ILLEGAL_TRANSITION 携 from/to）
  try {
    goalMachine.assertTransition(goal.goalStatus, to);
  } catch {
    throw new SpecError(
      "ERR_SPEC_GOAL_ILLEGAL_TRANSITION",
      `非法 Goal 状态流转：${goal.goalStatus} → ${to}`,
      { fromStatus: goal.goalStatus, toStatus: to },
    );
  }
  // note 必填守卫（驳回支——edgeMeta noteRequired 数据化边的同因 typed 拒绝）
  if (input.decision === "rejected" && (!input.note || !input.note.trim())) {
    throw new SpecError("ERR_SPEC_GOAL_REJECT_NOTE_REQUIRED", "终审驳回必须附理由（note 必填）", {
      goalId: input.goalId,
    });
  }
  const ts = now();
  withTransaction(deps.db, () => {
    repos.specs.updateGoalStatus(goal.id, to, ts);
    repos.transitions.appendTransition({
      id: generateId(),
      entityKind: "goal",
      entityId: goal.id,
      fromStatus: goal.goalStatus,
      toStatus: to,
      note: input.note ?? null,
      actor: input.actor,
      createdAt: ts,
    });
    // Spec 级链式收口（code-design §3 第 6 步机械段二）：completed 写点 = 「Goals 全
    // completed」边沿的唯一制造者——事务尾同判：全 completed ∧ spec 现值 in_progress →
    // 同事务追加 spec awaiting_acceptance 两写（与 Goal 终审原子收口，零轮询）。
    if (input.decision === "completed") {
      const statuses = repos.specs.listGoalsBySpec(spec.id).map((g) => g.goalStatus);
      const specNow = repos.specs.getBySlug(input.projectKey, input.specSlug);
      if (statuses.every((s) => s === "completed") && specNow !== undefined && specNow.specStatus === "in_progress") {
        repos.specs.updateStatus(specNow.id, "awaiting_acceptance", ts);
        repos.transitions.appendTransition({
          id: generateId(),
          entityKind: "spec",
          entityId: specNow.id,
          fromStatus: specNow.specStatus,
          toStatus: "awaiting_acceptance",
          note: null,
          actor: input.actor,
          createdAt: ts,
        });
      }
    }
  });
  return {
    goalId: goal.id,
    from: goal.goalStatus,
    to,
    decision: input.decision,
    note: input.note ?? null,
    actor: input.actor,
  };
}
