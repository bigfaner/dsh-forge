// typert 工件生成步（E 路配方——plugin-project 0.20.0 实况承袭，配方正本
// review/project-alignment.md §一 + .knowledge/lessons/typert-generator-thirdparty-e-path-recipe）：
//
//   微工作区 staging（临时目录，不进 git，幂等重建）
//     ├─ typert-protocol.d.ts        ambient 协议壳（正本 = 包根同名文件；官方 fixture 同款——
//     │                              装饰器归经 analyzer augmentation 缝，运行期真实类型仍走 npm 依赖）
//     ├─ tsconfig.base.json          paths 指本地壳 + 包源；experimentalDecorators 等（probe 同款）
//     ├─ tsconfig.host.json          聚合 references → packages/task-loop
//     └─ packages/task-loop/         host/ui 源物理复制（剔 *.test.ts/__snapshots__）
//                                    + 重写 exports 指向 src/ui 的临时 manifest
//   驱动：WorkspaceTypertGenerator.generate(['@dsh-forge/task-loop'])
//         → writePackageArtifacts → 工件复制回真包 dist/（./typert + ./remote 导出形态）
//
// 骨架阶段（本任务）：host 半零 @Remote 控制器、ui 半零 @typert surface——生成工件缺席
// = 记录降级不虚发（./typert/./remote exports 工件键后置到 Typert namespace 任务）；
// 控制器落位后本脚本全径生效（client face 工件在 rc.2 analyzer 恒 host-only，缺席降级
// 记录同 project 口径）。checkDiagnostics:false 与既有 tsc -b 门解耦（generator 文档
// 口径：同编排已有 tsc 验证时传 false）。
// Run once per build；run-once, no watch。
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_NAME = "@dsh-forge/task-loop";
const HOST_SRC = join(pkgDir, "host");
const UI_SRC = join(pkgDir, "ui");
const stagingRoot = join(pkgDir, ".typert-ws");
const stagingPkg = join(stagingRoot, "packages", "task-loop");

const fail = (message) => {
  console.error(`[generate-typert] 失败：${message}`);
  console.error(`[generate-typert] staging 已保留供取证：${stagingRoot}`);
  process.exit(1);
};

// 骨架阶段判定：host 源零 @Remote 取材——controller 取材归零时 generator 不产 remote
// 面，工件键后置（Typert namespace 任务）。
const hasRemoteSource = (dir) => {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (hasRemoteSource(p)) return true;
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      if (/@Remote\b/.test(readFileSync(p, "utf8"))) return true;
    }
  }
  return false;
};
const remoteSurface = hasRemoteSource(HOST_SRC);

// ── staging 摆盘（幂等：整树重建）──
rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(stagingPkg, { recursive: true });

// ambient 协议壳（正本 = 包根 typert-protocol.d.ts——pin 测试锚定其与 npm 协议包形状）
copyFileSync(join(pkgDir, "typert-protocol.d.ts"), join(stagingRoot, "typert-protocol.d.ts"));

// host/ui 源物理复制（剔测试面——vitest/测试桩不在生成取材图内）
const excludeNames = new Set(["__snapshots__"]);
const copyTree = (from, to) => {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) {
      if (excludeNames.has(entry.name)) continue;
      copyTree(src, dst);
    } else if (/\.test\.(ts|tsx)$/.test(entry.name)) {
      continue;
    } else {
      copyFileSync(src, dst);
    }
  }
};
copyTree(HOST_SRC, join(stagingPkg, "src"));
if (!existsSync(join(stagingPkg, "src", "index.ts"))) {
  fail("host 源复制后缺 src/index.ts——源树漂移");
}
copyTree(UI_SRC, join(stagingPkg, "ui"));
if (!existsSync(join(stagingPkg, "ui", "index.ts"))) {
  fail("ui 源复制后缺 ui/index.ts——源树漂移");
}

// 临时 manifest（exports 重写指向 src/ui——generator validateExport 契约：./typert、
// ./remote、./client/typert 指精确 lib 工件形（官方契约命名，勿自造）、files 含工件；
// 生成真包 exports/files 由真 package.json 承担）。dsh.client 在场 + ./client 导出 =
// 官方 dual-face 判定形（analyzer isDualFacePackage）。
writeFileSyncStaged(join("packages", "task-loop", "package.json"), JSON.stringify({
  name: PKG_NAME,
  private: true,
  type: "module",
  exports: {
    ".": "./src/index.ts",
    "./client": { types: "./ui/index.ts", default: "./ui/index.ts" },
    "./typert": { types: "./lib/typert.host.d.ts", default: "./lib/typert.host.js" },
    "./client/typert": { types: "./lib/typert.client.d.ts", default: "./lib/typert.client.js" },
    "./remote": { types: "./lib/typert.remote-client.d.ts", default: "./lib/typert.remote-client.js" },
  },
  files: [
    "lib/typert.host.js",
    "lib/typert.host.d.ts",
    "lib/typert.client.js",
    "lib/typert.client.d.ts",
    "lib/typert.remote-client.js",
    "lib/typert.remote-client.d.ts",
    "lib/typert.remote-client.d.ts.map",
  ],
  dsh: { client: { platform: "web" } },
}));

