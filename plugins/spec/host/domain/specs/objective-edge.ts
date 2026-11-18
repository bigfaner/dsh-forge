// objective-edge（plugin-spec-roadmaps 1.6，code-design §3c 模块⒞-3）——Objective 机械
// 边沿判定纯函数（与 decideAdvance 同族：零 db，值对象输入，平铺 if-return）。
// 五族：milestone 开工（前序全 completed）/ milestone 待验收（挂链 specs 全 completed）/
// roadmap 开工（首个 milestone 创建）/ roadmap 待验收（全 milestones completed）/
// 竞窗回拉（spec awaiting_acceptance ∧ Goals 非全 completed → 机械回拉）。
// 判定与写点分离：写点动词（objective-lifecycle / spec-lifecycle）事务尾消费本判定，
// 'advance' → 目标态由族语义唯一确定（start→in_progress / accept→awaiting_acceptance /
// self-heal→in_progress），机械永不触碰 completed 终态（human-only 域）。
import type { ObjectiveStatus, SpecStatus } from "../../db/row-types.js";

/** 边沿触发族（值对象输入——五族封闭，判定表契约测试锁定）。 */
export type ObjectiveEdgeTrigger =
  | { family: "milestone-start"; predecessorsAllCompleted: boolean }
  | { family: "milestone-accept"; subordinatesAllCompleted: boolean }
  | { family: "roadmap-start" }
  | { family: "roadmap-accept"; milestonesAllCompleted: boolean }
  | { family: "spec-self-heal"; goalsAllCompleted: boolean };

/** 边沿决策值域（advance = 施加边沿两写；hold = 无变化）。 */
export type ObjectiveEdgeDecision = "advance" | "hold";

/**
 * 判定纯函数（五族平铺 if-return——判定一眼可枚举）：
 *   milestone-start     pending ∧ 前序全 completed → advance（开工 in_progress）
 *   milestone-accept    in_progress ∧ 下级全 completed → advance（待验收）
 *   roadmap-start       pending（首个 milestone 创建信号）→ advance（开工 in_progress）
 *   roadmap-accept      in_progress ∧ 全 milestones completed → advance（待验收）
 *   spec-self-heal      awaiting_acceptance ∧ Goals 非全 completed → advance（竞窗回拉）
 *   其余组合             hold
 */
export function decideObjectiveEdge(
  current: ObjectiveStatus | SpecStatus,
  trigger: ObjectiveEdgeTrigger,
): ObjectiveEdgeDecision {
  if (trigger.family === "milestone-start") {
    if (current === "pending" && trigger.predecessorsAllCompleted) return "advance";
    return "hold";
  }
  if (trigger.family === "milestone-accept") {
    if (current === "in_progress" && trigger.subordinatesAllCompleted) return "advance";
    return "hold";
  }
  if (trigger.family === "roadmap-start") {
    if (current === "pending") return "advance";
    return "hold";
  }
  if (trigger.family === "roadmap-accept") {
    if (current === "in_progress" && trigger.milestonesAllCompleted) return "advance";
    return "hold";
  }
  // spec-self-heal
  if (current === "awaiting_acceptance" && !trigger.goalsAllCompleted) return "advance";
  return "hold";
}
