// submitTask / transition / unblock / reconcile 域动词随迁测试（plugin-task-loop 1.7——
// 双门 + agent 面矩阵 + 恢复钩子 + v1 列面记录轨迹）。
import { beforeEach, describe, expect, it } from "vitest";
import { addTask } from "../../host/domain/tasks/add.js";
import { claimTask } from "../../host/domain/tasks/claim.js";
import { reconcileInterrupted } from "../../host/domain/tasks/reconcile.js";
import { submitTask } from "../../host/domain/tasks/submit.js";
import { pauseTask, transitionTask } from "../../host/domain/tasks/transition.js";
import { unblockTask } from "../../host/domain/tasks/unblock.js";
import { updateTask } from "../../host/domain/tasks/update.js";
import { recordSpawn } from "../../host/domain/tasks/spawn.js";
import { createTasksHarness, seedEdge, seedRecord, type TasksHarness } from "./harness.js";

let h: TasksHarness;
beforeEach(() => {
  h = createTasksHarness();
});

const claim = () => claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "sess-1", source: { slug: "alpha" } });

describe("submitTask 输入面校验 + 双门（仅挂 success）", () => {
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

  it("blocked 空因拒（ERR_REASON_REQUIRED）", async () => {
    const t = await inFlightTask();
    await expect(
      submitTask(h.verbDeps, { projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId }, result: "blocked" }),
    ).rejects.toMatchObject({ code: "ERR_REASON_REQUIRED" });
  });

  it("blocked 缺归类拒（ERR_BLOCK_CLASSIFICATION_REQUIRED）", async () => {
    const t = await inFlightTask();
    await expect(
      submitTask(h.verbDeps, { projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId }, result: "blocked", reason: "红了" }),
    ).rejects.toMatchObject({ code: "ERR_BLOCK_CLASSIFICATION_REQUIRED" });
  });

  it("success 空摘要拒（ERR_SUMMARY_REQUIRED）", async () => {
    const t = await inFlightTask();
    await expect(
      submitTask(h.verbDeps, { projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId }, result: "success" }),
    ).rejects.toMatchObject({ code: "ERR_SUMMARY_REQUIRED" });
  });

  it("AC 任务缺测试证据拒（ERR_TEST_EVIDENCE_REQUIRED）；gate.test=true 放行 → completed + 恢复钩子", async () => {
    const t = await inFlightTask(["判据一"]);
    await expect(
      submitTask(h.verbDeps, {
        projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId }, result: "success", summary: "S",
      }),
    ).rejects.toMatchObject({ code: "ERR_TEST_EVIDENCE_REQUIRED" });
    const r = await submitTask(h.verbDeps, {
      projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId }, result: "success", summary: "S",
      gate: { compile: true, fmt: true, lint: true, test: true },
    });
    expect(r.status).toBe("completed");
  });

  it("AC 交叉校验：criterion 与定义侧镜像失配拒（ERR_AC_CRITERIA_MISMATCH）；met=false 拒（ERR_AC_NOT_MET）", async () => {
    const t = await inFlightTask(["判据一", "判据二"]);
    await expect(
      submitTask(h.verbDeps, {
        projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId }, result: "success", summary: "S",
        gate: { test: true },
        acceptanceCriteria: [{ criterion: "判据一", met: true }],
      }),
    ).rejects.toMatchObject({ code: "ERR_AC_CRITERIA_MISMATCH" });
    await expect(
      submitTask(h.verbDeps, {
        projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId }, result: "success", summary: "S",
        gate: { test: true },
        acceptanceCriteria: [
          { criterion: "判据一", met: true },
          { criterion: "判据二", met: false },
        ],
      }),
    ).rejects.toMatchObject({ code: "ERR_AC_NOT_MET" });
  });

  it("blocked 结算：in_progress→blocked + note 承载 reason + 恢复钩子不挂", async () => {
    const t = await inFlightTask();
    const r = await submitTask(h.verbDeps, {
      projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId }, result: "blocked", reason: "测试红",
      blockClassification: { kind: "new-problem" },
    });
    expect(r.status).toBe("blocked");
    expect(r.restored).toEqual([]);
    const rec = h.db
      .prepare(`SELECT note, to_status FROM task_records WHERE task_id = ? AND verb = 'submit'`)
      .get(t.taskId) as { note: string; to_status: string };
    expect(rec.note).toBe("测试红");
    expect(rec.to_status).toBe("blocked");
  });

  it("恢复钩子：completed 挂——blocked 后继前置全满足 → auto-restore pending（边不删）", async () => {
    const a = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const b = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "B", type: "coding-feature", dependsOn: [a.localId] });
    h.db.prepare(`UPDATE task_tasks SET task_status = 'blocked' WHERE id = ?`).run(b.taskId);
    await claim();
    const r = await submitTask(h.verbDeps, {
      projectKey: h.projectKey, taskRef: { slug: "alpha", localId: a.localId }, result: "success", summary: "S",
      gate: { test: true }, acceptanceCriteria: [],
    });
    expect(r.restored).toEqual([{ slug: "alpha", localId: b.localId }]);
    expect(h.db.prepare(`SELECT task_status FROM task_tasks WHERE id = ?`).get(b.taskId)).toMatchObject({ task_status: "pending" });
    const edge = h.db.prepare(`SELECT COUNT(*) AS n FROM task_edges WHERE task_id = ?`).get(b.taskId) as { n: number };
    expect(edge.n).toBe(1);
  });
});

