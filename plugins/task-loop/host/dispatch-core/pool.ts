// dispatch-core · 池快照（plugin-forge src/dispatch-core/pool.ts 直迁——proposal
// plugin-task-loop 任务 1.11；裁决：现状感知·无状态）——池态四键投影 + 三分判定纯函数：
// 核心面结算/无任务径与工具壳渲染共用。TaskStats 类型改用本插件域层
// （host/domain/tasks/list.ts——byStatus 八态 + unmetPending + gatedPending 同形）。
import type { TaskStats } from "../domain/tasks/list.js";

/** 池快照（taskStats 现读——附载 spawned/no-task 每次返回） */
export interface PoolSnapshot {
  readonly pending: number;
  readonly inProgress: number;
  readonly blocked: number;
  /** pending ∧ 前置未全满足计数（等待判据成分——单查询派生） */
  readonly unmetPending: number;
  /** pending ∧ 容器实现链阶段门持有计数（观测面） */
  readonly gatedPending: number;
}

/** taskStats → 池快照（byStatus 取四键） */
export function poolOf(stats: TaskStats): PoolSnapshot {
  return {
    pending: stats.byStatus.pending,
    inProgress: stats.byStatus.in_progress,
    blocked: stats.byStatus.blocked,
    unmetPending: stats.unmetPending,
    gatedPending: stats.gatedPending,
  };
}

/** 池态三分（no-task 分支的收工/等待/疑似死锁可判） */
export type PoolVerdict = "done" | "wait" | "deadlock-suspected";

/** 池态三分判定（纯函数）：全终态收工 / blocked>0 且无通路疑似死锁 / 其余等待 */
export function classifyPool(pool: PoolSnapshot): PoolVerdict {
  if (pool.pending === 0 && pool.blocked === 0 && pool.inProgress === 0) return "done";
  if (pool.blocked > 0 && pool.pending === 0 && pool.unmetPending === 0 && pool.inProgress === 0) return "deadlock-suspected";
  return "wait";
}
