// dispatchPrompt 合成（新简报形态）随迁测试（plugin-task-loop 1.7——code-design §简报形态
// 渲染确定性约束：行序固定/字母序/省行规则/digest 幂等）。
import { describe, expect, it } from "vitest";
import {
  composeDispatchPrompt,
  renderTestBaseline,
  resolveCoverage,
  RESUME_SECTION,
  RESUME_STALE_SECTION,
} from "../../host/domain/tasks/prompt/compose.js";
import { composePersona, assertNoBareInterpolation, PERSONA_CORE_SECTION, ANTI_CHURN_ANCHORS } from "../../host/domain/tasks/prompt/persona.js";
import { dispatchDigest } from "../../host/domain/tasks/prompt/digest.js";

const base = {
  slug: "plugin-task-loop",
  localId: "2.1",
  title: "实现连接工厂",
  brief: "按固定三参数完成设置。",
  taskType: "coding-feature" as const,
};

describe("元数据表格（行序固定 + 缺省行省）", () => {
  it("行序 TASK_ID → FLAGS → BLOCKERS → CONTEXT → COVERAGE → E2E_BASELINE_RED → TEST_BASELINE", () => {
    const doc = composeDispatchPrompt({
      ...base,
      priority: "P1",
      context: { SKIP_EVAL_GATE: "1" },
      coverage: 0.8,
      e2eBaselineRedCases: ["b.spec", "a.spec"],
      testBaseline: { present: true, path: "Z:\\base.md", recordedAt: "2026-01-01" },
      sourceTask: { slug: "plugin-task-loop", localId: "1.4" },
      breaking: true,
    });
    const keys = doc
      .split("\n")
      .filter((l) => l.startsWith("| "))
      .map((l) => l.split("|")[1].trim());
    expect(keys).toEqual(["键", "TASK_ID", "FLAGS", "CONTEXT", "COVERAGE", "E2E_BASELINE_RED", "TEST_BASELINE"]);
    expect(doc).toContain("| FLAGS | P1, fix-of plugin-task-loop/1.4, breaking |");
    expect(doc).toContain("| CONTEXT | SKIP_EVAL_GATE=1 |");
    expect(doc).toContain("| COVERAGE | percentage 80% |");
    expect(doc).toContain("a.spec; b.spec"); // 红灯清单字母序
  });

  it("CONTEXT 键字母序；缺省行省（无 FLAGS/BLOCKERS/CONTEXT 行）", () => {
    const doc = composeDispatchPrompt({ ...base, context: { B: "2", A: "1" } });
    expect(doc).toContain("| CONTEXT | A=1; B=2 |");
    expect(doc).not.toContain("| FLAGS");
    expect(doc).not.toContain("| BLOCKERS");
    expect(doc).not.toContain("SOURCE:");
    expect(doc).not.toContain("PHASE_SUMMARY:");
  });

  it("COVERAGE：maintain 恒渲染（cleanup/refactor）；percentage 仅显式阈值在场；非 coding 系省", () => {
    expect(resolveCoverage("coding-cleanup")).toEqual({ strategy: "maintain" });
    expect(resolveCoverage("coding-feature", 0.85)).toEqual({ strategy: "percentage", target: 85 });
    expect(resolveCoverage("coding-feature")).toBeUndefined();
    expect(resolveCoverage("doc")).toBeUndefined();
    const doc = composeDispatchPrompt({ ...base, taskType: "coding-cleanup" });
    expect(doc).toContain("| COVERAGE | maintain |");
  });

  it("BLOCKERS 行 = 前置自然键 + 当前状态（字母序）", () => {
    const doc = composeDispatchPrompt({
      ...base,
      blockers: [
        { slug: "s", localId: "2.1", taskStatus: "blocked" as const },
        { slug: "s", localId: "1.gate", taskStatus: "blocked" as const },
      ],
    });
    expect(doc).toContain("| BLOCKERS | 1.gate blocked; 2.1 blocked |");
  });
});

