// fix 链结算构造测试（plugin-task-loop 1.8——entities.md §3.2「fix 链构造详解」）：
// fix_root_id = 链首 blocked 结算行 id（根，非父）；fix 任务自身多结算同链同 root；
// 非 fix 任务 fix_root_id NULL；根任务无 blocked 结算 fail-loud；批内/单条拒裸 fix-% 前缀。
import { beforeEach, describe, expect, it } from "vitest";
import { addTask, batchAddTasks } from "../../host/domain/tasks/add.js";
import { claimTask } from "../../host/domain/tasks/claim.js";
import { createSettlementRepo } from "../../host/db/repositories/settlement-repo.js";
import { submitTask } from "../../host/domain/tasks/submit.js";
import { createTasksHarness, seedTask, type TasksHarness } from "../domain-tasks/harness.js";

let h: TasksHarness;
beforeEach(() => {
  h = createTasksHarness();
});

const claim = () => claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "sess-1", source: { slug: "alpha" } });

const blockedSubmit = (slug: string, localId: string, reason: string) =>
  submitTask(h.verbDeps, {
    projectKey: h.projectKey,
    taskRef: { slug, localId },
    result: "blocked",
    reason,
    blockClassification: { kind: "new-problem" },
  });

const successSubmit = (slug: string, localId: string, commitHash: string) =>
  submitTask(h.verbDeps, {
    projectKey: h.projectKey,
    taskRef: { slug, localId },
    result: "success",
    summary: "fixed",
    gate: { test: true },
    // fix 任务核销门（bug faf0ca57②）起效后：success 结算必带自报核销快照（零判据 = 未核销拒写）
    acceptanceCriteria: [{ criterion: "修复面复跑绿", met: true }],
    commitHash,
  });

describe("rescue fix 核销门（bug faf0ca57②——fix 任务 success 零判据 = 未核销拒写）", () => {
  const blockedThenFix = async (): Promise<{ taskId: string; localId: string }> => {
    const t1 = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "T1", type: "coding-feature" });
    await claim();
    await blockedSubmit("alpha", t1.localId, "红");
    const t2 = await addTask(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      title: "fix",
      type: "coding-fix",
      sourceTask: { slug: "alpha", localId: t1.localId },
      blockSource: true,
    });
    await claim();
    return { taskId: t2.taskId, localId: t2.localId };
  };

  it("fix 任务 success 零判据（ac_results 缺席）→ 拒写（ERR_FIX_TASK_AC_REQUIRED）+ 零结算行", async () => {
    const { taskId, localId } = await blockedThenFix();
    await expect(
      submitTask(h.verbDeps, {
        projectKey: h.projectKey,
        taskRef: { slug: "alpha", localId },
        result: "success",
        summary: "fixed",
        gate: { test: true },
      }),
    ).rejects.toMatchObject({ code: "ERR_FIX_TASK_AC_REQUIRED" });
    expect((h.db.prepare(`SELECT COUNT(*) AS n FROM task_settlements`).get() as { n: number }).n).toBe(1); // 仅根 blocked 行
    expect(h.db.prepare(`SELECT task_status FROM task_tasks WHERE id = ?`).get(taskId)).toMatchObject({ task_status: "in_progress" });
  });

  it("fix 任务 success 空数组 ac_results → 同门拒写", async () => {
    const { localId } = await blockedThenFix();
    await expect(
      submitTask(h.verbDeps, {
        projectKey: h.projectKey,
        taskRef: { slug: "alpha", localId },
        result: "success",
        summary: "fixed",
        gate: { test: true },
        acceptanceCriteria: [],
      }),
    ).rejects.toMatchObject({ code: "ERR_FIX_TASK_AC_REQUIRED" });
  });

  it("fix 任务 success 带自报核销快照（ac_json 缺席 = 无定义侧锚，跳过逐字交叉）→ 走通", async () => {
    const { taskId, localId } = await blockedThenFix();
    const r = await submitTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "alpha", localId },
      result: "success",
      summary: "fixed",
      gate: { test: true },
      acceptanceCriteria: [{ criterion: "修复面复跑绿", met: true, evidence: "vitest run 3 passed" }],
    });
    expect(r.status).toBe("completed");
    const row = h.db.prepare(`SELECT ac_results_json FROM task_settlements WHERE task_id = ?`).get(taskId) as {
      ac_results_json: string;
    };
    expect(JSON.parse(row.ac_results_json)).toHaveLength(1);
  });
});

