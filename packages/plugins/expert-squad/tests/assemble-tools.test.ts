// fix-10 工具面接线结构断言（bug cac32a53：registerExpertTools / registerDelegateExpertTool
// 未接入 apply 装配缝）：修复前必失败——apply 装配后 tools face 应恰收到 6 枚工具注册
// （5 管理 + delegate_expert，D1 注册面零改动）；HR 组合委派排除走 denyTools 守卫微件态
// （方案 B，fix-20——scoped apply 内官方 tools.restrict({deny})，excludeTools 已废）；
// tools 面缺席 fail-soft 不崩。

import { afterEach, describe, expect, it, vi } from "vitest";
import expertSquadPlugin from "../src/index.js";
import { EXPERT_TOOLS } from "../src/tools.js";
import { DELEGATE_EXPERT_TOOL_NAME } from "../src/dispatch/dispatch.js";

/** 捕获注册调用的 tools face 替身（官方 ToolRuntime.register 结构兼容）。 */
function makeToolsFace() {
  const registered: string[] = [];
  const restrictions: Array<{ deny?: readonly string[] }> = [];
  return {
    face: {
      register: (definition: { name: string }) => {
        registered.push(definition.name);
        return () => undefined;
      },
      // 官方 ToolRuntime.restrict 同型（方案 B 守卫微件缝——scoped apply 内 deny）。
      restrict: (filter: { deny?: readonly string[] }) => {
        restrictions.push(filter);
        return () => undefined;
      },
    },
    registered,
    restrictions,
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

  it("denyTools 守卫态：scoped apply 内 restrict({deny}) 命名全局委派工具，零功能面注册（方案 B 守卫微件，fix-20）", async () => {
    const { face, registered, restrictions } = makeToolsFace();
    const { ctx, effects } = makeCtx(face, SUBAGENTS);
    pendingEffects = effects as Array<() => unknown>;
    const fetchRegister = vi.spyOn(ctx.connection.fetch, "register");
    await expertSquadPlugin(ctx, { denyTools: [DELEGATE_EXPERT_TOOL_NAME] });
    // 守卫态单缝：仅 restrict deny，零工具注册、零路由注册（单例面零冲突——AC1）。
    expect(restrictions).toEqual([{ deny: [DELEGATE_EXPERT_TOOL_NAME] }]);
    expect(registered).toEqual([]);
    expect(fetchRegister).not.toHaveBeenCalled();
  });

  it("denyTools 守卫态 restrict 抛错 fail-soft：warn 不拖垮 preset mount（ac2 清理后预设健壮性）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      makeToolsFace();
      const { ctx, effects } = makeCtx(
        {
          restrict: () => {
            throw new Error("names unknown global tool");
          },
          register: () => () => undefined,
        },
        SUBAGENTS,
      );
      pendingEffects = effects as Array<() => unknown>;
      await expect(expertSquadPlugin(ctx, { denyTools: [DELEGATE_EXPERT_TOOL_NAME] })).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("restrict deny 失败"));
    } finally {
      warn.mockRestore();
    }
  });

  it("未配置 denyTools = 全量注册零排除（D1 全局语义不变）", async () => {
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
