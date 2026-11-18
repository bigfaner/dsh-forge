// spec-stats（plugin-spec-roadmaps 1.8，code-design §5 模块Ⓔ）——spec 域里程诊断动词：
// 统计口径一次聚合（spec/goal/ac 计数 + goal 状态分布 + AC 投影态分布），emitDiag info
// 双承载（payload 同形返回工具面）。零新落库面（entities 裁决 + 机检锚——本文件零 INSERT/
// UPDATE，读 repo 单源）；投影态现算复用 M3 模块③映射单源（projectAcsStates），task-loop
// 缝缺席/抛错 = 全 AC no-task-data 降级（与 querySpec 同判型，留痕不静默）。
import { emitDiagOrFallback } from "@dsh-forge/lib-diag";
import type { GoalStatus } from "../../db/row-types.js";
import { GOAL_STATES } from "../status-machines.js";
import { projectAcsStates, type AcProjectionState, type AcSettlementsFace } from "../../tools/projection.js";
import type { GoalVerbDeps } from "./goal-advance.js";

/** specStats payload（tools.md §一·五——封闭字段，Typert/UI/agent 共用同一 DTO）。 */
export interface SpecStatsPayload {
  readonly specCount: number;
  readonly goalCount: number;
  readonly acCount: number;
  readonly goalStatusCounts: Readonly<Record<GoalStatus, number>>;
  readonly projectionStateCounts: Readonly<Record<AcProjectionState, number>>;
}

const PROJECTION_STATES: readonly AcProjectionState[] = ["met", "unmet", "unmatched", "no-task-data"];

/** 投影态分布纯归并（行清单 → 四态计数——reduce 单层平铺）。 */
export function countProjectionStates(rows: ReadonlyArray<{ state: AcProjectionState }>): Record<AcProjectionState, number> {
  const counts = Object.fromEntries(PROJECTION_STATES.map((s) => [s, 0])) as Record<AcProjectionState, number>;
  for (const row of rows) counts[row.state]! += 1;
  return counts;
}

/**
 * 诊断动词：repo 三计数 + goal 状态分布 + 投影态分布现算 → ① emitDiag info
 *（event: 'spec-milestone'，payload 就地携全部口径字段）+ ② 同 payload 返回（双承载）。
 */
export async function specStats(deps: GoalVerbDeps, input: { readonly projectKey: string }): Promise<SpecStatsPayload> {
  const specs = deps.repos.specs.list(input.projectKey);
  const goalRows = specs.flatMap((s) => deps.repos.specs.listGoalsBySpec(s.id));
  const acRows = goalRows.flatMap((g) => deps.repos.specs.listAcsByGoal(g.id));
  const goalStatusCounts = Object.fromEntries(
    (Object.keys(GOAL_STATES.states) as GoalStatus[]).map((s) => [s, 0]),
  ) as Record<GoalStatus, number>;
  for (const g of goalRows) goalStatusCounts[g.goalStatus]! += 1;

  // 投影态现算（一次 matchAcSettlements 全 spec 共享；缝缺席/抛错 = 全 AC 无据降级）
  let aggregate: Awaited<ReturnType<AcSettlementsFace["matchAcSettlements"]>> | undefined;
  try {
    const face = deps.acSettlementsOf?.();
    aggregate = face === undefined ? undefined : await face.matchAcSettlements(input.projectKey, acRows.map((a) => a.criterion));
  } catch {
    aggregate = undefined;
  }
  const projection = projectAcsStates(acRows.map((a) => a.criterion), aggregate);
  const payload: SpecStatsPayload = {
    specCount: specs.length,
    goalCount: goalRows.length,
    acCount: acRows.length,
    goalStatusCounts,
    projectionStateCounts: countProjectionStates(projection),
  };
  emitDiagOrFallback(deps.onDiag, {
    event: "spec-milestone",
    level: "info",
    message:
      `spec 里程诊断：specs=${payload.specCount} goals=${payload.goalCount} acs=${payload.acCount} `
      + `goalStatus={${Object.entries(goalStatusCounts).map(([k, v]) => `${k}:${v}`).join(", ")}} `
      + `projection={${Object.entries(payload.projectionStateCounts).map(([k, v]) => `${k}:${v}`).join(", ")}}`,
    projectId: input.projectKey,
  });
  return payload;
}
