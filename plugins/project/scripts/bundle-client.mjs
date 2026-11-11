// Bundle the client half into the official client-modules registration shape.
//
// 装载契约（官方 clientBundle 配方；expert-squad 双面包装载范式镜像）：宿主把
// exports["./client"] 产物按 classic <script> 原样装载，产物必须自注册
// window.__ModuleLoader__.load({ id, factory })（cjs 体 + 注册头/module-var intro +
// return footer）。format:"esm" 产物带顶层 export/import.meta → classic script
// 语法错误 → 「loaded without registering」。UI/shared 源码内联（无独立包）；
// 平台基线模块外置保官方单例。Run once per build；run-once, no watch。
import { build } from "esbuild";
import { cpSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "@dsh-forge/project";

// css 随迁副本（1.14 UI 迁入面）：add-project / bug-refs 组件体携带相对 css import，
// tsc 编译产物（dist/client/ui/**）保留该 import 但不带 css 文件——esbuild 从 dist
// 起解析会断链。装载语义：classic script 零 css 缝（官方 loader 无样式装载面），
// css 副产物 = esbuild 独立产物（dist/client.css）+ 壳侧经 exports./bug-preview.css
// 单源引装；此处副本仅为解析闭包完整。
function copyUiCss() {
  const walk = (srcDir, outDir) => {
    cpSync(srcDir, outDir, { recursive: true, filter: (s) => statSync(s).isDirectory() || s.endsWith(".css") });
  };
  walk(join(pkgDir, "ui"), join(pkgDir, "dist/client/ui"));
}
copyUiCss();

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

// 中间产物裁剪（fix-5）：bundle 后 dist/client 仅保留 .d.ts 类型面与 css 副迁件——
// tsc 中间 .js 全部删除（@dsh-forge/* 裸 import 在独立安装形态是断链面）。运行期
// 装载面 = dist/client.js 单一 bundle（exports "./client"）。
const pruneClient = (dir) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, name.name);
    if (name.isDirectory()) pruneClient(p);
    else if (name.name.endsWith(".js")) rmSync(p);
  }
};
pruneClient(resolve(pkgDir, "dist/client"));

// tsbuildinfo-client 与 prune 后的 dist 不再一致（增量会把被删中间产物判为最新而
// 跳过 emit）——删除强制下次构建全量重出。
rmSync(resolve(pkgDir, "dist/.tsbuildinfo-client"), { force: true });
