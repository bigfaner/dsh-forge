// 改进7（dispatch-loop-hardening · e2e 取证债）定向单测：
// ① settleWorkerRun 欠账任务生成——success 结算携带 evidenceDebt（实现态部分结算）→
//    自动生成同容器 test-run 欠账任务（dependsOn 实现卡 localId）；
// ② fail-soft——addTask 落库故障不回滚已定结算（result 零 evidenceDebt）；
// ③ blocked / 无欠账 → 零 addTask；
// ④ claimForDispatch e2eBaselineRedCases 透传 claimTask（简报红灯清单载体）。
// v1 列面适配：evidenceDebt 经 settlements 读缝（LastSettlementView evidence.gates）。
import { describe, expect, it, vi } from "vitest";
import type { TaskSnapshot } from "../../host/domain/tasks/types.js";
import type { TasksService } from "../../host/domain/tasks/service.js";
import { claimForDispatch } from "../../host/dispatch-core/core.js";
import { settleWorkerRun } from "../../host/dispatch-core/settle.js";
import type { LastSettlementView, SettleSettlementsFace } from "../../host/dispatch-core/settle.js";
import type { DispatchCoreArgs, DispatchCoreDeps, DispatchCoreExec } from "../../host/dispatch-core/core.js";
import type { SpawnWorkerHandle } from "../../host/dispatch-core/spawn.js";

function snapshot(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    taskId: "t-1",
    slug: "feat-x",
    localId: "2.5",
    title: "Implement the thing",
    taskType: "coding-feature",
    taskStatus: "in_progress",
    breaking: false,
    complexity: "high",
    createdAt: "2026-10-11T00:00:00.000Z",
    updatedAt: "2026-10-11T00:00:00.000Z",
    ...over,
  };
}

function handle(): SpawnWorkerHandle {
  return { workerSessionId: "worker-1", result: Promise.resolve({ stopReason: "completed", output: "" }), dispose: async () => {} };
}

interface Harness {
  tasks: TasksService
  settlements: SettleSettlementsFace
  addTaskInputs: unknown[]
  setSettlement: (v: LastSettlementView | undefined) => void
  setAddTaskError: (e: Error | undefined) => void;
}

function harness(initial: LastSettlementView | undefined, queryStatus: TaskSnapshot["taskStatus"] = "completed"): Harness {
  const addTaskInputs: unknown[] = [];
  let settlement = initial;
  let addTaskError: Error | undefined;
  const settlements: SettleSettlementsFace = { lastByTask: async () => settlement };
  const tasks = {
    queryTask: async () => ({
      task: snapshot({ taskStatus: queryStatus }),
      container: { slug: "feat-x" },
      records: [],
    }),
    taskStats: async () => ({
      total: 1,
      byStatus: { pending: 0, in_progress: 0, blocked: 0, completed: 1, skipped: 0, rejected: 0, suspended: 0, interrupted: 0 },
      unmetPending: 0,
      gatedPending: 0,
    }),
    listTasks: async () => [],
    addTask: async (input: unknown) => {
      if (addTaskError !== undefined) throw addTaskError;
      addTaskInputs.push(input);
      return { taskId: "debt-uuid", slug: (input as { slug: string }).slug, localId: "2.6", reused: false };
    },
  } as unknown as TasksService;
  return {
    tasks,
    settlements,
    addTaskInputs,
    setSettlement: (v) => {
      settlement = v;
    },
    setAddTaskError: (e) => {
      addTaskError = e;
    },
  };
}

function ctxOf(over: Partial<TaskSnapshot> = {}): { projectId: string; task: TaskSnapshot; digest: string; handle: SpawnWorkerHandle; spawnStartedAt: number } {
  return { projectId: "p-1", task: snapshot(over), digest: "digestabc123", handle: handle(), spawnStartedAt: Date.now() };
}

const DEBT = { suite: "e2e", specs: ["e2e/specs/race-window.spec.ts"], note: "竞速窗断言待真机取证" };

function successSettlement(withDebt: boolean): LastSettlementView {
  return {
    result: "success",
    commitHash: "abc1234",
    evidence: {
      summary: "实现+单测绿",
      ...(withDebt ? { gates: { evidenceDebt: DEBT } } : {}),
    },
  };
}

