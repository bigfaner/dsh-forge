// transition_spec tool（plugin-spec 1.4——状态流转薄封装：六态 specMachine
// （draft → awaiting_approval → approved → in_progress → awaiting_acceptance → completed
// 单向链 + 驳回/退回支）；边表守卫与台账两写单一事实源 = forgeSpecs 服务层 transitionSpec。
// actor 通道 = plugin-tool（对话 tool 径即用户动作；completed human-only 纪律由工具
// description 显式声明 + 服务层 actor 守卫）。
import {
  callToolFace,
  formatFailure,
  formatOk,
  isForgeToolFailure,
  optionalEnum,
  optionalString,
  requireArgsObject,
  requiredEnum,
  requiredString,
  withFailureVariant,
} from "@dsh-forge/lib-api";
import { SPEC_STATUSES, type SpecRow, type SpecStatus } from "../db/row-types.js";
import { SPEC_STATES } from "../domain/status-machines.js";
import type { ForgeSpecsService } from "../domain/specs/service.js";
import { requireSessionCwd, type SpecToolDefinition, type SpecToolExecFace } from "./faces.js";
import { specSnapshotLines } from "./create-spec.js";

const TOOL = "transition_spec";

/** 合法边描述（specMachine 边表单源展开——targets/edges → 人读 'from→to' 列 + 边元数据标注） */
const SPEC_TRANSITION_EDGES_DESC = SPEC_STATUSES.flatMap((from) => {
  const def = SPEC_STATES.states[from];
  return def.targets.map((to) => {
    const edges = "edges" in def
      ? (def.edges as Partial<Record<SpecStatus, { humanOnly?: boolean; noteRequired?: boolean }>>)
      : undefined;
    const meta = edges?.[to];
    const tag = meta?.humanOnly
      ? " (human-only — only on explicit user instruction)"
      : meta?.noteRequired
        ? " (note required)"
        : "";
    return `${from}→${to}${tag}`;
  });
}).join(", ");

const TRANSITION_SPEC_PARAMETERS = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Spec slug." },
    to: { type: "string", description: `Target status: ${SPEC_STATUSES.join(" | ")}. Legal edges: ${SPEC_TRANSITION_EDGES_DESC}.` },
    note: { type: "string", description: "Transition note; REQUIRED on rejection (awaiting_approval → draft) and return (awaiting_acceptance → in_progress)." },
    actor: { type: "string", description: "Actor channel: plugin-tool (conversation tool call, user action) or ui. Agent sessions must never auto-complete." },
  },
  required: ["slug", "to"],
} as const;

/** tool 定义工厂（状态流转薄封装） */
export function createTransitionSpecTool(deps: { readonly specs: ForgeSpecsService }): SpecToolDefinition {
  return {
    name: TOOL,
    description:
      `Transition a spec along its state machine (legal edges: ${SPEC_TRANSITION_EDGES_DESC}). completed is human-only — call it only on an explicit user decision; rejection (awaiting_approval → draft) and return (awaiting_acceptance → in_progress) require a note. The transition is written atomically with its ledger entry.`,
    parameters: TRANSITION_SPEC_PARAMETERS,
    output: {
      schema: withFailureVariant({
        type: "object",
        additionalProperties: false,
        properties: {
          spec: { type: "object", description: "Transitioned spec snapshot row (new status)." },
        },
        required: ["spec"],
      }),
      render(_args, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { spec: SpecRow };
        return formatOk(`spec transitioned: ${v.spec.slug} → [${v.spec.specStatus}]`, specSnapshotLines(v.spec));
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace): Promise<unknown> {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        const slug = requiredString(a, "slug", TOOL);
        const to = requiredEnum<SpecStatus>(a, "to", SPEC_STATUSES, TOOL);
        const note = optionalString(a, "note", TOOL);
        const actor = optionalEnum<"plugin-tool" | "ui">(a, "actor", ["plugin-tool", "ui"], TOOL) ?? "plugin-tool";
        const spec = deps.specs.transitionSpec({
          cwd: requireSessionCwd(exec),
          slug,
          to,
          ...(note !== undefined ? { note } : {}),
          actor,
        });
        return { spec };
      });
    },
  }
}
