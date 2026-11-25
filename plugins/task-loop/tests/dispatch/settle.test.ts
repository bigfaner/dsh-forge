// settleWorkerRun 失败判词定向单测（bug 63112ab2——无结算失败原因携带 worker 输出原文，
// 流控分类的载体；缺输出 = 判词只有 stopReason，循环侧无法识别限流）。
// 机械④（forge-verification-hardening）：review-wave-N 修正波标记——多波递增、快照口径、
// 触发面（fix 链收口 / Blocker 返工批）与 fail-soft 缺席零变化。
// v1 列面适配：submit 载荷经 settlements 读缝（deps.settlements.lastByTask）。
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forgeDirOfWorkspace } from "@dsh-forge/lib-path";
import { describe, expect, it } from "vitest";
import type { TaskSnapshot } from "../../host/domain/tasks/types.js";
import type { TaskCard, TaskSettlementRow, TaskStats, TaskStatus } from "../../host/domain/tasks/list.js";
import type { TasksService } from "../../host/domain/tasks/service.js";
import { settleWorkerRun } from "../../host/dispatch-core/settle.js";
import type { LastSettlementView, SettleCheckpointsFace, SettleReportRecoveryDeps, WaveSnapshot } from "../../host/dispatch-core/settle.js";
import type { ForgeDiagEmitFace } from "../../host/faces.js";
import type { SpawnWorkerHandle } from "../../host/dispatch-core/spawn.js";

function snapshot(): TaskSnapshot {
  return {
    taskId: "t-1",
    slug: "feat-x",
    localId: "2.5",
    title: "Implement the thing",
    taskType: "coding-fix",
    taskStatus: "in_progress",
    breaking: false,
    complexity: "high",
    createdAt: "2026-10-11T00:00:00.000Z",
    updatedAt: "2026-10-11T00:00:00.000Z",
  };
}

function okHandle(): SpawnWorkerHandle {
  return {
    workerSessionId: "worker-1",
    result: Promise.resolve({ stopReason: "end_turn", output: "done" }),
    dispose: async () => {},
  };
}

function recordingCheckpoints(): { face: SettleCheckpointsFace; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  const face: SettleCheckpointsFace = {
    appendCheckpoint: async (input) => {
      calls.push(input as unknown as Record<string, unknown>);
      return { id: calls.length };
    },
  };
  return { face, calls };
}

const ZERO_SNAPSHOT: WaveSnapshot = { tasksTotal: 0, commitsTotal: 0, fixesTotal: 0, evidenceDebtsTotal: 0 };

function fullByStatus(completed: number): Record<TaskStatus, number> {
  return {
    pending: 0,
    in_progress: 0,
    blocked: 0,
    completed,
    skipped: 0,
    rejected: 0,
    suspended: 0,
    interrupted: 0,
  };
}

/** 结算态任务域桩：settled 终态 + 卡片清单 + 结算行读缝（快照口径数据源） */
function waveHarness(options: {
  readonly settledStatus: "completed" | "blocked"
  readonly cards?: readonly Partial<TaskCard>[]
  readonly settlementsByTask?: Record<string, readonly { commitHash?: string; evidenceDebt?: { suite: string; specs: string[]; note?: string } }[]>;
}): TasksService {
  const base = snapshot();
  const cards: TaskCard[] = (options.cards ?? []).map((c, i) => ({
    taskId: `t-${String(i)}`,
    slug: base.slug,
    localId: c.localId ?? String(i),
    title: `card ${String(i)}`,
    taskType: c.taskType ?? "coding-enhancement",
    taskStatus: c.taskStatus ?? "completed",
    prerequisites: [],
    sessionCount: 0,
    containerSlug: base.slug,
    ...(c.sourceTask !== undefined ? { sourceTask: c.sourceTask } : {}),
  }));
  const detail = (localId: string) => ({
    task: { ...base, localId, taskStatus: options.settledStatus },
    container: { slug: base.slug },
    records: [{ verb: "submit" as const, actor: "plugin-tool" as const, createdAt: "2026-01-01T00:00:00.000Z", loopSourced: false }],
  });
  const completed = cards.filter((c) => c.taskStatus === "completed");
  return {
    queryTask: async (input: { taskRef: { localId: string } }) => detail(input.taskRef.localId),
    listTasks: async () => cards,
    taskStats: async (): Promise<TaskStats> => ({ total: cards.length, byStatus: fullByStatus(completed.length), unmetPending: 0, gatedPending: 0 }),
    // 1.16 批量结算读面桩（快照口径数据源——替代逐卡 queryTask）
    taskSettlements: async (): Promise<TaskSettlementRow[]> =>
      completed.map((c) => {
        const rows = options.settlementsByTask?.[c.localId] ?? [];
        return {
          slug: c.slug,
          localId: c.localId,
          taskType: c.taskType,
          fixDerived: c.sourceTask !== undefined,
          commitHashes: rows.map((r) => r.commitHash).filter((h): h is string => h !== undefined && h !== ""),
          evidenceDebtCount: rows.filter((r) => r.evidenceDebt !== undefined).length,
        };
      }),
  } as unknown as TasksService;
}

