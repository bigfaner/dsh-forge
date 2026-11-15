// submit_task 工具层契约测试（plugin-task-loop 1.11——提案裁决两处改造面）：
// ① ac_results 单数组解析（合法 / 缺 criterion / met 形状错 / 空/非数组拒）；
// ② runtime_face 更名（旧 runtime_surface 入参被拒、新参走通域 runtimeFace 径）；
// ③ gate all-or-none（半门 / 孤 coverage 拒）。
import { beforeEach, describe, expect, it } from "vitest";
import { acResultsOf, createSubmitTaskTool, gateOf } from "../../host/tools/submit-task.js";
import { createTasksHarness, type TasksHarness } from "../domain-tasks/harness.js";

const NOW = "2026-01-01T00:00:00.000Z";

let h: TasksHarness;
let exec: (args: Record<string, unknown>) => Promise<{ taskId: string; status: string }>;

beforeEach(() => {
  h = createTasksHarness();
  const tool = createSubmitTaskTool({ verbDeps: h.verbDeps, resolveProjectKey: () => h.projectKey });
  exec = async (args: Record<string, unknown>) =>
    (await tool.execute({ slug: "alpha", local_id: "1", ...args }, {})) as Awaited<ReturnType<typeof exec>>;
});

/** 种 in_progress 任务（ac_json 可选——AC 证据门用） */
function seedInProgress(acJson: string[] | null, type = "coding-feature"): string {
  const id = "t-alpha-1";
  h.db
    .prepare(
      `INSERT INTO task_tasks (id, slug, local_id, title, task_type, task_status, brief, ac_json, priority,
         estimated_time, scope_json, context_json, fix_of_task_id, breaking, coverage_threshold, complexity,
         project_key, created_at, updated_at)
       VALUES (?, 'alpha', '1', 'T1', ?, 'in_progress', NULL, ?, NULL, NULL, NULL, NULL, NULL, 0, NULL, 'medium', ?, ?, ?)`,
    )
    .run(id, type, acJson === null ? null : JSON.stringify(acJson), h.projectKey, NOW, NOW);
  return id;
}

describe("ac_results 单数组解析", () => {
  it("合法单数组映射域 acceptanceCriteria（success 结算走通 + AC 证据门过）", async () => {
    const id = seedInProgress(["判据 A", "判据 B"]);
    const r = await exec({
      result: "success",
      summary: "done",
      gate_compile: true,
      gate_fmt: true,
      gate_lint: true,
      gate_test: true,
      ac_results: [
        { criterion: "判据 A", met: true, evidence: "vitest run — 3 passed" },
        { criterion: "判据 B", met: true },
      ],
    });
    expect(r.status).toBe("completed");
    const row = h.db.prepare(`SELECT task_status FROM task_tasks WHERE id = ?`).get(id) as { task_status: string };
    expect(row.task_status).toBe("completed");
    // settlement ac_results_json 同位快照落位
    const acRow = h.db.prepare(`SELECT ac_results_json FROM task_settlements WHERE task_id = ?`).get(id) as { ac_results_json: string };
    expect(JSON.parse(acRow.ac_results_json)).toEqual([
      { criterion: "判据 A", met: true, evidence: "vitest run — 3 passed" },
      { criterion: "判据 B", met: true },
    ]);
  });

  it("缺 criterion / met 非 bool / 空 evidence 形状错逐项拒", () => {
    expect(() => acResultsOf({ ac_results: [{ met: true }] }, "submit_task")).toThrow(/ac_results\[0\]\.criterion/);
    expect(() => acResultsOf({ ac_results: [{ criterion: "A", met: "yes" }] }, "submit_task")).toThrow(/ac_results\[0\]\.met/);
    expect(() => acResultsOf({ ac_results: [{ criterion: "A", met: true, evidence: "" }] }, "submit_task")).toThrow(/ac_results\[0\]\.evidence/);
    expect(() => acResultsOf({ ac_results: ["A"] }, "submit_task")).toThrow(/ac_results\[0\] must be an object/);
    expect(() => acResultsOf({ ac_results: [] }, "submit_task")).toThrow(/non-empty array/);
    expect(acResultsOf({}, "submit_task")).toBeUndefined(); // 整体缺席 = 不核销
  });

  it("met=false 单项随域 AC 闭环门拒（success 拒绝）", async () => {
    seedInProgress(["A"]);
    await expect(
      exec({
        result: "success",
        summary: "done",
        gate_compile: true,
        gate_fmt: true,
        gate_lint: true,
        gate_test: true,
        ac_results: [{ criterion: "A", met: false }],
      }),
    ).rejects.toThrow();
  });
});

describe("runtime_face 更名（旧 runtime_surface 入参被拒）", () => {
  it("runtime_surface 入参 fail-loud 指认 runtime_face", async () => {
    seedInProgress(null);
    await expect(
      exec({ result: "success", summary: "done", runtime_surface: ["ui"] }),
    ).rejects.toThrow(/runtime_surface was renamed to runtime_face/);
  });

  it("runtime_face + evidence_debt 声明走通（取证债径，域 runtimeFace 键落位）", async () => {
    const id = seedInProgress(null);
    const r = await exec({
      result: "success",
      summary: "done",
      runtime_face: ["web-server"],
      evidence_debt_suite: "e2e",
      evidence_debt_specs: ["specs/a.spec.ts"],
    });
    expect(r.status).toBe("completed");
    const row = h.db.prepare(`SELECT evidence_json FROM task_settlements WHERE task_id = ?`).get(id) as { evidence_json: string };
    const evidence = JSON.parse(row.evidence_json) as { fields?: { runtimeFace?: string[] }; gates?: { evidenceDebt?: { suite: string } } };
    expect(evidence.fields?.runtimeFace).toEqual(["web-server"]);
    expect(evidence.gates?.evidenceDebt).toMatchObject({ suite: "e2e" }); // debt 并 gates 键（buildEvidence 口径）
  });
});

describe("gate all-or-none", () => {
  it("三布尔半门拒 / 孤 gate_coverage 拒 / 四布尔 + coverage 走通", async () => {
    expect(() => gateOf({ gate_compile: true, gate_test: true })).toThrow(/all-or-none/);
    expect(() => gateOf({ gate_coverage: 0.8 })).toThrow(/gate_coverage requires the four gate results/);
    const gate = gateOf({ gate_compile: true, gate_fmt: true, gate_lint: true, gate_test: true, gate_coverage: 0.8 });
    expect(gate).toMatchObject({ compile: true, fmt: true, lint: true, test: true, coverage: 0.8 });
    expect(gateOf({})).toBeUndefined();
  });
});

describe("blocked 双径（T2 归类必带——域门先证透传）", () => {
  it("blocked + reason + 归类走通 → status blocked", async () => {
    const id = seedInProgress(null);
    const r = await exec({
      result: "blocked",
      reason: "外部依赖缺席",
      block_classification_kind: "new-problem",
    });
    expect(r.status).toBe("blocked");
    expect(h.db.prepare(`SELECT task_status FROM task_tasks WHERE id = ?`).get(id)).toMatchObject({ task_status: "blocked" });
  });

  it("blocked 缺归类 → 域 T2 门拒（工具零兜底零静默）", async () => {
    seedInProgress(null);
    await expect(exec({ result: "blocked", reason: "x" })).rejects.toThrow();
  });

  it("recurrence_of 无 kind 成组 → 工具层拒", async () => {
    seedInProgress(null);
    await expect(exec({ result: "blocked", reason: "x", block_classification_recurrence_of: "bug-1" })).rejects.toThrow(
      /requires block_classification_kind/,
    );
  });
});
