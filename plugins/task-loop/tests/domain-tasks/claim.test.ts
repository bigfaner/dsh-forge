// claimTask 域派发动词随迁测试（plugin-task-loop 1.7——slug 化改造面：scope 单键、
// exclusivityGuard slug 键面、阶段门、幂等重入、Z1 出口、简报 CONTEXT 行）。
import { beforeEach, describe, expect, it } from "vitest";
import { addTask } from "../../host/domain/tasks/add.js";
import { claimTask } from "../../host/domain/tasks/claim.js";
import { PhaseGateUnsettledError } from "../../host/domain/tasks/errors.js";
import { createTasksHarness, seedLink, type TasksHarness } from "./harness.js";

let h: TasksHarness;
beforeEach(() => {
  h = createTasksHarness();
});

const claim = (input: Partial<Parameters<typeof claimTask>[1]> = {}) =>
  claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "sess-1", ...input });

describe("就绪选择（仅扫 pending 池）", () => {
  it("Z1 出口：无就绪任务 → { task: null, reclaimed: false }，零事件", async () => {
    const r = await claim();
    expect(r.task).toBeNull();
    expect(h.events.emitted).toHaveLength(0);
  });

  it("priority 序：P0 先于无 priority；创建序决胜", async () => {
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "B", type: "coding-feature" });
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature", priority: "P0" });
    const r = await claim({ source: { slug: "alpha" } });
    expect(r.task?.title).toBe("A");
    expect(r.reclaimed).toBe(false);
    expect(r.task?.taskStatus).toBe("in_progress");
    expect(h.events.emitted.at(-1)).toBe(h.projectKey);
  });

  it("fix 优先键：fix 链任务与普通任务同轮就绪时 fix 赢", async () => {
    const src = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "S", type: "coding-feature" });
    await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "F", type: "coding-fix",
      sourceTask: { slug: "alpha", localId: src.localId }, blockSource: true,
    });
    const r = await claim({ source: { slug: "alpha" } });
    expect(r.task?.localId).toBe("fix-1");
  });

  it("容器限定（slug 单键）：他容器 pending 不入本容器盲选池", async () => {
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "beta", title: "X", type: "coding-feature" });
    const r = await claim({ source: { slug: "alpha" } });
    expect(r.task).toBeNull();
    const r2 = await claim();
    expect(r2.task?.slug).toBe("beta");
  });

  it("依赖未满足 → ERR_DEPENDENCIES_UNMET（data 带未满足清单）", async () => {
    const a = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "B", type: "coding-feature", dependsOn: [a.localId],
    });
    const r = await claim({ source: { slug: "alpha" } });
    expect(r.task?.localId).toBe(a.localId); // A 可领
    // 盲选跳过未就绪卡（Z1）；显式 taskRef 指名领取 → 守卫拒绝带未满足清单
    const z1 = await claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "sess-2", source: { slug: "alpha" } });
    expect(z1.task).toBeNull();
    await expect(
      claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "sess-2", taskRef: { slug: "alpha", localId: "1.2" } }),
    ).rejects.toMatchObject({ code: "ERR_DEPENDENCIES_UNMET" });
  });
});

