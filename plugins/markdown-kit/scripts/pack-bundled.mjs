// 打包链（零运行时依赖形态，bug d00302ef 终局修）：dependencies 收敛为零 + host 半
// 构建期全 bundling 后，传递闭包为空——staging hoisted 物化步退役，打包链简化为
//   1. staging 目录（工作区临时区 project.tmp_dir，过程产物不入 git）：package.json JSON 往返（零依赖
//      声明面）+ dist 全量 + cordis.patch.yml；
//   2. pnpm pack——tarball 自含（解析面全在 dist 内联闭包，零 registry 解析径）；
//   3. tarball 断言（自读 tgz，无子进程）：node_modules 全零（依赖声明面收敛防回归）+
//      dist 运行期入口在场（host bundle / client bundle / pdfjs fake worker）。
// Run once per release；run-once, no watch。
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(pkgDir, "..", "..");
const DIST_MUST = ["dist/host/index.js", "dist/client.js", "dist/host/pdf.worker.mjs"];

const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
if (Object.keys(pkg.dependencies ?? {}).length > 0) {
  throw new Error("pack-bundled: dependencies 非空——零运行时依赖形态破坏（zero-runtime-deps 守卫同步红）");
}

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
};
writeFileSync(join(stage, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
cpSync(join(pkgDir, "dist"), join(stage, "dist"), { recursive: true });
if (exists(join(pkgDir, "cordis.patch.yml"))) cpSync(join(pkgDir, "cordis.patch.yml"), join(stage, "cordis.patch.yml"));

// ---- 2. pack ----
run("pnpm", ["pack", "--pack-destination", tmpRoot], stage);
const tgz = join(tmpRoot, `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`);
if (!exists(tgz)) throw new Error(`pack-bundled: tarball 缺席 ${tgz}`);

// ---- 3. tarball 断言（自读 tgz：gzip + ustar/gnu 头遍历，无子进程） ----
const paths = tarPaths(tgz);
const strayNm = [...paths].filter((p) => p.startsWith("package/node_modules/"));
if (strayNm.length > 0) throw new Error(`pack-bundled: tarball 携带 node_modules（零依赖形态破坏）：${strayNm.slice(0, 3).join(", ")}`);
const missDist = DIST_MUST.filter((rel) => !paths.has(`package/${rel}`));
if (missDist.length > 0) throw new Error(`pack-bundled: tarball dist 运行期入口缺席：${missDist.join(", ")}`);
if (!paths.has("package/cordis.patch.yml")) throw new Error("pack-bundled: tarball 缺 cordis.patch.yml（bundle patch 声明断链）");
console.log(`[pack-bundled] 通过：${pkg.version} tarball 零 node_modules + dist 入口 ${DIST_MUST.length} 件在场 → ${tgz}`);

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
