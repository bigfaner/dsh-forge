// bundledDependencies 内联闭包机检（bug d211bc24 家族——pnpm reused 快径下 file: tarball
// 升级装不物化新增依赖，传递链落 .pnpm 隐藏仓越出判定集合 → 拒装；修法换层 = 物化层内联）。
// 断言面：①内联闭包完整性（bundled 根为真实目录、树内每包 manifest 可读、相对引用闭合）
// ②ESM/CJS exports 解析验证（每包入口经 exports/main 解析命中真实文件）。
import { mkdirSync, rmSync, symlinkSync, writeFileSync, mkdirSync as md } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { auditBundledClosure } from "../../scripts/self-containment.mjs";

let root: string;

function pkgDir(name: string, manifest: object, files: Record<string, string> = {}) {
  const dir = join(root, "node_modules", name);
  md(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
  for (const [rel, body] of Object.entries(files)) {
    const p = join(dir, rel);
    md(join(p, ".."), { recursive: true });
    writeFileSync(p, body);
  }
  return dir;
}

const hostPkg = (bundled: string[]) => ({
  name: "fixture-host",
  version: "0.0.0",
  dependencies: { mammoth: "1.13.0" },
  bundledDependencies: bundled,
});

beforeEach(() => {
  root = join(import.meta.dirname, ".tmp-bundled-fixture");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("auditBundledClosure 内联闭包完整性", () => {
  it("bundled 根缺席 = 违规（tarball 声明内联但 node_modules 未随包）", () => {
    const violations = auditBundledClosure(root, hostPkg(["mammoth"]));
    expect(violations.some((v) => v.includes("mammoth") && v.includes("缺席"))).toBe(true);
  });

  it("bundled 根为 symlink/store 链接 = 违规（打包即携带断链）", () => {
    const real = pkgDir("mammoth-real", { name: "mammoth", version: "1.13.0", main: "index.js" }, {
      "index.js": "module.exports = {};\n",
    });
    mkdirSync(join(root, "node_modules"), { recursive: true });
    symlinkSync(real, join(root, "node_modules", "mammoth"), "junction");
    const violations = auditBundledClosure(root, hostPkg(["mammoth"]));
    expect(violations.some((v) => v.includes("mammoth") && v.includes("链接"))).toBe(true);
  });

  it("bundled 声明未落 dependencies = 违规（不可安装面）", () => {
    const violations = auditBundledClosure(root, { ...hostPkg([]), bundledDependencies: ["not-a-dep"] });
    expect(violations.some((v) => v.includes("not-a-dep") && v.includes("dependencies"))).toBe(true);
  });

  it("真实内联树全绿（bundled 根真实目录 + 树内每包 manifest 可读 + 相对引用闭合）", () => {
    pkgDir("mammoth", { name: "mammoth", version: "1.13.0", main: "index.js" }, {
      "index.js": "require('./lib/inner');\n",
      "lib/inner.js": "module.exports = 1;\n",
    });
    const violations = auditBundledClosure(root, hostPkg(["mammoth"]));
    expect(violations).toEqual([]);
  });

  it("内联树内相对引用悬空 = 违规（丢 chunk 结构性拦截，闭包完整性）", () => {
    pkgDir("mammoth", { name: "mammoth", version: "1.13.0", main: "index.js" }, {
      "index.js": "require('./lib/missing');\n",
    });
    const violations = auditBundledClosure(root, hostPkg(["mammoth"]));
    expect(violations.some((v) => v.includes("相对引用悬空"))).toBe(true);
  });

  it("内联树内嵌套 node_modules 闭包同样受检（传递链全内联语义）", () => {
    pkgDir("mammoth", { name: "mammoth", version: "1.13.0", main: "index.js" }, {
      "index.js": "require('readable-stream');\n",
      // 嵌套依赖缺 package.json → 闭包破损
    });
    mkdirSync(join(root, "node_modules", "mammoth", "node_modules", "readable-stream"), { recursive: true });
    writeFileSync(
      join(root, "node_modules", "mammoth", "node_modules", "readable-stream", "index.js"),
      "module.exports = 1;\n",
    );
    const violations = auditBundledClosure(root, hostPkg(["mammoth"]));
    expect(violations.some((v) => v.includes("readable-stream") && v.includes("manifest"))).toBe(true);
  });
});

describe("auditBundledClosure ESM/CJS exports 解析验证", () => {
  it("main 指向缺席文件 = 违规（CJS 解析断链）", () => {
    pkgDir("mammoth", { name: "mammoth", version: "1.13.0", main: "lib/nope.js" }, {
      "index.js": "module.exports = {};\n",
    });
    const violations = auditBundledClosure(root, hostPkg(["mammoth"]));
    expect(violations.some((v) => v.includes("入口解析失败") && v.includes("mammoth"))).toBe(true);
  });

  it("exports map import/default 条目悬空 = 违规（ESM 解析断链）", () => {
    pkgDir("mammoth", {
      name: "mammoth",
      version: "1.13.0",
      type: "module",
      exports: { ".": { import: "./lib/esm.mjs", default: "./lib/esm.mjs" } },
    }, { "index.js": "export {};\n" });
    const violations = auditBundledClosure(root, hostPkg(["mammoth"]));
    expect(violations.some((v) => v.includes("入口解析失败"))).toBe(true);
  });

  it("exports string 简写 + type:module ESM 入口在场 = 通过", () => {
    pkgDir("mammoth", {
      name: "mammoth",
      version: "1.13.0",
      type: "module",
      exports: "./lib/index.mjs",
    }, { "lib/index.mjs": "export {};\n" });
    expect(auditBundledClosure(root, hostPkg(["mammoth"]))).toEqual([]);
  });

  it("无 exports/main 的传统 CJS 包按 index.js 约定解析（readable-stream@2 形态）", () => {
    pkgDir("mammoth", { name: "mammoth", version: "1.13.0", main: "index.js" }, {
      "index.js": "module.exports = 1;\n",
    });
    mkdirSync(join(root, "node_modules", "mammoth", "node_modules", "readable-stream"), { recursive: true });
    const rs = join(root, "node_modules", "mammoth", "node_modules", "readable-stream");
    writeFileSync(join(rs, "package.json"), JSON.stringify({ name: "readable-stream", version: "2.3.8", main: "readable.js" }));
    writeFileSync(join(rs, "readable.js"), "module.exports = 1;\n");
    expect(auditBundledClosure(root, hostPkg(["mammoth"]))).toEqual([]);
  });
});
