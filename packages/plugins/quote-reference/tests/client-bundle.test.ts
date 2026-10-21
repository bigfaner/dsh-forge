import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { QUOTE_REFERENCE_STYLE_MARKER } from "../src/client/styles.js";

/**
 * 浏览器半装载契约守卫（dsh-client-modules，官方 clientBundle 生成形状——
 * input-history 判例同构）：宿主把 exports["./client"] 产物按 classic <script> 装载，
 * 产物必须自注册——`window.__ModuleLoader__.load({ id, factory: (require) => {
 * var module = …; …cjs 体…; return module.exports; } })`。
 *
 * proposal 硬门 ⑨：client 半 esbuild 单文件预打包，守卫测试断言产物**非相对 import
 * 说明符为空集**——表外依赖全部内联（PLATFORM_MODULES 种子表当前零消费），任何新
 * 非相对 require 漂移即测试失败，阻止「表外依赖真机 require 缺席」形态上机。
 */
const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = resolve(pkgDir, "dist/client.js");
const PLUGIN_ID = "@dsh-forge/quote-reference";

interface Registration {
  id?: unknown;
  factory?: unknown;
}

/** 按 classic <script> 语义求值产物（间接 eval = 全局作用域，非模块），捕获注册。 */
function evalBundleAsClassicScript(doc?: unknown): Registration[] {
  const registrations: Registration[] = [];
  const globals = globalThis as typeof globalThis & Record<string, unknown>;
  const previousLoader = globals.__ModuleLoader__;
  // Node 求值环境无 window——classic <script> 语义里 window 即全局对象，别名补齐；
  // document 由用例按需供给（样式 factory 同步段注入断言面）。
  const previousWindow = globals.window;
  const previousDocument = globals.document;
  globals.window = globals;
  if (doc !== undefined) globals.document = doc;
  globals.__ModuleLoader__ = {
    load: (r: Registration) => registrations.push(r),
  };
  try {
    // eslint-disable-next-line no-eval -- 求值产物本身即测试目的（classic <script> 语义模拟）
    (0, eval)(readFileSync(bundlePath, "utf8"));
  } finally {
    globals.__ModuleLoader__ = previousLoader;
    globals.window = previousWindow;
    globals.document = previousDocument;
  }
  return registrations;
}

/** 产物中全部 require/import 说明符（静态扫描——cjs 体 esbuild 只产 require 调用）。 */
function bundleImportSpecifiers(): string[] {
  const source = readFileSync(bundlePath, "utf8");
  const specifiers: string[] = [];
  for (const m of source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) {
    specifiers.push(m[1]!);
  }
  for (const m of source.matchAll(/\bfrom\s*["']([^"']+)["']/g)) {
    specifiers.push(m[1]!);
  }
  return specifiers;
}

/** 求值并物化（注册捕获 + factory 调用——factory 同步段语义 = 物化期执行；globals 在 factory 调用期间保持供给）。 */
function materialize(doc?: unknown): Record<string, unknown> {
  const globals = globalThis as typeof globalThis & Record<string, unknown>;
  const previousLoader = globals.__ModuleLoader__;
  const previousWindow = globals.window;
  const previousDocument = globals.document;
  const registrations: Registration[] = [];
  globals.window = globals;
  if (doc !== undefined) globals.document = doc;
  globals.__ModuleLoader__ = { load: (r: Registration) => registrations.push(r) };
  try {
    // eslint-disable-next-line no-eval -- 求值产物本身即测试目的（classic <script> 语义模拟）
    (0, eval)(readFileSync(bundlePath, "utf8"));
    const registration = registrations[0]!;
    expect(registration.id).toBe(PLUGIN_ID);
    const seedRequire = (spec: string): unknown => {
      throw new Error(`种子表之外的 require: ${spec}`);
    };
    return (registration.factory as (req: (s: string) => unknown) => Record<string, unknown>)(seedRequire);
  } finally {
    globals.__ModuleLoader__ = previousLoader;
    globals.window = previousWindow;
    globals.document = previousDocument;
  }
}

