// forge 契约测试①：patch 形态（forge-aggregate-bundle——聚合 bundle 六插行介质）。
// 顶层行 = 六插行（forge 自插 + 五件插行各携派发 config !!js 行——插行激活官方默认
// 路径）+ 五件 skills 行（异 id + 互异 providerName 自锚本包 skills/）+ preset-forge。
// 派发映射/自锚逐字符断言归 tests/forge/{patch-generator,skills-rows-contract}.test.ts
// 与 plugins/forge/tests/config-contract.test.ts；本文件为行形态速查 pin。
// （对齐 plugins/project skeleton.test.ts 先例：patch 面文本结构机检。）
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FORGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface InsertRow {
  id: string;
  name: string;
  configKeys: string[];
}

/** 行级解析 cordis.patch.yml insert 清单（小文件固定格式——行扫描，不引 yaml 依赖）。
 * 顶层行 = 零缩进行 + '- insert:' 直挂行（4 空格缩进）——preset 子树嵌套行（≥6 空格）
 * 不在插行面。 */
function parseInsertRows(yaml: string): InsertRow[] {
  const rows: InsertRow[] = [];
  let current: InsertRow | undefined;
  let inConfig = false;
  for (const line of yaml.split(/\r?\n/)) {
    const idMatch = line.match(/^ {0,4}- id:\s*(\S+)/);
    if (idMatch) {
      current = { id: idMatch[1]!, name: "", configKeys: [] };
      rows.push(current);
      inConfig = false;
      continue;
    }
    if (!current) continue;
    const nameMatch = line.match(/^\s+name:\s*(\S+)/);
    if (nameMatch && current.name === "") {
      current.name = nameMatch[1]!.replace(/^['"]|['"]$/g, "");
      continue;
    }
    if (/^\s+config:\s*$/.test(line)) {
      inConfig = true;
      continue;
    }
    const configKeyMatch = inConfig ? line.match(/^\s+(\S+?):/) : undefined;
    if (configKeyMatch) current.configKeys.push(configKeyMatch[1]!);
  }
  return rows;
}

/** 六插行 id 序（forge 自插 + 五件插行——bundle 档唯一插行面）。 */
const SIX_ROW_IDS = ["forge", "project", "spec", "task-loop", "expert-squad", "knowledge"];
const FIVE = ["project", "spec", "task-loop", "expert-squad", "knowledge"] as const;

describe("forge patch 六插行契约", () => {
  const pkg = JSON.parse(readFileSync(join(FORGE_ROOT, "package.json"), "utf8")) as {
    dsh?: { bundle?: { patch?: string } };
    dependencies?: Record<string, string>;
  };
  const patchYaml = readFileSync(join(FORGE_ROOT, "cordis.patch.yml"), "utf8");
  const rows = parseInsertRows(patchYaml);

  it("dsh.bundle.patch 指向 cordis.patch.yml 且文件在场（官方 patch 正门声明面）", () => {
    expect(pkg.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
    expect(patchYaml).toContain("- insert:");
  });

  it("顶层行恰十二条 = 六插行 + 五件 skills 行 + preset-forge（序 pin——六插行激活官方默认路径）", () => {
    expect(rows.map((r) => r.id)).toEqual([
      ...SIX_ROW_IDS,
      ...FIVE.map((m) => `skill-filesystem-${m}`),
      "preset-forge",
    ]);
  });

  it("forge 自插行 name + config 恰 { home } 单键（forge 统一 schema——Workbench 生长面；db/tasksHome 不设覆写键恒延伸）", () => {
    expect(rows.find((r) => r.id === "forge")!.name).toBe("@dsh-forge/forge");
    expect(rows[0]!.configKeys).toEqual(["home"]);
  });

  it("五件插行 name 锚各件包名（插行激活 = 依赖落盘后官方默认路径——零组合缝）", () => {
    for (const member of FIVE) {
      expect(rows.find((r) => r.id === member)!.name).toBe(`@dsh-forge/${member}`);
    }
  });

  it("五件 skills 行：name = 官方 skill-filesystem 包 + config 携 providerName + customSkillDirs（自锚逐字符断言归 tests/forge/skills-rows-contract.test.ts 与 patch-generator 双检）", () => {
    for (const member of FIVE) {
      const row = rows.find((r) => r.id === `skill-filesystem-${member}`)!;
      expect(row.name).toBe("@deepseek-ai/dsh-skill-filesystem");
      expect(row.configKeys).toContain("providerName");
      expect(row.configKeys).toContain("customSkillDirs");
    }
  });

  it("五件相对 file: 依赖全量声明（发布树归一闭包——纯复制物化，零 registry）", () => {
    const deps = pkg.dependencies ?? {};
    const expected = FIVE.map((m) => `@dsh-forge/${m}`);
    for (const name of expected) {
      expect(deps[name], `缺 file: 依赖：${name}`).toMatch(/^file:\.\.\//);
    }
    expect(Object.keys(deps).sort()).toEqual([...expected].sort());
  });
});
