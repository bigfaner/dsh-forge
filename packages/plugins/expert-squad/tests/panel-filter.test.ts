// panel/filter 纯逻辑单测（ui-design F1）：搜索即时过滤（名称/英文标识/技能）、
// 状态过滤（全部/启用/禁用）、页脚计数文案、人设摘要降级为纯文本、更新时间标签。

import { describe, expect, it } from "vitest";
import {
  filterExperts,
  footerText,
  personaSummary,
  updatedLabel,
  type ExpertView,
  type StatusFilter,
} from "../src-client/panel/filter.js";

function entry(overrides: Partial<ExpertView> = {}): ExpertView {
  return {
    name: "code-reviewer",
    title: "资深评审",
    description: "Runs code review",
    personaMd: "## 职责\n- 评审 diff",
    tools: ["read", "edit"],
    skills: ["review", "tsc"],
    origin: "project",
    enabled: true,
    updatedAt: "2026-10-18T08:30:00.000Z",
    ...overrides,
  };
}

const fixtures: readonly ExpertView[] = [
  entry(),
  entry({ name: "arch-advisor", title: "方案设计", skills: ["design"], tools: ["read"] }),
  entry({ name: "test-gatekeeper", title: "质量门", skills: ["vitest"], enabled: false }),
];

describe("filterExperts（搜索 × 状态）", () => {
  it("空查询 + 全部 = 原样返回（全部条目）", () => {
    expect(filterExperts(fixtures, "", "all")).toHaveLength(3);
  });

  it("按名称（英文键）即时过滤，大小写不敏感", () => {
    expect(filterExperts(fixtures, "ARCH", "all").map((e) => e.name)).toEqual(["arch-advisor"]);
  });

  it("按技能过滤：命中技能即入选", () => {
    expect(filterExperts(fixtures, "vitest", "all").map((e) => e.name)).toEqual(["test-gatekeeper"]);
    expect(filterExperts(fixtures, "review", "all").map((e) => e.name)).toEqual(["code-reviewer"]);
  });

  it("无命中 = 空数组（视图层落「无匹配」空态）", () => {
    expect(filterExperts(fixtures, "nope", "all")).toEqual([]);
  });

  it("状态过滤：enabled/disabled 各自收敛，all 全量", () => {
    const names = (s: StatusFilter): string[] =>
      filterExperts(fixtures, "", s).map((e) => e.name);
    expect(names("enabled")).toEqual(["code-reviewer", "arch-advisor"]);
    expect(names("disabled")).toEqual(["test-gatekeeper"]);
    expect(names("all")).toHaveLength(3);
  });

  it("搜索与状态过滤叠加（AND 语义）", () => {
    expect(filterExperts(fixtures, "gate", "disabled").map((e) => e.name)).toEqual([
      "test-gatekeeper",
    ]);
    expect(filterExperts(fixtures, "gate", "enabled")).toEqual([]);
  });
});

describe("footerText（面板页脚计数）", () => {
  it("N 位专家 · 显示 M（原型 F1 文案逐位）", () => {
    expect(footerText(4, 2)).toBe("4 位专家 · 显示 2");
    expect(footerText(0, 0)).toBe("0 位专家");
  });
});

describe("personaSummary（人设三行截断的输入降级）", () => {
  it("剥离 Markdown 标记为纯文本（标题、加粗、行内代码、列表符）", () => {
    const summary = personaSummary(
      "## 职责\n- 承接**代码评审**任务\n- 输出 `file:line` 级意见",
    );
    expect(summary).not.toContain("#");
    expect(summary).not.toContain("**");
    expect(summary).not.toContain("`");
    expect(summary).toContain("承接代码评审任务");
    expect(summary).toContain("file:line");
  });

  it("空人设 = 空串（视图自然塌缩，不渲染占位符）", () => {
    expect(personaSummary("")).toBe("");
  });
});

describe("updatedLabel（页脚更新时间）", () => {
  it("ISO 即取日期段（YYYY-MM-DD）", () => {
    expect(updatedLabel("2026-10-18T08:30:00.000Z")).toBe("2026-10-18");
  });

  it("缺席 = undefined（页脚时段不呈现）", () => {
    expect(updatedLabel(undefined)).toBeUndefined();
  });
});
