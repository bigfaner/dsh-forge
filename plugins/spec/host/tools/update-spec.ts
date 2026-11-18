// update_spec / replace_spec_goals tools（plugin-spec 1.4——updateSpec 族薄封装：
// 字段改写 + Goal/AC 全集批量增改，域逻辑单一事实源 = forgeSpecs 服务层守卫族；
// 本文件只做入参防御收窄 + 双友好返回面投影）。
import {
  callToolFace,
  formatFailure,
  formatOk,
  isForgeToolFailure,
  optionalStringArray,
  requireArgsObject,
  requiredString,
  withFailureVariant,
} from "@dsh-forge/lib-api";
import type { SpecRow } from "../db/row-types.js";
import type { ForgeSpecsService } from "../domain/specs/service.js";
import { requireSessionCwd, type SpecToolDefinition, type SpecToolExecFace } from "./faces.js";
import { parseGoals } from "./parse.js";
import { specSnapshotLines } from "./create-spec.js";

const UPDATE_TOOL = "update_spec";
const REPLACE_GOALS_TOOL = "replace_spec_goals";

const UPDATE_SPEC_PARAMETERS = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Spec slug." },
    title: { type: "string", description: "New title (optional)." },
    tiers: { type: "array", items: { type: "string" }, description: "New delivery tiers (optional; closed set ui | api | pure-logic | docs)." },
    doc_path: { type: "string", description: "New spec doc registration path (optional; old doc file is kept)." },
  },
  required: ["slug"],
} as const;

const REPLACE_GOALS_PARAMETERS = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Spec slug." },
    goals: {
      type: "array",
      items: { type: "object" },
      description: "Full replacement Goal set with ACs: [{title, brief?, acs: [...]}]. Goals must not be empty (delete-to-zero is rejected).",
    },
  },
  required: ["slug", "goals"],
} as const;

function snapshotOutputSchema(headline: string) {
  return withFailureVariant({
    type: "object",
    additionalProperties: false,
    properties: {
      spec: { type: "object", description: headline },
    },
    required: ["spec"],
  })
}

/** tool 定义工厂（updateSpec 字段改写薄封装） */
export function createUpdateSpecTool(deps: { readonly specs: ForgeSpecsService }): SpecToolDefinition {
  return {
    name: UPDATE_TOOL,
    description:
      "Update spec fields (title / tiers / doc registration path). Rejected when the spec is completed (frozen snapshot) or the doc path collides with another spec.",
    parameters: UPDATE_SPEC_PARAMETERS,
    output: {
      schema: snapshotOutputSchema("Updated spec snapshot row."),
      render(_args, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { spec: SpecRow };
        return formatOk(`spec updated: ${v.spec.slug} [${v.spec.specStatus}]`, specSnapshotLines(v.spec));
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace): Promise<unknown> {
      return callToolFace(async () => {
        const a = requireArgsObject(args, UPDATE_TOOL);
        const slug = requiredString(a, "slug", UPDATE_TOOL);
        const title = typeof a["title"] === "string" && a["title"] !== "" ? (a["title"] as string) : undefined;
        const tiers = optionalStringArray(a, "tiers", UPDATE_TOOL);
        const docPath = typeof a["doc_path"] === "string" && a["doc_path"] !== "" ? (a["doc_path"] as string) : undefined;
        const spec = deps.specs.updateSpec({
          cwd: requireSessionCwd(exec),
          slug,
          ...(title !== undefined ? { title } : {}),
          ...(tiers !== undefined ? { tiers } : {}),
          ...(docPath !== undefined ? { docRelPath: docPath } : {}),
        });
        return { spec };
      });
    },
  }
}

/** tool 定义工厂（Goal/AC 全集批量增改薄封装——必含 Goal 不变式服务层单点守卫） */
export function createReplaceSpecGoalsTool(deps: { readonly specs: ForgeSpecsService }): SpecToolDefinition {
  return {
    name: REPLACE_GOALS_TOOL,
    description:
      "Replace the full Goal + AC set of a spec in one atomic call (delete-and-reinsert under a single transaction). Goal set must not be empty; completed specs are frozen.",
    parameters: REPLACE_GOALS_PARAMETERS,
    output: {
      schema: snapshotOutputSchema("Updated spec snapshot row (goals replaced)."),
      render(_args, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { spec: SpecRow };
        return formatOk(`spec goals replaced: ${v.spec.slug} [${v.spec.specStatus}]`, specSnapshotLines(v.spec));
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace): Promise<unknown> {
      return callToolFace(async () => {
        const a = requireArgsObject(args, REPLACE_GOALS_TOOL);
        const slug = requiredString(a, "slug", REPLACE_GOALS_TOOL);
        const goals = parseGoals(a, REPLACE_GOALS_TOOL);
        const spec = deps.specs.replaceGoals({
          cwd: requireSessionCwd(exec),
          slug,
          goals,
        });
        return { spec };
      });
    },
  }
}
