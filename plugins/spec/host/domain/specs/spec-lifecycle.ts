// spec-lifecycle（plugin-spec-roadmaps 1.6，code-design §3b 模块⒞-2）——Spec 六态
// 生命周期机械段一 + human-only 完成确认/验收退回：
//   · startSpecImpl = 机械段一（approved → in_progress）——触发点 = 拆解收尾首个挂链 task
//     派发信号（派发缝回调）；单事务两写，幂等（现值已 in_progress → 零写返回 null）。
//   · acceptSpec = human-only 段——completed（验收确认）/ return（验收退回，note 必填）；
//     completed 写点全包仅本文件（human-only 机检锚 tests/structure/spec-human-only.test.ts）。
// 边沿二链入（§3c）：acceptSpec completed 事务尾判挂链 milestone（现值 in_progress ∧
// 挂链 specs 全 completed）→ 同事务追加 milestone awaiting_acceptance 两写（判定经
// decideObjectiveEdge 单源）。
// 合法边判定真源 = specMachine 边表；actor 守卫单点 = assertHumanActor（goal-finalize 同源）。
import { withTransaction } from "@dsh-forge/lib-db";
import { emitDiagOrFallback, type DiagEventPayload } from "@dsh-forge/lib-diag";
import type { SpecStatus, TransitionActor } from "../../db/row-types.js";
import { specMachine } from "../status-machines.js";
import { SpecError } from "./errors.js";
import { assertHumanActor } from "./goal-finalize.js";
import type { GoalVerbDeps } from "./goal-advance.js";
import { decideObjectiveEdge } from "./objective-edge.js";

type SpecDiagPayload = Omit<DiagEventPayload, "process">;

export interface AcceptSpecInput {
  readonly projectKey: string;
  readonly specSlug: string;
  readonly decision: "completed" | "return";
  /** 验收退回（return）必填理由 */
  readonly note?: string;
  readonly actor: TransitionActor;
  readonly sessionId?: string;
}

export interface StartSpecInput {
  readonly projectKey: string;
  readonly specSlug: string;
  readonly sessionId?: string;
}

export interface SpecLifecycleResult {
  readonly specId: string;
  readonly from: SpecStatus;
  readonly to: SpecStatus;
  /** 边沿二链写（acceptSpec completed 尾追加——undefined = 零链写） */
  readonly milestoneWrite?: { milestoneId: string; from: string; to: string };
}

function diag(deps: GoalVerbDeps, payload: SpecDiagPayload & { sessionId?: string }): void {
  emitDiagOrFallback(deps.onDiag, payload);
}

function locateSpec(deps: GoalVerbDeps, projectKey: string, slug: string) {
  const spec = deps.repos.specs.getBySlug(projectKey, slug);
  if (spec === undefined) {
    throw new SpecError("ERR_SPEC_NOT_FOUND", `spec 不存在：${slug}`, { slug });
  }
  return spec;
}

/**
 * 机械段一：approved → in_progress（派发缝回调单事务两写）。
 * 幂等：现值已 in_progress → 返回 null 零写；其余非法现值 → typed 拒绝。
 */
export function startSpecImpl(deps: GoalVerbDeps, input: StartSpecInput): SpecLifecycleResult | null {
  const { repos } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? (() => crypto.randomUUID());
  const spec = locateSpec(deps, input.projectKey, input.specSlug);
  if (spec.specStatus === "in_progress") return null;
  try {
    specMachine.assertTransition(spec.specStatus, "in_progress");
  } catch {
    throw new SpecError(
      "ERR_SPEC_ILLEGAL_TRANSITION",
      `非法状态流转：${spec.specStatus} → in_progress（机械段一仅 approved 开工）`,
      { fromStatus: spec.specStatus, toStatus: "in_progress" },
    );
  }
  const ts = now();
  withTransaction(deps.db, () => {
    repos.specs.updateStatus(spec.id, "in_progress", ts);
    repos.transitions.appendTransition({
      id: generateId(),
      entityKind: "spec",
      entityId: spec.id,
      fromStatus: spec.specStatus,
      toStatus: "in_progress",
      note: null,
      actor: "plugin-tool",
      createdAt: ts,
    });
  });
  diag(deps, {
    event: "spec-started",
    level: "info",
    message: `Spec 机械段一开工：spec=${input.specSlug} ${spec.specStatus} → in_progress`,
    projectId: input.projectKey,
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
  });
  return { specId: spec.id, from: spec.specStatus, to: "in_progress" };
}

