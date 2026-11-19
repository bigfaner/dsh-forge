// createSpec / updateSpec 挂链守卫单源（plugin-spec-roadmaps 1.13，code-design §2）——
// 纯查询 + 断言小函数（零 db import，查询面经 deps 注入）：milestone 缺席拒 /
// 跨 project 拒（milestone → roadmap.project_key 对照 spec 归属键，entities.md §3 单点）；
// ac_json 存在性不校验（spec 承载 = milestone_id 归属 + 内容对照，提案裁决）。
import type { MilestoneRow, RoadmapRow } from "../../db/row-types.js";
import { SpecError } from "./errors.js";

/** 挂链守卫查询面（deps 桩替换位——单测零 db 直喂）。 */
export interface MilestoneLinkQuery {
  milestones: { findById(id: string): MilestoneRow | undefined };
  roadmaps: { findById(id: string): RoadmapRow | undefined };
}

/**
 * milestone 可挂链断言（createSpec 与 updateSpec 改挂链两消费点复用——单一守卫单源）。
 * 通过 = 返回 milestone 行；拒绝 = ERR_SPEC_MILESTONE_UNKNOWN / ERR_SPEC_MILESTONE_PROJECT_MISMATCH。
 */
export function assertMilestoneLinkable(
  query: MilestoneLinkQuery,
  projectKey: string,
  milestoneId: string,
): MilestoneRow {
  const milestone = query.milestones.findById(milestoneId);
  if (milestone === undefined) {
    throw new SpecError("ERR_SPEC_MILESTONE_UNKNOWN", `milestone 缺席：${milestoneId}`, { milestoneId });
  }
  const roadmap = query.roadmaps.findById(milestone.roadmapId);
  if (roadmap === undefined || roadmap.projectKey !== projectKey) {
    throw new SpecError(
      "ERR_SPEC_MILESTONE_PROJECT_MISMATCH",
      `milestone 不属于本项目：${milestoneId}`,
      { milestoneId, projectKey },
    );
  }
  return milestone;
}
