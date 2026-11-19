// 工具 schema ↔ SKILL.md 注册动词 token 快照对读（plugin-spec-roadmaps 1.8，AC-4 机检门）
// ——FORGE_SPEC_TOOL_NAMES（注册序单源）与 skills/grilling/SKILL.md「注册动词 token 快照」
// 段双向集合相等：注册面每个动词 token 必须在 SKILL.md 在场（快照零漏记），SKILL.md 快照
// 段每个 snake_case token 必须是注册动词（快照零幽灵/零 stale）。薄封装门（thin-gate）与
// 域单源门（db.prepare 层级）全量适用——见同目录 thin-gate.test.ts，本文件不重复。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORGE_SPEC_TOOL_NAMES } from "../../host/tools/index.js";

const skillPath = join(import.meta.dirname, "..", "..", "skills", "grilling", "SKILL.md");

/** 快照段提取（「## 注册动词 token 快照」标题起至下一个二级标题——段内隔离，正文零污染）。 */
function snapshotSection(src: string): string {
  const start = src.indexOf("## 注册动词 token 快照");
  expect(start, "SKILL.md 快照段在位").toBeGreaterThanOrEqual(0);
  const next = src.indexOf("\n## ", start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

/** snake_case token 词法（快照段内反引号/斜杠分隔 token 全集）。 */
const TOKEN_RE = /\b[a-z]+(?:_[a-z]+)+\b/g;

/** 快照段合法的非工具 token（入参键/状态词表名——工具 token 对读的豁免白名单）。 */
const NON_TOOL_TOKENS = new Set([
  "milestone_id",
  "roadmap_slug",
  "goal_seq",
  "ac_json",
  "gap_note",
  "awaiting_acceptance",
  "in_progress",
]);

describe("工具 schema ↔ SKILL.md 注册动词 token 快照对读（双向集合相等）", () => {
  const src = readFileSync(skillPath, "utf8");
  const section = snapshotSection(src);
  const tokens = [...new Set([...section.matchAll(TOKEN_RE)].map((m) => m[0]))];
  const registered = new Set<string>(FORGE_SPEC_TOOL_NAMES);
  const snapshotToolTokens = tokens.filter((t) => !NON_TOOL_TOKENS.has(t));

  it("注册面 22 动词 = 快照段工具 token 全集（快照零漏记）", () => {
    expect(FORGE_SPEC_TOOL_NAMES.length).toBe(22);
    const missing = [...registered].filter((name) => !snapshotToolTokens.includes(name));
    expect(missing, `SKILL.md 快照段缺失注册动词：${missing.join(", ")}`).toEqual([]);
  });

  it("快照段零幽灵 token（每个 snake_case token ∈ 注册动词 ∪ 白名单）", () => {
    const ghosts = snapshotToolTokens.filter((t) => !registered.has(t));
    expect(ghosts, `SKILL.md 快照段幽灵/stale token：${ghosts.join(", ")}`).toEqual([]);
  });

  it("工具 schema 面 ↔ 快照逐名对读（注册序单源——每个 tool definition name 在注册名单）", async () => {
    const { createSpecTools } = await import("../../host/tools/index.js");
    const { openSpecDb } = await import("../../host/db/connection.js");
    const { createForgeSpecsService } = await import("../../host/domain/specs/service.js");
    const { createForgeToolServices } = await import("../../host/domain/specs/tool-service.js");
    const domain = openSpecDb(".", { file: ":memory:" });
    try {
      const specs = createForgeSpecsService({
        db: domain.db,
        repos: domain.repos,
        writeSpecDoc: () => {},
      });
      const verbs = createForgeToolServices({ db: domain.db, repos: domain.repos, specs });
      const tools = createSpecTools({ specs, verbs });
      const definitionNames = Object.values(tools).map((t) => t.name);
      expect(definitionNames).toEqual([...FORGE_SPEC_TOOL_NAMES]);
    } finally {
      domain.db.close();
    }
  });
});
