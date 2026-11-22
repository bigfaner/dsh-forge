// tools-exclude —— preset 行内 office 族全局工具排除件（1.37 预设级排除路线）：
//   ① apply 期 preset scope 落官方 ctx.tools.restrict({ deny: 交集 })——deny 与全局
//      已注册名求交 fail-soft（restrict 未知名 loud 校验零 throw 面）；
//   ② tools 面缺席/形状失配/视图查询失败/交集空/名单空 = 全分支 fail-soft 跳过；
//   ③ disposer 经 ctx.effect 挂行生命周期；
//   ④ 名单正本 OFFICE_TOOL_DENY_CANDIDATES 契约（13 名 office 全族）。
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OFFICE_TOOL_DENY_CANDIDATES, default as toolsExcludeDefault, toolsExclude } from "../host/tools-exclude.js";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface RestrictCall {
  deny: string[];
}

/** 捕获 restrict 调用与 disposer 挂载的 fake tools 面。 */
function makeTools(known: readonly string[]) {
  const calls: RestrictCall[] = [];
  const disposed: string[] = [];
  const face = {
    restrict(filter: RestrictCall) {
      calls.push({ deny: [...filter.deny] });
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

describe("toolsExclude apply", () => {
  it("deny 与宿主实注册名求交：交集子集落 restrict（未注册候选剔除——零 throw 面）", () => {
    const { face, calls } = makeTools(["office_template", "pwsh", "read"]);
    const { ctx } = makeCtx(face);
    toolsExclude(ctx as never, { deny: ["office_template", "pptd_render", "ghost_tool"] });
    expect(calls).toEqual([{ deny: ["office_template"] }]);
  });

  it("交集非空时 disposer 经 ctx.effect 挂行生命周期", () => {
    const { face, disposed } = makeTools(["office_template_write"]);
    const { ctx, effects } = makeCtx(face);
    toolsExclude(ctx as never, { deny: ["office_template_write"] });
    expect(effects).toHaveLength(1);
    expect(disposed).toEqual([]);
    // cordis effect 语义：dispose 回调返回的 disposer 随之被调用（expert-restrict 同形）
    for (const dispose of effects) (dispose() as () => void)?.();
    expect(disposed).toEqual(["restrict"]);
  });

  it("交集空 = fail-soft 跳过（零 restrict 调用、零 effect）", () => {
    const { face, calls } = makeTools(["read"]);
    const { ctx, effects } = makeCtx(face);
    toolsExclude(ctx as never, { deny: ["pptd_render", "pptd_check"] });
    expect(calls).toEqual([]);
    expect(effects).toEqual([]);
  });

  it("tools 面缺席/形状失配 = fail-soft 跳过（不炸 preset 装载）", () => {
    expect(() => toolsExclude({} as never, { deny: ["office_template"] })).not.toThrow();
    expect(() => toolsExclude({ tools: {} } as never, { deny: ["office_template"] })).not.toThrow();
    expect(() => toolsExclude({ tools: { restrict: 42, schemas: () => [] } } as never, { deny: ["office_template"] })).not.toThrow();
  });

  it("schemas 视图查询抛错 = fail-soft 跳过", () => {
    const ctx = { tools: { restrict: () => () => {}, schemas: () => { throw new Error("view failed"); } } };
    expect(() => toolsExclude(ctx as never, { deny: ["office_template"] })).not.toThrow();
  });

  it("config.deny 空缺/空集 = 跳过", () => {
    const { face, calls } = makeTools(["office_template"]);
    const { ctx } = makeCtx(face);
    toolsExclude(ctx as never, {});
    toolsExclude(ctx as never, { deny: [] });
    expect(calls).toEqual([]);
  });

  it("行插件 inject = [tools]（cordis 具名服务正门——expert-restrict 同先例）", () => {
    expect((toolsExclude as { inject?: string[] }).inject).toEqual(["tools"]);
    expect(toolsExcludeDefault).toBe(toolsExclude);
  });
});

describe("OFFICE_TOOL_DENY_CANDIDATES 名单正本契约", () => {
  it("office 全族 13 名（desktop 实锚实注册名——加名须同步两份 patch deny 列表）", () => {
    expect(OFFICE_TOOL_DENY_CANDIDATES).toEqual([
      "office_template",
      "office_template_write",
      "ppt_get_template_pages",
      "ppt_get_template_reference",
      "ppt_list_templates",
      "ppt_template_create_project",
      "pptd_add_asset",
      "pptd_check",
      "pptd_import",
      "pptd_list_files",
      "pptd_read_file",
      "pptd_render",
      "pptd_write_file",
    ]);
  });

  it("forge 同源副本逐字节一致（双通道各自裸名可解析——副本漂移即红）", () => {
    const self = readFileSync(join(PKG_ROOT, "host", "tools-exclude.ts"), "utf8");
    const forge = readFileSync(join(PKG_ROOT, "..", "forge", "host", "tools-exclude.ts"), "utf8");
    expect(forge).toBe(self);
  });

  it("正本 patch 零 exclude 行（exclude 行 bundle/solo 双通道统一退役——bug bfd37960；preset-headhunter 块为 solo 通道自持副本，bundle 通道由 forge 正本自含同构块承带）", () => {
    const patch = readFileSync(join(PKG_ROOT, "cordis.patch.yml"), "utf8");
    expect(patch).not.toMatch(/- id: tool-exclude-office/m);
  });
});
