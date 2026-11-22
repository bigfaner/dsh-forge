// Bundle the host half so the installable artifact is self-contained.
//
// 装载契约（expert-squad 先例逐字承袭）：官方 dsh-plugin-manager 安装 = profile 目录
// 裸跑 `pnpm add <spec>`，无 workspace 协议改写/依赖闭包解析/打包步骤——插件产物必须
// 自含（dependencies 全 registry 可解析）。@dsh-forge/lib-* 是 private workspace 包，
// 不可 registry 安装 → host 面值依赖在构建期闭包内联进 bundle；官方机械
// （@deepseek-ai/*）与真实外部依赖外置（registry 可装，留 dependencies 由 pnpm 解析
// ——better-sqlite3 随 host/db 域落位时入 dependencies 并在此保持外置）。
//
// 入口直接取 TS 源（fix-5；fix-6 起清单由 package.json exports 生成——单一事实源，
// 手工清单退役）：exports 每个 dist/host 运行期入口镜像回 TS 源入口，esbuild 原生吃
// TS 从源起 bundle，各入口全量闭包内联（含传递引用），与 tsc -b（类型链/.d.ts emit，
// emitDeclarationOnly——tsc 永不覆写 bundle .js，fix-6 根治门禁序错位）解耦。
// Run once per build；run-once, no watch。
import { build } from "esbuild";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDist, exportsDistPaths } from "./self-containment.mjs";

// typert strict 迁移 1.4：@Remote 装饰器源码形态需要构建期降级——esbuild 不支持标准
// 装饰器，onLoad 预降级（generator ./tsdown decoratorPlugin 同径：ts.transpileModule，
// 仅命中含装饰器语法的 TS 模块；vitest.config.ts dsh-decorators 插件同构测试面）。
const DSH_DECORATOR_TS = /^[^?]*\.[cm]?tsx?$/;
const DECORATOR_SYNTAX = /^\s*@[A-Za-z_$][\w$]*/m;

// typescript@7（根 pin）无全量 API 形状——降级用 generator 自带 typescript（与生成取材同源）。
const requirePkg = createRequire(new URL("../package.json", import.meta.url));
const generatorEntry = requirePkg.resolve('typescript');
const ts = createRequire(generatorEntry)("typescript");

const dshDecoratorsPlugin = {
  name: "dsh-decorators",
  setup(build) {
    build.onLoad({ filter: DSH_DECORATOR_TS }, (args) => {
      const code = readFileSync(args.path, "utf8");
      if (!DECORATOR_SYNTAX.test(code)) return undefined;
      const result = ts.transpileModule(code, {
        fileName: args.path,
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.ESNext,
          ...(args.path.endsWith("x") ? { jsx: ts.JsxEmit.ReactJSX } : {}),
          sourceMap: false,
        },
      });
      return { contents: result.outputText, loader: "js", resolveDir: dirname(args.path) };
    });
  },
};

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

// 外置表：官方机械与 peer（内联第二副本会分裂官方单例语义）。node 内建经
// platform:"node" 自动外置。@dsh-forge/* 一律不外置（含 lib 子包）——独立安装形态
// 不存在其解析路径（fix-5 判例：dsh-desktop pnpm runner 丢弃 workspace:* devDeps，
// 残留裸 import 即 ERR_MODULE_NOT_FOUND）。
const EXTERNAL = ["@deepseek-ai/*"];

// 内联例外（插件 onResolve 优先于 external 表；bug c48f2b6b——原窄表只覆盖 connection，
// 已内联件的传递依赖与源码直连件以外部 import 面残留，profile @deepseek-ai 为空即
// MODULE_NOT_FOUND）：@deepseek-ai/* 一律内联，唯 cordis 豁免（Service/Context 值导入
// 保持外置——内联第二副本分裂官方单例语义，依赖宿主 peer providers 注入单例）。
// importer 侧解析：内联件的传递依赖（connection→schemastery/dsh-credentials/dsh-scope 等）
// 不在本包声明链内，以 importer 所在包解析才命中（dsh-brand 判例同径）。
const INLINE_OFFICIAL_FILTER = /^@deepseek-ai\//;
const INLINE_EXEMPT = /^@deepseek-ai\/cordis(?:\/|$)/;
const inlineOfficial = {
  name: "inline-dsh-official",
  setup(build) {
    build.onResolve({ filter: INLINE_OFFICIAL_FILTER }, (args) => {
      if (INLINE_EXEMPT.test(args.path)) return undefined; // cordis peer 外置，落回默认解析
      return { path: createRequire(args.importer || join(pkgDir, "package.json")).resolve(args.path) };
    });
  },
};

