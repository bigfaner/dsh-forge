// Bundle the host half so the installable artifact is self-contained.
//
// 装载契约（五件样板同构）：官方 dsh-plugin-manager 安装 = profile 目录裸跑
// `pnpm add <spec>`，无 workspace 协议改写/依赖闭包解析/打包步骤——插件产物必须自含。
// forge external 档（本脚本）：@dsh-forge/* 五件**不内联**——运行期由宿主 node_modules
// 解析已装五件（dependencies 五条相对 file: 声明为白名单承重面，self-containment
// allowPrivate 分档门核销）；官方机械（@deepseek-ai/*）外置。inline/tgz 档归 deep-build。
//
// 入口直接取 TS 源：exports 每个 dist/host 运行期入口镜像回 TS 源入口，esbuild 原生
// 吃 TS 从源起 bundle，与 tsc -b（类型链/.d.ts emit，emitDeclarationOnly）解耦。
// Run once per build；run-once, no watch。
import { build } from "esbuild";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDist, exportsDistPaths } from "./self-containment.mjs";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

// external 档白名单（限五件名 ∧ file: 依赖——评审修订 5 分档门）：
// 五件在独立安装形态由宿主 node_modules 解析（dependencies file: 声明承重），
// 其余 @dsh-forge/* 裸名仍一律违规。
const COMPOSED_MEMBERS = [
  "@dsh-forge/project",
  "@dsh-forge/spec",
  "@dsh-forge/task-loop",
  "@dsh-forge/expert-squad",
  "@dsh-forge/knowledge",
];

// 外置表：官方机械与 peer（内联第二副本会分裂官方单例语义）+ external 档五件。
const EXTERNAL = ["@deepseek-ai/*", ...COMPOSED_MEMBERS];

// 内联入口 = package.json exports 全部 dist/host 运行期入口镜像回 TS 源（单一事实源
// ——dist/host/x.js ↔ host/x.ts 同形镜像，exports 改面入口自动随动）。
const HOST_RUNTIME_ENTRIES = exportsDistPaths(pkg).filter(
  (rel) => rel.startsWith("./dist/host/") && rel.endsWith(".js"),
);
if (HOST_RUNTIME_ENTRIES.length === 0) {
  throw new Error("bundle-host: package.json exports 无 dist/host 运行期入口——exports 面漂移");
}
const distToSrc = (rel) => rel.replace(/^\.\//, "").replace(/^dist\//, "").replace(/\.js$/, ".ts");
const ENTRY_POINTS = HOST_RUNTIME_ENTRIES.map((rel) => resolve(pkgDir, distToSrc(rel)));

await build({
  entryPoints: ENTRY_POINTS,
  outdir: resolve(pkgDir, "dist/host"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: EXTERNAL,
  allowOverwrite: true,
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
});

// 中间产物裁剪：KEEP = exports 运行期入口集（单一事实源）——其余 tsc 中间 .js/.js.map
// 全部删除（emitDeclarationOnly 下 tsc 本就不再产 .js，此步只清历史残留）。
// .d.ts 类型面保留（exports types 解析链，type-only import 不属运行期断链面）。
const KEEP = new Set(HOST_RUNTIME_ENTRIES.map((rel) => resolve(pkgDir, rel)));
const prune = (dir) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, name.name);
    if (name.isDirectory()) prune(p);
    else if ((name.name.endsWith(".js") || name.name.endsWith(".js.map")) && !KEEP.has(p)) rmSync(p);
  }
};
prune(resolve(pkgDir, "dist/host"));

// 离手门：bundle 末尾自跑自含性断言 + exports 闭包完整性断言——非 0 即败，
// 自含性是产物性质，不是构建时点性质。external 档 allowPrivate 白名单在此生效。
const violations = auditDist(pkgDir, {
  requireDist: true,
  exportsPrefixes: ["./dist/host"],
  allowPrivate: COMPOSED_MEMBERS,
});
if (violations.length > 0) {
  console.error(`[bundle-host] 离手门失败：dist 自含审计 ${violations.length} 处违规`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`[bundle-host] 离手门通过（${HOST_RUNTIME_ENTRIES.length} 入口 + external 档五件白名单 + dist 全量自含）`);