/**
 * human-only 段：验收确认（awaiting_acceptance → completed）/ 验收退回
 *（awaiting_acceptance → in_progress，note 必填）——单事务两写；completed 分支事务尾
 * 链入边沿二（挂链 milestone 待验收推进）。
 */
export function acceptSpec(deps: GoalVerbDeps, input: AcceptSpecInput): SpecLifecycleResult {
  assertHumanActor(input.actor);
  const { repos } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? (() => crypto.randomUUID());
  const spec = locateSpec(deps, input.projectKey, input.specSlug);
  const to: SpecStatus = input.decision === "completed" ? "completed" : "in_progress";
  if (input.decision === "return" && (!input.note || !input.note.trim())) {
    throw new SpecError("ERR_SPEC_REJECT_NOTE_REQUIRED", "验收退回必须附理由（note 必填）", {
      slug: input.specSlug,
    });
  }
  try {
    specMachine.assertTransition(spec.specStatus, to);
  } catch {
    throw new SpecError(
      "ERR_SPEC_ILLEGAL_TRANSITION",
      `非法状态流转：${spec.specStatus} → ${to}（验收确认/退回仅 awaiting_acceptance 起边）`,
      { fromStatus: spec.specStatus, toStatus: to },
    );
  }
  const ts = now();
  let milestoneWrite: SpecLifecycleResult["milestoneWrite"];
  withTransaction(deps.db, () => {
    repos.specs.updateStatus(spec.id, to, ts);
    repos.transitions.appendTransition({
      id: generateId(),
      entityKind: "spec",
      entityId: spec.id,
      fromStatus: spec.specStatus,
      toStatus: to,
      note: input.note ?? null,
      actor: input.actor,
      createdAt: ts,
    });
    // 边沿二（code-design §3c）：completed 写点 = 挂链 milestone「挂链 specs 全 completed」
    // 边沿的制造者——事务内重读判定（N2）：milestone 现值 in_progress ∧ 全挂链 specs
    // completed → 同事务追加 milestone awaiting_acceptance 两写。
    if (input.decision === "completed") {
      const milestoneId = repos.specs.findMilestoneId(spec.id);
      const milestone = milestoneId === null ? undefined : repos.milestones.findById(milestoneId);
      if (milestone !== undefined) {
        const linked = repos.specs.specsByMilestone(milestone.id);
        const allCompleted = linked.length > 0 && linked.every((s) => s.specStatus === "completed");
        if (decideObjectiveEdge(milestone.milestoneStatus, { family: "milestone-accept", subordinatesAllCompleted: allCompleted }) === "advance") {
          repos.milestones.updateStatus(milestone.id, "awaiting_acceptance", ts);
          repos.transitions.appendTransition({
            id: generateId(),
            entityKind: "milestone",
            entityId: milestone.id,
            fromStatus: milestone.milestoneStatus,
            toStatus: "awaiting_acceptance",
            note: null,
            actor: input.actor,
            createdAt: ts,
          });
          milestoneWrite = { milestoneId: milestone.id, from: milestone.milestoneStatus, to: "awaiting_acceptance" };
        }
      }
    }
  });
  diag(deps, {
    event: input.decision === "completed" ? "spec-accepted" : "spec-returned",
    level: "info",
    message:
      input.decision === "completed"
        ? `Spec 验收确认：spec=${input.specSlug} ${spec.specStatus} → completed${milestoneWrite !== undefined ? `（链式收口 milestone=${milestoneWrite.milestoneId} → awaiting_acceptance）` : ""}`
        : `Spec 验收退回：spec=${input.specSlug} ${spec.specStatus} → in_progress（note=${input.note}）`,
    projectId: input.projectKey,
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
  });
  return {
    specId: spec.id,
    from: spec.specStatus,
    to,
    ...(milestoneWrite !== undefined ? { milestoneWrite } : {}),
  };
}
