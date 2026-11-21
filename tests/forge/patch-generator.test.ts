// bundle 档生成器契约（forge-aggregate-bundle 1.5——scripts/aggregate-assets.mjs
// 重写为单一生成器，产物 cordis.patch.yml）：
//   · 六行形状：forge 自插行 { home } + 五件插行（成员清单单源驱动）；
//   · 派发映射快照：!!js 表达式求值 ≡ host/assembly.ts derivePluginConfigs 缺省派生
//     分支（动态同源双检）+ 延伸常量静态同源（漂移红）；
//   · 生成器不变量：全部派发表达式自带 && 短路兜底；
//   · 五件顶层 skills 行三谓词 + 负断言（fefd5149/探针④判例）；
//   · preset-forge 形状：order 定值 pin（官方仓 preset 底稿核销后定值 2）+ 行内
//     skill-filesystem-forge 实例五锚；
//   · 产物零漂移：再生成幂等（跑两遍字节全等 + 仓内文件即生成器输出）。
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DSH_HOME_ENV, DB_RELATIVE, FORGE_HOME_SUFFIX, TASKS_RELATIVE, derivePluginConfigs } from "../../plugins/forge/host/assembly.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FORGE_ROOT = join(REPO_ROOT, "plugins", "forge");
const GENERATOR = join(FORGE_ROOT, "scripts", "aggregate-assets.mjs");
const PATCH = join(FORGE_ROOT, "cordis.patch.yml");

const MEMBERS = ["project", "spec", "task-loop", "expert-squad", "knowledge"] as const;
type Member = (typeof MEMBERS)[number];

const patchYaml = readFileSync(PATCH, "utf8");

