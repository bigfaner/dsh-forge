// forgeTasks Typert Remote 单测：① marker 端点表 pin（remoteMethods 快照 = gateway SRC
// 发现面的端点真源——namespace/method/exportName/mode 逐位断言）；② SRC 形参名单源 pin
// （wire 名 = JS 形参名）；③ 快照方法族 DTO 聚合（AC 进度批水化零 N+1 形态断言）；
// ④ follow baseline+增量快照钩（abort 出循环）；⑤ 注册装配（根 ctx plugin 捕获 + inject
// 生命周期绑 + 缺席降级 + 诊断留痕）；⑥ typed unavailable 诚实拒绝。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { remoteErrorOf, remoteMethods } from "@deepseek-ai/dsh-typert-protocol";
import { Context } from "@deepseek-ai/cordis";
import { addTask } from "../../host/domain/tasks/add.js";
import { claimTask } from "../../host/domain/tasks/claim.js";
import { submitTask } from "../../host/domain/tasks/submit.js";
import { createTasksService, type TasksService } from "../../host/domain/tasks/service.js";
import { createSettlementRepo } from "../../host/db/repositories/settlement-repo.js";
import {
  ForgeTasksRemote,
  TASKS_FOLLOW_INTERVAL_MS,
  projectUnresolvedMessage,
  registerForgeTasksRemote,
  unavailableMessage,
  type ForgeProjectsIdentityFace,
  type TasksServiceFace,
  type TypertAssemblyCtxFace,
} from "../../host/assembly/typert-remotes.js";
import { createTasksHarness, seedTask, type TasksHarness } from "../domain-tasks/harness.js";
import { projectKeyOf } from "@dsh-forge/lib-path";
import type { ForgeWorktreesFamilyFace } from "../../host/assembly/typert-remotes.js";

let h: TasksHarness;
beforeEach(() => {
  h = createTasksHarness();
});

/** 服务装配（harness 单库 + 事件 spy——读面/写面同源） */
function buildService(): TasksService {
  return createTasksService({ db: h.db, events: h.events, resolveWsPath: () => "Z:\\ws\\domain-tasks" });
}

function fakeCtx(): unknown {
  // 真实 cordis ctx（TypertRemoteService 构造期 super(ctx, key) 走 reflect.provide——
  // shape 替身不可满足；project typert 测试同径）
  return new Context();
}

/** marker 端点表投影（method/exportName/mode 快照） */
function endpointsOf(service: object): string[] {
  return remoteMethods(service).map((m) => `${m.method}${m.exportName !== undefined ? `>${m.exportName}` : ""}${m.mode !== undefined ? `:${m.mode}` : ""}`);
}

/** 函数形参名抽取（gateway methodParameterNames 同径——纯标识符源码解析） */
function methodParameterNames(fn: (...args: unknown[]) => unknown): string[] {
  const source = Function.prototype.toString.call(fn);
  const head = source.slice(source.indexOf("(") + 1, source.indexOf(")"));
  return head
    .split(",")
    .map((part) => part.trim().split(/[?:]/)[0]?.trim() ?? "")
    .filter((name) => name !== "");
}

/**
 * typed 失败断言（官方 remoteErrorOf 结构判据钉——isDSHRemoteError === true + code string，
 * 与 gateway rpcFailure 折叠判据同源）。typedFailure 退化为普通 Error 带 code 属性时在此必红
 * （真机 gateway 只对标记命中折叠 code，其余折 gateway/internal——结构标记不可再失守）。
 */
async function failureOf(run: () => Promise<unknown>): Promise<{ code: string; message?: string }> {
  try {
    await run();
  } catch (cause) {
    const failure = remoteErrorOf(cause);
    if (failure === undefined) {
      throw new Error(`期望官方 isDSHRemoteError 结构标记的 RemoteError，实得：${String(cause)}`);
    }
    return { code: failure.code, message: failure.message };
  }
  throw new Error("期望 typed 失败抛出，实得成功返回");
}

describe("端点面 pin（gateway SRC 端点真源）", () => {
  it("forgeTasks 十端点——九读/写面键名沿用 ForgeTasksRpc 清单 + acSettlements 聚合 + follow mode:stream", () => {
    const svc = new ForgeTasksRemote(fakeCtx(), { tasks: () => ({}) as TasksServiceFace });
    expect(endpointsOf(svc)).toEqual([
      "list",
      "stats",
      "graph",
      "detail",
      "query",
      "sessionLinks",
      "validateFeatureTasks",
      "transition",
      "acSettlements",
      "follow:stream",
    ]);
  });

  it("SRC 形参名单源 pin（wire 名 = JS 形参名；signal 尾参 = cancellation 注入位）", () => {
    const svc = Object.create(ForgeTasksRemote.prototype) as Record<string, (...args: unknown[]) => unknown>;
    for (const [name, params] of [
      ["list", ["q", "signal"]],
      ["stats", ["q", "signal"]],
      ["graph", ["q", "signal"]],
      ["detail", ["q", "signal"]],
      ["query", ["input", "signal"]],
      ["sessionLinks", ["q", "signal"]],
      ["validateFeatureTasks", ["input", "signal"]],
      ["transition", ["input", "signal"]],
      ["acSettlements", ["q", "signal"]],
      ["follow", ["q", "signal"]],
    ] as const) {
      expect(methodParameterNames(svc[name] as never), name).toEqual(params);
    }
  });

  it("重估间隔常量 pin（follow 轮询节拍单源——诊断/调参锚）", () => {
    expect(TASKS_FOLLOW_INTERVAL_MS).toBe(3_000);
  });
});

