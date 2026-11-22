// checkpoints 四指标 slug 维度现算（plugin-task-loop 1.9，模块③——entities.md §3.2④ pin）。
// 纯读现算：零跨域调用、零缓存、零进程触面——口径单源 = task_settlements（经 JOIN task_tasks
// 取 project_key/slug 归属）+ task_checkpoints（project_key+slug 前导谓词）。
// - firstPassRate：首结算即 success 的任务数 / 已结算任务数（首结算 = 链内最早一行，
//   排序锚 created_at, seq——禁 ORDER BY id，UUID 无序）。
// - reworkRatio：非 fix 链产生的返工结算行数（fix_root_id IS NULL ∧ result='blocked'——根
//   任务 blocked 结算行） / 结算总行数（一任务多结算全计——rework 全史保留口径）。
// - reviewWaves：task_checkpoints mark='review-wave-N' 的 max(wave_seq)（无波 = 0）。
// - fixDensity：fix_root_id 链去重计链数，每链取最新 success 的 commit_hash 去重，
//   ÷ 已结算任务数（FIX_DENSITY_FORMULA pin——shared/contract-constants.ts 单源）。
import type Database from "@dsh-forge/lib-db";
import { FIX_DENSITY_FORMULA } from "../../../shared/contract-constants.js";

/** 四指标计算结果（全部 0–1 比率，reviewWaves 除外——波数自然数）。 */
export interface ContainerMetrics {
  readonly firstPassRate: number;
  readonly reworkRatio: number;
  readonly reviewWaves: number;
  readonly fixDensity: number;
}

/** 四指标查询（容器定位 + 可选时间窗——窗口过滤 settlements 与 checkpoints 双面）。 */
export interface MetricsQuery {
  readonly projectKey: string;
  readonly slug: string;
  /** 时间窗（缺省 = 全史；since = created_at 下界含端） */
  readonly window?: { readonly since?: string };
}

interface SettledRow {
  task_id: string;
  first_result: "success" | "blocked";
}

/**
 * 四指标现算（纯函数——db 只读）。
 */
export function computeMetrics(db: Database.Database, q: MetricsQuery): ContainerMetrics {
  const sinceClause = q.window?.since !== undefined ? " AND s.created_at >= ?" : "";
  const sinceArgs = q.window?.since !== undefined ? [q.window.since] : [];

  // 已结算任务集 + 各任务首结算判定（first_result）与 fix 链身份（JOIN 传导归属）。
  const settled = db
    .prepare<unknown[], SettledRow>(
      `SELECT s.task_id, s.result AS first_result
       FROM task_settlements s
       JOIN task_tasks t ON t.id = s.task_id
       WHERE t.project_key = ? AND t.slug = ?${sinceClause}
       ORDER BY s.created_at, s.seq, s.id`,
    )
    .all(q.projectKey, q.slug, ...sinceArgs);

  const settledTaskIds = new Set<string>();
  const firstResultByTask = new Map<string, "success" | "blocked">();
  for (const r of settled) {
    if (!settledTaskIds.has(r.task_id)) {
      settledTaskIds.add(r.task_id);
      firstResultByTask.set(r.task_id, r.first_result);
    }
  }
  const settledTasks = settledTaskIds.size;

  // 结算总行数与根任务 blocked 行数（reworkRatio 分子——fix_root_id IS NULL ∧ blocked）。
  const settleTotals = db
    .prepare<unknown[], { total: number; root_blocked: number }>(
      `SELECT COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN s.fix_root_id IS NULL AND s.result = 'blocked' THEN 1 ELSE 0 END), 0) AS root_blocked
       FROM task_settlements s
       JOIN task_tasks t ON t.id = s.task_id
       WHERE t.project_key = ? AND t.slug = ?${sinceClause}`,
    )
    .get(q.projectKey, q.slug, ...sinceArgs);

  // fix density：链去重（fix_root_id 非空分组），每链最新 success 的 commit_hash 去重。
  const chainSuccesses = db
    .prepare<unknown[], { fix_root_id: string; commit_hash: string | null }>(
      `SELECT s.fix_root_id, s.commit_hash
       FROM task_settlements s
       JOIN task_tasks t ON t.id = s.task_id
       WHERE t.project_key = ? AND t.slug = ? AND s.fix_root_id IS NOT NULL
         AND s.result = 'success'${sinceClause}
       ORDER BY s.fix_root_id, s.created_at DESC, s.seq DESC, s.id DESC`,
    )
    .all(q.projectKey, q.slug, ...sinceArgs);
  const latestCommitByChain = new Map<string, string>();
  for (const r of chainSuccesses) {
    if (!latestCommitByChain.has(r.fix_root_id) && r.commit_hash !== null) {
      latestCommitByChain.set(r.fix_root_id, r.commit_hash);
    }
  }
  // 分子 = 每链最新 success commit_hash 去重后的链数（同 commit 跨链合并计数）。
  const fixChainCount = new Set(latestCommitByChain.values()).size;

  // reviewWaves：容器内 review-wave-N 的 max(wave_seq)（无波 = 0）。
  const waves = db
    .prepare<unknown[], { max_seq: number | null }>(
      `SELECT MAX(wave_seq) AS max_seq FROM task_checkpoints
       WHERE project_key = ? AND slug = ? AND mark = 'review-wave-N'${sinceClause ? " AND created_at >= ?" : ""}`,
    )
    .get(q.projectKey, q.slug, ...sinceArgs);

  const firstPass = [...firstResultByTask.values()].filter((r) => r === "success").length;
  const totalSettleRows = settleTotals?.total ?? 0;
  const rootBlocked = settleTotals?.root_blocked ?? 0;

  return {
    firstPassRate: settledTasks === 0 ? 0 : firstPass / settledTasks,
    reworkRatio: totalSettleRows === 0 ? 0 : rootBlocked / totalSettleRows,
    reviewWaves: waves?.max_seq ?? 0,
    fixDensity: settledTasks === 0 ? 0 : fixChainCount / settledTasks,
  };
}

/** fix density 口径 pin（entities.md §3.2④ 终态——公式漂移即契约 RED）。 */
export { FIX_DENSITY_FORMULA };
