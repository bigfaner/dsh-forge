// 结构守卫（bug d00302ef 终局修——零运行时依赖防回归）：安装代闭包家族四代复发
// （ff55faad→e020f50e→d211bc24→d00302ef）定谳 = 部分内联 whack-a-mole，唯一终态 =
// 声明零运行时依赖 + host 半构建期全 bundling。本守卫钉住：
//   ① dependencies 零运行时依赖（mammoth/mermaid/pdfjs-dist 降 devDependencies 供开发期）；
//   ② bundledDependencies 内联面退役（零依赖后传递闭包为空）；
//   ③ bundle-host 外置表为空（引擎全闭包内联进 dist——外置即回退到 whack-a-mole 形态）。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PKG_DIR = join(import.meta.dirname, "..", "..");
const pkg = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  bundledDependencies?: string[] | Record<string, string>;
  bundleDependencies?: string[] | Record<string, string>;
};
const ENGINES = ["mammoth", "mermaid", "pdfjs-dist"];

describe("零运行时依赖守卫（bug d00302ef 终局修）", () => {
  it("dependencies 收敛零运行时依赖（安装代声明闭包 = 空——peer validation 零 flags 的结构前提）", () => {
    expect(Object.keys(pkg.dependencies ?? {}), "dependencies 出现运行时依赖（家族病理回归）").toEqual([]);
  });

  it("三引擎（mammoth/mermaid/pdfjs-dist）降 devDependencies 精确 pin 供开发期（build/test 依赖面不丢）", () => {
    for (const engine of ENGINES) {
      expect(pkg.devDependencies?.[engine], `${engine} 缺席 devDependencies（开发期引擎解析断链）`).toBeTypeOf("string");
    }
  });

  it("bundledDependencies 内联面退役（零依赖后传递闭包为空——pack-bundled 打包链同步简化的结构前提）", () => {
    expect(pkg.bundledDependencies ?? pkg.bundleDependencies, "bundled 内联声明残留").toBeUndefined();
  });

  it("bundle-host 外置表为空（全闭包内联进 dist——EXTERNAL 非空即引擎回退 registry 外置形态）", () => {
    const source = readFileSync(join(PKG_DIR, "scripts", "bundle-host.mjs"), "utf8");
    expect(source).toContain("const EXTERNAL = [];");
  });
});
