// transition_spec tool（plugin-spec 1.4——状态流转薄封装：draft → under-review → accepted
// （human-only）→ archived 单向链 + under-review → draft 驳回支；边表守卫与台账两写
// 单一事实源 = forgeSpecs 服务层 transitionSpec。actor 通道 = plugin-tool（对话 tool 径
// 即用户动作；accepted human-only 纪律由工具 description 显式声明 + 服务层 actor 守卫）。
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
import type { SpecRow, SpecStatus } from "../db/row-types.js";
import type { ForgeSpecsService } from "../domain/specs/service.js";
import { SPEC_TRANSITION_EDGES } from "../domain/specs/guards.js";
import { requireSessionCwd, type SpecToolDefinition, type SpecToolExecFace } from "./faces.js";
import { specSnapshotLines } from "./create-spec.js";

const TOOL = "transition_spec";

const SPEC_STATUSES: readonly SpecStatus[] = ["draft", "under-review", "accepted", "archived"];

/** 合法边描述（服务层边表单源展开——'from->to' 集 → 人读 'from→to' 列） */
const SPEC_TRANSITION_EDGES_DESC = [...SPEC_TRANSITION_EDGES].map((e) => e.replace("->", "→")).join(", ");

const TRANSITION_SPEC_PARAMETERS = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Spec slug." },
    to: { type: "string", description: "Target status: draft | under-review | accepted | archived. Legal edges: draft→under-review, under-review→accepted (human-only — only on explicit user instruction), under-review→draft (rejection, note required), accepted→archived." },
    note: { type: "string", description: "Transition note; REQUIRED when rejecting (under-review → draft)." },
    actor: { type: "string", description: "Actor channel: plugin-tool (conversation tool call, user action) or ui. Agent sessions must never auto-accept." },
  },
  required: ["slug", "to"],
} as const;

/** tool 定义工厂（状态流转薄封装） */
export function createTransitionSpecTool(deps: { readonly specs: ForgeSpecsService }): SpecToolDefinition {
  return {
    name: TOOL,
    description:
      `Transition a spec along its state machine (legal edges: ${SPEC_TRANSITION_EDGES_DESC}). accepted is human-only — call it only on an explicit user decision; rejection (under-review → draft) requires a note. The transition is written atomically with its ledger entry.`,
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