/** 结算行读缝桩（settlementsByTask → LastSettlementView） */
function settlementsStub(byTask?: Record<string, readonly { commitHash?: string; evidenceDebt?: { suite: string; specs: string[]; note?: string } }[]>): { settlements: { lastByTask(taskId: string): LastSettlementView | undefined }; viewsByTask: Record<string, LastSettlementView | undefined> } {
  const viewsByTask: Record<string, LastSettlementView | undefined> = {};
  for (const [localId, rows] of Object.entries(byTask ?? {})) {
    const last = rows[rows.length - 1];
    viewsByTask[localId] =
      last === undefined
        ? undefined
        : {
            result: "success",
            ...(last.commitHash !== undefined ? { commitHash: last.commitHash } : {}),
            evidence: {
              summary: "did the thing",
              ...(last.evidenceDebt !== undefined ? { gates: { evidenceDebt: last.evidenceDebt } } : {}),
            },
          };
  }
  const taskIdOf = new Map<string, string>([["t-1", "2.5"]]);
  return {
    viewsByTask,
    settlements: {
      lastByTask: (taskId) => {
        const localId = taskIdOf.get(taskId) ?? taskId;
        return viewsByTask[localId];
      },
    },
  };
}

const RUN = { projectId: "p-1", task: snapshot(), digest: "d", handle: okHandle(), spawnStartedAt: Date.now() };

describe("settleWorkerRun 失败判词（bug 63112ab2）", () => {
  it("无结算失败原因携带 worker 输出原文（限流分类载体）", async () => {
    const handle: SpawnWorkerHandle = {
      workerSessionId: "worker-1",
      result: Promise.resolve({ stopReason: "error", output: "provider error: 429 rate limit exceeded" }),
      dispose: async () => {},
    };
    const settlement = await settleWorkerRun({ tasks: { queryTask: async () => ({ task: snapshot(), container: { slug: "feat-x" } }) } as unknown as TasksService }, { projectId: "p-1", task: snapshot(), digest: "d", handle, spawnStartedAt: Date.now() });
    expect(settlement.case).toBe("failed");
    if (settlement.case !== "failed") return;
    const message = settlement.cause instanceof Error ? settlement.cause.message : String(settlement.cause);
    expect(message).toContain("stopReason: error");
    expect(message).toContain("429 rate limit exceeded");
  });

  it("输出为空 = 判词零冒号尾（不引入空尾巴）", async () => {
    const handle: SpawnWorkerHandle = {
      workerSessionId: "worker-1",
      result: Promise.resolve({ stopReason: "error", output: "" }),
      dispose: async () => {},
    };
    const settlement = await settleWorkerRun({ tasks: { queryTask: async () => ({ task: snapshot(), container: { slug: "feat-x" } }) } as unknown as TasksService }, { projectId: "p-1", task: snapshot(), digest: "d", handle, spawnStartedAt: Date.now() });
    if (settlement.case !== "failed") return expect.fail("expected failed");
    const message = settlement.cause instanceof Error ? settlement.cause.message : String(settlement.cause);
    expect(message).toBe("worker run ended without a settlement (stopReason: error)");
  });

  it("跑完未结算（stopReason: completed）= 协议违约分桶：noSettlement 标记落面（spawn-false-alarm——不得冠 spawn failed）", async () => {
    const handle: SpawnWorkerHandle = {
      workerSessionId: "worker-1",
      result: Promise.resolve({ stopReason: "completed", output: "fix-4 完成，两 bug 两阶段落库闭环……" }),
      dispose: async () => {},
    };
    const settlement = await settleWorkerRun({ tasks: { queryTask: async () => ({ task: snapshot(), container: { slug: "feat-x" } }) } as unknown as TasksService }, { projectId: "p-1", task: snapshot(), digest: "d", handle, spawnStartedAt: Date.now() });
    expect(settlement.case).toBe("failed");
    if (settlement.case !== "failed") return;
    expect(settlement.noSettlement).toBe(true);
  });
});

