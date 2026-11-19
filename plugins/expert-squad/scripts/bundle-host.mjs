// Bundle the host half so the installable artifact is self-contained.
//
// 装载契约（dsh-dev 审计 2026-11 · bug 6a46cc75）：官方 dsh-plugin-manager 安装 =
// profile 目录裸跑 `pnpm add <spec>`，无 workspace 协议改写/依赖闭包解析/打包步骤
// ——插件产物必须自含（dependencies 全 registry 可解析）。@dsh-forge/contracts 是
// private workspace 包，不可 registry 安装 → host 面值依赖（tool-projection /
// subagent-assemble 纯逻辑族，运行期零传递依赖）在构建期闭包内联进 bundle；
// 官方机械（@deepseek-ai/*）与真实外部依赖（chokidar/gray-matter）外置。
//
// 入口直接取 TS 源（project 打包判例注入——fix-6：清单由 package.json exports 生成，
// 单一事实源，dist 中间产物入口退役）：exports 每个 dist/host 运行期入口镜像回 TS
// 源入口，esbuild 原生吃 TS 从源起 bundle，各入口全量闭包内联，与 tsc -b（类型链
// /.d.ts emit，emitDeclarationOnly——tsc 永不覆写 bundle .js，门禁序错位根治）解耦。
// Run once per build；run-once, no watch。
import { build } from "esbuild";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDist, exportsDistPaths } from "./self-containment.mjs";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

// 外置表：官方机械与 peer（内联第二副本会分裂官方单例语义）、真实外部依赖
// （registry 可装，留在 dependencies 由 pnpm 解析）。node 内建经 platform:"node"
// 自动外置。@dsh-forge/* 一律不外置（含 contracts）——独立安装形态不存在其解析路径。
const EXTERNAL = ["@deepseek-ai/*", "chokidar", "gray-matter"];

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

// 中间产物裁剪：KEEP = exports 运行期入口集（单一事实源）——其余 tsc 中间残留
// .js/.js.map 全部删除。.d.ts 类型面保留（exports types 解析链，type-only import
// 不属运行期断链面）。
const KEEP = new Set(HOST_RUNTIME_ENTRIES.map((rel) => resolve(pkgDir, rel)));
const prune = (dir) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, name.name);
    if (name.isDirectory()) prune(p);
    else if ((name.name.endsWith(".js") || name.name.endsWith(".js.map")) && !KEEP.has(p)) rmSync(p);
  }
};
prune(resolve(pkgDir, "dist/host"));

// 离手门：bundle 末尾自跑自含性断言 + exports 闭包完整性断言——非 0 即败，自含性是
// 产物性质，不是构建时点性质（bug eed9583b 判例）。
const violations = auditDist(pkgDir, { requireDist: true, exportsPrefixes: ["./dist/host"] });
if (violations.length > 0) {
  console.error(`[bundle-host] 离手门失败：dist 自含审计 ${violations.length} 处违规`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`[bundle-host] 离手门通过（${HOST_RUNTIME_ENTRIES.length} 入口全内联 + dist/host 全量自含）`);
