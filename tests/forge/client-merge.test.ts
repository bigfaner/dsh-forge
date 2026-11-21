// forge client 合并守卫（forge-deep-pack 1.5——P0 #6 定谳 A 形态三件套）：
// ui/index.ts 合并五件 client 自注册单元（import 五件 dist/client.js 消费产物），
// bundle-client 产物装载验证：五件自注册全发生、单外层求值内收敛、无悬空注册逃逸
// （id 全集 ∧ 序确定 ∧ 外层仅一次）+ 五件 client 并集契约 pin（external ∪ inject
// 并集由 bundle-client 从五件 package.json 字段驱动聚合，forge 静态声明恒等于并集）。
//
// 求值语义：classic <script> 顶层求值仅触发 forge 外层注册（expert-squad 同型基线）；
// 五件内联自注册单元在 factory 物化期（首次 require 各内联模块）触发注册——序 =
// ui/index.ts import 拼接序 = host COMPOSED 组合激活序。装载面 shim 覆盖求值 + 物化
// 全程（内联单元注册调用直达 window.__ModuleLoader__）。esbuild 模块缓存保证物化后
// 无二次注册（悬空注册逃逸面）。
//
// 注：esbuild 重打包剥除输入内注释，五件代际标记不在合并产物断言面（产物来源证据 =
// 五件注册头逐件在场）。project 自身 bundle 内联 react 实现（其既定形态，零改动面
// 继承）——合并不得产生新增副本，以 react 标记计数基线守卫。
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FORGE_DIR = resolve(REPO_ROOT, "plugins/forge");
const PLUGIN_ID = "@dsh-forge/forge";
// 注册序期望 = ui/index.ts import 拼接序（外层 forge 注册在先，随后五件依 import 序）。
const IMPORT_ORDER = [
  "@dsh-forge/project",
  "@dsh-forge/spec",
  "@dsh-forge/task-loop",
  "@dsh-forge/expert-squad",
  "@dsh-forge/knowledge",
];
const EXPECTED_REGISTRATION_ORDER = [PLUGIN_ID, ...IMPORT_ORDER];
// 平台基线种子表（bundle-client PLATFORM_MODULES——宿主壳层冻结种子单例）。
const SEED_MODULES = new Set([
  "react",
  "react/jsx-runtime",
  "@deepseek-ai/dsh-client-ui-primitives",
]);

const bundlePath = resolve(FORGE_DIR, "dist/client.js");
const readBundle = () => readFileSync(bundlePath, "utf8");

interface Registration {
  id?: unknown;
  factory?: unknown;
}

// 种子实现经消费 react 的插件工作区解析（根 tests 树无 react 依赖——五件样板 devDep 同源）。
const memberRequire = createRequire(resolve(REPO_ROOT, "plugins/project/package.json"));
const seedImplementations: Record<string, unknown> = {
  react: memberRequire("react"),
  "react/jsx-runtime": memberRequire("react/jsx-runtime"),
};
// primitives 深桩（官方 primitives 图标/组件消费面——物化期仅取属性引用，渲染归真机）。
const primitivesStub: unknown = new Proxy(() => undefined, {
  get: (_target, prop) => (prop === "then" || typeof prop === "symbol" ? undefined : primitivesStub),
  apply: () => primitivesStub,
});

/** 按 classic <script> 语义求值产物并物化全部注册工厂（宿主装载期全程），返回捕获结果。 */
function loadAndMaterialize(): { registrations: Registration[]; requested: string[] } {
  const requested: string[] = [];
  const captured: Registration[] = [];
  const globals = globalThis as typeof globalThis & Record<string, unknown>;
  const previousLoader = globals.__ModuleLoader__;
  const previousWindow = globals.window;
  globals.window = globals;
  globals.__ModuleLoader__ = { load: (r: Registration) => captured.push(r) };
  try {
    // eslint-disable-next-line no-eval -- 求值产物本身即测试目的（classic <script> 语义模拟）
    (0, eval)(readBundle());
    expect(captured.length, "顶层求值注册数 ≠ 1").toBe(1);
    expect(captured[0]!.id, "顶层求值未注册 forge 外层工厂").toBe(PLUGIN_ID);
    const seedRequire = (spec: string): unknown => {
      requested.push(spec);
      if (spec in seedImplementations) return seedImplementations[spec];
      if (spec === "@deepseek-ai/dsh-client-ui-primitives") return primitivesStub;
      throw new Error(`种子表之外的 require: ${spec}`);
    };
    // 宿主装载期语义：对每笔注册（外层 + 五件内联单元）逐工厂物化——五件注册头在
    // 外层工厂求值内发生，各件 require 消费发生在宿主物化各工厂时点。
    for (const registration of captured) {
      (registration.factory as (req: (s: string) => unknown) => unknown)(seedRequire);
    }
  } finally {
    globals.__ModuleLoader__ = previousLoader;
    globals.window = previousWindow;
  }
  return { registrations: captured, requested };
}

/** 五件 package.json dsh.client 字段并集（bundle-client 同源算法——字段驱动聚合）。 */
function unionFromMembers(field: "external" | "inject"): string[] {
  const values = IMPORT_ORDER.flatMap((member) => {
    const pkg = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "plugins", member.replace("@dsh-forge/", ""), "package.json"), "utf8"),
    ) as { dsh?: { client?: Record<string, string[]> } };
    return pkg.dsh?.client?.[field] ?? [];
  });
  return [...new Set(values)].sort();
}