describe("正文段（TITLE/任务目标/验收条件/影响范围）", () => {
  it("# 标题首行 + ## 任务目标 + ## 验收条件（逐字判据单行化）", () => {
    const doc = composeDispatchPrompt({
      ...base,
      acceptanceCriteria: ["多行\n判据", "单行判据"],
    });
    expect(doc).toContain("# 实现连接工厂");
    expect(doc).toContain("## 任务目标");
    expect(doc).toContain("按固定三参数完成设置。");
    expect(doc).toContain("- 多行 判据");
    expect(doc).toContain("- 单行判据");
  });

  it("## 影响范围：分组列表（组内字母序、缺组整组省、removed 组省）", () => {
    const doc = composeDispatchPrompt({
      ...base,
      scope: { created: ["b.ts", "a.ts"], modified: ["m.ts"] },
    });
    expect(doc).toContain("## 影响范围");
    const lines = doc.split("## 影响范围")[1]!.trim().split("\n");
    expect(lines).toEqual(["- created: a.ts", "- created: b.ts", "- modified: m.ts"]);
    const doc2 = composeDispatchPrompt({ ...base });
    expect(doc2).not.toContain("## 影响范围");
  });
});

describe("<resume> 段与基线行", () => {
  it("evidencePointer 在场 → 尾段注入（fresh/stale 两态）；缺席零段", () => {
    const fresh = composeDispatchPrompt({ ...base, evidencePointer: "logs/x/resume.md" });
    expect(fresh.endsWith(RESUME_SECTION)).toBe(true);
    const stale = composeDispatchPrompt({ ...base, evidencePointer: "logs/x/resume.md", evidenceStale: true });
    expect(stale.endsWith(RESUME_STALE_SECTION)).toBe(true);
    expect(composeDispatchPrompt({ ...base })).not.toContain("<resume>");
  });

  it("TEST_BASELINE 两形态：文档正本指针 / 兜底行；缺席入参省行", () => {
    expect(renderTestBaseline({ present: false })).toBe("无既有失败清单，遇失败默认按新回归上报");
    expect(renderTestBaseline({ present: true, path: "Z:\\base.md" })).toContain("Z:\\base.md");
    expect(composeDispatchPrompt({ ...base })).not.toContain("TEST_BASELINE");
  });
});

describe("digest 幂等 + 词汇校验 + persona 程序段", () => {
  it("同输入恒同 digest；渲染差异产生新值；digest = sha256 前 12 hex", () => {
    const a = composeDispatchPrompt({ ...base });
    const b = composeDispatchPrompt({ ...base });
    const c = composeDispatchPrompt({ ...base, brief: "另一目标" });
    expect(dispatchDigest(a)).toBe(dispatchDigest(b));
    expect(dispatchDigest(a)).not.toBe(dispatchDigest(c));
    expect(dispatchDigest(a)).toMatch(/^[0-9a-f]{12}$/);
  });

  it("词汇外 taskType 抛错（运行期防御面）", () => {
    expect(() => composeDispatchPrompt({ ...base, taskType: "no-such" as never })).toThrow(/unknown task type/);
  });

  it("persona 程序段：核心段恒在 + Coding Strategy 路由（9 类）+ 复杂度保底门 + 禁裸 {{", () => {
    const coding = composePersona("coding-fix", "high");
    expect(coding).toContain(PERSONA_CORE_SECTION);
    expect(coding).toContain("### Coding Strategy");
    expect(coding).toContain("受影响包的类型检查/构建，含直接依赖它的包");
    const docType = composePersona("doc", "low");
    expect(docType).not.toContain("### Coding Strategy");
    expect(docType).toContain("仅改动包");
    for (const anchor of ANTI_CHURN_ANCHORS) {
      expect(coding).toContain(anchor);
    }
    expect(() => assertNoBareInterpolation("bad {{ x", "t")).toThrow(/bare '\{\{'/);
    expect(() => composePersona("coding-fix", "ultra" as never)).toThrow(/unknown complexity/);
  });
});
