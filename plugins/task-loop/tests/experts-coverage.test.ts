import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// 硬引用键覆盖门快照契约测试（expert-builtin-redistribution 迁移后）：消费面全部
// 硬引用专家键（DEFAULT_EXPERT_MAPPING 17 值 + triage/三评审/retro），逐键断言在
// task-loop/experts/ 在场（文件存在 + frontmatter name 合法）——锚定迁移后单一事实源。
import { DEFAULT_EXPERT_MAPPING } from "@dsh-forge/lib-api";
import { TRIAGE_EXPERT_KEY } from "../host/loop/driver.js";
import { LOOP_REVIEW_EXPERT_KEYS } from "../host/loop/injection.js";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPERTS_DIR = resolve(pkgDir, "experts");

/** 快照契约集：消费面全部硬引用专家键（人格键） */
const SNAPSHOT_KEYS: readonly string[] = [
  ...Object.values(DEFAULT_EXPERT_MAPPING),
  TRIAGE_EXPERT_KEY,
  ...LOOP_REVIEW_EXPERT_KEYS,
  "retro-reviewer",
];

function frontmatterName(file: string): string | undefined {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return undefined;
  const nameLine = match[1]!.match(/^name:\s*(\S+)\s*$/m);
  return nameLine?.[1];
}

describe("硬引用键覆盖门（expert-builtin-redistribution 迁移后快照契约）", () => {
  it("快照契约集完备：DEFAULT_EXPERT_MAPPING 17 键 + triage + 三评审 + retro-reviewer，无重复", () => {
    expect(SNAPSHOT_KEYS).toHaveLength(22);
    expect(new Set(SNAPSHOT_KEYS).size).toBe(22);
    expect(Object.keys(DEFAULT_EXPERT_MAPPING)).toHaveLength(17);
  });

  it.each(SNAPSHOT_KEYS)("%s 在 task-loop/experts/ 在场且 frontmatter name 键合法", (key) => {
    const file = resolve(EXPERTS_DIR, `${key}.md`);
    expect(existsSync(file), `${key}.md 缺席（消费面硬引用键断裂）`).toBe(true);
    expect(frontmatterName(file), `${key}.md frontmatter name 不等于人格键`).toBe(key);
  });

  it("experts/ 目录无契约外档案（迁移后快照集即全集）", () => {
    const files = existsSync(EXPERTS_DIR)
      ? readdirSync(EXPERTS_DIR).filter((n) => n.endsWith(".md")).map((n) => n.slice(0, -3))
      : [];
    expect(new Set(files).difference(new Set(SNAPSHOT_KEYS))).toEqual(new Set());
  });
});
