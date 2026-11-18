// Bundle the client half into the official client-modules registration shape.
//
// 装载契约（官方 clientBundle 配方；input-history 双面包装载范式镜像）：宿主把
// exports["./client"] 产物按 classic <script> 原样装载，产物必须自注册
// window.__ModuleLoader__.load({ id, factory })（cjs 体 + 注册头/module-var intro +
// return footer）。format:"esm" 产物带顶层 export/import.meta → classic script
// 语法错误 → 「loaded without registering」。
//
// 入口改取 TS 源（ui/index.ts，由 exports["./client"].types 镜像推导——单一事实源，
// dist 中间产物入口退役）。UI 三面归位（步③）前本入口为占位（零导出零注册）——
// 门随结构步先立，UI 归位只换入口内容。Run once per build；run-once, no watch。
import { build } from "esbuild";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDist } from "./self-containment.mjs";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "@dsh-forge/knowledge";
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

// 入口 = exports["./client"].types 镜像回 TS 源（dist/client/ui/index.d.ts → ui/index.ts）。
const clientExport = pkg.exports?.["./client"];
if (typeof clientExport?.types !== "string" || !clientExport.types.startsWith("./dist/client/")) {
  throw new Error('bundle-client: exports["./client"].types 未指向 dist/client 类型面——exports 面漂移');
}
const clientSrcEntry = resolve(
  pkgDir,
  clientExport.types.replace(/^\.\//, "").replace(/^dist\/client\//, "").replace(/\.d\.ts$/, ".ts"),
);

// 平台基线外置表（对齐官方冻结种子表口径；react 永不内联——内联第二副本会使
// shell 渲染树 hooks 读到另一副本 dispatcher，Invalid hook call）。UI 组件化后
// jsx-runtime 消费出现，与 react 同列外置；`@deepseek-ai/dsh-client-ui-primitives`
// 同列外置（quote-plugins 判例：require 落壳层冻结种子表单例——内联第二副本会
// 分裂官方单例语义与 bundle 体积税）。
const PLATFORM_MODULES = [
  "react",
  "react/jsx-runtime",
  "@deepseek-ai/dsh-client-ui-primitives",
];

await build({
  entryPoints: [clientSrcEntry],
  outfile: resolve(pkgDir, "dist/client.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  // jsx automatic（react-jsx 正门——esbuild 只向上搜 tsconfig.json 命中宿主面配置
  // （无 jsx 键）→ 经典变换漏出 `React.createElement` 裸全局（project 真机判例
  // fix-13）；显式 automatic + jsx-runtime 外置（PLATFORM_MODULES 种子表单例）。
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

// 中间产物裁剪：dist/client 仅保留 .d.ts 类型面（emitDeclarationOnly 下 tsc 本就不再
// 产 .js，此步只清历史残留）。运行期装载面 = dist/client.js 单一 bundle（exports
// "./client"）。
const pruneClient = (dir) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, name.name);
    if (name.isDirectory()) pruneClient(p);
    else if (name.name.endsWith(".js") || name.name.endsWith(".js.map")) rmSync(p);
  }
};
pruneClient(resolve(pkgDir, "dist/client"));

// 离手门：bundle 末尾自跑自含性断言 + exports 闭包完整性断言——非 0 即败。
const violations = auditDist(pkgDir, { requireDist: true });
if (violations.length > 0) {
  console.error(`[bundle-client] 离手门失败：dist 自含审计 ${violations.length} 处违规`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log("[bundle-client] 离手门通过（client bundle 自注册形状 + dist 全量自含）");
