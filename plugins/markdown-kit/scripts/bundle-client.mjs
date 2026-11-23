// Bundle the client half into the official client-modules registration shape.
//
// 装载契约（官方 clientBundle 配方；knowledge/project 判例镜像——双面包装载范式）：
// 宿主把 exports["./client"] 产物按 classic <script> 原样装载，产物必须自注册
// window.__ModuleLoader__.load({ id, factory })（cjs 体 + 注册头/module-var intro +
// return footer）。format:"esm" 产物带顶层 export/import.meta → classic script 语法
// 错误 → 「loaded without registering」→ web boot「1 entry did not activate」。
//
// 入口取 TS 源（ui/client.ts，由 exports["./client"].types 镜像回源推导——单一事实源）。
// 平台基线外置表对齐官方 packages/client/web/src/platform.ts 冻结种子表（react /
// react/jsx-runtime）；mermaid 是 ui 半引擎真实外部依赖但不在壳层种子表——classic
// script 语境 require('mermaid') 无解析径，必须内联（动态 import 内联后仍懒执行，
// 门控先行纪律不变）。Run once per build；run-once, no watch。
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDist, BUILD_TIME_EXTERNALS } from "./self-containment.mjs";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "@dsh-forge/markdown-kit";
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

const clientExport = pkg.exports?.["./client"];
if (typeof clientExport?.types !== "string" || !clientExport.types.startsWith("./dist/")) {
  throw new Error('bundle-client: exports["./client"].types 未指向 dist 类型面——exports 面漂移');
}
const clientSrcEntry = resolve(
  pkgDir,
  clientExport.types.replace(/^\.\//, "").replace(/^dist\//, "").replace(/\.d\.ts$/, ".ts"),
);

// 平台基线外置表（官方冻结种子表口径；react 永不内联——内联第二副本会使 shell 渲染树
// 组件 hooks 读到另一副本的 dispatcher（Invalid hook call））。
const PLATFORM_MODULES = ["react", "react/jsx-runtime"];

await build({
  entryPoints: [clientSrcEntry],
  outfile: resolve(pkgDir, "dist/client.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  // jsx automatic（react-jsx 正门；显式 automatic + jsx-runtime 外置——project 判例）。
  jsx: "automatic",
  external: PLATFORM_MODULES,
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;\n/* @dsh-forge-generation:${PLUGIN_ID}@${pkg.version}*/`,
  },
  footer: { js: `return module.exports; } });` },
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
});

// 离手门：bundle 末尾自跑自含性断言 + exports 闭包完整性断言——非 0 即败（bug eed9583b
// 判例：自含性是产物性质，不是构建时点性质）。
//
// dist/client.js 的裸名说明符扫描用专用 require 面断言替代通用启发式：内联 vendor 体
// （lodash/mermaid/d3）带 guarded require("util")、__name(fn,"x") 等形态，通用
// SPECIFIER 正则在此假阳；真实外置面 = esbuild 只对 PLATFORM_MODULES 发顶层
// require("...")——专扫该面（.require( 成员调用与字符串字面量不计）。
const clientJsPath = resolve(pkgDir, "dist/client.js");
const clientJs = readFileSync(clientJsPath, "utf8");
const REQUIRE_FACE = /(?:^|[^\w.$])require\(\s*["']([^"']+)["']\s*\)/g;
const bareRequires = new Set();
for (const match of clientJs.matchAll(REQUIRE_FACE)) {
  const spec = match[1];
  if (!PLATFORM_MODULES.includes(spec)) bareRequires.add(spec);
}
if (bareRequires.size > 0) {
  console.error(`[bundle-client] 离手门失败：client bundle 越出平台基线外置表 ${[...bareRequires].join(", ")}`);
  process.exit(1);
}
if (/^import[\s("']/m.test(clientJs) || /^export\b/m.test(clientJs) || clientJs.includes("import.meta")) {
  console.error("[bundle-client] 离手门失败：产物带顶层 ESM 语句/import.meta——classic script 语法不兼容");
  process.exit(1);
}
// 其余审计面（相对引用悬空 / @dsh-forge/* / exports 闭包）照跑——裸名假阳由
// self-containment 说明符级证伪面（块注释剥离 + 说明符字符形态 + node 内建白名单）
// 收敛承担，零整文件豁免（bug d00302ef 豁免面收敛）。
const violations = auditDist(pkgDir, {
  requireDist: true,
  exportsPrefixes: ["./dist/client.js"],
  buildTimeExternals: BUILD_TIME_EXTERNALS,
});
if (violations.length > 0) {
  console.error(`[bundle-client] 离手门失败：dist 自含审计 ${violations.length} 处违规`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
if (!clientJs.startsWith("window.__ModuleLoader__.load({")) {
  console.error("[bundle-client] 离手门失败：产物头非自注册注册头");
  process.exit(1);
}
console.log("[bundle-client] 离手门通过（client bundle 自注册形状 + 平台基线外置 + dist 全量自含）");
