// Bundle the host half so the installable artifact is self-contained.
//
// 装载契约（expert-squad 先例逐字承袭）：官方 dsh-plugin-manager 安装 = profile 目录
// 裸跑 `pnpm add <spec>`，无 workspace 协议改写/依赖闭包解析/打包步骤——插件产物必须
// 自含（dependencies 全 registry 可解析）。@dsh-forge/lib-* 是 private workspace 包，
// 不可 registry 安装 → host 面值依赖（lib 公共包群，提案 §二「lib 打包语义」：用哪个
// 子包打哪个，按需内联不整群拖入）在构建期闭包内联进 dist/host/index.js；官方机械
// （@deepseek-ai/*）与真实外部依赖外置（registry 可装，留 dependencies 由 pnpm 解析
// ——better-sqlite3 随 host/db 域落位时入 dependencies 并在此保持外置）。tsc -b 先行
// 保证 dist/*.d.ts 类型链（lib 类型面经 devDependencies workspace link 在仓内解析）；
// client 面先例 = scripts/bundle-client.mjs（同构，差异仅 platform 与外置表）。
// Run once per build；run-once, no watch。
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 外置表：官方机械与 peer（内联第二副本会分裂官方单例语义）。node 内建经
// platform:"node" 自动外置。@dsh-forge/* 一律不外置（含 lib 子包）——独立安装形态
// 不存在其解析路径。
const EXTERNAL = ["@deepseek-ai/*", "better-sqlite3"];

await build({
  entryPoints: [resolve(pkgDir, "dist/host/index.js")],
  outfile: resolve(pkgDir, "dist/host/index.js"),
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
