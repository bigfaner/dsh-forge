// Bundle the host half so the installable artifact is self-contained.
//
// 装载契约（plugin-project 判例逐字承袭）：官方 dsh-plugin-manager 安装 = profile 目录
// 裸跑 `pnpm add <spec>`，无 workspace 协议改写/依赖闭包解析/打包步骤——插件产物必须
// 自含（dependencies 全 registry 可解析）。@dsh-forge/lib-* 是 private workspace 包，
// 不可 registry 安装 → host 面值依赖在构建期闭包内联进 bundle（dist 零 @dsh-forge/lib-*
// 裸 import——构建期内联验证，self-containment 断言承担）；官方机械（@deepseek-ai/*）
// 与真实外部依赖外置（registry 可装，留 dependencies 由 pnpm 解析）。
//
// 入口直接取 TS 源：package.json exports 每个 dist/host 运行期入口镜像回 TS 源入口
// （ENTRY_POINTS/KEEP 单一事实源 = exports——禁手工维护清单，fix-6 判例：手工 KEEP
// 漏 chunk 即丢件），esbuild 原生吃 TS 从源起 bundle，各入口全量闭包内联（含传递引用），
// 与 tsc -b（类型链/.d.ts emit，emitDeclarationOnly——tsc 永不覆写 bundle .js，门禁序
// 铁律①：tsc -b 仅 build 第一步）解耦。Run once per build；run-once, no watch。
import { build } from "esbuild";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDist, exportsDistPaths } from "./self-containment.mjs";

// 装饰器源码形态需要构建期降级——esbuild 不支持标准装饰器，onLoad 预降级（generator
// ./tsdown decoratorPlugin 同径：ts.transpileModule，仅命中含装饰器语法的 TS 模块）。
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
// platform:"node" 自动外置。better-sqlite3 外置（原生模块 + 动态 require 'fs'——内联进
// ESM bundle 后官方 loader 的 createRequire shim 不支持，激活即崩 1.14 真机判例）；
// dependencies 声明真依赖由 pnpm 正门解析。@dsh-forge/* 一律不外置（含 lib 子包）——
// 独立安装形态不存在其解析路径（plugin-project fix-5 判例：dsh-desktop pnpm runner 丢弃
// workspace:* devDeps，残留裸 import 即 ERR_MODULE_NOT_FOUND）。
const EXTERNAL = ["@deepseek-ai/*"];

// 内联入口 = package.json exports 全部 dist/host 运行期入口镜像回 TS 源（单一事实源——
// dist/host/x.js ↔ host/x.ts 同形镜像，exports 改面入口自动随动）。
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
  plugins: [dshDecoratorsPlugin],
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

// 离手门（门禁序铁律②④）：bundle 脚本末尾自跑自含性断言 + exports 闭包完整性断言——
// 非 0 即败，自含性是产物性质，不是构建时点性质（bug eed9583b 判例）。
const violations = auditDist(pkgDir, { requireDist: true, exportsPrefixes: ["./dist/host"] });
if (violations.length > 0) {
  console.error(`[bundle-host] 离手门失败：dist 自含审计 ${violations.length} 处违规`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`[bundle-host] 离手门通过（${HOST_RUNTIME_ENTRIES.length} 入口全内联 + dist 全量自含）`);
