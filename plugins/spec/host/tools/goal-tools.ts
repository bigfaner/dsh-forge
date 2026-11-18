// 终审/复核/诊断族 tools（plugin-spec-roadmaps 1.8，tools.md §一 Spec 生命周期增量 +
// Goal 族 + 复核族 + 诊断族）——薄封装：域逻辑单一事实源 = tool-service 组合根
// （spec-lifecycle/goal-finalize/goal-review/spec-stats 动词零域重复）。
// 入参纪律：寻径 = slug + goal_seq（goal 不重排 seq 稳定）；零 projectKey / 零 actor
//（对话 tool 径 = plugin-tool 注入——human-only 边由服务层守卫 + description 声明）。
import {
  callToolFace,
  formatFailure,
  formatOk,
  isForgeToolFailure,
  optionalString,
  requireArgsObject,
  requiredEnum,
  requiredString,
  ToolArgsError,
  withFailureVariant,
} from "@dsh-forge/lib-api";
import type { ReviewRow } from "../db/row-types.js";
import type { ForgeToolServices } from "../domain/specs/tool-service.js";
import { requireSessionCwd, type SpecToolDefinition, type SpecToolExecFace } from "./faces.js";
import { optionalStringField, requiredPositiveInteger } from "./parse-fields.js";

// ── accept_spec（human-only）──

export function createAcceptSpecTool(verbs: ForgeToolServices): SpecToolDefinition {
  const TOOL = "accept_spec";
  return {
    name: TOOL,
    description:
      "Human-only spec acceptance: decision='completed' confirms (awaiting_acceptance → completed), decision='return' sends back (→ in_progress; note REQUIRED). Call only on an explicit user decision — the machine never completes a spec on its own; approved→in_progress is an internal mechanical edge with no tool. Chain edge: when the linked milestone's specs are all completed it moves to awaiting_acceptance atomically.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Spec slug." },
        decision: { type: "string", description: "completed | return." },
        note: { type: "string", description: "Required for return (acceptance rejection reason)." },
      },
      required: ["slug", "decision"],
    },
    output: {
      schema: withFailureVariant({ type: "object", additionalProperties: false, properties: { spec: { type: "object", description: "Spec snapshot row after the acceptance." } }, required: ["spec"] }),
      render(_a, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { spec: { slug: string; specStatus: string } };
        return formatOk(`spec accepted: ${v.spec.slug} [${v.spec.specStatus}]`, [`- slug: ${v.spec.slug}`, `- status: ${v.spec.specStatus}`]);
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace) {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        const result = verbs.acceptSpec({
          cwd: requireSessionCwd(exec),
          slug: requiredString(a, "slug", TOOL),
          decision: requiredEnum<"completed" | "return">(a, "decision", ["completed", "return"], TOOL),
          ...(optionalString(a, "note", TOOL) !== undefined ? { note: optionalString(a, "note", TOOL)! } : {}),
        });
        return { spec: result.spec };
      });
    },
  };
}

// ── finalize_goal（human-only）──

export function createFinalizeGoalTool(verbs: ForgeToolServices): SpecToolDefinition {
  const TOOL = "finalize_goal";
  return {
    name: TOOL,
    description:
      "Human-only Goal finalization: decision='completed' confirms achievement (awaiting_confirmation → completed), decision='rejected' sends back (→ in_progress; note REQUIRED). Call only on an explicit user decision — agent sessions must never auto-complete a goal. Chain edge: when all goals of the spec are completed the spec moves to awaiting_acceptance atomically.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Spec slug." },
        goal_seq: { type: "number", description: "Goal seq (1-based presentation order — stable, goals are never reordered)." },
        decision: { type: "string", description: "completed | rejected." },
        note: { type: "string", description: "Required for rejected." },
      },
      required: ["slug", "goal_seq", "decision"],
    },
    output: {
      schema: withFailureVariant({ type: "object", additionalProperties: false, properties: { goal: { type: "object", description: "Goal row after the finalization (goalId/goalSeq/goalStatus)." } }, required: ["goal"] }),
      render(_a, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { goal: { goalSeq: number; title: string; goalStatus: string } };
        return formatOk(`goal finalized: #${String(v.goal.goalSeq)} ${v.goal.title} [${v.goal.goalStatus}]`, [`- status: ${v.goal.goalStatus}`]);
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace) {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        const result = verbs.finalizeGoal({
          cwd: requireSessionCwd(exec),
          slug: requiredString(a, "slug", TOOL),
          goalSeq: requiredPositiveInteger(a, "goal_seq"),
          decision: requiredEnum<"completed" | "rejected">(a, "decision", ["completed", "rejected"], TOOL),
          ...(optionalString(a, "note", TOOL) !== undefined ? { note: optionalString(a, "note", TOOL)! } : {}),
        });
        return { goal: result.goal };
      });
    },
  };
}

// ── review_goal（复核 agent）──

