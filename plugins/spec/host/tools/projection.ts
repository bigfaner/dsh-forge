// AC 投影消费缝 + 投影态直映射（plugin-spec 1.4，code-design §3——薄到无逻辑可错）：
// 归一化匹配与 OR 聚合全在 task-loop 侧匹配纯函数，spec 侧只做 DTO → 投影态直映射；
// 缝缺席/调用抛错 = 全 AC `no-task-data` 降级（分层留痕由装配面 emitDiag 承担）。
// 消费点现查永不缓存（AGENTS 1.6——acSettlementsOf 每次 querySpec 调用期求值）。

/** task-loop matchAcSettlements 聚合行窄面（DTO 细节——提案不确定面 4 已定稿形状） */
export interface AcMatchRow {
  readonly criterion: string;
  readonly met: boolean;
  readonly evidence?: string;
  readonly taskRefs?: readonly string[];
  /** 判据 unmatched（漂移/未执行——M4 Goal 自动复核触发信号） */
  readonly unmatched?: boolean;
}

/** task-loop forgeTasks.matchAcSettlements 聚合动词窄面 */
export interface AcSettlementsFace {
  matchAcSettlements(projectKey: string, criteria: readonly string[]): Promise<readonly AcMatchRow[]>;
}

/** AC 投影态（entities §3——不落库，查询期惰性现算直出） */
export type AcProjectionState = "met" | "unmet" | "unmatched" | "no-task-data";

/** 单 AC 投影行（判据逐字 + 投影态 + 在场证据/任务引用） */
export interface AcProjectionRow {
  readonly criterion: string;
  readonly state: AcProjectionState;
  readonly evidence?: string;
  readonly taskRefs?: readonly string[];
}

/**
 * 投影装配（查询期惰性现算，无缓存零第二写点）：
 * - settlements 缺席（缝未绑/调用抛错由调用方归一为 undefined）→ 全 AC `no-task-data`；
 * - 在场 → 逐判据映射：met→met / unmatched→unmatched / 其余→unmet。
 */
export function projectAcsStates(
  criteria: readonly string[],
  settlements: readonly AcMatchRow[] | undefined,
): AcProjectionRow[] {
  if (settlements === undefined) {
    return criteria.map((criterion) => ({ criterion, state: "no-task-data" as const }));
  }
  const byCriterion = new Map(settlements.map((row) => [row.criterion, row]));
  return criteria.map((criterion) => {
    const row = byCriterion.get(criterion);
    if (row === undefined) return { criterion, state: "no-task-data" as const };
    const state: AcProjectionState = row.met ? "met" : row.unmatched ? "unmatched" : "unmet";
    return {
      criterion,
      state,
      ...(row.evidence !== undefined ? { evidence: row.evidence } : {}),
      ...(row.taskRefs !== undefined ? { taskRefs: row.taskRefs } : {}),
    };
  });
}
