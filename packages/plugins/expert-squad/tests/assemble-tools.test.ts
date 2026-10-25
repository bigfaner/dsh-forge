// fix-10 工具面接线结构断言（bug cac32a53：registerExpertTools / registerDelegateExpertTool
// 未接入 apply 装配缝）：修复前必失败——apply 装配后 tools face 应恰收到 6 枚工具注册
// （5 管理 + delegate_expert，D1 注册面零改动）；组合绑定 excludeTools 装配期排除
// （HR 组合零委派可见面，1.46 核销裁定——官方 tools.restrict 不适用 preset 局部注册
// 工具，见 src/index.ts 文件头 ④）；tools 面缺席 fail-soft 不崩。

import { afterEach, describe, expect, it, vi } from "vitest";
import expertSquadPlugin from "../src/index.js";
import { EXPERT_TOOLS } from "../src/tools.js";
import { DELEGATE_EXPERT_TOOL_NAME } from "../src/dispatch/dispatch.js";

/** 捕获注册调用的 tools face 替身（官方 ToolRuntime.register 结构兼容）。 */
function makeToolsFace() {
  const registered: string[] = [];
  return {
    face: {
      register: (definition: { name: string }) => {
        registered.push(definition.name);
        return () => undefined;
      },
    },
    registered,
  };
}

/** 宿主 ctx 替身：reflect.get 供可选服务（storage 缺席 = 内存态降级路径）。 */
function makeCtx(tools: unknown, subagents: unknown = undefined) {
  const effects: unknown[] = [];
  return {
    ctx: {
      connection: {
        fetch: { register: (): unknown => undefined },
      },
      reflect: {
        get(name: string) {
          if (name === "tools") return tools;
          if (name === "subagents") return subagents;
          return undefined;
        },
      },
      effect(dispose: () => unknown): unknown {
        effects.push(dispose);
        return undefined;
      },
    },
    effects,
  };
}

const SUBAGENTS = { startContinuable: async () => ({ childId: "c", messageId: "m" }) };

// 热刷新接线后每次 boot 会注册真实 watcher（registryFor(process.cwd())）——afterEach
// 统一 disposer 回收，避免遍历成本跨用例外溢。
let pendingEffects: Array<() => unknown> = [];

afterEach(async () => {
  // cordis effect 契约：effect(cb) 的 cb() 返回值才是 disposer。
  for (const effect of pendingEffects) {
    const dispose = effect();
    if (typeof dispose === "function") await dispose();
  }
  pendingEffects = [];
});

describe("fix-10: 工具面接线（apply 装配缝）", { timeout: 20_000 }, () => {
  it("apply 后 tools face 恰收 6 枚工具注册：5 管理工具 + delegate_expert（D1 注册面零改动）", async () => {
    const { face, registered } = makeToolsFace();
    const { ctx, effects } = makeCtx(face, SUBAGENTS);
    pendingEffects = effects as Array<() => unknown>;
    await expertSquadPlugin(ctx);
    expect([...registered].sort()).toEqual([...EXPERT_TOOLS, DELEGATE_EXPERT_TOOL_NAME].sort());
  });

  it("组合绑定 excludeTools 装配期排除 delegate_expert（HR 组合零委派可见面；管理 5 工具照常）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { face, registered } = makeToolsFace();
      const { ctx, effects } = makeCtx(face, SUBAGENTS);
      pendingEffects = effects as Array<() => unknown>;
      await expertSquadPlugin(ctx, { excludeTools: [DELEGATE_EXPERT_TOOL_NAME] });
      expect([...registered].sort()).toEqual([...EXPERT_TOOLS].sort());
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("excludeTools 排除 delegate_expert"));
    } finally {
      warn.mockRestore();
    }
  });

  it("未配置 excludeTools = 全量注册零排除（D1 全局语义不变）", async () => {
    const { face, registered } = makeToolsFace();
    const { ctx, effects } = makeCtx(face, SUBAGENTS);
    pendingEffects = effects as Array<() => unknown>;
    await expertSquadPlugin(ctx);
    expect([...registered].sort()).toEqual([...EXPERT_TOOLS, DELEGATE_EXPERT_TOOL_NAME].sort());
  });

  it("tools 面缺席 fail-soft：warn + 跳过 tool 注册，路由族照常装配", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { ctx, effects } = makeCtx(undefined, SUBAGENTS);
      pendingEffects = effects as Array<() => unknown>;
      await expect(expertSquadPlugin(ctx)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("ctx.tools absent"));
    } finally {
      warn.mockRestore();
    }
  });

  it("subagents 面缺席 fail-soft：delegate_expert 跳过，管理 5 工具照常注册", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { face, registered } = makeToolsFace();
      const { ctx, effects } = makeCtx(face, undefined);
      pendingEffects = effects as Array<() => unknown>;
      await expertSquadPlugin(ctx);
      expect(registered).toEqual([...EXPERT_TOOLS]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("ctx.subagents absent"));
    } finally {
      warn.mockRestore();
    }
  });
});
