// spec-stats 单测（plugin-spec-roadmaps 1.11，code-design §5 测试锚）——
//   · summarizeSpecs 纯函数计数/分布分支（零替身，直喂值对象）；
//   · specStats 诊断动词 diag 桩 payload 逐字段断言（onDiag 注入桩，替身位置 =
//     SpecVerbDeps.onDiag；投影缝缺席 = 全 AC no-task-data 降级）。
import { describe, expect, it } from "vitest";
import { specStats, summarizeSpecs } from "../../host/domain/specs/spec-stats.js";
import type { GoalStatus } from "../../host/db/row-types.js";
import type { SpecDomainDb } from "../../host/db/connection.js";

describe("summarizeSpecs（纯函数——计数/分布分支）", () => {
  it("空输入 = 全零分布（键集封闭：六 goal 态 + 四投影态）", () => {
    const out = summarizeSpecs({ projectKey: "p", specCount: 0, goalRows: [], acCount: 0, projectionRows: [] });
    expect(out).toEqual({
      projectKey: "p",
      specCount: 0,
      goalCount: 0,
      acCount: 0,
      goalStatusCounts: {
        pending: 0,
        in_progress: 0,
        auto_reviewing: 0,
        awaiting_confirmation: 0,
        completed: 0,
      },
      projectionStateCounts: { met: 0, unmet: 0, unmatched: 0, "no-task-data": 0 },
    });
  });

  it("混合输入逐态累加（reduce 单层平铺）", () => {
    const goalRows: { goalStatus: GoalStatus }[] = [
      { goalStatus: "pending" },
      { goalStatus: "in_progress" },
      { goalStatus: "in_progress" },
      { goalStatus: "completed" },
    ];
    const out = summarizeSpecs({
      projectKey: "demo",
      specCount: 2,
      goalRows,
      acCount: 4,
      projectionRows: [{ state: "met" }, { state: "unmet" }, { state: "met" }, { state: "no-task-data" }],
    });
    expect(out.specCount).toBe(2);
    expect(out.goalCount).toBe(4);
    expect(out.acCount).toBe(4);
    expect(out.goalStatusCounts).toEqual({
      pending: 1,
      in_progress: 2,
      auto_reviewing: 0,
      awaiting_confirmation: 0,
      completed: 1,
    });
    expect(out.projectionStateCounts).toEqual({ met: 2, unmet: 1, unmatched: 0, "no-task-data": 1 });
  });
});

describe("specStats（diag 桩 payload 逐字段断言）", () => {
  const depsStub = {
    db: {} as SpecDomainDb["db"],
    repos: {
      specs: {
        list: () => [{ id: "s1" }, { id: "s2" }],
        listGoalsBySpec: (specId: string) =>
          specId === "s1"
            ? [{ goalStatus: "in_progress" as GoalStatus }, { goalStatus: "pending" as GoalStatus }]
            : [{ goalStatus: "completed" as GoalStatus }],
        listAcsByGoal: () => [{ criterion: "判据" }],
      },
    },
  } as unknown as ConstructorParameters<typeof specStats>[0];

  it("onDiag 桩逐字段：event/level/projectId/message 全口径字段", async () => {
    const diag: unknown[] = [];
    const out = await specStats({ ...depsStub, onDiag: (p) => diag.push(p) }, { projectKey: "demo" });
    expect(diag).toHaveLength(1);
    const line = diag[0] as Record<string, unknown>;
    expect(line["event"]).toBe("spec-milestone");
    expect(line["level"]).toBe("info");
    expect(line["projectId"]).toBe("demo");
    const message = line["message"] as string;
    expect(message).toContain("project=demo");
    expect(message).toContain("specs=2");
    expect(message).toContain("goals=3");
    expect(message).toContain("acs=3");
    expect(message).toContain("goalStatus={pending:1, in_progress:1, auto_reviewing:0, awaiting_confirmation:0, completed:1}");
    expect(message).toContain("projection={met:0, unmet:0, unmatched:0, no-task-data:3}");
    // 双承载：返回值与 diag payload 同口径
    expect(out.projectKey).toBe("demo");
    expect(out.specCount).toBe(2);
    expect(out.goalCount).toBe(3);
    expect(out.acCount).toBe(3);
  });

  it("投影缝缺席 = 全 AC no-task-data 降级（留痕不静默）", async () => {
    const out = await specStats(depsStub, { projectKey: "demo" });
    expect(out.projectionStateCounts).toEqual({ met: 0, unmet: 0, unmatched: 0, "no-task-data": 3 });
  });
});
