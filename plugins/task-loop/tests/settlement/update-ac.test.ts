// update-ac 变更行测试（plugin-task-loop 1.8——code-design §2 AC 载荷终态）：
// updateTask 改 AC 同事务 records 追加 verb='update-ac' 行（payload_json = 新版判据全文，
// diff 相邻行可得变更）；不改 AC 零变更行；状态门拒改时零行落库（同事务原子）。
import { beforeEach, describe, expect, it } from "vitest";
import { addTask } from "../../host/domain/tasks/add.js";
import { claimTask } from "../../host/domain/tasks/claim.js";
import { updateTask } from "../../host/domain/tasks/update.js";
import { createTasksHarness, type TasksHarness } from "../domain-tasks/harness.js";

let h: TasksHarness;
beforeEach(() => {
  h = createTasksHarness();
});

function acRows(taskId: string): { verb: string; payload_json: string | null }[] {
  return h.db
    .prepare<unknown[], { verb: string; payload_json: string | null }>(
      `SELECT verb, payload_json FROM task_records WHERE task_id = ? AND verb = 'update-ac' ORDER BY created_at, id`,
    )
    .all(taskId);
}

describe("update-ac 变更行", () => {
  it("改 AC → update-ac 行落 payload_json 新版全文（同事务——updateTask 审计行同在）", async () => {
    const t = await addTask(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      title: "A",
      type: "coding-feature",
      acceptanceCriteria: ["旧判据"],
    });
    await updateTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "alpha", localId: t.localId },
      acceptanceCriteria: ["新判据一", "新判据二"],
    });
    const rows = acRows(t.taskId);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload_json as string)).toEqual(["新判据一", "新判据二"]);
    expect(h.db.prepare(`SELECT ac_json FROM task_tasks WHERE id = ?`).get(t.taskId)).toMatchObject({
      ac_json: JSON.stringify(["新判据一", "新判据二"]),
    });
    const updateRows = h.db
      .prepare<unknown[], { verb: string }>(`SELECT verb FROM task_records WHERE task_id = ? AND verb = 'updateTask'`)
      .all(t.taskId);
    expect(updateRows).toHaveLength(1); // 变更行追加于 updateTask 审计行之外
  });

  it("不改 AC 零变更行；状态门拒改（in_progress）零行落库", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    await updateTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "alpha", localId: t.localId },
      title: "改题",
    });
    expect(acRows(t.taskId)).toHaveLength(0);
    await claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "s", source: { slug: "alpha" } });
    await expect(
      updateTask(h.verbDeps, {
        projectKey: h.projectKey,
        taskRef: { slug: "alpha", localId: t.localId },
        acceptanceCriteria: ["偷改"],
      }),
    ).rejects.toMatchObject({ code: "ERR_TASK_LOCKED" });
    expect(acRows(t.taskId)).toHaveLength(0);
    expect(h.db.prepare(`SELECT ac_json FROM task_tasks WHERE id = ?`).get(t.taskId)).toMatchObject({ ac_json: null });
  });
});
