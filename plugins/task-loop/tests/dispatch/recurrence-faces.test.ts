// bug 0db72bcb 生产装配面单测——createRecurrenceFaces（台账 recurrence 只读 face + 建模
// 报告在场探测的生产实现工厂）：装配径接线断言走工厂真实现（非手写 face 桩），T3 拦截/
// 解除判据经生产 face + 真实 probes 目录全径验证。路径派生经注入面消费（workspaceDocsRoot）。
// proposals/<slug>/issues/<localId>/ 轨已随 proposal 域退役（proposal-domain-retirement
// 机检——.forge/ 下无 proposals 目录）——探测唯一位 = probes/<bugId>/，关联锚 = 链成员 bugId。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BugRecurrenceCandidate } from "@dsh-forge/contracts";
import { createRecurrenceFaces } from "../../host/dispatch-core/recurrence-faces.js";
import { recurrenceEscalationGuard } from "../../host/dispatch-core/claim.js";

const CHAIN3: readonly BugRecurrenceCandidate[] = [
  { bugId: "b-r2", summary: "根", chain: ["b-root", "b-r1", "b-r2"], fullEdgeCount: 2, hasOpen: true },
];

/** 路径派生注入（workspaceDocsRoot 同形闭包——<ws>/.forge/docs） */
const pathDeps = {
  workspaceDocsRoot: (ws: string): string => join(ws, ".forge", "docs"),
};

/** 报告探测输入（bugIds = 命中链成员——probes/<bugId>/ 探测锚） */
const probeInput = (slug: string, localId: string) => ({
  projectId: "p-1",
  slug,
  localId,
  bugIds: ["b-root", "b-r1", "b-r2"],
});

const noBugs = { findRecurrenceCandidates: async (): Promise<readonly BugRecurrenceCandidate[]> => [] };

function snapshot(fixOfTaskId?: string) {
  return {
    taskId: "t-1", slug: "feat-x", localId: "2.1",
    title: "T", taskType: "coding-fix", taskStatus: "in_progress", breaking: false, complexity: "low",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    ...(fixOfTaskId !== undefined ? { fixOfTaskId } : {}),
  } as Parameters<typeof recurrenceEscalationGuard>[0]["task"];
}

