// forge_dirs / forge_resolve_path 工具定义的官方注册面契约测试（回归钉——2026-11-27 真机判例）：
// 官方 ctx.tools.register 用 @deepseek-ai/dsh-tools 的受限 JSON Schema 方言校验 output.schema，
// 违反即抛错——注册被拒、工具静默缺席（本插件把注册异常记为诊断后继续，其余工具照常）。
// 判例：dir 的 type 写成 ["string","null"]、params 的 additionalProperties 写成子 schema，
// 两者都被方言拒绝，forge_dirs 与 forge_resolve_path 在宿主里整体消失；而既有单测用桩注册面，
// 桩不校验 schema，全绿放行。本测试用官方校验器本体（devDependency 精确 pin）直检两个工具定义：
//   ① output.schema 过 assertSupportedJsonSchema（type 单类型字符串 / object 显式布尔
//      additionalProperties / 可空用 oneOf）；
//   ② parameters 过 assertObjectJsonSchema（含 dest.enum 在场形态——有/无带参声明两态）。
import { describe, expect, it } from "vitest";
import { assertObjectJsonSchema, assertSupportedJsonSchema } from "@deepseek-ai/dsh-tools";
import { join } from "node:path";
import { createForgeDirsTool, createForgePathsToolFace, createForgeResolvePathTool, type ForgePathsToolFace } from "./forge-paths.js";
import { mergeDeclarations, type ReflectDeclarePullFace } from "../dirs/anchors.js";

const SOURCES = { dshHome: "X:\\home", projectRoot: "Z:\\ws\\main", workspaceRoot: "Z:\\ws" };
const RESOLVER = async () => "p-1";

/** 带参声明替身（任一插件声明两个带参键——令 dest.enum 在场） */
const PARAMED_DECLARATION = {
  source: "dirKeys.sample",
  entries: {
    "sample.dir": { description: "x", deps: ["workspaceRoot"], params: ["slug"], resolve: () => "x" },
    "sample.task_dir": { description: "y", deps: ["workspaceRoot"], params: ["slug", "localId"], resolve: () => "y" },
  },
};

function faces(): readonly { label: string; face: ForgePathsToolFace }[] {
  const reflect: ReflectDeclarePullFace = {
    props: { "dirKeys.sample": PARAMED_DECLARATION.entries },
    get: () => PARAMED_DECLARATION.entries,
  };
  return [
    { label: "无带参声明", face: { anchorsOf: async () => SOURCES, declarations: () => mergeDeclarations([]) } },
    {
      label: "有带参声明（dest.enum 在场）",
      face: createForgePathsToolFace({ anchorsOf: async () => SOURCES, reflectOf: () => reflect }),
    },
  ];
}

describe("官方注册面契约：两个目录工具的定义可被 ctx.tools.register 接受", () => {
  for (const { label, face } of faces()) {
    it(`forge_dirs · ${label}：output.schema 过官方方言校验，parameters 过对象 schema 校验`, () => {
      const tool = createForgeDirsTool(face, RESOLVER);
      expect(() => assertSupportedJsonSchema(tool.output.schema)).not.toThrow();
      expect(() => assertObjectJsonSchema(tool.parameters)).not.toThrow();
    });

    it(`forge_resolve_path · ${label}：output.schema 过官方方言校验，parameters 过对象 schema 校验`, () => {
      const tool = createForgeResolvePathTool(face, RESOLVER);
      expect(() => assertSupportedJsonSchema(tool.output.schema)).not.toThrow();
      expect(() => assertObjectJsonSchema(tool.parameters)).not.toThrow();
    });
  }

  it("方言判例钉：type 数组与 schema 值 additionalProperties 确为官方校验器所拒（防判例失效后测试空转）", () => {
    expect(() => assertSupportedJsonSchema({ type: "object", additionalProperties: false, properties: { dir: { type: ["string", "null"] } } })).toThrow(
      /single type string/,
    );
    expect(() =>
      assertSupportedJsonSchema({ type: "object", additionalProperties: false, properties: { params: { type: "object", additionalProperties: { type: "string" } } } }),
    ).toThrow(/additionalProperties must be a boolean/);
  });

  it("校验器来源 = 本包 devDependency 精确 pin（非传递依赖的偶然可达）", () => {
    const pkg = JSON.parse(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("node:fs") as typeof import("node:fs")).readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf8"),
    ) as { devDependencies?: Record<string, string> };
    expect(pkg.devDependencies?.["@deepseek-ai/dsh-tools"]).toMatch(/^\d+\.\d+\.\d+(-rc\.\d+)?$/);
  });
});
