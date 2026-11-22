// 离手门（project 打包判例注入；bug eed9583b 家族）：产物自含性是产物性质，不是构建
// 时点性质——bundle 脚本末尾自跑本断言（非 0 即败），任何时点的 dist 都必须整体通过：
//   1. 逐 bundle 文件全量扫描：dist 全部运行期 .js（含入口与全部子目录）零
//      @dsh-forge/* 模块引用（private workspace 包不可 registry 安装；.d.ts 类型面
//      不在断言面）；
//   2. 相对引用闭包：每个 .js 的相对 import/require 目标必须命中 dist 内存在文件
//      ——结构性拦「丢 chunk」；
//   3. exports 闭包完整性：package.json exports 每个 ./dist 路径必须存在于 dist。
// 官方单例（@deepseek-ai/*，宿主壳层提供）与 dependencies 内 registry 依赖外置合法；
// 其余裸名一律违规。Run once per gate；run-once, no watch。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 模块说明符面匹配（from/import/require/动态 import 后跟字面量）——注释里的包名
// 字样不是运行期引用，不算违规。
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*|\brequire\(\s*|\bimport\(\s*)["']([^"']+)["']/g;

const NODE_PREFIX = "node:";
const OFFICIAL_SINGLETON = "@deepseek-ai/";
const PRIVATE_NAMESPACE = "@dsh-forge/";

// 平台外置白名单（合法外置面）：@deepseek-ai/* 官方单例（宿主壳层提供解析路径）；
// react 族（client bundle 平台基线——shell 冻结种子表单例，react 永不内联）；node: 内建。
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

/** package.json exports 全部 ./dist 路径（import/default/types/require 子字段）。 */
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
export function auditDist(pkgDir, { requireDist = false, exportsPrefixes = ["./dist"], bareHeuristicExempt = [] } = {}) {
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

  for (const file of walkJs(distDir)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(SPECIFIER)) {
      const spec = match[1];
      // 说明符形态过滤：模块名不含空白/引号——数据表字符串字面量不是运行期引用。
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
        // 裸名启发式豁免面（client bundle：内联 vendor 体带 guarded require("util")、
        // __name(fn,"x") 等形态在此假阳；其真实外置面由 bundle-client 专用 require
        // 面断言只认平台种子表承担）。
        if (bareHeuristicExempt.includes(file)) continue;
        violations.push(`${file}: 裸模块引用 "${spec}" 不在 dependencies/peerDependencies（独立安装形态断链）`);
      }
    }
  }

  // exports 闭包完整性：exports 声明的 ./dist 路径必须存在。exportsPrefixes 限定本步
  // 职责域——bundle-host 时 dist/client.js 尚未产出（build 链时序），host 步只审
  // dist/host 面；终态全量闭包由 bundle-client 离手门 + prepack 兜底。
  for (const rel of exportsDistPaths(pkg)) {
    if (exportsPrefixes.some((prefix) => rel.startsWith(prefix)) && !existsSync(join(pkgDir, rel))) {
      violations.push(`exports 路径悬空：${rel}（package.json exports 声明的 dist 产物缺席）`);
    }
  }
  return violations;
}

const isCli = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const clientJs = join(pkgDir, "dist/client.js");
  const violations = auditDist(pkgDir, {
    requireDist: true,
    bareHeuristicExempt: existsSync(clientJs) ? [clientJs] : [],
  });
  if (violations.length > 0) {
    console.error(`[self-containment] dist 自含审计 ${violations.length} 处违规：`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`[self-containment] dist 全量 .js 自含审计通过（逐文件扫描 + exports 闭包）`);
}
