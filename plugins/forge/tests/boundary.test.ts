// forge 边界门机检：纯声明物化器硬边界——零域逻辑、零 db 句柄、零自有域数据。
// 机制 = 源码 import 扫描 + 包内容面枚举（组合器零源码即边界的最强形态：声明面
// 只剩 cordis.patch.yml / package.json / README.md，任何域逻辑物理上无处落位）。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FORGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 递归枚举包内文件（排除 node_modules 与 tests/——边界门对象 = 源码与声明面）。 */
function listSourceFiles(dir: string, root = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (relative(resolve(root), resolve(full)) === "tests") continue;
      out.push(...listSourceFiles(full, root));
    } else {
      out.push(relative(resolve(root), resolve(full)).replaceAll("\\", "/"));
    }
  }
  return out.sort();
}

const sourceFiles = listSourceFiles(FORGE_ROOT);
const texts = new Map(
  sourceFiles.map((f) => [f, readFileSync(join(FORGE_ROOT, f), "utf8")]),
);

describe("forge 边界门（零域逻辑 / 零 db 句柄 / 零自有域数据）", () => {
  it("包内容面恰三件声明物：cordis.patch.yml + package.json + README.md（零 .ts/.js/.mjs 源码——域逻辑无处落位）", () => {
    expect(sourceFiles).toEqual(["README.md", "cordis.patch.yml", "package.json"]);
    const hasCode = sourceFiles.some((f) => /\.(?:[cm]?[jt]sx?|node|wasm)$/i.test(f));
    expect(hasCode, "组合器出现源码文件即越界").toBe(false);
  });

  it("零 db 句柄：better-sqlite3 / openDatabase / new Database 机检零命中（源码 import 扫描）", () => {
    for (const [file, text] of texts) {
      expect(text, `${file} 出现 better-sqlite3 依赖痕迹`).not.toMatch(/better-sqlite3/);
      expect(text, `${file} 出现 openDatabase 调用/导入`).not.toMatch(/\bopenDatabase\b/);
      expect(text, `${file} 出现 Database 句柄构造`).not.toMatch(/new\s+Database\s*\(/);
    }
  });

  it("零域逻辑：源码 import/require 语句零命中（纯声明物化器不做领域推导、不开子进程、不持运行态）", () => {
    for (const [file, text] of texts) {
      expect(text, `${file} 出现 import 语句`).not.toMatch(/^\s*import\s[\s\S]*from\s+['"]/m);
      expect(text, `${file} 出现 require 调用`).not.toMatch(/\brequire\s*\(\s*['"]/);
    }
  });

  it("零自有域数据：无建表语句、无自有 .db 产物声明（dbFile 引用仅指五件共库下发路径）", () => {
    for (const [file, text] of texts) {
      expect(text, `${file} 出现建表语句`).not.toMatch(/CREATE\s+TABLE/i);
      // 自有库形态禁令：单装缺省落点（project/spec/task-loop/knowledge 自有 db）
      // 不得出现在 forge 声明面——forge 只下发共库 forge.db。
      expect(text, `${file} 出现自有域 db 落点`).not.toMatch(/forge\/db\/(?:project|spec|task-loop|knowledge)\//);
    }
    // dbFile 引用恰四条（project/spec/task-loop/knowledge 共库下发）+ project home 引用恰一条
    // （bug 3c17010a / ad14e904——config 键各随对端契约消费键；patch-contract 快照锁定表达式，
    // 此处做面级复核）。
    const dbFileRefs = [...(texts.get("cordis.patch.yml") ?? "").matchAll(/dbFile:/g)];
    expect(dbFileRefs).toHaveLength(4);
    const homeRefs = [...(texts.get("cordis.patch.yml") ?? "").matchAll(/^\s+home:\s*!!js/gm)];
    expect(homeRefs).toHaveLength(1);
    expect(texts.get("cordis.patch.yml")).toContain("forge/db/forge/forge.db");
  });

  it("依赖面零运行时库：dependencies 恰五件 @dsh-forge/* file: 依赖（无 sqlite/无第三方运行时）", () => {
    const pkg = JSON.parse(readFileSync(join(FORGE_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps).toEqual([
      "@dsh-forge/project",
      "@dsh-forge/spec",
      "@dsh-forge/task-loop",
      "@dsh-forge/expert-squad",
      "@dsh-forge/knowledge",
    ]);
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      expect(range, `${name} 须为相对 file: 声明`).toMatch(/^file:\.\.\//);
    }
    expect(pkg.devDependencies ?? {}).toEqual({});
  });
});