describe("机械④ · review-wave-N 修正波标记（settleWorkerRun）", () => {
  it("fix 链收口：coding-fix success 结算落 review-wave-N 标记——proposalId/baseCommitHash/快照齐备", async () => {
    const { face, calls } = recordingCheckpoints();
    const { settlements } = settlementsStub({
      "1": [{ commitHash: "c1" }, { commitHash: "c1" }, { commitHash: "c2" }],
      "2": [{ commitHash: "c3", evidenceDebt: { suite: "e2e", specs: ["a.spec.ts"] } }],
    });
    const tasks = waveHarness({
      settledStatus: "completed",
      cards: [
        { localId: "1", taskStatus: "completed" },
        { localId: "2", taskType: "coding-fix", taskStatus: "completed" },
      ],
      settlementsByTask: {
        "1": [{ commitHash: "c1" }, { commitHash: "c1" }, { commitHash: "c2" }],
        "2": [{ commitHash: "c3", evidenceDebt: { suite: "e2e", specs: ["a.spec.ts"] } }],
      },
    });
    const settlement = await settleWorkerRun(
      { tasks, settlements, checkpoints: face, resolveHeadCommit: async () => "head-abc" },
      { ...RUN, worktreeCwd: "C:\\wt", proposalId: "prop-1" },
    );
    expect(settlement.case).toBe("settled");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      projectKey: "p-1",
      containerSlug: "feat-x",
      mark: "review-wave-N",
      baseCommitHash: "head-abc",
      // 快照口径：tasks_total=2（completed 数）；commits_total=3（c1/c2/c3 去重——c1 双记去重）；
      // fixes_total=1（coding-fix）；evidence_debts_total=1（evidenceDebt 声明一次）
      snapshots: { tasksTotal: 2, commitsTotal: 3, fixesTotal: 1, evidenceDebtsTotal: 1 },
    });
  });

  it("多波递增：连续两次 fix 结算各落一行，wave_seq 缺省由域自动递增（调用方免记序数）", async () => {
    const { face, calls } = recordingCheckpoints();
    const tasks = waveHarness({ settledStatus: "completed", cards: [{ localId: "0", taskType: "coding-fix" }] });
    const deps = { tasks, settlements: settlementsStub().settlements, checkpoints: face, resolveHeadCommit: async () => "head-1" };
    const ctx = { ...RUN, worktreeCwd: "C:\\wt", proposalId: "prop-1" };
    await settleWorkerRun(deps, ctx);
    await settleWorkerRun(deps, ctx);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.["mark"]).toBe("review-wave-N");
    expect(calls[1]?.["mark"]).toBe("review-wave-N");
    expect("waveSeq" in calls[0]!).toBe(false);
    expect("waveSeq" in calls[1]!).toBe(false);
  });

  it("Blocker 返工批：blocked 结算同样落修正波标记", async () => {
    const { face, calls } = recordingCheckpoints();
    const tasks = waveHarness({ settledStatus: "blocked", cards: [{ localId: "0", taskType: "coding-fix" }] });
    const settlement = await settleWorkerRun(
      { tasks, settlements: settlementsStub().settlements, checkpoints: face, resolveHeadCommit: async () => "head-2" },
      { ...RUN, worktreeCwd: "C:\\wt", proposalId: "prop-1" },
    );
    expect(settlement.case).toBe("settled");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.["mark"]).toBe("review-wave-N");
    expect(calls[0]?.["baseCommitHash"]).toBe("head-2");
  });

  it("非波点不落标记：普通 coding-feature success 结算零标记调用", async () => {
    const { face, calls } = recordingCheckpoints();
    const tasks = waveHarness({ settledStatus: "completed", cards: [{ localId: "0" }] });
    const task: TaskSnapshot = { ...RUN.task, taskType: "coding-feature", fixOfTaskId: undefined };
    await settleWorkerRun(
      { tasks, settlements: settlementsStub().settlements, checkpoints: face, resolveHeadCommit: async () => "head-3" },
      { ...RUN, task, proposalId: "prop-1" },
    );
    expect(calls).toHaveLength(0);
  });

  it("依赖缺席零变化：无 checkpoints 面或无 proposalId 映射 = 不落标记且零异常", async () => {
    const { face, calls } = recordingCheckpoints();
    const tasks = waveHarness({ settledStatus: "completed", cards: [{ localId: "0", taskType: "coding-fix" }] });
    const deps = { tasks, settlements: settlementsStub().settlements, checkpoints: face, resolveHeadCommit: async () => "head-4" };
    await settleWorkerRun(deps, RUN); // 无 proposalId
    await settleWorkerRun({ tasks, settlements: settlementsStub().settlements, resolveHeadCommit: async () => "head-4" }, { ...RUN, proposalId: "prop-1" }); // 无 checkpoints 面
    expect(calls).toHaveLength(0);
  });

  it("标记失败 fail-soft：appendCheckpoint 抛出不回滚已定结算", async () => {
    const face: SettleCheckpointsFace = {
      appendCheckpoint: async () => {
        throw new Error("db locked");
      },
    };
    const tasks = waveHarness({ settledStatus: "completed", cards: [{ localId: "0", taskType: "coding-fix" }] });
    const settlement = await settleWorkerRun(
      { tasks, settlements: settlementsStub().settlements, checkpoints: face, resolveHeadCommit: async () => "head-5" },
      { ...RUN, proposalId: "prop-1" },
    );
    expect(settlement.case).toBe("settled");
    if (settlement.case !== "settled") return;
    expect(settlement.result.outcome).toBe("success");
  });

  it("base commit 回退链：无 worktreeCwd/解析器缺 HEAD 时回落 submit commit hash（settlements 读缝）；双缺 = 跳过标记", async () => {
    const { face, calls } = recordingCheckpoints();
    const tasks = waveHarness({ settledStatus: "completed", cards: [{ localId: "0", taskType: "coding-fix" }] });
    const { settlements } = settlementsStub({ "2.5": [{ commitHash: "submit-abc" }] });
    await settleWorkerRun({ tasks, settlements, checkpoints: face }, { ...RUN, proposalId: "prop-1" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.["baseCommitHash"]).toBe("submit-abc");
  });

  it("快照口径：in_progress 卡不计入 tasks_total/fixes_total（结算成功才入账）", async () => {
    const { face, calls } = recordingCheckpoints();
    const tasks = waveHarness({
      settledStatus: "completed",
      cards: [
        { localId: "0", taskStatus: "completed" },
        { localId: "1", taskType: "coding-fix", taskStatus: "in_progress" },
        { localId: "2", sourceTask: { slug: "feat-x", localId: "0" }, taskStatus: "completed" },
      ],
      settlementsByTask: { "0": [{ commitHash: "c9" }] },
    });
    await settleWorkerRun(
      { tasks, settlements: settlementsStub().settlements, checkpoints: face, resolveHeadCommit: async () => "head-6" },
      { ...RUN, worktreeCwd: "C:\\wt", proposalId: "prop-1" },
    );
    expect(calls[0]?.["snapshots"]).toEqual({ tasksTotal: 2, commitsTotal: 1, fixesTotal: 1, evidenceDebtsTotal: 0 });
    expect(ZERO_SNAPSHOT.tasksTotal).toBe(0);
  });
});

