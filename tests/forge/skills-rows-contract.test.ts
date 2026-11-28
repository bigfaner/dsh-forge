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

/** 顶层退役成员（1.34 技能预设独占收敛——skills 实例迁入 preset 子树，零顶层行）。 */
const PRESET_NESTED = ["expert-squad"] as const;
const PRESET_OF: Record<(typeof PRESET_NESTED)[number], string> = { "expert-squad": "preset-headhunter" };

/** project 顶层行退役（plugins-remediation M1 阶段 A——空技能注册行与 skills/ 目录删除，零顶层行、无子树实例）。 */
const TOP_ZERO = ["project"] as const;

const allSkillsRows = FIVE.filter((p) => !(TOP_ZERO as readonly string[]).includes(p)).map((p) => ({
  pkg: p,
  id: EXPECTED_ID[p],
  body: (PRESET_NESTED as readonly string[]).includes(p)
    ? presetNestedSkillRow(patchText[p], EXPECTED_ID[p])
    : skillsRows(p)[0]!.body,
}));

/** preset 子树嵌套 skills 实例行块（id 行起至下一个 `- id:` 行止——preset-headhunter
 * 子树内嵌套实例提取；1.34 技能预设独占收敛——expert-squad 顶层行退役迁入子树）。 */
function presetNestedSkillRow(yaml: string, id: string): string {
  const lineMatch = yaml.match(new RegExp(`^[ \\t]*- id: ${id}[ \\t]*$`, "m"));
  expect(lineMatch, `${id} 嵌套实例在场`).not.toBeNull();
  const start = yaml.indexOf(lineMatch![0]);
  const body: string[] = [yaml.slice(start).split(/\r?\n/)[0]!];
  for (const line of yaml.slice(start).split(/\r?\n/).slice(1)) {
    if (/^\s*- id: /.test(line)) break;
    body.push(line);
  }
  return body.join("\n");
}

describe("三谓词（五件 skills 自持行——id 互异 ∩ ≠ base id ∩ providerName 互异 ≠ 默认名）", () => {
  it("三件恰一条顶层 skills 行 id = skill-filesystem-<pkg>；expert-squad 顶层行退役（preset-headhunter 子树实例承载）；project 顶层行退役（空技能注册删除，零子树实例）", () => {
    for (const pkg of FIVE) {
      const rows = skillsRows(pkg);
      if ((PRESET_NESTED as readonly string[]).includes(pkg)) {
        expect(rows, `${pkg} 顶层 skills 行退役（子树实例承载）`).toHaveLength(0);
        continue;
      }
      if ((TOP_ZERO as readonly string[]).includes(pkg)) {
        expect(rows, `${pkg} 顶层 skills 行退役（零子树实例）`).toHaveLength(0);
        continue;
      }
      expect(rows, `${pkg} 顶层 skills 行数`).toHaveLength(1);
      expect(rows[0]!.id, `${pkg} skills 行 id`).toBe(EXPECTED_ID[pkg]);
      expect(rows[0]!.body, `${pkg} 行 name`).toContain(`name: '${SKILL_FS_PACKAGE}'`);
    }
    const squadBody = presetNestedSkillRow(patchText["expert-squad"], EXPECTED_ID["expert-squad"]);
    expect(squadBody, "expert-squad 子树实例 name").toContain(`name: '${SKILL_FS_PACKAGE}'`);
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
    for (const row of allSkillsRows) {
      const name = /^\s*providerName:\s*(\S+)/m.exec(row.body)?.[1];
      expect(name, `${row.pkg} providerName 在场`).toBeDefined();
      expect(name, `${row.pkg} providerName`).toBe(`filesystem-${row.pkg}`);
    }
    expect(new Set(names).size, "providerName 互异").toBe(names.length);
    for (const name of names) {
      expect(name).not.toBe(DEFAULT_PROVIDER_NAME);
    }
  });
});