describe("createRecurrenceFaces（bug 0db72bcb 生产装配工厂）", () => {
  let ws: string | undefined;
  afterEach(() => {
    if (ws !== undefined) rmSync(ws, { recursive: true, force: true });
    ws = undefined;
  });

  it("findRecurrenceCandidates：sourceTaskId 透传 bugs 域 scope（bug bdbe8218——参数做实功，域层结构化解析消费）", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const faces = createRecurrenceFaces({
      bugs: {
        findRecurrenceCandidates: async (_projectId, scope) => {
          captured.push({ ...scope });
          return [];
        },
      },
      resolveProjectDir: () => undefined,
      ...pathDeps,
    });
    await faces.findRecurrenceCandidates("p-1", { slug: "feat-x", localId: "2.1", sourceTaskId: "t-feat-x-1.1" });
    expect(captured[0]).toMatchObject({ slug: "feat-x", localId: "2.1", sourceTaskId: "t-feat-x-1.1", files: [] });
    // 缺席 = 键缺席（域层回退 slug 锚）——类型面必填，运行期缺席径以 as 承载（捕获面断言 in）
    await faces.findRecurrenceCandidates("p-1", { slug: "feat-x", localId: "2.1" } as Parameters<typeof faces.findRecurrenceCandidates>[1]);
    expect("sourceTaskId" in captured[1]!).toBe(false);
  });

  it("modelingReportPresent：probes/<bugId>/ 顶层 .md 在场 = true（链任一成员——报告落 probes 即解除）", () => {
    ws = mkdtempSync(join(tmpdir(), "recurrence-faces-"));
    const probesDir = join(ws, ".forge", "docs", "probes", "b-r1");
    mkdirSync(probesDir, { recursive: true });
    writeFileSync(join(probesDir, "investigation.md"), "# 判别实验清单\n");
    const faces = createRecurrenceFaces({ bugs: noBugs, resolveProjectDir: () => ws, ...pathDeps });
    expect(faces.modelingReportPresent(probeInput("feat-x", "2.1"))).toBe(true); // 链成员 b-r1 的 probes 卷
    // 非链成员的 probes 卷不算
    expect(faces.modelingReportPresent({ projectId: "p-1", slug: "feat-x", localId: "2.1", bugIds: ["b-other"] })).toBe(false);
  });

  it("modelingReportPresent：链成员均无 probes 卷 = false（真缺席——拦截保守成立）", () => {
    ws = mkdtempSync(join(tmpdir(), "recurrence-faces-"));
    const faces = createRecurrenceFaces({ bugs: noBugs, resolveProjectDir: () => ws, ...pathDeps });
    expect(faces.modelingReportPresent(probeInput("feat-x", "2.1"))).toBe(false);
  });

  it("modelingReportPresent：probes 子目录 .md 不计（顶层非递归）；探测面只读 fail-soft 缺席 false", () => {
    ws = mkdtempSync(join(tmpdir(), "recurrence-faces-"));
    const probesSub = join(ws, ".forge", "docs", "probes", "b-r1", "evidence");
    mkdirSync(probesSub, { recursive: true });
    writeFileSync(join(probesSub, "dump.md"), "x");
    const faces = createRecurrenceFaces({ bugs: noBugs, resolveProjectDir: () => ws, ...pathDeps });
    expect(faces.modelingReportPresent(probeInput("feat-x", "2.1"))).toBe(false);
    // 项目目录解析缺席 = false（不抛）
    const absent = createRecurrenceFaces({ bugs: noBugs, resolveProjectDir: () => undefined, ...pathDeps });
    expect(absent.modelingReportPresent(probeInput("feat-x", "2.1"))).toBe(false);
  });

  it("proposals/<slug>/issues/<localId>/ 不再是探测位（proposal 域退役——该轨报告在场不计）", () => {
    ws = mkdtempSync(join(tmpdir(), "recurrence-faces-"));
    const legacyIssues = join(ws, ".forge", "docs", "proposals", "feat-x", "issues", "2.1");
    mkdirSync(legacyIssues, { recursive: true });
    writeFileSync(join(legacyIssues, "modeling-report.md"), "# 旧轨报告\n");
    const faces = createRecurrenceFaces({ bugs: noBugs, resolveProjectDir: () => ws, ...pathDeps });
    expect(faces.modelingReportPresent(probeInput("feat-x", "2.1"))).toBe(false);
  });

  it("派生缝缺席（workspaceDocsRoot 未注入）= 'error' 机制失能形态——消费侧放行不恒拦", () => {
    ws = mkdtempSync(join(tmpdir(), "recurrence-faces-"));
    const faces = createRecurrenceFaces({ bugs: noBugs, resolveProjectDir: () => ws });
    expect(faces.modelingReportPresent(probeInput("feat-x", "2.1"))).toBe("error");
  });

  it("三态钉住（recurrence-judgment-narrowing）：IO 正常在场 = true / IO 正常缺席 = false / IO 故障 = 'error'", () => {
    ws = mkdtempSync(join(tmpdir(), "recurrence-faces-"));
    const faces = createRecurrenceFaces({ bugs: noBugs, resolveProjectDir: () => ws, ...pathDeps });
    // IO 正常缺席：probes 卷目录存在但链成员目录无 .md = 真「报告不在场」（仍拦截）
    mkdirSync(join(ws, ".forge", "docs", "probes", "b-r1"), { recursive: true });
    expect(faces.modelingReportPresent(probeInput("feat-x", "2.1"))).toBe(false);
    // IO 正常在场：链成员目录落报告
    writeFileSync(join(ws, ".forge", "docs", "probes", "b-r1", "r.md"), "x");
    expect(faces.modelingReportPresent(probeInput("feat-x", "2.1"))).toBe(true);
    // IO 故障模拟：链成员路径被文件占位 → existsSync 真、readdirSync 抛（ENOTDIR）——机制失能
    rmSync(join(ws, ".forge", "docs", "probes", "b-r1"), { recursive: true, force: true });
    writeFileSync(join(ws, ".forge", "docs", "probes", "b-r1"), "not a dir");
    expect(faces.modelingReportPresent(probeInput("feat-x", "2.1"))).toBe("error");
  });

  it("IO 故障降级（守卫全径）：生产 face 返回 'error' → claim 消费为放行 + warn 留痕", async () => {
    ws = mkdtempSync(join(tmpdir(), "recurrence-faces-"));
    // 链成员路径被文件占位 → existsSync 真、readdirSync ENOTDIR
    mkdirSync(join(ws, ".forge", "docs", "probes"), { recursive: true });
    writeFileSync(join(ws, ".forge", "docs", "probes", "b-r1"), "not a dir");
    const faces = createRecurrenceFaces({ bugs: { findRecurrenceCandidates: async () => CHAIN3 }, resolveProjectDir: () => ws, ...pathDeps });
    const diags: Array<{ level: string; event: string; message: string }> = [];
    const rejection = await recurrenceEscalationGuard({
      projectId: "p-1",
      task: snapshot("t-src"),
      findRecurrenceCandidates: faces.findRecurrenceCandidates,
      modelingReportPresent: faces.modelingReportPresent,
      diag: (d) => diags.push({ level: d.level, event: d.event, message: d.message }),
    });
    expect(rejection).toBeUndefined(); // 拦截未生效
    const warn = diags.find((d) => d.event === "modeling-report-face-error");
    expect(warn?.level).toBe("warn");
    expect(warn?.message).toContain("拦截未生效");
  });

  it("findRecurrenceCandidates：台账域服务 face 委派（scope 透传——sourceTaskId 随行，bug bdbe8218 消解）", async () => {
    const calls: unknown[] = [];
    const faces = createRecurrenceFaces({
      bugs: {
        findRecurrenceCandidates: async (projectId, scope) => {
          calls.push({ projectId, scope });
          return CHAIN3;
        },
      },
      resolveProjectDir: () => undefined,
      ...pathDeps,
    });
    const out = await faces.findRecurrenceCandidates("p-1", { slug: "feat-x", localId: "2.1", sourceTaskId: "t-feat-x-2.1" });
    expect(out).toEqual(CHAIN3);
    expect(calls).toEqual([{ projectId: "p-1", scope: { slug: "feat-x", localId: "2.1", sourceTaskId: "t-feat-x-2.1", files: [] } }]);
  });

  it("T3 解除判据生产全径：同缝 ≥2 且报告不在场 → 软拒绝；报告落 probes/<链成员 bugId>/ → 放行（同一生产 face 现算）", async () => {
    ws = mkdtempSync(join(tmpdir(), "recurrence-faces-"));
    const faces = createRecurrenceFaces({ bugs: { findRecurrenceCandidates: async () => CHAIN3 }, resolveProjectDir: () => ws, ...pathDeps });
    const input = {
      projectId: "p-1",
      task: snapshot("t-src"),
      findRecurrenceCandidates: faces.findRecurrenceCandidates,
      modelingReportPresent: faces.modelingReportPresent,
    };
    expect(await recurrenceEscalationGuard(input)).toBeDefined(); // 无报告 → 软拒绝
    const probesDir = join(ws, ".forge", "docs", "probes", "b-r1");
    mkdirSync(probesDir, { recursive: true });
    writeFileSync(join(probesDir, "investigation.md"), "# 判别实验清单\n");
    expect(await recurrenceEscalationGuard(input)).toBeUndefined(); // 报告落 probes 即解除
  });

  it("T3 拒绝载荷 release 指引 = probes 单轨（零 proposals 残留——指向已退役目录即误导 agent）", async () => {
    ws = mkdtempSync(join(tmpdir(), "recurrence-faces-"));
    const faces = createRecurrenceFaces({ bugs: { findRecurrenceCandidates: async () => CHAIN3 }, resolveProjectDir: () => ws, ...pathDeps });
    const rejection = await recurrenceEscalationGuard({
      projectId: "p-1",
      task: snapshot("t-src"),
      findRecurrenceCandidates: faces.findRecurrenceCandidates,
      modelingReportPresent: faces.modelingReportPresent,
    });
    const release = rejection?.failure.violations.find((v) => v.startsWith("release:")) ?? "";
    expect(release).toContain(".forge/docs/probes/<bugId>/");
    expect(release).not.toContain("proposals/");
  });
});
