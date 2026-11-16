// AC 投影消费缝 + 投影态直映射（plugin-spec 1.4，code-design §3——薄到无逻辑可错）：
// 归一化匹配与 OR 聚合全在 task-loop 侧匹配纯函数，spec 侧只做 DTO → 投影态直映射；
// 缝缺席/调用抛错 = 全 AC `no-task-data` 降级（分层留痕由装配面 emitDiag 承担）。
// 消费点现查永不缓存（AGENTS 1.6——acSettlementsOf 每次 querySpec 调用期求值）。

/** task-loop matchAcSettlements 聚合行窄面（task-loop ac-match DTO 同形——契约单源） */
export interface AcMatchRow {
  readonly criterion: string;
  readonly met: boolean;
  readonly evidence?: string;
  readonly taskRefs?: readonly string[];
  /** 判据 unmatched（漂移/未执行——M4 Goal 自动复核触发信号） */
  readonly unmatched?: boolean;
}

/** task-loop forgeTasks.matchAcSettlements 聚合动词窄面（聚合 DTO——matches 与 criteria 等长同序） */
export interface AcSettlementsAggregate {
  readonly matches: readonly AcMatchRow[];
  readonly unmatched: readonly string[];
}

/** task-loop forgeTasks.matchAcSettlements 聚合动词窄面 */
export interface AcSettlementsFace {
  matchAcSettlements(projectKey: string, criteria: readonly string[]): Promise<AcSettlementsAggregate>;
}

/** AC 投影态（entities §3——不落库，查询期惰性现算直出） */
export type AcProjectionState = "met" | "unmet" | "unmatched" | "no-task-data";

/** 单 AC 投影行（判据逐字 + 投影态 + 在场证据/任务引用 + unmatched 聚合标记） */
export interface AcProjectionRow {
  readonly criterion: string;
  readonly state: AcProjectionState;
  readonly evidence?: string;
  readonly taskRefs?: readonly string[];
  /** 未达成判据并入 task-loop 聚合 unmatched 清单（漂移/未执行——M4 复核触发信号） */
  readonly unmatched?: true;
}

/**
 * 投影装配（查询期惰性现算，无缓存零第二写点）：
 * - 聚合 DTO 缺席（缝未绑/调用抛错由调用方归一为 undefined）→ 全 AC `no-task-data`；
 * - 在场 → 逐判据映射：met→met / 其余→unmet（提案语义「其余 = unmet 并入 unmatched
 *   出参」——unmatched 聚合清单以行级 unmatched 标记直出，M4 复核触发信号）。
 */
export function projectAcsStates(
  criteria: readonly string[],
  aggregate: AcSettlementsAggregate | undefined,
): AcProjectionRow[] {
  if (aggregate === undefined) {
    return criteria.map((criterion) => ({ criterion, state: "no-task-data" as const }));
  }
  const unmatched = new Set(aggregate.unmatched);
  const byCriterion = new Map(aggregate.matches.map((row) => [row.criterion, row]));
  return criteria.map((criterion) => {
    const row = byCriterion.get(criterion);
    if (row === undefined) return { criterion, state: "no-task-data" as const };
    const state: AcProjectionState = row.met ? "met" : "unmet";
    return {
      criterion,
      state,
      ...(row.evidence !== undefined ? { evidence: row.evidence } : {}),
      ...(row.taskRefs !== undefined ? { taskRefs: row.taskRefs } : {}),
      ...(!row.met && unmatched.has(row.criterion) ? { unmatched: true } : {}),
    };
  });
}
