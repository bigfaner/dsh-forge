// typert 壳形状 pin（typert strict 迁移 1.4——E 路配方防漂移门）：
// 生成步（scripts/generate-typert.mjs）构建期分析取材走 ambient 协议壳
// typert-protocol.d.ts（tsconfig.base paths 映射），运行期装饰器/gateway SRC 走 npm
// @deepseek-ai/dsh-typert-protocol。两真源形状漂移 = 分析面与运行面分叉（取材归零/
// 端点错位）。本测试把「分析壳 ↔ npm 协议包形状」钉住：
//   1. 关键符号双面在场（类/装饰器/映射接口/codec 类型）；
//   2. 构造器/装饰器签名形状（serviceKey + namespace 覆写、多 overload）；
//   3. npm 包 exports 含 ./remote-info（生成工件运行期 import 面）。
// 壳是分析面最小子集，不做逐字等值断言（npm 面超集为合法形态）。
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const requirePkg = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../../package.json"));
const projectRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const pkgRoot = dirname(requirePkg.resolve("@deepseek-ai/dsh-typert-protocol/package.json"));
const shellSrc = readFileSync(join(projectRoot, "typert-protocol.d.ts"), "utf8");
const npmSrc = [
  readFileSync(join(pkgRoot, "lib/types/index.d.ts"), "utf8"),
  readFileSync(join(pkgRoot, "lib/types/types.d.ts"), "utf8"),
].join("\n");
const npmManifest = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
  exports?: Record<string, unknown>;
};

/** 双面在场的关键符号（name → kind 词）：分析壳声明面与 npm 公开导出面各出现一次。 */
const CRITICAL_SYMBOLS: readonly { readonly name: string; readonly kind: RegExp }[] = [
  { name: "TypertRemoteService", kind: /class TypertRemoteService/ },
  { name: "Remote", kind: /function Remote/ },
  { name: "RemoteScope", kind: /function RemoteScope/ },
  { name: "bindTypertRemote", kind: /function bindTypertRemote/ },
  { name: "TypertLookupMap", kind: /interface TypertLookupMap/ },
  { name: "TypertContextMap", kind: /interface TypertContextMap/ },
  { name: "TypertRemoteMap", kind: /interface TypertRemoteMap/ },
  { name: "TypertRemoteNamespaceMap", kind: /interface TypertRemoteNamespaceMap/ },
  { name: "TypertClientRemote", kind: /(interface|type) TypertClientRemote/ },
  { name: "RemoteResult", kind: /(interface|type) RemoteResult/ },
  { name: "RemoteStreamHandle", kind: /interface RemoteStreamHandle/ },
  { name: "InvocationDescriptor", kind: /(interface|type) InvocationDescriptor/ },
  { name: "InvocationParameterDescriptor", kind: /(interface|type) InvocationParameterDescriptor/ },
  { name: "TypertCodec", kind: /(interface|type) TypertCodec/ },
  { name: "TypertRemoteContribution", kind: /(interface|type) TypertRemoteContribution/ },
];

describe("typert 壳形状 pin（分析壳 ↔ npm 协议包防漂移）", () => {
  it("关键符号双面在场（shell 声明面 + npm 导出面）", () => {
    for (const { name, kind } of CRITICAL_SYMBOLS) {
      expect(kind.test(shellSrc), `shell 缺 ${name}`).toBe(true);
      expect(kind.test(npmSrc), `npm 协议包缺 ${name}`).toBe(true);
    }
  });

  it("构造器形状：serviceKey 第二参 + namespace 覆写第三参（双面）", () => {
    expect(shellSrc).toMatch(/constructor\(\s*ctx: [^,]+,\s*serviceKey: string,\s*options\?:\s*\{[^}]*namespace\?:/s);
    expect(npmSrc).toMatch(/protected constructor\(\s*ctx: [^,]+,\s*serviceKey: string,\s*options\?: TypertGatewayBindingOptions\)/s);
    expect(npmSrc).toMatch(/interface TypertGatewayBindingOptions[\s\S]{0,200}?readonly namespace\?: string/s);
  });

  it("Remote 装饰器多 overload（裸方法 + name/options 工厂）双面在场", () => {
    expect(shellSrc.match(/ClassMethodDecoratorContext/g)?.length).toBeGreaterThanOrEqual(2);
    expect(shellSrc).toMatch(/function Remote\(option: string \|/);
    expect(npmSrc.match(/ClassMethodDecoratorContext/g)?.length).toBeGreaterThanOrEqual(2);
    expect(npmSrc).toMatch(/function Remote\(name: string\)/);
    expect(npmSrc).toMatch(/function Remote<[^>]+>\(options: NoInfer<RemoteMethodOptions/);
  });

  it("npm 协议包 exports 含 ./remote-info 与 .（生成工件运行期 import 面）", () => {
    expect(Object.hasOwn(npmManifest.exports ?? {}, "./remote-info")).toBe(true);
    expect(Object.hasOwn(npmManifest.exports ?? {}, ".")).toBe(true);
    // remoteMethods = 运行期 gateway SRC 发现读面（分析壳不需要，npm 面必须承袭）
    expect(npmSrc).toMatch(/function remoteMethods/);
  });
});