describe("自锚面（customSkillDirs 本包锚 + && 短路兜底 + ./package.json 出口前提）", () => {
  it("三件新增行 customSkillDirs 表达式自锚本包 skills/，且携 && 短路兜底（防锚解析异常冒泡打断行激活；spec 既有行表达式不动；project 顶层行已退役）", () => {
    for (const pkg of FIVE) {
      if (pkg === "spec" || (PRESET_NESTED as readonly string[]).includes(pkg) || (TOP_ZERO as readonly string[]).includes(pkg)) continue;
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

  it("preset 子树嵌套实例混合锚形态（1.34 技能预设独占收敛——expert-squad preset-headhunter 子树：IIFE try/catch 双腿形，baseUrl 解析优先 + DSH_HOME generation 探测兜底，零 throw 冒泡）", () => {
    for (const pkg of PRESET_NESTED) {
      const body = presetNestedSkillRow(patchText[pkg], EXPECTED_ID[pkg]);
      const expr = /!!js\s+(.+)$/m.exec(body)?.[1];
      expect(expr, `${pkg} !!js 混合锚表达式在场`).toBeDefined();
      expect(expr, `${pkg} IIFE try/catch 形`).toMatch(/^\(\(\)=>\{try\{return /);
      expect(expr, `${pkg} baseUrl 腿（resolve 本包 package.json）`).toContain(`createRequire(baseUrl).resolve('${PKG_NAME[pkg]}/package.json')`);
      expect(expr, `${pkg} DSH_HOME generation 探测兜底腿`).toContain("process.env.DSH_HOME");
      expect(expr, `${pkg} generation 目录前缀探测`).toContain("dsh-forge+forge+");
      expect(expr, `${pkg} fs/path 经 process.getBuiltinModule`).toContain("process.getBuiltinModule('node:fs')");
      expect(expr, `${pkg} 零裸 throw`).not.toContain("throw ");
      expect(body, `${pkg} 实例在 ${PRESET_OF[pkg]} 子树内（深层缩进嵌套）`).toMatch(/^ {6,}- id:/m);
    }
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
  it("五件 patch skills 行（顶层 + preset 子树嵌套）一律显式携带 providerName，零裸行", () => {
    for (const row of allSkillsRows) {
      expect(row.body, `${row.pkg} 行 ${row.id} 缺 providerName`).toMatch(/^\s*providerName:/m);
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
/** 插行顶层 providerName（缩进 ≤4——preset 子树嵌套技能实例不入交集面：bundle 通道
 * 单载 forge patch、solo 通道单载成员 patch，双正本 preset 子树同构实例永不 co-load）。 */
function providerNames(yaml: string): string[] {
  return [...yaml.matchAll(/^ {1,4}providerName: (\S+)$/gm)].map((m) => m[1]!);
}

describe("forge patch 六插行（静态直检——直写正本）", () => {
  /** forge 自插行 id（异 id——bug 1102d9d8：≠ 官方 experimental-forge-bundle 服务行 id；
   * 用户裁定 2026-11-22 自 dshforge 改名 forge-bundle——官方同款构词） */
  const FORGE_ROW_ID = "forge-bundle";
  it("insert 块 id 序 = expert-squad（装配序修正——builtin-redistribution 裁决②）+ forge-bundle（forge 壳异 id——bug 1102d9d8）+ 四件，name = @dsh-forge/<pkg>", () => {
    const insertBody = FORGE_PATCH.slice(FORGE_PATCH.indexOf("- insert:"), FORGE_PATCH.indexOf("\n    - id: preset-forge"));
    const ids = [...insertBody.matchAll(/^    - id: (.+)$/gm)].map((m) => m[1]!);
    expect(ids).toEqual(["expert-squad", FORGE_ROW_ID, ...MEMBERS.filter((m) => m !== "expert-squad")]);
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
    expect(insertIds, "forge 壳行异 id 在场（≠ forge）").toContain("forge-bundle");
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
        if (expr.startsWith("dshHomePath(")) continue; // 官方 dshHomePath 服务写法（boot 提供——无环境派生分支，官方 patch 同款）
        expect(expr, `${member}.${key} && 兜底`).toContain("&&");
      }
    }
  });

  it("forge patch 零顶层 skills 行 + preset-forge 子树 skill-filesystem-forge 实例混合锚（1.34 技能预设独占收敛——标准模式零成员技能，技能走 preset 子树实例；顶层禁承带由 package-release 机检守卫）", () => {
    expect(topLevelIds(FORGE_PATCH).filter((id) => id.startsWith("skill-filesystem"))).toEqual([]);
    expect(FORGE_PATCH).not.toMatch(/^ {0,4}- id: skill-filesystem\S*$/m);
    // preset-forge 子树实例在场（嵌套形——零顶层承带）
    expect(FORGE_PATCH).toContain("- id: skill-filesystem-forge");
    expect(FORGE_PATCH).toContain("providerName: filesystem-forge");
    const anchorStart = FORGE_PATCH.indexOf("- id: skill-filesystem-forge");
    const instanceBody = FORGE_PATCH.slice(anchorStart);
    // 混合锚形态：五成员锚逐件 IIFE try/catch 双腿形（baseUrl 解析优先 + DSH_HOME
    // generation 探测兜底，desktop profile 根 baseUrl 必失败落兜底），零裸 throw
    for (const member of MEMBERS) {
      const expr = instanceBody.split("\n").find((l) => l.includes(`'@dsh-forge/${member}/package.json'`));
      expect(expr, `${member} 锚行在场`).toBeDefined();
      expect(expr, `${member} IIFE try/catch 形`).toMatch(/\(\(\)=>\{try\{return .+catch\(e\)\{/);
      expect(expr, `${member} baseUrl 腿`).toContain(`createRequire(baseUrl).resolve('@dsh-forge/${member}/package.json')`);
      expect(expr, `${member} DSH_HOME generation 探测兜底腿`).toContain("process.env.DSH_HOME");
      expect(expr, `${member} generation 目录前缀探测`).toContain("dsh-forge+forge+");
      expect(expr, `${member} 零裸 throw`).not.toContain("throw ");
    }
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

  it("preset 子树零 desktop never-started 官方件行（registry 挂载审计 broken 判例 desktop 2026-11-22——tool-office 在 desktop 组合 never started；技能实例混合锚兼容 desktop profile 根求值基点——baseUrl 腿失败落 DSH_HOME generation 探测兜底）", () => {
    expect(presetBody, "tool-office 不入 preset 子树（desktop never started → broken）").not.toContain("tool-office");
  });
});

// ── WYSIWYG 正本自含性（回归修复 bfd37960 + 用户铁律 2026-11-22：正本 = 交付唯一事实源，
//    打包脚本零改写——只读恒等校验归 package-release 机检）──
describe("forge patch 正本自含性（WYSIWYG——bundle 全量在正本）", () => {
  it("preset-headhunter 块在场（第二 insert 块——猎头模式预设随正本承带，order 3 pin）", () => {
    expect(FORGE_PATCH).toContain("- insert:");
    expect(FORGE_PATCH).toContain("    - id: preset-headhunter");
    expect(FORGE_PATCH).toContain("        id: headhunter");
    expect(FORGE_PATCH).toContain("        name: 猎头模式");
    expect(FORGE_PATCH).toContain("        order: 3");
  });

  it("双 preset 子树技能实例在场（preset-forge 子树 skill-filesystem-forge + preset-headhunter 子树 skill-filesystem-expert-squad，providerName 互异）", () => {
    expect(FORGE_PATCH).toContain("- id: skill-filesystem-forge");
    expect(FORGE_PATCH).toContain("providerName: filesystem-forge");
    expect(FORGE_PATCH).toContain("- id: skill-filesystem-expert-squad");
    expect(FORGE_PATCH).toContain("providerName: filesystem-expert-squad");
  });

  it("零 tool-exclude-office 行 + preset 子树零 @dsh-forge/ 子路径 name（bug bfd37960 回归根因——profile 根解析封锁双预设 broken；office 排除归 1.35 宿主债务）", () => {
    expect(FORGE_PATCH).not.toMatch(/- id: tool-exclude-office/m);
    expect(FORGE_PATCH).not.toMatch(/name: '@dsh-forge\/[^']*tools-exclude'/);
    const presetScoped = FORGE_PATCH.slice(FORGE_PATCH.indexOf("    - id: preset-forge"));
    const subpathNames = [...presetScoped.matchAll(/^\s+name: ['"](@dsh-forge\/[^'"]+)['"]\s*$/gm)].map((m) => m[1]!);
    expect(subpathNames, "preset 子树零 @dsh-forge/ 子路径 name").toEqual([]);
  });

  it("expert-squad 正本 exclude 行同退役（双通道统一——正本对账一致性）", () => {
    const squadYaml = readFileSync(resolve(REPO_ROOT, "plugins", "expert-squad", "cordis.patch.yml"), "utf8");
    expect(squadYaml).not.toMatch(/- id: tool-exclude-office/m);
    // solo 通道自持副本仍携 preset-headhunter 块（bundle 通道由 forge 正本自含同构块承带）
    expect(squadYaml).toContain("- id: preset-headhunter");
    expect(squadYaml).toContain("        order: 3");
  });
});