describe("transitionTask / pauseTask / unblockTask", () => {
  it("human 通道：from≠to 任意转移 + reason 必带（note 列）+ actor 缺省 ui", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const snap = await transitionTask(h.verbDeps, {
      projectKey: h.projectKey, taskId: t.taskId, toStatus: "skipped", reason: "人工跳过",
    });
    expect(snap.taskStatus).toBe("skipped");
    const rec = h.db.prepare(`SELECT note, actor FROM task_records WHERE task_id = ? AND verb = 'transition'`).get(t.taskId) as {
      note: string;
      actor: string;
    };
    expect(rec.note).toBe("人工跳过");
    expect(rec.actor).toBe("ui");
    await expect(
      transitionTask(h.verbDeps, { projectKey: h.projectKey, taskId: t.taskId, toStatus: "pending", reason: "" }),
    ).rejects.toMatchObject({ code: "ERR_REASON_REQUIRED" });
  });

  it("非法转移拒（agent 面矩阵格：completed 无出边）", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    await transitionTask(h.verbDeps, { projectKey: h.projectKey, taskId: t.taskId, toStatus: "completed", reason: "改判" });
    // to === current 同路拒绝（human/agent 两 face 目标集均不含自身）
    await expect(
      transitionTask(h.verbDeps, { projectKey: h.projectKey, taskId: t.taskId, toStatus: "completed", reason: "再改" }),
    ).rejects.toMatchObject({ code: "ERR_INVALID_TRANSITION" });
  });

  it("pauseTask：in_progress→suspended（actor 恒 core）；unblockTask：blocked→pending（不挂恢复钩子）", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    await claim();
    const paused = await pauseTask(h.verbDeps, { projectKey: h.projectKey, taskId: t.taskId, reason: "让路" });
    expect(paused.taskStatus).toBe("suspended");
    // resume 序：suspended→pending 由调用方承担（human 面合法）
    await transitionTask(h.verbDeps, { projectKey: h.projectKey, taskId: t.taskId, toStatus: "pending", reason: "resume" });
    // blocked → pending 出口
    await claim();
    await submitTask(h.verbDeps, {
      projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId }, result: "blocked", reason: "卡",
      blockClassification: { kind: "new-problem" },
    });
    const un = await unblockTask(h.verbDeps, {
      projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId }, reason: "阻塞消失",
    });
    expect(un.status).toBe("pending");
    await expect(unblockTask(h.verbDeps, { projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId }, reason: "x" })).rejects.toMatchObject({
      code: "ERR_INVALID_TRANSITION",
    });
  });
});

