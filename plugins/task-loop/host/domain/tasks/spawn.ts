// recordSpawn——spawn 审计动词（core forge/tasks/spawn.ts 直迁——plugin-task-loop 1.7 内联）。
// dispatchTask 复合动词的内部审计径——零状态效应（不转移、不写 links），仅 task_records
// append 一行 verb='spawn' / session_id = worker 子会话 id。claim 幂等重入再派发时旧行保留
// （append-only），执行会话解析取最新行。
import { withTransaction } from "@dsh-forge/lib-db";
import { resolveTaskById } from "./query.js";
import type { TasksVerbDeps } from "./types.js";

export interface RecordSpawnInput {
  readonly projectKey: string;
  readonly taskId: string;
  readonly sessionId: string;
}

/** Interface 1 recordSpawn：任务行解析（未命中 ERR_TASK_NOT_FOUND）+ spawn 记录单事务落库 */
export async function recordSpawn(deps: TasksVerbDeps, input: RecordSpawnInput): Promise<void> {
  const db = deps.db;
  const now = new Date().toISOString();
  withTransaction(db, () => {
    const row = resolveTaskById(db, input.projectKey, input.taskId);
    db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, actor, session_id, created_at, updated_at)
       VALUES (?, 'spawn', NULL, NULL, 'plugin-tool', ?, ?, ?)`,
    ).run(row.id, input.sessionId, now, now);
  });
  deps.events.emitTasksChanged(input.projectKey);
}
