// spec-stats（plugin-spec-roadmaps 1.8/1.11，code-design §5 模块Ⓔ）——spec 域里程诊断动词：
// 统计口径函数化（summarizeSpecs 纯函数聚合，零 IO 零 db import），一次动词聚合全量诊断，
// emitDiag info 双承载（payload 同形返回工具面）。零新落库面（entities 裁决 + 机检锚——
// 本文件零 INSERT/UPDATE，读 repo 单源）；投影态现算复用 M3 模块③映射单源（projectAcsStates），
// task-loop 缝缺席/抛错 = 全 AC no-task-data 降级（与 querySpec 同判型，留痕不静默）。
import { emitDiagOrFallback } from "@dsh-forge/lib-diag";
import type { GoalStatus } from "../../db/row-types.js";
import { GOAL_STATES } from "../status-machines.js";
import { projectAcsStates, type AcProjectionState, type AcSettlementsFace } from "../../tools/projection.js";
import type { GoalVerbDeps } from "./goal-advance.js";

/** specStats payload（tools.md §一·五——封闭字段，Typert/UI/agent 共用同一 DTO）。 */
export interface SpecStatsPayload {
  readonly projectKey: string;
  readonly specCount: number;
  readonly goalCount: number;
  readonly acCount: number;
  readonly goalStatusCounts: Readonly<Record<GoalStatus, number>>;
  readonly projectionStateCounts: Readonly<Record<AcProjectionState, number>>;
}

/** summarizeSpecs 输入值对象（行计数 + 分布原始行——零 IO，纯值）。 */
export interface SpecStatsInput {
  readonly projectKey: string;
  readonly specCount: number;
  readonly goalRows: ReadonlyArray<{ readonly goalStatus: GoalStatus }>;
  readonly acCount: number;
  readonly projectionRows: ReadonlyArray<{ readonly state: AcProjectionState }>;
}

const PROJECTION_STATES: readonly AcProjectionState[] = ["met", "unmet", "unmatched", "no-task-data"];

/** 投影态分布纯归并（行清单 → 四态计数——reduce 单层平铺）。 */
export function countProjectionStates(rows: ReadonlyArray<{ state: AcProjectionState }>): Record<AcProjectionState, number> {
  const counts = Object.fromEntries(PROJECTION_STATES.map((s) => [s, 0])) as Record<AcProjectionState, number>;
  for (const row of rows) counts[row.state]! += 1;
  return counts;
}

/** Goal 状态分布纯归并（行清单 → 六态计数——键集由状态机单源枚举）。 */
export function countGoalStatuses(rows: ReadonlyArray<{ goalStatus: GoalStatus }>): Record<GoalStatus, number> {
  const counts = Object.fromEntries(
    (Object.keys(GOAL_STATES.states) as GoalStatus[]).map((s) => [s, 0]),
  ) as Record<GoalStatus, number>;
  for (const row of rows) counts[row.goalStatus]! += 1;
  return counts;
}

/**
 * 统计口径纯函数（code-design §5——输入输出皆值对象，纯 reduce 累加零 IO）：
 * 计数与双分布一次聚合出封闭 payload。
 */
export function summarizeSpecs(input: SpecStatsInput): SpecStatsPayload {
  return {
    projectKey: input.projectKey,
    specCount: input.specCount,
    goalCount: input.goalRows.length,
    acCount: input.acCount,
    goalStatusCounts: countGoalStatuses(input.goalRows),
    projectionStateCounts: countProjectionStates(input.projectionRows),
  };
}

/**
 * 诊断动词：repo 三计数 + goal 状态分布 + 投影态分布现算 → summarizeSpecs 纯函数聚合 →
 * ① emitDiag info（event: 'spec-milestone'，payload 就地携全部口径字段）+ ② 同 payload 返回（双承载）。
 */
export async function specStats(deps: GoalVerbDeps, input: { readonly projectKey: string }): Promise<SpecStatsPayload> {
  const specs = deps.repos.specs.list(input.projectKey);
  const goalRows = specs.flatMap((s) => deps.repos.specs.listGoalsBySpec(s.id));
  const acRows = goalRows.flatMap((g) => deps.repos.specs.listAcsByGoal(g.id));

  // 投影态现算（一次 matchAcSettlements 全 spec 共享；缝缺席/抛错 = 全 AC 无据降级）
  let aggregate: Awaited<ReturnType<AcSettlementsFace["matchAcSettlements"]>> | undefined;
  try {
    const face = deps.acSettlementsOf?.();
    aggregate = face === undefined ? undefined : await face.matchAcSettlements(input.projectKey, acRows.map((a) => a.criterion));
  } catch {
    aggregate = undefined;
  }
  const projection = projectAcsStates(acRows.map((a) => a.criterion), aggregate);
  const payload = summarizeSpecs({
    projectKey: input.projectKey,
    specCount: specs.length,
    goalRows,
    acCount: acRows.length,
    projectionRows: projection,
  });
  emitDiagOrFallback(deps.onDiag, {
    event: "spec-milestone",
    level: "info",
    message:
      `spec 里程诊断：project=${payload.projectKey} specs=${payload.specCount} goals=${payload.goalCount} acs=${payload.acCount} `
      + `goalStatus={${Object.entries(payload.goalStatusCounts).map(([k, v]) => `${k}:${v}`).join(", ")}} `
      + `projection={${Object.entries(payload.projectionStateCounts).map(([k, v]) => `${k}:${v}`).join(", ")}}`,
    projectId: input.projectKey,
  });
  return payload;
}