// 内联官方件的 package.json 版本自读改写（desktop enable "Cannot find module
// '../package.json'" 实证：desktop 重定位钩子改写解析路径，运行期相对自读落空）——
// 构建期读源包真实版本注入字面量（{ version: "x.y.z" }），运行时零路径解析。
const officialSelfReadVersion = {
  name: "official-self-read-version",
  setup(build) {
    build.onLoad({ filter: /node_modules[\\/].*\.js$/ }, (args) => {
      let s;
      try { s = readFileSync(args.path, "utf8"); } catch { return undefined; }
      if (!s.includes("package.json")) return undefined;
      let dir = dirname(args.path);
      let version = "";
      for (;;) {
        const pj = join(dir, "package.json");
        if (existsSync(pj)) {
          try { version = JSON.parse(readFileSync(pj, "utf8")).version ?? ""; } catch {}
          break;
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      const next = s.replace(/createRequire\([^)]{0,80}\)\("\.{1,2}\/package\.json"\)/g, `{ version: ${JSON.stringify(version)} }`);
      if (next === s) return undefined;
      return { contents: next, loader: "js" };
    });
  },
};

// 内联入口 = package.json exports 全部 dist/host 运行期入口镜像回 TS 源（fix-6：
// 单一事实源——dist/host/x.js ↔ host/x.ts 同形镜像，exports 改面入口自动随动）。
const HOST_RUNTIME_ENTRIES = exportsDistPaths(pkg).filter(
  (rel) => rel.startsWith("./dist/host/") && rel.endsWith(".js"),
);
if (HOST_RUNTIME_ENTRIES.length === 0) {
  throw new Error("bundle-host: package.json exports 无 dist/host 运行期入口——exports 面漂移");
}
const distToSrc = (rel) => rel.replace(/^\.\//, "").replace(/^dist\//, "").replace(/\.js$/, ".ts");
const ENTRY_POINTS = HOST_RUNTIME_ENTRIES.map((rel) => resolve(pkgDir, distToSrc(rel)));

await build({
  entryPoints: ENTRY_POINTS,
  outdir: resolve(pkgDir, "dist/host"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: EXTERNAL,
  plugins: [dshDecoratorsPlugin, inlineOfficial, officialSelfReadVersion],
  allowOverwrite: true,
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
});

// 中间产物裁剪：KEEP = exports 运行期入口集（单一事实源）——其余 tsc 中间 .js/.js.map
// 全部删除（emitDeclarationOnly 下 tsc 本就不再产 .js，此步只清历史残留）。
// .d.ts 类型面保留（exports types 解析链，type-only import 不属运行期断链面）。
const KEEP = new Set(HOST_RUNTIME_ENTRIES.map((rel) => resolve(pkgDir, rel)));
const prune = (dir) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, name.name);
    if (name.isDirectory()) prune(p);
    else if ((name.name.endsWith(".js") || name.name.endsWith(".js.map")) && !KEEP.has(p)) rmSync(p);
  }
};
prune(resolve(pkgDir, "dist/host"));

// 【禁】禁止拷贝 package.json 进 dist/host——member dist 内嵌异包 manifest 会污染
// Node 最近 package.json 解析链（desktop 实证：knowledge/dist/host/package.json
// 为 forge manifest → exports/dsh.client 错位 → client bundle 404 + ../package.json
// 解析断裂，bug 链 bf4f3851 后继教训）。内联官方件的相对自读若再复现，用
// esbuild json 内联或别名注入解决，不走文件拷贝。

// 离手门（fix-6）：bundle 末尾自跑自含性断言 + exports 闭包完整性断言——非 0 即败，
// 自含性是产物性质，不是构建时点性质（bug eed9583b 判例）。
const violations = auditDist(pkgDir, { requireDist: true, exportsPrefixes: ["./dist/host"] });
if (violations.length > 0) {
  console.error(`[bundle-host] 离手门失败：dist 自含审计 ${violations.length} 处违规`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

// 离手门补强（bug c48f2b6b）：dist/host 外部 @deepseek-ai import 面收敛断言——仅允许
// cordis peer。声明面 lint 迁移若再漏内联，构建即红（防复发联动门）。
const EXTERNAL_SPEC = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](@deepseek-ai\/[^"']+)["']/g;
const residualSpecs = new Set();
const scanImports = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) scanImports(p);
    else if (e.name.endsWith(".js")) {
      for (const g of readFileSync(p, "utf8").matchAll(EXTERNAL_SPEC)) residualSpecs.add(g[1]);
    }
  }
};
scanImports(resolve(pkgDir, "dist/host"));
const nonPeer = [...residualSpecs].filter((s) => !s.startsWith("@deepseek-ai/cordis"));
if (nonPeer.length > 0) {
  console.error(`[bundle-host] 离手门失败：dist/host 外部 @deepseek-ai import 面仅允许 cordis peer，残留 ${nonPeer.length} 处`);
  for (const s of nonPeer.sort()) console.error(`  - ${s}`);
  process.exit(1);
}
console.log(`[bundle-host] 离手门通过（${HOST_RUNTIME_ENTRIES.length} 入口全内联 + dist 全量自含）`);
