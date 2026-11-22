// S1a · dispatch-core 独立单测（可拆卸壳分层验收项——「不依赖工具面装配」）：
// dispatchCore(deps, exec, args) 直调——零 createDispatchTaskTool / 零 args 解析 /
// 零 ToolExecFace。覆盖 claim→组装→spawn→事件发射主链 + guard 机械的 guardKey
// 参数化（decisions #18：粘性载体 = guard 键而非会话 id——工具壳填会话 id、循环填
// LoopInstanceId，两消费者互不污染）+ 后台 dispatched 回执与 job 内防线回灌。
// spawn 面全桩（SpawnWorker 缝）；工具壳侧行为由 tools 套件守护。
// slug 化锚：source = { slug }；claim/taskStats 入参 projectKey；submit 载荷经 settlements
// 读缝（v1 列面——records 行纯轨迹）；模块④：路由档位（generic 兜底 allow = 管线必备 ∪ 执行基础集）。
import { describe, expect, it } from "vitest";
import type { ForgePluginEvent } from "@dsh-forge/contracts";
import type { TaskSnapshot } from "../../host/domain/tasks/types.js";
import type { TaskStats, TaskStatus, TaskType } from "../../host/domain/tasks/list.js";
import type { ClaimTaskResult } from "../../host/domain/tasks/claim.js";
import type { QueryTaskResult } from "../../host/domain/tasks/query.js";
import type { TasksService } from "../../host/domain/tasks/service.js";
import { dispatchCore } from "../../host/dispatch-core/core.js";
import { WORKER_GENERIC_EXECUTION_TOOLS, WORKER_PIPELINE_ESSENTIAL_TOOLS } from "../../host/dispatch-core/assemble.js";

/** core 链携 process.platform 求交：shell 双候选解析为平台在场者（win32=pwsh） */
const EXPECTED_GENERIC_ALLOW = [
  ...WORKER_PIPELINE_ESSENTIAL_TOOLS,
  ...WORKER_GENERIC_EXECUTION_TOOLS.filter((name) => name !== (process.platform === "win32" ? "bash" : "pwsh")),
];
import type { DispatchCoreArgs, DispatchCoreDeps, DispatchCoreExec } from "../../host/dispatch-core/core.js";
import type { LastSettlementView } from "../../host/dispatch-core/settle.js";
import type { ForgeEventSink } from "../../host/events/sink.js";
import type { DispatchJobsFace, DispatchJobSpec, DispatchJobHooks, WorkerRouteProfile } from "../../host/faces.js";
import type { SpawnWorkerHandle, SpawnWorkerRequest } from "../../host/dispatch-core/spawn.js";

// ─────────────────────────── 夹具 ───────────────────────────

function snapshot(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
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
    ...over,
  };
}

function statsOf(over: Partial<Record<TaskStatus, number>> & { unmetPending?: number; gatedPending?: number } = {}): TaskStats {
  const byStatus: Record<TaskStatus, number> = {
    pending: 0,
    in_progress: 0,
    blocked: 0,
    completed: 0,
    skipped: 0,
    rejected: 0,
    suspended: 0,
    interrupted: 0,
    ...over,
  };
  return { total: 1, byStatus, unmetPending: over.unmetPending ?? 0, gatedPending: over.gatedPending ?? 0 };
}

/** 事件捕获 sink 桩（零 I/O；prepare 不入核心面——核心面仅 emit） */
function sinkStub(): { sink: ForgeEventSink; events: ForgePluginEvent[] } {
  const events: ForgePluginEvent[] = [];
  return {
    events,
    sink: {
      emit: (e) => events.push(e),
      prepare: async () => {},
      dirOf: () => undefined,
      remember: () => {},
    },
  };
}

function okHandle(workerSessionId = "worker-1"): SpawnWorkerHandle {
  return {
    workerSessionId,
    result: Promise.resolve({ stopReason: "completed", output: "done" }),
    dispose: async () => {},
  };
}

