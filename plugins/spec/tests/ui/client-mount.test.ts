// specClient remote.$mount 装载契约门测（面缺席真根因修口——spec 插件 client 半此前
// 零 $mount 贡献：host 半 forgeSpecsController 在场，但 client 半 namespace 永不物化，
// 官方宿主概览 Spec 列表恒报 forgeSpecs.list 面缺席）。
// 正典配方锚 = plugins/project/ui/remote.ts + task-loop tests/ui/client-mount.test.ts：
// $mount 挂 contribution（generator 产 TYPERT_REMOTE 投影，替身贴官方 remote.$mount
// 形状）→ mount settle 终态锚发布（成功/失败/缺席三分支各一次）→ 缺席 fail-soft。
// 替身注入形态 = reflect.get 复刻生产归一口（ui/index.ts remote 取法 reflect 单径——
// 回退径删除，评审 H-P3）。
import { afterEach, describe, expect, it } from "vitest";
import {
  FORGE_SPECS_MOUNT_SETTLED_ANCHOR_KEY,
  FORGE_SPECS_REMOTE_CONTRIBUTION,
} from "../../ui/remote.js";
import { specClient } from "../../ui/index.js";

/** cordis ctx 替身（reflect.get 注入 remote——记录取键，归一口 pin 断言源） */
function ctxWithRemote(mountImpl: (contribution: unknown) => Promise<unknown>): {
  ctx: { reflect: { get: (key: string) => unknown } };
  calls: unknown[];
  keys: string[];
} {
  const calls: unknown[] = [];
  const keys: string[] = [];
  const remote = {
    $mount: (contribution: unknown) => {
      calls.push(contribution);
      return mountImpl(contribution);
    },
  };
  return {
    ctx: { reflect: { get: (key: string) => { keys.push(key); return key === "remote" ? remote : undefined; } } },
    calls,
    keys,
  };
}

function resetAnchor(): void {
  delete (globalThis as Record<string, unknown>)[FORGE_SPECS_MOUNT_SETTLED_ANCHOR_KEY];
}

afterEach(resetAnchor);

describe("specClient remote.$mount 装载契约（forgeSpecs client 半贡献）", () => {
  it("$mount 贡献 = generator 产 forgeSpecs 投影（package = @dsh-forge/spec + forgeSpecs/* descriptor 族含 list）", () => {
    expect(FORGE_SPECS_REMOTE_CONTRIBUTION).toBeTypeOf("object");
    const info = FORGE_SPECS_REMOTE_CONTRIBUTION as { spec?: { package?: string; methods?: Record<string, unknown> } };
    expect(info.spec?.package).toBe("@dsh-forge/spec");
    const methods = Object.keys(info.spec?.methods ?? {});
    expect(methods.some((k) => k.startsWith("forgeSpecs/"))).toBe(true);
    expect(methods).toContain("forgeSpecs/list");
  });

  it("apply：remote 经 reflect.get 取法（单径归一口）→ 挂载 forgeSpecs 贡献（$mount 调用参数 = 生成投影本体）", () => {
    const { ctx, calls, keys } = ctxWithRemote(() => Promise.resolve());
    specClient.apply(ctx);
    expect(keys).toEqual(["remote"]);
    expect(calls.length).toBe(1);
    expect(calls[0]).toBe(FORGE_SPECS_REMOTE_CONTRIBUTION);
  });

  it("apply：mount settle → 页内 mount 终态锚发布（成功分支）", async () => {
    const { ctx } = ctxWithRemote(() => Promise.resolve());
    specClient.apply(ctx);
    await Promise.resolve();
    await Promise.resolve();
    expect((globalThis as Record<string, unknown>)[FORGE_SPECS_MOUNT_SETTLED_ANCHOR_KEY]).toBe(true);
  });

  it("apply：mount 失败分支 → 终态锚仍发布（诚实降级不悬挂）", async () => {
    const { ctx } = ctxWithRemote(() => Promise.reject(new Error("mount boom")));
    specClient.apply(ctx);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((globalThis as Record<string, unknown>)[FORGE_SPECS_MOUNT_SETTLED_ANCHOR_KEY]).toBe(true);
  });

  it("apply：reflect 面缺席宿主 → 终态锚发布 + 装配不中断（fail-soft）", () => {
    expect(() => specClient.apply({})).not.toThrow();
    expect((globalThis as Record<string, unknown>)[FORGE_SPECS_MOUNT_SETTLED_ANCHOR_KEY]).toBe(true);
  });

  it("inject 声明含 remote 边（$mount 挂载面——缺席宿主由 apply 内 fail-soft 承担）", () => {
    expect(specClient.inject).toContain("remote");
  });
});
