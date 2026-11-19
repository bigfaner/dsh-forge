// pauseTask tool（plugin-task-loop 1.11——packages/plugin-forge/src/tools/pause-task.ts
// 直迁 + slug 化改造：旧 source_kind/source_slug 成对 → 单参 slug；旧 loop driver/registry
// 判活面退役（宿主装配职责，本插件装配后续任务接）——本工具落任务域转移语义：暂停原因必带
// + 在飞任务转移 suspended（transition.ts pauseTask，taskId = uuid 代理键，经 queryTask
// 两显式参解析）。定位 = 域动词薄封装：入参收窄 + 暂停要点文本投影。
import { queryTask } from "../domain/tasks/query.js";
import { pauseTask, type PauseTaskInput } from "../domain/tasks/transition.js";
import type { TaskSnapshot, TasksVerbDeps } from "../domain/tasks/types.js";
import { requireArgsObject, requiredString } from "./args.js";
import type { TaskToolDefinition, TaskToolExecFace, TaskToolParametersSchema } from "./faces.js";

const TOOL = "pause_task";

const PAUSE_TASK_PARAMETERS: TaskToolParametersSchema = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Container slug of the task to pause (feature directory name or proposal slug). Required." },
    local_id: { type: "string", description: "Local id of the task to pause — must be the loop's current in-flight task. Required." },
    reason: { type: "string", description: "Why the task is being paused (recorded on the task execution timeline for audit). Required." },
  },
  required: ["slug", "local_id", "reason"],
};

/** TaskSnapshot（suspended 后快照）→ 模型可见文本（✓ 首行 + 暂停要点行——照旧语义） */
function renderPauseResult(args: unknown, value: unknown): readonly { readonly type: "text"; readonly text: string }[] {
  const v = value as TaskSnapshot;
  const a = args as { slug?: string; local_id?: string };
  const where = a.slug !== undefined && a.local_id !== undefined ? `${a.slug}/${a.local_id} ` : "";
  return [
    {
      type: "text",
      text: [
        `✓ task ${where}paused (${v.slug}) — [${v.taskStatus}]`,
        "- the task is now suspended (its spec is writable again)",
        "- rewrite the brief/AC/dependencies with update_task — suspended tasks accept rewrites",
        "- resume with dispatchTask re-entry: the paused card returns to pending and is re-dispatched",
      ].join("\n"),
    },
  ];
}

/** tool 定义工厂（deps 注入 verbDeps——域转移动词薄封装） */
export function createPauseTaskTool(deps: {
  readonly verbDeps: TasksVerbDeps;
  readonly resolveProjectKey: (exec: TaskToolExecFace) => string;
}): TaskToolDefinition {
  return {
    name: TOOL,
    description:
      "Pause a task: hard semantics = the task transitions to suspended (spec becomes writable again) with the reason recorded on the task execution timeline. Args: slug (container), local_id (the in-flight task — must match what the loop is running), reason (required). After pausing: rewrite the suspended task with update_task, then resume with dispatchTask re-entry (the paused card returns to pending and is re-dispatched).",
    parameters: PAUSE_TASK_PARAMETERS,
    output: {
      schema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          slug: { type: "string" },
          localId: { type: "string" },
          taskStatus: { type: "string", description: "Task status after the pause (always 'suspended')." },
        },
        required: ["taskId", "slug", "localId", "taskStatus"],
      },
      render: renderPauseResult,
    },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<TaskSnapshot> {
      const a = requireArgsObject(args, TOOL);
      const slug = requiredString(a, "slug", TOOL);
      const localId = requiredString(a, "local_id", TOOL);
      const reason = requiredString(a, "reason", TOOL);
      if (reason.trim() === "") {
        throw new Error(`${TOOL}: reason must be a non-empty string (it is recorded on the task timeline for audit)`);
      }
      const projectKey = deps.resolveProjectKey(exec);
      // slug + local_id 两显式参 → taskId（uuid 代理键）解析（queryTask 读动词单源查捞）
      const found = await queryTask(deps.verbDeps, { projectKey, taskRef: { slug, localId } });
      const input: PauseTaskInput = { projectKey, taskId: found.task.taskId, reason };
      return pauseTask(deps.verbDeps, input);
    },
  };
}
