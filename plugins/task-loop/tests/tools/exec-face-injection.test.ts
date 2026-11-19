// fix-9（bug e7e6a3bc——a033636f 家族复发）：TaskToolExecFace 会话身份注入。
// 官方 ToolRunContext 携 agent.session.id（顶层无 sessionId 子面）——注册缝
// withSessionIdentity 把官方会话身份填入 exec.sessionId 顶层子面，dispatch_task /
// stop_task_loop 两环同修同验（family 共性：官方 ToolRunContext 面字段映射不完整）。
import { describe, expect, it } from "vitest";
import { createDispatchTaskTool } from "../../host/tools/dispatch-task.js";
import { createStopTaskLoopTool } from "../../host/tools/stop-task-loop.js";
import { withSessionIdentity } from "../../host/tools/faces.js";
import { registerToolFamily } from "../../host/index.js";
import type { LoopDriver } from "../../host/loop/driver-face.js";
import type { LoopRecord, LoopRegistry } from "../../host/loop/registry.js";
import type { TaskToolDefinition, TaskToolExecFace } from "../../host/tools/faces.js";

// ─────────────────────────── fake 面 ───────────────────────────

/** 官方 ToolRunContext fake（真形状子集：会话身份只在 agent.session.id） */
function officialExecOf(sessionId: string): TaskToolExecFace {
  return { agent: { session: { id: sessionId } } } as TaskToolExecFace;
}

function recordOf(o: { slug: string; ownerSessionId: string }): LoopRecord {
  return {
    id: "loop-1",
    source: { slug: o.slug },
    ownerSessionId: o.ownerSessionId,
    projectId: "pk",
    takeoverSessions: new Set<string>(),
  };
}

function fakeRegistry(record: LoopRecord | undefined): LoopRegistry {
  return {
    register: () => {},
    get: () => record,
    remove: () => {},
    bySlug: (slug: string) => (record !== undefined && record.source.slug === slug ? record : undefined),
    all: () => (record !== undefined ? [record] : []),
    byOwner: (owner: string) => (record !== undefined && record.ownerSessionId === owner ? record : undefined),
  };
}

function fakeDriver(overrides: Partial<Pick<LoopDriver, "start" | "stopLoop">> = {}): LoopDriver {
  return {
    start: async () => ({ ok: true as const, loopId: "loop-new" }),
    stop: async () => ({ ok: true as const, stopped: true as const, hadInFlight: false }),
    stopLoop: async () => ({ ok: true as const, stopped: true as const, hadInFlight: false }),
    pause: async () => ({ ok: true as const, paused: true as const, taskKey: "t" }),
    activeOf: () => undefined,
    activeAll: () => [],
    resume: () => ({ ok: true as const, loopId: "loop-1" }),
    dispose: () => {},
    ...overrides,
  } as unknown as LoopDriver;
}

// ─────────────────────────── withSessionIdentity 单元面 ───────────────────────────

