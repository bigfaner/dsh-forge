// human-only 机检锚（plugin-spec-roadmaps 1.5，code-design §7 机检①）：
// goal_status 的 UPDATE 全包仅 db/repositories/spec-repo.ts（行级 SQL 单源）；
// completed 写入调用面仅 domain/specs/goal-finalize.ts（终审 human-only 单点——
// 推进/复核两动词的 goal_status 写入值域不含 completed，机械永不触碰终态）。
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

describe("human-only 机检（goal_status completed 写点单文件）", () => {
  it("goal_status UPDATE 语句全包仅 spec-repo.ts 一处", () => {
    const offenders = walk(hostDir)
      .filter((f) => !f.replace(/\\/g, "/").endsWith("db/repositories/spec-repo.ts"))
      .filter((f) => /SET\s+goal_status/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("updateGoalStatus 写入面白名单：推进/终审/复核三动词 + repo 单源", () => {
    const callers = walk(hostDir)
      .filter((f) => !f.replace(/\\/g, "/").endsWith("db/repositories/spec-repo.ts"))
      .filter((f) => readFileSync(f, "utf8").includes("updateGoalStatus("))
      .map((f) => f.replace(/\\/g, "/").split("/").slice(-2).join("/"))
      .sort();
    expect(callers).toEqual(["specs/goal-advance.ts", "specs/goal-finalize.ts", "specs/goal-review.ts"]);
  });

  it("completed 写入调用面仅 goal-finalize.ts（推进/复核动词 goal_status 写入值域零 completed 字面量）", () => {
    for (const rel of ["domain/specs/goal-advance.ts", "domain/specs/goal-review.ts"]) {
      const src = readFileSync(join(hostDir, rel), "utf8");
      const literalWrite = /updateGoalStatus\((?:[^();]|"[^"]*"|'[^']*')*?["']completed["']/.test(src);
      expect(literalWrite, `${rel} 不得出现 completed 直写`).toBe(false);
    }
    const finalize = readFileSync(join(hostDir, "domain/specs/goal-finalize.ts"), "utf8");
    expect(finalize.includes("updateGoalStatus(")).toBe(true);
    expect(/decision === "completed" \? "completed"/.test(finalize)).toBe(true);
  });
});
