// completed-derivation（plugin-spec-roadmaps 1.7，code-design §1 模块ⓐ）——聚合派生
// 纯函数（零 db import，输入输出皆值对象）：
//   · deriveMilestoneAchieved——单列判定（挂链 specs 全 completed → true；零挂链/任何
//     非 completed → false）。
//   · deriveRoadmapAchievement——全 milestone 达成 → completed；零承载判定单源扫
//     milestone 侧 addresses（roadmap 侧无 addresses）——柔性 warn 不阻塞。
// 循环形态裁定：单层平铺循环 + 短路布尔累积，禁递归（v2 降维红利——未来层级生长 =
// 新增一层 derive 纯函数，现层零改）。
import type { AcEntry, SpecStatus } from "../../db/row-types.js";

/** 零承载 warn（柔和守卫——roadmap AC 条目 id 未被任何 milestone 条目 address 指向）。 */
export interface ZeroCarrierWarn {
  readonly acId: string;
  readonly criterion: string;
}

/** 单 milestone 聚合值对象（读面装配裁剪列——specsByMilestone 圈行 + ac_json addresses）。 */
export interface MilestoneAggregate {
  /** 挂链 specs 数（0 = 未挂链缺席态） */
  readonly specCount: number;
  /** 挂链 specs 全 completed（零挂链恒 false） */
  readonly allCompleted: boolean;
  /** 本 milestone ac_json 条目 addresses（承载指向单源——零承载判定扫描面） */
  readonly addresses: readonly string[];
}

/** Milestone 达成单列判定：挂链 specs 全 completed → true；零挂链/任何非 completed → false。 */
export function deriveMilestoneAchieved(specs: ReadonlyArray<{ specStatus: SpecStatus }>): boolean {
  return specs.length > 0 && specs.every((s) => s.specStatus === "completed");
}

/** Roadmap 聚合派生：全 milestone 达成 → completed；零承载 AC → warns（柔和，不阻塞）。 */
export function deriveRoadmapAchievement(
  milestones: readonly MilestoneAggregate[],
  roadmapAcEntries: readonly AcEntry[],
): { completed: boolean; warns: ZeroCarrierWarn[] } {
  const completed = milestones.length > 0 && milestones.every((m) => m.allCompleted);
  const addressed = new Set<string>();
  for (const m of milestones) {
    for (const a of m.addresses) addressed.add(a);
  }
  const warns: ZeroCarrierWarn[] = [];
  for (const ac of roadmapAcEntries) {
    if (!addressed.has(ac.id)) {
      warns.push({ acId: ac.id, criterion: ac.criterion });
    }
  }
  return { completed, warns };
}
