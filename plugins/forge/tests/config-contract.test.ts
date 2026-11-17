// forge 契约测试②：集成 config 完整对象快照（patch config 同名行整体替换非合并——
// 下发值必须是完整 config 对象，防「假设合并」回归）+ {DSH_HOME} 占位符物化面单测
// （物化面以 patch 文件 !!js 表达式承载——求值语义锁定）。
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FORGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const patchYaml = readFileSync(resolve(FORGE_ROOT, "cordis.patch.yml"), "utf8");

const DB_HOLDING_IDS = ["project", "spec", "task-loop", "knowledge"] as const;
const EXPECTED_EXPR =
  "process.env.DSH_HOME && (process.env.DSH_HOME + '/forge/db/forge/forge.db')";

/** 抽取指定 id 插行的 dbFile !!js 表达式（缺失 = undefined）。 */
function extractDbFileExpr(id: string): string | undefined {
  const block = patchYaml.match(new RegExp(`-\\s+id:\\s*${id}\\b[\\s\\S]*?(?=\\n\\s*-\\s+id:|$)`));
  return block?.[0]?.match(/^\s+dbFile:\s*!!js\s+(.+)$/m)?.[1];
}

/** 抽取指定 id 插行 config 段的全部键（无 config 段 = 空数组）。 */
function extractConfigKeys(id: string): string[] {
  const block = patchYaml.match(new RegExp(`-\\s+id:\\s*${id}\\b[\\s\\S]*?(?=\\n\\s*-\\s+id:|$)`));
  const configBlock = block?.[0]?.match(/config:\s*\n([\s\S]*?)(?=\n\s*-\s+id:|$)/)?.[1];
  if (configBlock === undefined) return [];
  return [...configBlock.matchAll(/^\s+(\S+?):/gm)].map((m) => m[1]!);
}

/** 在受控 env 下求值 !!js 表达式（不触真实 process——物化语义纯函数化验证）。 */
function evalExpr(expr: string, env: Record<string, string | undefined>): unknown {
  const fakeProcess = { env };
  return new Function("process", `"use strict"; return (${expr});`)(fakeProcess);
}

describe("forge 集成 config 契约（整体替换语义快照锁定）", () => {
  it.each([...DB_HOLDING_IDS])("%s：dbFile 下发值为完整 config 对象——config 段仅 dbFile 单键（多键/缺键即红）", (id) => {
    expect(extractConfigKeys(id), `${id} config 必须是完整对象且只含 dbFile——整体替换语义下多余键会抹掉单装缺省`).toEqual([
      "dbFile",
    ]);
  });

  it.each([...DB_HOLDING_IDS])("%s：dbFile 表达式快照锁定（物化面封闭——只做 DSH_HOME 拼接，无其它重写逻辑）", (id) => {
    expect(extractDbFileExpr(id)).toBe(EXPECTED_EXPR);
  });

  it("四件 dbFile 物化目标路径一致 = {DSH_HOME}/forge/db/forge/forge.db（共库，域前缀分表）", () => {
    const home = "Z:\\mock-dsh-home";
    for (const id of DB_HOLDING_IDS) {
      const materialized = evalExpr(extractDbFileExpr(id)!, { DSH_HOME: home });
      expect(materialized, `${id} 物化路径偏离共库约定`).toBe(`${home}/forge/db/forge/forge.db`);
      expect(String(materialized).endsWith("forge/db/forge/forge.db")).toBe(true);
    }
  });

  it("DSH_HOME 缺席 → dbFile falsy（fail-soft 不阻载——四件回落单装缺省装配）", () => {
    for (const id of DB_HOLDING_IDS) {
      expect(evalExpr(extractDbFileExpr(id)!, {})).toBeFalsy();
      expect(evalExpr(extractDbFileExpr(id)!, { DSH_HOME: "" })).toBeFalsy();
    }
  });
});

describe("占位符物化面（host 级物化 / project 级模板透传）", () => {
  it("host 级 {DSH_HOME} boot 期物化正确——表达式内 {DSH_HOME} 占位语义 = env 单值拼接", () => {
    // 物化面以 !!js 表达式承载（patch 文件内官方 userPatchesSchema 方言，无独立 host
    // 物化入口）——求值即物化：env 单值代入即得终值。
    expect(evalExpr(EXPECTED_EXPR, { DSH_HOME: "/data/dsh" })).toBe("/data/dsh/forge/db/forge/forge.db");
  });

  it("project 级 path_placeholder 模板原样透传不替换——物化面封闭枚举仅限 DSH_HOME，patch 无 {projectDir}/{homeDir} 模板与替换逻辑", () => {
    expect(patchYaml).not.toContain("{projectDir}");
    expect(patchYaml).not.toContain("{homeDir}");
    // 封闭枚举：!!js 求值点恰四条、全部为 dbFile 表达式快照——除 DSH_HOME 拼接外
    // 不存在任何字符串替换/模板物化逻辑（透传保证）。
    const jsPoints = [...patchYaml.matchAll(/^(?!#).*!!js\s+(.+)$/gm)].map((m) => m[1]!);
    expect(jsPoints).toHaveLength(DB_HOLDING_IDS.length);
    for (const point of jsPoints) {
      expect(point).toBe(EXPECTED_EXPR);
      expect(point).not.toMatch(/\{[^}]+\}/);
    }
  });
});
