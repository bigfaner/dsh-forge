// unblockTask tool（plugin-task-loop 1.11——packages/plugin-forge/src/tools/unblock-task.ts
// 直迁 + slug 化改造）。定位 = 域动词薄封装：unblockTask（unblock.ts，blocked→pending 出口
// + reason 必带域校验），本文件只做三参收窄 + 结算面负载键黑名单拒绝（非结算语义名实相符——
// 结算走 submit_task）+ 审计要点文本投影。
import { unblockTask, type UnblockTaskResult } from "../domain/tasks/unblock.js";
import type { TasksVerbDeps } from "../domain/tasks/types.js";
import { requireArgsObject, requiredString } from "./args.js";
import type { TaskToolDefinition, TaskToolExecFace, TaskToolParametersSchema } from "./faces.js";

const TOOL = "unblock_task";

/** 结算面负载键黑名单（schema 面不接受——非结算语义，命中即拒） */
const SETTLEMENT_LOAD_KEYS = [
  "result",
  "summary",
  "files",
  "files_created",
  "files_modified",
  "ac_results",
  "key_decisions",
  "tests_passed",
  "tests_failed",
  "coverage",
  "notes",
  "gate_compile",
  "gate_fmt",
  "gate_lint",
  "gate_test",
  "gate_coverage",
  "commit_hash",
  "evidence_debt_suite",
  "evidence_debt_specs",
  "evidence_debt_note",
  "facets",
  "runtime_evidence_face",
  "runtime_evidence_artifacts",
  "runtime_evidence_note",
] as const;

const UNBLOCK_TASK_PARAMETERS: TaskToolParametersSchema = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Container slug of the task being unblocked (feature directory name or proposal slug)." },
    local_id: { type: "string", description: "Local id of the task being unblocked." },
    reason: { type: "string", description: "Why the blocking reason is considered resolved (required; recorded as the unblock audit reason)." },
  },
  required: ["slug", "local_id", "reason"],
};

/** UnblockTaskResult → 模型可见文本（✓ 首行 + 审计要点行——照旧） */
function renderUnblockResult(args: unknown, value: unknown): readonly { readonly type: "text"; readonly text: string }[] {
  const v = value as UnblockTaskResult;
  const a = args as { slug?: string; local_id?: string; reason?: string };
  const where = a.slug !== undefined && a.local_id !== undefined ? `${a.slug}/${a.local_id} ` : "";
  const lines = [
    `- taskId: ${v.taskId}`,
    `- status: ${v.status} (back in the claim queue)`,
    ...(a.reason !== undefined ? [`- reason: ${a.reason}`] : []),
  ];
  return [{ type: "text", text: [`✓ Task ${where}unblocked — ${v.status}`, ...lines].join("\n") }];
}

/** tool 定义工厂（deps 注入 verbDeps——域写动词薄封装） */
export function createUnblockTaskTool(deps: {
  readonly verbDeps: TasksVerbDeps;
  readonly resolveProjectKey: (exec: TaskToolExecFace) => string;
}): TaskToolDefinition {
  return {
    name: TOOL,
    description:
      "Unblock a blocked task (located by its container slug + local_id): transitions it back to pending so it re-enters the normal claim queue — use when the blocking reason is resolved but the task is not itself settled. Requires reason (recorded on the task records as the unblock audit). Gate/AC settlement loads are not accepted; settle the task with submit_task instead.",
    parameters: UNBLOCK_TASK_PARAMETERS,
    output: {
      schema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          status: { type: "string", description: "Task status after the unblock (always 'pending')." },
        },
        required: ["taskId", "status"],
      },
      render: renderUnblockResult,
    },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<UnblockTaskResult> {
      const a = requireArgsObject(args, TOOL);
      const hit = SETTLEMENT_LOAD_KEYS.filter((k) => a[k] !== undefined);
      if (hit.length > 0) {
        throw new Error(
          `${TOOL}: settlement/gate/AC loads are not accepted (${hit.join(", ")}) — unblock_task only restores the blocked task to pending; submit the outcome with submit_task instead`,
        );
      }
      const reason = requiredString(a, "reason", TOOL);
      if (reason.trim() === "") {
        throw new Error(`${TOOL}: reason must be a non-empty string (it is recorded on the task records as the unblock audit reason)`);
      }
      return unblockTask(deps.verbDeps, {
        projectKey: deps.resolveProjectKey(exec),
        taskRef: { slug: requiredString(a, "slug", TOOL), localId: requiredString(a, "local_id", TOOL) },
        reason,
      });
    },
  };
}
