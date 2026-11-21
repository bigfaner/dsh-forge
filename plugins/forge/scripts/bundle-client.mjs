// Bundle the client half into the official client-modules registration shape.
//
// 装载契约（官方 clientBundle 配方；五件样板同构）：宿主把 exports["./client"] 产物按
// classic <script> 原样装载，产物必须自注册 window.__ModuleLoader__.load({ id, factory })
// （cjs 体 + 注册头/module-var intro + return footer）。format:"esm" 产物带顶层
// export/import.meta → classic script 语法错误 → 「loaded without registering」。
//
// 入口取 TS 源（ui/index.ts，由 exports["./client"].types 镜像推导——单一事实源）。
// client 合并形态（forge-deep-pack 1.5 / 提案 §二.2，P0 #6 定谳 A 形态）：入口 import
// 五件 dist/client.js 自注册 bundle（消费产物非源码）——五件注册全发生、序 = import
// 拼接序、单外层求值内收敛（守卫三件套归 bundle-client 构建期自检）。
//
// 五件 client 并集声明（评审修订 6 / R3·N7）：forge dsh.client 的 external ∪ inject
// 并集由本脚本从五件 package.json 的 dsh.client 字段驱动聚合——esbuild external 面 =
// 平台基线 ∪ 并集（宿主提供件一律 external 不打入），并与 forge package.json 的静态
// 声明做契约 pin（漂移即败）。css 内联注入面随视图批按样板补位（当前零视图零 css）。
// Run once per build；run-once, no watch。
import { build } from "esbuild";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDist, COMPOSED_MEMBERS } from "./self-containment.mjs";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "@dsh-forge/forge";
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

// 入口 = exports["./client"].types 镜像回 TS 源（dist/client/ui/index.d.ts → ui/index.ts）。
const clientExport = pkg.exports?.["./client"];
if (typeof clientExport?.types !== "string" || !clientExport.types.startsWith("./dist/client/")) {
  throw new Error("bundle-client: exports[\"./client\"].types 未指向 dist/client 类型面——exports 面漂移");
}
const clientSrcEntry = resolve(pkgDir, clientExport.types.replace(/^\.\//, "").replace(/^dist\/client\//, "").replace(/\.d\.ts$/, ".ts"));

// 五件 client 并集声明聚合（单一事实源 = 五件 package.json 的 dsh.client 字段；
// 五件源码零改动——本脚本只读字段，不写五件）。external = 运行期 require 的外置面，
// inject = 宿主注入面——两族同为「宿主提供件」，一律进 esbuild external 不打入。
const memberClientFace = (member) => {
  const memberPkg = JSON.parse(readFileSync(join(pkgDir, "node_modules", member, "package.json"), "utf8"));
  return memberPkg.dsh?.client ?? {};
};
const unionOf = (field) =>
  [...new Set(COMPOSED_MEMBERS.flatMap((m) => memberClientFace(m)[field] ?? []))].sort();
const externalUnion = unionOf("external");
const injectUnion = unionOf("inject");

// 契约 pin：forge package.json 的 dsh.client 声明必须恒等于并集（五件字段漂移而
// forge 声明未跟 → 此处 loud fail，杜绝装载面静默缺声明）。
const declaredExternal = pkg.dsh?.client?.external ?? [];
const declaredInject = pkg.dsh?.client?.inject ?? [];
const pinMismatch =
  JSON.stringify(declaredExternal) !== JSON.stringify(externalUnion) ||
  JSON.stringify(declaredInject) !== JSON.stringify(injectUnion);
if (pinMismatch) {
  throw new Error(
    `bundle-client: dsh.client 并集契约 pin 失败——external 期望 ${JSON.stringify(externalUnion)} 实际 ${JSON.stringify(declaredExternal)}；inject 期望 ${JSON.stringify(injectUnion)} 实际 ${JSON.stringify(declaredInject)}`,
  );
}

// 平台基线外置表（对齐官方冻结种子表口径；react 永不内联——内联第二副本会使
// shell 渲染树 hooks 读到另一副本 dispatcher）。jsx-runtime 与官方 primitives 同列
// 外置（五件判例：require 落壳层冻结种子表单例）。∪ 五件并集（宿主提供件一律
// external——合并体内联宿主提供件会造第二副本）。
const PLATFORM_MODULES = [
  "react",
  "react/jsx-runtime",
  "@deepseek-ai/dsh-client-ui-primitives",
];
const externalModules = [...new Set([...PLATFORM_MODULES, ...externalUnion, ...injectUnion])];

await build({
  entryPoints: [clientSrcEntry],
  outfile: resolve(pkgDir, "dist/client.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  // jsx automatic（react-jsx 正门——显式 automatic + jsx-runtime 外置，样板判例同构）。
  jsx: "automatic",
  external: externalModules,
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
// 产 .js，此步只清历史残留）。运行期装载面 = dist/client.js 单一 bundle（含五件合并
// 自注册单元）。
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
// client bundle 零 @dsh-forge/* 裸名（合并自注册内联形态）；allowPrivate = external
// 档五件白名单（dist/host 组合段 import 五件——运行期宿主 node_modules 解析），
// file: 依赖双条件由 auditDist 白名单分支核验。
const violations = auditDist(pkgDir, { requireDist: true, allowPrivate: COMPOSED_MEMBERS });
if (violations.length > 0) {
  console.error(`[bundle-client] 离手门失败：dist 自含审计 ${violations.length} 处违规`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(
  `[bundle-client] 离手门通过（client 合并自注册形状 + 五件并集 external=${JSON.stringify(externalUnion)} inject=${JSON.stringify(injectUnion)} + dist 全量自含）`,
);