/** 极简 DOM 窄面（真实元素链路：createElement 产物真实挂 head/children 数组）。 */
interface StubElement {
  tagName: string;
  attrs: Map<string, string>;
  textContent: string;
}
function stubDocument(): {
  doc: Parameters<typeof evalBundleAsClassicScript>[0];
  head: StubElement[];
} {
  const head: StubElement[] = [];
  const doc = {
    createElement(tagName: string): StubElement & { setAttribute(n: string, v: string): void } {
      const el: StubElement = { tagName, attrs: new Map(), textContent: "" };
      return {
        ...el,
        setAttribute: (n: string, v: string) => el.attrs.set(n, v),
        get textContent() {
          return el.textContent;
        },
        set textContent(v: string) {
          el.textContent = v;
        },
      };
    },
    querySelectorAll(selectors: string): StubElement[] {
      const attr = selectors.slice(1, -1);
      return head.filter((el) => el.attrs.has(attr));
    },
    head: { appendChild: (node: StubElement) => head.push(node) },
  };
  return { doc, head };
}

describe("client bundle 装载契约（官方 clientBundle 配方）", () => {
  it("classic script 求值注册唯一工厂（id=@dsh-forge/quote-reference）", () => {
    const registrations = evalBundleAsClassicScript();
    expect(registrations.length, "装载后无 __ModuleLoader__.load 注册").toBe(1);
    expect(registrations[0]!.id).toBe(PLUGIN_ID);
    expect(registrations[0]!.factory).toBeTypeOf("function");
  });

  it("工厂可物化——零种子 require，exports 顶层为 cordis 插件面（apply）", () => {
    const [registration] = evalBundleAsClassicScript();
    const requested: string[] = [];
    const seedRequire = (spec: string): unknown => {
      requested.push(spec);
      throw new Error(`种子表之外的 require: ${spec}`);
    };
    const exports = (
      registration!.factory as (
        req: (s: string) => unknown,
      ) => Record<string, unknown>
    )(seedRequire);
    expect(typeof exports.apply, "loader 正门：顶层 apply（嵌套导出不被识别）").toBe("function");
    expect(requested, "物化期零平台 require").toEqual([]);
  });

  it("守卫硬门：产物非相对 import 说明符为空集（表外依赖全内联）", () => {
    const nonRelative = bundleImportSpecifiers().filter(
      (spec) => !spec.startsWith(".") && !spec.startsWith("/"),
    );
    expect(nonRelative).toEqual([]);
  });
});

describe("样式生命周期（dev-guide §5：factory 同步段注入——claimStyles 清点窗口）", () => {
  it("物化注入：求值产物（factory 同步段）即在 head 落未打标 <style>——可被官方 claim", () => {
    const { doc, head } = stubDocument();
    materialize(doc);
    expect(head.length, "factory 同步段样式未注入").toBe(1);
    expect(head[0]!.tagName).toBe("style");
    expect(head[0]!.attrs.has(QUOTE_REFERENCE_STYLE_MARKER)).toBe(true);
    // 未携带官方 data-plugin 标 = 处于 claimStyles 清点窗口（官方物化后打标）
    expect(head[0]!.attrs.has("data-plugin")).toBe(false);
  });

  it("无 document 环境（Node 求值）静默跳过，不炸装载", () => {
    expect(() => materialize(undefined)).not.toThrow();
  });

  it("幂等：同标记元素在场 = 不重插", () => {
    const { doc, head } = stubDocument();
    // 先注入一枚，再求值 bundle——factory 段应识别在场元素跳过
    head.push({
      tagName: "style",
      attrs: new Map([[QUOTE_REFERENCE_STYLE_MARKER, ""]]),
      textContent: "",
    });
    evalBundleAsClassicScript(doc);
    materialize(doc);
    expect(head.length).toBe(1);
  });
});
