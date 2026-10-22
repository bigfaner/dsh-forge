import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { quoteReferenceClient, wireQuoteReferenceClient } from "../src/client/index.js";

/** 本包 package.json（dsh.client 清单硬门断言源）。 */
const pkg = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
) as {
  exports: Record<string, unknown>;
  dsh: {
    bundle: { patch: string };
    client: { platform: string; inject: readonly string[] };
  };
};

/** 最小 cordis ctx 窄面（apply 直驱——服务/注入缝/effect 缝按用例供给）。 */
interface FakeCtx {
  sessions?: unknown
  inject?: (names: readonly string[], cb: (scope: unknown) => void) => unknown
  effect?: (execute: () => unknown) => unknown
}

describe("组合包形态清单（proposal 硬门 ⑧）", () => {
  it("dsh.client.platform=web（缺 platform = UI 静默缺失）", () => {
    expect(pkg.dsh.client.platform).toBe("web");
  });

  it("dsh.bundle.patch 指向组合行 + exports[\"./client\"] 在场", () => {
    expect(pkg.dsh.bundle.patch).toBe("./cordis.patch.yml");
    expect(pkg.exports["./client"]).toBeDefined();
  });

  it("inject 声明硬门：引用的 ctx 服务（sessions + inputTriggers）全部在 inject 清单", () => {
    expect(pkg.dsh.client.inject).toContain("@deepseek-ai/dsh-api-session-controller");
    // 评审 A3：与 super-composer 对称——inputTriggers 读取虽走 fail-soft 反射，
    // 装配期注入边声明入清单（装载序落在 input-trigger 之后，服务可达性同源保障）。
    expect(pkg.dsh.client.inject).toContain("@deepseek-ai/dsh-client-ui-input-trigger");
  });
});

describe("client face apply 骨架", () => {
  it("组合插件对象：含 apply 方法；apply 返回 undefined（cordis effect 返回值铁律）", () => {
    expect(typeof quoteReferenceClient.apply).toBe("function");
    const ctx: FakeCtx = {};
    expect(quoteReferenceClient.apply(ctx as never)).toBeUndefined();
  });

  it("fail-soft：sessions 与 inject 缝俱缺 = 静默降级不抛", () => {
    expect(() => quoteReferenceClient.apply({} as never)).not.toThrow();
  });

  it("sessions 在场 + effect 缝在场 = 接线挂卸载（dispose 幂等）", () => {
    const effects: Array<() => unknown> = [];
    const ctx: FakeCtx = {
      sessions: { list: [] },
      effect: (execute) => {
        effects.push(execute);
        return undefined;
      },
    };
    expect(() => quoteReferenceClient.apply(ctx as never)).not.toThrow();
    // 评审 A5：wire 内 disposer + registrationTimer 顶层兜底 = 两条 effect
    expect(effects.length, "wire 卸载 + registrationTimer 顶层兜底").toBe(2);
    const face = wireQuoteReferenceClient(ctx as never);
    expect(face.sessionsAvailable).toBe(true);
    face.dispose();
    expect(() => face.dispose()).not.toThrow();
  });

  it("装配序兜底：sessions 缺席 + inject 缝在场 = 运行期注入 sessions", () => {
    const injected: readonly string[][] = [];
    const ctx: FakeCtx = {
      inject: (names) => {
        injected.push(names);
        return undefined;
      },
    };
    quoteReferenceClient.apply(ctx as never);
    expect(injected).toEqual([["sessions"]]);
  });

  it("bug: 兜底回调执行时以注入后 scope 接线（effect 缝注册——回调空体 = 菜单永不装配）", () => {
    const effects: Array<() => unknown> = [];
    let callback: ((scope: unknown) => void) | undefined;
    const ctx: FakeCtx = {
      inject: (_names, cb) => {
        callback = cb;
        return undefined;
      },
      effect: (execute) => {
        effects.push(execute);
        return undefined;
      },
    };
    quoteReferenceClient.apply(ctx as never);
    // provide 晚于 apply：宿主 provide 时以注入后 scope 触发回调
    callback?.({ sessions: { list: [] } });
    expect(effects.length, "兜底回调必须完成接线（dispose 挂 ctx.effect + registrationTimer 顶层兜底）").toBe(2);
  });

  it("bug: 兜底回调幂等防重挂（二次触发不再重复接线）", () => {
    const effects: Array<() => unknown> = [];
    let callback: ((scope: unknown) => void) | undefined;
    const ctx: FakeCtx = {
      inject: (_names, cb) => {
        callback = cb;
        return undefined;
      },
      effect: (execute) => {
        effects.push(execute);
        return undefined;
      },
    };
    quoteReferenceClient.apply(ctx as never);
    callback?.({ sessions: { list: [] } });
    callback?.({ sessions: { list: [] } });
    expect(effects.length).toBe(2);
  });
});
