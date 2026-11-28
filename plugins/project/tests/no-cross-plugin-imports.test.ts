// 跨插件 import 禁面机检（plugin-spec 1.18——doc-style 单源下沉 lib/api 后收口）：
// plugins/project 源码树零跨插件 import @dsh-forge/<plugin>/*——插件间共享契约一律经
// @dsh-forge/lib-api（含 lib-* 族）、@dsh-forge/contracts、path-key 消费；命中即红。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkgDir = join(import.meta.dirname, "..");
const SELF = "@dsh-forge/project";
const ALLOWED = new Set([
  "@dsh-forge/contracts",
  "@dsh-forge/lib-api",
  "@dsh-forge/lib-db",
  "@dsh-forge/lib-diag",
  "@dsh-forge/lib-git",
  "@dsh-forge/lib-path",
  "@dsh-forge/lib-ui",
  "@dsh-forge/lib-util",
  "@dsh-forge/path-key",
  SELF,
]);

function walk(dir: string, rel: string, offenders: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const childRel = `${rel}/${entry.name}`;
    const child = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "tests", "scripts"].includes(entry.name)) continue;
      walk(child, childRel, offenders);
    } else if (/\.(ts|tsx|mts|mjs)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
      const src = readFileSync(child, "utf8");
      const specifiers = [...src.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]!);
      for (const s of specifiers) {
        if (!s.startsWith("@dsh-forge/")) continue;
        const base = s.split("/").slice(0, 2).join("/");
        if (!ALLOWED.has(base)) offenders.push(`${childRel} -> ${s}`);
      }
    }
  }
}

describe("跨插件 import 禁面（共享契约下沉 lib/api 单源）", () => {
  it("源码树零 @dsh-forge/<plugin>/* import（白名单外 @dsh-forge/* 命中即红）", () => {
    const offenders: string[] = [];
    for (const sub of ["host", "ui", "shared"]) {
      try {
        if (statSync(join(pkgDir, sub)).isDirectory()) walk(join(pkgDir, sub), sub, offenders);
      } catch {
        // 子目录缺席（骨架阶段）= 零命中面
      }
    }
    expect(offenders, `跨插件 import 命中：\n${offenders.join("\n")}`).toEqual([]);
  });
});
