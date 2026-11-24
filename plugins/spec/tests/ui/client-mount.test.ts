// specClient remote.$mount 装载契约门测（面缺席真根因修口——spec 插件 client 半此前
// 零 $mount 贡献：host 半 forgeSpecsController 在场，但 client 半 namespace 永不物化，
// 官方宿主概览 Spec 列表恒报 forgeSpecs.list 面缺席）。
// 正典配方锚 = plugins/project/ui/remote.ts + task-loop tests/ui/client-mount.test.ts：
// $mount 挂 contribution（generator 产 TYPERT_REMOTE 投影，替身贴官方 remote.$mount
// 形状）→ mount settle 终态锚发布（成功/失败/缺席三分支各一次）→ 缺席 fail-soft。
import { afterEach, describe, expect, it } from "vitest";
import {
  FORGE_SPECS_MOUNT_SETTLED_ANCHOR_KEY,
  FORGE_SPECS_REMOTE_CONTRIBUTION,
} from "../../ui/remote.js";
import { specClient } from "../../ui/index.js";

/** remote $mount 替身（记录 contribution——形状贴官方 remote.$mount：单参 → promise） */
function fakeRemote(mountImpl: (contribution: unknown) => Promise<unknown>) {
  const calls: unknown[] = [];
  return {
    remote: {
      $mount: (contribution: unknown) => {
        calls.push(contribution);
        return mountImpl(contribution);
      },
    },
    calls,
  };
}

function resetAnchor(): void {
  delete (globalThis as Record<string, unknown>)[FORGE_SPECS_MOUNT_SETTLED_ANCHOR_KEY];
}

afterEach(resetAnchor);

describe("specClient remote.$mount 装载契约（forgeSpecs client 半贡献）", () => {
  it("$mount 贡献 = generator 产 forgeSpecs 投影（package = @dsh-forge/spec + forgeSpecs/* descriptor 族含 list）", () => {
    expect(FORGE_SPECS_REMOTE_CONTRIBUTION).toBeTruthy();
    const info = FORGE_SPECS_REMOTE_CONTRIBUTION as { spec?: { package?: string; methods?: Record<string, unknown> } };
    expect(info.spec?.package).toBe("@dsh-forge/spec");
    const methods = Object.keys(info.spec?.methods ?? {});
    expect(methods.some((k) => k.startsWith("forgeSpecs/"))).toBe(true);
    expect(methods).toContain("forgeSpecs/list");
  });

  it("apply：remote.$mount 在场 → 挂载 forgeSpecs 贡献（$mount 调用参数 = 生成投影本体）", () => {
    const { remote, calls } = fakeRemote(() => Promise.resolve());
    specClient.apply({ remote });
    expect(calls.length).toBe(1);
    expect(calls[0]).toBe(FORGE_SPECS_REMOTE_CONTRIBUTION);
  });

  it("apply：mount settle → 页内 mount 终态锚发布（成功分支）", async () => {
    const { remote } = fakeRemote(() => Promise.resolve());
    specClient.apply({ remote });
    await Promise.resolve();
    await Promise.resolve();
    expect((globalThis as Record<string, unknown>)[FORGE_SPECS_MOUNT_SETTLED_ANCHOR_KEY]).toBe(true);
  });

  it("apply：mount 失败分支 → 终态锚仍发布（诚实降级不悬挂）", async () => {
    const { remote } = fakeRemote(() => Promise.reject(new Error("mount boom")));
    specClient.apply({ remote });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((globalThis as Record<string, unknown>)[FORGE_SPECS_MOUNT_SETTLED_ANCHOR_KEY]).toBe(true);
  });

  it("apply：remote 缺席宿主 → 终态锚发布 + 装配不中断（fail-soft）", () => {
    expect(() => specClient.apply({})).not.toThrow();
    expect((globalThis as Record<string, unknown>)[FORGE_SPECS_MOUNT_SETTLED_ANCHOR_KEY]).toBe(true);
  });

  it("inject 声明含 remote 边（$mount 挂载面——缺席宿主由 apply 内 fail-soft 承担）", () => {
    expect(specClient.inject).toContain("remote");
  });
});
