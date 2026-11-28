// 循环进度 append 面生产装配回归（bug 92069965——装配漏接家族第八例）：
// LoopDriverDeps.progress 声明为可选缝、driver.emitProgress 经 loop.deps.progress?.append 可选链
// 消费，但 tool-family 生产装配自 76224990（派发内核自 plugin-forge 直迁）起从未注入——
// 循环进度事件零发射、chatview 进度卡恒不渲染，而 fail-soft 设计使其 13 天无任何信号。
// 两条用例均走正式装配入口（assembleTaskLoopServices + assembleTaskLoopToolFamily），不手工
// 注入被测缝：装配注入行被删 → progress 缺席 → 本断言红。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assembleTaskLoopServices } from "../../host/assembly/default-assembly.js";
import { assembleTaskLoopToolFamily } from "../../host/assembly/tool-family.js";
import type { ProgressAppendFace } from "../../host/progress/index.js";

/** createLoopDriver 生产 deps 捕获（装配注入断言面——漏接即 undefined） */
const driverDepsCapture = vi.hoisted(() => ({ deps: undefined as { progress?: ProgressAppendFace } | undefined }));
vi.mock("../../host/loop/driver.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../host/loop/driver.js")>();
  return {
    ...mod,
    createLoopDriver: (deps: Parameters<typeof mod.createLoopDriver>[0]) => {
      driverDepsCapture.deps = deps as unknown as { progress?: ProgressAppendFace };
      return mod.createLoopDriver(deps);
    },
  };
});

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 有 agents 注册表的 ctx（reflect.get('agents') 正门——adaptSessionProgressAppend 的唯一输入） */
function ctxWithAgents(agents: { get(id: string): unknown }): Record<string, unknown> {
  return { emit: () => {}, reflect: { get: (name: string) => (name === "agents" ? agents : undefined) } };
}

describe("循环进度 append 面生产装配（bug 92069965——装配漏接回归锚）", () => {
  it("agents 注册表在场时，正式装配入口组装的循环内核依赖携带 progress append 面", () => {
    const home = mkdtempSync(join(tmpdir(), "task-loop-progress-asm-"));
    dirs.push(home);
    const services = assembleTaskLoopServices({ home, dbFile: ":memory:" })!;
    const agents = { get: (_id: string) => undefined };
    const family = assembleTaskLoopToolFamily({ services, ctx: ctxWithAgents(agents), diag: () => {} });
    try {
      // 装配锚：注入行被删 → progress 缺席（可选缝零配置降级形态）→ 本断言红。
      // 不变量：agents 在场而 progress 漏接 = 「可观测性面自己不可观测」——禁止。
      expect(driverDepsCapture.deps?.progress).not.toBeUndefined();
      expect(typeof driverDepsCapture.deps!.progress!.append).toBe("function");
    } finally {
      family.disposeLoop();
      services.dispose();
    }
  });

  it("经 append 面：事件落进 owner 会话（agents.get → session.append('forge/progress')）", () => {
    const home = mkdtempSync(join(tmpdir(), "task-loop-progress-asm-"));
    dirs.push(home);
    const services = assembleTaskLoopServices({ home, dbFile: ":memory:" })!;
    const appended: { type: string; data: unknown }[] = [];
    const agents = {
      get: (id: string) => (id === "owner-1" ? { session: { append: (type: string, data: unknown) => appended.push({ type, data }) } } : undefined),
    };
    const family = assembleTaskLoopToolFamily({ services, ctx: ctxWithAgents(agents), diag: () => {} });
    try {
      const progress = driverDepsCapture.deps!.progress;
      expect(progress).not.toBeUndefined();
      progress!.append("owner-1", {
        sourceSlug: "alpha",
        verb: "claim",
        status: "running",
        taskKey: "alpha/1",
        at: Date.now(),
      });
      expect(appended).toHaveLength(1);
      expect(appended[0]!.type).toBe("forge/progress");
      expect(appended[0]!.data).toMatchObject({ sourceSlug: "alpha", verb: "claim", status: "running", taskKey: "alpha/1" });
      // 无活根会话（agents.get → undefined）= fail-soft 零抛零发射（append 面既有语义，非本修复改动）
      expect(() => progress!.append("gone", { sourceSlug: "alpha", verb: "loop", status: "running", at: Date.now() })).not.toThrow();
      expect(appended).toHaveLength(1);
    } finally {
      family.disposeLoop();
      services.dispose();
    }
  });

  it("agents 注册表缺席时 progress 面合法缺席（adaptSessionProgressAppend(undefined) = undefined——fail-soft 降级形态保留）", () => {
    const home = mkdtempSync(join(tmpdir(), "task-loop-progress-asm-"));
    dirs.push(home);
    const services = assembleTaskLoopServices({ home, dbFile: ":memory:" })!;
    const family = assembleTaskLoopToolFamily({ services, ctx: { emit: () => {} }, diag: () => {} });
    try {
      expect(driverDepsCapture.deps?.progress).toBeUndefined();
    } finally {
      family.disposeLoop();
      services.dispose();
    }
  });
});
