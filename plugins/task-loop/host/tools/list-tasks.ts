// listTasks tool（plugin-task-loop 1.11——packages/plugin-forge/src/tools/list-tasks.ts
// 直迁 + slug 化改造：旧 source_kind/source_slug 成对 → 单参 slug（可选作用域过滤，缺席 =
// 全库）。定位 = 域动词薄封装：listTasks（list.ts，search/sort/statusFilter/slug 全透传），
// 本文件只做 snake_case 入参收窄 + TaskCard 文本投影（前置摘要投影为 localId 数组——照旧）。
import { TASK_STATUSES, type TaskStatus } from "@dsh-forge/contracts";
import { listTasks } from "../domain/tasks/list.js";
import type { TaskCard, TasksVerbDeps } from "../domain/tasks/types.js";
import { optionalEnum, optionalString, optionalStringArray, requireArgsObject } from "./args.js";
import type { TaskToolDefinition, TaskToolExecFace, TaskToolParametersSchema } from "./faces.js";

const TOOL = "list_tasks";

const SORTS = ["active", "created", "interrupted"] as const;

/** statusFilter 元素词表收窄（八态词表外即拒——含 tool 可读上下文） */
function optionalStatusArray(a: Record<string, unknown>, key: string, tool: string): TaskStatus[] | undefined {
  const raw = optionalStringArray(a, key, tool);
  if (raw === undefined) return undefined;
  return raw.map((e) => {
    if (!(TASK_STATUSES as readonly string[]).includes(e)) {
      throw new Error(`${tool}: ${key} must only contain [${TASK_STATUSES.join(", ")}]`);
    }
    return e as TaskStatus;
  });
}

const LIST_TASKS_PARAMETERS: TaskToolParametersSchema = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Optional container scope (feature directory name or proposal slug); omitted = whole project." },
    search: { type: "string", description: "Free-text filter, matched server-side against bilingual (zh/en) label constants." },
    statusFilter: { type: "array", items: { type: "string" }, description: "Status chips filter (subset of pending/in_progress/completed/blocked/suspended/interrupted/skipped/rejected); empty or omitted = all." },
    sort: { type: "string", description: "active =活跃优先 / created = newest first / interrupted = oldest interruption first." },
  },
};

/** TaskCard[] → 模型可见文本（✓ 首行计数 + 逐卡键值行——前置投影 localId 数组，照旧） */
function renderListResult(_args: unknown, value: unknown): readonly { readonly type: "text"; readonly text: string }[] {
  // Root cause: execute 返回值须与声明 output schema（{cards: [...]}, type: "object"）一致，
  // 裸数组会被 host schema 校验以 "value must be an object" 拒绝。
  const cards = (value as { cards: TaskCard[] }).cards;
  const lines =
    cards.length === 0
      ? ["(no matching tasks)"]
      : cards.map((c) => {
          const bits = [
            `- ${c.slug}/${c.localId} [${c.taskStatus}]${c.priority !== undefined ? ` (${c.priority})` : ""} ${c.title}`,
          ];
          bits.push(`  prerequisites: ${c.prerequisites.length === 0 ? "(none)" : c.prerequisites.map((p) => p.localId).join(", ")}`);
          bits.push(`  sessions: ${c.sessionCount}`);
          if (c.sourceTask !== undefined) bits.push(`  fix from: ${c.sourceTask.slug}/${c.sourceTask.localId}`);
          return bits.join("\n");
        });
  return [{ type: "text", text: [`✓ ${cards.length} task(s) matched`, ...lines].join("\n") }];
}

/** tool 定义工厂（deps 注入 verbDeps——域读动词薄封装） */
export function createListTasksTool(deps: {
  readonly verbDeps: TasksVerbDeps;
  readonly resolveProjectKey: (exec: TaskToolExecFace) => string;
}): TaskToolDefinition {
  return {
    name: TOOL,
    description:
      "List task cards (lightweight: natural key, title, status, priority, prerequisite local ids, session count, fix-source tag — no task descriptions or acceptance criteria). Filters pass straight through to the domain service: search (bilingual zh/en label matching), statusFilter (subset of the eight statuses), sort (active|created|interrupted), and an optional container scope via slug (omitted = whole project).",
    parameters: LIST_TASKS_PARAMETERS,
    output: {
      schema: {
        type: "object",
        properties: {
          cards: { type: "array", items: { type: "object" }, description: "Matching task cards in service order." },
        },
        required: ["cards"],
      },
      render: renderListResult,
    },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<{ cards: TaskCard[] }> {
      const a = requireArgsObject(args, TOOL);
      const slug = optionalString(a, "slug", TOOL);
      const search = optionalString(a, "search", TOOL);
      const statusFilter = optionalStatusArray(a, "statusFilter", TOOL);
      const sort = optionalEnum(a, "sort", SORTS, TOOL);
      const cards = await listTasks(deps.verbDeps, {
        projectKey: deps.resolveProjectKey(exec),
        ...(slug !== undefined ? { slug } : {}),
        ...(search !== undefined ? { search } : {}),
        ...(statusFilter !== undefined ? { statusFilter } : {}),
        ...(sort !== undefined ? { sort } : {}),
      });
      return { cards };
    },
  };
}
