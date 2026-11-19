// milestone 族 tools（plugin-spec-roadmaps 1.8，tools.md §一 Milestone 族逐行）——薄封装：
// 域逻辑单一事实源 = tool-service 组合根（milestone-service/objective-lifecycle 动词零域
// 重复）。入参纪律：寻径 = roadmap_slug + milestone_id（id = UUID 稳定锚）；move 互斥锚
// before/after 二选一；零 projectKey / 零 actor。
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
import type { MilestoneRow, ObjectiveStatus } from "../db/row-types.js";
import { MILESTONE_STATES, OBJECTIVE_STATUSES } from "../domain/status-machines.js";
import type { ForgeToolServices } from "../domain/specs/tool-service.js";
import { requireSessionCwd, type SpecToolDefinition, type SpecToolExecFace } from "./faces.js";
import { optionalAcEntries, optionalStringArrayField, optionalStringField } from "./parse-fields.js";

/** 合法边描述（milestoneMachine 边表单源展开）。 */
const EDGE_DESC = OBJECTIVE_STATUSES.flatMap((from) => {
  const def = MILESTONE_STATES.states[from];
  const edges = "edges" in def ? (def.edges as Partial<Record<ObjectiveStatus, { humanOnly?: boolean; noteRequired?: boolean }>>) : undefined;
  return def.targets.map((to) => {
    const meta = edges?.[to];
    const tag = meta?.humanOnly ? " (human-only — only on explicit user acceptance)" : meta?.noteRequired ? " (note required)" : "";
    return `${from}→${to}${tag}`;
  });
}).join(", ");

function requireMilestoneId(a: Record<string, unknown>, tool: string): string {
  return requiredString(a, "milestone_id", tool);
}

// ── create_milestone ──

export function createCreateMilestoneTool(verbs: ForgeToolServices): SpecToolDefinition {
  const TOOL = "create_milestone";
  return {
    name: TOOL,
    description:
      "Create a milestone under a roadmap: seq is assigned server-side (returned in the snapshot — address it by milestone_id afterwards). Module AC entries (ac_json) may point back to roadmap AC entry ids via address. The first milestone starts in_progress immediately.",
    parameters: {
      type: "object",
      properties: {
        roadmap_slug: { type: "string", description: "Parent roadmap slug." },
        title: { type: "string", description: "Milestone title." },
        brief: { type: "string", description: "Optional brief." },
        ac_json: { type: "array", items: { type: "object" }, description: "Optional module AC entries: [{criterion, address?, id?}] (address = roadmap AC entry id)." },
      },
      required: ["roadmap_slug", "title"],
    },
    output: {
      schema: withFailureVariant({ type: "object", additionalProperties: false, properties: { milestone: { type: "object", description: "Milestone snapshot row (milestoneId + seq always carried)." } }, required: ["milestone"] }),
      render(_a, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { milestone: MilestoneRow };
        return formatOk(`milestone created: #${v.milestone.seq} ${v.milestone.title} [${v.milestone.milestoneStatus}]`, milestoneLines(v.milestone));
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace) {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        const acEntries = optionalAcEntries(a, TOOL);
        return {
          milestone: verbs.createMilestone({
            cwd: requireSessionCwd(exec),
            roadmapSlug: requiredString(a, "roadmap_slug", TOOL),
            title: requiredString(a, "title", TOOL),
            ...(optionalStringField(a, "brief") !== undefined ? { brief: optionalStringField(a, "brief")! } : {}),
            ...(acEntries !== undefined ? { acEntries } : {}),
          }),
        };
      });
    },
  };
}

// ── update_milestone ──

