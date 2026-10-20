// Bundle the client half into the official client-modules registration shape.
//
// 装载契约（官方 clientBundle 配方；annotutor gotcha-web-boot 判例移植——双面包
// 装载范式首建，后续 edit-resend 插件复用）：宿主把 exports["./client"] 产物按
// classic <script> 原样装载，产物必须自注册 window.__ModuleLoader__.load({ id,
// factory })（cjs 体 + 注册头/module-var intro + return footer）。format:"esm"
// 产物带顶层 export/import.meta → classic script 语法错误 → 「loaded without
// registering」→ web boot「1 entry did not activate」。Run once per build；
// run-once, no watch。
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "@dsh-forge/input-history";

// 平台基线种子表（官方 PLATFORM_MODULES 冻结种子表，与 annotutor 判例同款，
// 需与官方 packages/client/web/src/platform.ts 保持同步）：react 等经 factory
// 的 require 对壳层冻结种子表解析——内联第二份 react 会使 shell 渲染树里的组件
// hooks 读到另一副本的 dispatcher。表外依赖全部内联。
const PLATFORM_MODULES = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-client-store",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-client-ui-dockkit",
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
