// transitionTask / pauseTask——任务域人工转移面（core forge/tasks/transition.ts 直迁——
// plugin-task-loop 1.7 内联 + v1 列面适配：reason → note 列；相位域退役摘除）。
// 人类通道语义：from≠to 任意转移（八态 − 当前态）+ reason 必带；人类面缺省 actor='ui'，
// 机械纠偏显式传 'core'；不进 plugin tool 面。
// 单事务全成全败：行解析 → reason 校验 → 提前校验（assertTransitionAllowed 单源）→ 转移
// UPDATE → transition 记录 → 恢复钩子（→completed/skipped 同挂）；闭包尾部 emitTasksChanged。
import { withTransaction } from "@dsh-forge/lib-db";
import { ReasonRequiredError } from "./errors.js";
import { resolveTaskById, toTaskSnapshot, type TaskStorageRow } from "./query.js";
import { assertTransitionAllowed, SATISFYING_TASK_STATUSES } from "./state-machine.js";
import type { TaskRef, TaskSnapshot, TaskStatus, TasksVerbDeps } from "./types.js";

export type { TasksVerbDeps };

/** 恢复钩子反查行 */
interface WaiterEdgeRow {
  readonly task_id: string;
}

/** 恢复候选行 */
interface WaiterTaskRow {
  readonly id: string;
  readonly slug: string;
  readonly local_id: string;
  readonly task_status: TaskStatus;
}

/**
 * 单 waiter 恢复判定（runRestoreHook 与 updateTask 补跑共用的单一实现）：waiter 存在且
 * blocked 且前置全 ∈ 满足集 → blocked→pending + auto-restore 记录（actor='core'）并返回其
 * TaskRef；否则 null。边不删（满足 = 读时派生）。调用方保证：事务内执行。
 */
export function restoreBlockedWaiter(db: import("@dsh-forge/lib-db").Database, waiterId: string, now: string): TaskRef | null {
  const waiter = db
    .prepare<unknown[], WaiterTaskRow>(`SELECT id, slug, local_id, task_status FROM task_tasks WHERE id = ?`)
    .get(waiterId);
  if (waiter === undefined || waiter.task_status !== "blocked") return null;
  const statusById = db.prepare<unknown[], { task_status: TaskStatus }>(`SELECT task_status FROM task_tasks WHERE id = ?`);
  const prereqs = db
    .prepare<unknown[], { prerequisite_id: string }>(`SELECT prerequisite_id FROM task_edges WHERE task_id = ?`)
    .all(waiterId);
  const allSatisfied = prereqs.every((p) => {
    const status = statusById.get(p.prerequisite_id)?.task_status;
    return status !== undefined && (SATISFYING_TASK_STATUSES as readonly string[]).includes(status);
  });
  if (!allSatisfied) return null;
  db.prepare(`UPDATE task_tasks SET task_status = 'pending', updated_at = ? WHERE id = ?`).run(now, waiterId);
  db.prepare(
    `INSERT INTO task_records (task_id, verb, from_status, to_status, actor, created_at, updated_at)
     VALUES (?, 'auto-restore', 'blocked', 'pending', 'core', ?, ?)`,
  ).run(waiterId, now, now);
  return { slug: waiter.slug, localId: waiter.local_id };
}

/**
 * 恢复钩子（C3：与 submitTask 钩子同族——submit.ts 复用本导出，单一实现）。语义：反查
 * 后继 → 逐个走 restoreBlockedWaiter 判定。调用方保证：事务内执行 + 满足集终态已落库。
 */
export function runRestoreHook(db: import("@dsh-forge/lib-db").Database, input: { satisfiedTaskId: string; now: string }): TaskRef[] {
  const waiterIds = db
    .prepare<unknown[], WaiterEdgeRow>(`SELECT task_id FROM task_edges WHERE prerequisite_id = ? ORDER BY task_id`)
    .all(input.satisfiedTaskId);
  const restored: TaskRef[] = [];
  for (const { task_id: waiterId } of waiterIds) {
    const ref = restoreBlockedWaiter(db, waiterId, input.now);
    if (ref !== null) restored.push(ref);
  }
  return restored;
}

export interface TransitionTaskInput {
  readonly projectKey: string;
  readonly taskId: string;
  readonly toStatus: TaskStatus;
  /** 转移缘由（必带，空白拒绝——审计落 note 列） */
  readonly reason: string;
  /** 缺省 'ui'（人类面通道推断）；机械纠偏显式传 'core' */
  readonly actor?: "plugin-tool" | "ui" | "core";
}

/** Interface 1 transitionTask：人工纠偏面（提前校验 + reason 必带 + 终态恢复钩子） */
export async function transitionTask(deps: TasksVerbDeps, input: TransitionTaskInput): Promise<TaskSnapshot> {
  const db = deps.db;
  const now = new Date().toISOString();

  const snapshot = withTransaction(db, (): TaskSnapshot => {
    // ① 行解析（UI/RPC 面 id 直查）
    const row = resolveTaskById(db, input.projectKey, input.taskId);

    // ② reason 必带（先于转移校验）
    if (input.reason.trim() === "") {
      throw new ReasonRequiredError({ verb: "transitionTask" });
    }

    // ③ 提前校验：toStatus ∈ transitionTargets(current,'human')——与 UI 菜单同一纯函数零漂移
    assertTransitionAllowed(row.task_status, input.toStatus, "human");

    // ⑤ 转移 + transition 记录（reason 落 note 列——v1 融合列；审计单源）
    db.prepare(`UPDATE task_tasks SET task_status = ?, updated_at = ? WHERE id = ?`).run(input.toStatus, now, row.id);
    db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, note, actor, created_at, updated_at)
       VALUES (?, 'transition', ?, ?, ?, ?, ?, ?)`,
    ).run(row.id, row.task_status, input.toStatus, input.reason, input.actor ?? "ui", now, now);

    // ⑥ 恢复钩子（C3）：→completed/skipped 同挂（rejected 不满足不触发）
    if ((SATISFYING_TASK_STATUSES as readonly string[]).includes(input.toStatus)) {
      runRestoreHook(db, { satisfiedTaskId: row.id, now });
    }

    // ⑧ 快照（写后重读）
    return toTaskSnapshot(resolveTaskById(db, input.projectKey, input.taskId) as TaskStorageRow);
  });

  deps.events.emitTasksChanged(input.projectKey);
  return snapshot;
}

/** pauseTask 转移服务入参（reason 必带） */
export interface PauseTaskInput {
  readonly projectKey: string;
  readonly taskId: string;
  readonly reason: string;
}

/**
 * pauseTask 转移闭包：in_progress → suspended，复用 human 面 transitionTask 全量语义，
 * actor 恒 'core'。**调用方竞态收口契约（Hard Rule）**：本闭包只做状态落库——调用方
 * （loop driver pause 动作）必须先摘 record.inFlight 再 abort worker 执行，abort 完成后
 * 才调用本闭包落 suspended。
 */
export async function pauseTask(deps: TasksVerbDeps, input: PauseTaskInput): Promise<TaskSnapshot> {
  return transitionTask(deps, {
    projectKey: input.projectKey,
    taskId: input.taskId,
    toStatus: "suspended",
    reason: input.reason,
    actor: "core",
  });
}
