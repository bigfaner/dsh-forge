// create_spec tool（plugin-spec 1.4——域动词薄封装：域逻辑单一事实源 = forgeSpecs 服务层
// createSpec 单事务原子落库；本文件只做入参防御收窄 + doc_path 缺省派生（lib/api
// forge-paths 单源）+ 双友好返回面投影）。
import { specDocRelPath } from "@dsh-forge/lib-api";
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, optionalStringArray, requireArgsObject, requiredString, withFailureVariant } from "@dsh-forge/lib-api";
import type { SpecRow } from "../db/row-types.js";
import type { ForgeSpecsService } from "../domain/specs/service.js";
import { SPEC_TIERS } from "../domain/specs/service.js";
import { requireSessionCwd, type SpecToolDefinition, type SpecToolExecFace } from "./faces.js";
import { parseGoals } from "./parse.js";

const TOOL = "create_spec";

const CREATE_SPEC_PARAMETERS = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Spec slug (unique per project)." },
    title: { type: "string", description: "Spec title." },
    tiers: { type: "array", items: { type: "string" }, description: "Delivery tiers, closed set: ui | api | pure-logic | docs." },
    goals: {
      type: "array",
      items: { type: "object" },
      description: "Full Goal set with ACs, passed in one call: [{title, brief?, acs: [criterion, ...]}]. Goals+ACs land atomically — no scattered follow-up calls.",
    },
    doc_path: { type: "string", description: "Explicit spec doc path (relative to project root). Defaults to the single-source derivation .forge/specs/{slug}/spec.md." },
    doc_content: { type: "string", description: "Optional full spec doc markdown; defaults to a rendered Goals/AC outline." },
  },
  required: ["slug", "title", "goals"],
} as const;

/** create_spec 注册面输出 schema（成功 DTO | 失败 DTO 双支——format 单源） */
export const CREATE_SPEC_OUTPUT_SCHEMA = withFailureVariant({
  type: "object",
  additionalProperties: false,
  properties: {
    spec: { type: "object", description: "Created spec snapshot row (slug/title/status/tiers/projectKey)." },
    docPath: { type: "string", description: "Registered spec doc path (relative to project root)." },
  },
  required: ["spec", "docPath"],
})

/** SpecRow 快照 → 模型可见键值行（四写动词共用投影） */
export function specSnapshotLines(spec: SpecRow, docPath?: string): string[] {
  return [
    `- slug: ${spec.slug}`,
    `- title: ${spec.title}`,
    `- status: ${spec.specStatus}`,
    `- tiers: ${spec.tiers.length > 0 ? spec.tiers.join(", ") : "(none)"}`,
    ...(docPath !== undefined ? [`- doc: ${docPath}`] : []),
  ];
}

/** tool 定义工厂（deps 注入 forgeSpecs 服务面——薄封装零域逻辑） */
export function createCreateSpecTool(deps: { readonly specs: ForgeSpecsService }): SpecToolDefinition {
  return {
    name: TOOL,
    description:
      "Create a spec with its full Goal + AC set in one atomic call (spec row + goals + ACs + doc registration + spec.md file; any failure rolls everything back — no half state). Doc path defaults to .forge/specs/{slug}/spec.md. New specs start in draft.",
    parameters: CREATE_SPEC_PARAMETERS,
    output: {
      schema: CREATE_SPEC_OUTPUT_SCHEMA,
      render(_args, value) {
        if (isForgeToolFailure(value)) return formatFailure(value);
        const v = value as { spec: SpecRow; docPath: string };
        return formatOk(`spec created: ${v.spec.slug} [${v.spec.specStatus}]`, specSnapshotLines(v.spec, v.docPath));
      },
    },
    async execute(args: unknown, exec: SpecToolExecFace): Promise<unknown> {
      return callToolFace(async () => {
        const a = requireArgsObject(args, TOOL);
        const slug = requiredString(a, "slug", TOOL);
        const title = requiredString(a, "title", TOOL);
        const goals = parseGoals(a, TOOL);
        const tiers = optionalStringArray(a, "tiers", TOOL);
        const docPath = typeof a["doc_path"] === "string" && a["doc_path"] !== "" ? (a["doc_path"] as string) : specDocRelPath(slug);
        const content = typeof a["doc_content"] === "string" && a["doc_content"] !== "" ? (a["doc_content"] as string) : undefined;
        const row = deps.specs.createSpec({
          cwd: requireSessionCwd(exec),
          slug,
          title,
          ...(tiers !== undefined ? { tiers } : {}),
          goals,
          docRelPath: docPath,
          ...(content !== undefined ? { docContent: content } : {}),
        });
        return { spec: row, docPath };
      });
    },
  }
}

// tiers 词表单源再导出（执行点词表校验在服务层 assertTiersValid——schema 面描述引用）
export { SPEC_TIERS };
