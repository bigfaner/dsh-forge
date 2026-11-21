// forge 契约测试②：单行自插 config 行物化面——!!js 表达式与 assembly 派发单源同源
// （静态双检：patch home 表达式由 host/assembly.ts 延伸常量同源拼出，漂移即红）。
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DSH_HOME_ENV,
  FORGE_HOME_SUFFIX,
} from "../host/assembly.js";

const FORGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const patchYaml = readFileSync(resolve(FORGE_ROOT, "cordis.patch.yml"), "utf8");

/** 派发单源同源期望式（静态双检正本——assembly 常量拼装，非字面量复制） */
const HOME_EXPR = `process.env.${DSH_HOME_ENV} && (process.env.${DSH_HOME_ENV} + '${FORGE_HOME_SUFFIX}')`;

/** 抽取 forge 行 home 键的 !!js 表达式（缺失 = undefined）。 */
function extractHomeExpr(): string | undefined {
  const block = patchYaml.match(/-\s+id:\s*forge\b[\s\S]*$/);
  return block?.[0]?.match(/^\s+home:\s*!!js\s+(.+)$/m)?.[1];
}

/** 在受控 env 下求值 !!js 表达式（不触真实 process——物化语义纯函数化验证）。 */
function evalExpr(expr: string, env: Record<string, string | undefined>): unknown {
  const fakeProcess = { env };
  return new Function("process", `"use strict"; return (${expr});`)(fakeProcess);
}

describe("forge patch config 行物化面（与派发单源同源）", () => {
  it("home !!js 表达式 = assembly 延伸常量同源拼装（静态双检——字面量漂移即红）", () => {
    expect(extractHomeExpr()).toBe(HOME_EXPR);
  });

  it("物化语义 = {DSH_HOME}/forge（forge home 缺省派生——resolveForgeLayout 同径）", () => {
    expect(evalExpr(extractHomeExpr()!, { DSH_HOME: "Z:\\mock-dsh-home" })).toBe("Z:\\mock-dsh-home/forge");
    expect(evalExpr(extractHomeExpr()!, { DSH_HOME: "/data/dsh" })).toBe("/data/dsh/forge");
  });

  it("DSH_HOME 缺席 → home falsy（fail-soft 不阻载——forge apply 零配置派发，五件回落单装缺省）", () => {
    expect(evalExpr(extractHomeExpr()!, {})).toBeFalsy();
    expect(evalExpr(extractHomeExpr()!, { DSH_HOME: "" })).toBeFalsy();
  });

  it("占位符物化面封闭：!!js 求值点 = forge 行 home 表达式 + 五件自锚表达式 ×2（顶层 skills 行 + preset 嵌套行——自锚本包 skills/，bundle 介质）+ 官方 preset 底稿平台/禁用表达式，无 {projectDir}/{homeDir} 模板", () => {
    expect(patchYaml).not.toContain("{projectDir}");
    expect(patchYaml).not.toContain("{homeDir}");
    const jsPoints = [...patchYaml.matchAll(/^(?!#).*!!js\s+(.+)$/gm)].map((m) => m[1]!);
    expect(jsPoints[0]).toBe(HOME_EXPR);
    // 自锚点 = 五件 <pkg>/package.json resolve 表达式 ×（顶层行 + preset 嵌套行）= 10。
    const anchorPoints = jsPoints.slice(1).filter((p) => p.includes("/package.json"));
    expect(anchorPoints).toHaveLength(10);
    const otherPoints = jsPoints.slice(1).filter((p) => !p.includes("/package.json"));
    // 非自锚点 = 五件插行派发 config 表达式 ×6（home/dbFile/tasksHome——bundle 档派发
    // 映射双检归 tests/forge/patch-generator.test.ts）+ 官方 preset 底稿 platform 禁用
    // 表达式 ×2 + plugin-manager profileContext ×1。
    expect(otherPoints).toHaveLength(9);
    expect(otherPoints.filter((p) => p.startsWith("process.platform"))).toHaveLength(2);
    expect(otherPoints.filter((p) => p.includes("profileContext"))).toHaveLength(1);
    for (const point of jsPoints) {
      expect(point).not.toMatch(/\{[^}]+\}/);
    }
  });
});
