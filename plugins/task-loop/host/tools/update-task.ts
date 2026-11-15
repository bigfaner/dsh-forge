// updateTask tool（plugin-task-loop 1.11——packages/plugin-forge/src/tools/update-task.ts
// 直迁 + 容器语义 slug 化改造：新线域 UpdateTaskInput 宽字段面（brief 替代旧 task_desc、
// context 替代旧 vars——v1 列面 context_json 单列）。定位 = 域动词薄封装：updateTask
// （update.ts，partial 给定即改 + dependsOn 护栏/环校验单源），本文件只做 snake_case
// 入参收窄 + 更新后快照文本投影。
import { updateTask, type UpdateTaskInput } from "../domain/tasks/update.js";
import type { TaskSnapshot, TasksVerbDeps } from "../domain/tasks/types.js";
import { parseContextEntries } from "./batch-add-tasks.js";
import { optionalEnum, optionalFraction, optionalString, optionalStringArray, requireArgsObject, requiredString } from "./args.js";
import type { TaskToolDefinition, TaskToolExecFace, TaskToolParametersSchema } from "./faces.js";

const TOOL = "update_task";

const PRIORITIES = ["P0", "P1", "P2"] as const;
const COMPLEXITIES = ["low", "medium", "high"] as const;

const UPDATE_TASK_PARAMETERS: TaskToolParametersSchema = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Container slug of the task being updated (feature directory name or proposal slug)." },
    local_id: { type: "string", description: "Local id of the task being updated." },
    title: { type: "string", description: "New short title." },
    type: { type: "string", description: "New task type (see queryTask help for the vocabulary)." },
    priority: { type: "string", description: "New priority, one of: P0, P1, P2." },
    estimated_time: { type: "string", description: 'Rough estimate such as "1-2h".' },
    complexity: { type: "string", description: "One of: low, medium, high." },
    brief: { type: "string", description: "New content payload (hard rules, reference list, free text)." },
    acceptance_criteria: { type: "array", items: { type: "string" }, description: "Replacement acceptance criteria checklist (overwritten as a whole)." },
    scope: { type: "object", description: 'Structured object {"created":[],"modified":[],"removed":[]} of relative paths.' },
    context: { type: "array", items: { type: "string" }, description: "Replacement KEY=VALUE entries (overwritten as a whole; duplicate keys rejected)." },
    coverage_threshold: { type: "number", description: "Acceptance coverage threshold expectation (0-1)." },
    depends_on: { type: "array", items: { type: "string" }, description: "Replacement depends_on as local ids in the same container (manual edges only; cycles rejected; derived edges reject the rewrite)." },
    depends_on_append: { type: "array", items: { type: "string" }, description: "Incrementally append manual edges — derived edges untouched, idempotent; mutually exclusive with depends_on." },
  },
  required: ["slug", "local_id"],
};

/** 更新后快照 → 模型可见文本（✓ 首行 + 更新字段可见键值行——照旧） */
function renderUpdateResult(_args: unknown, value: unknown): readonly { readonly type: "text"; readonly text: string }[] {
  const v = value as TaskSnapshot;
  const entries = [
    `- taskId: ${v.taskId}`,
    `- type: ${v.taskType}${v.priority !== undefined ? `, priority ${v.priority}` : ""}, complexity ${v.complexity}`,
    ...(v.estimatedTime !== undefined ? [`- estimatedTime: ${v.estimatedTime}`] : []),
    ...(v.brief !== undefined ? [`- brief: ${v.brief}`] : []),
    ...(v.acceptanceCriteria !== undefined ? [`- acceptanceCriteria: ${v.acceptanceCriteria.length} items`] : []),
    ...(v.context !== undefined ? [`- context: ${Object.keys(v.context).length} entries`] : []),
    `- updatedAt: ${v.updatedAt}`,
  ];
  return [{ type: "text", text: [`✓ Task ${v.slug}/${v.localId} updated — [${v.taskStatus}] ${v.title}`, ...entries].join("\n") }];
}

/** tool 定义工厂（deps 注入 verbDeps——域写动词薄封装） */
export function createUpdateTaskTool(deps: {
  readonly verbDeps: TasksVerbDeps;
  readonly resolveProjectKey: (exec: TaskToolExecFace) => string;
}): TaskToolDefinition {
  return {
    name: TOOL,
    description:
      "Update an existing task (located by its container slug + local_id): wide-field partial semantics — given fields are rewritten, absent fields stay untouched. Rewritable: title, type, priority, estimated_time, complexity, brief, acceptance_criteria (overwritten as a whole), scope, context (KEY=VALUE entries, overwritten as a whole), coverage_threshold, depends_on (manual edges replaced as a whole; cycle-checked incrementally; fix-chain/autoconfig derived edges are rejected), depends_on_append (incrementally append manual edges — derived edges untouched, idempotent; mutually exclusive with depends_on). Blocked by status gates (locked statuses reject) — read the updated task snapshot back.",
    parameters: UPDATE_TASK_PARAMETERS,
    output: {
      schema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          slug: { type: "string" },
          localId: { type: "string" },
          title: { type: "string" },
          taskType: { type: "string" },
          taskStatus: { type: "string" },
          updatedAt: { type: "string", description: "Last write timestamp (bumped by this update)." },
        },
        required: ["taskId", "slug", "localId", "title", "taskType", "taskStatus", "updatedAt"],
      },
      render: renderUpdateResult,
    },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<TaskSnapshot> {
      const a = requireArgsObject(args, TOOL);
      const input: UpdateTaskInput = {
        projectKey: deps.resolveProjectKey(exec),
        taskRef: { slug: requiredString(a, "slug", TOOL), localId: requiredString(a, "local_id", TOOL) },
        ...(optionalString(a, "title", TOOL) !== undefined ? { title: optionalString(a, "title", TOOL) } : {}),
        ...(optionalString(a, "type", TOOL) !== undefined ? { type: optionalString(a, "type", TOOL) } : {}),
        ...(optionalEnum(a, "priority", PRIORITIES, TOOL) !== undefined ? { priority: optionalEnum(a, "priority", PRIORITIES, TOOL) } : {}),
        ...(optionalString(a, "estimated_time", TOOL) !== undefined ? { estimatedTime: optionalString(a, "estimated_time", TOOL) } : {}),
        ...(optionalEnum(a, "complexity", COMPLEXITIES, TOOL) !== undefined ? { complexity: optionalEnum(a, "complexity", COMPLEXITIES, TOOL) } : {}),
        ...(optionalString(a, "brief", TOOL) !== undefined ? { brief: optionalString(a, "brief", TOOL) } : {}),
        ...(optionalStringArray(a, "acceptance_criteria", TOOL) !== undefined ? { acceptanceCriteria: optionalStringArray(a, "acceptance_criteria", TOOL) } : {}),
        ...(a.scope !== undefined ? { scope: a.scope as UpdateTaskInput["scope"] } : {}),
        ...(a.context !== undefined ? { context: parseContextEntries(a.context, TOOL) } : {}),
        ...(optionalFraction(a, "coverage_threshold", TOOL) !== undefined ? { coverageThreshold: optionalFraction(a, "coverage_threshold", TOOL) } : {}),
        ...(optionalStringArray(a, "depends_on", TOOL) !== undefined ? { dependsOn: optionalStringArray(a, "depends_on", TOOL) } : {}),
        ...(optionalStringArray(a, "depends_on_append", TOOL) !== undefined ? { dependsOnAppend: optionalStringArray(a, "depends_on_append", TOOL) } : {}),
      };
      return updateTask(deps.verbDeps, input);
    },
  };
}
