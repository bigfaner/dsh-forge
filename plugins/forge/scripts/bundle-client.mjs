// Bundle the client half into the official client-modules registration shape.
//
// 装载契约（官方 clientBundle 配方；五件样板同构）：宿主把 exports["./client"] 产物按
// classic <script> 原样装载，产物必须自注册 window.__ModuleLoader__.load({ id, factory })
// （cjs 体 + 注册头/module-var intro + return footer）。format:"esm" 产物带顶层
// export/import.meta → classic script 语法错误 → 「loaded without registering」。
//
// 入口取 TS 源（ui/index.ts，由 exports["./client"].types 镜像推导——单一事实源）。
// 阶段一占位入口零视图零 css（五件 client 模块合并自注册归 1.4）——css 内联注入面
// 随合并批按 bundle-client 样板补位。Run once per build；run-once, no watch。
import { build } from "esbuild";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDist } from "./self-containment.mjs";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "@dsh-forge/forge";
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

// 入口 = exports["./client"].types 镜像回 TS 源（dist/client/ui/index.d.ts → ui/index.ts）。
const clientExport = pkg.exports?.["./client"];
if (typeof clientExport?.types !== "string" || !clientExport.types.startsWith("./dist/client/")) {
  throw new Error("bundle-client: exports[\"./client\"].types 未指向 dist/client 类型面——exports 面漂移");
}
const clientSrcEntry = resolve(pkgDir, clientExport.types.replace(/^\.\//, "").replace(/^dist\/client\//, "").replace(/\.d\.ts$/, ".ts"));

// 平台基线外置表（对齐官方冻结种子表口径；react 永不内联——内联第二副本会使
// shell 渲染树 hooks 读到另一副本 dispatcher）。jsx-runtime 与官方 primitives 同列
// 外置（五件判例：require 落壳层冻结种子表单例）。
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
  // jsx automatic（react-jsx 正门——显式 automatic + jsx-runtime 外置，样板判例同构）。
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
// 产 .js，此步只清历史残留）。运行期装载面 = dist/client.js 单一 bundle。
const pruneClient = (dir) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, name.name);
    if (name.isDirectory()) pruneClient(p);
    else if (name.name.endsWith(".js") || name.name.endsWith(".css") || name.name.endsWith(".js.map")) rmSync(p);
  }
};
pruneClient(resolve(pkgDir, "dist/client"));
rmSync(resolve(pkgDir, "dist/client.css"), { force: true });

// 离手门：bundle 末尾自跑自含性断言 + exports 闭包完整性断言——非 0 即败。
// client 面零 allowPrivate（合并自注册归 1.4 后亦为内联形态——五件 client 代码并入
// 本 bundle，不留 @dsh-forge/* 裸名引用）。
const violations = auditDist(pkgDir, { requireDist: true });
if (violations.length > 0) {
  console.error(`[bundle-client] 离手门失败：dist 自含审计 ${violations.length} 处违规`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log("[bundle-client] 离手门通过（client bundle 自注册形状 + dist 全量自含）");
