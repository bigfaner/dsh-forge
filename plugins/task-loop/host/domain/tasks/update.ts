// updateTask——任务域主 agent 修改动词（core forge/tasks/update.ts 直迁——plugin-task-loop
// 1.7 内联 + v1 列面适配：brief/ac_json/context_json/scope_json 列名；相位域退役摘除）。
// 定位口径：TaskRef = slug + localId（三键查捞），返回更新后快照。
// 宽字段面 partial 语义：title/type/priority/estimatedTime/complexity/brief/
// acceptanceCriteria/scope/context/coverageThreshold/dependsOn 给定即改、未给不动。
// 状态门（统一判据：无 worker 持有 ∧ 未落结算审计）：pending/blocked/suspended 可改；其余拒。
// dependsOn 改写护栏（仅整体改写径）：仅 manual 边——派生出边即拒；改写 = 删旧 manual 边 →
// 增量环校验（findPathThroughOutEdges 单源）→ 插新 manual 边。dependsOnAppend 增量白通道：
// 无锁边护栏、零删除、INSERT OR IGNORE 幂等、增量环校验共用；与 dependsOn 互斥。
// 审计：verb='updateTask' 行（actor='plugin-tool'）。blocked 卡改写后同事务补跑恢复判定。
import { withTransaction } from "@dsh-forge/lib-db";
import { findPathThroughOutEdges, naturalKeysByIds } from "./add.js";
import { CycleDetectedError, EdgeOriginLockedError, TaskLockedError, TaskNotFoundError } from "./errors.js";
import { resolveTaskRef, toTaskSnapshot } from "./query.js";
import { restoreBlockedWaiter } from "./transition.js";
import type { TaskSnapshot, TaskStatus, TaskScope, TasksVerbDeps } from "./types.js";

/** 可改状态门（无 worker 持有 ∧ 未落结算审计） */
const UPDATABLE_TASK_STATUSES: readonly TaskStatus[] = ["pending", "blocked", "suspended"];

/** 同容器边解析的行键面（依赖前置定位最小形状） */
interface DepKeyRow {
  id: string;
  slug: string;
  local_id: string;
}

export interface UpdateTaskInput {
  readonly projectKey: string;
  readonly taskRef: { readonly slug: string; readonly localId: string };
  readonly title?: string;
  readonly type?: string;
  readonly priority?: "P0" | "P1" | "P2";
  readonly estimatedTime?: string;
  readonly complexity?: "low" | "medium" | "high";
  readonly brief?: string;
  readonly acceptanceCriteria?: readonly string[];
  readonly scope?: TaskScope;
  readonly context?: Readonly<Record<string, string>>;
  readonly coverageThreshold?: number;
  /** 依赖前置整体置换（同容器 localId） */
  readonly dependsOn?: readonly string[];
  /** manual 边增量追加（白通道）——与 dependsOn 互斥 */
  readonly dependsOnAppend?: readonly string[];
}