export function createReviewGoalTool(verbs: ForgeToolServices): SpecToolDefinition {
  const TOOL = "review_goal";
  return {
    name: TOOL,
    description:
      "Submit a Goal review report and drive the state machine (writer = review agent; humans never fill this): verdict='passed' advances auto_reviewing → awaiting_confirmation; verdict='failed' reverts to in_progress (gap_note REQUIRED — one-line gap localization). Precondition: the goal must be in auto_reviewing.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Spec slug." },
        goal_seq: { type: "number", description: "Goal seq (1-based presentation order)." },
        verdict: { type: "string", description: "passed | failed." },
        content: { type: "string", description: "Review report body (AC-projection comparison, append-only)." },
        gap_note: { type: "string", description: "Required when failed." },
      },
      required: ["slug", "goal_seq", "verdict", "content"],
    },
    output: {
      schema: withFailureVariant({
        type: "object",
        additionalProperties: false,
        properties: {
          review: { type: "object", description: "Review report row (append-only)." },
          goal: { type: "object", description: "Goal row after the review-driven transition." },
        },
        required: ["review", "goal"],
      }),
      render(_a, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { review: ReviewRow; goal: { goalSeq: number; goalStatus: string } };
        return formatOk(
          `goal reviewed: #${String(v.goal.goalSeq)} verdict=${v.review.verdict} → [${v.goal.goalStatus}]`,
          [`- verdict: ${v.review.verdict}`, `- status: ${v.goal.goalStatus}`],
        );
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace) {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        const result = verbs.reviewGoal({
          cwd: requireSessionCwd(exec),
          slug: requiredString(a, "slug", TOOL),
          goalSeq: requiredPositiveInteger(a, "goal_seq"),
          verdict: requiredEnum<"passed" | "failed">(a, "verdict", ["passed", "failed"], TOOL),
          content: requiredString(a, "content", TOOL),
          gapNote: optionalStringField(a, "gap_note"),
        });
        return { review: result.review, goal: result.goal };
      });
    },
  };
}

// ── review_objective（验收预检 agent）──

export function createReviewObjectiveTool(verbs: ForgeToolServices): SpecToolDefinition {
  const TOOL = "review_objective";
  return {
    name: TOOL,
    description:
      "Submit a Milestone/Roadmap pre-acceptance review report (writer = pre-check agent). The report is stored for the human acceptance reference — passed does NOT change status; the human completes the state via transition_milestone / transition_roadmap (human-only edges). No status precondition.",
    parameters: {
      type: "object",
      properties: {
        target_kind: { type: "string", description: "milestone | roadmap." },
        roadmap_slug: { type: "string", description: "Parent roadmap slug." },
        milestone_id: { type: "string", description: "Milestone id (required for the milestone target kind; omitted for roadmap)." },
        verdict: { type: "string", description: "passed | failed." },
        content: { type: "string", description: "Review report body." },
        gap_note: { type: "string", description: "Required when failed." },
      },
      required: ["target_kind", "roadmap_slug", "verdict", "content"],
    },
    output: {
      schema: withFailureVariant({ type: "object", additionalProperties: false, properties: { review: { type: "object", description: "Review report row (append-only)." } }, required: ["review"] }),
      render(_a, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { review: ReviewRow };
        return formatOk(`objective review recorded: ${v.review.entityKind} verdict=${v.review.verdict}`, [
          `- verdict: ${v.review.verdict}`,
          ...(v.review.gapNote !== null ? [`- gap: ${v.review.gapNote}`] : []),
        ]);
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace) {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        const targetKind = requiredEnum<"milestone" | "roadmap">(a, "target_kind", ["milestone", "roadmap"], TOOL);
        if (targetKind === "milestone" && optionalStringField(a, "milestone_id") === undefined) {
          throw new ToolArgsError(`${TOOL}: milestone_id is required when target_kind = milestone`);
        }
        return {
          review: verbs.reviewObjective({
            cwd: requireSessionCwd(exec),
            targetKind,
            roadmapSlug: requiredString(a, "roadmap_slug", TOOL),
            milestoneId: optionalStringField(a, "milestone_id"),
            verdict: requiredEnum<"passed" | "failed">(a, "verdict", ["passed", "failed"], TOOL),
            content: requiredString(a, "content", TOOL),
            gapNote: optionalStringField(a, "gap_note"),
          }),
        };
      });
    },
  };
}

// ── spec_stats（诊断）──

export function createSpecStatsTool(verbs: ForgeToolServices): SpecToolDefinition {
  const TOOL = "spec_stats";
  return {
    name: TOOL,
    description:
      "Spec domain milestone diagnostics: spec/goal/AC counts, goal status distribution and live AC projection distribution (no-task-data when the task-loop service is absent). Diagnoses via diag too — no new storage.",
    parameters: { type: "object", properties: {} },
    output: {
      schema: withFailureVariant({
        type: "object",
        additionalProperties: false,
        properties: {
          specCount: { type: "number", description: "Spec count." },
          goalCount: { type: "number", description: "Goal count." },
          acCount: { type: "number", description: "AC count." },
          goalStatusCounts: { type: "object", description: "Goal status → count." },
          projectionStateCounts: { type: "object", description: "AC projection state → count (met/unmet/unmatched/no-task-data)." },
        },
        required: ["specCount", "goalCount", "acCount", "goalStatusCounts", "projectionStateCounts"],
      }),
      render(_a, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { specCount: number; goalCount: number; acCount: number; goalStatusCounts: Record<string, number>; projectionStateCounts: Record<string, number> };
        return formatOk(
          `spec stats: ${String(v.specCount)} specs / ${String(v.goalCount)} goals / ${String(v.acCount)} ACs`,
          [
            `- goals: ${Object.entries(v.goalStatusCounts).map(([k, n]) => `${k}:${String(n)}`).join(", ")}`,
            `- projection: ${Object.entries(v.projectionStateCounts).map(([k, n]) => `${k}:${String(n)}`).join(", ")}`,
          ],
        );
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace) {
      return callToolFace(async () => {
        requireArgsObject(args, TOOL);
        return verbs.specStats({ cwd: requireSessionCwd(exec) });
      });
    },
  };
}
