// 四指标现算测试（plugin-task-loop 1.9——entities.md §3.2④ pin）：firstPassRate / reworkRatio /
// reviewWaves / fixDensity（fix_root_id 链去重 × 每链最新 success commit_hash 去重 ÷ 已结算任务数）
// + FIX_DENSITY_FORMULA 契约快照 + 时间窗 + project_key/slug 归属限定。
import { beforeEach, describe, expect, it } from "vitest";
import { FIX_DENSITY_FORMULA, computeMetrics } from "../../host/domain/checkpoints/metrics.js";
import { createCheckpointsService } from "../../host/domain/checkpoints/service.js";
import { createSettlementRepo } from "../../host/db/repositories/settlement-repo.js";
import { createTasksHarness, seedTask, type TasksHarness } from "../domain-tasks/harness.js";

let h: TasksHarness;
beforeEach(() => {
  h = createTasksHarness();
});

const repo = () => createSettlementRepo(h.db);
const metrics = (slug = "alpha", window?: { since?: string }) =>
  computeMetrics(h.db, { projectKey: h.projectKey, slug, ...(window !== undefined ? { window } : {}) });

let clock = 0;
const ts = () => {
  clock += 1;
  return `2026-01-01T00:${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}.000Z`;
};

const blocked = (taskId: string, fixRootId?: string) =>
  repo().appendSettlement({ taskId, result: "blocked", evidence: { reason: "红" }, createdAt: ts(), ...(fixRootId !== undefined ? { fixRootId } : {}) });

const success = (taskId: string, commitHash: string, fixRootId?: string) =>
  repo().appendSettlement({
    taskId,
    result: "success",
    commitHash,
    evidence: { summary: "ok" },
    createdAt: ts(),
    ...(fixRootId !== undefined ? { fixRootId } : {}),
  });

