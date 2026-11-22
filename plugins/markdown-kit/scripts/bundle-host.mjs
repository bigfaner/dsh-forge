// Bundle the host half so the installable artifact is self-contained.
//
// 装载契约（dsh-dev 审计 2026-11 · bug 6a46cc75 家族）：官方 dsh-plugin-manager 安装 =
// profile 目录裸跑 `pnpm add <spec>`，无 workspace 协议改写/依赖闭包解析/打包步骤
// ——插件产物必须自含（dependencies 全 registry 可解析）。本包 host 半零 @dsh-forge/*
// 内部依赖；mermaid 是真实外部依赖（registry 可装，留 dependencies 由 pnpm 解析）外置。
//
// 入口直接取 TS 源（knowledge/expert-squad 打包判例同构——清单由 package.json exports
// 生成，单一事实源，dist 中间产物入口退役）：exports 每个 dist/host 运行期入口镜像回
// TS 源入口，esbuild 原生吃 TS 从源起 bundle，各入口全量闭包内联。ui 半（./web 出口）
// 不走 bundle——React DOM 增强器不经 client 束装载，tsc 原样 emit 供 apps 构建期打包；
// dist/host 内被 ui 相对引用的模块（validate 门控面）保留不被裁剪。Run once per
// build；run-once, no watch。
import { build } from "esbuild";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDist, exportsDistPaths, walkJs } from "./self-containment.mjs";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

// 外置表：真实外部依赖（registry 可装，留 dependencies）；node 内建经 platform:"node"
// 自动外置；react 族（peer，apps 壳层单例）自动外置由 PLATFORM_BARE 审计白名单承担。
const EXTERNAL = ["mermaid", "mammoth", "pdfjs-dist"];

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

// 中间产物裁剪：KEEP = exports 运行期入口集 ∪ ui 半（dist/ui）相对引用闭包达的
// dist/host 模块（ui 门控面 import '../host/validate/*'——./web 出口运行期依赖，裁掉
// 即 ui 面断链）。其余 tsc 中间残留 .js/.js.map 全部删除；.d.ts 类型面保留。
const KEEP = new Set(HOST_RUNTIME_ENTRIES.map((rel) => resolve(pkgDir, rel)));
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*|\brequire\(\s*|\bimport\(\s*)["']([^"']+)["']/g;
const queue = [...walkJs(resolve(pkgDir, "dist/ui"))];
while (queue.length > 0) {
  const file = queue.pop();
  for (const match of readFileSync(file, "utf8").matchAll(SPECIFIER)) {
    const spec = match[1];
    if (!spec.startsWith(".")) continue;
    const base = resolve(dirname(file), spec);
    for (const candidate of [base, `${base}.js`, `${base}.mjs`, join(base, "index.js")]) {
      if (
        candidate.startsWith(resolve(pkgDir, "dist/host")) &&
        /\.(js|mjs)$/.test(candidate) &&
        existsSync(candidate) &&
        !KEEP.has(candidate)
      ) {
        KEEP.add(candidate);
        queue.push(candidate);
      }
    }
  }
}
const prune = (dir) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, name.name);
    if (name.isDirectory()) prune(p);
    else if ((name.name.endsWith(".js") || name.name.endsWith(".js.map")) && !KEEP.has(p)) rmSync(p);
  }
};
prune(resolve(pkgDir, "dist/host"));

// 离手门：bundle 末尾自跑自含性断言 + exports 闭包完整性断言——非 0 即败，自含性是
// 产物性质，不是构建时点性质（bug eed9583b 判例）。ui 半 ./web 出口闭包终态由
// prepack（self-containment CLI 全量审计）兜底。
const violations = auditDist(pkgDir, { requireDist: true, exportsPrefixes: ["./dist/host"] });
if (violations.length > 0) {
  console.error(`[bundle-host] 离手门失败：dist 自含审计 ${violations.length} 处违规`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`[bundle-host] 离手门通过（${HOST_RUNTIME_ENTRIES.length} 入口全内联 + ui 闭包保留 ${KEEP.size - HOST_RUNTIME_ENTRIES.length} 模块 + dist/host 全量自含）`);
