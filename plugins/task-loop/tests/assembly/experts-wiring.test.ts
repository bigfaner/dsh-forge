// worker 路由装配接线测试（bug dc0f9de3——首轮 spawn worker 工具面装配不一致根因层）：
// 生产装配方（assembleTaskLoopToolFamily）此前零 resolveWorkerProfile 注入——循环驱动器
// 恒走 generic 兜底档（allow keep-only = 管线必备两员），worker 永无档案 tools（写/执行族
// 全滤除，真机判例 fix-12 010-final-web：a1 worker 仅 submit_task/todo_write 两员）。
// 本文件钉两面：① experts 服务面双通道现查（inject 具名属性 + reflect 先例面，AGENTS 1.6
// 检测永不缓存）；② 装配行把 resolveWorkerProfile 注入 createLoopDriver（结构 pin）。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { expertsFaceOf } from "../../host/assembly/tool-family.js";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../host/assembly/tool-family.ts"), "utf8");

describe("experts 服务面现查缝（双通道防御读取，fail-soft 归 undefined）", () => {
  it("ctx.experts 具名属性面在场（inject 正门）→ 返回服务面", () => {
    const face = { get: () => undefined };
    expect(expertsFaceOf({ experts: face })).toBe(face);
  });

  it("inject 门拒（属性访问抛错）→ reflect.get 先例面回落命中", () => {
    const face = { get: () => undefined };
    const ctx = { reflect: { get: (name: string) => (name === "experts" ? face : undefined) } };
    Object.defineProperty(ctx, "experts", { get() { throw new Error("cannot get property without inject"); } });
    expect(expertsFaceOf(ctx)).toBe(face);
  });

  it("双通道全缺席/劣形 → undefined；reflect 通道抛错不波及 inject 正门", () => {
    expect(expertsFaceOf({})).toBeUndefined();
    expect(expertsFaceOf({ experts: "not-a-service" })).toBeUndefined();
    expect(expertsFaceOf({ experts: { /* get 缺席 */ } })).toBeUndefined();
    // reflect 先例面抛错：inject 面在场照常取（双通道独立 fail-soft）
    const face = { get: () => undefined };
    expect(expertsFaceOf({ experts: face, reflect: { get: () => { throw new Error("boom"); } } })).toBe(face);
    // inject 面劣形 + reflect 抛错 = 双通道全失效 → undefined
    expect(
      expertsFaceOf({
        experts: {},
        reflect: { get: () => { throw new Error("boom"); } },
      }),
    ).toBeUndefined();
  });
});

describe("装配行路由注入结构 pin（bug dc0f9de3——漏注入 = 真机恒 generic 档）", () => {
  it("tool-family 装配行把 resolveWorkerProfile 注入 createLoopDriver deps", () => {
    expect(SRC).toContain("resolveWorkerProfile");
    expect(SRC).toMatch(/resolveWorkerProfile\s*[,:]/);
  });

  it("experts 面缺席 = 形态兼容降级（resolver 不建，路由返回 undefined → core 侧 generic 兜底）", async () => {
    // 现查缝缺席语义由上组用例承载——此处钉装配行存在 fail-soft 分支（零 experts 读取崩溃面）
    expect(SRC).toContain("expertsFaceOf");
  });
});
