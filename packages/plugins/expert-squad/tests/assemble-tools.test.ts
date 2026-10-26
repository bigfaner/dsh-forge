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

/** 宿主 ctx 替身：subagents 走 ctx 具名正门（bug 5a1e1132——官方 cordis Context
 *  模块扩充 subagents: SubagentRuntime，非 reflect 字符串键）；reflect 只供可选服务
 *  storage/tools（真可选——cordis 4.0.4 无可选 inject 语法，静态声明会永久 pending）。 */
function makeCtx(tools: unknown, subagents: unknown = undefined) {
  const effects: unknown[] = [];
  return {
    ctx: {
      connection: {
        fetch: { register: (): unknown => undefined },
      },
      ...(subagents !== undefined ? { subagents } : {}),
      reflect: {
        get(name: string) {
          if (name === "tools") return tools;
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

  it("subagents 取法正门（bug 5a1e1132）：只经 ctx.subagents 属性取服务——reflect 字符串键供给不误认（取法失配负向断言）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { face, registered } = makeToolsFace();
      const { ctx, effects } = makeCtx(face, undefined);
      // 官方具名正门缺席、仅 reflect 字符串键残留（bug 5a1e1132 失配形态）——
      // 不得经 reflect 误取并注册委派工具（管理 5 工具照常）。
      (ctx as { reflect: { get(name: string): unknown } }).reflect.get = (name: string) =>
        name === "tools" ? face : name === "subagents" ? SUBAGENTS : undefined;
      pendingEffects = effects as Array<() => unknown>;
      await expertSquadPlugin(ctx);
      expect(registered).toEqual([...EXPERT_TOOLS]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("ctx.subagents absent"));
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

describe("candidates skills 具名正门（AGENTS 1.5 / 同 bug 5a1e1132 先例）", { timeout: 20_000 }, () => {
  /** 装配并取回 candidates 路由应答。 */
  async function bootCandidates(
    tools: unknown,
    skills: unknown,
    reflectSkills: unknown = undefined,
  ): Promise<Record<string, unknown>> {
    const routes: Array<{ path: string; fetch(request: Request): Promise<Response> }> = [];
    const effects: Array<() => unknown> = [];
    const ctx = {
      connection: {
        fetch: {
          register: (route: { path: string; fetch(request: Request): Promise<Response> }): unknown => {
            routes.push(route);
            return route;
          },
        },
      },
      ...(skills !== undefined ? { skills } : {}),
      reflect: {
        get: (name: string) =>
          name === "tools" ? tools : name === "skills" ? reflectSkills : undefined,
      },
      effect: (dispose: () => unknown): unknown => {
        effects.push(dispose as () => unknown);
        return undefined;
      },
    };
    try {
      await expertSquadPlugin(ctx as never);
    } finally {
      for (const dispose of effects) await dispose();
    }
    const route = routes.find((r) => r.path === "/api/expert-squad/candidates");
    expect(route, "candidates 读口必须在装配期注册").toBeDefined();
    const res = await route!.fetch(new Request("http://host/api/expert-squad/candidates"));
    return (await res.json()) as Record<string, unknown>;
  }

  const TOOLS_FACE = {
    register: () => () => undefined,
    restrict: () => () => undefined,
    schemas: () => [{ name: "read" }, { name: "edit" }],
  };
  const SKILLS_FACE = { list: async () => [{ name: "review-prd" }, { name: "brainstorm" }] };

  it("inject 声明含 'skills'（官方具名正门边）", () => {
    expect(expertSquadPlugin.inject).toContain("skills");
  });

  it("skills 经 ctx.skills 具名正门读取并透出 candidates.skills（reflect 不供服务也能取到——具名正门在场）", async () => {
    const body = await bootCandidates(TOOLS_FACE, SKILLS_FACE, undefined);
    expect(body.skills).toEqual(["review-prd", "brainstorm"]);
    expect(body.tools).toEqual(["read", "edit"]);
  });

  it("skills 取法失配负向断言：仅 reflect 字符串键供给、具名正门缺席 = 字段缺席（不误认）", async () => {
    const body = await bootCandidates(TOOLS_FACE, undefined, SKILLS_FACE);
    expect("skills" in body).toBe(false);
  });

  it("skills 面缺席 = candidates.skills 字段缺席（fail-soft；client 回退档案技能并集语义）", async () => {
    const body = await bootCandidates(TOOLS_FACE, undefined);
    expect("skills" in body).toBe(false);
  });

  it("skills 形状失配（list 非函数）= 字段缺席（startContinuable 同款形状校验降级）", async () => {
    const body = await bootCandidates(TOOLS_FACE, { list: "not-a-function" });
    expect("skills" in body).toBe(false);
  });
});

describe("delegate 装配状态 run-state 读口暴露（观测面-only，不判注册结果）", { timeout: 20_000 }, () => {
  /** 装配并取回 run-state 路由应答的 delegate 字段。 */
  async function bootDelegateState(
    tools: unknown,
    subagents: unknown = undefined,
  ): Promise<unknown> {
    const routes: Array<{ path: string; fetch(request: Request): Promise<Response> }> = [];
    const effects: Array<() => unknown> = [];
    const ctx = {
      connection: {
        fetch: {
          register: (route: { path: string; fetch(request: Request): Promise<Response> }): unknown => {
            routes.push(route);
            return route;
          },
        },
      },
      ...(subagents !== undefined ? { subagents } : {}),
      reflect: { get: (name: string) => (name === "tools" ? tools : undefined) },
      effect: (dispose: () => unknown): unknown => {
        effects.push(dispose as () => unknown);
        return undefined;
      },
    };
    try {
      await expertSquadPlugin(ctx as never);
    } finally {
      for (const dispose of effects) await dispose();
    }
    const route = routes.find((r) => r.path === "/api/expert-squad/run-state");
    expect(route, "run-state 读口必须在装配期注册").toBeDefined();
    const res = await route!.fetch(new Request("http://host/api/expert-squad/run-state"));
    const body = (await res.json()) as { delegate?: unknown };
    return body.delegate;
  }

  it("registered：tools + subagents 双面在场 = delegate_state status registered", async () => {
    const { face } = makeToolsFace();
    expect(await bootDelegateState(face, SUBAGENTS)).toEqual({ status: "registered" });
  });

  it("degraded:subagents-absent：ctx.subagents 缺席 = 委派装配降级原因上读口", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { face } = makeToolsFace();
      expect(await bootDelegateState(face, undefined)).toEqual({
        status: "degraded",
        reason: "subagents-absent",
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("degraded:shape-mismatch：subagents.startContinuable 非函数 = 形状失配原因上读口", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { face } = makeToolsFace();
      expect(await bootDelegateState(face, { startContinuable: "not-a-function" })).toEqual({
        status: "degraded",
        reason: "shape-mismatch",
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("degraded:tools-absent：tool 面缺席（工具面整体跳过）= 委派不可用原因上读口", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await bootDelegateState(undefined, SUBAGENTS)).toEqual({
        status: "degraded",
        reason: "tools-absent",
      });
    } finally {
      warn.mockRestore();
    }
  });
});
