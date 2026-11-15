// batchAddTasks 批量工具测试（plugin-task-loop 1.10——tool = 域服务薄封装 + dry-run
// 收集制校验错误信封 {index, field, code, message, fix_hint} + BATCH_ADD_TASKS_DESCRIPTION
// 九条规则 Hint）。RED 面 = code-design §1。
import { beforeEach, describe, expect, it } from "vitest";
import { createBatchAddTasksTool, BATCH_ADD_TASKS_DESCRIPTION } from "../../host/tools/batch-add-tasks.js";
import { createTasksService } from "../../host/domain/tasks/service.js";
import { createTasksHarness, countRows, type EventSpy, type TasksHarness } from "../domain-tasks/harness.js";

let h: TasksHarness;
let emitted: string[];
let events: EventSpy;
let exec: (args: unknown) => Promise<{ ok: boolean; errors?: readonly unknown[]; summary?: { added: number; reused: number }; results?: readonly unknown[] }>;

beforeEach(() => {
  h = createTasksHarness();
  emitted = [];
  events = { emitted, emitTasksChanged: (pk: string) => void emitted.push(pk) };
  const service = createTasksService({ db: h.db, events, resolveWsPath: () => "" });
  const tool = createBatchAddTasksTool({ tasks: service, resolveProjectKey: () => h.projectKey });
  exec = async (args: unknown) => (await tool.execute(args, {})) as Awaited<ReturnType<typeof exec>>;
});

describe("RED1 收集制校验（非 fail-fast）+ 零落库", () => {
  it("三异质错一次报全（各自 index/field/fix_hint）+ 零落库", async () => {
    const r = await exec({
      slug: "alpha",
      tasks: [
        { local_id: "1", type: "coding-feature" }, // 缺 title
        { local_id: "2", title: "B", type: "coding-feature", depends_on: ["ghost"] }, // 悬空引用
        { local_id: "3", title: "C", type: "coding-feature", context: ["K without V"] }, // context 非法 KEY=VALUE
      ],
    });
    expect(r.ok).toBe(false);
    const errors = r.errors as Array<{ index: number; field: string; code: string; message: string; fix_hint: string }>;
    expect(errors).toHaveLength(3); // 一次性收集齐，非逐条短路
    expect(errors[0]).toMatchObject({ index: 0, field: "title", fix_hint: expect.any(String) });
    expect(errors[1]).toMatchObject({ index: 1, field: "depends_on", code: "ERR_DEPENDENCY_DANGLING" });
    expect(errors[2]).toMatchObject({ index: 2, field: "context", fix_hint: expect.stringContaining("KEY=VALUE") });
    expect(countRows(h, "task_tasks", "alpha")).toBe(0); // 校验失败零落库
  });
});

describe("RED2 批内环", () => {
  it("批内 A↔B 环 → ERR_DEPENDENCY_CYCLE 一次性指出 + 零落库", async () => {
    const r = await exec({
      slug: "alpha",
      tasks: [
        { local_id: "a", title: "A", type: "coding-feature", depends_on: ["b"] },
        { local_id: "b", title: "B", type: "coding-feature", depends_on: ["a"] },
      ],
    });
    expect(r.ok).toBe(false);
    const errors = r.errors as Array<{ code: string; message: string }>;
    expect(errors[0]).toMatchObject({ code: "ERR_DEPENDENCY_CYCLE" });
    expect(errors[0].message).toContain("a → b → a");
    expect(countRows(h, "task_tasks", "alpha")).toBe(0);
    expect(countRows(h, "task_edges")).toBe(0);
  });
});