describe("reconcileInterrupted 三重收敛判据", () => {
  it("registryEmpty=false 短路零写入；命中行真化 interrupted（loop_sourced claim 行）+ note=进程重启", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    await claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "s", source: { slug: "alpha" }, loopSourced: true });
    const r1 = await reconcileInterrupted(h.verbDeps, { projectKey: h.projectKey, registryEmpty: false });
    expect(r1.reconciled).toEqual([]);
    const r2 = await reconcileInterrupted(h.verbDeps, { projectKey: h.projectKey, registryEmpty: true });
    expect(r2.reconciled).toEqual([{ slug: "alpha", localId: t.localId }]);
    expect(h.db.prepare(`SELECT task_status FROM task_tasks WHERE id = ?`).get(t.taskId)).toMatchObject({ task_status: "interrupted" });
  });

  it("skill 会话路线（claim 无标记）不命中——幂等重入语义不变", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    await claim(); // loopSourced 缺省 false
    const r = await reconcileInterrupted(h.verbDeps, { projectKey: h.projectKey, registryEmpty: true });
    expect(r.reconciled).toEqual([]);
    expect(r.stats?.loopSourced).toBe(0);
    expect(t.taskId).toBeDefined();
  });
});

describe("updateTask / recordSpawn", () => {
  it("宽字段 partial 改写 + 状态门（in_progress 拒改）+ updateTask 审计行", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const snap = await updateTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "alpha", localId: t.localId },
      title: "A 改",
      brief: "新正文",
      context: { K: "V" },
    });
    expect(snap.title).toBe("A 改");
    expect(snap.brief).toBe("新正文");
    await claim();
    await expect(
      updateTask(h.verbDeps, { projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId }, title: "x" }),
    ).rejects.toMatchObject({ code: "ERR_TASK_LOCKED" });
  });

  it("recordSpawn：spawn 记录落库 + 事件", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    await recordSpawn(h.verbDeps, { projectKey: h.projectKey, taskId: t.taskId, sessionId: "worker-1" });
    const rec = h.db.prepare(`SELECT verb, session_id FROM task_records WHERE task_id = ? AND verb = 'spawn'`).get(t.taskId) as {
      verb: string;
      session_id: string;
    };
    expect(rec.session_id).toBe("worker-1");
  });

  it("updateTask dependsOnAppend 白通道：blocked 卡补边前置全满足即恢复 pending", async () => {
    const a = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const b = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "B", type: "coding-feature" });
    seedEdge(h, b.taskId, a.taskId); // b 依赖 a
    h.db.prepare(`UPDATE task_tasks SET task_status = 'blocked' WHERE id = ?`).run(b.taskId);
    h.db.prepare(`UPDATE task_tasks SET task_status = 'completed' WHERE id = ?`).run(a.taskId);
    const snap = await updateTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "alpha", localId: b.localId },
      dependsOnAppend: [],
    });
    void snap;
    expect(h.db.prepare(`SELECT task_status FROM task_tasks WHERE id = ?`).get(b.taskId)).toMatchObject({ task_status: "pending" });
  });

  it("seedRecord v1 列面：note/loop_sourced 落行（对账判据种入面）", () => {
    const id = "seed-x";
    h.db
      .prepare(
        `INSERT INTO task_tasks (id, slug, local_id, title, task_type, project_key, created_at, updated_at)
         VALUES (?, 'alpha', '9.9', 'X', 'coding-feature', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      .run(id, h.projectKey);
    seedRecord(h, id, { verb: "claim", loopSourced: true, note: "n" });
    const rec = h.db.prepare(`SELECT loop_sourced, note FROM task_records WHERE task_id = ?`).get(id) as {
      loop_sourced: number;
      note: string;
    };
    expect(rec.loop_sourced).toBe(1);
    expect(rec.note).toBe("n");
  });
});