describe("阶段门 + 独占守卫 + 幂等重入", () => {
  it("fresh-claim 阶段门：验证类卡被未终态实现链持有（ERR_PHASE_GATE_UNSETTLED，data.unsettled 清单）", async () => {
    const impl = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "I", type: "coding-feature" });
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "V", type: "validation-code" });
    // 盲选跳过被门持有卡（validation 族出局）；显式 taskRef 指名领取 → 门拒 + unsettled 清单
    await expect(
      claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "sess-2", taskRef: { slug: "alpha", localId: "1.2" } }),
    ).rejects.toBeInstanceOf(PhaseGateUnsettledError);
    // 实现链终态 → 门透明
    h.db.prepare(`UPDATE task_tasks SET task_status = 'completed' WHERE id = ?`).run(impl.taskId);
    const r = await claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "sess-2", taskRef: { slug: "alpha", localId: "1.2" } });
    expect(r.task?.taskType).toBe("validation-code");
  });

  it("exclusivityGuard（slug 化键面）：收到 { slug, localId, taskStatus }，抛错即整体拒绝零残留", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    let seen: { slug: string; localId: string; taskStatus: string } | undefined;
    await claim({
      source: { slug: "alpha" },
      exclusivityGuard: (target) => {
        seen = target;
      },
    });
    expect(seen).toEqual({ slug: "alpha", localId: t.localId, taskStatus: "pending" });

    h.db.prepare(`UPDATE task_tasks SET task_status = 'pending' WHERE id = ?`).run(t.taskId);
    await expect(
      claim({
        source: { slug: "alpha" },
        exclusivityGuard: () => {
          throw new Error("exclusive");
        },
      }),
    ).rejects.toThrow("exclusive");
    expect(h.db.prepare(`SELECT task_status FROM task_tasks WHERE id = ?`).get(t.taskId)).toMatchObject({ task_status: "pending" });
  });

  it("幂等重入：in_progress + 本会话 links → reclaimed=true 无状态转移零新转移记录", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const r1 = await claim({ source: { slug: "alpha" } });
    expect(r1.reclaimed).toBe(false);
    const r2 = await claim({ source: { slug: "alpha" } });
    expect(r2.reclaimed).toBe(true);
    expect(r2.task?.taskId).toBe(t.taskId);
  });

  it("他会话 in_progress 不可盲选劫持（双 dispatcher 不双派发）", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    seedLink(h, t.taskId, "other-session");
    h.db.prepare(`UPDATE task_tasks SET task_status = 'in_progress' WHERE id = ?`).run(t.taskId);
    const r = await claim({ source: { slug: "alpha" } });
    expect(r.task).toBeNull();
  });

  it("显式 taskRef 指名领取 + adopt 定向接管 interrupted（矩阵新边）", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    h.db.prepare(`UPDATE task_tasks SET task_status = 'interrupted' WHERE id = ?`).run(t.taskId);
    const r = await claim({ adopt: { slug: "alpha", localId: t.localId } });
    expect(r.task?.taskStatus).toBe("in_progress");
  });
});

describe("dispatchPrompt 合成（新简报形态）+ digest", () => {
  it("简报 = 元数据表格（TASK_ID/FLAGS/BLOCKERS/CONTEXT）+ 正文段；SOURCE/PHASE_SUMMARY 行退役", async () => {
    const a = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "A 标题", type: "coding-feature",
      brief: "正文目标", priority: "P1", context: { SKIP_EVAL_GATE: "1" }, coverageThreshold: 0.8,
    });
    const r = await claim({ source: { slug: "alpha" } });
    const p = r.dispatchPrompt;
    expect(p).toContain("| TASK_ID | alpha/1.1 |");
    expect(p).toContain("| FLAGS | P1 |");
    expect(p).toContain("| COVERAGE | percentage 80% |");
    expect(p).toContain("| CONTEXT | SKIP_EVAL_GATE=1 |");
    expect(p).toContain("## 任务目标");
    expect(p).toContain("正文目标");
    expect(p).not.toContain("SOURCE:");
    expect(p).not.toContain("PHASE_SUMMARY:");
    expect(a.taskId).toBeDefined();
    expect(r.digest).toHaveLength(12);
  });

  it("BLOCKERS 行 = 前置快照（领取瞬间取数）", async () => {
    const a = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature", status: undefined });
    const b = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "B", type: "coding-feature", dependsOn: [a.localId],
    });
    void b;
    h.db.prepare(`UPDATE task_tasks SET task_status = 'completed' WHERE id = ?`).run(a.taskId);
    const c = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "C", type: "coding-feature" });
    void c;
    const r = await claim({ source: { slug: "alpha" } });
    expect(r.dispatchPrompt).toContain("| BLOCKERS |");
  });

  it("重入简报注入 <resume> 段（resolveEvidencePointer 注入面）", async () => {
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const deps = {
      db: h.db,
      events: h.events,
      resolveEvidencePointer: () => ({ pointer: "logs/alpha/1.1/resume.md", stale: false }),
    };
    const r = await claimTask(deps, { projectKey: h.projectKey, sessionId: "s", source: { slug: "alpha" } });
    expect(r.dispatchPrompt).toContain("<resume>");
    expect(r.dispatchPrompt).toContain("{task_loop.task_dir}/resume.md");
  });
});