interface Harness {
  deps: DispatchCoreDeps
  events: ForgePluginEvent[]
  calls: { claim: number; stats: number; query: number; list: number; submit: number; spawnRecord: number }
  claimInputs: unknown[]
  statsInputs: unknown[]
  spawnRequests: SpawnWorkerRequest[]
  spawnRecords: unknown[]
  setClaim(result: ClaimTaskResult): void
  setQuery(result: QueryTaskResult): void
  setSettlement(view: LastSettlementView | undefined): void
  setStats(stats: TaskStats): void
  setCards(cards: { slug: string; localId: string; sourceTask?: { slug: string; localId: string } }[]): void
  setSpawn(impl: (req: SpawnWorkerRequest) => Promise<SpawnWorkerHandle>): void
}

function harness(
  options: {
    resolveModelReasoning?: (provider: string, model: string) => Promise<readonly string[] | undefined>
    resolveWorkerProfile?: DispatchCoreDeps["resolveWorkerProfile"]
    bugsPresent?: () => boolean
    jobs?: DispatchJobsFace
  } = {},
): Harness {
  const { sink, events } = sinkStub();
  const calls = { claim: 0, stats: 0, query: 0, list: 0, submit: 0, spawnRecord: 0 };
  const claimInputs: unknown[] = [];
  const statsInputs: unknown[] = [];
  const spawnRecords: unknown[] = [];
  const spawnRequests: SpawnWorkerRequest[] = [];
  let claimResult: ClaimTaskResult = { task: snapshot(), dispatchPrompt: "PERSONA + <task-context>", persona: "PERSONA-MATRIX", digest: "digestabc123", reclaimed: false };
  let queryResult: QueryTaskResult = {
    task: snapshot({ taskStatus: "completed" }),
    container: { slug: "feat-x" },
    records: [
      { verb: "submit", toStatus: "completed", actor: "plugin-tool", createdAt: "2026-10-11T01:00:00.000Z", loopSourced: false },
    ],
  };
  let lastSettlement: LastSettlementView | undefined = {
    result: "success",
    commitHash: "abc1234",
    evidence: { summary: "did the thing" },
  };
  let statsResult: TaskStats = statsOf({ pending: 1, blocked: 1, unmetPending: 2, gatedPending: 0 });
  let cards: { slug: string; localId: string; sourceTask?: { slug: string; localId: string } }[] = [];
  let spawnImpl: (req: SpawnWorkerRequest) => Promise<SpawnWorkerHandle> = async (req) => {
    spawnRequests.push(req);
    return okHandle();
  };
  const tasks = {
    claimTask: async (input: unknown) => {
      claimInputs.push(input);
      calls.claim += 1;
      return claimResult;
    },
    taskStats: async (input: unknown) => {
      statsInputs.push(input);
      calls.stats += 1;
      return statsResult;
    },
    queryTask: async () => {
      calls.query += 1;
      return queryResult;
    },
    listTasks: async () => {
      calls.list += 1;
      return cards.map((c) => ({
        taskId: `card-${c.localId}`,
        slug: c.slug,
        localId: c.localId,
        title: `Task ${c.localId}`,
        taskType: "coding-fix" as TaskType,
        taskStatus: "pending" as TaskStatus,
        prerequisites: [],
        sessionCount: 0,
        containerSlug: c.slug,
        ...(c.sourceTask !== undefined ? { sourceTask: c.sourceTask } : {}),
      }));
    },
    submitTask: async () => {
      calls.submit += 1;
      throw new Error("dispatchCore must not submit on any path (spawn failure leaves in_progress)");
    },
    recordSpawn: async (input: unknown) => {
      calls.spawnRecord += 1;
      spawnRecords.push(input);
    },
  } as unknown as TasksService;
  const deps: DispatchCoreDeps = {
    tasks,
    events: sink,
    settlements: { lastByTask: async () => lastSettlement },
    ...(options.resolveModelReasoning !== undefined ? { resolveModelReasoning: options.resolveModelReasoning } : {}),
    ...(options.resolveWorkerProfile !== undefined ? { resolveWorkerProfile: options.resolveWorkerProfile } : {}),
    ...(options.bugsPresent !== undefined ? { bugsPresent: options.bugsPresent } : {}),
    ...(options.jobs !== undefined ? { jobs: options.jobs } : {}),
    spawn: (req) => spawnImpl(req),
  };
  return {
    deps,
    events,
    calls,
    claimInputs,
    statsInputs,
    spawnRequests,
    spawnRecords,
    setClaim: (r) => {
      claimResult = r;
    },
    setQuery: (r) => {
      queryResult = r;
    },
    setSettlement: (v) => {
      lastSettlement = v;
    },
    setStats: (s) => {
      statsResult = s;
    },
    setCards: (c) => {
      cards = c;
    },
    setSpawn: (impl2) => {
      spawnImpl = impl2;
    },
  };
}