export function createUpdateMilestoneTool(verbs: ForgeToolServices): SpecToolDefinition {
  const TOOL = "update_milestone";
  return {
    name: TOOL,
    description: "Update milestone fields (title / brief / ac_json full replacement; address validation same gate as create). Path resolution = roadmap_slug + milestone_id.",
    parameters: {
      type: "object",
      properties: {
        roadmap_slug: { type: "string", description: "Parent roadmap slug." },
        milestone_id: { type: "string", description: "Milestone id (UUID anchor — stable across reordering/renames)." },
        title: { type: "string", description: "New title (optional)." },
        brief: { type: "string", description: "New brief (optional)." },
        ac_json: { type: "array", items: { type: "object" }, description: "Full AC replacement: [{criterion, address?, id?}] (optional)." },
      },
      required: ["roadmap_slug", "milestone_id"],
    },
    output: {
      schema: withFailureVariant({ type: "object", additionalProperties: false, properties: { milestone: { type: "object", description: "Updated milestone snapshot row." } }, required: ["milestone"] }),
      render(_a, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { milestone: MilestoneRow };
        return formatOk(`milestone updated: #${v.milestone.seq} ${v.milestone.title} [${v.milestone.milestoneStatus}]`, milestoneLines(v.milestone));
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace) {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        const acEntries = optionalAcEntries(a, TOOL);
        return {
          milestone: verbs.updateMilestone({
            cwd: requireSessionCwd(exec),
            roadmapSlug: requiredString(a, "roadmap_slug", TOOL),
            milestoneId: requireMilestoneId(a, TOOL),
            ...(optionalStringField(a, "title") !== undefined ? { title: optionalStringField(a, "title")! } : {}),
            ...(optionalStringField(a, "brief") !== undefined ? { brief: optionalStringField(a, "brief")! } : {}),
            ...(acEntries !== undefined ? { acEntries } : {}),
          }),
        };
      });
    },
  };
}

// ── move_milestone ──

export function createMoveMilestoneTool(verbs: ForgeToolServices): SpecToolDefinition {
  const TOOL = "move_milestone";
  return {
    name: TOOL,
    description:
      "Move a milestone to a relative position: give exactly one of before / after (a sibling milestone_id) — everything else shifts automatically. Full new order is returned (zero re-query).",
    parameters: {
      type: "object",
      properties: {
        roadmap_slug: { type: "string", description: "Parent roadmap slug." },
        milestone_id: { type: "string", description: "Milestone to move." },
        before: { type: "string", description: "Insert before this milestone_id (mutually exclusive with after)." },
        after: { type: "string", description: "Insert after this milestone_id (mutually exclusive with before)." },
      },
      required: ["roadmap_slug", "milestone_id"],
    },
    output: {
      schema: withFailureVariant({ type: "object", additionalProperties: false, properties: { order: { type: "array", items: { type: "object" }, description: "Full new order: [{id, seq}]." } }, required: ["order"] }),
      render(_a, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { order: ReadonlyArray<{ id: string; seq: number }> };
        return formatOk(`milestone moved (${v.order.length} in roadmap)`, v.order.map((o) => `- #${o.seq} ${o.id}`));
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace) {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        const before = optionalStringField(a, "before");
        const after = optionalStringField(a, "after");
        if ((before !== undefined ? 1 : 0) + (after !== undefined ? 1 : 0) !== 1) {
          throw new ToolArgsError(`${TOOL}: exactly one of before / after is required`);
        }
        const result = verbs.moveMilestone({
          cwd: requireSessionCwd(exec),
          roadmapSlug: requiredString(a, "roadmap_slug", TOOL),
          milestoneId: requireMilestoneId(a, TOOL),
          before,
          after,
        });
        return { order: result.assignments };
      });
    },
  };
}

// ── transition_milestone ──

export function createTransitionMilestoneTool(verbs: ForgeToolServices): SpecToolDefinition {
  const TOOL = "transition_milestone";
  return {
    name: TOOL,
    description:
      `Transition a milestone along its state machine (legal edges: ${EDGE_DESC}). awaiting_acceptance→completed is human-only — call it only on an explicit user acceptance decision; the return edge (awaiting_acceptance→in_progress) requires a note. Chain edges (next milestone start / roadmap awaiting_acceptance) fire atomically in the same transaction. Actor is fixed to the conversation tool channel.`,
    parameters: {
      type: "object",
      properties: {
        roadmap_slug: { type: "string", description: "Parent roadmap slug." },
        milestone_id: { type: "string", description: "Milestone id." },
        to: { type: "string", description: `Target status: ${OBJECTIVE_STATUSES.join(" | ")}. Legal edges: ${EDGE_DESC}.` },
        note: { type: "string", description: "Transition note; REQUIRED on the return edge (awaiting_acceptance → in_progress)." },
      },
      required: ["roadmap_slug", "milestone_id", "to"],
    },
    output: {
      schema: withFailureVariant({
        type: "object",
        additionalProperties: false,
        properties: {
          milestone: { type: "object", description: "Transitioned milestone snapshot row." },
          edgeWrites: { type: "array", items: { type: "object" }, description: "Chain edge writes fired in the same transaction (empty when none)." },
        },
        required: ["milestone"],
      }),
      render(_a, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { milestone: MilestoneRow; edgeWrites?: readonly unknown[] };
        return formatOk(
          `milestone transitioned: #${v.milestone.seq} ${v.milestone.title} → [${v.milestone.milestoneStatus}]`,
          [
            ...milestoneLines(v.milestone),
            ...(v.edgeWrites !== undefined && v.edgeWrites.length > 0 ? [`- chain writes: ${v.edgeWrites.length}`] : []),
          ],
        );
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace) {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        const result = verbs.transitionMilestone({
          cwd: requireSessionCwd(exec),
          roadmapSlug: requiredString(a, "roadmap_slug", TOOL),
          milestoneId: requireMilestoneId(a, TOOL),
          to: requiredEnum<ObjectiveStatus>(a, "to", OBJECTIVE_STATUSES, TOOL),
          ...(optionalString(a, "note", TOOL) !== undefined ? { note: optionalString(a, "note", TOOL)! } : {}),
        });
        return { milestone: result.milestone, edgeWrites: result.edgeWrites };
      });
    },
  };
}

