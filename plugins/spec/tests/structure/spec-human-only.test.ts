// human-only 机检锚（plugin-spec-roadmaps 1.6，code-design §3b）——
// spec_status 的 UPDATE 全包仅 db/repositories/spec-repo.ts（行级 SQL 单源）；
// spec completed 写入调用面仅 domain/specs/spec-lifecycle.ts（acceptSpec human-only
// 单点——机械段一/链式收口/边沿写点的 spec_status 写入值域不含 completed 字面量）。
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

describe("human-only 机检（spec_status completed 写点单文件）", () => {
  it("spec_status UPDATE 语句全包仅 spec-repo.ts 一处", () => {
    const offenders = walk(hostDir)
      .filter((f) => !f.replace(/\\/g, "/").endsWith("db/repositories/spec-repo.ts"))
      .filter((f) => /SET\s+spec_status/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("completed 写入调用面仅 spec-lifecycle.ts（其余动词 spec_status 写入值域零 completed 字面量）", () => {
    const callers = walk(hostDir)
      .filter((f) => !f.replace(/\\/g, "/").endsWith("db/repositories/spec-repo.ts"))
      .filter((f) => /updateStatus\((?:[^();]|"[^"]*"|'[^']*')*?["']completed["']/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(/\\/g, "/").split("/").slice(-2).join("/"))
      .sort();
    // objective 验收确认动词（code-design §1 confirm*Achieved）为各自实体 kind 的
    // human-only completed 写点单源——roadmap 侧与 spec 侧（spec-lifecycle）分域对偶，
    // spec_status 锚不变。（milestone 侧写点 confirmMilestoneAchieved 已随 M2-α 死面退役删除——
    // spec §3.2 零消费导出；completed 写点面随之收敛。）
    expect(callers).toEqual(["specs/roadmap-service.ts", "specs/spec-lifecycle.ts"]);
    const lifecycle = readFileSync(join(hostDir, "domain/specs/spec-lifecycle.ts"), "utf8");
    expect(lifecycle.includes("updateStatus(")).toBe(true);
    expect(lifecycle.includes("decision === \"completed\" ? \"completed\"")).toBe(true);
  });

  it("milestone_status UPDATE 语句全包仅 milestone-repo.ts 一处", () => {
    const offenders = walk(hostDir)
      .filter((f) => !f.replace(/\\/g, "/").endsWith("db/repositories/milestone-repo.ts"))
      .filter((f) => /SET\s+milestone_status/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