// 微工作区配置（probe micro-ws-e-path 验证配方同款）。paths 双映射：
//   - 协议壳（生成取材真源）；
//   - @deepseek-ai/* 统一指包本地 node_modules 链接——pnpm 传递闭包可能装多物理副本
//     （同包两版本），解析分叉会双载同一 d.ts 增强块 → analyzer TypertLookupMap key
//     duplicate（实判例：dsh-session）；统一收敛后单一物理副本。
const officialLinks = join(pkgDir, "node_modules", "@deepseek-ai");
const officialPaths = {};
const officialPrefix = relative(stagingRoot, officialLinks).replaceAll("\\", "/");
for (const name of readdirSync(officialLinks)) {
  if (name === "dsh-typert-protocol") continue; // 协议包改指本地壳（下一映射，后写胜出）
  officialPaths[`@deepseek-ai/${name}`] = [`${officialPrefix}/${name}`];
}
writeFileSyncStaged("tsconfig.base.json", JSON.stringify({
  compilerOptions: {
    target: "ES2024",
    module: "ESNext",
    moduleResolution: "Bundler",
    strict: true,
    composite: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    ignoreDeprecations: "6.0",
    experimentalDecorators: true,
    paths: {
      "@deepseek-ai/dsh-typert-protocol": ["./typert-protocol.d.ts"],
      [PKG_NAME]: ["./packages/task-loop/src/index.ts"],
      ...officialPaths,
    },
    skipLibCheck: true,
  },
}));
writeFileSyncStaged("tsconfig.host.json", JSON.stringify({
  extends: "./tsconfig.base.json",
  files: [],
  references: [{ path: "./packages/task-loop" }],
}));
writeFileSyncStaged("tsconfig.client.json", JSON.stringify({
  extends: "./tsconfig.base.json",
  files: [],
  references: [{ path: "./packages/task-loop" }],
}));
writeFileSyncStaged(join("packages", "task-loop", "tsconfig.json"), JSON.stringify({
  extends: "../../tsconfig.base.json",
  compilerOptions: { jsx: "react-jsx", types: [] },
  include: ["src", "ui"],
}));

function writeFileSyncStaged(rel, content) {
  const target = join(stagingRoot, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

// 骨架阶段短路：零 @Remote 取材 = 生成取材归零——工件键后置（Typert namespace 任务），
// staging 用毕即清、零工件零虚发。控制器落位后本分支自动让位全径生成。
if (!remoteSurface) {
  rmSync(stagingRoot, { recursive: true, force: true });
  console.log("[generate-typert] 降级记录：host 半零 @Remote 取材（骨架阶段）——./typert/./remote 工件键后置 Typert namespace 任务，本步零工件产出");
  process.exit(0);
}

// ── 驱动生成 ──
const requirePkg = createRequire(join(pkgDir, "package.json"));
const generatorModule = await import(pathToFileURL(requirePkg.resolve("@deepseek-ai/dsh-typert-generator")).href);
const { WorkspaceTypertGenerator, writePackageArtifacts } = generatorModule;

let artifacts;
try {
  const gen = new WorkspaceTypertGenerator(stagingRoot, { checkDiagnostics: false });
  artifacts = await gen.generate([PKG_NAME]);
} catch (cause) {
  fail(`generator 抛错：${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}`);
}

const hostArtifact = artifacts.find((a) => a.package === PKG_NAME && a.face === "host");
if (hostArtifact === undefined) {
  fail(`generator 未产出 ${PKG_NAME} host face 工件（faces=${artifacts.map((a) => a.face).join(",") || "无"}）`);
}
if (hostArtifact.remote === undefined) {
  fail("host 工件无 Remote 面——@Remote 装饰器取材归零（源形态/壳形状漂移）");
}
writePackageArtifacts(join(stagingRoot, hostArtifact.packageRoot), [hostArtifact]);

// client face 工件：generator 产出 = client face @typert surface 存在时；本包 ui 半为
// 纯消费半（client face invocations 在 rc.2 analyzer 恒 host-only）——工件缺席 = 记录
// 降级，不虚发空工件、不挂悬空导出。
const clientArtifact = artifacts.find((a) => a.package === PKG_NAME && a.face === "client");
if (clientArtifact !== undefined) {
  writePackageArtifacts(join(stagingRoot, clientArtifact.packageRoot), [clientArtifact]);
}

// ── 工件复制回真包 dist ──
const generatedLib = join(stagingRoot, hostArtifact.packageRoot, "lib");
const ARTIFACTS = [
  "typert.host.js",
  "typert.host.d.ts",
  "typert.remote-client.js",
  "typert.remote-client.d.ts",
  "typert.remote-client.d.ts.map",
];
if (clientArtifact !== undefined) ARTIFACTS.push("typert.client.js", "typert.client.d.ts");
mkdirSync(join(pkgDir, "dist"), { recursive: true });
for (const name of ARTIFACTS) {
  const from = join(generatedLib, name);
  if (!existsSync(from)) fail(`生成工件缺席：${name}`);
  if (statSync(from).size === 0) fail(`生成工件为空：${name}`);
  copyFileSync(from, join(pkgDir, "dist", name));
}

// staging 用毕即清（成功路径零残留；失败路径保留取证）
rmSync(stagingRoot, { recursive: true, force: true });

const methodIds = [...readFileSync(join(pkgDir, "dist", "typert.host.js"), "utf8").matchAll(/'([a-zA-Z]+\/[a-zA-Z]+)':\s*\{/g)].map((m) => m[1]);
console.log(`[generate-typert] 生成完成：host + remote-client 五工件入 dist${clientArtifact !== undefined ? " + client face 二工件" : "（client face 零 @typert surface——不产 client 工件）"}；端点 [${[...new Set(methodIds)].join(", ")}]`);
