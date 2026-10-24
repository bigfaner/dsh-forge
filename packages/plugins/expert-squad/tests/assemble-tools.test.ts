// fix-10 工具面接线结构断言（bug cac32a53：registerExpertTools / registerDelegateExpertTool
// 未接入 apply 装配缝）：修复前必失败——apply 装配后 tools face 应恰收到 6 枚工具注册
// （5 管理 + delegate_expert，D1 注册面零改动）；preset 绑定 restrictTools 透传官方
// scoped tools.restrict（HR 组合 deny delegate_expert）；tools 面缺席 fail-soft 不崩。

import { describe, expect, it, vi } from "vitest";
import expertSquadPlugin from "../src/index.js";
import { EXPERT_TOOLS } from "../src/tools.js";
import { DELEGATE_EXPERT_TOOL_NAME } from "../src/dispatch/dispatch.js";

/** 捕获注册/限制调用的 tools face 替身（官方 ToolRuntime.register/restrict 结构兼容）。 */
function makeToolsFace() {
  const registered: string[] = [];
  const restricts: unknown[] = [];
  const restrict = vi.fn((filter: unknown) => {
    restricts.push(filter);
    return () => undefined;
  });
  return {
    face: {
      register: (definition: { name: string }) => {
        registered.push(definition.name);
        return () => undefined;
      },
      restrict,
    },
    registered,
    restricts,
    restrict,
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

describe("fix-10: 工具面接线（apply 装配缝）", () => {
  it("apply 后 tools face 恰收 6 枚工具注册：5 管理工具 + delegate_expert（D1 注册面零改动）", async () => {
    const { face, registered } = makeToolsFace();
    const { ctx } = makeCtx(face, SUBAGENTS);
    await expertSquadPlugin(ctx);
    expect([...registered].sort()).toEqual([...EXPERT_TOOLS, DELEGATE_EXPERT_TOOL_NAME].sort());
  });

  it("preset 绑定 restrictTools 透传官方 scoped tools.restrict（HR 组合 deny delegate_expert）", async () => {
    const { face, restrict, restricts } = makeToolsFace();
    const { ctx } = makeCtx(face, SUBAGENTS);
    await expertSquadPlugin(ctx, { restrictTools: { deny: [DELEGATE_EXPERT_TOOL_NAME] } });
    expect(restrict).toHaveBeenCalledTimes(1);
    expect(restricts[0]).toEqual({ deny: [DELEGATE_EXPERT_TOOL_NAME] });
  });

  it("未配置 restrictTools = 全量注册零限制（D1 全局语义不变）", async () => {
    const { face, restrict } = makeToolsFace();
    const { ctx } = makeCtx(face, SUBAGENTS);
    await expertSquadPlugin(ctx);
    expect(restrict).not.toHaveBeenCalled();
  });

  it("tools 面缺席 fail-soft：warn + 跳过 tool 注册，路由族照常装配", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { ctx } = makeCtx(undefined, SUBAGENTS);
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
      const { ctx } = makeCtx(face, undefined);
      await expertSquadPlugin(ctx);
      expect(registered).toEqual([...EXPERT_TOOLS]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("ctx.subagents absent"));
    } finally {
      warn.mockRestore();
    }
  });
});
