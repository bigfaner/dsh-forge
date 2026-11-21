// deep-build.mjs — forge 单文件 tgz 主通道打包器（forge-deep-pack 1.7，提案 §二.2 + §五 R4）。
//
// Run-once CLI：node scripts/deep-build.mjs [--out <dir>]（禁 watch——AGENTS §2）。
// DEEP_BUILD_SKIP_REBUILD=1 时跳过 pnpm build 步（仅开发迭代形态——代际双校验仍在，
// 在盘 dist 陈旧照样 fail，门禁语义不受 flag 影响）。
//
// 流程（不信任任何在盘 dist——R4 用户裁定：打包脚本必须自动编译）：
//   ① freshness 门：按依赖序逐件 `pnpm -C plugins/<x> build` 自动编译五件 + forge
//      本体（run-once，tsc 增量承担幂等）；
//   ② 代际双校验：编译后产物代际标记（dist/client.js `@dsh-forge-generation:pkg@ver`）
//      == 源 package.json version——陈旧即 fail（反例实证：project 源 0.26.4 vs dist
//      0.26.3；自动编译根治 + 代际校验防中途改源）；
//   ③ host 单文件（inline 档）：esbuild 沿解析链内联五件 dist（含 typert 工件子路径）
//      ——external 仅 @deepseek-ai/*（cordis/官方 runtime）/better-sqlite3（native）/
//      五件自带 registry 运行期依赖（逐件 package.json dependencies 驱动聚合进生成版
//      manifest——五件自带 external 语义在 inline 档照常成立）；
//   ④ 生成版 package.json：剥五条 file: 依赖（deep 依赖面非源树事实——539b7413/
//      a96e09a5：plain dependency 不进层，五件激活只经组合缝）；registry 运行期依赖
//      按五件 dependencies 并集实体化；保留 ./package.json 出口（skills 自锚 resolve
//      承重面）+ dsh 声明面（patch/client）+ cordis peer；
//   ⑤ client 复用：forge 常规构建的 dist/client.js（五件合并自注册 bundle——1.5 A
//      形态产物同源复用，非重打包）；
//   ⑥ 资产聚合复用：dist/skills/<member>/（1.14 处方 C 构建期复制产物）+ experts/
//      （布局同构重定位）+ cordis.patch.yml（单行自插 + 集成 config——aggregate-assets
//      同源产物）随 staging 原样收录；
//   ⑦ tgz 组装 + auditTarballFile 一站式审计（inline 档零豁免）+ 构建闭包守卫
//      （P0 #4：内联痕迹与 experts 同构在位绑定 + 无下游内联五件 host 入口）。
//
// 产物：dist-deep/package/（staging 解包形态）+ dist-deep/forge-deep-<version>.tgz。
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDist, auditTarballFile, auditTarballManifest, COMPOSED_MEMBERS, walkJs } from "./self-containment.mjs";

const FORGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(FORGE_ROOT, "..", "..");
const pkg = JSON.parse(readFileSync(join(FORGE_ROOT, "package.json"), "utf8"));
const PLUGIN_ID = pkg.name;

const argv = process.argv.slice(2);
const outFlag = argv.indexOf("--out");
const OUT_DIR = outFlag !== -1 ? resolve(argv[outFlag + 1]) : join(FORGE_ROOT, "dist-deep");
const STAGING = join(OUT_DIR, "package");
const SKIP_REBUILD = process.env.DEEP_BUILD_SKIP_REBUILD === "1";

const fail = (message) => {
  console.error(`[deep-build] ${message}`);
  process.exit(1);
};
const log = (message) => console.log(`[deep-build] ${message}`);

// ── 依赖序（拓扑序——五件 dependencies 中引用兄弟成员者排在被依赖件之后）───────
const memberDir = (member) => join(REPO_ROOT, "plugins", member.replace("@dsh-forge/", ""));
const memberManifest = (member) => JSON.parse(readFileSync(join(memberDir(member), "package.json"), "utf8"));
const topoOrder = (() => {
  const depsOf = new Map(
    COMPOSED_MEMBERS.map((m) => [
      m,
      Object.keys(memberManifest(m).dependencies ?? {}).filter((d) => COMPOSED_MEMBERS.includes(d)),
    ]),
  );
  const ordered = [];
  const placed = new Set();
  const visit = (m, seen) => {
    if (placed.has(m)) return;
    if (seen.has(m)) fail(`依赖环：${[...seen, m].join(" → ")}`);
    seen.add(m);
    for (const d of depsOf.get(m)) visit(d, seen);
    seen.delete(m);
    placed.add(m);
    ordered.push(m);
  };
  for (const m of COMPOSED_MEMBERS) visit(m, new Set());
  return ordered;
})();

