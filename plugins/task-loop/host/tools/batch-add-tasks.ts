// batchAddTasks 批量工具（plugin-task-loop 1.10——修订裁决 10：独立批量工具、命名与
// add_task 强区分）。定位 = 域服务薄封装：dry-run 收集制全量校验（域逻辑单一事实源在
// domain/tasks/add.ts collectItemErrors）+ 整批单事务两遍式落库均由域层承担，本文件只做
// agent 面 snake_case 入参解析（context[] KEY=VALUE 解析与重复键拒绝）+ 错误信封投影
// （fixHint → fix_hint）+ 模型可见渲染。
import { BatchInvalidError, ContainerSlugInvalidError } from "../domain/tasks/errors.js";
import type { BatchAddTaskItem, BatchItemError } from "../domain/tasks/add.js";
import type { TasksService } from "../domain/tasks/service.js";
import type { TaskToolDefinition, TaskToolExecFace, TaskToolParametersSchema } from "./faces.js";

/** BATCH_ADD_TASKS_DESCRIPTION Hint（description 全文——九条校验规则清单，与 to-tasks
 * SKILL 自查清单一一对应；agent 首次即写对）。 */
export const BATCH_ADD_TASKS_DESCRIPTION = `Batch-add tasks to a container (slug = the container itself).
Every rule below is checked BEFORE any write; ALL violations are returned together
(each item: index + field + code + fix_hint), and nothing is written until the whole batch passes.
Rules — check each task item against this list:
1. localId: required, unique within this batch (duplicates reject the whole batch).
2. title: required non-empty string. type: required, one of the task types (see queryTask help).
3. brief: optional but recommended — it becomes the task brief body shown to the worker (spec-less tasks have no other definition source).
4. estimated_time: optional string (e.g. "1-2h").
5. scope: optional structured object {"created":[],"modified":[],"removed":[]} — files this task will create/modify/delete, each element a path relative to the project root (e.g. "plugins/task-loop/host/index.ts"); keys optional, unknown keys / absolute paths / non-string elements / the same path appearing in more than one array are all errors.
6. context: optional KEY=VALUE entries; keys unique, values strings (e.g. SOURCE_FILES=..., SKIP_EVAL_GATE=1).
7. acceptance_criteria: when decomposing from a spec AC list, carry each AC's criterion text VERBATIM (word-for-word) — downstream projection matches settlements by this exact text.
8. depends_on / before: local ids; may reference batch members (resolved in-batch) or existing tasks in the same slug; dangling or cyclic references reject the whole batch.
9. fix chain: source_task_slug + source_task_local_id must pair; block_source is required (true) when the source task is already blocked, false only for a deliberate disc successor. Also priority P0|P1|P2, coverage_threshold a 0-1 fraction, complexity low|medium|high, breaking boolean.
On success you get one result per item (added / reused with summary counts).`;

/** 错误信封单项（agent 面 snake_case：域层 fixHint → fix_hint） */
export interface BatchToolItemError {
  readonly index: number;
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly fix_hint: string;
}

/** 工具执行结果信封（校验失败 ok=false 逐条 errors 零落库；成功 ok=true 逐条 results + 汇总） */
export interface BatchAddTasksToolResult {
  readonly ok: boolean;
  readonly slug: string;
  readonly results?: readonly { readonly localId: string; readonly status: "added" | "reused"; readonly taskId: string; readonly slug: string }[];
  readonly summary?: { readonly added: number; readonly reused: number };
  readonly errors?: readonly BatchToolItemError[];
}

/** 单条任务项（agent 面 snake_case——context[] = KEY=VALUE 字符串数组） */
interface BatchAddTaskItemArgs {
  local_id?: unknown;
  title?: unknown;
  type?: unknown;
  brief?: unknown;
  acceptance_criteria?: unknown;
  priority?: unknown;
  estimated_time?: unknown;
  scope?: unknown;
  context?: unknown;
  depends_on?: unknown;
  before?: unknown;
  source_task_slug?: unknown;
  source_task_local_id?: unknown;
  block_source?: unknown;
  breaking?: unknown;
  coverage_threshold?: unknown;
  complexity?: unknown;
}

