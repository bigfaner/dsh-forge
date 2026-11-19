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
const DBFILE_IDS = ["project", "spec", "task-loop", "knowledge"] as const;
const EXPECTED_EXPR =
  "process.env.DSH_HOME && (process.env.DSH_HOME + '/forge/db/forge/forge.db')";
const PROJECT_HOME_EXPR = "process.env.DSH_HOME";
const TASK_LOOP_TASKS_HOME_EXPR =
  "process.env.DSH_HOME && (process.env.DSH_HOME + '/forge/projects')";

/** 抽取指定 id 插行 dbFile 键的 !!js 表达式（缺失 = undefined）。 */
function extractDbFileExpr(id: string): string | undefined {
  const block = patchYaml.match(new RegExp(`-\\s+id:\\s*${id}\\b[\\s\\S]*?(?=\\n\\s*-\\s+id:|$)`));
  return block?.[0]?.match(/^\s+dbFile:\s*!!js\s+(.+)$/m)?.[1];
}

/** 抽取指定 id 插行 home 键的 !!js 表达式（缺失 = undefined）。 */
function extractHomeExpr(id: string): string | undefined {
  const block = patchYaml.match(new RegExp(`-\\s+id:\\s*${id}\\b[\\s\\S]*?(?=\\n\\s*-\\s+id:|$)`));
  return block?.[0]?.match(/^\s+home:\s*!!js\s+(.+)$/m)?.[1];
}

/** 抽取指定 id 插行 tasksHome 键的 !!js 表达式（缺失 = undefined）。 */
function extractTasksHomeExpr(id: string): string | undefined {
  const block = patchYaml.match(new RegExp(`-\\s+id:\\s*${id}\\b[\\s\\S]*?(?=\\n\\s*-\\s+id:|$)`));
  return block?.[0]?.match(/^\s+tasksHome:\s*!!js\s+(.+)$/m)?.[1];
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
  it("project：config = home + dbFile 双键快照（ProjectHostConfig.home 自锚派生根 + ProjectHostConfig.dbFile 共库落点覆盖——bug ad14e904 patch 下发即生效，不再自派生 project.db 分库；键序/多键/缺键即红）", () => {
    expect(extractConfigKeys("project")).toEqual(["home", "dbFile"]);
    expect(extractDbFileExpr("project")).toBe(EXPECTED_EXPR);
    expect(extractHomeExpr("project")).toBe(PROJECT_HOME_EXPR);
  });

  it.each([...DBFILE_IDS])("%s：dbFile 下发值为完整 config 对象——config 段仅 dbFile 单键（多键/缺键即红）", (id) => {
    if (id === "project") return; // project 双键形态单独锁定（上一用例）
    if (id === "task-loop") return; // task-loop 双键形态单独锁定（下一用例——bug a93c1277）
    expect(extractConfigKeys(id), `${id} config 必须是完整对象且只含 dbFile——整体替换语义下多余键会抹掉单装缺省`).toEqual([
      "dbFile",
    ]);
  });

  it("task-loop：config = dbFile + tasksHome 双键快照（任务目录派生根注入——bug a93c1277；{DSH_HOME}/forge/projects 域对齐主提案产物树「以 slug 为单位管理运行产物」；键序/多键/缺键即红）", () => {
    expect(extractConfigKeys("task-loop")).toEqual(["dbFile", "tasksHome"]);
    expect(extractTasksHomeExpr("task-loop")).toBe(TASK_LOOP_TASKS_HOME_EXPR);
  });

  it.each([...DBFILE_IDS])("%s：dbFile 表达式快照锁定（物化面封闭——只做 DSH_HOME 拼接，无其它重写逻辑）", (id) => {
    expect(extractDbFileExpr(id)).toBe(EXPECTED_EXPR);
  });

  it("四件 dbFile 物化目标路径一致 = {DSH_HOME}/forge/db/forge/forge.db（共库，域前缀分表互不越界——bug ad14e904 起 project 同落共库）", () => {
    const home = "Z:\\mock-dsh-home";
    for (const id of DBFILE_IDS) {
      const materialized = evalExpr(extractDbFileExpr(id)!, { DSH_HOME: home });
      expect(materialized, `${id} 物化路径偏离共库约定`).toBe(`${home}/forge/db/forge/forge.db`);
      expect(String(materialized).endsWith("forge/db/forge/forge.db")).toBe(true);
    }
    expect(evalExpr(extractHomeExpr("project")!, { DSH_HOME: home })).toBe(home);
  });

  it("DSH_HOME 缺席 → 各键 falsy（fail-soft 不阻载——四件回落单装缺省装配）", () => {
    for (const id of DB_HOLDING_IDS) {
      expect(evalExpr(extractDbFileExpr(id)!, {})).toBeFalsy();
      expect(evalExpr(extractDbFileExpr(id)!, { DSH_HOME: "" })).toBeFalsy();
    }
    expect(evalExpr(extractHomeExpr("project")!, {})).toBeFalsy();
    expect(evalExpr(extractHomeExpr("project")!, { DSH_HOME: "" })).toBeFalsy();
    expect(evalExpr(extractTasksHomeExpr("task-loop")!, {})).toBeFalsy();
    expect(evalExpr(extractTasksHomeExpr("task-loop")!, { DSH_HOME: "" })).toBeFalsy();
  });

  it("task-loop tasksHome 物化目标 = {DSH_HOME}/forge/projects（任务目录域——bug a93c1277 落点对齐产物树）", () => {
    expect(evalExpr(TASK_LOOP_TASKS_HOME_EXPR, { DSH_HOME: "Z:\\mock-dsh-home" })).toBe("Z:\\mock-dsh-home/forge/projects");
    expect(evalExpr(TASK_LOOP_TASKS_HOME_EXPR, { DSH_HOME: "/data/dsh" })).toBe("/data/dsh/forge/projects");
  });
});

