// 五件 skills 自持行契约（forge-aggregate-bundle 1.4——探针④分支 A 物化，圆桌合流
// 三谓词 + 负断言；1.13 起兼载 forge bundle 档 patch 静态直检——六插行 + 跨 patch
// 零交集负断言 + preset-forge order pin，生成器退役后直写正本唯一守卫载体）：
//   · fefd5149 判例：顶层行与官方 base 行同 id（skill-filesystem）即被 dsh-web-app
//     的定点 disable 命中（patch per-key 覆写只作用该行，provider 根本不注册）——
//     id 必改异，仅补 providerName 无效；
//   · skill-filesystem provider 注册名默认 'filesystem'，同层重名注册 loud-fail
//     （五实例同落 global layer）——providerName 必互异且 ≠ 默认名；
//   · 每行 customSkillDirs 自锚本包 skills/（!!js baseUrl 表达式，&& 短路兜底）；
//   · 自锚前提 = 四件 ./package.json 出口（spec 既有先例，ERR_PACKAGE_PATH_NOT_EXPORTED）。
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const FIVE = ["spec", "project", "task-loop", "expert-squad", "knowledge"] as const;
type Five = (typeof FIVE)[number];

const PKG_NAME: Record<Five, string> = {
  spec: "@dsh-forge/spec",
  project: "@dsh-forge/project",
  "task-loop": "@dsh-forge/task-loop",
  "expert-squad": "@dsh-forge/expert-squad",
  knowledge: "@dsh-forge/knowledge",
};

const EXPECTED_ID: Record<Five, string> = {
  spec: "skill-filesystem-spec",
  project: "skill-filesystem-project",
  "task-loop": "skill-filesystem-task-loop",
  "expert-squad": "skill-filesystem-expert-squad",
  knowledge: "skill-filesystem-knowledge",
};

const BASE_ROW_ID = "skill-filesystem";
const DEFAULT_PROVIDER_NAME = "filesystem";
const SKILL_FS_PACKAGE = "@deepseek-ai/dsh-skill-filesystem";

const patchText: Record<Five, string> = Object.fromEntries(
  FIVE.map((p) => [p, readFileSync(resolve(REPO_ROOT, "plugins", p, "cordis.patch.yml"), "utf8")]),
) as Record<Five, string>;

/** 顶层 patch 行切分：col 0 `- id:` 开新行，至下一个 col 0 非注释行止。 */
function topLevelRows(text: string): { id: string; body: string }[] {
  const rows: { id: string; body: string }[] = [];
  let current: { id: string; body: string[] } | undefined;
  for (const line of text.split(/\r?\n/)) {
    const newTop = /^- id: (.+)$/.exec(line);
    if (newTop) {
      if (current) rows.push({ id: current.id, body: current.body.join("\n") });
      current = { id: newTop[1]!.trim(), body: [] };
    } else if (/^\S/.test(line) && !line.startsWith("#")) {
      if (current) rows.push({ id: current.id, body: current.body.join("\n") });
      current = undefined;
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) rows.push({ id: current.id, body: current.body.join("\n") });
  return rows;
}

/** 各件 patch 内的顶层 skills provider 行（id 以 skill-filesystem 起头——preset 行内
 * 嵌套实例不属顶层 provider 行，不纳入本契约面）。 */
function skillsRows(pkg: Five): { id: string; body: string }[] {
  return topLevelRows(patchText[pkg]).filter((r) => r.id.startsWith("skill-filesystem"));
}

const allSkillsRows = FIVE.flatMap(skillsRows);

describe("三谓词（五件 skills 自持行——id 互异 ∩ ≠ base id ∩ providerName 互异 ≠ 默认名）", () => {
  it("每件恰一条顶层 skills 行，id = skill-filesystem-<pkg>（spec 既有行连 id 一起改异）", () => {
    for (const pkg of FIVE) {
      const rows = skillsRows(pkg);
      expect(rows, `${pkg} 顶层 skills 行数`).toHaveLength(1);
      expect(rows[0]!.id, `${pkg} skills 行 id`).toBe(EXPECTED_ID[pkg]);
      expect(rows[0]!.body, `${pkg} 行 name`).toContain(`name: '${SKILL_FS_PACKAGE}'`);
    }
  });

  it("五行 id 互异且 ≠ base id skill-filesystem（fefd5149：同 id 被官方定点 disable 命中）", () => {
    const ids = allSkillsRows.map((r) => r.id);
    expect(new Set(ids).size, "id 互异").toBe(ids.length);
    expect(ids).not.toContain(BASE_ROW_ID);
    for (const pkg of FIVE) {
      expect(topLevelRows(patchText[pkg]).map((r) => r.id)).not.toContain(BASE_ROW_ID);
    }
  });

  it("五行 providerName 互异且 ≠ 默认名 filesystem（同层重名注册 loud-fail——探针④新发现阻碍）", () => {
    const names = allSkillsRows.map((r) => /^\s*providerName:\s*(\S+)/m.exec(r.body)?.[1]);
    for (const pkg of FIVE) {
      const rows = skillsRows(pkg);
      const name = /^\s*providerName:\s*(\S+)/m.exec(rows[0]!.body)?.[1];
      expect(name, `${pkg} providerName 在场`).toBeDefined();
      expect(name, `${pkg} providerName`).toBe(`filesystem-${pkg}`);
    }
    expect(new Set(names).size, "providerName 互异").toBe(names.length);
    for (const name of names) {
      expect(name).not.toBe(DEFAULT_PROVIDER_NAME);
    }
  });
});

describe("自锚面（customSkillDirs 本包锚 + && 短路兜底 + ./package.json 出口前提）", () => {
  it("四件新增行 customSkillDirs 表达式自锚本包 skills/，且携 && 短路兜底（防锚解析异常冒泡打断行激活；spec 既有行表达式不动）", () => {
    for (const pkg of FIVE) {
      if (pkg === "spec") continue;
      const expr = /!!js\s+(.+)$/m.exec(skillsRows(pkg)[0]!.body)?.[1];
      expect(expr, `${pkg} !!js 锚表达式在场`).toBeDefined();
      expect(expr).toContain(`resolve('${PKG_NAME[pkg]}/package.json')`);
      expect(expr, `${pkg} 锚定 skills/`).toMatch(/,\s*'skills'\)/);
      expect(expr, `${pkg} && 短路兜底`).toContain("&&");
    }
    const specExpr = /!!js\s+(.+)$/m.exec(skillsRows("spec")[0]!.body)?.[1];
    expect(specExpr, "spec 锚表达式在场").toBeDefined();
    expect(specExpr).toContain(`resolve('${PKG_NAME.spec}/package.json')`);
    expect(specExpr, "spec 锚定 skills/").toMatch(/,\s*'skills'\)/);
  });

  it("四件 package.json 补 ./package.json exports 键（spec 既有先例形态）", () => {
    for (const pkg of ["project", "task-loop", "expert-squad", "knowledge"] as const) {
      const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, "plugins", pkg, "package.json"), "utf8")) as {
        exports?: Record<string, string>;
      };
      expect(manifest.exports?.["./package.json"], `${pkg} ./package.json 出口`).toBe("./package.json");
    }
  });
});

