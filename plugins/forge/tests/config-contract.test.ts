// forge 契约测试②：单行自插 config 行物化面——!!js 表达式与 assembly 延伸常量同源
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

/** 派发单源同源期望式（静态双检正本——assembly 常量拼装，非字面量复制；
 * DSH_HOME 缺席兜底 undefined 非 false——bug 674119f2 desktop 实证：false 穿透
 * 消费端 `??` 缺省（project.db 收到 boolean 崩溃），undefined 才能触发缺省腿）。 */
const HOME_EXPR = `(process.env.${DSH_HOME_ENV} || undefined) && (process.env.${DSH_HOME_ENV} + '${FORGE_HOME_SUFFIX}')`;

/** 抽取 forge 行 home 键的 !!js 表达式（id = dshforge 异 id——bug 1102d9d8；缺失 = undefined）。 */
function extractHomeExpr(): string | undefined {
  const block = patchYaml.match(/-\s+id:\s*dshforge\b[\s\S]*$/);
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

  it("物化语义 = {DSH_HOME}/forge（forge home 缺省派生——直写正本缺省分支）", () => {
    expect(evalExpr(extractHomeExpr()!, { DSH_HOME: "Z:\\mock-dsh-home" })).toBe("Z:\\mock-dsh-home/forge");
    expect(evalExpr(extractHomeExpr()!, { DSH_HOME: "/data/dsh" })).toBe("/data/dsh/forge");
  });

  it("DSH_HOME 缺席 → home = undefined（消费端 `??` 缺省腿恢复生效——bug 674119f2：false 穿透 `??` 致 project.db 收到 boolean 崩溃，undefined 才触发缺省）", () => {
    expect(evalExpr(extractHomeExpr()!, {})).toBeUndefined();
    expect(evalExpr(extractHomeExpr()!, { DSH_HOME: "" })).toBeUndefined();
  });

  it("全 patch 派发表达式缺省派生封闭：DSH_HOME 派生点缺席一律产 undefined（false 漂移即红——bug 674119f2；preset 子树技能混合锚 IIFE 双腿形单列——兜底腿含 DSH_HOME 但形态为 try/catch 探测，非 `|| undefined &&` 派生面）", () => {
    const envPoints = [...patchYaml.matchAll(/^(?!#).*!!js\s+(.+)$/gm)].map((m) => m[1]!).filter((p) => p.includes("process.env.DSH_HOME") && !p.startsWith("(()=>{"));
    expect(envPoints.length).toBeGreaterThanOrEqual(6);
    for (const expr of envPoints) {
      expect(expr, `缺省派生 undefined 形态：${expr}`).toMatch(/^\(process\.env\.DSH_HOME \|\| undefined\) && /);
      expect(evalExpr(expr, {})).toBeUndefined();
      expect(evalExpr(expr, { DSH_HOME: "" })).toBeUndefined();
    }
  });

  it("preset 子树技能混合锚封闭：五成员锚 IIFE try/catch 双腿形（baseUrl 解析优先 + DSH_HOME generation 探测兜底，desktop profile 根 baseUrl 必失败落兜底），零 throw 冒泡（1.34 技能预设独占收敛）", () => {
    const anchorPoints = [...patchYaml.matchAll(/^(?!#).*!!js\s+(\(\(\)=>\{.*\}\)\(\))$/gm)].map((m) => m[1]!);
    expect(anchorPoints, "五成员混合锚逐件在场").toHaveLength(5);
    for (const member of ["project", "spec", "task-loop", "expert-squad", "knowledge"] as const) {
      const expr = anchorPoints.find((p) => p.includes(`'@dsh-forge/${member}/package.json'`));
      expect(expr, `${member} 锚在场`).toBeDefined();
      expect(expr, `${member} baseUrl 腿`).toContain(`createRequire(baseUrl).resolve('@dsh-forge/${member}/package.json')`);
      expect(expr, `${member} DSH_HOME generation 探测兜底腿`).toContain("process.env.DSH_HOME");
      expect(expr, `${member} 零裸 throw`).not.toContain("throw ");
      // 形态可求值（真实 process——合法 JS 语法面）：DSH_HOME 缺席兜底腿 → undefined
      expect(new Function(`"use strict"; return (${expr});`)(), `${member} 兜底腿求值 undefined（DSH_HOME 缺席）`).toBeUndefined();
    }
  });

  it("占位符物化面封闭：!!js 求值点 = forge 行 home 表达式 + 五件插行派发表达式 + 官方 preset 底稿平台/禁用表达式 + preset 子树技能混合锚 ×5，无 {projectDir}/{homeDir} 模板", () => {
    expect(patchYaml).not.toContain("{projectDir}");
    expect(patchYaml).not.toContain("{homeDir}");
    const jsPoints = [...patchYaml.matchAll(/^(?!#).*!!js\s+(.+)$/gm)].map((m) => m[1]!);
    expect(jsPoints[0]).toBe(HOME_EXPR);
    // preset 子树技能混合锚（IIFE 双腿形——形态断言归本文件混合锚封闭 + skills-rows-contract）
    const skillAnchors = jsPoints.filter((p) => p.startsWith("(()=>{"));
    expect(skillAnchors).toHaveLength(5);
    const otherPoints = jsPoints.slice(1).filter((p) => !p.startsWith("(()=>{"));
    // 非自锚点 = 五件插行派发 config 表达式 ×6（home/dbFile/tasksHome——静态直检归
    // tests/forge/skills-rows-contract.test.ts）+ 官方 preset 底稿 platform 禁用
    // 表达式 ×2 + plugin-manager profileContext ×1。
    expect(otherPoints).toHaveLength(9);
    expect(otherPoints.filter((p) => p.startsWith("process.platform"))).toHaveLength(2);
    expect(otherPoints.filter((p) => p.includes("profileContext"))).toHaveLength(1);
    // 模板占位符负断言（锚点 IIFE 形自带函数体花括号——非模板语义，不纳入）
    for (const point of otherPoints) {
      expect(point).not.toMatch(/\{[^}]+\}/);
    }
  });
});
