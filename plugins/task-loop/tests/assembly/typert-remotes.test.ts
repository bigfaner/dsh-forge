// forgeTasks Typert Remote 单测：① marker 端点表 pin（remoteMethods 快照 = gateway SRC
// 发现面的端点真源——namespace/method/exportName/mode 逐位断言）；② SRC 形参名单源 pin
// （wire 名 = JS 形参名）；③ 快照方法族 DTO 聚合（AC 进度批水化零 N+1 形态断言）；
// ④ follow baseline+增量快照钩（abort 出循环）；⑤ 注册装配（根 ctx plugin 捕获 + inject
// 生命周期绑 + 缺席降级 + 诊断留痕）；⑥ typed unavailable 诚实拒绝。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { remoteMethods } from "@deepseek-ai/dsh-typert-protocol";
import { Context } from "@deepseek-ai/cordis";
import { addTask } from "../../host/domain/tasks/add.js";
import { claimTask } from "../../host/domain/tasks/claim.js";
import { submitTask } from "../../host/domain/tasks/submit.js";
import { createTasksService, type TasksService } from "../../host/domain/tasks/service.js";
import { createSettlementRepo } from "../../host/db/repositories/settlement-repo.js";
import {
  ForgeTasksRemote,
  TASKS_FOLLOW_INTERVAL_MS,
  registerForgeTasksRemote,
  unavailableMessage,
  type TasksServiceFace,
  type TypertAssemblyCtxFace,
} from "../../host/assembly/typert-remotes.js";
import { createTasksHarness, seedTask, type TasksHarness } from "../domain-tasks/harness.js";

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

describe("端点面 pin（gateway SRC 端点真源）", () => {
  it("forgeTasks 九端点——八读/写面键名沿用 ForgeTasksRpc 清单 + follow mode:stream", () => {
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

    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => svc });
    const result = await remote.list({ projectKey: h.projectKey });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cards = result.value;
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
    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => svc });
    const result = await remote.graph({ projectKey: h.projectKey, slug: "alpha" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tasks[0]?.acProgress).toEqual({ done: 1, total: 1 });
    expect(result.value.edges).toEqual([]);
  });

  it("stats/query/sessionLinks：域读面原样透传（ok 分支携值）", async () => {
    const svc = buildService();
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "T", type: "coding-feature" });
    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => svc });
    const stats = await remote.stats({ projectKey: h.projectKey });
    expect(stats.ok).toBe(true);
    if (!stats.ok) return;
    expect(stats.value.total).toBe(1);
    expect(stats.value.byStatus.pending).toBe(1);
    expect(stats.value.unmetPending).toBe(0);
    const query = await remote.query({ projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId } });
    expect(query.ok && query.value.container).toEqual({ slug: "alpha" });
  });
});

describe("typed unavailable 与 follow 快照钩", () => {
  it("族服务缺席 → Result error 诚实拒绝（message 钉 unavailableMessage 单源）", async () => {
    const remote = new ForgeTasksRemote(fakeCtx(), {});
    for (const [name, run] of [
      ["list", () => remote.list({ projectKey: "p" })],
      ["stats", () => remote.stats({ projectKey: "p" })],
      ["graph", () => remote.graph({ projectKey: "p", slug: "alpha" })],
      ["detail", () => remote.detail({ projectKey: "p", taskId: "t-1" })],
      ["query", () => remote.query({ projectKey: "p", taskRef: { slug: "alpha", localId: "1" } })],
      ["sessionLinks", () => remote.sessionLinks({ projectKey: "p" })],
      ["validateFeatureTasks", () => remote.validateFeatureTasks({ projectKey: "p", slug: "alpha" })],
      ["transition", () => remote.transition({ projectKey: "p", taskId: "t-1", toStatus: "completed", reason: "r" })],
    ] as const) {
      const result = await run();
      expect(result.ok, name).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("ERR_FORGE_TASKS_UNAVAILABLE");
        expect(result.error.message).toBe(unavailableMessage(name));
      }
    }
  });

  it("follow：族服务缺席 → 流启动即 typed unavailable（gateway 折叠 RemoteFailure）", async () => {
    const remote = new ForgeTasksRemote(fakeCtx(), {});
    await expect(async () => {
      for await (const _frame of remote.follow({ projectKey: "p" })) void _frame;
    }).rejects.toThrow(unavailableMessage("*"));
  });

  it("follow：首帧 baseline（seq=0）+ 快照变化才逐帧增量（seq 单调）+ abort 出循环", async () => {
    const svc = buildService();
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "T", type: "coding-feature" });
    const remote = new ForgeTasksRemote(fakeCtx(), { tasks: () => svc, followIntervalMs: 0 });
    const frames: number[] = [];
    const controller = new AbortController();
    for await (const frame of remote.follow({ projectKey: h.projectKey }, controller.signal)) {
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
    root: undefined,
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
    const remote = new ForgeTasksRemote(new Context(), { tasks: () => svc });
    const result = await remote.list({ projectKey: h.projectKey });
    expect(result.ok).toBe(true);
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
      expect(probe).toHaveBeenCalledWith("forgeTasks", "list", { projectKey: "" });
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