describe("负断言（禁无 providerName 的裸 filesystem 行）", () => {
  it("五件 patch 顶层 skills 行一律显式携带 providerName，零裸行", () => {
    for (const pkg of FIVE) {
      for (const row of skillsRows(pkg)) {
        expect(row.body, `${pkg} 行 ${row.id} 缺 providerName`).toMatch(/^\s*providerName:/m);
      }
    }
  });
});

// ── forge bundle 档 patch 静态直检（forge-aggregate-bundle 1.13——patch 直写化，
//    生成器退役；原 patch-generator.test.ts 守卫语义保留，载体改为直写文件静态校验）──
const FORGE_PATCH = readFileSync(resolve(REPO_ROOT, "plugins", "forge", "cordis.patch.yml"), "utf8");
const MEMBERS = ["project", "spec", "task-loop", "expert-squad", "knowledge"] as const;

function topLevelIds(yaml: string): string[] {
  return [...yaml.matchAll(/^- id: (.+)$/gm)].map((m) => m[1]!);
}
function providerNames(yaml: string): string[] {
  return [...yaml.matchAll(/^\s+providerName: (\S+)$/gm)].map((m) => m[1]!);
}

describe("forge patch 六插行（静态直检——直写正本）", () => {
  /** forge 自插行 id（异 id——bug 1102d9d8：≠ 官方 experimental-forge-bundle 服务行 id） */
  const FORGE_ROW_ID = "dshforge";
  it("insert 块 id 序 = dshforge（forge 壳异 id——bug 1102d9d8）+ 五件，name = @dsh-forge/<pkg>", () => {
    const insertBody = FORGE_PATCH.slice(FORGE_PATCH.indexOf("- insert:"), FORGE_PATCH.indexOf("\n    - id: preset-forge"));
    const ids = [...insertBody.matchAll(/^    - id: (.+)$/gm)].map((m) => m[1]!);
    expect(ids).toEqual([FORGE_ROW_ID, ...MEMBERS]);
    expect(insertBody).toContain(`- id: ${FORGE_ROW_ID}\n      name: '@dsh-forge/forge'`);
    for (const id of MEMBERS) {
      expect(insertBody).toContain(`- id: ${id}\n      name: '@dsh-forge/${id}'`);
    }
  });

  it("交付 patch 插行 id 与官方 @deepseek-ai/dsh-experimental-forge-bundle 服务行 id 零交集（bug 1102d9d8——同 id 行合并整行替换官方服务行 → 官方 forge/forgeSession 缺席 → forge-session/forge-panel pending → StartupError；官方 id 集自 app.asar 官方 patch 提取件 pin，缺断言即红）", () => {
    const officialServiceRowIds = [
      "worktree",
      "tool-worktree",
      "forge",
      "forge-github",
      "forge-session",
      "optional-forge-panel",
    ];
    const insertBody = FORGE_PATCH.slice(FORGE_PATCH.indexOf("- insert:"), FORGE_PATCH.indexOf("\n    - id: preset-forge"));
    const insertIds = [...insertBody.matchAll(/^    - id: (.+)$/gm)].map((m) => m[1]!);
    const collide = officialServiceRowIds.filter((id) => insertIds.includes(id));
    expect(collide, `插行 id 与官方服务行 id 撞车集`).toEqual([]);
    expect(insertIds, "forge 壳行异 id 在场（≠ forge）").toContain("dshforge");
    expect(insertIds, "旧撞车 id forge 不再作为插行 id").not.toContain("forge");
  });

  it("派发表达式 && 短路兜底（直写不变量——防裸表达式异常冒泡打断行激活；expert-squad 空对象豁免）", () => {
    for (const member of MEMBERS) {
      const rowAt = FORGE_PATCH.indexOf(`    - id: ${member}\n`);
      expect(rowAt, `${member} 插行在场`).toBeGreaterThanOrEqual(0);
      const nextRowAt = FORGE_PATCH.indexOf("\n    - id: ", rowAt + 1);
      const presetAt = FORGE_PATCH.indexOf("\n    - id: preset-forge");
      const rowEnd = nextRowAt === -1 || presetAt < nextRowAt ? presetAt : nextRowAt;
      const exprs = [...FORGE_PATCH.slice(rowAt, rowEnd).matchAll(/^        (\w+): !!js (.+)$/gm)].map(
        (m) => [m[1]!, m[2]!] as const,
      );
      if (member === "expert-squad") {
        expect(exprs, "expert-squad 空对象豁免").toHaveLength(0);
        continue;
      }
      expect(exprs.length, `${member} 派发表达式非空`).toBeGreaterThan(0);
      for (const [key, expr] of exprs) {
        expect(expr, `${member}.${key} && 兜底`).toContain("&&");
      }
    }
  });

  it("forge patch 零顶层 skills 行且零 preset 内 skill-filesystem 实例（desktop preset 子树按 profile 根解析——@dsh-forge/* 不可达即 preset broken 被过滤；技能由五件 patch 谁带谁自持全局覆盖）", () => {
    expect(topLevelIds(FORGE_PATCH).filter((id) => id.startsWith("skill-filesystem"))).toEqual([]);
    expect(FORGE_PATCH).not.toMatch(/^- id: skill-filesystem\S*$/m);
    const codeLines = FORGE_PATCH.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");
    expect(codeLines, "零 skill-filesystem 实例行（注释提及不算）").not.toContain("skill-filesystem");
  });
});