/** 核心执行上下文（循环形态：parent = 真 Agent 透传位；attribution 槽由调用方持有） */
function execOf(): { exec: DispatchCoreExec; attribution: { slug?: string } } {
  const attribution: { slug?: string } = {};
  return {
    attribution,
    exec: { attribution, parent: { agentTag: "parent-session" }, signal: undefined, verb: "dispatchTask" },
  };
}

/** 循环形态入参（S1 循环驱动器的未来调用形状：主会话真实 id + loopSourced + 实例键） */
function loopArgs(over: Partial<DispatchCoreArgs> = {}): DispatchCoreArgs {
  return {
    identity: { sessionId: "loop-owner-1", loopSourced: true },
    guardKey: "loop-instance-1",
    projectId: "p-1",
    ...(over.source !== undefined ? { source: over.source } : {}),
    ...(over.runInBackground !== undefined ? { runInBackground: over.runInBackground } : {}),
    ...over,
  };
}

/** jobs 面桩（后台径——spec/hooks 捕获；jobId 递增签发） */
function jobsStub(): { jobs: DispatchJobsFace; specs: DispatchJobSpec[]; hooks: DispatchJobHooks[] } {
  const specs: DispatchJobSpec[] = [];
  const hooks: DispatchJobHooks[] = [];
  let seq = 0;
  return {
    specs,
    hooks,
    jobs: {
      start: (spec) => {
        seq += 1;
        specs.push(spec);
        hooks.push(spec.run({ appendLog: () => {} }));
        return { jobId: `forge-dispatch-${seq}` };
      },
    },
  };
}

/** 可控终态句柄桩（后台径——result 由测试手动 resolve/reject） */
function controlledHandle(workerSessionId = "worker-bg"): SpawnWorkerHandle & {
  release(result: { stopReason: string; output: string }): void
  reject(cause: unknown): void;
} {
  let settle!: (r: { stopReason: string; output: string }) => void;
  let fail!: (cause: unknown) => void;
  const result = new Promise<{ stopReason: string; output: string }>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return {
    workerSessionId,
    result,
    dispose: async () => {},
    release: settle,
    reject: fail,
  };
}

// ─────────────────────────── 主链：claim → 组装 → spawn → 事件发射 ───────────────────────────

