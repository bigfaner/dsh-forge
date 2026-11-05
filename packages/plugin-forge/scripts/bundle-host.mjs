// Bundle the host half so the installable artifact is self-contained.
//
// 装载契约（bug 9083f0f0，expert-squad bundle-host.mjs 同构先例）：官方 dsh-plugin-manager
// 安装 = 拷源目录进 generation/source/ 后以 file: 依赖 pnpm 安装，workspace:* 依赖被
// 丢弃——外部宿主既无 workspace 邻接也无 @dsh-forge/* 发布渠道。@dsh-forge/contracts
// 与 @dsh-forge/path-key 均为 private workspace 包（前者运行期零依赖；后者为纯逻辑
// path 规范化）→ 构建期闭包内联进 dist/index.js；官方机械（@deepseek-ai/*）与真实
// 外部依赖外置。tsc -b 先行保证 dist/*.d.ts 类型链。Run once per build；run-once, no watch.
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 外置表：官方机械与真实外部依赖（registry 可装，留在 dependencies 由 pnpm 解析）。
// node 内建经 platform:"node" 自动外置。@dsh-forge/* 一律不外置——独立安装形态不存在
// 其解析路径。
const EXTERNAL = [
  "@deepseek-ai/*",
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
