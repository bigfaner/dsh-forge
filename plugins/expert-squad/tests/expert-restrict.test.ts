// expert-restrict —— preset 行内白名单段插件（fix-1 通道工具承载半）测试：
//   ① apply 期 allow 与 global 实注册名求交 fail-soft（restrict 未知名 loud 校验
//      零 throw 面——bug 2026-11-24 全专家 preset 行 mount 失败定谳修口）；
//   ② tools 面缺席/形状失配/视图查询失败/allow 交集空 = 全分支 fail-soft 跳过；
//   ③ 交集非空时 disposer 经 ctx.effect 挂行生命周期；
//   ④ deny 名单同径求交；config 双名单空缺 = 跳过；
//   ⑤ 行插件 inject = [tools]（cordis 具名服务正门）。
import { describe, expect, it } from "vitest";
import { default as expertToolRestrictDefault, expertToolRestrict } from "../host/expert-restrict.js";

interface RestrictCall {
  allow?: string[];
  deny?: string[];
}

/** 捕获 restrict 调用与 disposer 挂载的 fake tools 面。 */
function makeTools(known: readonly string[]) {
  const calls: RestrictCall[] = [];
  const disposed: string[] = [];
  const face = {
    restrict(filter: RestrictCall) {
      calls.push({
        ...(filter.allow !== undefined ? { allow: [...filter.allow] } : {}),
        ...(filter.deny !== undefined ? { deny: [...filter.deny] } : {}),
      });
      return () => {
        disposed.push("restrict");
      };
    },
    schemas() {
      return known.map((name) => ({ name }));
    },
  };
  return { face, calls, disposed };
}

function makeCtx(face: unknown) {
  const effects: Array<() => unknown> = [];
  const ctx = {
    tools: face,
    effect(dispose: () => unknown) {
      effects.push(dispose);
    },
  };
  return { ctx, effects };
}

describe("expertToolRestrict apply", () => {
  it("allow 与宿主实注册名求交：交集子集落 restrict（preset scope 层名剔除——零 throw 面）", () => {
    // bug 2026-11-24 实锚形态：档案白名单含 global 层（working_directory）+
    // preset scope 层（read/grep——本宿主模型工具族）混合名单
    const { face, calls } = makeTools(["working_directory", "delegate_expert"]);
    const { ctx } = makeCtx(face);
    expertToolRestrict(ctx as never, { allow: ["read", "grep", "working_directory"] });
    expect(calls).toEqual([{ allow: ["working_directory"] }]);
  });

  it("交集非空时 disposer 经 ctx.effect 挂行生命周期（行卸载即解除）", () => {
    const { face, disposed } = makeTools(["working_directory"]);
    const { ctx, effects } = makeCtx(face);
    expertToolRestrict(ctx as never, { allow: ["working_directory"] });
    expect(effects).toHaveLength(1);
    expect(disposed).toEqual([]);
    for (const dispose of effects) (dispose() as () => void)?.();
    expect(disposed).toEqual(["restrict"]);
  });

  it("allow 交集空 = fail-soft 跳过（白名单不落地——不落空白 allow 全掩码）", () => {
    const { face, calls } = makeTools(["office_template"]);
    const { ctx, effects } = makeCtx(face);
    expertToolRestrict(ctx as never, { allow: ["read", "grep"] });
    expect(calls).toEqual([]);
    expect(effects).toEqual([]);
  });

  it("deny 名单同径求交（交集子集落 restrict）", () => {
    const { face, calls } = makeTools(["pptd_render", "read"]);
    const { ctx } = makeCtx(face);
    expertToolRestrict(ctx as never, { deny: ["pptd_render", "ghost_tool"] });
    expect(calls).toEqual([{ deny: ["pptd_render"] }]);
  });

  it("allow+deny 并存 = 双交集同调落地", () => {
    const { face, calls } = makeTools(["working_directory", "pptd_check"]);
    const { ctx } = makeCtx(face);
    expertToolRestrict(ctx as never, { allow: ["working_directory", "read"], deny: ["pptd_check"] });
    expect(calls).toEqual([{ allow: ["working_directory"], deny: ["pptd_check"] }]);
  });

  it("tools 面缺席/形状失配 = fail-soft 跳过（不炸 preset 装载）", () => {
    expect(() => expertToolRestrict({} as never, { allow: ["read"] })).not.toThrow();
    expect(() => expertToolRestrict({ tools: {} } as never, { allow: ["read"] })).not.toThrow();
    expect(() =>
      expertToolRestrict({ tools: { restrict: 42, schemas: () => [] } } as never, { allow: ["read"] }),
    ).not.toThrow();
  });

  it("schemas 视图查询抛错 = fail-soft 跳过", () => {
    const ctx = { tools: { restrict: () => () => {}, schemas: () => { throw new Error("view failed"); } } };
    expect(() => expertToolRestrict(ctx as never, { allow: ["read"] })).not.toThrow();
  });

  it("config.allow/deny 空缺/双空集 = 跳过", () => {
    const { face, calls } = makeTools(["read"]);
    const { ctx } = makeCtx(face);
    expertToolRestrict(ctx as never, {});
    expertToolRestrict(ctx as never, { allow: [], deny: [] });
    expect(calls).toEqual([]);
  });

  it("行插件 inject = [tools]（cordis 具名服务正门——tools-exclude 同先例）", () => {
    expect((expertToolRestrict as { inject?: string[] }).inject).toEqual(["tools"]);
    expect(expertToolRestrictDefault).toBe(expertToolRestrict);
  });
});
