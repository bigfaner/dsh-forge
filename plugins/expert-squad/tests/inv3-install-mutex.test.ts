// INV-3 安装互斥 loud-fail 守卫单测（bug ef3e92ea——forge-aggregate-bundle 1.32）。
import { describe, expect, it } from "vitest";
import { assertInstallMutex, FORGE_COMBO_SERVICE_KEY, PROFILE_CONTEXT_SERVICE_KEY } from "../host/install-mutex.js";

const MEMBER = "@dsh-forge/expert-squad";

const comboCtx = (opts: { startedBundles?: readonly string[] } = {}): unknown => ({
  reflect: {
    get: (name: string) => {
      if (name === FORGE_COMBO_SERVICE_KEY) return { channel: "forge-bundle" };
      if (name === PROFILE_CONTEXT_SERVICE_KEY) return { startedBundles: opts.startedBundles };
      return undefined;
    },
  },
});

describe("INV-3 安装互斥守卫（project）", () => {
  it("Path A：forge bundle 已激活 + comboMark 缺席（solo 后装裸行整行替换）→ throw loud-fail", () => {
    expect(() => assertInstallMutex(comboCtx(), {}, MEMBER)).toThrow(/INV-3/);
    expect(() => assertInstallMutex(comboCtx(), undefined, MEMBER)).toThrow(/安装互斥/);
  });

  it("Path B：comboMark 行获胜（bundle 后装层）+ solo bundle 仍在 bundles 名单 → throw loud-fail", () => {
    const ctx = comboCtx({ startedBundles: ["@deepseek-ai/dsh-base", "@dsh-forge/forge", MEMBER] });
    expect(() => assertInstallMutex(ctx, { comboMark: true }, MEMBER)).toThrow(/INV-3/);
  });

  it("bundle 正常装载：comboMark 在场 + bundles 名单无本包独立条目 → 放行", () => {
    const ctx = comboCtx({ startedBundles: ["@deepseek-ai/dsh-base", "@dsh-forge/forge"] });
    expect(() => assertInstallMutex(ctx, { comboMark: true }, MEMBER)).not.toThrow();
  });

  it("forge 缺席（solo 正常单装）→ 放行", () => {
    expect(() => assertInstallMutex({ reflect: { get: () => undefined } }, {}, MEMBER)).not.toThrow();
    expect(() => assertInstallMutex({}, {}, MEMBER)).not.toThrow();
  });

  it("profileContext 缺席/劣形（非 launcher 宿主）→ comboMark 在场即放行（fail-soft）", () => {
    expect(() => assertInstallMutex(comboCtx(), { comboMark: true }, MEMBER)).not.toThrow();
  });

  it("reflect 异常视同缺席（fail-soft 不阻载正常激活）", () => {
    expect(() =>
      assertInstallMutex(
        { reflect: { get: () => { throw new Error("boom"); } } },
        {},
        MEMBER,
      ),
    ).not.toThrow();
  });
});
