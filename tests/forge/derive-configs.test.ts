// forge 配置派发单源快照 pin（forge-deep-pack 1.4——提案 §二.2 派发示例逐键照抄）：
//   resolveForgeLayout 延伸表（home 唯一输入 → db/tasksHome 恒延伸，锚主提案 §十
//   目录树——漂移红）+ derivePluginConfigs 派发映射快照（expert-squad 空对象豁免）+
//   cordis.patch.yml config 行同源双检（静态双检，与 assembly 延伸常量同源）。
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DSH_HOME_ENV,
  DB_RELATIVE,
  FORGE_HOME_SUFFIX,
  TASKS_RELATIVE,
  derivePluginConfigs,
  resolveForgeLayout,
} from "../../plugins/forge/host/assembly.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const patchYaml = readFileSync(resolve(REPO_ROOT, "plugins/forge/cordis.patch.yml"), "utf8");

/** 延伸表期望（单源拼装——常量漂移即红，锚主提案 §十 目录树：{home}/db/forge/forge.db + {home}/projects） */
function expectedLayout(home: string) {
  return { home, db: home + DB_RELATIVE, tasksHome: home + TASKS_RELATIVE };
}

describe("resolveForgeLayout（延伸规则单源——home 唯一输入）", () => {
  it("零配置缺省：home = {DSH_HOME}/forge，db/tasksHome 恒延伸（目录树同源）", () => {
    expect(resolveForgeLayout({}, { [DSH_HOME_ENV]: "Z:/dsh" })).toEqual(expectedLayout("Z:/dsh/forge"));
  });

  it("换根：config.home 唯一输入，db/tasksHome 随迁（隔离取证/便携数据域场景）", () => {
    expect(resolveForgeLayout({ home: "D:/data/forge" }, { [DSH_HOME_ENV]: "Z:/dsh" })).toEqual(
      expectedLayout("D:/data/forge"),
    );
  });

  it("DSH_HOME 与 config.home 双缺 → 三键全 undefined（派发回落各件单装缺省——fail-soft 不阻载）", () => {
    expect(resolveForgeLayout({}, {})).toEqual({ home: undefined, db: undefined, tasksHome: undefined });
  });

  it("home 空串/空白视同缺席（nonEmpty 归一——非 falsy 直通）", () => {
    expect(resolveForgeLayout({ home: "  " }, { [DSH_HOME_ENV]: "Z:/dsh" })).toEqual(expectedLayout("Z:/dsh/forge"));
  });
});

describe("derivePluginConfigs 派发映射快照 pin（提案 §二.2 示例逐键——漂移红）", () => {
  it("换根示例快照：config = { home: 'D:/data/forge' }（逐键全等——键序/键名/键值/豁免全部锁定）", () => {
    expect(derivePluginConfigs({ home: "D:/data/forge" }, { [DSH_HOME_ENV]: "Z:/dsh" })).toEqual({
      project: { home: "Z:/dsh", dbFile: "D:/data/forge/db/forge/forge.db" },
      spec: { dbFile: "D:/data/forge/db/forge/forge.db" },
      "task-loop": { dbFile: "D:/data/forge/db/forge/forge.db", tasksHome: "D:/data/forge/projects" },
      "expert-squad": {},
      knowledge: { dbFile: "D:/data/forge/db/forge/forge.db" },
    });
  });

  it("零配置缺省快照：全延伸 {DSH_HOME} 派生（project.home 恒 = {DSH_HOME}——不随 config 换根，提案定谳）", () => {
    expect(derivePluginConfigs({}, { [DSH_HOME_ENV]: "Z:/dsh" })).toEqual({
      project: { home: "Z:/dsh", dbFile: "Z:/dsh/forge/db/forge/forge.db" },
      spec: { dbFile: "Z:/dsh/forge/db/forge/forge.db" },
      "task-loop": { dbFile: "Z:/dsh/forge/db/forge/forge.db", tasksHome: "Z:/dsh/forge/projects" },
      "expert-squad": {},
      knowledge: { dbFile: "Z:/dsh/forge/db/forge/forge.db" },
    });
  });

  it("expert-squad 空对象豁免（自有 config 含 defaultAgentOptions/experts——统一面不透传维持缺省，防 pin 封死键面）", () => {
    const configs = derivePluginConfigs({ home: "D:/data/forge" }, { [DSH_HOME_ENV]: "Z:/dsh" });
    expect(configs["expert-squad"]).toEqual({});
    expect(Object.keys(configs["expert-squad"])).toHaveLength(0);
  });

  it("双缺降级：undefined 值键剔除（不携死键——patch 整体替换语义下多余键会抹掉单装缺省）", () => {
    expect(derivePluginConfigs({}, {})).toEqual({
      project: {},
      spec: {},
      "task-loop": {},
      "expert-squad": {},
      knowledge: {},
    });
  });
});

describe("patch config 行同源双检（静态——与 derivePluginConfigs 同源常量）", () => {
  it("home 表达式 = 延伸常量同源拼装（{DSH_HOME}/forge——FORGE_HOME_SUFFIX 漂移即红；bundle 档派发映射双检归 tests/forge/patch-generator.test.ts）", () => {
    const homeExpr = `process.env.${DSH_HOME_ENV} && (process.env.${DSH_HOME_ENV} + '${FORGE_HOME_SUFFIX}')`;
    const jsPoints = [...patchYaml.matchAll(/^(?!#).*!!js\s+(.+)$/gm)].map((m) => m[1]!);
    expect(jsPoints[0]).toBe(homeExpr);
  });
});