/** 工具层解析单项错误（context KEY=VALUE 形制/重复键——收集制并入信封） */
function contextParseErrors(index: number, entries: readonly unknown[]): BatchToolItemError[] {
  const errors: BatchToolItemError[] = [];
  const seen = new Map<string, number>();
  const record: Record<string, string> = {};
  entries.forEach((entry, i) => {
    if (typeof entry !== "string" || !entry.includes("=")) {
      errors.push({
        index,
        field: "context",
        code: "ERR_CONTEXT_INVALID",
        message: `context[${i}] 非法 KEY=VALUE 项：'${String(entry)}'`,
        fix_hint: "context 每项 = KEY=VALUE 字符串（如 SKIP_EVAL_GATE=1），键非空、值字符串",
      });
      return;
    }
    const eq = entry.indexOf("=");
    const key = entry.slice(0, eq);
    if (key.trim() === "") {
      errors.push({
        index,
        field: "context",
        code: "ERR_CONTEXT_INVALID",
        message: `context[${i}] 键空白：'${entry}'`,
        fix_hint: "context 每项 = KEY=VALUE 字符串，键非空",
      });
      return;
    }
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push({
        index,
        field: "context",
        code: "ERR_CONTEXT_INVALID",
        message: `context 键 '${key}' 重复（首现第 ${first + 1} 项）`,
        fix_hint: "context 每项 = KEY=VALUE 字符串，键唯一（同键只出现一次）",
      });
      return;
    }
    seen.set(key, i);
    record[key] = entry.slice(eq + 1);
  });
  return errors;
}

/** KEY=VALUE 字符串数组 → Record（add_task 单条工具共用配方——形制/重复键 fail-loud 透传，
 *  错误消息自带 KEY=VALUE 修正指引；批量工具不走此径——逐条收集制并入错误信封）。 */
export function parseContextEntries(value: unknown, toolName: string): Readonly<Record<string, string>> {
  if (!Array.isArray(value) || value.some((x) => typeof x !== "string")) {
    throw new Error(`${toolName}: context must be an array of KEY=VALUE strings (e.g. ["SKIP_EVAL_GATE=1"])`);
  }
  const out: Record<string, string> = {};
  for (const entry of value as string[]) {
    const eq = entry.indexOf("=");
    if (eq <= 0) {
      throw new Error(`${toolName}: context entry '${entry}' is not KEY=VALUE — each entry is KEY=VALUE (non-empty key, string value)`);
    }
    const key = entry.slice(0, eq);
    if (key in out) {
      throw new Error(`${toolName}: context key '${key}' is duplicated — keys must be unique`);
    }
    out[key] = entry.slice(eq + 1);
  }
  return out;
}

const STRING_ITEM_FIELDS = {
  local_id: "localId",
  title: "title",
  type: "type",
  brief: "brief",
  priority: "priority",
  estimated_time: "estimatedTime",
  source_task_slug: "sourceTaskSlug",
  source_task_local_id: "sourceTaskLocalId",
  complexity: "complexity",
} as const;

const STRING_ARRAY_FIELDS = {
  acceptance_criteria: "acceptanceCriteria",
  depends_on: "dependsOn",
  before: "before",
} as const;