describe("client 合并守卫——P0 #6 三件套（id 全集 ∧ 序确定 ∧ 外层仅一次）", () => {
  it("外层仅一次：classic script 求值恰一次 forge 外层注册，五件注册收敛于单次工厂物化内", () => {
    const code = readBundle();
    // 静态面：外层注册头在产物中恰出现一次（forge id）。
    const outerLoads = code.split(`window.__ModuleLoader__.load({ id: "${PLUGIN_ID}"`).length - 1;
    expect(outerLoads, "forge 外层注册头必须恰一次").toBe(1);
    // 求值 + 物化全程捕获：外层一次注册，五件全收敛于单次工厂求值内。
    const { registrations } = loadAndMaterialize();
    expect(registrations.length, "注册总数 ≠ 6（外层 + 五件）").toBe(6);
    expect(registrations[0]!.id).toBe(PLUGIN_ID);
  });

  it("id 全集：forge + 五件注册全部发生且无缺席/无名外件", () => {
    const { registrations } = loadAndMaterialize();
    expect(registrations.map((r) => r.id)).toEqual(EXPECTED_REGISTRATION_ORDER);
    for (const r of registrations) {
      expect(r.factory, `注册 ${String(r.id)} 缺工厂`).toBeTypeOf("function");
    }
  });

  it("序确定：注册序 = forge 外层 + ui/index.ts import 拼接序（= COMPOSED 组合激活序）", () => {
    expect(loadAndMaterialize().registrations.map((r) => r.id)).toEqual(EXPECTED_REGISTRATION_ORDER);
  });

  it("无悬空注册逃逸：顶层求值（不物化工厂）仅产生 forge 外层注册，五件注册不逃逸到求值层", () => {
    const captured: Registration[] = [];
    const globals = globalThis as typeof globalThis & Record<string, unknown>;
    const previousLoader = globals.__ModuleLoader__;
    const previousWindow = globals.window;
    globals.window = globals;
    globals.__ModuleLoader__ = { load: (r: Registration) => captured.push(r) };
    try {
      // eslint-disable-next-line no-eval -- 求值产物本身即测试目的（classic <script> 语义模拟）
      (0, eval)(readBundle());
    } finally {
      globals.__ModuleLoader__ = previousLoader;
      globals.window = previousWindow;
    }
    expect(captured.length, "悬空注册逃逸到顶层求值层").toBe(1);
    expect(captured[0]!.id).toBe(PLUGIN_ID);
  });

  it("五件消费产物内联实证：五件自注册注册头逐件在场（dist 消费非源码）", () => {
    const code = readBundle();
    for (const member of IMPORT_ORDER) {
      expect(code.includes(`window.__ModuleLoader__.load({ id: "${member}"`), `${member} 自注册单元缺席`).toBe(true);
    }
  });
});

describe("client 合并装载契约（classic script 形状 / 平台外置）", () => {
  it("classic script 形状：头为 forge 注册头、尾为 return module.exports 装载尾", () => {
    const code = readBundle();
    expect(code.startsWith(`window.__ModuleLoader__.load({ id: "${PLUGIN_ID}"`), "产物头非自注册注册头").toBe(true);
    expect(code.trimEnd().endsWith("return module.exports; } });"), "产物尾非装载尾").toBe(true);
  });

  it("产物不含顶层 ESM 语句与 import.meta（classic script 语法兼容）", () => {
    const code = readBundle();
    expect(/^import[\s("']/m.test(code) || /^export\b/m.test(code), "顶层 import/export 在 classic script 是语法错误").toBe(false);
    expect(code.includes("import.meta"), "import.meta 在 classic script/CJS 不可用").toBe(false);
  });

  it("react 实现不新增副本（合并产物 react 标记计数 = 五件基线继承，零新增）", () => {
    const baseline = readFileSync(resolve(REPO_ROOT, "plugins/project/dist/client.js"), "utf8");
    const count = (s: string) => (s.match(/react\.element/g) ?? []).length;
    expect(count(readBundle()), "合并产物出现新增 react 副本").toBe(count(baseline));
  });

  it("工厂物化期 require 全落种子表（宿主提供件一律 external 不打入）", () => {
    const { requested } = loadAndMaterialize();
    expect(requested.length, "五件合并体零平台 require 不合常理（合并装配失效）").toBeGreaterThan(0);
    for (const spec of requested) {
      expect(SEED_MODULES.has(spec), `require 落种子表外："${spec}"（宿主提供件被内联）`).toBe(true);
    }
  });
});

describe("五件 client 并集契约 pin（external ∪ inject 并集——字段驱动聚合）", () => {
  const forgePkg = JSON.parse(readFileSync(resolve(FORGE_DIR, "package.json"), "utf8")) as {
    dsh?: { client?: { platform?: string; external?: string[]; inject?: string[] } };
  };

  it("forge dsh.client.external 恒等于五件 external 并集（排序规范化）", () => {
    expect(forgePkg.dsh?.client?.external).toEqual(unionFromMembers("external"));
  });

  it("forge dsh.client.inject 恒等于五件 inject 并集（排序规范化）", () => {
    expect(forgePkg.dsh?.client?.inject).toEqual(unionFromMembers("inject"));
  });

  it("bundle-client 聚合实现与测试并集算法同源（脚本消费五件 package.json 字段 + 并集进 esbuild external）", () => {
    const script = readFileSync(resolve(FORGE_DIR, "scripts/bundle-client.mjs"), "utf8");
    expect(script.includes('unionOf("external")')).toBe(true);
    expect(script.includes('unionOf("inject")')).toBe(true);
    expect(script.includes("externalUnion, ...injectUnion"), "并集未进 esbuild external 面").toBe(true);
    expect(script.includes("契约 pin")).toBe(true);
  });
});
