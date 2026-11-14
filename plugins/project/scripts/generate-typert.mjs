// typert 工件生成步（typert strict 迁移 1.4 —— E 路配方）：
//
//   微工作区 staging（临时目录，不进 git，幂等重建）
//     ├─ typert-protocol.d.ts        ambient 协议壳（正本 = 包根同名文件；官方 fixture 同款——
//     │                              装饰器归经 analyzer augmentation 缝，运行期真实类型仍走 npm 依赖）
//     ├─ tsconfig.base.json          paths 指本地壳 + 包源；experimentalDecorators 等（probe 同款）
//     ├─ tsconfig.host.json          聚合 references → packages/project
//     └─ packages/project/           host 源物理复制（剔 *.test.ts/__snapshots__）
//                                    + 重写 exports 指向 src 的临时 manifest
//   驱动：WorkspaceTypertGenerator.generate(['@dsh-forge/project'])
//         → writePackageArtifacts → 工件复制回真包 dist/（./typert + ./remote 导出形态）
//
// 生成器取材真源 = host/assembly/typert-remotes.ts 的 @Remote 装饰器源码（与运行期
// gateway SRC 发现共用同一取材面）；checkDiagnostics:false 与既有 tsc -b 门解耦
// （generator 文档口径：同编排已有 tsc 验证时传 false）。
// Run once per build；run-once, no watch。
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_NAME = "@dsh-forge/project";
const HOST_SRC = join(pkgDir, "host");
const stagingRoot = join(pkgDir, ".typert-ws");
const stagingPkg = join(stagingRoot, "packages", "project");

const fail = (message) => {
  console.error(`[generate-typert] 失败：${message}`);
  console.error(`[generate-typert] staging 已保留供取证：${stagingRoot}`);
  process.exit(1);
};

// ── staging 摆盘（幂等：整树重建）──
rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(stagingPkg, { recursive: true });

// ambient 协议壳（正本 = 包根 typert-protocol.d.ts——pin 测试锚定其与 npm 协议包形状）
copyFileSync(join(pkgDir, "typert-protocol.d.ts"), join(stagingRoot, "typert-protocol.d.ts"));

// host 源物理复制（剔测试面——vitest/测试桩不在生成取材图内）
const excludeNames = new Set(["__snapshots__"]);
const copyHostTree = (from, to) => {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) {
      if (excludeNames.has(entry.name)) continue;
      copyHostTree(src, dst);
    } else if (/\.test\.(ts|tsx)$/.test(entry.name)) {
      continue;
    } else {
      copyFileSync(src, dst);
    }
  }
};
copyHostTree(HOST_SRC, join(stagingPkg, "src"));
if (!existsSync(join(stagingPkg, "src", "assembly", "typert-remotes.ts"))) {
  fail("host 源复制后缺 assembly/typert-remotes.ts——源树漂移");
}
// client face 聚合（1.5——D3 client 半生成化）：ui 树物理复制（剔测试面），client face
// 取材入口 = ui/index.ts（exports["./client"] 镜像）。client face invocations 在 rc.2
// analyzer 中恒为 host-only（analyzer.ts:800），client 工件内容 = client face @typert
// schema/object surface——ui 半零 @typert surface 时 generator 不产 client 工件（下方
// 检测后降级记录，不虚发空工件）。
copyHostTree(join(pkgDir, "ui"), join(stagingPkg, "ui"));
if (!existsSync(join(stagingPkg, "ui", "index.ts"))) {
  fail("ui 源复制后缺 ui/index.ts——源树漂移");
}

// 临时 manifest（exports 重写指向 src/ui——generator validateExport 契约：./typert、
// ./remote、./client/typert 指精确 lib 工件形（官方契约命名，勿自造）、files 含工件；
// 生成真包 exports/files 由真 package.json 承担）。dsh.client 在场 + ./client 导出 =
// 官方 dual-face 判定形（analyzer isDualFacePackage）。
writeFileSyncStaged(join("packages", "project", "package.json"), JSON.stringify({
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
      [PKG_NAME]: ["./packages/project/src/index.ts"],
      ...officialPaths,
    },
    skipLibCheck: true,
  },
}));
writeFileSyncStaged("tsconfig.host.json", JSON.stringify({
  extends: "./tsconfig.base.json",
  files: [],
  references: [{ path: "./packages/project" }],
}));
writeFileSyncStaged("tsconfig.client.json", JSON.stringify({
  extends: "./tsconfig.base.json",
  files: [],
  references: [{ path: "./packages/project" }],
}));
writeFileSyncStaged(join("packages", "project", "tsconfig.json"), JSON.stringify({
  extends: "../../tsconfig.base.json",
  compilerOptions: { jsx: "react-jsx", types: [] },
  include: ["src", "ui"],
}));

function writeFileSyncStaged(rel, content) {
  const target = join(stagingRoot, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
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

// client face 工件（1.5）：generator 产出 = client face @typert surface 存在时；
// 本包 ui 半为零 @typert surface 的纯消费半（client face invocations 在 rc.2 analyzer
// 恒 host-only）——工件缺席 = 记录降级，不虚发空工件、不挂悬空导出。
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
