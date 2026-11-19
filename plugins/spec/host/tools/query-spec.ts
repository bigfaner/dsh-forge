// query_spec tool（plugin-spec 1.4 → 1.8 include 化重接线，tools.md §一·五）——详情查询
// 统一形态：include?: string[] 数组参数（CLI -v 风格），值域封闭枚举
//（goals | acProjection | latestReviews | transitions——未知值 typed Error 拒）。
// 域逻辑单一事实源 = tool-service 组合根 querySpec（父链追溯 + include 装配 + 投影现算
// + 台账尾帧）；本文件只做入参防御收窄 + 双友好返回面投影。
import {
  callToolFace,
  formatFailure,
  isForgeToolFailure,
  requireArgsObject,
  requiredString,
  withFailureVariant,
} from "@dsh-forge/lib-api";
import type { ForgeToolServices } from "../domain/specs/tool-service.js";
import { requireSessionCwd, type SpecToolDefinition, type SpecToolExecFace } from "./faces.js";
import { optionalStringArrayField } from "./parse-fields.js";

const TOOL = "query_spec";

const QUERY_SPEC_PARAMETERS = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Spec slug." },
    include: {
      type: "array",
      items: { type: "string" },
      description: "Optional expansions, closed set: goals | acProjection | latestReviews | transitions. Unknown values are rejected. Default = spec snapshot + goal count; acProjection nests per-goal AC states; latestReviews nests per-goal latest review reports.",
    },
  },
  required: ["slug"],
} as const;

interface QuerySpecGoalEntry {
  readonly goalId: string;
  readonly goalSeq: number;
  readonly title: string;
  readonly goalStatus: string;
  readonly acs?: readonly { readonly criterion: string; readonly state: string }[];
  readonly latestReview?: { readonly verdict: string; readonly gapNote?: string; readonly createdAt: string };
}

interface QuerySpecResult {
  readonly spec: { readonly slug: string; readonly specStatus: string };
  readonly goalCount: number;
  readonly goals?: readonly QuerySpecGoalEntry[];
  readonly transitions?: readonly unknown[];
  readonly doc?: { readonly relPath: string };
}

/** tool 定义工厂（详情查询 include 化薄封装——deps = tool-service 组合根） */
export function createQuerySpecTool(verbs: ForgeToolServices): SpecToolDefinition {
  return {
    name: TOOL,
    description:
      "Query one spec: snapshot + goal count by default. include (closed set: goals | acProjection | latestReviews | transitions) expands layers — goals list, per-goal AC projection states (live evaluation), per-goal latest review reports, and the transition ledger tail. Unknown include values are rejected. Also triggers goal auto-advance at the service layer (idempotent edge write).",
    parameters: QUERY_SPEC_PARAMETERS,
    output: {
      schema: withFailureVariant({
        type: "object",
        additionalProperties: false,
        properties: {
          spec: { type: "object", description: "Spec snapshot row." },
          goalCount: { type: "number", description: "Goal count (default overview)." },
          goals: { type: "array", items: { type: "object" }, description: "Goals (when included): goalId/goalSeq/title/goalStatus; acs[] with projection states and latestReview when requested." },
          transitions: { type: "array", items: { type: "object" }, description: "Transition ledger tail (when included)." },
          doc: { type: "object", description: "Doc registration (when present)." },
        },
        required: ["spec", "goalCount"],
      }),
      render(_args, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as QuerySpecResult;
        const lines: string[] = [
          `✓ spec ${v.spec.slug} [${v.spec.specStatus}]`,
          `- goals: ${String(v.goalCount)}`,
        ];
        for (const goal of v.goals ?? []) {
          lines.push(`  - #${String(goal.goalSeq)} ${goal.title} [${goal.goalStatus}]`);
          for (const ac of goal.acs ?? []) lines.push(`    - AC: ${ac.criterion} [${ac.state}]`);
          if (goal.latestReview !== undefined) {
            lines.push(`    - latestReview: ${goal.latestReview.verdict}${goal.latestReview.gapNote !== undefined ? ` (${goal.latestReview.gapNote})` : ""}`);
          }
        }
        if (v.doc !== undefined) lines.push(`- doc: ${v.doc.relPath}`);
        if (v.transitions !== undefined) lines.push(`- transitions: ${String(v.transitions.length)} (tail)`);
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace): Promise<unknown> {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        return verbs.querySpec({
          cwd: requireSessionCwd(exec),
          slug: requiredString(a, "slug", TOOL),
          include: optionalStringArrayField(a, "include"),
          sessionId: exec.agent?.session?.id,
        });
      });
    },
  }
}
