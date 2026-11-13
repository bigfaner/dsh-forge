// 离手门（fix-6；bug eed9583b 家族）：产物自含性是产物性质，不是构建时点性质——
// bundle 脚本末尾自跑本断言（非 0 即败），任何时点的 dist 都必须整体通过：
//   1. 逐 bundle 文件全量扫描：dist 全部运行期 .js（含 index.js 与全部子目录）零
//      @dsh-forge/* 模块引用（lib-* 形态无白名单豁免；.d.ts 类型面不在断言面）；
//   2. 相对引用闭包：每个 .js 的相对 import/require 目标必须命中 dist 内存在文件
//      ——结构性拦「丢 chunk」（seams.js → extension-points.js 判例）；
//   3. exports 闭包完整性：package.json exports 每个 ./dist 路径必须存在于 dist。
// 未内联的 private 包名（@dsh-forge/*）在独立安装形态是断链；registry 不可装。
// 官方单例（@deepseek-ai/*，宿主壳层提供）与 dependencies 内 registry 依赖
// （better-sqlite3）外置合法；其余裸名一律违规。Run once per gate；run-once, no watch。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

// 模块说明符面匹配（from/import/require/动态 import 后跟字面量）——注释里的包名
// 字样不是运行期引用，不算违规。同族扫描器与 vitest 守卫共用此面值。
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*|\brequire\(\s*|\bimport\(\s*)["']([^"']+)["']/g;

const NODE_PREFIX = "node:";
const OFFICIAL_SINGLETON = "@deepseek-ai/";
const PRIVATE_NAMESPACE = "@dsh-forge/";

// 平台外置白名单（合法外置面，audit 记忆锚）：
//   - @deepseek-ai/* 官方单例（宿主壳层提供解析路径）；
//   - react 族（client bundle 平台基线——shell 冻结种子表单例，react 永不内联）；
//   - node: 前缀内建。
const PLATFORM_BARE = /^(?:react|react-dom)(?:\/[A-Za-z0-9-]+)?$/;

export function walkJs(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...walkJs(p));
    else if (name.name.endsWith(".js") && !name.name.endsWith(".d.js")) out.push(p);
  }
  return out;
}

/** package.json exports 全部 ./dist 路径（import/default/types 子字段）。 */
export function exportsDistPaths(pkg) {
  const out = [];
  for (const value of Object.values(pkg.exports ?? {})) {
    for (const field of ["import", "default", "types", "require"]) {
      const target = value?.[field];
      if (typeof target === "string" && target.startsWith("./dist/")) out.push(target);
    }
  }
  return out;
}

/**
 * 全量审计 dist（相对 pkgDir）。requireDist=false 时 dist 缺席返回空（纯 src 测试树
 * 跳过语义）；离手门调用恒传 true——产物缺席即违规。
 */
