// forge client bundle 守卫（forge-aggregate-bundle 1.6——ui/index.ts 去 client 合并
// 转自有视图最小入口后，bundle-client 构建面保留的装载契约守卫）：产物 = forge 单
// 注册 classic <script>（零五件内联自注册单元——五件插行自带 client 半侧各自注册）。
// forge dsh.client external ∪ inject 并集契约 pin 保留（字段驱动聚合与静态声明恒等）。
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FORGE_DIR = resolve(REPO_ROOT, "plugins/forge");
const PLUGIN_ID = "@dsh-forge/forge";
const FIVE_MEMBERS = [
  "@dsh-forge/project",
  "@dsh-forge/spec",
  "@dsh-forge/task-loop",
  "@dsh-forge/expert-squad",
  "@dsh-forge/knowledge",
];

const bundlePath = resolve(FORGE_DIR, "dist/client.js");
const readBundle = () => readFileSync(bundlePath, "utf8");

/** 按 classic <script> 语义求值产物并物化注册工厂（宿主装载期全程），返回捕获结果。 */
function loadAndMaterialize(): { registrations: Array<{ id?: unknown; factory?: unknown }>; requested: string[] } {
  const requested: string[] = [];
  const captured: Array<{ id?: unknown; factory?: unknown }> = [];
  const globals = globalThis as typeof globalThis & Record<string, unknown>;
  const previousLoader = globals.__ModuleLoader__;
  const previousWindow = globals.window;
  globals.window = globals;
  globals.__ModuleLoader__ = { load: (r: { id?: unknown; factory?: unknown }) => captured.push(r) };
  try {
    // eslint-disable-next-line no-eval -- 求值产物本身即测试目的（classic <script> 语义模拟）
    (0, eval)(readBundle());
    expect(captured.length, "顶层求值注册数 ≠ 1").toBe(1);
    expect(captured[0]!.id, "顶层求值未注册 forge 外层工厂").toBe(PLUGIN_ID);
    const seedRequire = (spec: string): unknown => {
      requested.push(spec);
      return undefined;
    };
    for (const registration of captured) {
      (registration.factory as (req: (s: string) => unknown) => unknown)(seedRequire);
    }
  } finally {
    globals.__ModuleLoader__ = previousLoader;
    globals.window = previousWindow;
  }
  return { registrations: captured, requested };
}

describe("client bundle 自有入口守卫（单注册 classic script）", () => {
  it("外层仅一次：classic script 求值恰一次 forge 注册（自有视图最小入口）", () => {
    const code = readBundle();
    const outerLoads = code.split(`window.__ModuleLoader__.load({ id: "${PLUGIN_ID}"`).length - 1;
    expect(outerLoads, "forge 注册头必须恰一次").toBe(1);
    expect(loadAndMaterialize().registrations.map((r) => r.id)).toEqual([PLUGIN_ID]);
  });

  it("零合并负断言：产物无五件自注册注册头（bundle 通道五件 client 各自注册，forge 零内联）", () => {
    const code = readBundle();
    for (const member of FIVE_MEMBERS) {
      expect(code.includes(`window.__ModuleLoader__.load({ id: "${member}"`), `${member} 注册头不应内联`).toBe(false);
    }
    expect(loadAndMaterialize().requested, "自有入口零平台 require（零内联依赖面）").toHaveLength(0);
  });

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
});

describe("dsh.client 并集契约 pin（bundle-client 字段驱动聚合保留面）", () => {
  const forgePkg = JSON.parse(readFileSync(resolve(FORGE_DIR, "package.json"), "utf8")) as {
    dsh?: { client?: { platform?: string; external?: string[]; inject?: string[] } };
  };

  /** 五件 package.json dsh.client 字段并集（bundle-client 同源算法）。 */
  function unionFromMembers(field: "external" | "inject"): string[] {
    const values = FIVE_MEMBERS.flatMap((member) => {
      const pkg = JSON.parse(
        readFileSync(resolve(REPO_ROOT, "plugins", member.replace("@dsh-forge/", ""), "package.json"), "utf8"),
      ) as { dsh?: { client?: Record<string, string[]> } };
      return pkg.dsh?.client?.[field] ?? [];
    });
    return [...new Set(values)].sort();
  }

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
