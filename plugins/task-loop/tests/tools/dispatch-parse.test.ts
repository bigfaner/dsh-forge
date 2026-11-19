// dispatch_task / stop_task_loop 参数收窄与守卫路径测试（plugin-task-loop 1.11——
// slug 必填、resume 布尔、挂起冻结 resume-not-requested 路径；driver/registry 用 fake）。
import { describe, expect, it } from "vitest";
import { createDispatchTaskTool, parseDispatchTaskArgs } from "../../host/tools/dispatch-task.js";
import { parseStopTaskLoopArgs } from "../../host/tools/stop-task-loop.js";
import { createStopTaskLoopTool } from "../../host/tools/stop-task-loop.js";
import type { LoopDriver } from "../../host/loop/driver-face.js";
import type { LoopRecord, LoopRegistry } from "../../host/loop/registry.js";
import type { TaskToolExecFace } from "../../host/tools/faces.js";

describe("parseDispatchTaskArgs（slug 必填 + resume 布尔）", () => {
  it("slug+resume 全量收窄", () => {
    expect(parseDispatchTaskArgs({ slug: "alpha", resume: true })).toEqual({ slug: "alpha", resume: true });
    expect(parseDispatchTaskArgs({ slug: "alpha" })).toEqual({ slug: "alpha" });
  });

  it("slug 缺失/空串/非字符串 = 拒绝", () => {
    expect(() => parseDispatchTaskArgs({})).toThrow(/slug is required/);
    expect(() => parseDispatchTaskArgs({ slug: "" })).toThrow(/slug is required/);
    expect(() => parseDispatchTaskArgs({ slug: 42 })).toThrow(/slug is required/);
    expect(() => parseDispatchTaskArgs(null)).toThrow(/arguments must be an object/);
  });

  it("source_kind/source_slug 退役键零效应（slug 缺席仍拒——slug 化收口）", () => {
    expect(() => parseDispatchTaskArgs({ source_kind: "feature", source_slug: "alpha" })).toThrow(/slug is required/);
  });

  it("resume 非布尔 = 忽略（undefined）", () => {
    expect(parseDispatchTaskArgs({ slug: "alpha", resume: "yes" })).toEqual({ slug: "alpha" });
  });
});

describe("parseStopTaskLoopArgs（slug 可选）", () => {
  it("缺席 = {}（停本会话循环）；有值收窄；空串拒绝", () => {
    expect(parseStopTaskLoopArgs({})).toEqual({});
    expect(parseStopTaskLoopArgs({ slug: "alpha" })).toEqual({ slug: "alpha" });
    expect(() => parseStopTaskLoopArgs({ slug: "" })).toThrow(/non-empty/);
  });
});

// ─────────────────────────── fake 面 ───────────────────────────

