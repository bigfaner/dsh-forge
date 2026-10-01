// workbench/projection/diff — 投影对账 diff 纯函数(任务 3.1)。
//
// 期望(workspace_projection ∪ projects,经 expectation-repo 并集读出)vs
// client 上报的 dsh 侧 workspace 实况快照(Interface 1 submitWorkspaceSnapshot
// 入参形态)→ 逐项目收敛 plan(幂等全量重推)+ 三类偏差行(DeviationRow:
// renamed/deleted/reordered)+ 对账 verdict(state-machine 的迁移事件源)。
//
// Hard Rule(单向纪律,BIZ-006):dsh 侧实况在本域只是只读输入 —— 没有
// 任何函数以实况为权威产出 forge 侧写集;偏差仅呈现(DeviationRow 为纯
// 数据,明细不落表,对账重算物化——er-diagram §projects.projection_state
// 注记),收敛方向恒为 期望 → 实况(ops)。
//
// 偏差分类口径(三类均以「最近成功 push」为基线——从未成功投影的项目
// 无从「被手改」,首跑/存量收数不产生偏差噪音;不一致只体现为待收敛 op):
//   - renamed:已推送项目,实况命中且 title ≠ pushedTitle(dsh 侧手改);
//   - deleted:已推送项目,实况未命中(最近成功投影的 workspace 消失;
//     同 path 异 id 的重建不算 deleted——那是复连场景,由 ensure 收养);
//   - reordered:已推送且实况命中的 active 子集,实况相对序 ≠ 期望相对序
//     (仅比对已推送成员彼此的相对序;未收养成员不参与判漂移)。
// 归档项目(archived=1):verdict='archived',零 plan 零偏差零迁移(必答⑤:
// 期望不变,workspace 保留)。

import {
  activeExpectationsInOrder,
  buildProjectionPlan,
  matchByPath,
  type ProjectionExpectation,
  type ProjectionPlan,
  type WorkspaceSnapshotEntry,
  type WorkspaceSnapshotInput,
} from './plan.ts'

/** 偏差行(Interface 1 DeviationRow;明细不落表,对账重算物化)。 */
export interface DeviationRow {
  readonly type: 'renamed' | 'deleted' | 'reordered'
  readonly detail: string
}

/**
 * 对账 verdict(逐项目;state-machine reconcileVerdictEvent 的输入):
 * - drift:检出偏差行(→ deviation 迁移);
 * - match:实况与期望一致且无待收敛 op(→ healthy 迁移;存量 pending 收数
 *   即经此径:从未推送但实况已在场且同名 → healthy);
 * - unprojected:存在待收敛 op 而无偏差(投影未建立/未收敛;不迁移,
 *   pending 保持,已 healthy/degraded 保持 —— 收敛走 push 路径);
 * - archived:归档项目(不参与对账,不迁移)。
 */
export type ReconcileVerdict = 'match' | 'drift' | 'unprojected' | 'archived'

/** 逐项目对账行(verdict + 该项目的偏差明细;呈现面按项目聚合)。 */
export interface ProjectionReconcileRow {
  readonly projectId: string
  readonly verdict: ReconcileVerdict
  readonly deviations: readonly DeviationRow[]
}

/** diffProjection 产物:plans(sort_order 升序,ensure 执行序的数组承载)+ 逐项目对账行。 */
export interface ProjectionDiffResult {
  readonly plans: readonly ProjectionPlan[]
  readonly rows: readonly ProjectionReconcileRow[]
}

/** 改名偏差(基线 = pushedTitle ?? expectedTitle:forge 侧改名未推完不算手改)。 */
function renamedDeviation(exp: ProjectionExpectation, match: WorkspaceSnapshotEntry | null): DeviationRow | null {
  if (match === null || exp.pushedWorkspaceId === null) return null
  const baseline = exp.pushedTitle ?? exp.expectedTitle
  if (match.title === baseline) return null
  return {
    type: 'renamed',
    detail: `title drift: pushed '${baseline}' vs dsh '${match.title}' (workspace ${match.workspaceId} at ${exp.path})`,
  }
}

