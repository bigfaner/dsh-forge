// F1 物化层打包链（bug d211bc24）：root workspace nodeLinker: isolated 下 bundledDependencies
// 被拒（ERR_PNPM_BUNDLED_DEPENDENCIES_WITHOUT_HOISTED），且 isolated symlink 农场打包即携带
// 断链——故走 staging hoisted 形态：
//   1. staging 目录（forge.tmp，过程产物不入 git）：package.json JSON 往返（dependencies +
//      bundledDependencies 声明面）+ pnpm-workspace.yaml { nodeLinker: hoisted } + dist 全量；
//   2. staging 内 pnpm install --prod——bundled 传递链真实物化为普通文件（非 store 链接）；
//   3. pnpm pack——tarball 内 node_modules 携带 mammoth 闭包（mermaid 先例 = 解析恒在插件
//      目录内，pnpm reused 快径对插件内物化零影响）；
//   4. tarball 闭包断言（自读 tgz，无子进程）：bundled 根在包 + 关键传递链成员在场 +
//      node_modules 内零 @dsh-forge/* / @deepseek-ai/* + dist 产物在场。
// Run once per release；run-once, no watch。
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(pkgDir, "..", "..");
const BUNDLED = ["mammoth"];
const CHAIN_MUST = ["mammoth", "readable-stream", "string_decoder"];
const FORBIDDEN_NS = ["@dsh-forge/", "@deepseek-ai/"];

const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

// ---- 1. staging 组装 ----
const tmpRoot = join(repoRoot, ".forge-tmp", "pack-mdk-staging");
rmSync(tmpRoot, { recursive: true, force: true });
const stage = join(tmpRoot, `pkg-${pkg.version}`);
mkdirSync(stage, { recursive: true });
const manifest = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  type: pkg.type,
  main: pkg.main,
  types: pkg.types,
  exports: pkg.exports,
  files: pkg.files,
  dsh: pkg.dsh,
  dependencies: pkg.dependencies,
  bundledDependencies: BUNDLED,
};
writeFileSync(join(stage, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(stage, "pnpm-workspace.yaml"), "packages:\n  - .\n\nnodeLinker: hoisted\n");
cpSync(join(pkgDir, "dist"), join(stage, "dist"), { recursive: true });
if (exists(join(pkgDir, "cordis.patch.yml"))) cpSync(join(pkgDir, "cordis.patch.yml"), join(stage, "cordis.patch.yml"));

// ---- 2. hoisted 真实物化 ----
run("pnpm", ["install", "--prod", "--no-frozen-lockfile"], stage);

// ---- 3. pack ----
run("pnpm", ["pack", "--pack-destination", tmpRoot], stage);
const tgz = join(tmpRoot, `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`);
if (!exists(tgz)) throw new Error(`pack-bundled: tarball 缺席 ${tgz}`);

// ---- 4. tarball 闭包断言（自读 tgz：gzip + ustar/gnu 头遍历，无子进程） ----
const paths = tarPaths(tgz);
const miss = CHAIN_MUST.filter((name) => !paths.has(`package/node_modules/${name}/package.json`));
if (miss.length > 0) throw new Error(`pack-bundled: tarball 内联闭包缺席成员：${miss.join(", ")}`);
const badNs = [...paths].filter((p) => FORBIDDEN_NS.some((ns) => p.startsWith(`package/node_modules/${ns}`)));
if (badNs.length > 0) throw new Error(`pack-bundled: tarball node_modules 携带禁名空间：${badNs.slice(0, 3).join(", ")}`);
if (![...paths].some((p) => p.startsWith("package/dist/host/")) || ![...paths].some((p) => p.startsWith("package/dist/client"))) {
  throw new Error("pack-bundled: tarball dist 产物缺席");
}
const bundledCount = [...paths].filter((p) => p.startsWith("package/node_modules/")).length;
console.log(`[pack-bundled] 通过：${pkg.version} tarball 内联闭包 ${bundledCount} 项（${CHAIN_MUST.join(" + ")} 在场，零禁名空间，dist 在场）→ ${tgz}`);

function exists(p) {
  return existsSync(p) && statSync(p).isFile();
}

function run(cmd, args, cwd) {
  // Windows 直调 pnpm shim（ps1/cmd）需 shell——改经 node 调 pnpm.cjs（node.exe 同级安装树）。
  const pnpmCjs = join(dirname(process.execPath), "node_modules", "pnpm", "bin", "pnpm.cjs");
  const argv = cmd === "pnpm" && existsSync(pnpmCjs) ? [process.execPath, pnpmCjs, ...args] : [cmd, ...args];
  const r = spawnSync(argv[0], argv.slice(1), { cwd, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`pack-bundled: ${cmd} ${args.join(" ")} 失败（exit ${r.status}）`);
}

/** 最小 tar 遍历：gzip 解压后按 512B 头走，支持 GNU longname（type 'L'）。 */
function tarPaths(tgzPath) {
  const raw = gunzipSync(readFileSync(tgzPath));
  const out = new Set();
  let offset = 0;
  let longName = null;
  while (offset + 512 <= raw.length) {
    const header = raw.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = (longName ?? readStr(header, 0, 100)) + readStr(header, 155, 100);
    const type = String.fromCharCode(header[156]);
    const size = parseInt(readStr(header, 124, 12).replace(/[\0 ]/g, ""), 8) || 0;
    offset += 512;
    if (type === "L") longName = readStr(raw.subarray(offset, offset + size), 0, size);
    else if (type === "0" || type === "") out.add(name);
    else if (type === "5") out.add(`${name.replace(/\/$/, "")}/`);
    longName = null;
    offset += Math.ceil(size / 512) * 512;
  }
  return out;
}

function readStr(buf, off, len) {
  const end = buf.indexOf(0, off);
  return buf.subarray(off, end === -1 || end > off + len ? off + len : end).toString("utf8");
}
