// query_spec tool（plugin-spec 1.4——查询族薄封装：父链追溯 spec→goals→acs 三跳 +
// 流转台账 + 可选 AC 投影（include_ac_projection——投影态映射单源 projection.ts，
// matchAcSettlements 经装配缝现查，缺席降级 no-task-data）。域逻辑单一事实源 =
// forgeSpecs 服务层 getSpec 父链追溯。
import {
  callToolFace,
  formatFailure,
  isForgeToolFailure,
  optionalBoolean,
  requireArgsObject,
  requiredString,
  withFailureVariant,
} from "@dsh-forge/lib-api";
import type { ForgeSpecsService } from "../domain/specs/service.js";
import { SpecError } from "../domain/specs/errors.js";
import { requireSessionCwd, type SpecToolDefinition, type SpecToolExecFace } from "./faces.js";
import { projectAcsStates, type AcProjectionRow, type AcSettlementsFace } from "./projection.js";

const TOOL = "query_spec";

const QUERY_SPEC_PARAMETERS = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Spec slug." },
    include_ac_projection: { type: "boolean", description: "Also compute the AC settlement projection (met / unmet / unmatched / no-task-data) against task-loop settlements, evaluated live at call time." },
  },
  required: ["slug"],
} as const;

/** query_spec 成功面（父链全量 + 台账 + 可选投影） */
export interface QuerySpecResult {
  readonly spec: unknown;
  readonly goals: readonly {
    readonly title: string;
    readonly brief?: string;
    readonly acs: readonly { readonly criterion: string }[];
  }[];
  readonly doc?: { readonly relPath: string };
  readonly transitions: readonly unknown[];
  readonly acProjection?: readonly AcProjectionRow[];
}

/** tool 定义工厂（deps：服务面 + AC 投影现查缝——缺席 = no-task-data 降级） */
export function createQuerySpecTool(deps: {
  readonly specs: ForgeSpecsService;
  readonly acSettlementsOf?: () => AcSettlementsFace | undefined;
}): SpecToolDefinition {
  return {
    name: TOOL,
    description:
      "Query one spec with its full parent chain (spec → goals → ACs), doc registration and transition ledger. Optionally include the AC settlement projection (live evaluation, no cache).",
    parameters: QUERY_SPEC_PARAMETERS,
    output: {
      schema: withFailureVariant({
        type: "object",
        additionalProperties: false,
        properties: {
          spec: { type: "object", description: "Spec snapshot row." },
          goals: { type: "array", items: { type: "object" }, description: "Goals in order, each with its AC criteria in order." },
          doc: { type: "object", description: "Doc registration (when present)." },
          transitions: { type: "array", items: { type: "object" }, description: "Transition ledger entries (append-only)." },
          acProjection: { type: "array", items: { type: "object" }, description: "AC projection rows (when included): criterion + state (met/unmet/unmatched/no-task-data)." },
        },
        required: ["spec", "goals", "transitions"],
      }),
      render(_args, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as QuerySpecResult;
        const lines: string[] = [
          `✓ spec ${String((v.spec as { slug?: unknown }).slug)} [${String((v.spec as { specStatus?: unknown }).specStatus)}]`,
          `- goals: ${v.goals.length}`,
        ];
        for (const goal of v.goals) {
          lines.push(`  - ${goal.title} (${goal.acs.length} AC)`);
          for (const ac of goal.acs) {
            const projection = v.acProjection?.find((p) => p.criterion === ac.criterion);
            lines.push(`    - AC: ${ac.criterion}${projection !== undefined ? ` [${projection.state}]` : ""}`);
          }
        }
        if (v.doc !== undefined) lines.push(`- doc: ${v.doc.relPath}`);
        lines.push(`- transitions: ${v.transitions.length}`);
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace): Promise<unknown> {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        const slug = requiredString(a, "slug", TOOL);
        const includeProjection = optionalBoolean(a, "include_ac_projection", TOOL) === true;
        const cwd = requireSessionCwd(exec);
        const chain = deps.specs.getSpec({ cwd, slug });
        if (chain === undefined) {
          // 服务层 getSpec 未命中返回 undefined——tool 面归一为 typed NOT_FOUND（format 失败面）
          throw new SpecError("ERR_SPEC_NOT_FOUND", `spec 不存在：${slug}`, { slug });
        }
        const criteria = chain.goals.flatMap((g) => g.acs.map((ac) => ac.criterion));
        let acProjection: AcProjectionRow[] | undefined;
        if (includeProjection) {
          // 消费点现查永不缓存（AGENTS 1.6）；抛错 → no-task-data 降级（与缺席同投影态）
          let settlements;
          try {
            const face = deps.acSettlementsOf?.();
            settlements = face !== undefined ? await face.matchAcSettlements((chain.spec as { projectKey: string }).projectKey, criteria) : undefined;
          } catch {
            settlements = undefined;
          }
          acProjection = projectAcsStates(criteria, settlements);
        }
        return {
          spec: chain.spec,
          goals: chain.goals.map(({ goal, acs }) => ({
            title: goal.title,
            ...(goal.brief !== null ? { brief: goal.brief } : {}),
            acs: acs.map((ac) => ({ criterion: ac.criterion })),
          })),
          ...(chain.doc !== undefined ? { doc: chain.doc } : {}),
          transitions: chain.transitions,
          ...(acProjection !== undefined ? { acProjection } : {}),
        };
      });
    },
  }
}
