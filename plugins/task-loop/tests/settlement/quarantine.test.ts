// 隔离区测试（plugin-task-loop 1.8——formal-verification I10 + entities.md §3.2 处方 8）：
// 派生失败拒写 → pending/ 原子 jsonl 暂存 → 重放携原时戳与 (task_id, seq) 身份表达、
// 禁原样回写 id（恒新 UUID）；fixChainRef 重放解析回链首 id；重放幂等（(task_id, seq) 去重）。
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { addTask } from "../../host/domain/tasks/add.js";
import {
  createSettlementRepo,
  pendingDirOf,
  replayPendingSettlements,
  stagePendingSettlement,
  type PendingSettlementPayload,
} from "../../host/db/repositories/settlement-repo.js";
import { submitTask } from "../../host/domain/tasks/submit.js";
import { createTasksHarness, type TasksHarness } from "../domain-tasks/harness.js";

let h: TasksHarness;
let home: string;
beforeEach(() => {
  h = createTasksHarness();
  home = mkdtempSync(join(tmpdir(), "task-loop-pending-"));
});

function stagedFiles(): string[] {
  return readdirSync(pendingDirOf(home)).filter((f) => f.endsWith(".jsonl"));
}

describe("派生失败拒写 → 隔离区暂存 → 重放", () => {
  it("projectKey 空 + 暂存缝在场：拒写（ERR_PROJECT_KEY_DERIVATION）且载荷不丢 → 重放落库携原时戳、新 UUID、隔离区清空", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const staged: PendingSettlementPayload[] = [];
    const deps = { ...h.verbDeps, stagePendingSettlement: (p: PendingSettlementPayload) => staged.push(p) };
    await expect(
      submitTask(deps, {
        projectKey: "",
        taskRef: { slug: "alpha", localId: t.localId },
        result: "blocked",
        reason: "派生失败结算",
        blockClassification: { kind: "new-problem" },
      }),
    ).rejects.toThrow(/ERR_PROJECT_KEY_DERIVATION/);
    expect(staged).toHaveLength(1);
    // 经装配单源落盘（原子 jsonl）
    stagePendingSettlement(home, staged[0]!);
    expect(stagedFiles()).toHaveLength(1);

    const report = replayPendingSettlements(h.db, home);
    expect(report).toMatchObject({ replayed: 1, skipped: 0, failed: [] });
    expect(stagedFiles()).toHaveLength(0); // 重放成功后隔离区清空
    const rows = createSettlementRepo(h.db).listByTask(t.taskId);
    expect(rows).toHaveLength(1);
    expect(rows[0].created_at).toBe(staged[0]!.createdAt); // 原结算时戳携回写
    expect(rows[0].result).toBe("blocked");
    expect(JSON.parse(rows[0].evidence_json)).toMatchObject({ reason: "派生失败结算" });
    // 禁原样回写 id：暂存载荷零 id 字段，落库行恒写入点新 UUID
    expect("id" in staged[0]!).toBe(false);
    expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("暂存缝缺席：派生失败纯拒写 fail-loud（零暂存零落库）", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    await expect(
      submitTask(h.verbDeps, {
        projectKey: "",
        taskRef: { slug: "alpha", localId: t.localId },
        result: "blocked",
        reason: "x",
        blockClassification: { kind: "new-problem" },
      }),
    ).rejects.toThrow(/ERR_PROJECT_KEY_DERIVATION/);
    expect((h.db.prepare(`SELECT COUNT(*) AS n FROM task_settlements`).get() as { n: number }).n).toBe(0);
  });

  it("(task_id, seq) 身份表达：重放保原 seq；fixChainRef 解析回链首 id（禁原样回写暂存 id）", () => {
    const t1 = h.db
      .prepare(
        `INSERT INTO task_tasks (id, slug, local_id, title, task_type, project_key, created_at, updated_at)
         VALUES ('t-root', 'alpha', '1.1', 'R', 'coding-feature', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      .run(h.projectKey);
    void t1;
    const repo = createSettlementRepo(h.db);
    const s1 = repo.appendSettlement({
      taskId: "t-root",
      result: "blocked",
      acResults: [],
      evidence: { reason: "根 blocked" },
      createdAt: "2026-01-01T01:00:00.000Z",
    });
    h.db
      .prepare(
        `INSERT INTO task_tasks (id, slug, local_id, title, task_type, task_status, fix_of_task_id, project_key, created_at, updated_at)
         VALUES ('t-fix', 'alpha', 'fix-1', 'F', 'coding-fix', 'in_progress', 't-root', ?, '2026-01-01T02:00:00.000Z', '2026-01-01T02:00:00.000Z')`,
      )
      .run(h.projectKey);
    const payload: PendingSettlementPayload = {
      taskId: "t-fix",
      seq: 3,
      result: "success",
      acResults: [],
      commitHash: "c9",
      evidence: { summary: "重放修复" },
      createdAt: "2026-01-01T03:00:00.000Z",
      fixChainRef: { taskId: "t-root", seq: s1.seq },
    };
    stagePendingSettlement(home, payload);
    const report = replayPendingSettlements(h.db, home);
    expect(report.replayed).toBe(1);
    const s2 = repo.listByTask("t-fix")[0];
    expect(s2.seq).toBe(3); // 原序值保真
    expect(s2.created_at).toBe(payload.createdAt);
    expect(s2.fix_root_id).toBe(s1.id); // (task_id, seq) → 链首结算 id
    expect(s2.id).not.toBe(s1.id);
  });

  it("重放幂等（(task_id, seq) 去重）+ 未落库 fixChainRef/未命中任务入 failed 保留在盘", () => {
    const t = h.db
      .prepare(
        `INSERT INTO task_tasks (id, slug, local_id, title, task_type, project_key, created_at, updated_at)
         VALUES ('t-x', 'alpha', '1.1', 'X', 'coding-feature', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      .run(h.projectKey);
    void t;
    const payload: PendingSettlementPayload = {
      taskId: "t-x",
      seq: 1,
      result: "success",
      acResults: [],
      evidence: { summary: "幂等" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    stagePendingSettlement(home, payload);
    expect(replayPendingSettlements(h.db, home).replayed).toBe(1);
    // 重灌同一载荷（crash 态 ③：入库后暂存删除前崩）→ 去重 skip，行数不变
    stagePendingSettlement(home, payload);
    const report = replayPendingSettlements(h.db, home);
    expect(report).toMatchObject({ replayed: 0, skipped: 1, failed: [] });
    expect((h.db.prepare(`SELECT COUNT(*) AS n FROM task_settlements`).get() as { n: number }).n).toBe(1);

    // 未命中任务 → failed 保留在盘（证据不丢）；fix 任务 fixChainRef 未落库同径
    stagePendingSettlement(home, { ...payload, taskId: "t-missing" });
    h.db
      .prepare(
        `INSERT INTO task_tasks (id, slug, local_id, title, task_type, task_status, fix_of_task_id, project_key, created_at, updated_at)
         VALUES ('t-fix2', 'alpha', 'fix-1', 'F', 'coding-fix', 'in_progress', 't-x', ?, '2026-01-01T04:00:00.000Z', '2026-01-01T04:00:00.000Z')`,
      )
      .run(h.projectKey);
    stagePendingSettlement(home, {
      ...payload,
      taskId: "t-fix2",
      seq: 2,
      fixChainRef: { taskId: "t-x", seq: 99 },
      result: "blocked",
      evidence: { reason: "链缺失" },
    });
    const r2 = replayPendingSettlements(h.db, home);
    expect(r2.failed).toHaveLength(2);
    expect(stagedFiles()).toHaveLength(2);
    expect(readFileSync(join(pendingDirOf(home), stagedFiles()[0]!), "utf8").trim().split("\n")).toHaveLength(1);
  });
});
