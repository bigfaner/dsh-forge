import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";

/**
 * 浏览器半装载契约守卫（dsh-client-modules，官方 clientBundle 生成形状——
 * annotutor gotcha-web-boot-loaded-without-registering.md 判例移植，input-history
 * 同型基线）：宿主把 exports["./client"] 产物按 classic <script> 装载，产物
 * 必须自注册——`window.__ModuleLoader__.load({ id, factory: (require) => {
 * var module = …; …cjs 体…; return module.exports; } })`；react 等平台基线经
 * factory 的 require（壳层冻结种子表 PLATFORM_MODULES）解析，其余依赖全部内联。
 *
 * 反例判例：esbuild format:"esm" 产物带顶层 export/import.meta——classic script
 * 语法错误走 window.onerror 不触发 script error 事件，装载面只见「load 完成、
 * 工厂未注册」（loaded without registering），web boot 报「1 entry did not
 * activate」；内联 react 会造出第二副本——shell 渲染树组件 hooks 读到另一副本
 * 的 dispatcher（Invalid hook call）。
 */
const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = resolve(pkgDir, "dist/client.js");
const PLUGIN_ID = "@dsh-forge/expert-squad";

interface Registration {
  id?: unknown;
  factory?: unknown;
}

/** 按 classic <script> 语义求值产物（间接 eval = 全局作用域，非模块），捕获注册。 */
function evalBundleAsClassicScript(): Registration[] {
  const registrations: Registration[] = [];
  const globals = globalThis as typeof globalThis & Record<string, unknown>;
  const previousLoader = globals.__ModuleLoader__;
  // Node 求值环境无 window——classic <script> 语义里 window 即全局对象，别名补齐
  const previousWindow = globals.window;
  globals.window = globals;
  globals.__ModuleLoader__ = {
    load: (r: Registration) => registrations.push(r),
  };
  try {
    // eslint-disable-next-line no-eval -- 求值产物本身即测试目的（classic <script> 语义模拟）
    (0, eval)(readFileSync(bundlePath, "utf8"));
  } finally {
    globals.__ModuleLoader__ = previousLoader;
    globals.window = previousWindow;
  }
  return registrations;
}

describe("client bundle 装载契约（官方 clientBundle 配方四断言）", () => {
  it("classic script 求值注册唯一工厂（id=@dsh-forge/expert-squad）", () => {
    const registrations = evalBundleAsClassicScript();
    expect(registrations.length, "装载后无 __ModuleLoader__.load 注册").toBe(1);
    expect(registrations[0]!.id).toBe(PLUGIN_ID);
    expect(registrations[0]!.factory).toBeTypeOf("function");
  });

  it("工厂可物化——react 经种子 require 解析，返回 client face 组合 apply", () => {
    const [registration] = evalBundleAsClassicScript();
    const requested: string[] = [];
    const seedRequire = (spec: string): unknown => {
      requested.push(spec);
      if (spec === "react") return React;
      if (spec === "react/jsx-runtime") return jsxRuntime;
      // 官方 primitives 同列壳层种子表（quote-plugins 判例）——面板图标消费面。
      if (spec === "@deepseek-ai/dsh-client-ui-primitives") return undefined;
      throw new Error(`种子表之外的 require: ${spec}`);
    };
    const exports = (
      registration!.factory as (
        req: (s: string) => unknown,
      ) => Record<string, unknown>
    )(seedRequire);
    // 外置守卫：factory 物化期任何 require 都必须落在种子表内（seedRequire 对表外
    // 规格抛错）——react 实现被内联成第二副本会使 shell 渲染树组件 hooks 读到
    // 另一副本的 dispatcher（Invalid hook call）。当前 client face 为纯逻辑接线
    // （slots.inject(main) 挂载缝）、运行期零平台 require（scripts/bundle-client.mjs
    // 种子表注释）。
    expect(Array.isArray(requested)).toBe(true);
    const face = exports.expertSquadClient as { apply?: unknown };
    expect(face).toBeTypeOf("object");
    expect(face?.apply, "client face 缺组合 apply（DI 库件 → 真机 invalid plugin）").toBeTypeOf(
      "function",
    );
  });

  it("产物不含顶层 ESM 语句与 import.meta（classic script 语法兼容）", () => {
    const code = readFileSync(bundlePath, "utf8");
    expect(
      /^import[\s("']/m.test(code) || /^export\b/m.test(code),
      "顶层 import/export 语句在 classic script 是语法错误",
    ).toBe(false);
    expect(
      code.includes("import.meta"),
      "import.meta 在 classic script/CJS 不可用",
    ).toBe(false);
  });

  it('react 实现不内联（无 react 副本标记）', () => {
    const code = readFileSync(bundlePath, "utf8");
    expect(
      code.includes('"react.element"'),
      "内联了 react 实现副本（Symbol.for('react.element') 标记在场）",
    ).toBe(false);
  });

  it("classic script 形状：头为 __ModuleLoader__.load 注册头、尾为 return module.exports 装载尾", () => {
    const code = readFileSync(bundlePath, "utf8");
    expect(
      code.startsWith("window.__ModuleLoader__.load({"),
      "产物头非自注册注册头",
    ).toBe(true);
    expect(
      code.trimEnd().endsWith("return module.exports; } });"),
      "产物尾非 return module.exports; } }); 装载尾",
    ).toBe(true);
  });
});