describe("withSessionIdentity（官方 ToolRunContext → exec.sessionId 注入）", () => {
  it("dispatch_task：fake ToolRunContext 携 agent.session.id → driver.start 收到等值 ownerSessionId + agent 原样透传", async () => {
    const starts: unknown[] = [];
    const agent = officialExecOf("sess-9").agent;
    const driver = fakeDriver({ start: async (input) => { starts.push(input); return { ok: true as const, loopId: "loop-new" }; } });
    const raw = createDispatchTaskTool({
      verbDeps: {} as never,
      resolveProjectKey: () => "pk",
      loop: { driver, registry: fakeRegistry(undefined) },
    });
    const tool = withSessionIdentity(raw);
    const result = (await tool.execute({ slug: "alpha" }, officialExecOf("sess-9"))) as { kind: string };
    expect(result.kind).toBe("started");
    expect(starts).toEqual([{ source: { slug: "alpha" }, ownerSessionId: "sess-9", parent: agent, projectId: "pk" }]);
  });

  it("stop_task_loop：同构注入——byOwner 以注入后的 sessionId 解析（三轮同错形态复现钉住）", async () => {
    const stoppedWith: unknown[] = [];
    const record = recordOf({ slug: "alpha", ownerSessionId: "sess-9" });
    const driver = fakeDriver({
      stopLoop: async (input) => {
        stoppedWith.push(input);
        return { ok: true as const, stopped: true as const, hadInFlight: false };
      },
    });
    const tool = withSessionIdentity(createStopTaskLoopTool({ loop: { driver, registry: fakeRegistry(record) } }));
    const result = (await tool.execute({}, officialExecOf("sess-9"))) as { kind: string };
    expect(result.kind).toBe("stopped");
    expect(stoppedWith).toEqual([{ loopId: "loop-1", requesterSessionId: "sess-9" }]);
  });

  it("显式 exec.sessionId 在场 = 原值优先（注入不覆盖已有身份）", async () => {
    const starts: unknown[] = [];
    const driver = fakeDriver({ start: async (input) => { starts.push(input); return { ok: true as const, loopId: "loop-new" }; } });
    const tool = withSessionIdentity(createDispatchTaskTool({
      verbDeps: {} as never,
      resolveProjectKey: () => "pk",
      loop: { driver, registry: fakeRegistry(undefined) },
    }));
    await tool.execute({ slug: "alpha" }, { sessionId: "explicit-1", agent: { session: { id: "sess-9" } } });
    expect((starts[0] as { ownerSessionId: string }).ownerSessionId).toBe("explicit-1");
  });

  it("agent 无会话身份 = 零注入（缺席守卫语义不回归：仍自解释拒绝）", async () => {
    const tool = withSessionIdentity(createDispatchTaskTool({
      verbDeps: {} as never,
      resolveProjectKey: () => "pk",
      loop: { driver: fakeDriver(), registry: fakeRegistry(undefined) },
    }));
    await expect(tool.execute({ slug: "alpha" }, {})).rejects.toThrow(/no session identity/);
  });

  it("定义其余字段原样（name/render 透传——注册面契约不漂移）", () => {
    const raw: TaskToolDefinition = createStopTaskLoopTool({ loop: { driver: fakeDriver(), registry: fakeRegistry(undefined) } });
    const wrapped = withSessionIdentity(raw);
    expect(wrapped.name).toBe(raw.name);
    expect(wrapped.description).toBe(raw.description);
    expect(wrapped.parameters).toBe(raw.parameters);
    expect(wrapped.render).toBe(raw.render);
  });
});

// ─────────────────────────── 注册缝整链面 ───────────────────────────

describe("registerToolFamily（注册缝逐枚注入）", () => {
  it("官方缝注册的 14 员均带注入——dispatch_task 以 fake ToolRunContext 越过身份守卫（进入 projectKey 缝 typed 拒绝）", () => {
    const registered: TaskToolDefinition[] = [];
    const services = { db: { db: {} }, events: {}, tasks: {}, checkpoints: {} } as never;
    const ctx = {
      tools: { register: (definition: unknown) => { registered.push(definition as TaskToolDefinition); return () => {}; } },
    };
    const family = registerToolFamily(ctx, services, () => {});
    expect(registered.length).toBe(14);
    const dispatch = registered.find((t) => t.name === "dispatch_task");
    expect(dispatch).toBeDefined();
    family.dispose();
    // 无 cwd 的官方 fake exec：身份守卫已过 → WorkspaceNotRegisteredError（projectKey 缝），
    // 非「no session identity」守卫拒绝——注入在注册缝生效的直接判据
    const err = dispatch!.execute({ slug: "alpha" }, officialExecOf("sess-9")).then(
      () => "no-error",
      (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)),
    );
    return expect(err).resolves.not.toMatch(/no session identity/);
  });
});