/** snake_case 单项 → 域层 camelCase BatchAddTaskItem（收集制：形制错并入 errors 零抛） */
function parseItem(index: number, raw: BatchAddTaskItemArgs, errors: BatchToolItemError[]): BatchAddTaskItem | undefined {
  let ok = true;
  const out: Record<string, unknown> = {};
  const bad = (field: string, expect: string): void => {
    errors.push({ index, field, code: "ERR_INPUT_CONTRACT", message: `${field} 形制非法（${typeof (raw as Record<string, unknown>)[field]}）`, fix_hint: expect });
    ok = false;
  };
  for (const [src, dst] of Object.entries(STRING_ITEM_FIELDS)) {
    const v = (raw as Record<string, unknown>)[src];
    if (v === undefined) continue;
    if (typeof v !== "string") {
      bad(src, `${src} = 字符串`);
      continue;
    }
    out[dst] = v;
  }
  for (const [src, dst] of Object.entries(STRING_ARRAY_FIELDS)) {
    const v = (raw as Record<string, unknown>)[src];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      bad(src, `${src} = 字符串数组`);
      continue;
    }
    out[dst] = v;
  }
  if (raw.scope !== undefined) {
    if (typeof raw.scope !== "object" || raw.scope === null || Array.isArray(raw.scope)) {
      bad("scope", 'scope = 结构化对象 {"created":[],"modified":[],"removed":[]}');
    } else {
      out.scope = raw.scope;
    }
  }
  if (raw.context !== undefined) {
    if (!Array.isArray(raw.context)) {
      bad("context", "context = KEY=VALUE 字符串数组（如 [\"SKIP_EVAL_GATE=1\"]）");
    } else {
      const errs = contextParseErrors(index, raw.context);
      if (errs.length > 0) {
        errors.push(...errs);
        ok = false;
      } else {
        out.context = Object.fromEntries(raw.context.map((e) => {
          const eq = (e as string).indexOf("=");
          return [(e as string).slice(0, eq), (e as string).slice(eq + 1)];
        }));
      }
    }
  }
  for (const [src, dst] of [["block_source", "blockSource"], ["breaking", "breaking"]] as const) {
    const v = (raw as Record<string, unknown>)[src];
    if (v === undefined) continue;
    if (typeof v !== "boolean") {
      bad(src, `${src} = boolean`);
      continue;
    }
    out[dst] = v;
  }
  if (raw.coverage_threshold !== undefined) {
    if (typeof raw.coverage_threshold !== "number" || raw.coverage_threshold < 0 || raw.coverage_threshold > 1) {
      bad("coverage_threshold", "coverage_threshold = 0-1 fraction（如 0.8）");
    } else {
      out.coverageThreshold = raw.coverage_threshold;
    }
  }
  if (raw.source_task_slug !== undefined && raw.source_task_local_id !== undefined) {
    out.sourceTask = { slug: out.sourceTaskSlug as string, localId: out.sourceTaskLocalId as string };
  }
  delete out.sourceTaskSlug;
  delete out.sourceTaskLocalId;
  return ok ? (out as unknown as BatchAddTaskItem) : undefined;
}

const BATCH_PARAMETERS: TaskToolParametersSchema = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Container slug — the container the whole batch is added to (same slug for every item)." },
    tasks: {
      type: "array",
      description:
        "Task items. Each item: local_id (unique in batch), title, type, plus optional brief, acceptance_criteria (VERBATIM criterion text), priority (P0|P1|P2), estimated_time, scope ({\"created\",\"modified\",\"removed\"} arrays of relative paths), context (KEY=VALUE string array, keys unique), depends_on / before (local ids, in-batch or same-slug existing), source_task_slug + source_task_local_id + block_source (fix chain), breaking, coverage_threshold (0-1), complexity (low|medium|high). type must be an exact TASK_TYPES value (e.g. coding-feature / coding-enhancement / coding-fix / doc / test-run — full set in queryTask help); family names like 'coding' are invalid and fail at dispatch.",
      items: { type: "string" },
    },
  },
  required: ["slug", "tasks"],
};

/** 域层 camelCase field → agent 面 snake_case（信封 field 与入参字段名同源） */
const FIELD_SNAKE: Readonly<Record<string, string>> = {
  localId: "local_id",
  title: "title",
  type: "type",
  brief: "brief",
  context: "context",
  scope: "scope",
  dependsOn: "depends_on",
  before: "before",
  sourceTask: "source_task",
  blockSource: "block_source",
  tasks: "tasks",
};

const snakeField = (field: string): string => FIELD_SNAKE[field] ?? field;

