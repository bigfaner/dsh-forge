// 任务 1.2 测试 —— 专家档案 frontmatter 解析与注册期校验（tech-design §8 数据模型）。
// bug b29f77e7（字面 \n 归一）：模型/脚本写入的档案可能把换行写成字面 `\n` 转义符——
// 解析层归一为真实换行（视图/编辑/persona 注入三面同源生效），编辑保存后即固化。
import { describe, expect, it } from "vitest";
import {
  detectSameLayerDuplicate,
  parseExpertFile,
  validateExpertUpdate,
} from "../src/store/frontmatter.js";

const PATH = "C:\\experts\\code-reviewer.md";

const GOOD = [
  "---",
  "name: code-reviewer",
  "description: >-",
  "  Reviews diffs and files for correctness, boundary violations and",
  "  maintainability; reports findings ranked by severity.",
  "title: 资深评审",
  "tools: [read, grep]",
  "skills: []",
  "---",
  "",
  "## 职责",
  "",
  "对 diff / 指定文件做正确性、边界与可维护性评审。",
].join("\n");

describe("正向：frontmatter + 正文人设 → ExpertRecord", () => {
  // bug b29f77e7：字面 \n 转义序列归一为真实换行——description 与 personaMd 同源归一，
  // 序列中的字面 \n（含 \n\n 段间形态）全部转真实换行；无字面 \n 的档案零变化。
  it("bug b29f77e7: 字面 \\n 归一为真实换行（description + personaMd 同源）", () => {
    const md = [
      "---",
      "name: qa",
      'description: "Electron 测试专家\\n负责 E2E 与打包验证"',
      "title: 测试工",
      "tools: [read]",
      "---",
      "职责\\n- 负责 Electron 应用的测试设计与执行\\n\\n## 边界\\n- 只做测试与质量保证",
    ].join("\n");
    const r = parseExpertFile(PATH, md);
    if (!r.ok) throw new Error(`应解析成功：${r.reason}`);
    expect(r.record.description).toBe("Electron 测试专家\n负责 E2E 与打包验证");
    expect(r.record.personaMd).toBe(
      "职责\n- 负责 Electron 应用的测试设计与执行\n\n## 边界\n- 只做测试与质量保证",
    );
  });

  it("全字段解析（块标量 description / flow 数组 tools / 空 skills）+ 正文人设 Markdown 原文", () => {
    const r = parseExpertFile(PATH, GOOD);
    if (!r.ok) throw new Error(`应解析成功：${r.reason}`);
    expect(r.record).toEqual({
      name: "code-reviewer",
      description:
        "Reviews diffs and files for correctness, boundary violations and maintainability; reports findings ranked by severity.",
      title: "资深评审",
      personaMd: "## 职责\n\n对 diff / 指定文件做正确性、边界与可维护性评审。",
      tools: ["read", "grep"],
      skills: [],
    });
  });

  it("可选字段：model 透传，skills 缺省为空数组", () => {
    const md = [
      "---",
      "name: qa",
      "description: runs tests",
      "title: 测试工",
      "tools: [read]",
      "model: sonnet",
      "---",
      "## 信条",
      "",
      "测试先行。",
    ].join("\n");
    const r = parseExpertFile(PATH, md);
    if (!r.ok) throw new Error(`应解析成功：${r.reason}`);
    expect(r.record.model).toBe("sonnet");
    expect(r.record.skills).toEqual([]);
  });
});

describe("负向：fail-loud，错误信息含文件路径与原因", () => {
  it("缺 name → 拒绝", () => {
    const md = GOOD.replace("name: code-reviewer\n", "");
    const r = parseExpertFile(PATH, md);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain(PATH);
      expect(r.reason).toContain("name");
    }
  });

  it("缺 title → 拒绝", () => {
    const r = parseExpertFile(PATH, GOOD.replace("title: 资深评审\n", ""));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("title");
  });

  it("缺 description → 拒绝", () => {
    const md = GOOD.replace(/description: >-\n(  .*\n)+/, "");
    const r = parseExpertFile(PATH, md);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("description");
  });

  it("缺 tools / tools 空数组 → 拒绝", () => {
    for (const md of [
      GOOD.replace("tools: [read, grep]\n", ""),
      GOOD.replace("tools: [read, grep]", "tools: []"),
    ]) {
      const r = parseExpertFile(PATH, md);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("tools");
    }
  });

  it("坏 YAML → 拒绝", () => {
    const md = "---\nname: [unclosed\ndescription: d\ntitle: t\ntools: [read]\n---\nbody";
    const r = parseExpertFile(PATH, md);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain(PATH);
      expect(r.reason).toContain("YAML");
    }
  });

  it("无 frontmatter 块 → 拒绝", () => {
    const r = parseExpertFile(PATH, "## 只有人设正文\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(PATH);
  });

  it("name 含裸 {{ → 拒绝", () => {
    const md = GOOD.replace("name: code-reviewer", "name: code-{{x}}-reviewer");
    const r = parseExpertFile(PATH, md);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("{{");
  });

  it("人设正文含裸 {{ → 拒绝（persona {{…}} 插值语义冲突）", () => {
    const r = parseExpertFile(PATH, GOOD.replace("对 diff / 指定文件", "对 {{input}} / 指定文件"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain(PATH);
      expect(r.reason).toContain("{{");
    }
  });

  it("字段类型非法（tools 非字符串数组）→ 拒绝", () => {
    const r = parseExpertFile(PATH, GOOD.replace("tools: [read, grep]", "tools: [read, 42]"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("tools");
  });
});

describe("同层撞名拒绝", () => {
  it("同层两个文件同名 → 报错含两个路径与撞名键", () => {
    const dup = detectSameLayerDuplicate([
      { name: "code-reviewer", filePath: "C:\\experts\\a.md" },
      { name: "qa", filePath: "C:\\experts\\b.md" },
      { name: "code-reviewer", filePath: "C:\\experts\\c.md" },
    ]);
    expect(dup).not.toBeNull();
    expect(dup).toContain("code-reviewer");
    expect(dup).toContain("a.md");
    expect(dup).toContain("c.md");
  });

  it("无撞名 → null", () => {
    expect(
      detectSameLayerDuplicate([
        { name: "a", filePath: "x.md" },
        { name: "b", filePath: "y.md" },
      ]),
    ).toBeNull();
  });
});

describe("update 校验：name 建档后不可改", () => {
  it("name 与建档一致 → 通过并返回解析结果", () => {
    const r = validateExpertUpdate("code-reviewer", PATH, GOOD);
    expect(r.ok).toBe(true);
  });

  it("name 被改动 → 拒绝，错误含旧键、新键与路径", () => {
    const md = GOOD.replace("name: code-reviewer", "name: renamed");
    const r = validateExpertUpdate("code-reviewer", PATH, md);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("code-reviewer");
      expect(r.reason).toContain("renamed");
      expect(r.reason).toContain(PATH);
    }
  });

  it("update 内容同样过字段校验（缺必填仍拒绝）", () => {
    const r = validateExpertUpdate("code-reviewer", PATH, GOOD.replace("tools: [read, grep]\n", ""));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("tools");
  });
});
