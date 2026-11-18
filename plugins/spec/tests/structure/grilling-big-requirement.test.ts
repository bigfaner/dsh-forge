// grilling 大需求档结构 pin（plugin-spec-roadmaps 1.10，AC-2 机检门）：
// 分叉判据句 ↔ 共识流模板 token 对读——判据句内点名的管理面动词 token 必须在共识流
// 模板内被消费（对读一致，零点名零消费漂移）；skill 注册面在位由
// tool-token-snapshot.test.ts（22 动词双向集合相等）承担，本文件不重复。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const skillPath = join(import.meta.dirname, "..", "..", "skills", "grilling", "SKILL.md");
const src = readFileSync(skillPath, "utf8");

/** 大需求档段提取（「## 大需求档共识流」标题起至下一个二级标题）。 */
function bigRequirementSection(text: string): string {
  const start = text.indexOf("## 大需求档共识流");
  expect(start, "SKILL.md 大需求档段在位").toBeGreaterThanOrEqual(0);
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(start, next === -1 ? text.length : next);
}

describe("grilling 大需求档结构 pin（分叉判据句 ↔ 共识流模板 token 对读）", () => {
  const section = bigRequirementSection(src);

  it("分叉判据句在位：单次成文能否承载全部验收 + ≥2 批注册物走大需求档", () => {
    expect(src).toContain("单次成文能否承载全部验收");
    expect(src).toContain("≥2 批");
    expect(src).toContain("大需求档");
  });

  it("分叉判据句挂在 Step 1 建树时点（判据在流程步骤内可及）", () => {
    const step1 = src.slice(src.indexOf("### Step 1"), src.indexOf("### Step 2"));
    expect(step1).toContain("单次成文能否承载全部验收");
  });

  it("共识流模板 token 对读全绿：判据句点名的管理面动词 token 在模板内全部消费", () => {
    // 共识流持久化动词（判据句/模板点名的最小封闭集）
    const expected = ["create_roadmap", "create_milestone", "create_spec", "move_milestone"];
    const missing = expected.filter((t) => !section.includes(t));
    expect(missing, `大需求档共识流模板缺失 token：${missing.join(", ")}`).toEqual([]);
  });

  it("共识流模板承载「拆 Milestone 逐批挂 Spec 经管理面动词持久化」语义", () => {
    expect(section).toContain("逐批");
    expect(section).toContain("挂链");
    expect(section).toContain("持久化");
  });
});