export function auditDist(pkgDir, { requireDist = false, exportsPrefixes = ["./dist"] } = {}) {
  const distDir = join(pkgDir, "dist");
  const violations = [];
  if (!existsSync(distDir)) {
    if (requireDist) violations.push(`dist 缺席（${distDir}）——先 pnpm -C . build 产出自含 bundle`);
    return violations;
  }
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const runtimeDeps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);

  // 逐 bundle 文件全量扫描（fix-6：不再抽样、不再只扫「引用存在」——被引用文件
  // 存在性同样在断言面）。
  for (const file of walkJs(distDir)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(SPECIFIER)) {
      const spec = match[1];
      // 说明符形态过滤：模块名不含空白/引号——数据映射表里的字符串字面量（d3 css
      // 键表 "from"/"fx" 判例）不是运行期引用。
      if (/[\s"']/.test(spec)) continue;
      if (spec.startsWith(".")) {
        // 相对引用必须命中 dist 内存在文件（丢 chunk 结构性拦截）。
        const base = resolve(dirname(file), spec);
        const candidates = [base, `${base}.js`, `${base}.mjs`, join(base, "index.js")];
        if (!candidates.some(existsSync)) {
          violations.push(`${file}: 相对引用悬空 "${spec}"（dist 内无目标文件）`);
        }
      } else if (spec.startsWith(PRIVATE_NAMESPACE)) {
        violations.push(`${file}: @dsh-forge/* 模块引用 "${spec}"（private 包不可 registry 安装——必须内联归零）`);
      } else if (spec.startsWith(NODE_PREFIX)) {
        // node 内建合法。
      } else if (spec.startsWith(OFFICIAL_SINGLETON)) {
        // 官方单例外置合法（宿主壳层提供解析路径）。
      } else if (spec.startsWith("bun:") || isAbsolute(spec)) {
        violations.push(`${file}: 非法模块说明符 "${spec}"`);
      } else if (!PLATFORM_BARE.test(spec) && !runtimeDeps.has(spec)) {
        violations.push(`${file}: 裸模块引用 "${spec}" 不在 dependencies/peerDependencies（独立安装形态断链）`);
      }
    }
  }

  // exports 闭包完整性：exports 声明的 ./dist 路径必须存在（结构性拦 exports 可达面
  // 丢文件）。exportsPrefixes 限定本步职责域——bundle-host 时 dist/client.js 尚未产出
  // （build 链时序），host 步只审 dist/host 面；终态全量闭包由 bundle-client 离手门 +
  // prepack + vitest 守卫兜底。
  for (const rel of exportsDistPaths(pkg)) {
    if (exportsPrefixes.some((prefix) => rel.startsWith(prefix)) && !existsSync(join(pkgDir, rel))) {
      violations.push(`exports 路径悬空：${rel}（package.json exports 声明的 dist 产物缺席）`);
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// tarball 自洽审计（fix-2；bug a2b6818f 家族）：离手面不止 dist import 形态——
// 包元数据依赖协议与解包树形态同样决定安装产物是否自洽（tarball 携 symlink/
// workspace 协议依赖 → 安装期 pnpm 产生指向检出树的链接，官方宿主即 EPERM）。
// ---------------------------------------------------------------------------

const DEP_PROTOCOL = /^(?:workspace|file|link):/;

/** tarball 解包后的 package.json manifest 审计：零协议依赖 + 零 @dsh-forge/* 运行期声明。 */
export function auditTarballManifest(manifest) {
  const violations = [];
  const runtimeDepFields = [
    ["dependencies", manifest.dependencies],
    ["peerDependencies", manifest.peerDependencies],
    ["optionalDependencies", manifest.optionalDependencies],
  ];
  for (const [field, deps] of [
    ...runtimeDepFields,
    // devDependencies 在 tarball 形态不被安装（pnpm add 零消费）——协议依赖
    // （workspace:/link:/file: 指向检出树）仍是出仓违规面；@dsh-forge/* 构建期
    // 解析面在此合法（与源包守卫口径一致，见 host/worktrees/self-containment.test.ts）。
    ["devDependencies", manifest.devDependencies],
  ]) {
    for (const [name, spec] of Object.entries(deps ?? {})) {
      if (DEP_PROTOCOL.test(spec)) {
        violations.push(`${field}: ${name} "${spec}"（协议依赖——安装期产生指向检出树的链接，必须实体化）`);
      }
      if (name.startsWith(PRIVATE_NAMESPACE) && field !== "devDependencies") {
        violations.push(`${field}: ${name}（private 包不可 registry 解析——独立安装形态断链）`);
      }
    }
  }
  return violations;
}

/** tarball 解包树审计：零 symlink/junction（任何 reparse 点 = 携检出树形态出仓）。 */
export function auditTarballTree(rootDir) {
  const violations = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        violations.push(`symlink: ${relative(rootDir, p).replaceAll("\\", "/")}（解包树内 reparse 点——安装产物必须实体化）`);
        continue; // symlink 目标不入树——不再下钻
      }
      if (entry.isDirectory()) walk(p);
    }
  };
  walk(rootDir);
  return violations;
}

/**
 * tarball 一站式审计：解包 tgz → manifest 审计 + 解包树审计（临时目录，审毕即清）。
 * 返回违规清单（空 = 通过）。解包失败视为违规（不可解包即不可装）。
 */
export function auditTarballFile(tgzPath) {
  const work = mkdtempSync(join(tmpdir(), "dshf-tarball-audit-"));
  try {
    const out = join(work, "x");
    mkdirSync(out, { recursive: true });
    const r = spawnSync("tar", ["-xzf", tgzPath, "-C", out], { encoding: "utf8" });
    // tar 无目标目录即建；status 非 0 = 解包失败
    if (r.status !== 0) return [`解包失败（exit ${r.status}）: ${String(r.stderr ?? "").trim()}`];
    const manifestPath = join(out, "package", "package.json");
    if (!existsSync(manifestPath)) return ["解包产物缺 package/package.json（非标准包形态）"];
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      return ["package.json 不可解析（非法 JSON）"];
    }
    return [...auditTarballManifest(manifest), ...auditTarballTree(join(out, "package"))];
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const isCli = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  const argv = process.argv.slice(2);
  const tarballFlag = argv.indexOf("--tarball");
  const tarballPath = tarballFlag !== -1 ? argv[tarballFlag + 1] : undefined;
  let failed = false;
  const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const violations = auditDist(pkgDir, { requireDist: !tarballPath });
  if (violations.length > 0) {
    failed = true;
    console.error(`[self-containment] dist 自含审计 ${violations.length} 处违规：`);
    for (const v of violations) console.error(`  - ${v}`);
  } else if (!tarballPath) {
    console.log(`[self-containment] dist 全量 .js 自含审计通过（逐文件扫描 + exports 闭包）`);
  }
  if (tarballPath) {
    const tgzViolations = auditTarballFile(resolve(tarballPath));
    if (tgzViolations.length > 0) {
      failed = true;
      console.error(`[self-containment] tarball 自含审计 ${tgzViolations.length} 处违规（${tarballPath}）：`);
      for (const v of tgzViolations) console.error(`  - ${v}`);
    } else {
      console.log(`[self-containment] tarball 自含审计通过（manifest 协议面 + 解包树零 symlink）：${tarballPath}`);
    }
  }
  if (failed) process.exit(1);
}