describe("跨 patch 零交集负断言（谁带谁自持——bundle 六 patch 同载防重名 loud-fail）", () => {
  const forgeIds = topLevelIds(FORGE_PATCH);
  const forgeProviderNames = providerNames(FORGE_PATCH);

  it("forge patch 顶层 id 与五件 patch 顶层 id 零交集（同层重名注册 loud-fail——fefd5149/probe-1 判例）", () => {
    for (const member of MEMBERS) {
      const memberYaml = readFileSync(resolve(REPO_ROOT, "plugins", member, "cordis.patch.yml"), "utf8");
      const overlap = topLevelIds(memberYaml).filter((id) => forgeIds.includes(id));
      expect(overlap, `forge patch 与 ${member} patch 顶层 id 交集`).toEqual([]);
    }
  });

  it("forge patch providerName 与五件 patch providerName 零交集（bundle 六 patch 同载防重名）", () => {
    for (const member of MEMBERS) {
      const memberYaml = readFileSync(resolve(REPO_ROOT, "plugins", member, "cordis.patch.yml"), "utf8");
      const overlap = providerNames(memberYaml).filter((name) => forgeProviderNames.includes(name));
      expect(overlap, `forge patch 与 ${member} patch providerName 交集`).toEqual([]);
    }
  });
});

describe("preset-forge 静态直检（直写正本）", () => {
  const presetBody = FORGE_PATCH.slice(FORGE_PATCH.indexOf("\n    - id: preset-forge"));

  it("order 定值 pin = 2（官方仓 preset 底稿核销当前 order 全集后定值——standard=1/ptc=2/minimal=3/cordis=4；漂移红）", () => {
    expect(presetBody).toMatch(/^        order: 2$/m);
  });

  it("preset 子树零 @dsh-forge 引用 + 零 desktop never-started 行（registry 挂载审计 broken 判例 desktop 2026-11-22——子树解析基点回退 profile 根，成员包不可达；tool-office 在 desktop 组合 never started；成员能力经顶层插行装载）", () => {
    expect(presetBody).not.toContain("@dsh-forge/");
    expect(presetBody).not.toContain("customSkillDirs");
    expect(presetBody, "tool-office 不入 preset 子树（desktop never started → broken）").not.toContain("tool-office");
  });
});