describe("改进7 · e2e 取证债（settleWorkerRun 欠账任务生成）", () => {
  it("success + evidenceDebt：自动生成同容器 test-run 欠账任务（dependsOn 实现卡）+ spawned 结果携带 evidenceDebt", async () => {
    const h = harness(successSettlement(true));
    const settlement = await settleWorkerRun({ tasks: h.tasks, settlements: h.settlements }, ctxOf());
    expect(settlement.case).toBe("settled");
    if (settlement.case !== "settled") return;
    expect(h.addTaskInputs).toHaveLength(1);
    expect(h.addTaskInputs[0]).toMatchObject({
      projectKey: "p-1",
      slug: "feat-x",
      type: "test-run",
      priority: "P1",
      dependsOn: ["2.5"],
      context: { E2E_DEBT_SOURCE: "feat-x/2.5", E2E_DEBT_SPECS: "e2e/specs/race-window.spec.ts" },
    });
    expect((h.addTaskInputs[0] as { brief: string }).brief).toContain("e2e/specs/race-window.spec.ts");
    expect(settlement.result.evidenceDebt).toEqual({
      taskRef: { slug: "feat-x", localId: "2.6" },
      suite: "e2e",
      specs: DEBT.specs,
    });
  });

  it("addTask 落库故障 fail-soft：结算保持 success（不回滚），result 零 evidenceDebt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const h = harness(successSettlement(true));
      h.setAddTaskError(new Error("db locked"));
      const settlement = await settleWorkerRun({ tasks: h.tasks, settlements: h.settlements }, ctxOf());
      expect(settlement.case).toBe("settled");
      if (settlement.case !== "settled") return;
      expect(settlement.result.outcome).toBe("success");
      expect(settlement.result.evidenceDebt).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });

  it("success 无欠账 / blocked：零 addTask（欠账任务只由欠账声明触发）", async () => {
    const plain = harness(successSettlement(false));
    const s1 = await settleWorkerRun({ tasks: plain.tasks, settlements: plain.settlements }, ctxOf());
    expect(s1.case).toBe("settled");
    expect(plain.addTaskInputs).toHaveLength(0);

    const blocked = harness({ result: "blocked", evidence: { reason: "e2e red" } }, "blocked");
    const s2 = await settleWorkerRun({ tasks: blocked.tasks, settlements: blocked.settlements }, ctxOf());
    expect(s2.case).toBe("settled");
    if (s2.case !== "settled") return;
    expect(s2.result.outcome).toBe("blocked");
    expect(blocked.addTaskInputs).toHaveLength(0);
  });

  it("欠账卡文案与简报行存在性一致（bug ca061ef6）：简报红灯在场 → 指示比对行；缺席 → 兜底文案", async () => {
    const withRed = harness(successSettlement(true));
    await settleWorkerRun({ tasks: withRed.tasks, settlements: withRed.settlements }, { ...ctxOf(), e2eBaselineRedCases: ["e2e/specs/a.spec.ts"] });
    expect((withRed.addTaskInputs[0] as { brief: string }).brief).toContain("先比对任务说明中的 E2E_BASELINE_RED 行");
    // 双轨基线优先级裁决句（提案 forge-test-pipeline-hardening 7）：两行并存以用例级清单优先
    expect((withRed.addTaskInputs[0] as { brief: string }).brief).toContain(
      "双轨基线并存时以 E2E_BASELINE_RED 用例级清单优先，TEST_BASELINE 文档基线作补充归因参考",
    );

    const withoutRed = harness(successSettlement(true));
    await settleWorkerRun({ tasks: withoutRed.tasks, settlements: withoutRed.settlements }, ctxOf());
    expect((withoutRed.addTaskInputs[0] as { brief: string }).brief).toContain("说明中没有 E2E_BASELINE_RED 行");
    expect((withoutRed.addTaskInputs[0] as { brief: string }).brief).not.toContain("先比对任务说明中的 E2E_BASELINE_RED 行");
    expect((withoutRed.addTaskInputs[0] as { brief: string }).brief).toContain(
      "双轨基线并存时以 E2E_BASELINE_RED 用例级清单优先，TEST_BASELINE 文档基线作补充归因参考",
    );

    const emptyRed = harness(successSettlement(true));
    await settleWorkerRun({ tasks: emptyRed.tasks, settlements: emptyRed.settlements }, { ...ctxOf(), e2eBaselineRedCases: [] });
    expect((emptyRed.addTaskInputs[0] as { brief: string }).brief).toContain("说明中没有 E2E_BASELINE_RED 行");
  });
});

describe("改进7 · e2e 红灯基线清单透传（claimForDispatch → claimTask）", () => {
  it("args.e2eBaselineRedCases 随 claimTask 入参递达（简报 E2E_BASELINE_RED 行载体）", async () => {
    const claimInputs: unknown[] = [];
    const claim = {
      task: snapshot(),
      dispatchPrompt: "P",
      persona: "PERSONA",
      digest: "digestabc123",
      reclaimed: false,
    };
    const tasks = {
      claimTask: async (input: unknown) => {
        claimInputs.push(input);
        return claim;
      },
      taskStats: async () => ({
        total: 1,
        byStatus: { pending: 0, in_progress: 1, blocked: 0, completed: 0, skipped: 0, rejected: 0, suspended: 0, interrupted: 0 },
        unmetPending: 0,
        gatedPending: 0,
      }),
    } as unknown as TasksService;
    const deps: DispatchCoreDeps = { tasks, spawn: async () => handle() };
    const attribution: { slug?: string } = {};
    const exec: DispatchCoreExec = { attribution, parent: {}, signal: undefined, verb: "run-dag-tasks" };
    const args: DispatchCoreArgs = {
      identity: { sessionId: "owner-1", loopSourced: true },
      guardKey: "loop-1",
      projectId: "p-1",
      source: { slug: "feat-x" },
      e2eBaselineRedCases: ["e2e/specs/a.spec.ts"],
    };
    const result = await claimForDispatch(deps, exec, args);
    expect(result.kind).toBe("claimed");
    expect(claimInputs[0]).toMatchObject({ e2eBaselineRedCases: ["e2e/specs/a.spec.ts"] });
  });
});
