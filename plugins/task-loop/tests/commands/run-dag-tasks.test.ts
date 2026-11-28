// /run-dag-tasks 指令壳测试（plugin-task-loop 1.11——nonTerminalSourcesOf slug 形态、
// /stop-dag-tasks no-op 文本、startWithSlug 零命中错误回执；driver/ask 用 fake）。
import { describe, expect, it } from "vitest";
import { createRunDagTasksHandler, nonTerminalSourcesOf } from "../../host/commands/run-dag-tasks.js";
import { createStopDagTasksHandler, NO_ACTIVE_LOOP_TEXT } from "../../host/commands/stop-dag-tasks.js";
import type { LoopDriver } from "../../host/loop/driver-face.js";
import type { TaskCard } from "@dsh-forge/lib-api/dto/forge";
import type { TaskStatus } from "@dsh-forge/lib-api/labels";

// ─────────────────────────── fake 面 ───────────────────────────

function cardOf(slug: string, taskStatus: TaskStatus, localId = "1.1"): TaskCard {
  return {
    taskId: `${slug}-${localId}`,
    slug,
    localId,
    title: `${slug} ${localId}`,
    taskType: "coding-feature",
    taskStatus,
    prerequisites: [],
    sessionCount: 0,
    containerSlug: slug,
  };
}

function fakeDriver(overrides: Partial<Pick<LoopDriver, "start" | "stop" | "activeOf" | "activeAll">> = {}): LoopDriver {
  return {
    start: async () => ({ ok: true, loopId: "loop-new" }),
    stop: async () => ({ ok: true, stopped: true, hadInFlight: false }),
    stopLoop: async () => ({ ok: true, stopped: true, hadInFlight: false }),
    pause: async () => ({ ok: true, paused: true, taskKey: "t" }),
    activeOf: () => undefined,
    activeAll: () => [],
    resume: () => ({ ok: true, loopId: "loop-new" }),
    dispose: () => {},
    ...overrides,
  } as unknown as LoopDriver;
}

const invocationOf = (rawInput = ""): { agent: unknown; rawInput: string } => ({
  // 新会话鸭子面（判定面缺席 = 恒新会话）+ followup 面（单行提交 = 会话物化判据）
  agent: { session: { id: "sess-1", cwd: "Z:\\ws\\x" }, followup: () => {} },
  rawInput,
});

function depsOf(cards: readonly TaskCard[], driver: LoopDriver, ask?: unknown) {
  return {
    driver,
    tasks: { listTasks: async () => cards },
    resolveProjectKey: () => "pk",
    ...(ask !== undefined ? { ask } : {}),
  };
}

describe("nonTerminalSourcesOf（slug 形态）", () => {
  it("按 containerSlug 分组、终态行不计、描述零 kind 措辞", () => {
    const candidates = nonTerminalSourcesOf([
      cardOf("alpha", "pending"),
      cardOf("alpha", "in_progress", "1.2"),
      cardOf("alpha", "completed", "1.3"),
      cardOf("beta", "blocked"),
    ]);
    expect(candidates.map((c) => c.source)).toEqual([{ slug: "alpha" }, { slug: "beta" }]);
    expect(candidates[0]?.label).toBe("alpha");
    expect(candidates[0]?.description).not.toMatch(/feature|提案/);
    expect(candidates[0]?.description).toContain("未完成 2");
    expect(candidates[0]?.description).toContain("进行中 1");
  });

  it("全终态源零候选", () => {
    expect(nonTerminalSourcesOf([cardOf("alpha", "completed"), cardOf("alpha", "skipped", "1.2")])).toHaveLength(0);
  });
});

describe("/stop-dag-tasks handler", () => {
  it("本会话无活循环 = no-op 文本（零归属）", async () => {
    const handler = createStopDagTasksHandler({ driver: fakeDriver({ stop: async () => ({ ok: false as const, code: "no-active-loop" as const }) }) });
    const result = await handler(invocationOf());
    expect(result).toEqual({ kind: "success", text: NO_ACTIVE_LOOP_TEXT });
  });

  it("停止成功 = slug 回执", async () => {
    const record = {
      id: "loop-1",
      source: { slug: "alpha" },
      ownerSessionId: "sess-1",
      projectId: "pk",
      takeoverSessions: new Set<string>(),
    };
    const handler = createStopDagTasksHandler({
      driver: fakeDriver({ activeOf: () => record, stop: async () => ({ ok: true as const, stopped: true as const, hadInFlight: false }) }),
    });
    const result = await handler(invocationOf());
    expect(result.kind).toBe("success");
    expect(result.text).toContain("容器 alpha");
  });
});

describe("/run-dag-tasks handler", () => {
  it("startWithSlug 零命中 = 错误回执 + 无参指引", async () => {
    const handler = createRunDagTasksHandler(depsOf([cardOf("alpha", "completed")], fakeDriver()));
    const result = await handler(invocationOf("gamma"));
    expect(result).toEqual({ kind: "error", text: expect.stringContaining("没有找到任务源 gamma") });
  });

  it("带参直通精确命中 → driver.start（slug 单轨）", async () => {
    const starts: unknown[] = [];
    const handler = createRunDagTasksHandler(
      depsOf([cardOf("alpha", "pending")], fakeDriver({ start: async (input) => { starts.push(input); return { ok: true as const, loopId: "loop-new" }; } })),
    );
    const result = await handler(invocationOf("alpha"));
    expect(result).toEqual({ kind: "success", text: "任务源 alpha 的派发循环已启动" });
    expect(starts).toHaveLength(1);
  });

  it("同源被其它会话占用 = 占用回执（零重复派发）", async () => {
    const record = {
      id: "loop-x",
      source: { slug: "alpha" },
      ownerSessionId: "other",
      projectId: "pk",
      takeoverSessions: new Set<string>(),
    };
    const handler = createRunDagTasksHandler(depsOf([cardOf("alpha", "pending")], fakeDriver({ activeAll: () => [record] })));
    const result = await handler(invocationOf("alpha"));
    expect(result.kind).toBe("success");
    expect(result.text).toContain("已由其它会话运行");
  });

  it("ask 故障 = error 回执不静默（非活根径）", async () => {
    const handler = createRunDagTasksHandler(
      depsOf([cardOf("alpha", "pending"), cardOf("beta", "pending")], fakeDriver(), {
        ask: async () => {
          throw new Error("NO_PROVIDER");
        },
      }),
    );
    const result = await handler(invocationOf("a"));
    expect(result.kind).toBe("error");
    expect(result.text).toContain("问询通道故障");
  });
});