describe("dispatchCore 主链（claim→组装→spawn→事件发射）", () => {
  it("spawned·success：claim 入参（真实会话 id + slug source 透传）+ spawn 组装（全文 prompt/label/toolFilter/parent）+ 事件三连（信封 = identity.sessionId）", async () => {
    const h = harness()
    const { exec, attribution } = execOf()
    const parent = { agentTag: "parent-session" }
    const out = await dispatchCore(h.deps, { ...exec, parent }, loopArgs({ source: { slug: "feat-x" } }))
    // claim：身份 = identity.sessionId（主会话真实 id——非合成身份）；slug source 透传；
    // S3 落地：loopSourced=true → claimTask 携带标记位（claim 记录 loop_sourced 持久痕迹）
    expect(h.claimInputs).toEqual([
      {
        projectKey: "p-1",
        sessionId: "loop-owner-1",
        source: { slug: "feat-x" },
        loopSourced: true,
      },
    ])
    // spawn 组装：全文 prompt + label（任务键 · 任务名）+ 收窄面 + parent 透传
    expect(h.spawnRequests).toHaveLength(1)
    const req = h.spawnRequests[0]!
    expect(req.prompt).toBe("PERSONA + <task-context>")
    expect(req.label).toBe("feat-x/2.5 · Implement the thing")
    // S2 分层承载：persona = compose 产出（taskType+complexity 消费）经 persona 字段透传；
    // 任务面/人格面分层——personaText 不进 prompt（AC-4）
    expect(req.persona).toBe("PERSONA-MATRIX")
    expect(req.prompt).not.toContain(req.persona!)
    expect(req.parent).toBe(parent)
    expect(req.signal).toBeInstanceOf(AbortSignal)
    // 模块④：路由档位解析面缺席 = generic 兜底档——allow = 管线必备 ∪ 执行基础集（shell 平台解析）
    expect(req.toolFilter.allow).toEqual(EXPECTED_GENERIC_ALLOW)
    expect(req.toolFilter.deny).toEqual(expect.arrayContaining(["ask_user_question", "subagent_fork", "query_task", "dispatch_task"]))
    // spawn 审计（执行会话事实诞生即入库——fail-soft 前的单调用断言）
    expect(h.calls.spawnRecord).toBe(1)
    expect(h.spawnRecords[0]).toEqual({ projectKey: "p-1", taskId: "t-1", sessionId: "worker-1" })
    // 事件发射：三连信封 sessionId = identity.sessionId、slug = 任务容器
    expect(h.events.map((e) => e.type)).toEqual(["task-claimed", "task-spawned", "task-worker-done"])
    const [claimed, spawned, done] = h.events as unknown as [
      { sessionId: string; slug: string; payload: { taskKey: string; dispatchDigest: string; taskType: string } },
      { payload: { workerSessionId: string; model: string } },
      { payload: { outcome: string; durationMs: number } },
    ]
    expect(claimed.sessionId).toBe("loop-owner-1")
    expect(claimed.slug).toBe("feat-x")
    expect(claimed.payload).toMatchObject({ taskKey: "feat-x/2.5", taskType: "coding-fix", dispatchDigest: "digestabc123" })
    expect(spawned.payload).toMatchObject({ workerSessionId: "worker-1", model: "inherit" })
    expect(done.payload).toMatchObject({ outcome: "success" })
    expect(done.payload.durationMs).toBeGreaterThanOrEqual(0)
    // 结果 + 归属槽（claim 后 = 任务容器——壳失败回调可见性）
    expect(out).toMatchObject({
      kind: "spawned",
      outcome: "success",
      taskRef: { slug: "feat-x", localId: "2.5" },
      digest: "digestabc123",
      pool: { pending: 1, inProgress: 0, blocked: 1, unmetPending: 2, gatedPending: 0 },
    })
    expect(attribution.slug).toBe("feat-x")
  });

  it("组装落面：路由档位 agentOptions 显式携带；档位不受支持 → 剥离 effort（组装面兼容收口）", async () => {
    const h = harness({
      resolveModelReasoning: async () => ["low", "high", "max"],
      resolveWorkerProfile: async () =>
        ({ kind: "expert", agentOptions: { provider: "deepseek", model: "reasoner", reasoningEffort: "medium" } }) as WorkerRouteProfile,
    })
    const { exec } = execOf()
    await dispatchCore(h.deps, exec, loopArgs())
    expect(h.spawnRequests[0]?.agentOptions).toEqual({ provider: "deepseek", model: "reasoner" }) // medium 不在支持集 → 剥离
  });

  it("no-task：池快照 + no-ready-task 事件（slug 容器归属）+ 归属槽保持 source 语境", async () => {
    const h = harness();
    const { exec, attribution } = execOf();
    h.setClaim({ task: null, dispatchPrompt: "", persona: "PERSONA-MATRIX", digest: "", reclaimed: false });
    h.setStats(statsOf({ pending: 3, blocked: 1, unmetPending: 2, gatedPending: 0 }));
    const out = await dispatchCore(h.deps, exec, loopArgs({ source: { slug: "pa" } }));
    expect(out).toEqual({ kind: "no-task", pool: { pending: 3, inProgress: 0, blocked: 1, unmetPending: 2, gatedPending: 0 } });
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ type: "no-ready-task", sessionId: "loop-owner-1", slug: "pa", payload: { contextSlug: "pa" } });
    expect(attribution.slug).toBe("pa");
  });
});

