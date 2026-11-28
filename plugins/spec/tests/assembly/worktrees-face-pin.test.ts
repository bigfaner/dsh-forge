// lazyWorktreesFace 组合根 pin（评审 E①——forge.worktrees 缝三级劣形收窄 + 点分键取法）：
// 归一取法本身不测即「forgeFaceOf 漏网同型」结构——形状漂移 RED 钉。与 plugins/task-loop
// 同型复制非收敛（留痕见 host/assembly/typert-remotes.ts 注）——两侧 pin 对锁同型形状。
import { describe, expect, it } from "vitest";
import { lazyWorktreesFace } from "../../host/assembly/typert-remotes.js";

/** ctx 桩：reflect.get 记录取键（点分键取法 pin 断言源） */
function ctxOf(getResult: unknown, opts: { throwOnGet?: boolean } = {}): { ctx: unknown; keys: string[] } {
  const keys: string[] = [];
  const ctx = {
    reflect: {
      get(name: string) {
        keys.push(name);
        if (opts.throwOnGet === true) throw new Error("inject 门拒读");
        return getResult;
      },
    },
  };
  return { ctx, keys };
}

const GOOD_FACE = {
  list: () => Promise.resolve({ entries: [{ path: "Z:/ws" }] }),
};

describe("lazyWorktreesFace 组合根 pin（三级劣形收窄 + 点分键取法）", () => {
  it("正形：惰性工厂 provide → 调用产 face，list 窄面可达", async () => {
    const { ctx } = ctxOf(() => GOOD_FACE);
    const worktrees = lazyWorktreesFace(ctx);
    const face = worktrees();
    expect(face).toEqual(GOOD_FACE);
    await expect(face!.list({ projectRoot: "Z:/ws" })).resolves.toEqual({ entries: [{ path: "Z:/ws" }] });
  });

  it("ctxReflectGet 点分键取法 pin：恒走 'forge.worktrees' 同键（f5 键族同键）", () => {
    const { ctx, keys } = ctxOf(() => GOOD_FACE);
    lazyWorktreesFace(ctx)();
    expect(keys).toEqual(["forge.worktrees"]);
  });

  it("现查永不缓存：每次调用期重取 reflect.get（AGENTS 1.6）", () => {
    let provided: unknown = undefined;
    const keys: string[] = [];
    const ctx = { reflect: { get(name: string) { keys.push(name); return provided; } } };
    const worktrees = lazyWorktreesFace(ctx);
    expect(worktrees()).toBeUndefined();
    provided = () => GOOD_FACE;
    expect(worktrees()).toEqual(GOOD_FACE);
    expect(keys.length).toBe(2);
  });

  it("劣形①：reflect.get 产出非函数（undefined / 非函数值）→ undefined", () => {
    expect(lazyWorktreesFace(ctxOf(undefined).ctx)()).toBeUndefined();
    expect(lazyWorktreesFace(ctxOf({ list: () => null }).ctx)()).toBeUndefined();
  });

  it("劣形②：工厂调用产出 null / 原始值 → undefined", () => {
    expect(lazyWorktreesFace(ctxOf(() => null).ctx)()).toBeUndefined();
    expect(lazyWorktreesFace(ctxOf(() => 42).ctx)()).toBeUndefined();
    expect(lazyWorktreesFace(ctxOf(() => "face").ctx)()).toBeUndefined();
  });

  it("劣形③：face.list 非函数（对象缺 list / list 非函数）→ undefined", () => {
    expect(lazyWorktreesFace(ctxOf(() => ({})).ctx)()).toBeUndefined();
    expect(lazyWorktreesFace(ctxOf(() => ({ list: "not-a-fn" })).ctx)()).toBeUndefined();
  });

  it("fail-soft：reflect.get 抛错（cordis inject 门拒读同径）→ undefined 不外抛", () => {
    const { ctx } = ctxOf(undefined, { throwOnGet: true });
    expect(lazyWorktreesFace(ctx)()).toBeUndefined();
  });

  it("reflect 缝缺席（非 cordis 宿主）→ undefined 不外抛", () => {
    expect(lazyWorktreesFace({})()).toBeUndefined();
  });
});