function recordOf(o: { slug: string; ownerSessionId: string; suspended?: boolean }): LoopRecord {
  return {
    id: "loop-1",
    source: { slug: o.slug },
    ownerSessionId: o.ownerSessionId,
    projectId: "pk",
    ...(o.suspended === true
      ? {
          suspended: {
            escalation: {
              kind: "rate-limit" as const,
              ownerSessionId: o.ownerSessionId,
              source: { slug: o.slug },
              taskKey: `${o.slug}/1.1`,
              reason: "限流",
            },
            since: 0,
          },
        }
      : {}),
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

function fakeDriver(overrides: Partial<Pick<LoopDriver, "resume" | "start" | "stopLoop">> = {}): LoopDriver {
  return {
    start: async () => ({ ok: true, loopId: "loop-new" }),
    stop: async () => ({ ok: true, stopped: true, hadInFlight: false }),
    stopLoop: async () => ({ ok: true, stopped: true, hadInFlight: false }),
    pause: async () => ({ ok: true, paused: true, taskKey: "t" }),
    activeOf: () => undefined,
    activeAll: () => [],
    resume: () => ({ ok: true, loopId: "loop-1" }),
    dispose: () => {},
    ...overrides,
  } as unknown as LoopDriver;
}

function toolDeps(registry: LoopRegistry, driver: LoopDriver) {
  return {
    verbDeps: {} as never,
    resolveProjectKey: () => "pk",
    loop: { driver, registry },
  };
}

const execOf = (sessionId: string): TaskToolExecFace => ({ sessionId });

describe("dispatch_task 挂起冻结守卫（fake driver/registry）", () => {
  it("挂起 + 未携 resume → resume-not-requested、循环保持挂起、driver.resume 零调用", async () => {
    let resumeCalls = 0;
    const record = recordOf({ slug: "alpha", ownerSessionId: "other", suspended: true });
    const tool = createDispatchTaskTool(
      toolDeps(fakeRegistry(record), fakeDriver({ resume: () => { resumeCalls += 1; return { ok: false, code: "not-suspended" as const }; } })),
    );
    const result = (await tool.execute({ slug: "alpha" }, execOf("me"))) as { resumeRejectedCode?: string; resumed: boolean; takenOver: boolean };
    expect(result.resumeRejectedCode).toBe("resume-not-requested");
    expect(result.resumed).toBe(false);
    expect(resumeCalls).toBe(0);
    // 非 owner 首触 = 接管集写点
    expect(result.takenOver).toBe(true);
    expect(record.takeoverSessions.has("me")).toBe(true);
    expect(record.suspended).toBeDefined(); // 冻结：挂起态未被清除
  });

  it("挂起 + resume:true → 幂等续接（resumed=true）", async () => {
    const record = recordOf({ slug: "alpha", ownerSessionId: "me", suspended: true });
    const tool = createDispatchTaskTool(toolDeps(fakeRegistry(record), fakeDriver()));
    const result = (await tool.execute({ slug: "alpha", resume: true }, execOf("me"))) as { resumed: boolean; takenOver: boolean };
    expect(result.resumed).toBe(true);
    expect(result.takenOver).toBe(false);
  });

  it("owner 运行中重调 = running 状态摘要（非拒绝）", async () => {
    const record = recordOf({ slug: "alpha", ownerSessionId: "me" });
    const tool = createDispatchTaskTool(toolDeps(fakeRegistry(record), fakeDriver()));
    const result = (await tool.execute({ slug: "alpha" }, execOf("me"))) as { kind: string };
    expect(result.kind).toBe("running");
  });

  it("他人运行中循环 = 守卫拒绝（自解释 + 指引）", async () => {
    const record = recordOf({ slug: "alpha", ownerSessionId: "other" });
    const tool = createDispatchTaskTool(toolDeps(fakeRegistry(record), fakeDriver()));
    await expect(tool.execute({ slug: "alpha" }, execOf("me"))).rejects.toThrow(/owned by an active dispatch loop/);
  });

  it("无登记 → driver.start（started）；sessionId 缺席 = 自解释拒绝", async () => {
    const starts: unknown[] = [];
    const driver = fakeDriver({ start: async (input) => { starts.push(input); return { ok: true as const, loopId: "loop-new" }; } });
    const tool = createDispatchTaskTool(toolDeps(fakeRegistry(undefined), driver));
    const result = (await tool.execute({ slug: "alpha" }, execOf("me"))) as { kind: string; slug: string };
    expect(result.kind).toBe("started");
    expect(result.slug).toBe("alpha");
    await expect(tool.execute({ slug: "alpha" }, {})).rejects.toThrow(/no session identity/);
  });
});

describe("stop_task_loop 守卫路径（fake driver/registry）", () => {
  it("挂起循环任意会话可停（driver.stopLoop 转发）", async () => {
    const record = recordOf({ slug: "alpha", ownerSessionId: "other", suspended: true });
    const stoppedWith: unknown[] = [];
    const driver = fakeDriver({
      stopLoop: async (input) => {
        stoppedWith.push(input);
        return { ok: true as const, stopped: true as const, hadInFlight: false };
      },
    });
    const tool = createStopTaskLoopTool({ loop: { driver, registry: fakeRegistry(record) } });
    const result = (await tool.execute({ slug: "alpha" }, execOf("me"))) as { kind: string; slug: string };
    expect(result).toEqual({ kind: "stopped", slug: "alpha", hadInFlight: false });
    expect(stoppedWith).toEqual([{ loopId: "loop-1", requesterSessionId: "me" }]);
  });

  it("运行中非 owner = 越权拒绝（点名归属会话）", async () => {
    const record = recordOf({ slug: "alpha", ownerSessionId: "other" });
    const driver = fakeDriver({
      stopLoop: async () => ({ ok: false as const, code: "forbidden" as const, suspended: false, ownerSessionId: "other" }),
    });
    const tool = createStopTaskLoopTool({ loop: { driver, registry: fakeRegistry(record) } });
    await expect(tool.execute({ slug: "alpha" }, execOf("me"))).rejects.toThrow(/RUNNING and owned by session other/);
  });

  it("无活循环 = 自解释拒绝（含启动入口）", async () => {
    const tool = createStopTaskLoopTool({ loop: { driver: fakeDriver(), registry: fakeRegistry(undefined) } });
    await expect(tool.execute({}, execOf("me"))).rejects.toThrow(/no active dispatch loop/);
    await expect(tool.execute({ slug: "alpha" }, execOf("me"))).rejects.toThrow(/no active dispatch loop for alpha/);
  });

  it("sessionId 缺席 = 自解释拒绝", async () => {
    const record = recordOf({ slug: "alpha", ownerSessionId: "me" });
    const tool = createStopTaskLoopTool({ loop: { driver: fakeDriver(), registry: fakeRegistry(record) } });
    await expect(tool.execute({}, {})).rejects.toThrow(/no session identity/);
  });
});