describe("快照方法族 DTO 聚合（AC 进度批水化）", () => {
  it("list：有结算行任务携 acProgress（met 计数），无行任务键缺席；settlement 语句恰一条（零 N+1）", async () => {
    const withAc = seedTask(h, "alpha", "1", { status: "completed" });
    seedTask(h, "alpha", "2", { status: "in_progress" });
    createSettlementRepo(h.db).appendSettlement({
      taskId: withAc,
      result: "success",
      acResults: [
        { criterion: "判据一", met: true, evidence: "vitest run 绿" },
        { criterion: "判据二", met: false },
      ],
      evidence: { summary: "收口" },
    });

    // N+1 形态断言：包一层 prepare 计数——list 全程触 task_settlements 的语句恰一条
    let settlementStatements = 0;
    const originPrepare = h.db.prepare.bind(h.db);
    const svc = createTasksService({ db: h.db, events: h.events, resolveWsPath: () => "Z:\\ws" });
    h.db.prepare = ((sql: string, ...rest: never[]) => {
      if (sql.includes("task_settlements")) settlementStatements += 1;
      return originPrepare(sql, ...rest);
    }) as typeof h.db.prepare;

    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => svc, projects: () => projectsFaceOf("Z:\\ws\\domain-tasks") });
    const cards = await remote.list({ projectId: h.projectKey });
    expect(settlementStatements).toBe(1);
    expect(cards).toHaveLength(2);
    const hydrated = cards.find((c) => c.taskId === withAc);
    const bare = cards.find((c) => c.localId === "2");
    expect(hydrated?.acProgress).toEqual({ done: 1, total: 2 });
    expect(bare && "acProgress" in bare ? bare.acProgress : undefined).toBeUndefined();
  });

  it("graph：cards 全量 AC 进度水化 + 边三元组原样透传", async () => {
    const svc = buildService();
    const t = await addTask(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      title: "T",
      type: "coding-feature",
      acceptanceCriteria: ["唯一判据"],
    });
    await claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "sess-1", source: { slug: "alpha" } });
    await submitTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "alpha", localId: t.localId },
      result: "success",
      summary: "收口",
      gate: { compile: true, fmt: true, lint: true, test: true },
      acceptanceCriteria: [{ criterion: "唯一判据", met: true, evidence: "绿" }],
    });
    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => svc, projects: () => projectsFaceOf("Z:\\ws\\domain-tasks") });
    const graph = await remote.graph({ projectId: h.projectKey, source: { kind: "feature", slug: "alpha" } });
    expect(graph.tasks[0]?.acProgress).toEqual({ done: 1, total: 1 });
    expect(graph.edges).toEqual([]);
  });

  it("list/stats/graph：入参按界面契约携带 source（projectId + source），容器筛选经 source.slug 生效（bug 553ec45a）", async () => {
    const svc = buildService();
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "beta", title: "B", type: "coding-feature" });
    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => svc, projects: () => projectsFaceOf("Z:\\ws\\domain-tasks") });
    // 界面实际发送形态（plugins/project/ui/dock-tabs/overview/task-tab/task-tab-data.ts）：
    // 不带 slug，带 source = ContainerRef{kind, slug}（lib/api DTO 契约）
    const source = { kind: "feature", slug: "alpha" } as const;
    const [cards, stats, graph] = await Promise.all([
      remote.list({ projectId: h.projectKey, source }),
      remote.stats({ projectId: h.projectKey, source }),
      remote.graph({ projectId: h.projectKey, source }),
    ]);
    expect(cards.map((c) => c.title)).toEqual(["A"]);
    expect(stats.total).toBe(1);
    expect(graph.tasks.map((t) => t.title)).toEqual(["A"]);
  });

  it("validateFeatureTasks：入参按界面契约携带 featureSlug（projectId + featureSlug），域侧经 slug 命中该容器（bug 553ec45a 同类）", async () => {
    const svc = buildService();
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => svc, projects: () => projectsFaceOf("Z:\\ws\\domain-tasks") });
    // 界面实际发送形态（plugins/project/ui/dock-tabs/overview/task-tab/task-tab.tsx）：
    // { projectId, featureSlug }（lib/api ValidateFeatureTasksInput 契约）
    const report = await remote.validateFeatureTasks({ projectId: h.projectKey, featureSlug: "alpha" });
    expect(report.checked).toEqual({ slug: "alpha", tasks: 1 });
  });

  it("stats/query/sessionLinks：域读面原样透传（裸值直返）", async () => {
    const svc = buildService();
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "T", type: "coding-feature" });
    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => svc, projects: () => projectsFaceOf("Z:\\ws\\domain-tasks") });
    const stats = await remote.stats({ projectId: h.projectKey });
    expect(stats.total).toBe(1);
    expect(stats.byStatus.pending).toBe(1);
    expect(stats.unmetPending).toBe(0);
    const query = await remote.query({ projectId: h.projectKey, taskRef: { slug: "alpha", localId: t.localId } });
    expect(query.container).toEqual({ slug: "alpha" });
  });
});

