// forge 契约测试①：patch 插行清单——cordis.patch.yml 五行裸名与五件包名逐一比对，
// 缺行/错名即红（对齐 plugins/project skeleton.test.ts 先例：patch 面文本结构机检）。
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FORGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 五件插件 id → 包名（期望清单——对端 = 各插件包 package.json 实名）。 */
const EXPECTED_ROWS: ReadonlyArray<readonly [string, string]> = [
  ["project", "@dsh-forge/project"],
  ["spec", "@dsh-forge/spec"],
  ["task-loop", "@dsh-forge/task-loop"],
  ["expert-squad", "@dsh-forge/expert-squad"],
  ["knowledge", "@dsh-forge/knowledge"],
];

interface InsertRow {
  id: string;
  name: string;
  configKeys: string[];
  dbFileExpr?: string;
}

/** 行级解析 cordis.patch.yml insert 清单（小文件固定格式——行扫描，不引 yaml 依赖）。 */
function parseInsertRows(yaml: string): InsertRow[] {
  const rows: InsertRow[] = [];
  let current: InsertRow | undefined;
  let inConfig = false;
  for (const line of yaml.split(/\r?\n/)) {
    const idMatch = line.match(/^\s*-\s+id:\s*(\S+)/);
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
    if (configKeyMatch) {
      current.configKeys.push(configKeyMatch[1]!);
      const exprMatch = line.match(/^\s+dbFile:\s*!!js\s+(.+)$/);
      if (exprMatch) current.dbFileExpr = exprMatch[1]!;
    }
  }
  return rows;
}

describe("forge patch 插行清单契约", () => {
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

  it("插行恰五行、id 与包名逐一比对——缺行/错名/多行即红", () => {
    expect(rows.map((r) => r.id), "插行 id 清单（顺序无关但集合全等）").toEqual(
      EXPECTED_ROWS.map(([id]) => id),
    );
    for (const [id, name] of EXPECTED_ROWS) {
      const row = rows.find((r) => r.id === id);
      expect(row, `缺插行：${id}`).toBeDefined();
      expect(row!.name, `${id} 插行包名错`).toBe(name);
    }
    // 裸名行形态：name 为包名（loader 组合行识别面）——非路径、非别名。
    for (const row of rows) {
      expect(row.name).toMatch(/^@dsh-forge\/[a-z-]+$/);
    }
  });

  it("五件相对 file: 依赖全量声明（与插行一一对应——闭包解析激活面）", () => {
    const deps = pkg.dependencies ?? {};
    for (const [, name] of EXPECTED_ROWS) {
      expect(deps[name], `缺 file: 依赖：${name}`).toMatch(/^file:\.\.\//);
    }
    expect(Object.keys(deps).length).toBe(EXPECTED_ROWS.length);
  });

  it("expert-squad 无库裸行插装；其余四件各携 config（持库件）", () => {
    const expert = rows.find((r) => r.id === "expert-squad");
    expect(expert!.configKeys, "expert-squad 应为裸行（无 config）").toEqual([]);
    for (const id of ["project", "spec", "task-loop", "knowledge"]) {
      const row = rows.find((r) => r.id === id);
      expect(row!.configKeys, `${id} 应携 config 段`).toContain("dbFile");
    }
  });
});