/** 六插行派发 config 表达式抽取（`        key: !!js expr`）。 */
function insertConfigExprs(member: Member): Record<string, string> {
  const rowAt = patchYaml.indexOf(`    - id: ${member}\n`);
  expect(rowAt, `${member} 插行在场`).toBeGreaterThanOrEqual(0);
  const body = patchYaml.slice(rowAt).split("\n");
  const out: Record<string, string> = {};
  for (const line of body.slice(1)) {
    if (/^(\s*- id:|-)/.test(line) || !line.startsWith(" ")) break;
    const m = /^        (\w+): !!js (.+)$/.exec(line);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

/** 派发表达式求值（env 临时注入——表达式只消费 process.env.DSH_HOME）。 */
function evalWithEnv(expr: string, dshHome: string | undefined): string | undefined {
  const previous = process.env[DSH_HOME_ENV];
  try {
    if (dshHome === undefined) delete process.env[DSH_HOME_ENV];
    else process.env[DSH_HOME_ENV] = dshHome;
    return new Function(`return (${expr})`)() as string | undefined;
  } finally {
    if (previous === undefined) delete process.env[DSH_HOME_ENV];
    else process.env[DSH_HOME_ENV] = previous;
  }
}

describe("六行形状（forge 自插 + 五件插行——成员清单单源驱动）", () => {
  it("insert 块 id 序 = forge + 五件（单源序），name = @dsh-forge/<id>", () => {
    const insertBody = patchYaml.slice(patchYaml.indexOf("- insert:"), patchYaml.indexOf("\n- id: skill-filesystem-"));
    const ids = [...insertBody.matchAll(/^    - id: (.+)$/gm)].map((m) => m[1]!);
    expect(ids).toEqual(["forge", ...MEMBERS]);
    for (const id of ["forge", ...MEMBERS]) {
      expect(insertBody).toContain(`- id: ${id}\n      name: '@dsh-forge/${id}'`);
    }
  });

  it("forge 自插行 config = { home } 唯一键（§2.2 Workbench 生长面）", () => {
    expect(patchYaml).toMatch(/- id: forge\n      name: '@dsh-forge\/forge'\n      config:\n        home: !!js .+/);
    expect(insertConfigExprs("project")).toHaveProperty("home");
  });
});

describe("派发映射快照（与 assembly.ts derivePluginConfigs 同源双检）", () => {
  const HOME_ENV_VALUE = "Z:/dsh";

  it("表达式求值 ≡ derivePluginConfigs 缺省派生分支（env 注入 Z:/dsh——逐件逐键全等）", () => {
    const expected = derivePluginConfigs({}, { [DSH_HOME_ENV]: HOME_ENV_VALUE });
    for (const member of MEMBERS) {
      const exprs = insertConfigExprs(member);
      const actual = Object.fromEntries(
        Object.entries(exprs).map(([key, expr]) => [key, evalWithEnv(expr, HOME_ENV_VALUE)]),
      );
      expect(actual, `${member} 派发键值`).toEqual(expected[member]);
    }
  });

  it("双缺降级：DSH_HOME 缺席 → 表达式短路求值 undefined（≡ derivePluginConfigs 空映射——键值不携带垃圾串）", () => {
    for (const member of MEMBERS) {
      for (const expr of Object.values(insertConfigExprs(member))) {
        expect(evalWithEnv(expr, undefined), `${member} 短路求值`).toBeUndefined();
      }
    }
  });

  it("延伸常量静态同源（{home}/forge → db/projects 路径数学——assembly.ts 常量漂移即红）", () => {
    const dbExpr = insertConfigExprs("spec").dbFile!;
    expect(dbExpr).toContain(`'${FORGE_HOME_SUFFIX}${DB_RELATIVE}'`);
    expect(insertConfigExprs("task-loop").tasksHome).toContain(`'${FORGE_HOME_SUFFIX}${TASKS_RELATIVE}'`);
    expect(patchYaml.match(/^        home: !!js (.+)$/m)?.[1]).toContain(`process.env.${DSH_HOME_ENV}`);
  });
});

describe("生成器不变量：全部派发表达式自带 && 短路兜底", () => {
  it("六插行派发表达式逐条含 &&（防裸表达式异常冒泡打断行激活——圆桌裁定；expert-squad 空对象豁免无派发表达式）", () => {
    for (const member of MEMBERS) {
      const exprs = insertConfigExprs(member);
      if (member === "expert-squad") {
        expect(Object.keys(exprs), "expert-squad 空对象豁免").toHaveLength(0);
        continue;
      }
      expect(Object.keys(exprs).length, `${member} 派发表达式非空`).toBeGreaterThan(0);
      for (const [key, expr] of Object.entries(exprs)) {
        expect(expr, `${member}.${key} && 兜底`).toContain("&&");
      }
    }
  });
});

describe("五件顶层 skills 行（探针④分支 A——三谓词 + 负断言）", () => {
  const rows = MEMBERS.map((member) => {
    const rowAt = patchYaml.indexOf(`- id: skill-filesystem-${member}\n`);
    expect(rowAt, `${member} skills 行在场`).toBeGreaterThanOrEqual(0);
    return { member, body: patchYaml.slice(rowAt, patchYaml.indexOf("\n- id:", rowAt + 1) + 1 || patchYaml.length) };
  });

  it("id 互异 ∩ ≠ base id skill-filesystem（fefd5149：同 id 被官方定点 disable 命中）", () => {
    const ids = rows.map((r) => `skill-filesystem-${r.member}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("skill-filesystem");
    expect(patchYaml).not.toMatch(/^- id: skill-filesystem$/m);
  });

  it("providerName 互异且 ≠ 默认名 filesystem（同层重名注册 loud-fail）", () => {
    const names = rows.map((r) => /^    providerName: (\S+)$/m.exec(r.body)?.[1]);
    expect(names).toEqual(MEMBERS.map((m) => `filesystem-${m}`));
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("filesystem");
  });

  it("customSkillDirs 自锚本包 skills/ 且 && 短路兜底（每件只依赖自己）", () => {
    for (const { member, body } of rows) {
      const expr = /- !!js (.+)$/m.exec(body)?.[1];
      expect(expr, `${member} 锚表达式在场`).toBeDefined();
      expect(expr).toContain(`resolve('@dsh-forge/${member}/package.json')`);
      expect(expr, `${member} 锚定 skills/`).toMatch(/,\s*'skills'\)/);
      expect(expr, `${member} && 短路兜底`).toContain("&&");
    }
  });
});

describe("preset-forge 行（persona + standard 同构裁剪 + 行内 forge 技能实例）", () => {
  const presetAt = patchYaml.indexOf("- id: preset-forge\n");
  const presetBody = patchYaml.slice(presetAt);

  it("身份形状：id: forge + name: Forge模式 + description + persona 前缀（forge 流水线 SOP）", () => {
    expect(presetAt).toBeGreaterThanOrEqual(0);
    expect(presetBody).toContain("    id: forge\n");
    expect(presetBody).toContain("    name: Forge模式\n");
    expect(presetBody).toMatch(/    description: ".+"\n/);
    expect(presetBody).toContain("forge 流水线作业模式");
  });

  it("order 定值 pin = 2（官方仓 preset 底稿核销当前 order 全集后定值——standard=1/ptc=2/minimal=3/cordis=4；漂移红）", () => {
    expect(presetBody).toMatch(/^    order: 2$/m);
  });

  it("工具集 standard 同构裁剪：工程面行族在场（persona/agent-instructions/tool-fs/planning/compaction/delegation/…），base skill-filesystem 行由 forge 实例替换", () => {
    for (const id of [
      "agent-instructions",
      "time-context",
      "tool-bash",
      "tool-pwsh",
      "tool-fs",
      "tool-fs-search",
      "tool-jobs",
      "tool-schedule",
      "tool-skill",
      "command-goal",
      "tool-goal",
      "planning",
      "compaction",
      "delegation",
      "tool-ask-user",
      "tool-todo",
      "tool-web",
      "present",
      "tool-office",
    ]) {
      expect(presetBody, `preset 行 ${id} 在场`).toContain(`- id: ${id}\n`);
    }
    expect(presetBody).not.toMatch(/- id: skill-filesystem\n/);
    expect(presetBody).toMatch(/- id: skill-filesystem-forge\n/);
  });

  it("行内 skill-filesystem-forge 实例：providerName: filesystem-forge + customSkillDirs 五条已装包锚（逐件自锚）", () => {
    expect(presetBody).toContain("providerName: filesystem-forge");
    const dirsAt = presetBody.indexOf("          customSkillDirs:\n");
    expect(dirsAt).toBeGreaterThanOrEqual(0);
    const anchors = presetBody
      .slice(dirsAt)
      .split("\n")
      .filter((line) => line.startsWith("            - !!js "))
      .map((line) => line.slice("            - !!js ".length));
    expect(anchors).toHaveLength(MEMBERS.length);
    anchors.forEach((expr, i) => {
      expect(expr).toContain(`resolve('@dsh-forge/${MEMBERS[i]}/package.json')`);
      expect(expr).toMatch(/,\s*'skills'\)/);
    });
  });
});

describe("产物零漂移（再生成幂等——仓内文件即生成器输出）", () => {
  it("重跑生成器两遍：文件字节全等（幂等）且与运行前一致（提交面零漂移）", () => {
    const before = readFileSync(PATCH, "utf8");
    execSync(`node "${GENERATOR}"`, { cwd: REPO_ROOT, stdio: "pipe" });
    const once = readFileSync(PATCH, "utf8");
    execSync(`node "${GENERATOR}"`, { cwd: REPO_ROOT, stdio: "pipe" });
    const twice = readFileSync(PATCH, "utf8");
    expect(once).toBe(twice);
    expect(before).toBe(twice);
  });
});