describe("typed unavailable 与 follow 快照钩", () => {
  it("族服务缺席 → RemoteError typed 拒绝（code+message 保真，钉 unavailableMessage 单源）", async () => {
    const remote = new ForgeTasksRemote(fakeCtx(), {});
    for (const [name, run] of [
      ["list", () => remote.list({ projectId: "p" })],
      ["stats", () => remote.stats({ projectId: "p" })],
      ["graph", () => remote.graph({ projectId: "p", source: { kind: "feature", slug: "alpha" } })],
      ["detail", () => remote.detail({ projectId: "p", taskId: "t-1" })],
      ["query", () => remote.query({ projectId: "p", taskRef: { slug: "alpha", localId: "1" } })],
      ["sessionLinks", () => remote.sessionLinks({ projectId: "p" })],
      ["validateFeatureTasks", () => remote.validateFeatureTasks({ projectId: "p", featureSlug: "alpha" })],
      ["transition", () => remote.transition({ projectId: "p", taskId: "t-1", toStatus: "completed", reason: "r" })],
    ] as const) {
      const failure = await failureOf(run);
      expect(failure.code, name).toBe("ERR_FORGE_TASKS_UNAVAILABLE");
      expect(failure.message, name).toBe(unavailableMessage(name));
    }
  });

  it("follow：族服务缺席 → 流启动即 typed unavailable（gateway 折叠 RemoteFailure）", async () => {
    const remote = new ForgeTasksRemote(fakeCtx(), {});
    await expect(async () => {
      for await (const _frame of remote.follow({ projectId: "p" })) void _frame;
    }).rejects.toThrow(unavailableMessage("*"));
  });

  it("follow：首帧 baseline（seq=0）+ 快照变化才逐帧增量（seq 单调）+ abort 出循环", async () => {
    const svc = buildService();
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "T", type: "coding-feature" });
    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => svc, projects: () => projectsFaceOf("Z:\\ws\\domain-tasks"), followIntervalMs: 0 });
    const frames: number[] = [];
    const controller = new AbortController();
    for await (const frame of remote.follow({ projectId: h.projectKey }, controller.signal)) {
      frames.push(frame.seq);
      if (frame.seq === 0) {
        expect(frame.snapshot.cards).toHaveLength(1);
        expect(frame.snapshot.stats.total).toBe(1);
        // 快照事实源变更（claim → in_progress）→ 下轮重估产增量帧
        await claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "s-2", source: { slug: "alpha" } });
      } else {
        expect(frame.snapshot.cards[0]?.taskStatus).toBe("in_progress");
        controller.abort();
      }
    }
    expect(frames).toEqual([0, 1]);
  });
});

// ── 注册装配（根 ctx plugin 捕获 + inject 生命周期绑替身——project 同径） ──

function captureRoot(): {
  face: TypertAssemblyCtxFace;
  mounted: { name: string; scope: unknown }[];
} {
  const mounted: { name: string; scope: unknown }[] = [];
  const face: TypertAssemblyCtxFace = {
    plugin(options: { name: string; apply: (scope: unknown) => void }) {
      const scope = new Context();
      mounted.push({ name: options.name, scope });
      options.apply(scope);
      return scope;
    },
  };
  return { face, mounted };
}

function captureInjectLifecycle(initial?: { forgeTasks?: unknown }): {
  face: TypertAssemblyCtxFace;
  mounted: { name: string; scope: unknown }[];
  provide: (key: string, svc: unknown) => void;
  pendingCount: () => number;
} {
  const mounted: { name: string; scope: unknown }[] = [];
  const pending: Array<{ key: string; cb: (scope: Record<string, unknown>) => void }> = [];
  const services: Record<string, unknown> = { ...initial };
  const face: TypertAssemblyCtxFace = {
    plugin(options: { name: string; apply: (scope: unknown) => void }) {
      const scope = new Context();
      mounted.push({ name: options.name, scope });
      options.apply(scope);
      return scope;
    },
    inject(deps: readonly string[], cb: (scope: Record<string, unknown>) => void) {
      const key = deps[0] as string;
      if (services[key] !== undefined) cb({ [key]: services[key] });
      else pending.push({ key, cb });
      return () => {};
    },
  } as TypertAssemblyCtxFace;
  return {
    face,
    mounted,
    pendingCount: () => pending.length,
    provide: (key, svc) => {
      services[key] = svc;
      for (const entry of pending.splice(0)) {
        if (entry.key === key) entry.cb({ [key]: svc });
        else pending.push(entry);
      }
    },
  };
}

