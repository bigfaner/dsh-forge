// forge 契约测试①：patch 形态（forge-deep-pack 1.6——单行自插裁定沿袭 + 资产挂载行）。
// 顶层插行恰三行：forge 自插（五件零插行——组合激活归 host apply，P0 #1）+
// skill-filesystem 挂载行 + preset-standard 覆写行（判例：skills 挂载 = preset-standard
// 覆写行 customSkillDirs config 锚，非插行扫描——1.6 生成脚本同源产物）。
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
    if (nameMatch) {
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

describe("forge patch 单行自插契约", () => {
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

  it("顶层插行恰三行 = forge 自插 + skill-filesystem 挂载行 + preset-standard 覆写行（五件零插行——组合激活归 host apply，P0 #1；资产行 = 1.6 生成脚本产物）", () => {
    expect(rows.map((r) => r.id)).toEqual(["forge", "skill-filesystem", "preset-standard"]);
    expect(rows[0]!.name).toBe("@dsh-forge/forge");
    for (const id of ["project", "spec", "task-loop", "expert-squad", "knowledge"]) {
      expect(rows.find((r) => r.id === id), `五件零插行（单行自插裁定）：${id}`).toBeUndefined();
    }
  });

  it("forge 行 config 恰 { home } 单键（forge 统一 schema——db/tasksHome 不设覆写键恒延伸）", () => {
    expect(rows[0]!.configKeys).toEqual(["home"]);
    expect(patchYaml).not.toMatch(/^\s+(?:dbFile|tasksHome):/m);
  });

  it("资产两行 config 均携 customSkillDirs（skills 挂载 = config 锚判例——非插行扫描；五条自锚逐字符断言归 tests/forge/asset-aggregation.test.ts）", () => {
    expect(rows[1]!.configKeys).toContain("customSkillDirs");
    expect(rows[2]!.configKeys).toContain("customSkillDirs");
  });

  it("五件相对 file: 依赖全量声明（发布树通道闭包解析激活面——单行自插不裁依赖）", () => {
    const deps = pkg.dependencies ?? {};
    const expected = [
      "@dsh-forge/project",
      "@dsh-forge/spec",
      "@dsh-forge/task-loop",
      "@dsh-forge/expert-squad",
      "@dsh-forge/knowledge",
    ];
    for (const name of expected) {
      expect(deps[name], `缺 file: 依赖：${name}`).toMatch(/^file:\.\.\//);
    }
    expect(Object.keys(deps).sort()).toEqual([...expected].sort());
  });
});
