// addTask 单条工具（plugin-task-loop 1.10——回归纯单条语义；批量 = 独立工具 batch_add_tasks，
// 命名强区分）。定位 = 域服务薄封装：单事务写点（task_tasks 行 → task_edges → task_records
// + fix 链锁源）域逻辑单一事实源在 domain/tasks/add.ts addTask，本文件只做 agent 面
// snake_case 入参解析（context[] KEY=VALUE 解析与重复键拒绝同批量工具配方）+ 失败面透传
// （域层 typed 错误消息自带修正指引，零静默兼容）。
import { addTask as domainAddTask, type AddTaskResult } from "../domain/tasks/add.js";
import type { TaskScope, TaskType, TasksVerbDeps } from "../domain/tasks/types.js";
import { parseContextEntries } from "./batch-add-tasks.js";
import type { TaskToolDefinition, TaskToolExecFace, TaskToolParametersSchema } from "./faces.js";

const ADD_TASK_PARAMETERS: TaskToolParametersSchema = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Container slug (the container itself)." },
    title: { type: "string", description: "Required non-empty task title." },
    type: { type: "string", description: "Task type (see queryTask help for the vocabulary)." },
    brief: { type: "string", description: "Task brief body shown to the worker." },
    acceptance_criteria: { type: "array", items: { type: "string" }, description: "Acceptance criterion list (verbatim criterion text when decomposing from a spec)." },
    priority: { type: "string", description: "P0 | P1 | P2." },
    estimated_time: { type: "string", description: 'Free-form estimate (e.g. "1-2h").' },
    scope: { type: "object", description: 'Structured object {"created":[],"modified":[],"removed":[]} of relative paths.' },
    context: { type: "array", items: { type: "string" }, description: "KEY=VALUE entries (keys unique, values strings)." },
    depends_on: { type: "array", items: { type: "string" }, description: "Prerequisite local ids in the same slug." },
    before: { type: "array", items: { type: "string" }, description: "Successor local ids (edge added to them)." },
    source_task_slug: { type: "string", description: "Fix-chain source slug (pairs with source_task_local_id)." },
    source_task_local_id: { type: "string", description: "Fix-chain source local id (pairs with source_task_slug)." },
    block_source: { type: "boolean", description: "true = fix chain (waiting edge + auto-block source); omit for disc path." },
    breaking: { type: "boolean", description: "Breaking change flag." },
    coverage_threshold: { type: "number", description: "Acceptance coverage threshold expectation (0-1)." },
    complexity: { type: "string", description: "low | medium | high." },
  },
  required: ["slug", "title", "type"],
};

/** tool 定义工厂（deps 注入 verbDeps——域写动词薄封装） */
export function createAddTaskTool(deps: {
  readonly verbDeps: TasksVerbDeps;
  readonly resolveProjectKey: (exec: TaskToolExecFace) => string;
}): TaskToolDefinition {
  return {
    name: "add_task",
    description:
      "Add a single task to a container (slug = the container itself). Single-task semantics; for a whole batch use batch_add_tasks. task_tasks row + edges + record commit in one transaction; fix chain (source_task pair + block_source) locks the source task in the same transaction.",
    parameters: ADD_TASK_PARAMETERS,
    output: {
      schema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          slug: { type: "string" },
          localId: { type: "string" },
          reused: { type: "boolean" },
          beforeSuccessors: { type: "array", items: { type: "string" } },
        },
        required: ["taskId", "slug", "localId", "reused"],
      },
      render: (_args, value): readonly { readonly type: "text"; readonly text: string }[] => {
        const r = value as AddTaskResult;
        const reused = r.reused ? " (reused existing)" : "";
        const before = r.beforeSuccessors?.length ? `; before successors: ${r.beforeSuccessors.join(", ")}` : "";
        return [{ type: "text", text: `add_task ok: ${r.slug}/${r.localId} → ${r.taskId}${reused}${before}` }];
      },
    },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<AddTaskResult> {
      if (typeof args !== "object" || args === null) {
        throw new Error("add_task: arguments must be an object");
      }
      const a = args as Record<string, unknown>;
      const str = (key: string): string | undefined => (a[key] === undefined ? undefined : (a[key] as string));
      const strArr = (key: string): readonly string[] | undefined => (a[key] === undefined ? undefined : (a[key] as readonly string[]));
      const slug = str("slug");
      const title = str("title");
      const type = str("type");
      if (slug === undefined || title === undefined || type === undefined) {
        throw new Error("add_task: slug, title, type are required (non-empty strings)");
      }
      const taskType = type as TaskType;
      const sourceSlug = str("source_task_slug");
      const sourceLocalId = str("source_task_local_id");
      return domainAddTask(deps.verbDeps, {
        projectKey: deps.resolveProjectKey(exec),
        slug,
        title,
        type: taskType,
        ...(str("brief") !== undefined ? { brief: str("brief") } : {}),
        ...(strArr("acceptance_criteria") !== undefined ? { acceptanceCriteria: strArr("acceptance_criteria") } : {}),
        ...(str("priority") !== undefined ? { priority: str("priority") as "P0" | "P1" | "P2" } : {}),
        ...(str("estimated_time") !== undefined ? { estimatedTime: str("estimated_time") } : {}),
        ...(a.scope !== undefined ? { scope: a.scope as TaskScope } : {}),
        ...(a.context !== undefined ? { context: parseContextEntries(a.context, "add_task") } : {}),
        ...(strArr("depends_on") !== undefined ? { dependsOn: strArr("depends_on") } : {}),
        ...(strArr("before") !== undefined ? { before: strArr("before") } : {}),
        ...(sourceSlug !== undefined && sourceLocalId !== undefined ? { sourceTask: { slug: sourceSlug, localId: sourceLocalId } } : {}),
        ...(a.block_source !== undefined ? { blockSource: a.block_source as boolean } : {}),
        ...(a.breaking !== undefined ? { breaking: a.breaking as boolean } : {}),
        ...(a.coverage_threshold !== undefined ? { coverageThreshold: a.coverage_threshold as number } : {}),
        ...(str("complexity") !== undefined ? { complexity: str("complexity") as "low" | "medium" | "high" } : {}),
      });
    },
  };
}