describe("registerForgeTasksRemote（根 ctx plugin 装配）", () => {
  it("域服务在场 + 无 inject 缝 → plugin 挂根 ctx（registered 清单）", () => {
    const { face, mounted } = captureRoot();
    const result = registerForgeTasksRemote(face, { tasks: () => ({}) as TasksServiceFace });
    expect(result.registered).toEqual(["forgeTasks"]);
    expect(result.degraded).toEqual([]);
    expect(mounted.map((m) => m.name)).toEqual(["task-loop-typert-forgeTasks"]);
  });

  it("域服务缺席 + 无 inject 缝 → degraded（诚实降级不空挂）+ 完成行诊断留痕", () => {
    const diag = vi.fn();
    const { face, mounted } = captureRoot();
    const result = registerForgeTasksRemote(face, { diag });
    expect(result.registered).toEqual([]);
    expect(result.degraded).toEqual(["forgeTasks"]);
    expect(mounted).toHaveLength(0);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("注册完成"));
  });

  it("根 ctx 取法走符号键（Symbol.for(\"cordis.root\")）——ctx 属性取根在 cordis 1.1.0 inject 门控下抛错（bug 2801eeeb 同族复发，eefcedd8 先例同型）", () => {
    const mounted: { name: string; scope: unknown }[] = [];
    const rootFace: TypertAssemblyCtxFace = {
      plugin(options: { name: string; apply: (scope: unknown) => void }) {
        const scope = new Context();
        mounted.push({ name: options.name, scope });
        options.apply(scope);
        return scope;
      },
    } as TypertAssemblyCtxFace;
    // 子 ctx 形入参：plugin 只在根 ctx 符号键指向的 rootFace 上（属性取法拿不到 → 红基线）
    const face = { [Symbol.for("cordis.root")]: rootFace };
    const result = registerForgeTasksRemote(face as TypertAssemblyCtxFace, { tasks: () => ({}) as TasksServiceFace });
    expect(result.registered).toEqual(["forgeTasks"]);
    expect(mounted.map((m) => m.name)).toEqual(["task-loop-typert-forgeTasks"]);
  });

  it("ctx.plugin 缺席（非 cordis 宿主）→ assembly 降级 + 诊断留痕", () => {
    const diag = vi.fn();
    const result = registerForgeTasksRemote({}, { diag });
    expect(result.registered).toEqual([]);
    expect(result.degraded).toEqual(["assembly"]);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("ctx.plugin 缺席"));
  });

  it("inject 生命周期绑：apply 时服务在场 = 同步激活注册；服务后到 = 挂起（pending）后补激活 + 迟到重绑诊断", () => {
    const svc = buildService();
    const diag = vi.fn();

    // 在场腿：同步激活
    const present = captureInjectLifecycle({ forgeTasks: svc });
    const presentResult = registerForgeTasksRemote(present.face, { diag });
    expect(presentResult.registered).toContain("forgeTasks");
    expect(present.mounted.map((m) => m.name)).toContain("task-loop-typert-forgeTasks");

    // 迟到腿：挂起 → provide → 补激活
    const late = captureInjectLifecycle();
    const lateResult = registerForgeTasksRemote(late.face, { diag });
    expect(lateResult.registered).not.toContain("forgeTasks");
    expect(lateResult.pending).toEqual(["forgeTasks"]);
    expect(late.pendingCount()).toBe(1);
    late.provide("forgeTasks", svc);
    expect(lateResult.registered).toContain("forgeTasks");
    expect(late.mounted.map((m) => m.name)).toContain("task-loop-typert-forgeTasks");
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("迟到重绑"));
  });

  it("inject 激活后控制器调用期现查服务（惰性语义——每次消费点求值，非注册期快照）", async () => {
    const svc = buildService();
    const { face } = captureInjectLifecycle({ forgeTasks: svc });
    registerForgeTasksRemote(face, {});
    const remote = new ForgeTasksRemote(new Context(), { tasks: () => svc, projects: () => projectsFaceOf("Z:\\ws\\domain-tasks") });
    const cards = await remote.list({ projectId: h.projectKey });
    expect(Array.isArray(cards)).toBe(true);
  });
});

