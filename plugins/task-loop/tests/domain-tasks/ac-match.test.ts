// matchAcSettlements 聚合动词测试（plugin-spec/1.6 契约变更）：匹配纯函数四分支
// （归一化命中 / 不命中 / 空集 / 多 AC 混合）+ OR 聚合（fix 补结算不覆写已达成 met）
// + 服务方法接线（每任务最新结算行单源）。
import { beforeEach, describe, expect, it } from "vitest";
import { aggregateAcSettlements, normalizeCriterion, type AcSettledTask } from "../../host/domain/tasks/ac-match.js";
import { createTasksService } from "../../host/domain/tasks/service.js";
import { createTasksHarness, seedTask, type TasksHarness } from "./harness.js";

const ref = (slug: string, localId: string) => ({ slug, localId });

const settled = (...items: AcSettledTask[]): AcSettledTask[] => items;

describe("normalizeCriterion（trim + 全半角折叠两步归一化）", () => {
  it("全角 ASCII / 表意空格折叠为半角 + 去首尾空白；确定性无子串模糊", () => {
    expect(normalizeCriterion("  ａｐｉ　接口  ")).toBe("api 接口");
    expect(normalizeCriterion("ＡＣ－１：ＵＩ")).toBe("AC-1:UI");
    expect(normalizeCriterion("判据")).toBe(normalizeCriterion(" 判据 "));
    // 折叠只做宽度归一，不删除/合并内部空白——精确相等语义
    expect(normalizeCriterion("a  b")).not.toBe(normalizeCriterion("ab"));
  });
});

describe("aggregateAcSettlements（匹配纯函数四分支 + OR 聚合）", () => {
  it("分支一：归一化命中——全角判据命中半角结算行，met/evidence 回带", () => {
    const r = aggregateAcSettlements(
      ["ａｐｉ 接口"],
      settled({ taskRef: ref("alpha", "1"), acResults: [{ criterion: "api 接口", met: true, evidence: "tests/api.test.ts" }] }),
    );
    expect(r.matches).toEqual([
      { criterion: "ａｐｉ 接口", met: true, evidence: "tests/api.test.ts", taskRefs: [ref("alpha", "1")] },
    ]);
    expect(r.unmatched).toEqual([]);
  });

  it("分支二：不命中——转述漂移（非逐字）判 unmet 并入 unmatched；子串不算命中", () => {
    const r = aggregateAcSettlements(
      ["判据 A"],
      settled({ taskRef: ref("alpha", "1"), acResults: [{ criterion: "判据 A（改写）", met: true }] }),
    );
    expect(r.matches[0]).toMatchObject({ criterion: "判据 A", met: false, taskRefs: [] });
    expect(r.unmatched).toEqual(["判据 A"]);
    // 无子串模糊：结算行文本是查询判据的超集，仍不命中
    const r2 = aggregateAcSettlements(
      ["api"],
      settled({ taskRef: ref("alpha", "1"), acResults: [{ criterion: "api 接口", met: true }] }),
    );
    expect(r2.matches[0]).toMatchObject({ met: false });
    expect(r2.unmatched).toEqual(["api"]);
  });

  it("分支三：空集——零结算数据全判 unmet，unmatched = 全部判据", () => {
    const r = aggregateAcSettlements(["判据一", "判据二"], settled());
    expect(r.matches).toEqual([
      { criterion: "判据一", met: false, taskRefs: [] },
      { criterion: "判据二", met: false, taskRefs: [] },
    ]);
    expect(r.unmatched).toEqual(["判据一", "判据二"]);
  });

  it("分支四：多 AC 混合——命中 met / 命中 unmet / 漂移三态并存，matches 与 criteria 等长同序", () => {
    const r = aggregateAcSettlements(
      ["判据一", "判据二", "判据三"],
      settled({
        taskRef: ref("alpha", "1"),
        acResults: [
          { criterion: "判据一", met: true, evidence: "a.test.ts" },
          { criterion: "判据二", met: false },
        ],
      }),
    );
    expect(r.matches.map((m) => m.criterion)).toEqual(["判据一", "判据二", "判据三"]);
    expect(r.matches[0]).toMatchObject({ met: true, evidence: "a.test.ts", taskRefs: [ref("alpha", "1")] });
    expect(r.matches[1]).toMatchObject({ met: false, taskRefs: [ref("alpha", "1")] });
    expect(r.matches[2]).toMatchObject({ met: false, taskRefs: [] });
    expect(r.unmatched).toEqual(["判据二", "判据三"]);
  });

  it("OR 聚合：多 task 同判据任一 met 即 met——fix 补结算 met=false 不覆写其它 task 已达成 met", () => {
    const r = aggregateAcSettlements(
      ["判据一"],
      settled(
        { taskRef: ref("alpha", "1"), acResults: [{ criterion: "判据一", met: true, evidence: "fix 前已达" }] },
        { taskRef: ref("fix-1", "1"), acResults: [{ criterion: "判据一", met: false }] },
      ),
    );
    expect(r.matches[0]).toMatchObject({
      criterion: "判据一",
      met: true,
      evidence: "fix 前已达",
    });
    expect(r.matches[0]!.taskRefs).toEqual([ref("alpha", "1"), ref("fix-1", "1")]);
    expect(r.unmatched).toEqual([]);
  });

  it("criteria 空集 = 空 DTO（零查询语义）", () => {
    expect(aggregateAcSettlements([], settled({ taskRef: ref("a", "1"), acResults: [{ criterion: "x", met: true }] }))).toEqual({
      matches: [],
      unmatched: [],
    });
  });
});

describe("service.matchAcSettlements（服务接线——每任务最新结算行单源）", () => {
  let h: TasksHarness;
  beforeEach(() => {
    h = createTasksHarness();
  });

  it("按 projectKey 聚合：每 task 取最新一行判 met；跨 project 隔离", async () => {
    const t1 = seedTask(h, "alpha", "1", { status: "completed" });
    seedTask(h, "beta", "1", { status: "completed" });
    const svc = createTasksService({ db: h.db, events: h.events, resolveWsPath: () => "." });
    // 造结算：直接写 task_settlements（harness 无结算种子助手——repo append 最短径）
    const { createSettlementRepo } = await import("../../host/db/repositories/settlement-repo.js");
    const repo = createSettlementRepo(h.db);
    repo.appendSettlement({
      taskId: t1,
      result: "success",
      acResults: [{ criterion: "判据一", met: true }],
      evidence: { summary: "s" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const r = await svc.matchAcSettlements(h.projectKey, ["判据一", "漂移判据"]);
    expect(r.matches[0]).toMatchObject({ criterion: "判据一", met: true, taskRefs: [ref("alpha", "1")] });
    expect(r.unmatched).toEqual(["漂移判据"]);
    // 跨 project 零数据
    const other = await svc.matchAcSettlements("other-project", ["判据一"]);
    expect(other.matches[0]).toMatchObject({ met: false, taskRefs: [] });
  });
});