// ─────────────────────────── S3：adopt 定向领取 + 循环来源标记（恢复径接线） ───────────────────────────

describe("dispatchCore S3 接线（adopt + loopSourced → claimTask）", () => {
  it("adopt 在场：claimTask 携带 adopt 引用 + loopSourced（循环恢复径——定向领 earliest interrupted）", async () => {
    const h = harness();
    const { exec } = execOf();
    await dispatchCore(
      h.deps,
      exec,
      loopArgs({ adopt: { slug: "feat-x", localId: "2.5" } }),
    );
    expect(h.claimInputs).toEqual([
      {
        projectKey: "p-1",
        sessionId: "loop-owner-1",
        adopt: { slug: "feat-x", localId: "2.5" },
        loopSourced: true,
      },
    ]);
  });

  it("工具壳形态（loopSourced=false、无 adopt）：claimTask 零新键（dispatchTask schema 与外部语义零变化）", async () => {
    const h = harness();
    const { exec, attribution } = execOf();
    await dispatchCore(h.deps, exec, {
      identity: { sessionId: "s-shell", loopSourced: false },
      guardKey: "s-shell",
      projectId: "p-1",
    });
    expect(h.claimInputs).toEqual([{ projectKey: "p-1", sessionId: "s-shell" }]);
    expect(attribution.slug).toBe("feat-x"); // claim 后归属槽 = 任务容器（默认桩领取 feat-x/2.5）
  });

  it("loopSourced=true 无 adopt（循环常规领取）：仅标记位落面——就绪盲选语义零变化", async () => {
    const h = harness();
    const { exec } = execOf();
    await dispatchCore(h.deps, exec, loopArgs());
    expect(h.claimInputs).toEqual([
      { projectKey: "p-1", sessionId: "loop-owner-1", loopSourced: true },
    ]);
  });

  it("testBaseline 载荷透传 claimTask（forge-test-boundary-gates 方案2——core 零 IO 只透传，两形态原样落面）", async () => {
    const h = harness();
    const { exec } = execOf();
    await dispatchCore(
      h.deps,
      exec,
      loopArgs({ testBaseline: { present: true, path: "Z:\\proj\\.forge\\docs\\features\\feat-x\\test-baseline.md", recordedAt: "2026-02-24T08:00:00.000Z" } }),
    );
    expect(h.claimInputs[0]).toMatchObject({
      testBaseline: { present: true, path: "Z:\\proj\\.forge\\docs\\features\\feat-x\\test-baseline.md", recordedAt: "2026-02-24T08:00:00.000Z" },
    });
    const h2 = harness();
    const { exec: exec2 } = execOf();
    await dispatchCore(h2.deps, exec2, loopArgs({ testBaseline: { present: false } }));
    expect(h2.claimInputs[0]).toMatchObject({ testBaseline: { present: false } });
    // 载荷缺席 = 机制关闭：claimTask 零 testBaseline 键（工具壳行为零变化）
    const h3 = harness();
    const { exec: exec3 } = execOf();
    await dispatchCore(h3.deps, exec3, loopArgs());
    expect(h3.claimInputs[0]).not.toHaveProperty("testBaseline");
  });
});

// ─────────────────────────── guard 机械（guardKey 参数化——decisions #18） ───────────────────────────

