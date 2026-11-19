// client 束形状守卫（bug cdd5b0f8 判例——占位产物无 apply → 宿主 materialize 后
// `invalid plugin … received object` 装载失败）：client 入口必须为 cordis 插件形状
// （default 导出插件对象 + apply 方法返回 undefined），对齐其余 @dsh-forge 插件
// client 束形态（expert-squad/task-loop/input-history 同型判例）。
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import specClient, { apply } from "../../ui/index.ts";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("client 入口 cordis 插件形状", () => {
  it("default 导出插件对象带 apply 方法", () => {
    expect(specClient).toBeTypeOf("object");
    expect(specClient).not.toBeNull();
    expect(typeof (specClient as { apply?: unknown }).apply).toBe("function");
  });

  it("apply 返回 undefined（cordis 组合把返回值当 effect 消费）", () => {
    expect(apply({})).toBeUndefined();
    expect(specClient.apply({})).toBeUndefined();
  });

  it("消费服务须声明 inject 边（缺声明 = apply 期 `cannot get property … without inject`）", () => {
    const inject = (specClient as { inject?: unknown }).inject;
    expect(Array.isArray(inject)).toBe(true);
  });
});

describe("产物形状守卫（bundle-client.mjs 离手门）", () => {
  it("bundle 脚本含 apply 形状守卫（无 apply 即构建失败）", () => {
    const script = readFileSync(resolve(pkgDir, "scripts/bundle-client.mjs"), "utf8");
    expect(script).toMatch(/apply/);
    expect(script).toMatch(/形状守卫|apply.*function/);
    expect(script).toContain("process.exit(1)");
  });
});