describe("四指标现算（slug 维度）", () => {
  it("firstPassRate：首结算即 success 的任务数 / 已结算任务数", () => {
    const a = seedTask(h, "alpha", "1");
    const b = seedTask(h, "alpha", "2");
    const c = seedTask(h, "alpha", "3");
    success(a, "c1");
    blocked(b);
    success(b, "c2");
    success(c, "c3");
    const m = metrics();
    expect(m.firstPassRate).toBeCloseTo(2 / 3);
    expect(m.reworkRatio).toBe(1 / 4); // 根 blocked 一行 / 4 行结算
  });

  it("reworkRatio：根任务 blocked 结算行数 / 结算总行数（fix 链 blocked 行不计入分子）", () => {
    const root = seedTask(h, "alpha", "1");
    const s1 = blocked(root); // 根 blocked → 返工行
    success(root, "c0");
    const fixer = seedTask(h, "alpha", "fix-1", { type: "coding-fix", fixOfTaskId: root });
    const s2 = blocked(fixer, s1.id); // fix 链 blocked（fix_root_id 非空）→ 不计返工分子
    success(fixer, "c1", s1.id);
    void s2;
    const m = metrics();
    expect(m.reworkRatio).toBe(1 / 4); // 4 行结算、仅根 blocked 一行为返工
    expect(m.firstPassRate).toBe(0); // 两任务首结算均 blocked
  });

  it("fixDensity：链去重 × 每链最新 success commit_hash 去重 ÷ 已结算任务数", () => {
    const t1 = seedTask(h, "alpha", "1");
    const s1 = blocked(t1);
    const f1 = seedTask(h, "alpha", "fix-1", { type: "coding-fix", fixOfTaskId: t1 });
    const f2 = seedTask(h, "alpha", "fix-2", { type: "coding-fix", fixOfTaskId: t1 });
    success(f1, "c1", s1.id);
    success(f2, "c1", s1.id); // 同链第二跳，同 commit
    const t2 = seedTask(h, "alpha", "2");
    const s2 = blocked(t2);
    const f3 = seedTask(h, "alpha", "fix-3", { type: "coding-fix", fixOfTaskId: t2 });
    success(f3, "c9", s2.id); // 第二条链
    const t3 = seedTask(h, "alpha", "3");
    success(t3, "c5"); // 普通 success 任务（非 fix 链）
    // 已结算任务 = t1,f1,f2,t2,f3,t3 六任务（fix 链成员亦计入分母）；链 = 2、hash {c1,c9} = 2
    expect(metrics().fixDensity).toBe(2 / 6);
  });

  it("fixDensity commit 去重：两链最新 success 同 commit → 分子 1；链内最新取 seq 更晚一行", () => {
    const t1 = seedTask(h, "alpha", "1");
    const s1 = blocked(t1);
    const f1 = seedTask(h, "alpha", "fix-1", { type: "coding-fix", fixOfTaskId: t1 });
    success(f1, "cA", s1.id);
    const t2 = seedTask(h, "alpha", "2");
    const s2 = blocked(t2);
    const f2 = seedTask(h, "alpha", "fix-2", { type: "coding-fix", fixOfTaskId: t2 });
    success(f2, "cA", s2.id); // 他链同 commit —— 去重
    // 另一任务一链两跳 success：最新（更晚 created_at）commit 进分子
    const t3 = seedTask(h, "alpha", "3");
    const s3 = blocked(t3);
    const f3 = seedTask(h, "alpha", "fix-3", { type: "coding-fix", fixOfTaskId: t3 });
    success(f3, "cB", s3.id);
    success(f3, "cC", s3.id); // 链内最新 success
    // 已结算任务 6，链 3，hash 去重 {cA, cC} = 2
    expect(metrics().fixDensity).toBe(2 / 6);
  });

  it("reviewWaves：容器内 review-wave-N max(wave_seq)（无波 = 0）；slug 维度隔离", () => {
    const svc = createCheckpointsService({ db: h.db, events: h.events });
    const cp = (slug: string) => ({
      projectKey: h.projectKey,
      containerSlug: slug,
      mark: "review-wave-N" as const,
      baseCommitHash: "b",
      snapshots: { tasksTotal: 0, commitsTotal: 0, fixesTotal: 0, evidenceDebtsTotal: 0 },
    });
    expect(metrics().reviewWaves).toBe(0);
    void svc.appendCheckpoint(cp("alpha"));
    void svc.appendCheckpoint(cp("alpha"));
    void svc.appendCheckpoint(cp("beta"));
    expect(metrics("alpha").reviewWaves).toBe(2);
    expect(metrics("beta").reviewWaves).toBe(1);
  });

  it("零结算容器全 0 + project_key/slug 归属限定 + 时间窗过滤", () => {
    expect(metrics()).toEqual({ firstPassRate: 0, reworkRatio: 0, reviewWaves: 0, fixDensity: 0 });
    const t = seedTask(h, "alpha", "1");
    const early = repo().appendSettlement({
      taskId: t,
      result: "blocked",
      evidence: { reason: "早窗" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    repo().appendSettlement({
      taskId: t,
      result: "success",
      commitHash: "c1",
      evidence: { summary: "ok" },
      fixRootId: early.id,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    // 全史：1 任务 / 2 行，首结算 blocked → rework 1/2
    const all = metrics();
    expect(all.reworkRatio).toBe(1 / 2);
    expect(all.fixDensity).toBe(1); // 1 链 / 1 已结算任务
    // 窗内仅 success 行：rework 0
    const win = metrics("alpha", { since: "2026-01-15T00:00:00.000Z" });
    expect(win.reworkRatio).toBe(0);
    expect(win.fixDensity).toBe(1);
  });

  it("FIX_DENSITY_FORMULA 契约 pin：常量字面量锁定，公式漂移即 RED", () => {
    expect(FIX_DENSITY_FORMULA).toBe(
      "fix_root_chain_dedup × latest_success_commit_hash_dedup / settled_tasks",
    );
  });
});
