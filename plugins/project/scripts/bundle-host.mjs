// Bundle the host half so the installable artifact is self-contained.
//
// 装载契约（expert-squad 先例逐字承袭）：官方 dsh-plugin-manager 安装 = profile 目录
// 裸跑 `pnpm add <spec>`，无 workspace 协议改写/依赖闭包解析/打包步骤——插件产物必须
// 自含（dependencies 全 registry 可解析）。@dsh-forge/lib-* 是 private workspace 包，
// 不可 registry 安装 → host 面值依赖在构建期闭包内联进 bundle；官方机械
// （@deepseek-ai/*）与真实外部依赖外置（registry 可装，留 dependencies 由 pnpm 解析
// ——better-sqlite3 随 host/db 域落位时入 dependencies 并在此保持外置）。
//
// 入口直接取 TS 源（fix-5）：host/worktrees 由 tsconfig.client 工程经 project
// references 承载，root 工程不 emit 其 .js——以 dist tsc 中间产物为 bundle 入口在
// worktrees 面无解。esbuild 原生吃 TS，从源起 bundle 使三个入口全量闭包内联（含
// 传递引用），与 tsc -b（类型链 / .d.ts emit）解耦。Run once per build；run-once, no watch。
import { build } from "esbuild";
import { readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 外置表：官方机械与 peer（内联第二副本会分裂官方单例语义）。node 内建经
// platform:"node" 自动外置。@dsh-forge/* 一律不外置（含 lib 子包）——独立安装形态
// 不存在其解析路径（fix-5 判例：dsh-desktop pnpm runner 丢弃 workspace:* devDeps，
// 残留裸 import 即 ERR_MODULE_NOT_FOUND）。
const EXTERNAL = ["@deepseek-ai/*", "better-sqlite3"];

// 内联入口 = package.json exports 全部运行期宿主入口（main + 次级 host-dirs /
// host-worktrees）。任一 exports 可达的 dist 路径若停留在 tsc 中间产物形态，其 lib-*
// 裸 import 在独立安装形态都是断链——全部经 esbuild 闭包内联。
const ENTRY_POINTS = [
  "host/index.ts",
  "host/dirs/index.ts",
  "host/worktrees/index.ts",
].map((rel) => resolve(pkgDir, rel));

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

// 中间产物裁剪（fix-5）：bundle 后 dist/host 仅保留内联 bundle 入口——其余 tsc 中间
// .js 全部删除（其 @dsh-forge/* 裸 import 经 exports 次级入口/装载探测可达即断链）。
// .d.ts 类型面保留（exports types 解析链，type-only import 不属运行期断链面）。
const KEEP = new Set([
  resolve(pkgDir, "dist/host/index.js"),
  resolve(pkgDir, "dist/host/dirs/index.js"),
  resolve(pkgDir, "dist/host/worktrees/index.js"),
]);
const prune = (dir) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, name.name);
    if (name.isDirectory()) prune(p);
    else if (name.name.endsWith(".js") && !KEEP.has(p)) rmSync(p);
  }
};
prune(resolve(pkgDir, "dist/host"));

// tsbuildinfo 与 prune 后的 dist 不再一致（增量会把被删中间产物判为最新而跳过
// emit）——删除强制下次构建全量重出。
rmSync(resolve(pkgDir, "dist/.tsbuildinfo"), { force: true });
