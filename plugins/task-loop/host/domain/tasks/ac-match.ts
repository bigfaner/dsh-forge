// ac-match——AC 结算聚合投影纯函数（matchAcSettlements 聚合动词的匹配单源）。
// 匹配语义（提案 §二钉死）：判据文本 trim + 全半角折叠两步确定性归一化后精确相等——
// 零子串/前缀/模糊匹配，归一化差异判 unmet；多任务同判据 = OR 聚合（任一任务最新
// 结算行 met 即 met，fix 补结算 met=false 不覆写其它任务已达成的 met）；未达成判据
// 并入 unmatched 出参（宁可漏报 unmet 不可误报 met）。零跨域 id——判据文本是唯一对齐键。
import type { TaskAcResult, TaskRef } from "./types.js";

/**
 * 判据归一化（两步确定性纯函数）：① trim 去首尾空白；② 全半角折叠——
 * FF01–FF5E 全角 ASCII → 半角、U+3000 表意空格 → 半角空格，折叠后再次去首尾空白。
 * 不做内部空白合并/删除——精确相等语义（无子串模糊）。
 */
export function normalizeCriterion(text: string): string {
  let out = "";
  for (const ch of text.trim()) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code >= 0xff01 && code <= 0xff5e) out += String.fromCodePoint(code - 0xfee0);
    else if (code === 0x3000) out += " ";
    else out += ch;
  }
  return out.trim();
}

/** 结算侧输入（每任务一条——该任务最新结算行的 AC 核销快照）。 */
export interface AcSettledTask {
  readonly taskRef: TaskRef;
  readonly acResults: readonly TaskAcResult[];
}

/** 聚合 DTO 单项：判据原文回带 + 归一化命中聚合（evidence 取首个达成行的证据）。 */
export interface AcSettlementMatch {
  readonly criterion: string;
  readonly met: boolean;
  readonly evidence?: string;
  readonly taskRefs: readonly TaskRef[];
}

/** 聚合 DTO：matches 与 criteria 等长同序；unmatched = 未达成判据原文清单。 */
export interface AcSettlementsAggregate {
  readonly matches: readonly AcSettlementMatch[];
  readonly unmatched: readonly string[];
}

/** 聚合纯函数（判据清单 + 结算快照进、聚合 DTO 出——OR 语义零状态）。 */
export function aggregateAcSettlements(
  criteria: readonly string[],
  settled: readonly AcSettledTask[],
): AcSettlementsAggregate {
  const matches = criteria.map((criterion) => {
    const key = normalizeCriterion(criterion);
    const taskRefs: TaskRef[] = [];
    let met = false;
    let evidence: string | undefined;
    for (const task of settled) {
      const hit = task.acResults.find((r) => normalizeCriterion(r.criterion) === key);
      if (hit === undefined) continue;
      taskRefs.push(task.taskRef);
      if (!met && hit.met === true) {
        met = true;
        if (hit.evidence !== undefined) evidence = hit.evidence;
      }
    }
    return { criterion, met, ...(evidence !== undefined ? { evidence } : {}), taskRefs };
  });
  return { matches, unmatched: matches.filter((m) => m.met !== true).map((m) => m.criterion) };
}