describe("dispatchCore guard 机械（guardKey 参数化）", () => {
  it("3 连败粘住 guardKey：第 3 次返回 halted + 入口检查冻结 claim；同会话换 guardKey 即恢复（粘性载体 = guard 键非会话）", async () => {
    const h = harness();
    const { exec } = execOf();
    h.setSpawn(async () => {
      throw new Error("boom");
    });
    const r1 = await dispatchCore(h.deps, exec, loopArgs({ guardKey: "loop-A" }));
    const r2 = await dispatchCore(h.deps, exec, loopArgs({ guardKey: "loop-A" }));
    expect(r1).toMatchObject({ ok: false, code: "ERR_SPAWN_FAILED" });
    expect(r2).toMatchObject({ ok: false, code: "ERR_SPAWN_FAILED" });
    const r3 = await dispatchCore(h.deps, exec, loopArgs({ guardKey: "loop-A" }));
    expect(r3).toEqual({ kind: "halted", reason: expect.stringContaining("3 consecutive") });
    const claimsBefore = h.calls.claim;
    const r4 = await dispatchCore(h.deps, exec, loopArgs({ guardKey: "loop-A" }));
    expect(r4).toEqual({ kind: "halted", reason: expect.stringContaining("3 consecutive") });
    expect(h.calls.claim).toBe(claimsBefore); // 粘住：入口即拒，不再 claim
    // 同一身份会话、另一循环实例键：零波及（循环实例 guard 与会话/他实例互不污染）
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req);
      return okHandle();
    });
    const other = await dispatchCore(h.deps, exec, loopArgs({ guardKey: "loop-B" }));
    expect(other).toMatchObject({ kind: "spawned", outcome: "success" });
  });

  it("成功结算即清零 streak：败×2 → 成功 → 再败仍 ERR_SPAWN_FAILED（未粘住）", async () => {
    const h = harness();
    const { exec } = execOf();
    const key = { guardKey: "loop-streak-1" };
    h.setSpawn(async () => {
      throw new Error("boom");
    });
    await dispatchCore(h.deps, exec, loopArgs(key));
    await dispatchCore(h.deps, exec, loopArgs(key));
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req);
      return okHandle();
    });
    const ok = await dispatchCore(h.deps, exec, loopArgs(key));
    expect(ok).toMatchObject({ kind: "spawned", outcome: "success" });
    h.setSpawn(async () => {
      throw new Error("boom again");
    });
    const after = await dispatchCore(h.deps, exec, loopArgs(key));
    expect(after).toMatchObject({ ok: false, code: "ERR_SPAWN_FAILED" }); // streak 已清零
  });
});

// ─────────────────────────── spawn-false-alarm 分桶（ended-without-settlement） ───────────────────────────

describe("spawn-false-alarm 分桶（失败 DTO category）", () => {
  it("跑完未结算（结算读 in_progress + stopReason: completed）：DTO 冠「worker finished without submitTask」+ ended-without-settlement 桶——非 spawn failed 措辞", async () => {
    const h = harness();
    const { exec } = execOf();
    h.setQuery({
      task: snapshot({ taskStatus: "in_progress" }),
      container: { slug: "feat-x" },
      records: [],
    });
    const r = await dispatchCore(h.deps, exec, loopArgs({ guardKey: "loop-nosettle-1" }));
    expect(r).toMatchObject({ ok: false, code: "ERR_SPAWN_FAILED", category: "ended-without-settlement" });
    if (!("message" in r)) return expect.fail("expected failure DTO");
    expect(r.message).toContain("worker finished without submitTask for feat-x/2.5");
    expect(r.message).toContain("stopReason: completed");
    expect(r.message).not.toContain("worker spawn failed");
  });
});

// ─────────────────────────── 后台径（jobs 包装 + 结算后置 + job 内防线回灌） ───────────────────────────

describe("dispatchCore 后台径（dispatched 回执 + job 内回灌进 guardKey streak）", () => {
  it("runInBackground=true：立即返回四键回执（结算读零触达）；job done 后回灌——同 guardKey 前台再败 ×2 即 halted", async () => {
    const js = jobsStub();
    const h = harness({ jobs: js.jobs });
    const { exec } = execOf();
    const key = { guardKey: "loop-bg-1" };
    let latest!: ReturnType<typeof controlledHandle>;
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req);
      latest = controlledHandle();
      return latest;
    });
    const out = await dispatchCore(h.deps, exec, loopArgs({ ...key, runInBackground: true }));
    expect(out).toEqual({
      kind: "dispatched",
      taskRef: { slug: "feat-x", localId: "2.5" },
      title: "Implement the thing",
      type: "coding-fix",
      workerSessionId: "worker-bg",
      jobId: "forge-dispatch-1",
      pool: { pending: 1, inProgress: 0, blocked: 1, unmetPending: 2, gatedPending: 0 },
    });
    expect(h.calls.query).toBe(0); // 立即返回：结算读零触达
    latest.reject(new Error("bg boom"));
    const done = await js.hooks[0]!.done;
    expect(done.status).toBe("failed"); // job 内回灌 #1（guardKey streak）
    // 前台再败 ×2：同 guardKey 结算序 streak 达 3 → halted 粘住
    h.setSpawn(async () => {
      throw new Error("fg boom");
    });
    const f1 = await dispatchCore(h.deps, exec, loopArgs({ ...key, runInBackground: false }));
    expect(f1).toMatchObject({ ok: false, code: "ERR_SPAWN_FAILED" });
    const f2 = await dispatchCore(h.deps, exec, loopArgs(key));
    expect(f2).toEqual({ kind: "halted", reason: expect.stringContaining("3 consecutive") });
  });
});

