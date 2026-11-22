// phase-gate——容器实现链阶段门（core forge/tasks/phase-gate.ts 直迁——plugin-task-loop
// 1.7 内联 + 容器语义 slug 化改造）。门谓词单实现面：GATE_SQL(t) 由 contracts 词表常量
// （VALIDATION_TASK_TYPES / IMPLEMENTATION_TASK_TYPES）模板生成，READY_PREDICATE（就绪集侧）
// 与 assertContainerChainSettled（fresh-claim 直取径守卫）双落点消费同一片段——双写漂移
// 构造性关闭（TS 守卫不另实现判定，直接对 db 执行同源 GATE_SQL 做 EXISTS 探测）。
//
// 门语义：验证类卡（V）可领 ⇔ 容器实现链（I 卡，排除 fix/disc 谱系）终态合取
// （completed/skipped）。slug 化退役面：② proposal 容器豁免支退役（容器无 kind 判别——
// 门对所有 slug 容器同构生效）；③ e2e_attribution 豁免支退役（v1 列面零该列——归因标记
// 随列退役）。守卫时点语义：守卫运行在事务外纯读段，判定以守卫时点快照为准。
import type Database from "@dsh-forge/lib-db";
import { IMPLEMENTATION_TASK_TYPES, VALIDATION_TASK_TYPES } from "@dsh-forge/contracts";
import { PhaseGateUnsettledError } from "./errors.js";
import type { TaskStorageRow } from "./query.js";

/** SQL 字面量清单片段（词表 → IN (...) 生成——任何一方不手抄字面清单） */
function sqlList(types: readonly string[]): string {
  return types.map((t) => `'${t}'`).join(", ");
}

/**
 * 门谓词 SQL 片段：返回值为 TRUE = 门透明（链已收口），FALSE = 被门持有。析取两支：
 * ① 非验证类（I/G 卡天然透明）；② 容器实现链终态合取（I 类型 + fix-of 谱系排除——
 * isFixTask 单源谓词 SQL 面 + 状态 ∈ {completed, skipped}）。
 */
export function GATE_SQL(t: string): string {
  return `(
  ${t}.task_type NOT IN (${sqlList(VALIDATION_TASK_TYPES)})
  OR NOT EXISTS (
    SELECT 1 FROM task_tasks b
    WHERE b.project_key = ${t}.project_key AND b.slug = ${t}.slug
      AND b.task_type IN (${sqlList(IMPLEMENTATION_TASK_TYPES)})
      AND b.fix_of_task_id IS NULL
      AND b.task_status NOT IN ('completed', 'skipped'))
)`;
}

/**
 * 容器实现链未终态 I 卡清单（readUnsettledChain 服务动词执行体——链集合定义与 GATE_SQL
 * 第②支同判据单点，消费方零第二实现）。scope = project_key + slug 容器限定。
 */
export function readUnsettledChain(
  db: Database.Database,
  scope: { readonly projectKey: string; readonly slug: string },
): { slug: string; localId: string; taskStatus: TaskStorageRow["task_status"] }[] {
  return db
    .prepare<unknown[], { slug: string; localId: string; taskStatus: TaskStorageRow["task_status"] }>(
      `SELECT slug AS slug, local_id AS localId, task_status AS taskStatus
       FROM task_tasks
       WHERE project_key = ? AND slug = ?
         AND task_type IN (${sqlList(IMPLEMENTATION_TASK_TYPES)})
         AND fix_of_task_id IS NULL
         AND task_status NOT IN ('completed', 'skipped')
       ORDER BY slug, local_id`,
    )
    .all(scope.projectKey, scope.slug);
}

/**
 * fresh-claim 守卫：对被门行抛 ERR_PHASE_GATE_UNSETTLED（data.unsettled 带链上未终态 I 卡
 * 清单）。同点收口：直接对 db 执行同源 GATE_SQL 做探测，谓词本体单实现。
 */
export function assertContainerChainSettled(db: Database.Database, projectKey: string, row: TaskStorageRow): void {
  const gated = db
    .prepare<unknown[], { gated: number }>(
      `SELECT EXISTS (
        SELECT 1 FROM task_tasks t WHERE t.id = ? AND NOT ${GATE_SQL("t")}
      ) AS gated`,
    )
    .get(row.id);
  if (gated?.gated !== 1) return;
  throw new PhaseGateUnsettledError({
    projectKey,
    taskRef: { slug: row.slug, localId: row.local_id },
    containerSlug: row.slug,
    unsettled: readUnsettledChain(db, { projectKey: row.project_key, slug: row.slug }),
  });
}

/**
 * gatedPending 计数：pending ∧ NOT GATE_SQL（被门持有）单查询计数；scope 可选
 * （undefined = 全库），同 taskStats 口径。谓词本体复用 GATE_SQL 同一片段——零谓词复制。
 */
export function countGatedPending(
  db: Database.Database,
  projectKey: string,
  scope: { readonly slug: string } | undefined,
): number {
  const scopeSql = scope === undefined ? "" : ` AND t.slug = ?`;
  const args = scope === undefined ? [projectKey] : [projectKey, scope.slug];
  const row = db
    .prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM task_tasks t WHERE t.project_key = ? AND t.task_status = 'pending'${scopeSql} AND NOT ${GATE_SQL("t")}`,
    )
    .get(...args);
  return row?.n ?? 0;
}