describe("RED3 全过批：两遍式单事务落库 + reused 按条命中", () => {
  it("批内互引连边；reused 按条命中不阻断他条（逐条结果 + 汇总计数）", async () => {
    // 库内既有 fix 链源 + 活 fix 任务（与批条同型同 brief 同 context → reused 命中）
    const src = await import("../../host/domain/tasks/add.js").then((m) =>
      m.addTask({ db: h.db, events }, { projectKey: h.projectKey, slug: "alpha", title: "S", type: "coding-feature" }),
    );
    h.db
      .prepare(
        `INSERT INTO task_tasks (id, slug, local_id, title, task_type, task_status, brief, ac_json, priority,
           estimated_time, scope_json, context_json, fix_of_task_id, breaking, coverage_threshold, complexity,
           project_key, created_at, updated_at)
         VALUES ('t-fix', 'alpha', 'f0', 'F', 'coding-fix', 'pending', '同文', NULL, NULL, NULL, NULL, '{}', ?, 0, NULL, 'medium', ?, ?, ?)`,
      )
      .run(src.taskId, h.projectKey, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    const r = await exec({
      slug: "alpha",
      tasks: [
        { local_id: "a", title: "F", type: "coding-fix", brief: "同文", context: [], source_task_slug: "alpha", source_task_local_id: src.localId },
        { local_id: "b", title: "B", type: "coding-feature", depends_on: ["a"] }, // 批内互引
        { local_id: "c", title: "C", type: "coding-feature", before: ["b"] },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.summary).toMatchObject({ added: 2, reused: 1 });
    // 互引连通：b → a（reused 行 id 亦被批内引用解析命中）
    const results = r.results as Array<{ localId: string; taskId: string; status: string }>;
    const a = results.find((x) => x.localId === "a")!;
    const b = results.find((x) => x.localId === "b")!;
    expect(a.status).toBe("reused");
    expect(b.status).toBe("added");
    const edge = h.db.prepare(`SELECT origin FROM task_edges WHERE task_id = ? AND prerequisite_id = ?`).get(b.taskId, a.taskId);
    expect(edge).toMatchObject({ origin: "manual" });
    expect(emitted).toContain(h.projectKey); // 写后事件发射
  });

  it("批内重复 local_id 拒全批（ERR_DUP_LOCAL_ID）+ 零落库", async () => {
    const r = await exec({
      slug: "alpha",
      tasks: [
        { local_id: "a", title: "A", type: "coding-feature" },
        { local_id: "a", title: "A-dup", type: "coding-feature" },
      ],
    });
    expect(r.ok).toBe(false);
    const errors = r.errors as Array<{ code: string }>;
    expect(errors[0]).toMatchObject({ code: "ERR_DUP_LOCAL_ID" });
    expect(countRows(h, "task_tasks", "alpha")).toBe(0);
  });
});

describe("RED4 scope 三键形制逐条精确 + 零落库", () => {
  it("绝对路径/未知键/跨数组重复三错一次报全（专码逐条在场）", async () => {
    const r = await exec({
      slug: "alpha",
      tasks: [
        { local_id: "1", title: "A", type: "coding-feature", scope: { created: ["Z:\\abs\\path.ts"] } },
        { local_id: "2", title: "B", type: "coding-feature", scope: { touched: ["x.ts"] } },
        { local_id: "3", title: "C", type: "coding-feature", scope: { created: ["a.ts"], modified: ["a.ts"] } },
      ],
    });
    expect(r.ok).toBe(false);
    const errors = r.errors as Array<{ index: number; field: string; code: string }>;
    expect(errors).toHaveLength(3); // 收集制：三条形制错误一次报全
    expect(errors[0]).toMatchObject({ index: 0, field: "scope", code: "ERR_SCOPE_ABSOLUTE_PATH" });
    expect(errors[1]).toMatchObject({ index: 1, field: "scope", code: "ERR_SCOPE_UNKNOWN_KEY" });
    expect(errors[2]).toMatchObject({ index: 2, field: "scope", code: "ERR_SCOPE_CROSS_ARRAY_DUP" });
    expect(countRows(h, "task_tasks", "alpha")).toBe(0);
  });

  it("context 重复键在工具解析层逐条收集（ERR_CONTEXT_INVALID）", async () => {
    const r = await exec({
      slug: "alpha",
      tasks: [
        { local_id: "1", title: "A", type: "coding-feature", context: ["K=1", "K=2"] },
      ],
    });
    expect(r.ok).toBe(false);
    const errors = r.errors as Array<{ index: number; field: string; code: string; fix_hint: string }>;
    expect(errors[0]).toMatchObject({ index: 0, field: "context", code: "ERR_CONTEXT_INVALID" });
    expect(errors[0].fix_hint).toContain("KEY=VALUE");
    expect(countRows(h, "task_tasks", "alpha")).toBe(0);
  });
});

describe("BATCH_ADD_TASKS_DESCRIPTION Hint（九条规则全文落位）", () => {
  it("规则 1-9 逐条在场且与工具名/校验面同源", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(BATCH_ADD_TASKS_DESCRIPTION).toContain(`${n}.`);
    }
    expect(BATCH_ADD_TASKS_DESCRIPTION).toContain("localId");
    expect(BATCH_ADD_TASKS_DESCRIPTION).toContain("KEY=VALUE");
    expect(BATCH_ADD_TASKS_DESCRIPTION).toContain('{"created":[],"modified":[],"removed":[]}');
    expect(BATCH_ADD_TASKS_DESCRIPTION).toContain("VERBATIM");
    expect(BATCH_ADD_TASKS_DESCRIPTION).toContain("cyclic");
  });
});
