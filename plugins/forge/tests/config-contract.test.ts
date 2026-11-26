// forge 契约测试②：单行自插 config 行物化面——!!js 表达式 = 官方 dshHomePath 服务写法
// （静态双检：forge 根统一 dshHomePath('forge')，由 boot 提供该服务——官方安装版 patch
// 同款；缺席降级由各插件消费端降级链承接，spec forge-dirs-unification §2.4）。
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FORGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const patchYaml = readFileSync(resolve(FORGE_ROOT, "cordis.patch.yml"), "utf8");

/** forge 根官方写法（spec §2.4——dshHomePath('forge')） */
const HOME_EXPR = `dshHomePath('forge')`;

/** 抽取 forge 行 home 键的 !!js 表达式（id = forge-bundle 异 id——bug 1102d9d8；缺失 = undefined）。 */
function extractHomeExpr(): string | undefined {
  const block = patchYaml.match(/-\s+id:\s*forge-bundle\b[\s\S]*$/);
  return block?.[0]?.match(/^\s+home:\s*!!js\s+(.+)$/m)?.[1];
}

describe("forge patch config 行物化面（与官方 dshHomePath 写法同源）", () => {
  it("forge 行 home !!js 表达式 = dshHomePath('forge')（静态双检——字面量漂移即红）", () => {
    expect(extractHomeExpr()).toBe(HOME_EXPR);
  });

  it("五件插行派发 config 全走 dshHomePath（project home = 运行时根下发 + 四 dbFile = forge.db + tasksHome = projects）", () => {
    const dispatch = [...patchYaml.matchAll(/^        (\w+): !!js (dshHomePath.+)$/gm)].map((m) => [m[1]!, m[2]!] as const);
    expect(dispatch).toEqual([
      ["home", "dshHomePath('forge')"], // forge-bundle
      ["home", "dshHomePath('forge')"], // project 运行时根
      ["dbFile", "dshHomePath('forge', 'db/forge/forge.db')"], // project
      ["dbFile", "dshHomePath('forge', 'db/forge/forge.db')"], // spec
      ["dbFile", "dshHomePath('forge', 'db/forge/forge.db')"], // task-loop
      ["tasksHome", "dshHomePath('forge', 'projects')"], // task-loop
      ["dbFile", "dshHomePath('forge', 'db/forge/forge.db')"], // knowledge——组合安装库文件 = {DSH_HOME}/forge/db/forge/forge.db
    ]);
  });

  it("全 patch 非锚派发表达式封闭：零 DSH_HOME env 派生点（旧 `(env || undefined) &&` 形退役——降级链归各插件消费端）", () => {
    const envPoints = [...patchYaml.matchAll(/^(?!#).*!!js\s+(.+)$/gm)].map((m) => m[1]!).filter((p) => p.includes("process.env.DSH_HOME") && !p.startsWith("(()=>{"));
    expect(envPoints).toEqual([]);
    const dispatchPoints = [...patchYaml.matchAll(/^        (\w+): !!js (.+)$/gm)].map((m) => m[2]!);
    for (const expr of dispatchPoints) {
      expect(expr, `派发表达式 = dshHomePath 写法：${expr}`).toMatch(/^dshHomePath\(/);
    }
  });

  it("preset 子树技能混合锚封闭：五成员锚 IIFE try/catch 双腿形（baseUrl 解析优先 + DSH_HOME generation 探测兜底，零 throw 冒泡；1.34 技能预设独占收敛）", () => {
    const anchorPoints = [...patchYaml.matchAll(/^(?!#).*!!js\s+(\(\(\)=>\{.*\}\)\(\))$/gm)].map((m) => m[1]!);
    expect(anchorPoints, "五成员混合锚逐件在场（preset-forge ×5 + preset-headhunter expert-squad ×1）").toHaveLength(6);
    for (const member of ["project", "spec", "task-loop", "expert-squad", "knowledge"] as const) {
      const expr = anchorPoints.find((p) => p.includes(`'@dsh-forge/${member}/package.json'`));
      expect(expr, `${member} 锚在场`).toBeDefined();
      expect(expr, `${member} baseUrl 腿`).toContain(`createRequire(baseUrl).resolve('@dsh-forge/${member}/package.json')`);
      expect(expr, `${member} DSH_HOME generation 探测兜底腿`).toContain("process.env.DSH_HOME");
      expect(expr, `${member} 零裸 throw`).not.toContain("throw ");
      // 形态可求值（真实 process——合法 JS 语法面）：DSH_HOME 缺席兜底腿 → undefined
      // （hermetic：开发机 shell 常携 DSH_HOME（DSH Desktop 会话环境）——求值窗内摘除锚定缺席态）
      const prevHome = process.env.DSH_HOME
      delete process.env.DSH_HOME
      try {
        expect(new Function(`"use strict"; return (${expr});`)(), `${member} 兜底腿求值 undefined（DSH_HOME 缺席）`).toBeUndefined()
      } finally {
        if (prevHome === undefined) delete process.env.DSH_HOME
        else process.env.DSH_HOME = prevHome
      };
    }
  });

  it("占位符物化面封闭：!!js 求值点 = forge 行 home 表达式 + 五件插行派发表达式 + 官方 preset 底稿平台/禁用表达式 + preset 子树技能混合锚 ×6（preset-forge ×5 + preset-headhunter ×1），无 {projectDir}/{homeDir} 模板", () => {
    expect(patchYaml).not.toContain("{projectDir}");
    expect(patchYaml).not.toContain("{homeDir}");
    const jsPoints = [...patchYaml.matchAll(/^(?!#).*!!js\s+(.+)$/gm)].map((m) => m[1]!);
    expect(jsPoints[0]).toBe(HOME_EXPR);
    // preset 子树技能混合锚（IIFE 双腿形——形态断言归本文件混合锚封闭 + skills-rows-contract）
    const skillAnchors = jsPoints.filter((p) => p.startsWith("(()=>{"));
    expect(skillAnchors).toHaveLength(6);
    const otherPoints = jsPoints.slice(1).filter((p) => !p.startsWith("(()=>{"));
    // 非自锚点 = 五件插行派发 config 表达式 ×6（home/dbFile/tasksHome）+ 官方 preset 底稿
    // platform 禁用表达式 ×2 + plugin-manager profileContext ×1。
    expect(otherPoints).toHaveLength(9);
    expect(otherPoints.filter((p) => p.startsWith("process.platform"))).toHaveLength(2);
    expect(otherPoints.filter((p) => p.includes("profileContext"))).toHaveLength(1);
    // 模板占位符负断言（锚点 IIFE 形自带函数体花括号——非模板语义，不纳入）
    for (const point of otherPoints) {
      expect(point).not.toMatch(/\{[^}]+\}/);
    }
  });
});
