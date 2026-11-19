// 薄封装门机检（plugin-spec 1.4，code-design §7 机检锚）：
// plugins/spec/host/tools/*.ts 禁 import db/repositories 与 @dsh-forge/lib-db（工具层
// 零 SQL 零域逻辑）；db.prepare 全包仅出现在 db/ 层（域逻辑单源守卫）。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkgDir = join(import.meta.dirname, "..", "..");

describe("薄封装门（host/tools 层零 SQL 零 repository 依赖）", () => {
  const toolFiles = readdirSync(join(pkgDir, "host", "tools")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  it("host/tools 目录在位且持文件", () => {
    expect(toolFiles.length).toBeGreaterThan(0);
  });

  it("tools/*.ts 零 import db/repositories 与 @dsh-forge/lib-db", () => {
    const importRe = /(?:from|import)\s+["']([^"']+)["']/g;
    for (const file of toolFiles) {
      const src = readFileSync(join(pkgDir, "host", "tools", file), "utf8");
      const specifiers = [...src.matchAll(importRe)].map((m) => m[1]!);
      const offenders = specifiers.filter((s) => s.includes("db/repositories") || s === "@dsh-forge/lib-db" || s.startsWith("@dsh-forge/lib-db/"));
      expect(offenders, `${file}: tools 层禁 import repositories/lib-db（命中：${offenders.join(", ")}）`).toEqual([]);
    }
  });

  it("db.prepare 全包仅出现于 db/ 层（域逻辑单源守卫）", () => {
    const offense: string[] = [];
    const walk = (dir: string, rel: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const childRel = `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(join(dir, entry.name), childRel);
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !childRel.includes("/db/")) {
          const src = readFileSync(join(dir, entry.name), "utf8");
          if (src.includes(".prepare(")) offense.push(childRel);
        }
      }
    };
    walk(join(pkgDir, "host"), "host");
    expect(offense, `db.prepare 越层：${offense.join(", ")}`).toEqual([]);
  });
});
