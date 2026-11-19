// unblockTask——任务域 blocked→pending 出口薄壳动词（core forge/tasks/unblock.ts 直迁——
// plugin-task-loop 1.7 内联 + v1 列面适配：reason → note 列；相位域退役摘除）。
// actor 由通道推断：unblockTask = tool 专属动词，审计行 actor 恒 'plugin-tool'。
// 单事务全成全败：行解析 → reason 必带 → agent 面矩阵先验（blocked→pending 唯一入口格）
// → 转移 UPDATE → 'unblock' 审计行；**不挂恢复钩子**（pending ∉ 满足集——结构性不命中）；
// 闭包尾部 emitTasksChanged。
import { withTransaction } from "@dsh-forge/lib-db";
import { ReasonRequiredError } from "./errors.js";
import { resolveTaskRef } from "./query.js";
import { assertTransitionAllowed } from "./state-machine.js";
import type { TaskRef, TasksVerbDeps } from "./types.js";

export type { TasksVerbDeps };

/** unblockTask 出参（submit 瘦身出参同形——零 restored） */
export interface UnblockTaskResult {
  readonly taskId: string;
  readonly status: "pending";
}

/** unblockTask 入参（薄壳——仅 reason 一个裁决负载） */
export interface UnblockTaskInput {
  readonly projectKey: string;
  readonly taskRef: TaskRef;
  readonly reason?: string;
  readonly sessionId?: string;
}

/** Interface 1 unblockTask：blocked→pending 出口（转移 + 'unblock' 审计行；不挂恢复钩子） */
export async function unblockTask(deps: TasksVerbDeps, input: UnblockTaskInput): Promise<UnblockTaskResult> {
  const db = deps.db;
  const now = new Date().toISOString();

  const snapshot = withTransaction(db, (): UnblockTaskResult => {
    // ① 行解析（agent 面 TaskRef 三键查捞）
    const row = resolveTaskRef(db, input.projectKey, input.taskRef);

    // ② reason 必带（先于转移校验）
    if ((input.reason ?? "").trim() === "") {
      throw new ReasonRequiredError({ verb: "unblockTask" });
    }

    // ③ agent 面矩阵先验（blocked→pending 唯一入口格——非 blocked 卡调用即拒）
    assertTransitionAllowed(row.task_status, "pending", "agent");

    // ⑤ 转移 + 'unblock' 审计行（reason 落 note 列——append-only 记录为审计单源）
    const toStatus = "pending" as const;
    db.prepare(`UPDATE task_tasks SET task_status = ?, updated_at = ? WHERE id = ?`).run(toStatus, now, row.id);
    db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, note, actor, session_id, created_at, updated_at)
       VALUES (?, 'unblock', ?, ?, ?, 'plugin-tool', ?, ?, ?)`,
    ).run(row.id, row.task_status, toStatus, input.reason, input.sessionId ?? null, now, now);

    // ⑥ 恢复钩子：不挂——pending ∉ SATISFYING_TASK_STATUSES {completed, skipped}，结构性不触发

    return { taskId: row.id, status: "pending" };
  });

  deps.events.emitTasksChanged(input.projectKey);
  return snapshot;
}
