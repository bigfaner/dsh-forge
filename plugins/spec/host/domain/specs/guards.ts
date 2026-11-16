// 状态机边表与守卫缝单源（plugin-spec 1.3，code-design §2）——
// 合法边表（单向链 + 驳回支）= 服务层单点守卫，DDL CHECK 只封枚举值域不表达迁移拓扑。
// archived 边界裁定（用户裁决随任务简报落）：不可 reverse（零出边）、归档态 updateSpec
// 全写面拒（冻结快照）、查询/投影读面不受影响。
import type { SpecStatus } from "../../db/row-types.js";
import { SpecError } from "./errors.js";

/**
 * 合法流转边表：draft → under-review → accepted → archived 单向链
 * + under-review → draft 驳回支。其余一切边（跳级 / 逆向 / archived 出边）非法。
 */
export const SPEC_TRANSITION_EDGES: ReadonlySet<string> = new Set([
  "draft->under-review",
  "under-review->accepted",
  "under-review->draft",
  "accepted->archived",
]);

/** accepted 边 human-only：仅用户动作通道（对话 tool 径 plugin-tool / UI 径 ui）可写入。 */
export const HUMAN_ONLY_STATUSES: ReadonlySet<SpecStatus> = new Set(["accepted"]);

/** M4 专家门挂缝：追加 guard 实现（如 accepted 边前置专家核销检查），零改 transitionSpec 主体。 */
export type SpecTransitionGuard = (input: {
  fromStatus: SpecStatus;
  toStatus: SpecStatus;
  actor: "plugin-tool" | "ui";
  note?: string;
}) => void;

/** 迁移合法性判定（from→to 合法边 + human-only），非法即 SpecError。 */
export function assertSpecTransitionAllowed(
  fromStatus: SpecStatus,
  toStatus: SpecStatus,
): void {
  if (!SPEC_TRANSITION_EDGES.has(`${fromStatus}->${toStatus}`)) {
    throw new SpecError(
      "ERR_SPEC_ILLEGAL_TRANSITION",
      `非法状态流转：${fromStatus} → ${toStatus}`,
      { fromStatus, toStatus },
    );
  }
}