describe("注册后自探针（boot 竞速根治——serve 层认领自证）", () => {
  it("registered 族 → gateway invoke 直探 forgeTasks/list（零副作用空 projectKey 读面）+ ok 完成行诊断", async () => {
    const { face } = captureRoot();
    const probe = vi.fn().mockResolvedValue({ ok: true });
    const diag = vi.fn();
    const result = registerForgeTasksRemote(face, { diag, tasks: () => ({}) as TasksServiceFace, selfProbe: probe });
    expect(result.registered).toContain("forgeTasks");
    await vi.waitFor(() => {
      expect(probe).toHaveBeenCalledWith("forgeTasks", "list", { projectId: "" });
      expect(diag).toHaveBeenCalledWith(expect.stringContaining("自探针 ok"));
    });
  });

  it("探针失败（gateway 缺席/调用抛错）→ 失败因诊断留痕，fail-soft 不阻载", async () => {
    const { face } = captureRoot();
    const probe = vi.fn().mockRejectedValue(new Error("typertGateway 服务缺席"));
    const diag = vi.fn();
    registerForgeTasksRemote(face, { diag, tasks: () => ({}) as TasksServiceFace, selfProbe: probe });
    await vi.waitFor(() => {
      expect(diag).toHaveBeenCalledWith(expect.stringContaining("自探针失败"));
    });
  });

  it("自探针缝缺席（缺省）→ 零探针零额外诊断（注册完成行语义不变）", () => {
    const { face } = captureRoot();
    const diag = vi.fn();
    const result = registerForgeTasksRemote(face, { diag, tasks: () => ({}) as TasksServiceFace });
    expect(result.registered).toEqual(["forgeTasks"]);
    expect(diag).toHaveBeenCalledTimes(1); // 仅完成行
  });
});

// ── 入参身份 host 半解析（bug 9407ff29 修型——host 半解析、客户端零投影，架构裁决） ──

/** forge.projects 缝替身（getProject 行真值锚——wsPath 派生归属键单源 harness PROJECT_CWD） */
function projectsFaceOf(wsPath: string | null): ForgeProjectsIdentityFace {
  return { getProject: async () => (wsPath === null ? null : { wsPath }) };
}

describe("入参身份 host 半解析（projectId → project_key）", () => {
  it("缝在场：projectId 经 wsPath 派生归属键后查域表——list/stats/graph 命中行集", async () => {
    const svc = buildService();
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "T", type: "coding-feature" });
    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => svc, projects: () => projectsFaceOf("Z:\\ws\\domain-tasks") });
    const listed = await remote.list({ projectId: "uuid-1" });
    expect(listed).toHaveLength(1);
    const stats = await remote.stats({ projectId: "uuid-1" });
    expect(stats.total).toBe(1);
    const graph = await remote.graph({ projectId: "uuid-1", source: { kind: "feature", slug: "alpha" } });
    expect(graph.tasks).toHaveLength(1);
  });

  it("缝缺席：快照族 fail-soft 降级「无任务数据」（list 空集/stats 全零/graph 空板/follow 单帧空板）+ 诊断留痕不静默", async () => {
    const svc = buildService();
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "T", type: "coding-feature" });
    const diag = vi.fn();
    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => svc, diag });
    const listed = await remote.list({ projectId: "uuid-2" });
    expect(listed).toEqual([]);
    const stats = await remote.stats({ projectId: "uuid-2" });
    expect(stats.total).toBe(0);
    expect(Object.keys(stats.byStatus)).toHaveLength(8);
    const graph = await remote.graph({ projectId: "uuid-2", source: { kind: "feature", slug: "alpha" } });
    expect(graph).toEqual({ tasks: [], edges: [] });
    const frames: unknown[] = [];
    for await (const frame of remote.follow({ projectId: "uuid-2" })) frames.push(frame);
    expect(frames).toHaveLength(1); // 单帧空板后收流（不静默空转）
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("身份解析缝缺席"));
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("uuid-2"));
  });

  it("缝在场但 projectId 未命中（行空）→ 同 fail-soft 降级 + 诊断留痕", async () => {
    const diag = vi.fn();
    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => ({}) as TasksServiceFace, projects: () => projectsFaceOf(null), diag });
    const listed = await remote.list({ projectId: "miss" });
    expect(listed).toEqual([]);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("身份解析未命中"));
  });

  it("row/write 面（detail/query/sessionLinks/validateFeatureTasks/transition）解析失败 → typed 拒绝不空集", async () => {
    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => ({}) as TasksServiceFace });
    for (const [name, run] of [
      ["detail", () => remote.detail({ projectId: "p", taskId: "t-1" })],
      ["query", () => remote.query({ projectId: "p", taskRef: { slug: "alpha", localId: "1" } })],
      ["sessionLinks", () => remote.sessionLinks({ projectId: "p" })],
      ["validateFeatureTasks", () => remote.validateFeatureTasks({ projectId: "p", featureSlug: "alpha" })],
      ["transition", () => remote.transition({ projectId: "p", taskId: "t-1", toStatus: "completed", reason: "r" })],
    ] as const) {
      const failure = await failureOf(run);
      expect(failure.code, name).toBe("ERR_FORGE_TASKS_PROJECT_UNRESOLVED");
      expect(failure.message, name).toBe(projectUnresolvedMessage("p"));
    }
  });

  it("getProject 抛错 → fail-soft 降级 + 诊断留痕（不炸读面）", async () => {
    const diag = vi.fn();
    const remote = new ForgeTasksRemote(fakeCtx(), {
      tasks: () => ({}) as TasksServiceFace,
      projects: () => ({ getProject: async () => { throw new Error("seam broke"); } }),
      diag,
    });
    const listed = await remote.list({ projectId: "boom" });
    expect(listed).toEqual([]);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("身份解析失败"));
  });
});

