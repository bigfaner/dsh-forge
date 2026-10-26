import { describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import {
  apply,
  superComposerClient,
  wireSuperComposerClient,
} from "../src/client/index.js";
import { createFullscreenTracker } from "../src/client/fullscreen.js";

/**
 * client face 组装单测：组合 apply 契约（返回值铁律 + fail-soft）+ 接线本体
 * wireSuperComposerClient 的 tracker 在场性判读与撤销聚合。
 */

/** 最小 cordis ctx 桩（effect 缝可选拼装）。 */
function stubCtx(effect?: (execute: () => unknown) => unknown): Context {
  return (effect === undefined ? {} : { effect }) as unknown as Context;
}

describe("组合 apply 契约（装载器正门）", () => {
  it("apply 返回 undefined（cordis 组合把 apply 返回值当 effect 消费——非空 = Invalid effect）", () => {
    expect(superComposerClient.apply(stubCtx())).toBeUndefined();
    expect(apply(stubCtx())).toBeUndefined();
  });

  it("Node 求值环境（无 document）= 不装配，静默通过", () => {
    expect(() => superComposerClient.apply(stubCtx())).not.toThrow();
  });

  it("接线面异常 = fail-soft 降级（不外溢炸 cordis 组合，console 留痕）", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // 挂最小 document 桩使装配走到 effect 缝——effect getter 抛错须被 apply 捕获降级
    const globals = globalThis as typeof globalThis & Record<string, unknown>;
    const previousDocument = globals.document;
    globals.document = { querySelectorAll: () => [], head: { appendChild: () => undefined } };
    const brokenCtx = {
      get effect() {
        throw new Error("boom");
      },
    } as unknown as Context;
    try {
      expect(() => superComposerClient.apply(brokenCtx)).not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      globals.document = previousDocument;
      errorSpy.mockRestore();
    }
  });
});

describe("接线本体 wireSuperComposerClient", () => {
  it("effect 缝缺席（测试直驱）= 只接线不挂卸载；tracker 空态可 dispose（幂等）", () => {
    const face = wireSuperComposerClient(stubCtx());
    expect(() => {
      face.dispose();
      face.dispose();
    }).not.toThrow();
  });

  it("effect 缝在场 = disposer 挂 ctx.effect（fiber unload 自动执行）", () => {
    // 挂最小 document 桩使 tracker 装配成立（Node 求值环境默认无 document）
    const globals = globalThis as typeof globalThis & Record<string, unknown>;
    const previousDocument = globals.document;
    globals.document = { querySelectorAll: () => [], head: { appendChild: () => undefined } };
    const mounted: Array<() => () => void> = [];
    try {
      const face = wireSuperComposerClient(stubCtx((execute) => void mounted.push(execute)));
      expect(mounted.length).toBe(1);
      // 模拟 fiber unload：执行 effect 产物 disposer → face dispose 被间接调用
      expect(() => mounted[0]!()).not.toThrow();
      expect(() => face.dispose()).not.toThrow(); // 幂等（已 dispose）
    } finally {
      globals.document = previousDocument;
    }
  });
});

describe("tracker 正门缝（mini-composer 回填面预留——hook getter 注入即正门生效）", () => {
  it("注入 hook getter 后 isFullscreen 采信正门布尔（DOM 兜底退居漂移位）", () => {
    // 直驱 fullscreen.ts 装配缝——React 渲染侧订阅由 mini-composer 任务回填
    const tracker = createFullscreenTracker({
      readFullscreenFromHook: () => true,
    });
    expect(tracker.isFullscreen()).toBe(true);
    tracker.dispose();
  });
});