// 五件 registry 运行期依赖并集（inline 档 external 面 + 生成版 dependencies 实体化
// ——@dsh-forge/* file: 依赖剥除不在此列，better-sqlite3 同值去重）。
const registryDeps = new Map();
for (const member of COMPOSED_MEMBERS) {
  for (const [name, spec] of Object.entries(memberManifest(member).dependencies ?? {})) {
    if (name.startsWith("@dsh-forge/")) continue; // plain dependency 不进层——组合缝激活
    if (registryDeps.has(name) && registryDeps.get(name) !== spec) {
      fail(`registry 依赖版本冲突：${name} ${registryDeps.get(name)} vs ${spec}（${member}）`);
    }
    registryDeps.set(name, spec);
  }
}
const REGISTRY_DEP_NAMES = [...registryDeps.keys()].sort();

// ── ① freshness 门（R4）：逐件 run-once 自动编译 ────────────────────────────
function runBuild(label, pkgDir) {
  log(`freshness 门：pnpm -C ${relative(REPO_ROOT, pkgDir)} build（run-once）…`);
  const r = spawnSync("pnpm", ["-C", pkgDir, "build"], { cwd: REPO_ROOT, stdio: "inherit", shell: true });
  if (r.status !== 0) fail(`${label} 自动编译失败（exit ${r.status}）——freshness 门中止`);
}

if (!SKIP_REBUILD) {
  for (const member of topoOrder) runBuild(member, memberDir(member));
  runBuild(PLUGIN_ID, FORGE_ROOT);
} else {
  log("DEEP_BUILD_SKIP_REBUILD=1——跳过自动编译步（代际双校验仍强制）");
}

// ── ② 代际双校验：产物代际标记 == 源 package.json version ────────────────────
function verifyGeneration(label, dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const clientPath = join(dir, "dist/client.js");
  if (!existsSync(clientPath)) fail(`${label} 代际校验失败：dist/client.js 缺席（build 链漂移）`);
  const marker = `/* @dsh-forge-generation:${manifest.name}@${manifest.version}*/`;
  const clientText = readFileSync(clientPath, "utf8");
  if (!clientText.includes(marker)) {
    fail(
      `${label} 代际校验失败：dist/client.js 代际标记 ≠ 源 package.json version ${manifest.version}` +
        `（陈旧反例实证：源 ${manifest.version} vs dist 在盘标记漂移）——freshness 门 fail`,
    );
  }
  if (!existsSync(join(dir, "dist/host/index.js"))) fail(`${label} 代际校验失败：dist/host/index.js 缺席`);
  log(`代际双校验通过：${label}@${manifest.version}`);
}
for (const member of topoOrder) verifyGeneration(member, memberDir(member));
verifyGeneration(PLUGIN_ID, FORGE_ROOT);

// ── ③-⑥ staging 组装 ───────────────────────────────────────────────────────
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(join(STAGING, "dist/host"), { recursive: true });

// 生成版 manifest：剥五条 file:（deep 依赖面非源树事实）；registry 依赖实体化；
// 保留 ./package.json 出口（skills 自锚 resolve 承重面）+ dsh patch/client 声明面。
const deepManifest = {
  name: PLUGIN_ID,
  version: pkg.version,
  private: true,
  type: "module",
  description: pkg.description,
  main: "./dist/host/index.js",
  exports: {
    "./package.json": "./package.json",
    ".": { import: "./dist/host/index.js" },
    "./client": { default: "./dist/client.js" },
  },
  dsh: pkg.dsh,
  files: ["dist", "cordis.patch.yml", "experts"],
  peerDependencies: pkg.peerDependencies,
  dependencies: Object.fromEntries(REGISTRY_DEP_NAMES.map((name) => [name, registryDeps.get(name)])),
};
writeFileSync(join(STAGING, "package.json"), `${JSON.stringify(deepManifest, null, 2)}\n`, "utf8");

// ⑤ client 复用（1.5 A 形态产物同源——五件合并自注册 bundle 原样收录）
cpSync(join(FORGE_ROOT, "dist/client.js"), join(STAGING, "dist/client.js"));
// ⑥ 资产聚合复用（1.14 构建期复制产物）
cpSync(join(FORGE_ROOT, "dist/skills"), join(STAGING, "dist/skills"), { recursive: true });
cpSync(join(FORGE_ROOT, "experts"), join(STAGING, "experts"), { recursive: true });
cpSync(join(FORGE_ROOT, "cordis.patch.yml"), join(STAGING, "cordis.patch.yml"));

