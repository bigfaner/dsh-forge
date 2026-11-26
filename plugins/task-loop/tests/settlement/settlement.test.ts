// 模块②结算单源测试（plugin-task-loop 1.8）：submitTask 单事务两写（拆条即 RED——
// settlement INSERT 强制失败时任务终态迁移必须整体回滚）+ ac_results_json 单列同位 +
// evidence_json 两形（success 四键 / blocked reason 必填）+ records 纯轨迹（note 封闭）。
import { beforeEach, describe, expect, it } from "vitest";
import { addTask } from "../../host/domain/tasks/add.js";
import { claimTask } from "../../host/domain/tasks/claim.js";
import { createSettlementRepo } from "../../host/db/repositories/settlement-repo.js";
import { submitTask } from "../../host/domain/tasks/submit.js";
import { createTasksHarness, type TasksHarness } from "../domain-tasks/harness.js";

let h: TasksHarness;
beforeEach(() => {
  h = createTasksHarness();
});

const claim = () => claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "sess-1", source: { slug: "alpha" } });

async function inFlightTask(acceptance: string[] = []) {
  const t = await addTask(h.verbDeps, {
    projectKey: h.projectKey,
    slug: "alpha",
    title: "T",
    type: "coding-feature",
    ...(acceptance.length > 0 ? { acceptanceCriteria: acceptance } : {}),
  });
  await claim();
  return t;
}

describe("submitTask 单事务两写（模块②终态）", () => {
  it("success：任务终态迁移 + settlement append 同事务（seq=1 + ac_results_json 单列 + evidence 四键）", async () => {
    const t = await inFlightTask(["判据一"]);
    await submitTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "alpha", localId: t.localId },
      result: "success",
      summary: "收口",
      gate: { compile: true, fmt: true, lint: true, test: true, coverage: 0.9 },
      acceptanceCriteria: [{ criterion: "判据一", met: true, evidence: "vitest run 12 passed" }],
      commitHash: "abc123",
      files: ["a.ts"],
      keyDecisions: ["决策"],
      testsPassed: 12,
    });
    expect(h.db.prepare(`SELECT task_status FROM task_tasks WHERE id = ?`).get(t.taskId)).toMatchObject({
      task_status: "completed",
    });
    const rows = createSettlementRepo(h.db).listByTask(t.taskId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ task_id: t.taskId, seq: 1, result: "success", commit_hash: "abc123", fix_root_id: null });
    expect(JSON.parse(rows[0].ac_results_json)).toEqual([{ criterion: "判据一", met: true, evidence: "vitest run 12 passed" }]);
    const evidence = JSON.parse(rows[0].evidence_json) as Record<string, unknown>;
    expect(Object.keys(evidence)).toEqual(["summary", "gates", "files", "fields"]);
    expect(evidence.summary).toBe("收口");
    expect(evidence.files).toEqual(["a.ts"]);
    expect(evidence.gates).toMatchObject({ test: true, coverage: 0.9 });
    expect(rows[0].created_at).toBeTruthy();
  });

  it("拆条即 RED：settlement INSERT 强制失败 → 任务终态迁移整体回滚（零半态）", async () => {
    const t = await inFlightTask();
    h.db
      .prepare(
        `CREATE TRIGGER trg_test_force_fail BEFORE INSERT ON task_settlements
         WHEN NEW.result = 'blocked' BEGIN SELECT RAISE(ABORT, 'forced failure'); END`,
      )
      .run();
    await expect(
      submitTask(h.verbDeps, {
        projectKey: h.projectKey,
        taskRef: { slug: "alpha", localId: t.localId },
        result: "blocked",
        reason: "红了",
        blockClassification: { kind: "new-problem" },
      }),
    ).rejects.toThrow();
    // UPDATE 与 INSERT 同事务：INSERT 被拒 → 终态迁移回滚，任务保持 claim 态可重提交
    expect(h.db.prepare(`SELECT task_status FROM task_tasks WHERE id = ?`).get(t.taskId)).toMatchObject({
      task_status: "in_progress",
    });
    expect((h.db.prepare(`SELECT COUNT(*) AS n FROM task_settlements`).get() as { n: number }).n).toBe(0);
    expect(
      (h.db.prepare(`SELECT COUNT(*) AS n FROM task_records WHERE verb = 'submit'`).get() as { n: number }).n,
    ).toBe(0);
  });

  it("blocked：evidence 两形（reason 必填 + 可选键随携）+ records 纯轨迹（note 对 submit 封闭）", async () => {
    const t = await inFlightTask();
    await submitTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "alpha", localId: t.localId },
      result: "blocked",
      reason: "测试红",
      blockClassification: { kind: "new-problem" },
      gate: { test: false },
    });
    const rows = createSettlementRepo(h.db).listByTask(t.taskId);
    expect(rows).toHaveLength(1);
    expect(rows[0].result).toBe("blocked");
    const evidence = JSON.parse(rows[0].evidence_json) as Record<string, unknown>;
    expect(evidence.reason).toBe("测试红");
    expect(evidence.gates).toMatchObject({ test: false });
    expect(evidence.fields).toMatchObject({ blockClassification: { kind: "new-problem" } });
    const rec = h.db
      .prepare(`SELECT note, payload_json, from_status, to_status FROM task_records WHERE task_id = ? AND verb = 'submit'`)
      .get(t.taskId) as { note: string | null; payload_json: string | null; from_status: string; to_status: string };
    expect(rec.note).toBeNull(); // 纯轨迹——reason 不再暂承 note
    expect(rec.payload_json).toBeNull(); // payload 列对 submit 载荷封闭
    expect(rec.from_status).toBe("in_progress");
    expect(rec.to_status).toBe("blocked");
  });

  it("appendSettlement 唯一写径：seq 链内 max+1 单调 + listByTask 排序锚 created_at, seq, id", async () => {
    const t = await inFlightTask();
    const repo = createSettlementRepo(h.db);
    // 原时戳直写（createdAt 缝）：早于后续 append 时戳 → 排序仍按 created_at, seq, id
    repo.appendSettlement({
      taskId: t.taskId,
      result: "blocked",
      acResults: [],
      evidence: { reason: "早" },
      createdAt: "2025-01-01T00:00:00.000Z",
    });
    const r2 = repo.appendSettlement({ taskId: t.taskId, result: "success", acResults: [], evidence: { summary: "晚" } });
    expect(r2.seq).toBe(2);
    const rows = repo.listByTask(t.taskId);
    expect(rows.map((r) => r.seq)).toEqual([1, 2]); // created_at 首键：2025-01-01 在前
    expect(rows.map((r) => r.result)).toEqual(["blocked", "success"]);
  });
});