describe("占位符物化面（host 级物化 / project 级模板透传）", () => {
  it("host 级 {DSH_HOME} boot 期物化正确——表达式内 {DSH_HOME} 占位语义 = env 单值拼接", () => {
    // 物化面以 !!js 表达式承载（patch 文件内官方 userPatchesSchema 方言，无独立 host
    // 物化入口）——求值即物化：env 单值代入即得终值。
    expect(evalExpr(EXPECTED_EXPR, { DSH_HOME: "/data/dsh" })).toBe("/data/dsh/forge/db/forge/forge.db");
    expect(evalExpr(PROJECT_HOME_EXPR, { DSH_HOME: "/data/dsh" })).toBe("/data/dsh");
  });

  it("project 级 path_placeholder 模板原样透传不替换——物化面封闭枚举仅限 DSH_HOME，patch 无 {projectDir}/{homeDir} 模板与替换逻辑", () => {
    expect(patchYaml).not.toContain("{projectDir}");
    expect(patchYaml).not.toContain("{homeDir}");
    // 封闭枚举：!!js 求值点恰六条（project home+dbFile 双键 + 四件 dbFile + task-loop
    // tasksHome——bug a93c1277）、全部为 DSH_HOME 表达式快照——除 DSH_HOME 拼接外不存在
    // 任何字符串替换/模板物化逻辑（透传保证）。
    const jsPoints = [...patchYaml.matchAll(/^(?!#).*!!js\s+(.+)$/gm)].map((m) => m[1]!);
    expect(jsPoints).toHaveLength(DB_HOLDING_IDS.length + 2);
    expect(jsPoints).toContain(PROJECT_HOME_EXPR);
    expect(jsPoints).toContain(TASK_LOOP_TASKS_HOME_EXPR);
    for (const point of jsPoints) {
      expect(point === EXPECTED_EXPR || point === PROJECT_HOME_EXPR || point === TASK_LOOP_TASKS_HOME_EXPR).toBe(true);
      expect(point).not.toMatch(/\{[^}]+\}/);
    }
  });
});