describe("fix 链构造（fix_root_id × fix_of_task_id 分工）", () => {
  it("T1 blocked → T2(fix of T1) success：S2.fix_root_id = S1.id（链首，非父结算歧义）", async () => {
    const t1 = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "T1", type: "coding-feature" });
    await claim();
    await blockedSubmit("alpha", t1.localId, "test 红");
    const repo = createSettlementRepo(h.db);
    const s1 = repo.listByTask(t1.taskId)[0];
    expect(s1.fix_root_id).toBeNull(); // 非 fix 任务：根结算行零链身份

    const t2 = await addTask(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      title: "fix",
      type: "coding-fix",
      sourceTask: { slug: "alpha", localId: t1.localId },
      blockSource: true,
    });
    await claim();
    await successSubmit("alpha", t2.localId, "c1");
    const s2 = repo.listByTask(t2.taskId)[0];
    expect(s2.fix_root_id).toBe(s1.id);
  });

  it("两跳链：T3(fix of T2) 与 T2 同挂链首 S1.id（无论链深——root 由任务归属决定）", async () => {
    const t1 = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "T1", type: "coding-feature" });
    await claim();
    await blockedSubmit("alpha", t1.localId, "红");
    const repo = createSettlementRepo(h.db);
    const s1 = repo.listByTask(t1.taskId)[0];
    const t2 = await addTask(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      title: "fix",
      type: "coding-fix",
      sourceTask: { slug: "alpha", localId: t1.localId },
      blockSource: true,
    });
    // T3：对 fix 结果再修（直种行绕开 completed 源建链守卫——链形态本身由 entities ③① 承载）
    const t3 = seedTask(h, "alpha", "fix-2", { status: "in_progress", type: "coding-fix", fixOfTaskId: t2.taskId });
    await claim();
    await successSubmit("alpha", t2.localId, "c1");
    await successSubmit("alpha", "fix-2", "c2");
    expect(repo.listByTask(t2.taskId)[0].fix_root_id).toBe(s1.id);
    expect(repo.listByTask(t3)[0].fix_root_id).toBe(s1.id);
  });

  it("fix 任务自身 blocked→再 success：两结算同挂链首（root 由任务归属非结算结果决定）", async () => {
    const t1 = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "T1", type: "coding-feature" });
    await claim();
    await blockedSubmit("alpha", t1.localId, "红");
    const repo = createSettlementRepo(h.db);
    const s1 = repo.listByTask(t1.taskId)[0];
    const t2 = await addTask(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      title: "fix",
      type: "coding-fix",
      sourceTask: { slug: "alpha", localId: t1.localId },
      blockSource: true,
    });
    await claim();
    await blockedSubmit("alpha", t2.localId, "fix 也没修好");
    // blocked → completed 直达（agent 面矩阵格）——无需再 claim
    await successSubmit("alpha", t2.localId, "c1");
    const [sa, sb] = repo.listByTask(t2.taskId);
    expect(sa.fix_root_id).toBe(s1.id);
    expect(sb.fix_root_id).toBe(s1.id);
    expect(sa.seq).toBe(1);
    expect(sb.seq).toBe(2);
  });

  it("根任务无 blocked 结算行（理论不可达）→ fail-loud 拒写（ERR_FIX_ROOT_UNRESOLVED）", async () => {
    // 直种 fix 行（根任务在库但从未 blocked 结算——不变量违例注入）
    seedTask(h, "alpha", "1.1", { status: "completed", type: "coding-feature" });
    const rootId = (
      h.db.prepare(`SELECT id FROM task_tasks WHERE slug = 'alpha' AND local_id = '1.1'`).get() as { id: string }
    ).id;
    seedTask(h, "alpha", "fix-1", { status: "in_progress", type: "coding-fix", fixOfTaskId: rootId });
    await expect(successSubmit("alpha", "fix-1", "c1")).rejects.toMatchObject({ code: "ERR_FIX_ROOT_UNRESOLVED" });
    expect(
      (h.db.prepare(`SELECT COUNT(*) AS n FROM task_settlements`).get() as { n: number }).n,
    ).toBe(0);
  });

  it("批内/单条拒裸 fix-% 前缀容器 slug（fix 判别单源化）", async () => {
    await expect(
      addTask(h.verbDeps, { projectKey: h.projectKey, slug: "fix-9", title: "X", type: "coding-feature" }),
    ).rejects.toMatchObject({ code: "ERR_CONTAINER_SLUG_INVALID" });
    await expect(
      batchAddTasks(h.verbDeps, {
        projectKey: h.projectKey,
        slug: "fix-9",
        tasks: [{ localId: "1", title: "B", type: "coding-feature" }],
      }),
    ).rejects.toMatchObject({ code: "ERR_CONTAINER_SLUG_INVALID" });
  });
});