/** tool 定义工厂（deps 注入任务域服务与 projectKey 解析缝——纯函数体零插件级状态） */
export function createBatchAddTasksTool(deps: {
  readonly tasks: Pick<TasksService, "addTask" | "batchAddTasks" | "validateBatchAddTasks">;
  readonly resolveProjectKey: (exec: TaskToolExecFace) => string;
}): TaskToolDefinition {
  return {
    name: "batch_add_tasks",
    description: BATCH_ADD_TASKS_DESCRIPTION,
    parameters: BATCH_PARAMETERS,
    output: {
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          slug: { type: "string" },
          summary: {
            type: "object",
            properties: { added: { type: "integer" }, reused: { type: "integer" } },
          },
          results: { type: "array", items: { type: "object" } },
          errors: { type: "array", items: { type: "object" } },
        },
        required: ["ok", "slug"],
      },
      render: (_args, value): readonly { readonly type: "text"; readonly text: string }[] => {
        const r = value as BatchAddTasksToolResult;
        const lines: string[] = [];
        if (r.ok) {
          lines.push(`batch_add_tasks ok: ${r.summary?.added ?? 0} added, ${r.summary?.reused ?? 0} reused (slug ${r.slug}).`);
          for (const item of r.results ?? []) {
            lines.push(`- [${item.status}] ${item.localId} → ${item.slug}/${item.taskId}`);
          }
        } else {
          lines.push(`batch_add_tasks rejected — ${r.errors?.length ?? 0} violation(s), nothing was written. Fix every item and resubmit the whole batch:`);
          for (const e of r.errors ?? []) {
            lines.push(`- [#${e.index}] ${e.field} ${e.code}: ${e.message} (fix: ${e.fix_hint})`);
          }
        }
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<BatchAddTasksToolResult> {
      if (typeof args !== "object" || args === null) {
        throw new Error("batch_add_tasks: arguments must be an object");
      }
      const a = args as Record<string, unknown>;
      if (typeof a.slug !== "string" || a.slug.trim() === "") {
        throw new Error("batch_add_tasks: slug is required (non-empty string)");
      }
      if (!Array.isArray(a.tasks)) {
        throw new Error("batch_add_tasks: tasks must be an array");
      }
      const slug = a.slug;
      const projectKey = deps.resolveProjectKey(exec);
      const errors: BatchToolItemError[] = [];
      const items: BatchAddTaskItem[] = [];
      a.tasks.forEach((raw, index) => {
        if (typeof raw !== "object" || raw === null) {
          errors.push({ index, field: "tasks", code: "ERR_INPUT_CONTRACT", message: "tasks 元素必须是对象", fix_hint: "每条任务项 = { local_id, title, type, ... } 对象" });
          return;
        }
        const item = parseItem(index, raw as BatchAddTaskItemArgs, errors);
        if (item !== undefined) items.push(item);
      });
      if (items.length === 0) return { ok: false, slug, errors }; // 全部条目形制不可解析

      try {
        // 解析层错与域层校验错合并一次报全（域 dry-run 校验器单点——零 db 写点保证）
        const domainErrors = await deps.tasks.validateBatchAddTasks({ projectKey, slug, tasks: items });
        const all = [
          ...errors,
          ...domainErrors.map((err) => ({ ...err, field: snakeField(err.field), fix_hint: err.fixHint }) as BatchToolItemError),
        ].sort((x, y) => x.index - y.index); // 条目序收集制——逐条按 index 升序报全
        if (all.length > 0) return { ok: false, slug, errors: all };
        const r = await deps.tasks.batchAddTasks({ projectKey, slug, tasks: items });
        return { ok: true, slug, results: r.results, summary: r.summary };
      } catch (e) {
        if (e instanceof BatchInvalidError || e instanceof ContainerSlugInvalidError) {
          const data = (e as BatchInvalidError).data;
          const list = "errors" in data ? (data.errors as readonly BatchItemError[]) : [];
          return {
            ok: false,
            slug,
            errors: [
              ...errors,
              ...list.map((err) => ({ index: err.index, field: snakeField(err.field), code: err.code, message: err.message, fix_hint: err.fixHint })),
            ],
          };
        }
        throw e;
      }
    },
  };
}
