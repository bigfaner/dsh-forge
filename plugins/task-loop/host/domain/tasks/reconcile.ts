// reconcileInterrupted——任务域启动对账动词（core forge/tasks/reconcile.ts 直迁——
// plugin-task-loop 1.7 内联 + v1 列面适配：reason → note 列；相位域退役摘除）。
// actor='core'（core 驱动的非通道动词）。
// 三重收敛判据：① status = 'in_progress' ② 最新 claim 记录带循环来源标记（loop_sourced=1）
// ③ 进程内循环登记表空（registryEmpty——活循环在场 = false 短路零写入）。
// 单事务全成全败；闭包尾部 emitTasksChanged（零命中 = 纯读零写入不发射）。
import { withTransaction } from "@dsh-forge/lib-db";
import { TASK_COLUMNS, type TaskStorageRow } from "./query.js";
import { assertTransitionAllowed } from "./state-machine.js";
import type { ContainerRef, TaskRef, TasksVerbDeps } from "./types.js";

export type { TasksVerbDeps };

/** 对账命中行解析（in_progress ∧ 最新 claim 行 loop_sourced=1）。中断序：updated_at 升序。 */
const RECONCILE_TARGETS_WHERE_SQL = `FROM task_tasks t
 WHERE t.task_status = 'in_progress'
   AND (SELECT r.loop_sourced FROM task_records r
        WHERE r.task_id = t.id AND r.verb = 'claim'
        ORDER BY r.created_at DESC, r.id DESC LIMIT 1) = 1`;
const RECONCILE_TARGETS_ORDER_SQL = ` ORDER BY t.updated_at, t.id`;

export interface ReconcileInterruptedInput {
  readonly projectKey: string;
  /** 容器限定（缺席 = 全域对账） */
  readonly source?: ContainerRef;
  /** 进程内循环登记表空（插件装配时点恒真；活循环在场 = false 短路零写入） */
  readonly registryEmpty: boolean;
}

export interface ReconcileInterruptedResult {
  readonly reconciled: readonly TaskRef[];
  readonly stats?: { readonly inProgress: number; readonly loopSourced: number };
}

/** Interface 1 reconcileInterrupted：三重收敛判据状态真化 */
export async function reconcileInterrupted(
  deps: TasksVerbDeps,
  input: ReconcileInterruptedInput,
): Promise<ReconcileInterruptedResult> {
  const db = deps.db;
  const now = new Date().toISOString();

  // 判据③ 短路：登记表非空 = 有活循环可能持有在飞任务——不对账（零写入零事件）
  if (!input.registryEmpty) return { reconciled: [] };

  const result = withTransaction(db, (): ReconcileInterruptedResult => {
    const scopeSql = input.source === undefined ? "" : ` AND t.slug = ?`;
    const scopeParams: string[] = input.source === undefined ? [] : [input.source.slug];
    const inProgress = (
      db
        .prepare<unknown[], { n: number }>(
          `SELECT COUNT(*) AS n FROM task_tasks t WHERE t.project_key = ? AND t.task_status = 'in_progress'${scopeSql}`,
        )
        .get(input.projectKey, ...scopeParams) as { n: number }
    ).n;
    const loopSourced = (
      db
        .prepare<unknown[], { n: number }>(
          `SELECT COUNT(*) AS n ${RECONCILE_TARGETS_WHERE_SQL} AND t.project_key = ?${scopeSql}`,
        )
        .get(input.projectKey, ...scopeParams) as { n: number }
    ).n;
    const rows =
      input.source === undefined
        ? db
            .prepare<unknown[], TaskStorageRow>(
              `SELECT ${TASK_COLUMNS} ${RECONCILE_TARGETS_WHERE_SQL} AND t.project_key = ?${RECONCILE_TARGETS_ORDER_SQL}`,
            )
            .all(input.projectKey)
        : db
            .prepare<unknown[], TaskStorageRow>(
              `SELECT ${TASK_COLUMNS} ${RECONCILE_TARGETS_WHERE_SQL} AND t.project_key = ? AND t.slug = ?${RECONCILE_TARGETS_ORDER_SQL}`,
            )
            .all(input.projectKey, input.source.slug);
    if (rows.length === 0) return { reconciled: [], stats: { inProgress, loopSourced } };

    const flip = db.prepare(`UPDATE task_tasks SET task_status = 'interrupted', updated_at = ? WHERE id = ?`);
    const insertRecord = db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, note, actor, created_at, updated_at)
       VALUES (?, 'transition', 'in_progress', 'interrupted', '进程重启', 'core', ?, ?)`,
    );

    const reconciled: TaskRef[] = [];
    for (const row of rows) {
      assertTransitionAllowed(row.task_status, "interrupted", "agent");
      flip.run(now, row.id);
      insertRecord.run(row.id, now, now);
      reconciled.push({ slug: row.slug, localId: row.local_id });
    }

    return { reconciled, stats: { inProgress, loopSourced } };
  });

  if (result.reconciled.length > 0) deps.events.emitTasksChanged(input.projectKey);
  return result;
}
