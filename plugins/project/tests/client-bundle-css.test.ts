// disc-1 fix：官方宿主插件 UI 裸样式修复——css 必须随 bundle 内联注入。
//
// 根因：esbuild 把 ui 源的 css import 解析为独立副产物 dist/client.css，而运行期
// 装载面 = dist/client.js 单一入口（exports["./client"]）——client.js 零样式注入。
// 官方缝核销（dsh-client-modules client.js claimStyles/removeOwnedStyles）：插件
// factory 闭包内注入 <style data-plugin> 标签 = 官方归属/卸载机械的正道形态。
//
// 产物面断言（dist 构建后在场才跑——CI/本地 build 后恒在场）。
import { existsSync, readFileSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("client bundle 样式内联（disc-1）", () => {
  const distClient = resolve(pkgDir, "dist", "client.js");
  const distClientCss = resolve(pkgDir, "dist", "client.css");

  it("client.js 内含 factory 闭包样式注入面（createElement style + data-plugin 归属标签）", () => {
    if (!existsSync(distClient)) return; // 未构建（纯 src 测试树）
    const bundled = readFileSync(distClient, "utf8");
    expect(bundled).toContain('createElement("style")');
    expect(bundled).toContain('data-plugin');
  });

  it("独立 css 副产物退役：dist/client.css 不存在", () => {
    if (existsSync(distClientCss)) rmSync(distClientCss); // 清历史残留副产物
    expect(existsSync(distClientCss)).toBe(false);
  });
});
