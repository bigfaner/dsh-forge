// queryTask tool（plugin-task-loop 1.11——packages/plugin-forge/src/tools/query-task.ts
// 直迁 + 容器语义 slug 化改造：旧 faces/events/session 机制退役，新面 = TaskToolExecFace
// + deps.resolveProjectKey(exec)；旧 formatOk/formatFailure 失败信封退役——域 typed 错误
// 直接抛出，render 只投影成功值）。定位 = 域动词薄封装：读动词 queryTask（query.ts），
// 本文件只做 snake_case 入参解析 + include 四布尔门控映射 + 快照文本投影。
import { queryTask, type QueryTaskResult } from "../domain/tasks/query.js";
import type { TasksVerbDeps } from "../domain/tasks/types.js";
import { optionalBoolean, requireArgsObject, requiredString } from "./args.js";
import type { TaskToolDefinition, TaskToolExecFace, TaskToolParametersSchema } from "./faces.js";

const TOOL = "query_task";

const QUERY_TASK_PARAMETERS: TaskToolParametersSchema = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Container slug of the task (feature directory name or proposal slug)." },
    local_id: { type: "string", description: "Local id of the task." },
    include_prerequisites: { type: "boolean", description: "Also return prerequisite tasks with their statuses." },
    include_waiting_on_me: { type: "boolean", description: "Also return successor tasks waiting on this one." },
    include_records: { type: "boolean", description: "Also return the execution timeline (verb/actor/reason/gate)." },
    include_sessions: { type: "boolean", description: "Also return attached sessions (dispatch vs execution)." },
  },
  required: ["slug", "local_id"],
};

/** record 时间线行（verb/from→to/note/payload/digest——照旧语义投影） */
function recordLine(note: string | undefined, verb: string, from: string | undefined, to: string | undefined, actor: string, sessionId: string | undefined, digest: string | undefined): string {
  const transition = from !== undefined || to !== undefined ? ` ${from ?? ""}→${to ?? ""}` : "";
  const detail = note !== undefined ? ` — ${note}` : digest !== undefined ? ` — digest ${digest}` : "";
  return `  - ${verb}${transition} (${actor}${sessionId !== undefined ? `, session ${sessionId}` : ""})${detail}`;
}

/** QueryTaskResult → 模型可见文本（✓ 首行 + 快照键值行 + 四节按在场投影——照旧语义） */
function renderQueryResult(_args: unknown, value: unknown): readonly { readonly type: "text"; readonly text: string }[] {
  const v = value as QueryTaskResult;
  const t = v.task;
  const entries = [
    `- type: ${t.taskType}${t.priority !== undefined ? `, priority ${t.priority}` : ""}, complexity ${t.complexity}`,
    `- container: ${v.container.slug}`,
    ...(t.brief !== undefined ? [`- brief: ${t.brief}`] : []),
    ...(t.acceptanceCriteria !== undefined ? [`- acceptanceCriteria: ${t.acceptanceCriteria.length} items`] : []),
  ];
  if (v.prerequisites !== undefined) {
    entries.push(
      v.prerequisites.length === 0
        ? "prerequisites: (none)"
        : `prerequisites: ${v.prerequisites.map((p) => `${p.slug}/${p.localId} [${p.taskStatus}]`).join(", ")}`,
    );
  }
  if (v.waitingOnMe !== undefined) {
    entries.push(
      v.waitingOnMe.length === 0
        ? "waiting on me: (none)"
        : `waiting on me: ${v.waitingOnMe.map((p) => `${p.slug}/${p.localId} [${p.taskStatus}]`).join(", ")}`,
    );
  }
  if (v.records !== undefined) {
    entries.push(`records (${v.records.length}):`);
    entries.push(
      ...v.records.map((r) => recordLine(r.note, r.verb, r.fromStatus, r.toStatus, r.actor, r.sessionId, r.digest)),
    );
  }
  if (v.sessions !== undefined) {
    entries.push(
      v.sessions.length === 0
        ? "sessions: (none)"
        : `sessions: ${v.sessions.map((s) => `${s.sessionId} (${s.source})`).join(", ")}`,
    );
  }
  return [{ type: "text", text: [`✓ ${t.slug}/${t.localId} [${t.taskStatus}] ${t.title}`, ...entries].join("\n") }];
}

/** tool 定义工厂（deps 注入 verbDeps——域读动词薄封装） */
export function createQueryTaskTool(deps: {
  readonly verbDeps: TasksVerbDeps;
  readonly resolveProjectKey: (exec: TaskToolExecFace) => string;
}): TaskToolDefinition {
  return {
    name: TOOL,
    description:
      "Query one task by its container slug + local_id: current status, owning container (slug), plus optional sections (prerequisites, tasks waiting on it, execution records, attached sessions). Use it to check readiness or diagnose blockers before submitting or spawning fix tasks.",
    parameters: QUERY_TASK_PARAMETERS,
    output: {
      schema: {
        type: "object",
        properties: {
          task: { type: "object", description: "Current task snapshot." },
          container: { type: "object", description: "Owning container (slug)." },
          prerequisites: { type: "array", items: { type: "object" }, description: "Prerequisite task summaries (when included)." },
          waitingOnMe: { type: "array", items: { type: "object" }, description: "Successor task summaries waiting on this one (when included)." },
          records: { type: "array", items: { type: "object" }, description: "Execution timeline entries (when included)." },
          sessions: { type: "array", items: { type: "object" }, description: "Attached sessions, link/record typed (when included)." },
        },
        required: ["task", "container"],
      },
      render: renderQueryResult,
    },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<QueryTaskResult> {
      const a = requireArgsObject(args, TOOL);
      const slug = requiredString(a, "slug", TOOL);
      const localId = requiredString(a, "local_id", TOOL);
      const include = {
        ...(optionalBoolean(a, "include_prerequisites", TOOL) === true ? { prerequisites: true } : {}),
        ...(optionalBoolean(a, "include_waiting_on_me", TOOL) === true ? { waitingOnMe: true } : {}),
        ...(optionalBoolean(a, "include_records", TOOL) === true ? { records: true } : {}),
        ...(optionalBoolean(a, "include_sessions", TOOL) === true ? { sessions: true } : {}),
      };
      const hasInclude = Object.keys(include).length > 0;
      return queryTask(deps.verbDeps, {
        projectKey: deps.resolveProjectKey(exec),
        taskRef: { slug, localId },
        ...(hasInclude ? { include } : {}),
      });
    },
  };
}