// ─────────────────────────── AC7 · 结算旁挂回收钩子（loop-recurrence-hardening §2.4） ───────────────────────────

const PROPOSAL_SLUG = "loop-recurrence-hardening";

/** 结算成功（completed）任务域桩 */
function completedHarness(): TasksService {
  const query = {
    task: { ...snapshot(), taskStatus: "completed" },
    container: { slug: snapshot().slug },
    records: [],
  };
  return {
    queryTask: async () => query,
    taskStats: async (): Promise<TaskStats> => ({ total: 1, byStatus: fullByStatus(1), unmetPending: 0, gatedPending: 0 }),
  } as unknown as TasksService;
}

/** 注入式回收缝（记录调用入参——换注入即换落点断言载体） */
function recordingRecovery(runtimeDir: string, issuesDir: string): {
  deps: SettleReportRecoveryDeps
  runtimeCalls: Array<Record<string, string>>
  issuesCalls: Array<Record<string, string>>
} {
  const runtimeCalls: Array<Record<string, string>> = [];
  const issuesCalls: Array<Record<string, string>> = [];
  return {
    runtimeCalls,
    issuesCalls,
    deps: {
      resolveRuntimeTaskDir: async (input) => {
        runtimeCalls.push(input);
        return runtimeDir;
      },
      resolveSpecsIssuesDir: async (input) => {
        issuesCalls.push(input);
        return issuesDir;
      },
    },
  };
}