// ── query_milestone ──

export function createQueryMilestoneTool(verbs: ForgeToolServices): SpecToolDefinition {
  const TOOL = "query_milestone";
  return {
    name: TOOL,
    description:
      "Query one milestone: snapshot (milestoneId always carried). include=['specs'] adds the linked spec cards (slug/status/goalCount); include=['achievement'] adds the derived achievement (all linked specs completed?).",
    parameters: {
      type: "object",
      properties: {
        roadmap_slug: { type: "string", description: "Parent roadmap slug." },
        milestone_id: { type: "string", description: "Milestone id." },
        include: { type: "array", items: { type: "string" }, description: "Optional expansions, closed set: specs | achievement. Unknown values are rejected." },
      },
      required: ["roadmap_slug", "milestone_id"],
    },
    output: {
      schema: withFailureVariant({
        type: "object",
        additionalProperties: false,
        properties: {
          milestone: { type: "object", description: "Milestone snapshot row." },
          specs: { type: "array", items: { type: "object" }, description: "Linked spec cards (when included)." },
          achievement: { type: "object", description: "Derived achievement (when included): completed/specCount/allCompleted." },
        },
        required: ["milestone"],
      }),
      render(_a, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { milestone: MilestoneRow; specs?: Array<{ spec: { slug: string; specStatus: string } }>; achievement?: { completed: boolean } };
        return formatOk(`milestone #${v.milestone.seq} ${v.milestone.title}`, [
          ...milestoneLines(v.milestone),
          ...(v.specs !== undefined ? v.specs.map((s) => `- spec: ${s.spec.slug} [${s.spec.specStatus}]`) : []),
          ...(v.achievement !== undefined ? [`- achievement: ${v.achievement.completed ? "completed" : "in progress"}`] : []),
        ]);
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace) {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        return verbs.queryMilestone({
          cwd: requireSessionCwd(exec),
          roadmapSlug: requiredString(a, "roadmap_slug", TOOL),
          milestoneId: requireMilestoneId(a, TOOL),
          include: optionalStringArrayField(a, "include"),
        });
      });
    },
  };
}

// ── list_milestones ──

export function createListMilestonesTool(verbs: ForgeToolServices): SpecToolDefinition {
  const TOOL = "list_milestones";
  return {
    name: TOOL,
    description: "List milestones of a roadmap (seq order; ids always carried). Read-only.",
    parameters: {
      type: "object",
      properties: { roadmap_slug: { type: "string", description: "Parent roadmap slug." } },
      required: ["roadmap_slug"],
    },
    output: {
      schema: withFailureVariant({ type: "object", additionalProperties: false, properties: { milestones: { type: "array", items: { type: "object" }, description: "Milestone snapshot rows (seq order)." } }, required: ["milestones"] }),
      render(_a, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { milestones: MilestoneRow[] };
        return formatOk(`${v.milestones.length} milestone(s)`, v.milestones.map((m) => `- #${m.seq} ${m.title} [${m.milestoneStatus}] id=${m.id}`));
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace) {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        return { milestones: verbs.listMilestones({ cwd: requireSessionCwd(exec), roadmapSlug: requiredString(a, "roadmap_slug", TOOL) }) };
      });
    },
  };
}

/** milestone 快照键值行（写动词共用投影——id/seq 恒携带）。 */
export function milestoneLines(milestone: MilestoneRow): string[] {
  return [
    `- id: ${milestone.id}`,
    `- seq: ${String(milestone.seq)}`,
    `- title: ${milestone.title}`,
    `- status: ${milestone.milestoneStatus}`,
    `- ac: ${milestone.acJson.length} entry(ies)`,
  ];
}
