// settlement 批量最新结算读面测试（latestSettlementsByTask——typert forgeTasks DTO 聚合
// AC 进度的数据源）：每 task 恰取最新一行（排序锚 created_at, seq, id 逆序）+ 容器/slug
// 限定 + 多容器批量一次取齐。
import { beforeEach, describe, expect, it } from "vitest";
import { createSettlementRepo } from "../../host/db/repositories/settlement-repo.js";
import { createTasksHarness, seedTask, type TasksHarness } from "../domain-tasks/harness.js";

let h: TasksHarness;
beforeEach(() => {
  h = createTasksHarness();
});

describe("latestSettlementsByTask（批量最新结算行单源）", () => {
  it("每 task 恰取最新一行：多结算行按 (created_at, seq) 取末行", () => {
    const t1 = seedTask(h, "alpha", "1", { status: "completed" });
    seedTask(h, "alpha", "2", { status: "completed" });
    const repo = createSettlementRepo(h.db);
    repo.appendSettlement({ taskId: t1, result: "blocked", acResults: [], evidence: { reason: "红了" }, createdAt: "2026-01-01T00:00:00.000Z" });
    repo.appendSettlement({ taskId: t1, result: "success", acResults: [{ criterion: "判据", met: true }], commitHash: "abc123", evidence: { summary: "收口" }, createdAt: "2026-01-02T00:00:00.000Z" });
    repo.appendSettlement({ taskId: t1, result: "success", acResults: [{ criterion: "判据", met: true }, { criterion: "判据二", met: false }], commitHash: "def456", evidence: { summary: "补提交" }, createdAt: "2026-01-02T00:00:00.000Z" });

    const rows = repo.latestSettlementsByTask(h.projectKey, ["alpha"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ task_id: t1, result: "success", commit_hash: "def456" });
    expect(JSON.parse(rows[0]!.ac_results_json)).toHaveLength(2);
  });

  it("多 slug 批量一次取齐 + 每 task 各一行；无结算行任务不入列", () => {
    const t1 = seedTask(h, "alpha", "1", { status: "completed" });
    const t2 = seedTask(h, "alpha", "2", { status: "completed" });
    seedTask(h, "alpha", "3", { status: "in_progress" });
    const repo = createSettlementRepo(h.db);
    repo.appendSettlement({ taskId: t1, result: "success", acResults: [], evidence: { summary: "a" }, createdAt: "2026-01-01T00:00:00.000Z" });
    repo.appendSettlement({ taskId: t2, result: "blocked", acResults: [], evidence: { reason: "b" }, createdAt: "2026-01-01T00:00:00.000Z" });

    const rows = repo.latestSettlementsByTask(h.projectKey, ["alpha"]);
    expect(rows.map((r) => r.task_id).sort()).toEqual([t1, t2].sort());
  });

  it("slug 集空 = 零查询零行；跨容器隔离（project_key 归属谓词）", () => {
    seedTask(h, "alpha", "1", { status: "completed" });
    const repo = createSettlementRepo(h.db);
    expect(repo.latestSettlementsByTask(h.projectKey, [])).toEqual([]);
    expect(repo.latestSettlementsByTask("other-project", ["alpha"])).toEqual([]);
  });
});
