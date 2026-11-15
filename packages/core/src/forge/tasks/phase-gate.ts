// phase-gate——容器实现链阶段门（loop-phase-gate 设计 §1.1/§1.2/§1.3；任务 1.2/B2）。
// 定位：业务（forge/tasks 子域）。门谓词单实现面：GATE_SQL(t) 由 contracts 词表常量
// （VALIDATION_TASK_TYPES / IMPLEMENTATION_TASK_TYPES / E2E_ATTRIBUTION_COLUMN）模板生成，
// READY_PREDICATE（就绪集侧）与 assertContainerChainSettled（fresh-claim 直取径守卫）双落点
// 消费同一片段——双写漂移构造性关闭（M2 同点收口：TS 守卫不另实现判定，直接对 db 执行
// 同源 GATE_SQL 做 EXISTS 探测，谓词本体单实现）。
//
// 门语义（design §1.1）：验证类卡（V ∧ feature 容器）可领 ⇔ 容器实现链（I 卡，排除
// fix-/disc- 前缀）终态合取（completed/skipped）。E2E 归因卡豁免 = 无入边 ∧ e2e_attribution=1
// 双条件缺一不豁免（CE-6 收窄——裸无入边 V 卡不豁免，INV-1 防绕过）。豁免面逐项：
// gate 不入 V（类型判据天然豁免）、proposal 容器豁免（律四同构）、blocked→completed 直达
// 结算不经门（门只挂 pending→in_progress 转移时点）、V 卡恢复回 pending 后读时重判。
// 守卫时点语义（design 红旗 R2）：守卫运行在事务外纯读段，判定以守卫时点快照为准——
// 与既有 TOCTOU 防线同风格的快照窗口，不做事务内重判。
import type Database from 'better-sqlite3'
import type { PhaseGateUnsettledData, UnmetDependency } from '@dsh-forge/contracts'
import { E2E_ATTRIBUTION_COLUMN, IMPLEMENTATION_TASK_TYPES, VALIDATION_TASK_TYPES } from '@dsh-forge/contracts'
import { PhaseGateUnsettledError } from './errors.js'
import type { TaskStorageRow } from './query.js'

/** SQL 字面量清单片段（词表 → IN (...) 生成——任何一方不手抄字面清单，design §3） */
function sqlList(types: readonly string[]): string {
  return types.map((t) => `'${t}'`).join(', ')
}

/**
 * 门谓词 SQL 片段（design §1.1 目标形态）：返回值为 TRUE = 门透明（豁免或链已收口），
 * FALSE = 被门持有。析取四支：
 * ① 非验证类（I/G 卡天然透明）；② 非 feature 容器（proposal 律四豁免）；
 * ③ E2E 归因豁免 = e2e_attribution=1 ∧ 无入边（双条件合取——缺一不豁免）；
 * ④ 容器实现链终态合取（I 类型 + fix-/disc- 前缀排除 + 状态 ∈ {completed, skipped}）。
 */
export function GATE_SQL(t: string): string {
  return `(
  ${t}.task_type NOT IN (${sqlList(VALIDATION_TASK_TYPES)})
  OR ${t}.source_kind <> 'feature'
  OR (${t}.${E2E_ATTRIBUTION_COLUMN} = 1 AND NOT EXISTS (
    SELECT 1 FROM task_edges e0 WHERE e0.task_id = ${t}.id))
  OR NOT EXISTS (
    SELECT 1 FROM tasks b
    WHERE b.source_kind = ${t}.source_kind AND b.source_id = ${t}.source_id
      AND b.task_type IN (${sqlList(IMPLEMENTATION_TASK_TYPES)})
      AND b.local_id NOT LIKE 'fix-%' AND b.local_id NOT LIKE 'disc-%'
      AND b.task_status NOT IN ('completed', 'skipped'))
)`
}

/**
 * 容器实现链未终态 I 卡清单（PhaseGateUnsettledData.unsettled——agent 可据以推进；bug a587123e
 * 收口：本函数升服务面动词 readUnsettledChain 的执行体——链集合定义与 GATE_SQL 第④支同判据
 * 单点，消费方 plugin-forge driver 零第二实现）。
 */
export function readUnsettledChain(
  db: Database.Database,
  scope: { readonly kind: 'feature' | 'proposal'; readonly sourceId: string },
): UnmetDependency[] {
  return db
    .prepare<unknown[], UnmetDependency>(
      `SELECT slug AS slug, local_id AS localId, task_status AS taskStatus
       FROM tasks
       WHERE source_kind = ? AND source_id = ?
         AND task_type IN (${sqlList(IMPLEMENTATION_TASK_TYPES)})
         AND local_id NOT LIKE 'fix-%' AND local_id NOT LIKE 'disc-%'
         AND task_status NOT IN ('completed', 'skipped')
       ORDER BY slug, local_id`,
    )
    .all(scope.kind, scope.sourceId)
}

/**
 * fresh-claim 守卫（CE-2 直取径落点——design §1.3）：对被门行抛 ERR_PHASE_GATE_UNSETTLED
 * （data.unsettled 带链上未终态 I 卡清单）。M2 同点收口：不另实现 TS 判定——直接对 db 执行
 * 同源 GATE_SQL（以本行 id 代入 t 别名）做探测，谓词本体单实现。豁免（adopt 径与重入径）
 * 由调用方（claim.ts 守卫段）按目标态断言先判，本函数只做门判定本体。
 */
export function assertContainerChainSettled(db: Database.Database, projectId: string, row: TaskStorageRow): void {
  const gated = db
    .prepare<unknown[], { gated: number }>(
      `SELECT EXISTS (
        SELECT 1 FROM tasks t WHERE t.id = ? AND NOT ${GATE_SQL('t')}
      ) AS gated`,
    )
    .get(row.id)
  if (gated?.gated !== 1) return
  const data: PhaseGateUnsettledData = {
    projectId,
    taskRef: { slug: row.slug, localId: row.local_id },
    containerSlug: row.slug,
    unsettled: readUnsettledChain(db, { kind: row.source_kind, sourceId: row.source_id }),
  }
  throw new PhaseGateUnsettledError(data)
}

/**
 * gatedPending 计数（CE-1 暴露面派生——design §1.4/§2.7）：pending ∧ NOT GATE_SQL（被门持有）
 * 单查询计数（与 list.countUnmetPending 同形）；scope 可选（undefined = 全库），同 taskStats 口径。
 * 谓词本体复用 GATE_SQL 同一片段——零谓词复制（design §1 裁定）。
 */
export function countGatedPending(
  db: Database.Database,
  scope: { readonly kind: 'feature' | 'proposal'; readonly sourceId: string } | undefined,
): number {
  const scopeSql = scope === undefined ? '' : ` AND t.source_kind = ? AND t.source_id = ?`
  const args = scope === undefined ? [] : [scope.kind, scope.sourceId]
  const row = db
    .prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM tasks t WHERE t.task_status = 'pending'${scopeSql} AND NOT ${GATE_SQL('t')}`,
    )
    .get(...args)
  return row?.n ?? 0
}