// ─────────────────────────── scoped 池快照口径 + 重入标识（run-tasks-host-command/1.10） ───────────────────────────

describe("scoped 池快照口径 + 重入标识（1.10：快照分流 taskStats(slug) + claimed.reclaimed → reEntered）", () => {
  it("scoped 调用：taskStats 查询携带 slug（四计数 = 容器口径）——no-task 读与结算 spawned 读同口径", async () => {
    // no-task 读
    const h = harness();
    h.setClaim({ task: null, dispatchPrompt: "", persona: "PERSONA-MATRIX", digest: "", reclaimed: false });
    await dispatchCore(h.deps, execOf().exec, loopArgs({ source: { slug: "pa" } }));
    expect(h.statsInputs).toEqual([{ projectKey: "p-1", slug: "pa" }]);
    // 结算 spawned 读（settle 结算核）
    const h2 = harness();
    await dispatchCore(h2.deps, execOf().exec, loopArgs({ source: { slug: "feat-x" } }));
    expect(h2.statsInputs).toEqual([{ projectKey: "p-1", slug: "feat-x" }]);
  });

  it("后台 dispatched 读同口径：runInBackground=true 的池快照读亦携带 slug", async () => {
    const js = jobsStub();
    const h = harness({ jobs: js.jobs });
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req);
      return { workerSessionId: "worker-bg", result: new Promise(() => {}), dispose: async () => {} }; // 永不结算
    });
    await dispatchCore(h.deps, execOf().exec, loopArgs({ source: { slug: "feat-x" }, runInBackground: true }));
    expect(h.statsInputs).toEqual([{ projectKey: "p-1", slug: "feat-x" }]);
  });

  it("非 scoped 调用：taskStats 查询不含 slug 键（全池口径零变化）", async () => {
    const h = harness();
    h.setClaim({ task: null, dispatchPrompt: "", persona: "PERSONA-MATRIX", digest: "", reclaimed: false });
    await dispatchCore(h.deps, execOf().exec, loopArgs());
    expect(h.statsInputs).toHaveLength(1);
    expect(h.statsInputs[0]).not.toHaveProperty("slug");
  });

  it("重入标识：claim reclaimed=true → dispatched 回执携带 reEntered=true；新领取零 reEntered 键", async () => {
    const js = jobsStub();
    const h = harness({ jobs: js.jobs });
    h.setSpawn(async (req) => {
      h.spawnRequests.push(req);
      return { workerSessionId: "worker-bg", result: new Promise(() => {}), dispose: async () => {} }; // 永不结算——回执即证
    });
    h.setClaim({ task: snapshot(), dispatchPrompt: "P", persona: "PERSONA-MATRIX", digest: "d2", reclaimed: true });
    const reentered = await dispatchCore(h.deps, execOf().exec, loopArgs({ runInBackground: true }));
    expect(reentered).toMatchObject({ kind: "dispatched", reEntered: true });
    // 新领取（reclaimed=false）：回执零重入键
    h.setClaim({ task: snapshot(), dispatchPrompt: "P", persona: "PERSONA-MATRIX", digest: "d3", reclaimed: false });
    const fresh = await dispatchCore(h.deps, execOf().exec, loopArgs({ runInBackground: true }));
    expect(fresh).toMatchObject({ kind: "dispatched", jobId: "forge-dispatch-2" });
    expect(fresh).not.toHaveProperty("reEntered");
  });
});

