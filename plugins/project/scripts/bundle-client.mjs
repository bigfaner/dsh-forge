// Bundle the client half into the official client-modules registration shape.
//
// 装载契约（官方 clientBundle 配方；expert-squad 双面包装载范式镜像）：宿主把
// exports["./client"] 产物按 classic <script> 原样装载，产物必须自注册
// window.__ModuleLoader__.load({ id, factory })（cjs 体 + 注册头/module-var intro +
// return footer）。format:"esm" 产物带顶层 export/import.meta → classic script
// 语法错误 → 「loaded without registering」。
//
// fix-6：入口改取 TS 源（ui/index.ts，由 exports["./client"].types 镜像推导——单一
// 事实源，dist 中间产物入口与 css 随迁副本补丁税一并退役）。Run once per build；run-once, no watch。
//
// disc-1：css import 构建期内联为样式注入模块——esbuild 默认把 css 解析为独立副产物
// dist/client.css，而运行期装载面只有 dist/client.js 单一入口 → 官方宿主插件 UI 全裸
// 样式。官方缝核销（dsh-client-modules lib/client.js claimStyles/removeOwnedStyles）：
// 插件 factory 闭包内注入 <style data-plugin> 标签 = 官方归属/卸载机械的正道形态
// （「CSS injection lives inside the factory closure」——manifest.d.ts 契约原文）。
// 本包 css 均为全局层样式（非 CSS Modules），逐件转 style 注入语义等价；同一 css 件
// 可能被多个入口模块 import → 注入模块带同件幂等守卫（首注入为准）。
import { build } from "esbuild";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDist } from "./self-containment.mjs";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "@dsh-forge/project";
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

// 入口 = exports["./client"].types 镜像回 TS 源（dist/client/ui/index.d.ts → ui/index.ts）。
const clientExport = pkg.exports?.["./client"];
if (typeof clientExport?.types !== "string" || !clientExport.types.startsWith("./dist/client/")) {
  throw new Error("bundle-client: exports[\"./client\"].types 未指向 dist/client 类型面——exports 面漂移");
}
const clientSrcEntry = resolve(pkgDir, clientExport.types.replace(/^\.\//, "").replace(/^dist\/client\//, "").replace(/\.d\.ts$/, ".ts"));

// 平台基线外置表（对齐官方冻结种子表口径；react 永不内联——内联第二副本会使
// shell 渲染树 hooks 读到另一副本 dispatcher，Invalid hook call）。jsx-runtime 与
// 官方 primitives 同列外置（expert-squad/quote-plugins 判例：require 落壳层冻结
// 种子表单例——内联第二副本会分裂官方单例语义与 bundle 体积税）。
const PLATFORM_MODULES = [
  "react",
  "react/jsx-runtime",
  "@deepseek-ai/dsh-client-ui-primitives",
];

// css 内联注入插件（disc-1）：*.css import → JS 模块，模块体内注入
// <style data-plugin="@dsh-forge/project" data-plugin-css="<basename>">（官方
// claimStyles 预打标归属面——materialization 时官方机械清点、卸载时 removeOwnedStyles
// 回收）。factory 闭包整段执行时点 = materialization，顶层注入即闭包内注入。
const cssInjectPlugin = {
  name: "css-inline-inject",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, (args) => {
      const css = readFileSync(args.path, "utf8");
      const key = args.path.replaceAll("\\", "/");
      return {
        contents: [
          `const __cssKey__ = ${JSON.stringify(key)};`,
          `if (typeof document !== "undefined" && !document.querySelector('style[data-plugin-css="' + __cssKey__ + '"]')) {`,
          `  const __el__ = document.createElement("style");`,
          `  __el__.setAttribute("data-plugin", ${JSON.stringify(PLUGIN_ID)});`,
          `  __el__.setAttribute("data-plugin-css", __cssKey__);`,
          `  __el__.textContent = ${JSON.stringify(css)};`,
          `  document.head.appendChild(__el__);`,
          `}`,
          "module.exports = {};",
        ].join("\n"),
        loader: "js",
      };
    });
  },
};

await build({
  entryPoints: [clientSrcEntry],
  outfile: resolve(pkgDir, "dist/client.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  // jsx automatic（react-jsx 正门——工程 tsconfig 名为 tsconfig.client.json，esbuild 只
  // 向上搜 tsconfig.json 命中宿主面配置（无 jsx 键）→ 经典变换漏出 `React.createElement`
  // 裸全局（真机「React is not defined」判例 fix-13）；显式 automatic + jsx-runtime 外置
  // （PLATFORM_MODULES 种子表单例）。
  jsx: "automatic",
  external: PLATFORM_MODULES,
  plugins: [cssInjectPlugin],
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: `return module.exports; } });` },
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
});

// 中间产物裁剪：dist/client 仅保留 .d.ts 类型面（emitDeclarationOnly 下 tsc 本就不再
// 产 .js，此步只清历史残留 .js 与 css 随迁副本）。运行期装载面 = dist/client.js 单一
// bundle（exports "./client"）。
const pruneClient = (dir) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, name.name);
    if (name.isDirectory()) pruneClient(p);
    else if (name.name.endsWith(".js") || name.name.endsWith(".css") || name.name.endsWith(".js.map")) rmSync(p);
  }
};
pruneClient(resolve(pkgDir, "dist/client"));

// 离手门（fix-6）：bundle 末尾自跑自含性断言 + exports 闭包完整性断言——非 0 即败。
// disc-1：css 内联断言——client.js 必含样式注入面、独立 css 副产物必须退役（含历史残留清除）。
const clientJs = readFileSync(resolve(pkgDir, "dist/client.js"), "utf8");
if (!clientJs.includes('createElement("style")') || !clientJs.includes("data-plugin")) {
  console.error("[bundle-client] 离手门失败：client bundle 缺样式注入面（css 内联未生效）");
  process.exit(1);
}
rmSync(resolve(pkgDir, "dist/client.css"), { force: true });

// typert 迁移 1.4：./typert + ./remote 工件已由 generate-typert.mjs 生成步入 dist
// （build 链时序在 bundle-client 之前）——1.3 的 PENDING_GENERATED_ARTIFACTS 豁免表退役，
// 审计全量闭包零豁免。
const violations = auditDist(pkgDir, { requireDist: true });
if (violations.length > 0) {
  console.error(`[bundle-client] 离手门失败：dist 自含审计 ${violations.length} 处违规`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log("[bundle-client] 离手门通过（client bundle 自注册形状 + dist 全量自含）");