// ── 键族聚合（f5——worktree 任务主根概览可见：快照族按键族合并，写面单键不外溢） ──

const WT_PATH = "Z:\\ws\\domain-tasks\\.forge\\worktrees\\plugins";
const WT_KEY = projectKeyOf(WT_PATH);

/** forge.worktrees 键族缝替身（list entries[].path——主根 wsPath 下单 worktree 行） */
function worktreesFaceOf(pathsOf: (projectRoot: string) => readonly string[]): ForgeWorktreesFamilyFace {
  return { list: async ({ projectRoot }) => ({ entries: pathsOf(projectRoot).map((path) => ({ path })) }) };
}

describe("键族聚合（2026-11-24 方案 A——快照族多键合并）", () => {
  function familyRemote(svc: TasksService, opts: { worktrees?: ForgeWorktreesFamilyFace; diag?: (line: string) => void } = {}): ForgeTasksRemote {
    return new ForgeTasksRemote(fakeCtx(), {
      tasks: () => svc,
      projects: () => projectsFaceOf("Z:\\ws\\domain-tasks"),
      worktrees: opts.worktrees === undefined ? () => worktreesFaceOf((root) => [`${root}\\.forge\\worktrees\\plugins`]) : () => opts.worktrees,
      ...(opts.diag !== undefined ? { diag: opts.diag } : {}),
    });
  }

  /** 双键同形替身服务（stub——同一 taskId 在主根/worktree 两键各自域库同现的真实形态：
   *  单 :memory: 库 task_tasks.id 主键不可同 id 双行，故以键无关注入替身模拟双键同现） */
  function stubSvc(o: {
    listTasks?: () => unknown[];
    taskGraph?: () => { tasks: never[]; edges: unknown[] };
  }): TasksService {
    return {
      listTasks: async () => o.listTasks?.() ?? [],
      taskGraph: async () => o.taskGraph?.() ?? { tasks: [], edges: [] },
      latestSettlementsByTask: async () => [],
    } as unknown as TasksService;
  }

  /** TaskCard 最小卡（stub 注入形——域卡列面真值字段） */
  function stubCard(taskId: string, title: string) {
    return {
      taskId,
      slug: "alpha",
      localId: "1",
      title,
      taskType: "coding-feature",
      taskStatus: "pending",
      prerequisites: [],
      sessionCount: 0,
      containerSlug: "alpha",
    };
  }

  it("graph：同 taskId 双键 edge 行不双计（三元组去重键显式化——删 mergeEdges 去重此测必红）", async () => {
    // worktree 检出含同 .forge 常态：主根键与 wt 键各自域库持同一 taskId 的同一条边行
    const svc = stubSvc({
      taskGraph: () => ({ tasks: [], edges: [{ taskId: "t-alpha-1", prerequisiteId: "t-alpha-1", origin: "manual" }] }),
    });
    const remote = familyRemote(svc);
    const graph = await remote.graph({ projectId: "uuid-1", source: { kind: "feature", slug: "alpha" } });
    expect(graph.edges).toEqual([{ taskId: "t-alpha-1", prerequisiteId: "t-alpha-1", origin: "manual" }]);
  });

  it("list：同 taskId 双键卡片去重保首见序（主根键先行——删 mergeCards 去重此测必红）", async () => {
    const svc = stubSvc({
      listTasks: () => [stubCard("t-alpha-1", "主根卡")],
    });
    const remote = familyRemote(svc);
    const cards = await remote.list({ projectId: "uuid-1" });
    expect(cards).toEqual([expect.objectContaining({ taskId: "t-alpha-1", title: "主根卡" })]);
  });

  it("list：主根 + worktree 两键卡片合并（去重保序）", async () => {
    const svc = buildService();
    seedTask(h, "alpha", "1", { status: "pending" });
    await addTask(h.verbDeps, { projectKey: WT_KEY, slug: "alpha", title: "WT", type: "coding-feature" });
    const remote = familyRemote(svc);
    const cards = await remote.list({ projectId: "uuid-1" });
    expect(cards.map((c) => c.title).sort()).toEqual(["WT", "任务 1"]);
  });

  it("stats：键族逐键求和（total/byStatus 累加）", async () => {
    const svc = buildService();
    seedTask(h, "alpha", "1", { status: "pending" });
    seedTask(h, "alpha", "2", { status: "in_progress" });
    await addTask(h.verbDeps, { projectKey: WT_KEY, slug: "alpha", title: "WT", type: "coding-feature" });
    const remote = familyRemote(svc);
    const stats = await remote.stats({ projectId: "uuid-1" });
    expect(stats.total).toBe(3);
    expect(stats.byStatus.pending).toBe(2);
    expect(stats.byStatus.in_progress).toBe(1);
  });

  it("graph：键族 tasks 并集去重 + edges 并集", async () => {
    const svc = buildService();
    const mainId = seedTask(h, "alpha", "1", { status: "pending" });
    const wtTaskId = (await addTask(h.verbDeps, { projectKey: WT_KEY, slug: "alpha", title: "WT", type: "coding-feature" })).taskId;
    // wt 键边行（worktree 键子图——并集判据：主键边集为空、wt 键边恰一条）
    await h.db.prepare(`INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at) VALUES (?, ?, 'manual', ?, ?)`).run(wtTaskId, wtTaskId, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    const remote = familyRemote(svc);
    const graph = await remote.graph({ projectId: "uuid-1", source: { kind: "feature", slug: "alpha" } });
    expect(graph.tasks.map((t) => t.taskId).sort()).toEqual([mainId, wtTaskId].sort());
    expect(graph.edges).toHaveLength(1);
  });

  it("follow：baseline 帧按键族聚合（cards 合并 + stats 求和）", async () => {
    const svc = buildService();
    seedTask(h, "alpha", "1", { status: "pending" });
    await addTask(h.verbDeps, { projectKey: WT_KEY, slug: "alpha", title: "WT", type: "coding-feature" });
    const remote = new ForgeTasksRemote(fakeCtx(), {
      tasks: () => svc,
      projects: () => projectsFaceOf("Z:\\ws\\domain-tasks"),
      worktrees: () => worktreesFaceOf((root) => [`${root}\\.forge\\worktrees\\plugins`]),
      followIntervalMs: 0,
    });
    const controller = new AbortController();
    const frames: unknown[] = [];
    for await (const frame of remote.follow({ projectId: "uuid-1" }, controller.signal)) {
      frames.push(frame);
      controller.abort();
    }
    expect(frames).toHaveLength(1);
    const snapshot = (frames[0] as { snapshot: { cards: unknown[]; stats: { total: number } } }).snapshot;
    expect(snapshot.cards).toHaveLength(2);
    expect(snapshot.stats.total).toBe(2);
  });

  it("键族缝缺席（forge.worktrees 未装配）→ 快照族回退单键现状 + 诊断留痕", async () => {
    const svc = buildService();
    seedTask(h, "alpha", "1", { status: "pending" });
    await addTask(h.verbDeps, { projectKey: WT_KEY, slug: "alpha", title: "WT", type: "coding-feature" });
    const diag = vi.fn();
    const remote = new ForgeTasksRemote(fakeCtx(), {
      tasks: () => svc,
      projects: () => projectsFaceOf("Z:\\ws\\domain-tasks"),
      diag,
    });
    const listed = await remote.list({ projectId: "uuid-1" });
    expect(listed).toHaveLength(1); // 仅主根键
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("键族缝缺席"));
  });

  it("键族清单抛错 → fail-soft 回退单键 + 诊断留痕（不炸读面）", async () => {
    const svc = buildService();
    seedTask(h, "alpha", "1", { status: "pending" });
    const diag = vi.fn();
    const remote = new ForgeTasksRemote(fakeCtx(), {
      tasks: () => svc,
      projects: () => projectsFaceOf("Z:\\ws\\domain-tasks"),
      worktrees: () => ({ list: async () => { throw new Error("seam broke"); } }),
      diag,
    });
    const listed = await remote.list({ projectId: "uuid-1" });
    expect(listed).toHaveLength(1);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("键族清单失败"));
  });

  it("非快照操作面维持单键 keyOf（聚合不外溢写路径）：detail 主根键照常解析、族键不参与", async () => {
    const svc = buildService();
    seedTask(h, "alpha", "1", { status: "pending" });
    await addTask(h.verbDeps, { projectKey: WT_KEY, slug: "alpha", title: "WT", type: "coding-feature" });
    const remote = familyRemote(svc);
    // 快照族：两键卡片均可见
    const listed = await remote.list({ projectId: "uuid-1" });
    expect(listed).toHaveLength(2);
    // detail（单键 keyOf）：主根键行照常命中——族键合并未外溢到 row 面
    const detail = await remote.detail({ projectId: "uuid-1", taskId: "t-alpha-1" });
    expect(detail.taskId).toBe("t-alpha-1");
  });
});