// ─────────────────────────── 模块④：路由档位（expert/generic）spawn 组装消费 ───────────────────────────

describe("路由档位 spawn 组装消费（模块④——resolveWorkerProfile）", () => {
  it("expert 档：toolFilter.allow = 档案 tools ∪ 管线必备（bug 三动词随 bugsPresent 现查并入）+ agentOptions = 档案路由；事件 model 同步", async () => {
    const profileCalls: string[] = [];
    const h = harness({
      bugsPresent: () => true,
      resolveWorkerProfile: async (taskType) => {
        profileCalls.push(taskType);
        return {
          kind: "expert",
          agentOptions: { provider: "deepseek-official", model: "expert-model" },
          toolFilter: { allow: ["read", "custom-lint"], deny: [] },
        } as WorkerRouteProfile;
      },
    });
    await dispatchCore(h.deps, execOf().exec, loopArgs({ source: { slug: "feat-x" } }));
    // 取用恰一次、按任务类型（snapshot() 的 taskType = coding-fix）
    expect(profileCalls).toEqual(["coding-fix"]);
    const req = h.spawnRequests[0]!;
    expect(req.toolFilter.allow).toBeDefined();
    // 并集保底：档案白名单（read/custom-lint）+ 管线必备（submit_task/todo_write + bug 三动词；add_task 不保底——worker 不派任务）
    for (const name of ["read", "custom-lint", "submit_task", "record_bug", "resolve_bug", "get_bug", "todo_write"]) {
      expect(req.toolFilter.allow, `allow 保底 ${name}`).toContain(name);
    }
    expect(req.toolFilter.allow).not.toContain("add_task");
    // deny 收窄面照旧（矩阵派生不回退）
    expect(req.toolFilter.deny).toEqual(expect.arrayContaining(["ask_user_question", "query_task", "dispatch_task"]));
    // 路由消费：档案成对路由 → 整组进 agentOptions
    expect(req.agentOptions).toEqual({ provider: "deepseek-official", model: "expert-model" });
    const spawned = h.events.find((e) => e.type === "task-spawned") as unknown as { payload: { model: string } };
    expect(spawned.payload.model).toBe("expert-model");
  });

  it("generic 档（experts 缺席兜底）：allow = 管线必备 ∪ 执行基础集（keep-only 启用）；agentOptions 父继承", async () => {
    const h = harness({
      resolveWorkerProfile: async () => ({ kind: "generic", agentOptions: { provider: "deepseek", model: "expert-chat" } }) as WorkerRouteProfile,
    });
    await dispatchCore(h.deps, execOf().exec, loopArgs({ source: { slug: "feat-x" } }));
    const req = h.spawnRequests[0]!;
    expect(req.toolFilter.allow).toEqual(EXPECTED_GENERIC_ALLOW); // bug 三动词剔除（bugsPresent 缺席）
    expect(req.agentOptions).toEqual({ provider: "deepseek", model: "expert-chat" });
  });

  it("取用面缺席 = 装配降级：generic 兜底档直落（allow = 管线必备 ∪ 执行基础集、agentOptions 父继承 = undefined）", async () => {
    const h = harness();
    await dispatchCore(h.deps, execOf().exec, loopArgs({ source: { slug: "feat-x" } }));
    const req = h.spawnRequests[0]!;
    expect(req.toolFilter.allow).toEqual(EXPECTED_GENERIC_ALLOW);
    expect(req.toolFilter.deny).toContain("query_task");
    expect(req.agentOptions).toBeUndefined();
  });

  it("expert 档 reasoningEffort 在场 = 透传组装（reconcile 收口消费）", async () => {
    const h = harness({
      resolveWorkerProfile: async () =>
        ({ kind: "expert", agentOptions: { provider: "deepseek", model: "expert-chat", reasoningEffort: "high" } }) as WorkerRouteProfile,
    });
    await dispatchCore(h.deps, execOf().exec, loopArgs({ source: { slug: "feat-x" } }));
    expect(h.spawnRequests[0]!.agentOptions).toEqual({ provider: "deepseek", model: "expert-chat", reasoningEffort: "high" });
  });
});
