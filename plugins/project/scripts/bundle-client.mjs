// Bundle the client half into the official client-modules registration shape.
//
// 装载契约（官方 clientBundle 配方；expert-squad 双面包装载范式镜像）：宿主把
// exports["./client"] 产物按 classic <script> 原样装载，产物必须自注册
// window.__ModuleLoader__.load({ id, factory })（cjs 体 + 注册头/module-var intro +
// return footer）。format:"esm" 产物带顶层 export/import.meta → classic script
// 语法错误 → 「loaded without registering」。UI/shared 源码内联（无独立包）；
// 平台基线模块外置保官方单例。Run once per build；run-once, no watch。
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "@dsh-forge/project";

// 平台基线外置表（对齐官方冻结种子表口径；react 永不内联——内联第二副本会使
// shell 渲染树 hooks 读到另一副本 dispatcher，Invalid hook call）。jsx-runtime 与
// 官方 primitives 同列外置（expert-squad/quote-plugins 判例：require 落壳层冻结
// 种子表单例——内联第二副本会分裂官方单例语义与 bundle 体积税）。
const PLATFORM_MODULES = [
  "react",
  "react/jsx-runtime",
  "@deepseek-ai/dsh-client-ui-primitives",
];

await build({
  entryPoints: [resolve(pkgDir, "dist/client/ui/index.js")],
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