// ── 生产形状回归钉（真机双层信封根因——双层不可再发，全部一元端点扩面）──

describe("生产形状双层不可再发（host 裸值 → serve 单层 → client 解得——九个一元端点全钉）", () => {
  /** 官方 gateway serve 层 ok 路径单层包（rpcFailure/ok 单层——gateway 实况复刻） */
  function serveWrap(value: unknown): { ok: true; value: unknown } {
    return { ok: true, value };
  }

  /** client envelopeOf 投影（plugins/task-loop ui/tasks-rpc.ts 失败分支同形） */
  function clientUnwrap(raw: unknown): unknown {
    if (raw === null || typeof raw !== "object" || !("ok" in raw)) {
      throw new Error("响应形状非法（期望 Result 信封）");
    }
    const result = raw as { ok: boolean; value?: unknown; error?: { code?: unknown; message?: unknown; details?: unknown } };
    if (result.ok) return result.value;
    throw new Error(`rpc failure: ${String(result.error?.code)}`);
  }

  /** host 端点返回值裸值钉（任一端点改回自返 Result 信封此处必红——双层不可再发） */
  function expectBareValue(name: string, value: unknown): void {
    expect(
      value === null || typeof value !== "object" || !("ok" in value),
      `端点 ${name} 不得自返 Result 信封（双层即真机形状回归根因）`,
    ).toBe(true);
    // serve 单层信封 → client 解得原值（单层、零内层 Result）
    expect(clientUnwrap(serveWrap(value)), `端点 ${name} wire 往返`).toEqual(value);
  }

  it("九个一元端点 host 裸值逐点钉（每端点一次真实调用，非单点 list 抽样）+ acSettlements 成功路径直接断言", async () => {
    const svc = buildService();
    const settled = await addTask(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      title: "T",
      type: "coding-feature",
      acceptanceCriteria: ["判据 A"],
    });
    await claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "s-submit", source: { slug: "alpha" } });
    await submitTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "alpha", localId: settled.localId },
      result: "success",
      summary: "收口",
      gate: { compile: true, fmt: true, lint: true, test: true },
      acceptanceCriteria: [{ criterion: "判据 A", met: true, evidence: "绿" }],
    });
    const pending = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "T2", type: "coding-feature" });
    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => svc, projects: () => projectsFaceOf("Z:\\ws\\domain-tasks") });
    const values: Record<string, unknown> = {
      list: await remote.list({ projectId: h.projectKey }),
      stats: await remote.stats({ projectId: h.projectKey }),
      graph: await remote.graph({ projectId: h.projectKey, source: { kind: "feature", slug: "alpha" } }),
      detail: await remote.detail({ projectId: h.projectKey, taskId: settled.taskId }),
      query: await remote.query({ projectId: h.projectKey, taskRef: { slug: "alpha", localId: settled.localId } }),
      sessionLinks: await remote.sessionLinks({ projectId: h.projectKey }),
      validateFeatureTasks: await remote.validateFeatureTasks({ projectId: h.projectKey, featureSlug: "alpha" }),
      transition: await remote.transition({ projectId: h.projectKey, taskId: pending.taskId, toStatus: "in_progress", reason: "r" }),
      acSettlements: await remote.acSettlements({ projectId: h.projectKey, criteria: ["判据 A"] }),
    };
    expect(Object.keys(values).sort()).toEqual([
      "acSettlements",
      "detail",
      "graph",
      "list",
      "query",
      "sessionLinks",
      "stats",
      "transition",
      "validateFeatureTasks",
    ]);
    for (const [name, value] of Object.entries(values)) expectBareValue(name, value);
    // acSettlements 成功路径直接断言（评审 K 缺口——聚合 DTO 形状，非仅失败路径）
    const aggregate = values.acSettlements as { matches: { criterion: string; met: boolean; evidence?: string }[]; unmatched: string[] };
    expect(aggregate.matches).toHaveLength(1);
    expect(aggregate.matches[0]).toMatchObject({ criterion: "判据 A", met: true, evidence: "绿" });
    expect(aggregate.unmatched).toEqual([]);
  });

  it("typed 失败过 wire：RemoteError → serve rpcFailure 折叠 {ok:false,error{code}} → client failure 分支承接", async () => {
    // failureOf 已钉官方 isDSHRemoteError 结构标记（typedFailure 退化 new Error 必红）
    const remote = new ForgeTasksRemote(fakeCtx(), {});
    const failure = await failureOf(() => remote.list({ projectId: "p" }));
    const wire = { ok: false, error: { code: failure.code, message: failure.message ?? "", details: {} } };
    expect(() => clientUnwrap(wire)).toThrow("rpc failure: ERR_FORGE_TASKS_UNAVAILABLE");
  });
});