// ③ host 单文件（inline 档）：入口 = exports "." 镜像回 TS 源（单一事实源，bundle-host
// 同构镜像法）；esbuild 沿解析链内联五件 dist（file: 链接 → 兄弟包产物消费非源码）。
const mainExport = pkg.exports?.["."];
if (typeof mainExport?.import !== "string") fail('exports["."] 面漂移：缺 import 目标');
const hostSrcEntry = resolve(
  FORGE_ROOT,
  mainExport.import.replace(/^\.\//, "").replace(/^dist\/host\//, "host/").replace(/\.js$/, ".ts"),
);
await build({
  entryPoints: [hostSrcEntry],
  outfile: join(STAGING, "dist/host/index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  // inline 档 external 面：官方单例（内联第二副本分裂单例语义）+ native 模块 + 五件
  // 自带 registry 运行期依赖（生成版 dependencies 实体化——宿主 pnpm 解析）。
  // @dsh-forge/* 一律不外置（零豁免——组合缝激活，五件 dist 全量内联）。
  external: ["@deepseek-ai/*", "better-sqlite3", ...REGISTRY_DEP_NAMES],
  allowOverwrite: true,
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
});
log(`host 单文件产出：${relative(REPO_ROOT, join(STAGING, "dist/host/index.js"))}（五件 inline）`);

// ── ⑦ 构建闭包守卫 + 一站式审计 ─────────────────────────────────────────────
const violations = [];

// P0 #4 布局同构锚：dist/host/*.js 的 import.meta.url → ../../experts/ 恰落 staging 包根。
const expectedExperts = resolve(join(STAGING, "dist/host"), "..", "..", "experts");
if (resolve(join(STAGING, "experts")) !== expectedExperts) {
  violations.push(`experts 布局不同构：${join(STAGING, "experts")} ≠ ${expectedExperts}`);
}

// P0 #4 漂移防线：内联痕迹（../../experts/ 字面量）只允许出现在唯一 host 入口——
// 任何下游 .js 出现内联五件 host 入口痕迹而 experts 不同构在位即违规（ENOENT 静默
// 空返回防线）；同时断言唯一 host 入口确实内联（inline 档自证）。
const hostFiles = walkJs(join(STAGING, "dist/host"));
const INLINE_TRACE = /["']\.\.\/\.\.\/experts\/["']/;
const traced = hostFiles.filter((f) => INLINE_TRACE.test(readFileSync(f, "utf8")));
if (hostFiles.length !== 1 || !hostFiles[0].endsWith("index.js")) {
  violations.push(`单文件形状漂移：dist/host 应恰一 index.js，实际 ${hostFiles.length} 件`);
}
if (traced.length !== 1) {
  violations.push(`expert-squad 内联痕迹缺席或扩散（${traced.length} 件命中）——inline 档自证失败`);
}

// 资产新鲜度（构建链产物直接收录——集齐断言防收录遗漏）
const walkRel = (dir, root = dir) => {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkRel(full, root));
    else out.push(relative(root, full).replaceAll("\\", "/"));
  }
  return out.sort();
};
for (const member of topoOrder) {
  const bare = member.replace("@dsh-forge/", "");
  const srcSet = walkRel(join(memberDir(member), "skills")).filter((f) => f !== ".gitkeep");
  const dstSet = walkRel(join(STAGING, "dist/skills", bare)).filter((f) => f !== ".gitkeep");
  if (JSON.stringify(srcSet) !== JSON.stringify(dstSet)) {
    violations.push(`staging skills/${bare} 聚合漂移（源 ${srcSet.length} 件 vs 收录 ${dstSet.length} 件）`);
  }
}
if (JSON.stringify(walkRel(join(REPO_ROOT, "plugins/expert-squad/experts"))) !== JSON.stringify(walkRel(join(STAGING, "experts")))) {
  violations.push("staging experts 聚合漂移（≠ expert-squad/experts）");
}
if (!existsSync(join(STAGING, "cordis.patch.yml"))) violations.push("cordis.patch.yml 缺席（单行自插 patch 收录遗漏）");
if (!existsSync(join(STAGING, "dist/client.js")) ||
  readFileSync(join(STAGING, "dist/client.js"), "utf8") !== readFileSync(join(FORGE_ROOT, "dist/client.js"), "utf8")) {
  violations.push("staging client.js ≠ forge dist/client.js（bundle-client 产物复用断言失败）");
}

// manifest 审计（零协议依赖 + 零 @dsh-forge/* 声明）——生成版依赖面即事实源
const manifestViolations = auditTarballManifest(deepManifest);
violations.push(...manifestViolations);

// dist 全量自含审计（inline 档零豁免——不传 allowPrivate）
violations.push(...auditDist(STAGING, { requireDist: true }));

if (violations.length > 0) {
  console.error(`[deep-build] 构建闭包守卫 ${violations.length} 处违规：`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
log(`闭包守卫通过（单文件形状 + experts 同构 + skills 聚合 + client 复用 + dist 零豁免自含）`);

// tgz 组装 + auditTarballFile 一站式审计
const tgzPath = join(OUT_DIR, `forge-deep-${pkg.version}.tgz`);
const tar = spawnSync("tar", ["-czf", tgzPath, "package"], { cwd: OUT_DIR, encoding: "utf8", shell: true });
if (tar.status !== 0) fail(`tgz 打包失败（exit ${tar.status}）：${String(tar.stderr ?? "").trim()}`);
const tgzViolations = auditTarballFile(tgzPath);
if (tgzViolations.length > 0) {
  console.error(`[deep-build] tarball 一站式审计 ${tgzViolations.length} 处违规：`);
  for (const v of tgzViolations) console.error(`  - ${v}`);
  process.exit(1);
}

log(`tgz 产出：${tgzPath}`);
log(`完成：forge-deep@${pkg.version}（freshness 自动编译 ${SKIP_REBUILD ? "跳过(flag)" : topoOrder.length + 1} 件 + 代际双校验 + 五件 inline + tgz 审计零违规）`);