function captureDiags(): { diag: ForgeDiagEmitFace; entries: Array<{ level: string; event: string; message: string }> } {
  const entries: Array<{ level: string; event: string; message: string }> = [];
  const diag: ForgeDiagEmitFace = (payload) => {
    entries.push({ level: payload.level, event: payload.event, message: payload.message });
  };
  return { diag, entries };
}

describe("AC7 · 结算旁挂回收钩子（settleWorkerRun）", () => {
  it("成功结算探测运行时目录顶层 .md 复制进卷宗——非递归（incident 子目录不扫）且非 .md 不收", async () => {
    const home = mkdtempSync(join(tmpdir(), "forge-recover-"));
    const runtimeDir = join(home, "logs", PROPOSAL_SLUG, "2.4");
    const issuesDir = join(home, ".forge", "specs", PROPOSAL_SLUG, "issues", "2.4");
    mkdirSync(runtimeDir, { recursive: true });
    mkdirSync(join(runtimeDir, "incident"), { recursive: true });
    writeFileSync(join(runtimeDir, "verification-report.md"), "# 判别实验清单\n\n- exp1", "utf8");
    writeFileSync(join(runtimeDir, "raw-data.txt"), "not a report", "utf8");
    writeFileSync(join(runtimeDir, "incident", "inner.md"), "# 子目录不收", "utf8");
    const recovery = recordingRecovery(runtimeDir, issuesDir);
    const settlement = await settleWorkerRun(
      { tasks: completedHarness(), reportRecovery: recovery.deps },
      { ...RUN, task: { ...snapshot(), slug: PROPOSAL_SLUG, localId: "2.4" }, proposalId: "prop-1" },
    );
    expect(settlement.case).toBe("settled");
    if (settlement.case !== "settled") return;
    expect(settlement.result.outcome).toBe("success");
    // 卷宗正本在场且内容一致；非 .md 与子目录文件不收
    expect(readFileSync(join(issuesDir, "verification-report.md"), "utf8")).toBe("# 判别实验清单\n\n- exp1");
    expect(existsSync(join(issuesDir, "raw-data.txt"))).toBe(false);
    expect(existsSync(join(issuesDir, "incident"))).toBe(false);
    // 运行时原件不动（复制非移动）
    expect(existsSync(join(runtimeDir, "verification-report.md"))).toBe(true);
  });

  it("路径解析 = resolveDir 闭包注入派生：换注入即换落点（结算入参不携带路径）", async () => {
    const homeA = mkdtempSync(join(tmpdir(), "forge-landing-a-"));
    const homeB = mkdtempSync(join(tmpdir(), "forge-landing-b-"));
    const runtimeA = join(homeA, "logs", PROPOSAL_SLUG, "2.4");
    const issuesA = join(homeA, "issues-a");
    const issuesB = join(homeB, "issues-b");
    mkdirSync(runtimeA, { recursive: true });
    writeFileSync(join(runtimeA, "report.md"), "landing proof", "utf8");
    const a = recordingRecovery(runtimeA, issuesA);
    const b = recordingRecovery(runtimeA, issuesB);
    const task = { ...snapshot(), slug: PROPOSAL_SLUG, localId: "2.4" };
    const ctx = { ...RUN, task, proposalId: "prop-1" };
    await settleWorkerRun({ tasks: completedHarness(), reportRecovery: a.deps }, ctx);
    await settleWorkerRun({ tasks: completedHarness(), reportRecovery: b.deps }, ctx);
    expect(existsSync(join(issuesA, "report.md"))).toBe(true);
    expect(existsSync(join(issuesB, "report.md"))).toBe(true);
    // 闭包入参 = 身份键组（projectId/slug/localId），非路径
    expect(a.runtimeCalls[0]).toEqual({ projectId: "p-1", slug: PROPOSAL_SLUG, localId: "2.4" });
    expect(b.issuesCalls[0]).toEqual({ projectId: "p-1", slug: PROPOSAL_SLUG, localId: "2.4" });
  });

  it("目录空 fail-soft：结算态不变 + diag 诊断在场", async () => {
    const home = mkdtempSync(join(tmpdir(), "forge-empty-"));
    const runtimeDir = join(home, "logs", PROPOSAL_SLUG, "2.4");
    mkdirSync(runtimeDir, { recursive: true });
    const { deps } = recordingRecovery(runtimeDir, join(home, "issues"));
    const { diag, entries } = captureDiags();
    const settlement = await settleWorkerRun(
      { tasks: completedHarness(), reportRecovery: deps, diag },
      { ...RUN, task: { ...snapshot(), slug: PROPOSAL_SLUG, localId: "2.4" }, proposalId: "prop-1" },
    );
    expect(settlement.case).toBe("settled");
    if (settlement.case !== "settled") return;
    expect(settlement.result.outcome).toBe("success");
    expect(entries.some((e) => e.message.includes("recover"))).toBe(true);
  });

  it("复制失败 fail-soft：结算态不变 + diag 告警在场（不外抛）", async () => {
    const home = mkdtempSync(join(tmpdir(), "forge-fail-"));
    const runtimeDir = join(home, "logs", PROPOSAL_SLUG, "2.4");
    const issuesDir = join(home, "issues-blocker"); // 同名文件占位 → mkdir/copy 失败径
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(join(runtimeDir, "report.md"), "boom", "utf8");
    writeFileSync(issuesDir, "occupied", "utf8");
    const { deps } = recordingRecovery(runtimeDir, issuesDir);
    const { diag, entries } = captureDiags();
    const settlement = await settleWorkerRun(
      { tasks: completedHarness(), reportRecovery: deps, diag },
      { ...RUN, task: { ...snapshot(), slug: PROPOSAL_SLUG, localId: "2.4" }, proposalId: "prop-1" },
    );
    expect(settlement.case).toBe("settled");
    if (settlement.case !== "settled") return;
    expect(settlement.result.outcome).toBe("success");
    expect(entries.some((e) => e.level === "warn" && e.message.includes("recover"))).toBe(true);
    expect(readFileSync(issuesDir, "utf8")).toBe("occupied"); // 原占位未被破坏
  });

  it("旁挂惰性：无 proposalId / 钩子缺席 = 零探测零副作用", async () => {
    const home = mkdtempSync(join(tmpdir(), "forge-inert-"));
    const recovery = recordingRecovery(join(home, "logs"), join(home, "issues"));
    await settleWorkerRun(
      { tasks: completedHarness(), reportRecovery: recovery.deps },
      { ...RUN }, // 无 proposalId
    );
    await settleWorkerRun({ tasks: completedHarness() }, { ...RUN, task: { ...snapshot(), slug: PROPOSAL_SLUG, localId: "2.4" }, proposalId: "prop-1" }); // 钩子缺席
    expect(recovery.runtimeCalls).toHaveLength(0);
    expect(recovery.issuesCalls).toHaveLength(0);
  });
});

