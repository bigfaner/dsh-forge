// @vitest-environment happy-dom
// mini-composer 挂载接线测试（真实 DOM 链路——apply 正门 createRoot 替身容器）。
import { describe, expect, it } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import { superComposerClient } from "../src/client/index.js";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function stubCtx(): Context {
  const effects: Array<() => unknown> = [];
  const ctx = {
    effect: (execute: () => unknown) => {
      effects.push(execute);
      return undefined;
    },
  } as unknown as Context;
  (ctx as unknown as { __effects: Array<() => unknown> }).__effects = effects;
  return ctx;
}

describe("bug: apply 挂载 mini-composer 替身（MiniComposerCard + DataFace 真实接线）", () => {
  it("apply 后 DOM 在场 dscf-root/dscf-input 锚（真机 dscfRoot/dscfInput 非零的前提）", async () => {
    const ctx = stubCtx();
    superComposerClient.apply(ctx);
    await tick();
    expect(document.querySelector('[data-testid="dscf-root"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="dscf-input"]')).not.toBeNull();
    const effects = (ctx as unknown as { __effects: Array<() => unknown> }).__effects;
    expect(effects.length).toBe(1);
  });

  it("disposer 收口：root.unmount 摘除替身 DOM（幂等不抛）", async () => {
    const ctx = stubCtx();
    superComposerClient.apply(ctx);
    await tick();
    const effects = (ctx as unknown as { __effects: Array<() => unknown> }).__effects;
    const before = document.querySelectorAll('[data-testid="dscf-root"]').length;
    expect(before).toBeGreaterThan(0);
    // cordis 语义：effect mount 返回 disposer，fiber unload 时执行返回值
    const dispose = effects[0]!() as () => void;
    dispose();
    await tick();
    expect(document.querySelectorAll('[data-testid="dscf-root"]').length).toBe(before - 1);
    expect(() => dispose()).not.toThrow();
  });
});
