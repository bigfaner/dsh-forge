// Bundle the host half so the installable artifact is self-contained.
//
// 装载契约（dsh-dev 审计 2026-11 · bug 6a46cc75）：官方 dsh-plugin-manager 安装 =
// profile 目录裸跑 `pnpm add <spec>`，无 workspace 协议改写/依赖闭包解析/打包步骤
// ——插件产物必须自含（dependencies 全 registry 可解析）。@dsh-forge/contracts 是
// private workspace 包，不可 registry 安装 → host 面值依赖（tool-projection /
// subagent-assemble 纯逻辑族，运行期零传递依赖）在构建期闭包内联进 dist/index.js；
// 官方机械（@deepseek-ai/*）与既有外部依赖外置。tsc -b 先行保证 dist/*.d.ts 类型
// 链（contracts 类型面经 devDependencies workspace link 在仓内解析）；client 面先例
// = scripts/bundle-client.mjs（本脚本与其同构，差异仅 platform 与外置表）。
// Run once per build；run-once, no watch.
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 外置表：官方机械与 peer（内联第二副本会分裂官方单例语义）、真实外部依赖
// （registry 可装，留在 dependencies 由 pnpm 解析）。node 内建经 platform:"node"
// 自动外置。@dsh-forge/* 一律不外置（含 contracts）——独立安装形态不存在其解析路径。
const EXTERNAL = [
  "@deepseek-ai/*",
  "chokidar",
  "gray-matter",
];

await build({
  entryPoints: [resolve(pkgDir, "dist/index.js")],
  outfile: resolve(pkgDir, "dist/index.js"),
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