/** Interface 1 updateTask：宽字段 partial 改写 + 状态门 + dependsOn 护栏/环校验 + 审计 */
export async function updateTask(deps: TasksVerbDeps, input: UpdateTaskInput): Promise<TaskSnapshot> {
  const db = deps.db;
  const now = new Date().toISOString();

  const snapshot = withTransaction(db, (): TaskSnapshot => {
    // ① 行解析（未命中 ERR_TASK_NOT_FOUND）
    const row = resolveTaskRef(db, input.projectKey, input.taskRef);

    // ② 状态门（同事务内、任何写入前——与 claimTask 串行化）
    if (!(UPDATABLE_TASK_STATUSES as readonly string[]).includes(row.task_status)) {
      throw new TaskLockedError({
        projectKey: input.projectKey,
        taskRef: input.taskRef,
        taskStatus: row.task_status,
      });
    }

    // ③ 依赖段（两径分派——白通道）
    if (input.dependsOn !== undefined && input.dependsOnAppend !== undefined) {
      throw new Error(
        "dependsOn 与 dependsOnAppend 并存：一次调用一个意图（整体置换 vs 增量追加语义歧义——输入契约违例）",
      );
    }
    const appendList = input.dependsOnAppend;
    if (input.dependsOn !== undefined || appendList !== undefined) {
      const dependsOnList = input.dependsOn ?? (appendList as string[]);
      // ③-a 护栏（仅整体改写径）：仅 manual 边可改写
      if (appendList === undefined) {
        const outEdges = db
          .prepare<unknown[], { origin: "manual" | "fix-chain" | "autoconfig" }>(
            `SELECT origin FROM task_edges WHERE task_id = ?`,
          )
          .all(row.id);
        const lockedOrigins = outEdges
          .map((e) => e.origin)
          .filter((o): o is "fix-chain" | "autoconfig" => o !== "manual");
        if (lockedOrigins.length > 0) {
          throw new EdgeOriginLockedError({
            projectKey: input.projectKey,
            taskRef: input.taskRef,
            origins: lockedOrigins,
          });
        }
      }

      // ③-b 前置解析（同容器三键查捞）
      const depends: DepKeyRow[] = [];
      for (const localId of dependsOnList) {
        const dep = db
          .prepare<unknown[], DepKeyRow>(
            `SELECT id, slug, local_id FROM task_tasks WHERE project_key = ? AND slug = ? AND local_id = ?`,
          )
          .get(row.project_key, row.slug, localId);
        if (dep === undefined) {
          throw new TaskNotFoundError({
            projectKey: input.projectKey,
            taskRef: { slug: row.slug, localId },
            containerSlug: row.slug,
          });
        }
        depends.push(dep);
      }

      // ③-c 删旧 manual 边（仅整体改写径）
      if (appendList === undefined) {
        db.prepare(`DELETE FROM task_edges WHERE task_id = ? AND origin = 'manual'`).run(row.id);
      }

      // ③-d 增量环校验（findPathThroughOutEdges 单源；两径共用）
      for (const d of depends) {
        const hopPath = d.id === row.id ? [d.id] : findPathThroughOutEdges(db, d.id, row.id);
        if (hopPath !== null) {
          const keys = naturalKeysByIds(db, [row.id, ...hopPath]);
          const rowKey = keys.get(row.id) ?? `${row.slug}/${row.local_id}`;
          throw new CycleDetectedError({ cycle: [rowKey, ...hopPath.map((id) => keys.get(id) ?? id)] });
        }
      }

      // ③-e 插 manual 边（改写径显式 INSERT；append 径 INSERT OR IGNORE 幂等）
      const insertEdge = db.prepare(
        appendList === undefined
          ? `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
             VALUES (?, ?, 'manual', ?, ?)`
          : `INSERT OR IGNORE INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
             VALUES (?, ?, 'manual', ?, ?)`,
      );
      for (const dep of depends) {
        insertEdge.run(row.id, dep.id, now, now);
      }

      // ③-f 恢复钩子补跑（blocked 卡补边后前置全满足即恢复 pending；非 blocked 卡不动）
      if (row.task_status === "blocked") {
        restoreBlockedWaiter(db, row.id, now);
      }
    }

    // ④ 宽字段 partial UPDATE（给定即改、未给不动；updated_at 单点刷新）
    const sets: string[] = [];
    const args: unknown[] = [];
    if (input.title !== undefined) {
      sets.push("title = ?");
      args.push(input.title);
    }
    if (input.type !== undefined) {
      sets.push("task_type = ?");
      args.push(input.type);
    }
    if (input.priority !== undefined) {
      sets.push("priority = ?");
      args.push(input.priority);
    }
    if (input.estimatedTime !== undefined) {
      sets.push("estimated_time = ?");
      args.push(input.estimatedTime);
    }
    if (input.complexity !== undefined) {
      sets.push("complexity = ?");
      args.push(input.complexity);
    }
    if (input.brief !== undefined) {
      sets.push("brief = ?");
      args.push(input.brief);
    }
    if (input.acceptanceCriteria !== undefined) {
      sets.push("ac_json = ?");
      args.push(JSON.stringify(input.acceptanceCriteria));
    }
    if (input.scope !== undefined) {
      sets.push("scope_json = ?");
      args.push(JSON.stringify(input.scope));
    }
    if (input.context !== undefined) {
      sets.push("context_json = ?");
      args.push(JSON.stringify(input.context));
    }
    if (input.coverageThreshold !== undefined) {
      sets.push("coverage_threshold = ?");
      args.push(input.coverageThreshold);
    }
    sets.push("updated_at = ?");
    args.push(now, row.id);
    db.prepare(`UPDATE task_tasks SET ${sets.join(", ")} WHERE id = ?`).run(...args);

    // ⑤ 审计行：updateTask（actor='plugin-tool'；无 from/to）；
    //    AC 变更同事务追加 verb='update-ac' 行（payload_json = 新版判据全文——diff 相邻行可得变更，
    //    entities.md §3.4 payload_json 写点 + code-design §2 AC 载荷终态）。
    db.prepare(
      `INSERT INTO task_records (task_id, verb, actor, created_at, updated_at)
       VALUES (?, 'updateTask', 'plugin-tool', ?, ?)`,
    ).run(row.id, now, now);
    if (input.acceptanceCriteria !== undefined) {
      db.prepare(
        `INSERT INTO task_records (task_id, verb, payload_json, actor, created_at, updated_at)
         VALUES (?, 'update-ac', ?, 'plugin-tool', ?, ?)`,
      ).run(row.id, JSON.stringify(input.acceptanceCriteria), now, now);
    }

    // ⑥ 快照（写后重读）
    return toTaskSnapshot(resolveTaskRef(db, input.projectKey, input.taskRef));
  });

  deps.events.emitTasksChanged(input.projectKey);
  return snapshot;
}
