// plugin-forge 侧专家档案解析断言（forge-test-boundary-gates 1.4——code-reviewer.md
// 吸收测试边界判定职责后的装载链护栏）。
// 单源锚：校验语义与 expert-squad parseExpertFile 同构
// （packages/plugins/expert-squad/src/store/frontmatter.ts——必填 name/title/description/tools、
// 禁裸 {{、可选字段类型 skills/model/provider/reasoning）。本包不依赖 expert-squad
// （boundaries 白名单禁新增跨包 import），故在此内联最小校验逻辑；语义漂移以单源锚为准。
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const EXPERT_FILE = resolve(here, "../experts/code-reviewer.md");
const CODE_MASTER_FILE = resolve(here, "../experts/code-master.md");

/** 与 expert-squad parseExpertFile 同构的最小校验（单源锚见文件头）。 */
function parseExpertFileLike(filePath: string, content: string): { ok: true } | { ok: false; reason: string } {
  if (content.includes("{{")) {
    return { ok: false, reason: `${filePath}: 含裸 {{ ——与 persona {{…}} 插值语义冲突，不被允许` };
  }
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!m) return { ok: false, reason: `${filePath}: frontmatter 块缺失` };
  const fm = m[1];
  if (fm === undefined) return { ok: false, reason: `${filePath}: frontmatter 块缺失` };

  const data: Record<string, string | string[]> = {};
  let currentKey: string | undefined;
  for (const rawLine of fm.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith("- ")) {
      const item = line.slice(2).trim();
      if (!currentKey || !Array.isArray(data[currentKey])) {
        return { ok: false, reason: `${filePath}: 列表项 ${item} 无所属键` };
      }
      data[currentKey] = [...(data[currentKey] as string[]), item];
      continue;
    }
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) return { ok: false, reason: `${filePath}: frontmatter 行非法——${line}` };
    const [, key, value] = kv;
    if (key === undefined || value === undefined) {
      return { ok: false, reason: `${filePath}: frontmatter 行非法——${line}` };
    }
    currentKey = key;
    if (value.startsWith("[") && value.endsWith("]")) {
      const items = value.slice(1, -1).split(",").map((s) => s.trim()).filter((s) => s !== "");
      if (items.some((s) => !/^[^\s"'[\]]+$/.test(s))) {
        return { ok: false, reason: `${filePath}: 字段 ${key} 内联数组项非法` };
      }
      data[key] = items;
    } else if (value === "") {
      data[key] = []; // 块列表占位，由后续 "- " 行填充；空到结尾按空数组参与类型判定
    } else {
      data[key] = value.trim();
    }
  }

  const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
  for (const key of ["name", "title", "description"] as const) {
    const v = data[key];
    if (typeof v !== "string" || v.trim() === "") {
      return { ok: false, reason: `${filePath}: 必填字段 ${key} 缺失或为空` };
    }
  }
  if (!isStringArray(data.tools) || data.tools.length === 0) {
    return { ok: false, reason: `${filePath}: 必填字段 tools 缺失、为空或非字符串数组` };
  }
  if (data.skills !== undefined && !isStringArray(data.skills)) {
    return { ok: false, reason: `${filePath}: 字段 skills 非字符串数组` };
  }
  for (const key of ["model", "provider"] as const) {
    if (data[key] !== undefined && typeof data[key] !== "string") {
      return { ok: false, reason: `${filePath}: 字段 ${key} 非字符串` };
    }
  }
  if (data.reasoning !== undefined && !["low", "medium", "high"].includes(String(data.reasoning))) {
    return { ok: false, reason: `${filePath}: 字段 reasoning 非法（须为 low|medium|high）` };
  }
  const personaRaw = m[2];
  if (personaRaw === undefined || personaRaw.trim() === "") {
    return { ok: false, reason: `${filePath}: 正文人设 Markdown 缺失` };
  }
  return { ok: true };
}

