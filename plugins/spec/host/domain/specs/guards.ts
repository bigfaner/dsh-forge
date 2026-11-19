// 状态机守卫缝单源（plugin-spec 1.3，code-design §2）——
// 合法边表与迁移判定已收敛 specMachine 单源（status-machine.md §4 条目 3/5/7）：
// 边表事实 = domain/status-machines.ts SPEC_STATES（边表即唯一真源），本文件只保留
// M4 专家门挂缝类型。completed 边界裁定（用户裁决随任务简报落）：不可 reverse（零出边）、
// 终态 updateSpec 全写面拒（冻结快照）、查询/投影读面不受影响。
import type { SpecStatus } from "../../db/row-types.js";

/** M4 专家门挂缝：追加 guard 实现（如 human-only 边前置专家核销检查），零改 transitionSpec 主体。 */
export type SpecTransitionGuard = (input: {
  fromStatus: SpecStatus;
  toStatus: SpecStatus;
  actor: "plugin-tool" | "ui";
  note?: string;
}) => void;
