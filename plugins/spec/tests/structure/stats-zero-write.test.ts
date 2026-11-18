// 零新落库面机检（plugin-spec-roadmaps 1.11，code-design §7 机检② / AC-2）——
// v2 后全库无 stats 类写径 grep 门：spec-stats 诊断文件零 SQL 写 token，
// repository 层零 stats 命名写面（统计口径 = 查询期现算，唯一落库面 = v2 既有表族）。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const hostDir = join(import.meta.dirname, "..", "..", "host");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

describe("零落库机检（stats 类写径 grep 门）", () => {
  it("spec-stats.ts 零 SQL 写径（INSERT/UPDATE/DELETE/withTransaction/append 零命中）", () => {
    const src = readFileSync(join(hostDir, "domain/specs/spec-stats.ts"), "utf8");
    const writeTokens = [/INSERT\s+INTO/i, /UPDATE\s+\w+\s+SET/i, /DELETE\s+FROM/i, /withTransaction/, /\.append\w*\(/];
    for (const token of writeTokens) {
      expect(token.test(src), `spec-stats.ts 命中写径 token ${token}`).toBe(false);
    }
  });

  it("repository 层零 stats 命名文件与方法（无 stats 类写径入口）", () => {
    const repoDir = join(hostDir, "db/repositories");
    const offenders = walk(repoDir)
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => /stat/i.test(f.split("/").pop() ?? ""));
    expect(offenders).toEqual([]);
    for (const f of walk(repoDir)) {
      const src = readFileSync(f, "utf8");
      expect(/(?:function|method)\s+\w*[Ss]tats/.test(src), `${f}: stats 命名写读面`).toBe(false);
    }
  });
});
