// completed-derivation 单测（plugin-spec-roadmaps 1.7，code-design §1 模块ⓐ）——聚合派生
// 纯函数五分支：部分 / 全 completed / 混合 / 未挂链 / 零承载 warn。
import { describe, expect, it } from "vitest";
import {
  deriveMilestoneAchieved,
  deriveRoadmapAchievement,
  type MilestoneAggregate,
} from "../../host/domain/specs/completed-derivation.js";

const agg = (specCount: number, allCompleted: boolean, addresses: string[] = []): MilestoneAggregate => ({
  specCount,
  allCompleted,
  addresses,
});

describe("deriveMilestoneAchieved（单列判定）", () => {
  it("挂链 specs 全 completed → true", () => {
    expect(deriveMilestoneAchieved([{ specStatus: "completed" }, { specStatus: "completed" }])).toBe(true);
  });

  it("含非 completed / 未挂链零 specs → false", () => {
    expect(deriveMilestoneAchieved([{ specStatus: "completed" }, { specStatus: "in_progress" }])).toBe(false);
    expect(deriveMilestoneAchieved([])).toBe(false);
  });
});

describe("deriveRoadmapAchievement（五分支）", () => {
  const roadmapAcs = [
    { id: "r1", criterion: "AC 一" },
    { id: "r2", criterion: "AC 二" },
  ];

  it("部分达成（一 milestone 全完成、另一未）→ completed false 零 warn", () => {
    const r = deriveRoadmapAchievement([agg(2, true, ["r1"]), agg(1, false, ["r2"])], roadmapAcs);
    expect(r.completed).toBe(false);
    expect(r.warns).toEqual([]);
  });

  it("全 completed → completed true 零 warn", () => {
    const r = deriveRoadmapAchievement([agg(1, true, ["r1"]), agg(2, true, ["r2"])], roadmapAcs);
    expect(r.completed).toBe(true);
    expect(r.warns).toEqual([]);
  });

  it("混合（milestone 内 completed + 非 completed）→ false", () => {
    const r = deriveRoadmapAchievement([agg(2, false, ["r1"])], roadmapAcs);
    expect(r.completed).toBe(false);
  });

  it("未挂链（milestone 零 specs）→ false", () => {
    const r = deriveRoadmapAchievement([agg(0, false)], roadmapAcs);
    expect(r.completed).toBe(false);
  });

  it("零承载：roadmap AC id 未被任何 milestone address 指向 → warn 柔和（不阻塞 completed 判定）", () => {
    const r = deriveRoadmapAchievement([agg(1, true, ["r1"])], roadmapAcs);
    expect(r.completed).toBe(true);
    expect(r.warns).toEqual([{ acId: "r2", criterion: "AC 二" }]);
  });

  it("零 milestones → completed false", () => {
    expect(deriveRoadmapAchievement([], roadmapAcs).completed).toBe(false);
  });
});