describe("createSettleReportRecovery 工厂（resolveDir 闭包派生 + 路径派生注入面）", () => {
  const taskLogsDir = (ws: string, slug: string, localId: string): string => join(ws, "logs", slug, localId);
  const specsIssuesDir = (ws: string, slug: string, localId: string): string =>
    // 生产派生同形：forgeDirOfWorkspace 单源 .forge 根（<ws>/.forge/specs/<slug>/issues/<localId>）
    // ——落点改回 proposals（.forge/docs/proposals/…）该断言即红
    join(forgeDirOfWorkspace(ws), "specs", slug, "issues", localId);

  it("运行时目录 = deriveTaskStoreDir 单源 + logs/<slug>/<localId>；specs 卷宗根 = wsPath/.forge/specs/<slug>/issues/<localId>", async () => {
    const ws = mkdtempSync(join(tmpdir(), "forge-factory-"));
    const containerDir = join(ws, "tasks-home", "c@deadbeef");
    const { createSettleReportRecovery } = await import("../../host/dispatch-core/settle.js");
    const recovery = createSettleReportRecovery({
      projects: {
        getProject: async () => ({ wsPath: ws }),
        deriveTaskStoreDir: async () => ({ dir: containerDir }),
      },
      taskLogsDir,
      specsIssuesDir,
    });
    await expect(recovery.resolveRuntimeTaskDir({ projectId: "p-1", slug: PROPOSAL_SLUG, localId: "2.4" })).resolves.toBe(
      join(containerDir, "logs", PROPOSAL_SLUG, "2.4"),
    );
    await expect(
      recovery.resolveSpecsIssuesDir({ projectId: "p-1", slug: PROPOSAL_SLUG, localId: "2.4" }),
    ).resolves.toBe(join(forgeDirOfWorkspace(ws), "specs", PROPOSAL_SLUG, "issues", "2.4"));
  });

  it("解析失败 = undefined（fail-soft，不外抛）；派生缝缺席 = undefined（惰性跳过）", async () => {
    const { createSettleReportRecovery } = await import("../../host/dispatch-core/settle.js");
    const recovery = createSettleReportRecovery({
      projects: {
        getProject: async () => null,
        deriveTaskStoreDir: async () => ({ dir: "Z:\\x" }),
      },
      taskLogsDir,
      specsIssuesDir,
    });
    await expect(recovery.resolveRuntimeTaskDir({ projectId: "p-x", slug: "s", localId: "1" })).resolves.toBeUndefined();
    await expect(
      recovery.resolveSpecsIssuesDir({ projectId: "p-x", slug: "s", localId: "1" }),
    ).resolves.toBeUndefined();
    // 派生缝缺席（未注入 taskLogsDir/specsIssuesDir）= 该径惰性跳过
    const bare = createSettleReportRecovery({
      projects: {
        getProject: async () => ({ wsPath: "Z:\\ws" }),
        deriveTaskStoreDir: async () => ({ dir: "Z:\\ws\\tasks" }),
      },
    });
    await expect(bare.resolveRuntimeTaskDir({ projectId: "p-1", slug: "s", localId: "1" })).resolves.toBeUndefined();
    await expect(bare.resolveSpecsIssuesDir({ projectId: "p-1", slug: "s", localId: "1" })).resolves.toBeUndefined();
  });
});
