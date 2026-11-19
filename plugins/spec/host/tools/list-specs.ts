// list_specs tool（plugin-spec 1.4——查询族薄封装：listing 索引序清单；域逻辑单一事实源
// = forgeSpecs 服务层 listSpecs，本文件只做 status_filter 词表收窄 + 双友好返回面投影）。
import {
  callToolFace,
  formatFailure,
  formatOk,
  isForgeToolFailure,
  optionalEnum,
  requireArgsObject,
  withFailureVariant,
} from "@dsh-forge/lib-api";
import { SPEC_STATUSES, type SpecRow, type SpecStatus } from "../db/row-types.js";
import type { ForgeSpecsService } from "../domain/specs/service.js";
import { requireSessionCwd, type SpecToolDefinition, type SpecToolExecFace } from "./faces.js";

const TOOL = "list_specs";

const LIST_SPEC_PARAMETERS = {
  type: "object",
  properties: {
    status_filter: { type: "string", description: `Optional status filter: ${SPEC_STATUSES.join(" | ")}. Omit for all.` },
  },
} as const;

/** tool 定义工厂（清单读面薄封装） */
export function createListSpecsTool(deps: { readonly specs: ForgeSpecsService }): SpecToolDefinition {
  return {
    name: TOOL,
    description:
      "List specs of the current project (listing index order), optionally filtered by status. Read-only.",
    parameters: LIST_SPEC_PARAMETERS,
    output: {
      schema: withFailureVariant({
        type: "object",
        additionalProperties: false,
        properties: {
          specs: { type: "array", items: { type: "object" }, description: "Spec snapshot rows (listing index order)." },
        },
        required: ["specs"],
      }),
      render(_args, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { specs: SpecRow[] };
        return formatOk(
          `${v.specs.length} spec(s)`,
          v.specs.map((s) => `- ${s.slug} [${s.specStatus}] ${s.title} (tiers: ${s.tiers.length > 0 ? s.tiers.join("/") : "none"})`),
        );
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace): Promise<unknown> {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        const statusFilter = optionalEnum<SpecStatus>(a, "status_filter", SPEC_STATUSES, TOOL);
        const specs = deps.specs.listSpecs({
          cwd: requireSessionCwd(exec),
          ...(statusFilter !== undefined ? { statusFilter } : {}),
        });
        return { specs };
      });
    },
  }
}