/** 删除偏差(最近成功投影的 workspace 在实况中消失;同 path 异 id = 复连,不算)。 */
function deletedDeviation(exp: ProjectionExpectation, match: WorkspaceSnapshotEntry | null): DeviationRow | null {
  if (match !== null || exp.pushedWorkspaceId === null) return null
  return {
    type: 'deleted',
    detail: `workspace gone: pushed ${exp.pushedWorkspaceId} at ${exp.path} no longer reported by dsh`,
  }
}

/**
 * 乱序偏差(仅已推送成员彼此的相对序):期望序(子集内 sort_order)与
 * 实况序(子集内 orderIdx)位置不一致的成员各出一行,detail 携两侧完整
 * 序列(呈现与「重试投影」处理建议共用上下文)。
 */
function reorderedDeviations(
  exps: readonly ProjectionExpectation[],
  snapshot: WorkspaceSnapshotInput,
): Map<string, DeviationRow> {
  const rows = new Map<string, DeviationRow>()
  if (snapshot === null) return rows
  const pushedMatched = activeExpectationsInOrder(exps)
    .filter(exp => exp.pushedWorkspaceId !== null)
    .map(exp => ({ exp, match: matchByPath(exp, snapshot) }))
    .filter((entry): entry is { exp: ProjectionExpectation; match: WorkspaceSnapshotEntry } => entry.match !== null)
  if (pushedMatched.length < 2) return rows
  const expectedOrder = pushedMatched.map(entry => entry.match.workspaceId)
  const actualOrder = pushedMatched
    .slice()
    .sort((a, b) => (a.match.orderIdx - b.match.orderIdx) || (a.match.workspaceId < b.match.workspaceId ? -1 : 1))
    .map(entry => entry.match.workspaceId)
  if (expectedOrder.join('\u0000') === actualOrder.join('\u0000')) return rows
  const detail = `order drift: expected [${expectedOrder.join(', ')}] vs dsh [${actualOrder.join(', ')}]`
  for (const entry of pushedMatched) {
    const expectedIdx = expectedOrder.indexOf(entry.match.workspaceId)
    const actualIdx = actualOrder.indexOf(entry.match.workspaceId)
    if (expectedIdx !== actualIdx) {
      rows.set(entry.exp.projectId, { type: 'reordered', detail })
    }
  }
  return rows
}

/**
 * 投影对账 diff(纯函数,同输入同产物 —— 幂等全量重推的 plan 生成器):
 * 快照为 null(实况未知,收数前)→ plans = 逐 active 项目单 ensure(安全
 * 幂等重推:create-or-adopt),零偏差,verdict 全 unprojected(不迁移)。
 */
export function diffProjection(
  expectations: readonly ProjectionExpectation[],
  snapshot: WorkspaceSnapshotInput,
): ProjectionDiffResult {
  const reordered = reorderedDeviations(expectations, snapshot)
  const plans: ProjectionPlan[] = []
  const rows: ProjectionReconcileRow[] = []
  // 迭代序 = (orderIdx, projectId) 升序:plans 数组即承载 ensure 的
  // sort_order 升序执行序,产物与输入数组顺序无关(确定性 = 幂等前提)。
  for (const exp of expectations.slice().sort(
    (a, b) => (a.orderIdx - b.orderIdx) || (a.projectId < b.projectId ? -1 : 1),
  )) {
    if (exp.archived) {
      rows.push({ projectId: exp.projectId, verdict: 'archived', deviations: [] })
      continue
    }
    const match = matchByPath(exp, snapshot)
    const deviations: DeviationRow[] = []
    const renamed = renamedDeviation(exp, match)
    if (renamed !== null) deviations.push(renamed)
    const deleted = deletedDeviation(exp, match)
    if (deleted !== null) deviations.push(deleted)
    const reorderedRow = reordered.get(exp.projectId)
    if (reorderedRow !== undefined) deviations.push(reorderedRow)
    const plan = buildProjectionPlan(expectations, snapshot, exp.projectId)
    plans.push(plan)
    rows.push({
      projectId: exp.projectId,
      verdict: deviations.length > 0 ? 'drift' : plan.ops.length === 0 ? 'match' : 'unprojected',
      deviations,
    })
  }
  return { plans, rows }
}
