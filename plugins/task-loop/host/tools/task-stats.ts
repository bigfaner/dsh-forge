// taskStats tool（plugin-task-loop 1.11——packages/plugin-forge/src/tools/task-stats.ts
// 直迁 + slug 化改造：旧 source_kind/source_slug 成对 → 单参 slug（可选作用域，缺席 = 全库）。
// 定位 = 域动词薄封装：taskStats（list.ts，GUI chips 同源同口径），本文件只做入参收窄 +
// total/byStatus/unmetPending/gatedPending 读数渲染。
import { taskStats, type TaskStats } from "../domain/tasks/list.js";
import type { TasksVerbDeps } from "../domain/tasks/types.js";
import { optionalString, requireArgsObject } from "./args.js";
import type { TaskToolDefinition, TaskToolExecFace, TaskToolParametersSchema } from "./faces.js";

const TOOL = "task_stats";

const TASK_STATS_PARAMETERS: TaskToolParametersSchema = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Optional container scope (feature directory name or proposal slug); omitted = whole project." },
  },
};

/** TaskStats → 模型可见文本（✓ 首行 + total/八态/unmetPending/gatedPending 键值行——照旧） */
function renderStatsResult(_args: unknown, value: unknown): readonly { readonly type: "text"; readonly text: string }[] {
  const v = value as TaskStats;
  const byStatus = Object.entries(v.byStatus)
    .map(([status, count]) => `${status} ${count}`)
    .join(", ");
  return [
    {
      type: "text",
      text: [
        `✓ ${v.total} task(s) in scope`,
        `- total: ${v.total}`,
        `- byStatus: ${byStatus}`,
        `- unmetPending: ${v.unmetPending}`,
        `- gatedPending: ${v.gatedPending}`,
      ].join("\n"),
    },
  ];
}

/** tool 定义工厂（deps 注入 verbDeps——域读动词薄封装） */
export function createTaskStatsTool(deps: {
  readonly verbDeps: TasksVerbDeps;
  readonly resolveProjectKey: (exec: TaskToolExecFace) => string;
}): TaskToolDefinition {
  return {
    name: TOOL,
    description:
      "Read task-pool statistics: total count, distribution across the eight task statuses, and unmetPending (pending tasks whose prerequisites are not yet completed/skipped). Optionally scope to one container via slug; omitted = whole project. Same data source as the GUI status chips.",
    parameters: TASK_STATS_PARAMETERS,
    output: {
      schema: {
        type: "object",
        properties: {
          total: { type: "integer", description: "Total task count under the scope (whole pool when no slug given)." },
          byStatus: { type: "object", description: "Per-status distribution across the eight task statuses (zero counts included)." },
          unmetPending: { type: "integer", description: "Pending tasks whose prerequisites are not all completed/skipped." },
          gatedPending: { type: "integer", description: "Pending tasks held by the container implementation-chain phase gate." },
        },
        required: ["total", "byStatus", "unmetPending", "gatedPending"],
      },
      render: renderStatsResult,
    },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<TaskStats> {
      const a = requireArgsObject(args, TOOL);
      const slug = optionalString(a, "slug", TOOL);
      return taskStats(deps.verbDeps, {
        projectKey: deps.resolveProjectKey(exec),
        ...(slug !== undefined ? { slug } : {}),
      });
    },
  };
}
