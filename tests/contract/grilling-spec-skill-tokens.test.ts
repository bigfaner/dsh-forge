// grilling SKILL.md 快照契约测试（plugin-spec 1.9——复刻 task-loop to-tasks 形态）：
// SKILL.md 收尾模板动词 token ↔ create_spec 工具 schema 文本级对读（只锁 token 不锁文案）
// + 单次全批调用形态断言 + 禁散调 grep + 迁移技能注册面结构 pin（skills 目录文件清单）。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCreateSpecTool } from "../../plugins/spec/host/tools/create-spec.js";

const ROOT = join(import.meta.dirname, "..", "..");
const SKILLS_DIR = join(ROOT, "plugins", "spec", "skills");
const doc = readFileSync(join(SKILLS_DIR, "grilling", "SKILL.md"), "utf8");

/** 工具 schema 必填集单源（create_spec 工具定义直读——不手抄清单）。 */
const tool = createCreateSpecTool({ specs: {} as Parameters<typeof createCreateSpecTool>[0]["specs"] });
const REQUIRED_PARAMS = tool.parameters.required ?? [];

describe("grilling SKILL.md 快照契约", () => {
  it("skill id = 目录名 grilling（官方 skill 面目录约定：frontmatter name 与目录名一致）", () => {
    expect(doc).toMatch(/^---\nname: grilling\n/);
    expect(doc).toMatch(/^description: /m);
  });

  it("收尾注册动词改指 create_spec（旧 proposal 域动词 token 零残留——只锁 token 不锁文案）", () => {
    expect(tool.name).toBe("create_spec");
    expect(doc).toContain("create_spec");
    expect(doc).not.toContain("createProposal");
  });

  it("收尾模板与 create_spec 工具 schema 必填参数逐项对读一致（模板覆盖每个必填参数 token）", () => {
    expect(REQUIRED_PARAMS).toEqual(["slug", "title", "goals"]);
    for (const param of REQUIRED_PARAMS) {
      expect(doc).toContain(param);
    }
  });

  it("可选参数 token 在位（tiers / goals[].acs / doc_path / doc_content——agent 面全参数覆盖）", () => {
    for (const param of ["tiers", "acs", "doc_path", "doc_content"]) {
      expect(doc).toContain(param);
    }
  });

  it("tiers 封闭词表 token 在位（ui | api | pure-logic | docs）", () => {
    for (const tier of ["ui", "api", "pure-logic", "docs"]) {
      expect(doc).toContain(tier);
    }
  });

  it("单次全批调用形态断言（模板 = 单次 create_spec({ slug, title, tiers, goals: [...] })）", () => {
    expect(doc).toContain("create_spec({");
    expect(doc).toContain("goals: [");
    expect(doc).toContain("禁散调");
  });

  it("Spec 文档契约章节 token 在位（用户旅程/改动范围/tiers 交付档位结构）", () => {
    expect(doc).toContain("用户旅程");
    expect(doc).toContain("改动范围");
    expect(doc).toContain("tiers 交付档位");
    expect(doc).toContain("Goals/AC");
  });
});

describe("迁移技能注册面结构 pin（skills 目录文件清单）", () => {
  it("spec 包 skills 目录 = 迁移清单四技能，逐一 SKILL.md 在场且 frontmatter name 与目录名一致", () => {
    const expected = ["fix-bug", "grilling", "investigate-bug"];
    expect(readdirSync(SKILLS_DIR).sort()).toEqual([...expected].sort());
    for (const name of expected) {
      const skill = readFileSync(join(SKILLS_DIR, name, "SKILL.md"), "utf8");
      expect(skill).toMatch(new RegExp(`^---\\nname: ${name}\n`));
      expect(skill).toMatch(/^description: /m);
    }
  });

  it("fix-bug / investigate-bug 逐字迁入（台账两阶段 + 原子提交关键 token 与源一致）", () => {
    const fixBug = readFileSync(join(SKILLS_DIR, "fix-bug", "SKILL.md"), "utf8");
    expect(fixBug).toContain("recordBug");
    expect(fixBug).toContain("resolveBug");
    expect(fixBug).toContain("原子提交");
    const investigate = readFileSync(join(SKILLS_DIR, "investigate-bug", "SKILL.md"), "utf8");
    expect(investigate).toContain("bug-investigator");
    expect(investigate).toContain("落卷");
  });
});
