// Bundle the client half into the official client-modules registration shape.
//
// 装载契约（官方 clientBundle 配方；input-history 判例同构移植）：宿主把
// exports["./client"] 产物按 classic <script> 原样装载，产物必须自注册
// window.__ModuleLoader__.load({ id, factory })（cjs 体 + 注册头/module-var intro +
// return footer）。format:"esm" 产物带顶层 export/import.meta → classic script 语法
// 错误 → 「loaded without registering」→ web boot「1 entry did not activate」。
// Run once per build；run-once, no watch（工作区 AGENTS §2 run-once 纪律）。
import { build } from "esbuild";
import { copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "@dsh-forge/super-composer";

// 平台基线外置表（对齐官方 packages/client/web/src/platform.ts 冻结种子表口径）：
// react 家族（MiniComposerCard 组件 hooks 与 jsx transform 均须共用壳层单例——内联
// 第二份 react 会使 shell 渲染树组件 hooks 读到另一副本的 dispatcher，Invalid hook
// call）+ react-dom/client（替身容器 createRoot）+ primitives（同模块实例）。
// 上述为运行期经 factory require 实际可达的外置依赖；表外依赖全部内联。
const PLATFORM_MODULES = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/dsh-client-ui-primitives",
  // 复制件（official-input）的 Lexical 家族：官方壳层同款版本外置（bundle 内第二份
  // Lexical = Invalid hook call 判例红线——官方 editor 节点类与替身 editor 必须同模块
  // 实例）。react 家族同上。
  "lexical",
  "@lexical/plain-text",
  "@lexical/history",
  "@lexical/utils",
  "@lexical/text",
];

/**
 * official-input .module.css 转译（fix-12 复制件样式装配）：CJS bundle 无 vite 的
 * css-modules 通道——插件把每个 .module.css 转成「类名恒等映射对象 + 原文推入
 * globalThis.__DSCF_OFFICIAL_CSS__ 收集器」（styles.ts installOfficialInputStyles
 * factory 同步段落 <style>）。原文选择器在转译期作用域化 [data-dscf-official-input]
 * ——官方 .card/.root 等通用类名不碰撞宿主样式；@keyframes/@font-face 原样保留，
 * @media/@supports 内层递归作用域化。
 */
function scopeOfficialCss(css) {
  const out = [];
  let depth = 0;
  let buffer = "";
  let atRule = null;
  const flushSelectorBlock = (selector, body) => {
    const scoped = selector
      .split(",")
      .map((part) => {
        const sel = part.trim();
        if (sel === "" || /^(@|:root\b|html\b|body\b)/.test(sel)) return sel;
        return `[data-dscf-official-input] ${sel}`;
      })
      .filter((sel) => sel !== "")
      .join(",");
    if (scoped !== "") out.push(`${scoped}{${body}}`);
  };
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (depth === 0) {
      if (ch === "{") {
        const selector = buffer.trim();
        buffer = "";
        if (selector.startsWith("@")) {
          const name = selector.slice(1, selector.search(/[\s({]/) === -1 ? selector.length : selector.search(/[\s({]/));
          if (name === "media" || name === "supports" || name === "layer") {
            // 递归作用域化内层
            let inner = 1;
            let j = i + 1;
            for (; j < css.length && inner > 0; j++) {
              if (css[j] === "{") inner++;
              else if (css[j] === "}") inner--;
            }
            out.push(`${selector}{${scopeOfficialCss(css.slice(i + 1, j - 1))}}`);
            i = j - 1;
            continue;
          }
          // @keyframes / @font-face / @charset 等：原样保留整个块
          if (name === "keyframes" || name === "font-face") {
            let inner = 1;
            let j = i + 1;
            for (; j < css.length && inner > 0; j++) {
              if (css[j] === "{") inner++;
              else if (css[j] === "}") inner--;
            }
            out.push(`${selector}{${css.slice(i + 1, j - 1)}}`);
            i = j - 1;
            continue;
          }
          atRule = selector;
          depth = 1;
          continue;
        }
        atRule = selector;
        depth = 1;
        continue;
      }
      if (ch === "}" || ch === ";") {
        buffer = "";
        continue;
      }
      buffer += ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        if (atRule !== null) {
          flushSelectorBlock(atRule, buffer);
          atRule = null;
        }
        buffer = "";
        continue;
      }
    }
    buffer += ch;
  }
  return out.join("\n");
}

const cssModulesPlugin = {
  name: "dscf-official-css-modules",
  setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, async (args) => {
      const css = await readFile(args.path, "utf8");
      const names = [...new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]))];
      const scoped = scopeOfficialCss(css);
      return {
        loader: "js",
        contents:
          `module.exports = {${names.map((n) => `${JSON.stringify(n)}:${JSON.stringify(n)}`).join(",")}};\n` +
          `(globalThis.__DSCF_OFFICIAL_CSS__ = globalThis.__DSCF_OFFICIAL_CSS__ || []).push(${JSON.stringify(scoped)});\n`,
      };
    });
  },
};

// tsc 产物目录不搬 .module.css——bundle 前镜像复制（css-module 插件按相对路径解析）
async function mirrorCssModules(fromDir, toDir) {
  for (const entry of await readdir(fromDir, { withFileTypes: true })) {
    const from = resolve(fromDir, entry.name);
    const to = resolve(toDir, entry.name);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await mirrorCssModules(from, to);
    } else if (entry.name.endsWith(".module.css")) {
      await copyFile(from, to);
    }
  }
}
await mirrorCssModules(resolve(pkgDir, "src/client"), resolve(pkgDir, "dist/client"));

await build({
  entryPoints: [resolve(pkgDir, "dist/client/index.js")],
  outfile: resolve(pkgDir, "dist/client.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  external: PLATFORM_MODULES,
  plugins: [cssModulesPlugin],
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: `return module.exports; } });` },
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
});