describe("experts/code-reviewer.md 档案解析断言（forge-test-boundary-gates 1.4）", () => {
  const content = readFileSync(EXPERT_FILE, "utf-8");

  it("经 parseExpertFile 同构校验通过（必填 name/title/description/tools、字段类型、正文在场）", () => {
    expect(parseExpertFileLike(EXPERT_FILE, content)).toEqual({ ok: true });
  });

  it("无裸 {{ 字面量（全文任意位置）", () => {
    expect(content.includes("{{")).toBe(false);
  });

  it("frontmatter 键与既有档案键集一致（不引入新键）", () => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)![1]!;
    const keys = fm.split(/\r?\n/).filter((l) => /^[A-Za-z]/.test(l)).map((l) => l.split(":")[0]!);
    expect(keys.sort()).toEqual(["description", "name", "skills", "title", "tools"].sort());
  });

  it("关键条目在场：五关口 17 条清单标题", () => {
    const groups = ["设计关", "任务关", "评审关", "验收关", "证据关", "静态关"];
    for (const g of groups) expect(content).toContain(g);
    for (let i = 1; i <= 17; i++) expect(content).toMatch(new RegExp(`^${i}\\. \\*\\*`, "m"));
  });

  it("关键条目在场：第 17 条断言可红性留痕在场检查（与 test-script-author 断言质量门同源同口径）", () => {
    expect(content).toContain("断言可红性留痕在场检查");
    expect(content).toContain("反例注入三段式留痕");
    expect(content).toContain("弄坏点 + 红输出尾部 + 复原绿输出尾部");
    expect(content).toContain("submitTask 结算 AC 证据在场");
    expect(content).toContain("按断言簇抽样规则核对代表性守卫断言");
  });

  it("关键条目在场：点名形态与原则条目", () => {
    for (const fragment of [
      "e2e profile",
      "回放配置",
      "观察证据不推断后端行为",
      "独立出口",
      "外部访问证据",
      "关键词命中只定位不定罪",
      "不连带删除测试侧 fake",
      "默认关闭 ≠ 边界正确",
    ]) {
      expect(content).toContain(fragment);
    }
  });

  it("关键条目在场：接口优先核验（测试侧组合根替换、正式组合根不接受测试切换）", () => {
    expect(content).toContain("测试侧组合根");
    expect(content).toContain("正式装配组合根恒不接受测试配置切换");
  });

  it("关键条目在场：代码可读性、可测试性、clean code 审查项", () => {
    for (const fragment of ["代码可读性", "可测试性", "clean code"]) {
      expect(content).toContain(fragment);
    }
  });

  it("既有职责边界声明保留（不越 architect 结构面、spec-reviewer 目标面）", () => {
    expect(content).toContain("architect");
    expect(content).toContain("spec-reviewer");
  });
});

describe("experts/code-master.md 档案解析断言（forge-test-boundary-gates 1.10——随包副本补接口优先职责）", () => {
  const content = readFileSync(CODE_MASTER_FILE, "utf-8");

  it("经 parseExpertFile 同构校验通过（必填 name/title/description/tools、字段类型、正文在场）", () => {
    expect(parseExpertFileLike(CODE_MASTER_FILE, content)).toEqual({ ok: true });
  });

  it("无裸 {{ 字面量（全文任意位置）", () => {
    expect(content.includes("{{")).toBe(false);
  });

  it("frontmatter 键与既有档案键集一致（不引入新键）", () => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)![1]!;
    const keys = fm.split(/\r?\n/).filter((l) => /^[A-Za-z]/.test(l)).map((l) => l.split(":")[0]!);
    expect(keys.sort()).toEqual(["description", "name", "skills", "title", "tools"].sort());
  });

  it("关键条目在场：接口优先设计职责节（测试侧组合根替换、正式组合根不接受测试切换）", () => {
    expect(content).toContain("接口优先设计");
    expect(content).toContain("识别被测面的可注入接口");
    expect(content).toContain("定义依赖倒置边界");
    expect(content).toContain("测试侧组合根");
    expect(content).toContain("正式装配组合根恒不接受测试配置切换");
  });

  it("既有核心逻辑工匠职责保留（SOLID、可读性、TDD、可测试性）", () => {
    for (const fragment of ["核心逻辑工匠", "SOLID", "可读性是第一位", "TDD 小步推进", "可测试性强"]) {
      expect(content).toContain(fragment);
    }
  });

  it("与 code-reviewer 职责边界清晰（只做设计不做评审）", () => {
    expect(content).toContain("只做设计，不做评审");
    expect(content).toContain("code-reviewer");
  });
});
