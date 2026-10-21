// Bundle the client half into the official client-modules registration shape.
//
// 装载契约（官方 clientBundle 配方；input-history 判例同构移植）：宿主把
// exports["./client"] 产物按 classic <script> 原样装载，产物必须自注册
// window.__ModuleLoader__.load({ id, factory })（cjs 体 + 注册头/module-var intro +
// return footer）。format:"esm" 产物带顶层 export/import.meta → classic script 语法
// 错误 → 「loaded without registering」→ web boot「1 entry did not activate」。
// Run once per build；run-once, no watch（工作区 AGENTS §2 run-once 纪律）。
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "@dsh-forge/quote-reference";

// 平台基线外置表（对齐官方 packages/client/web/src/platform.ts 冻结种子表口径）：
// 收敛为本 client face 运行期经 factory require 实际可达的依赖。当前骨架零运行期
// 平台 require（选区监听/样式注入为纯逻辑，react-dom 与 ui-* 只在宿主壳层消费、
// type-only import 构建期已擦除——esbuild 不会为类型引用发 require）。保留 react
// 种子位：后续任务（selection-menu primitives Menu 缝合）组件化消费一旦出现，
// require 必须落到壳层冻结种子表单例——内联第二份 react 会使 shell 渲染树组件
// hooks 读到另一副本的 dispatcher（Invalid hook call）。表外依赖全部内联。
// react 家族种子（组件 hooks 与 jsx transform 均须共用壳层单例）+ react-dom/client
//（弹层 createRoot/flushSync）+ primitives（Menu 原样材质——与壳层同一模块实例，
// 零内联副本、零 css 副产物问题）。全部落在官方冻结种子表口径内（dsh-client-web
// platform.ts PLATFORM_MODULES 逐位核对）。
const PLATFORM_MODULES = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/dsh-client-ui-primitives",
];

await build({
  entryPoints: [resolve(pkgDir, "dist/client/index.js")],
  outfile: resolve(pkgDir, "dist/client.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  external: PLATFORM_MODULES,
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: `return module.exports; } });` },
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
});
