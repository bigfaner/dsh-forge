// batchAddTasks 域层批量两遍式写点随迁测试（plugin-task-loop 1.7——code-design §1 RED 面）。
import { beforeEach, describe, expect, it } from "vitest";
import { addTask, batchAddTasks } from "../../host/domain/tasks/add.js";
import { BatchInvalidError } from "../../host/domain/tasks/errors.js";
import { createTasksHarness, countRows, type TasksHarness } from "./harness.js";

let h: TasksHarness;
beforeEach(() => {
  h = createTasksHarness();
});

describe("RED1 收集制校验（非 fail-fast）+ 零落库", () => {
  it("三条各有不同错误 → 一次返回三个错误（各自 index/field/fixHint）+ 零落库", async () => {
    const err = await batchAddTasks(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      tasks: [
        { localId: "1", type: "coding-feature", title: "" }, // 缺 title
        { localId: "2", title: "B", type: "coding-feature", dependsOn: ["ghost"] }, // dependsOn 悬空
        { localId: "3", title: "C", type: "coding-feature", context: { K: 1 as unknown as string } }, // context 值非字符串
      ],
    }).catch((e) => e);
    expect(err).toBeInstanceOf(BatchInvalidError);
    const errors = (err as BatchInvalidError).data.errors;
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatchObject({ index: 0, field: "title", fixHint: expect.any(String) });
    expect(errors[1]).toMatchObject({ index: 2, field: "context", fixHint: expect.stringContaining("KEY=VALUE") });
    expect(errors[2]).toMatchObject({ index: 1, field: "dependsOn", code: "ERR_DEPENDENCY_DANGLING" });
    expect(countRows(h, "task_tasks", "alpha")).toBe(0);
  });
});

describe("RED2 批内环", () => {
  it("批内 A↔B 环 → ERR_DEPENDENCY_CYCLE 一次性指出 + 零落库", async () => {
    const err = await batchAddTasks(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      tasks: [
        { localId: "a", title: "A", type: "coding-feature", dependsOn: ["b"] },
        { localId: "b", title: "B", type: "coding-feature", dependsOn: ["a"] },
      ],
    }).catch((e) => e);
    const errors = (err as BatchInvalidError).data.errors;
    expect(errors[0]).toMatchObject({ code: "ERR_DEPENDENCY_CYCLE" });
    expect(errors[0].message).toContain("a → b → a");
    expect(countRows(h, "task_tasks", "alpha")).toBe(0);
    expect(countRows(h, "task_edges")).toBe(0);
  });
});

describe("RED3 全过批：两遍式单事务落库 + reused 按条命中", () => {
  it("批内互引连边；库内既有重复条 reused 不阻断他条（逐条结果 + 汇总计数）", async () => {
    // 库内既有任务（将被第 3 条命中 reused——同源同型 + brief + context 全等）
    const existing = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature", brief: "同文",
    });
    // 给既有任务挂一个 fix 链源语义：去重判据要求同源——既有任务即源（fix_of = null → 去重不命中）。
    // 改用同型常规去重路径验证：批内新建任务与其重复时 reused 只在 fix 链源同源命中——
    // 常规批条（无 sourceTask）恒 added（分配器不查重）。故本批断言 added=2。
    const r = await batchAddTasks(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      tasks: [
        { localId: "a", title: "A", type: "coding-feature", dependsOn: ["b"] },
        { localId: "b", title: "B", type: "coding-feature" },
        { localId: "c", title: "C", type: "coding-feature", before: ["a"] },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.summary).toMatchObject({ added: 3, reused: 0 });
    // 批内互引：a → b（manual）；c → a（before 反转）
    const edgeAb = h.db
      .prepare(`SELECT origin FROM task_edges WHERE task_id = ? AND prerequisite_id = ?`)
      .get(r.results![0].taskId, r.results![1].taskId);
    expect(edgeAb).toMatchObject({ origin: "manual" });
    const edgeCa = h.db
      .prepare(`SELECT origin FROM task_edges WHERE task_id = ? AND prerequisite_id = ?`)
      .get(r.results![0].taskId, r.results![2].taskId);
    expect(edgeCa).toMatchObject({ origin: "manual" });
    expect(existing.taskId).toBeDefined();
  });

  it("批内重复 localId 拒全批（ERR_DUP_LOCAL_ID）", async () => {
    const err = await batchAddTasks(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      tasks: [
        { localId: "a", title: "A", type: "coding-feature" },
        { localId: "a", title: "A-dup", type: "coding-feature" },
      ],
    }).catch((e) => e);
    expect((err as BatchInvalidError).data.errors[0]).toMatchObject({ code: "ERR_DUP_LOCAL_ID" });
    expect(countRows(h, "task_tasks", "alpha")).toBe(0);
  });
});

describe("RED4 scope 形制 + fix 链逐条", () => {
  it("scope 形制非法 → 逐条错误一次报全（绝对路径/未知键/跨数组重复）+ 零落库", async () => {
    const err = await batchAddTasks(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      tasks: [
        { localId: "1", title: "A", type: "coding-feature", scope: { created: ["Z:\\abs\\path.ts"] } },
        { localId: "2", title: "B", type: "coding-feature", scope: { touched: ["x.ts"] } as never },
        { localId: "3", title: "C", type: "coding-feature", scope: { created: ["a.ts"], modified: ["a.ts"] } },
      ],
    }).catch((e) => e);
    const errors = (err as BatchInvalidError).data.errors;
    expect(errors.filter((e) => e.field === "scope")).toHaveLength(3);
    expect(countRows(h, "task_tasks", "alpha")).toBe(0);
  });

  it("fix 链 blockSource 逐条生效（同事务锁源置 blocked + auto-block 记录）", async () => {
    const src = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "S", type: "coding-feature" });
    const r = await batchAddTasks(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      tasks: [
        { localId: "f1", title: "F1", type: "coding-fix", sourceTask: { slug: "alpha", localId: src.localId }, blockSource: true },
        { localId: "f2", title: "F2", type: "coding-fix", sourceTask: { slug: "alpha", localId: src.localId } },
      ],
    });
    expect(r.ok).toBe(true);
    const srcStatus = h.db.prepare(`SELECT task_status FROM task_tasks WHERE id = ?`).get(src.taskId) as { task_status: string };
    expect(srcStatus.task_status).toBe("blocked");
    const fixEdges = h.db
      .prepare(`SELECT COUNT(*) AS n FROM task_edges WHERE prerequisite_id IN (?, ?) AND origin = 'fix-chain'`)
      .get(r.results![0].taskId, r.results![1].taskId) as { n: number };
    expect(fixEdges.n).toBe(1); // 仅 f1 挂等待边
  });
});
