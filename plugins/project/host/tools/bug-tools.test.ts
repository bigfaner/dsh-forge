// bug 四 tool 单测（plugin-project bug 工具面）：参数防御收窄 + cwd→projectId 路由
// （typed ERR_WORKSPACE_NOT_REGISTERED）+ 服务缝透传（session 键注入/缺席降级）+ 返回面
// 形状（{cards} 对象包装——bug d8374afd 同族教训：裸数组被 output schema 拒）。
import { describe, expect, it, vi } from "vitest";
import { normalizeFsPath } from "@dsh-forge/lib-path";
import { createBugTools, type BugToolDefinition } from "./bug-tools.js";
import { WorkspaceNotRegisteredError } from "./session.js";
import type { BugCard, BugsServicePort, RegisterBugResult } from "@dsh-forge/lib-api";

const cardOf = (bugId: string, over: Partial<BugCard> = {}): BugCard => ({
  bugId,
  summary: `bug ${bugId}`,
  bugDesc: "desc",
  triggerDesc: "trigger",
  expected: "expected",
  actual: "actual",
  bugStatus: "open",
  reporter: "tester",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

/** BugsServicePort 桩（只实现四工具消费面） */
function bugsStub(): BugsServicePort & {
  registerBug: ReturnType<typeof vi.fn>;
  resolveBug: ReturnType<typeof vi.fn>;
  getBug: ReturnType<typeof vi.fn>;
  listBugs: ReturnType<typeof vi.fn>;
} {
  const registerBug = vi.fn().mockResolvedValue({ card: cardOf("b1"), errorTypeSuggestions: ["race-condition"] } satisfies RegisterBugResult);
  const resolveBug = vi.fn().mockResolvedValue(cardOf("b1", { bugStatus: "fixed", commitHash: "abc1234" }));
  const getBug = vi.fn().mockResolvedValue({ card: cardOf("b1") });
  const listBugs = vi.fn().mockResolvedValue([cardOf("b1"), cardOf("b2")]);
  return { registerBug, resolveBug, getBug, listBugs } as unknown as ReturnType<typeof bugsStub>;
}

/** 装配 + 会话桩（cwd = Z:\proj ↔ projectId = p1） */
function harness() {
  const stub = bugsStub();
  const deps = { bugs: () => stub, resolveProjectId: (cwd: string) => (normalizeFsPath(cwd) === "z:/proj" ? "p1" : undefined) };
  const tools = Object.fromEntries(createBugTools(deps).map((t) => [t.name, t])) as Record<string, BugToolDefinition>;
  const exec = (cwd = "Z:\\proj", sessionId = "s1") => ({
    agent: { session: { id: sessionId, header: { cwd } } },
  });
  return { stub, tools, exec };
}

describe("bug 工具族装配", () => {
  it("四员注册名 = worker allowlist 三名词 + list_bugs（snake_case 单源锚）", () => {
    expect(createBugTools({ bugs: () => bugsStub(), resolveProjectId: () => "p1" }).map((t) => t.name)).toEqual([
      "record_bug",
      "resolve_bug",
      "get_bug",
      "list_bugs",
    ]);
  });
});

describe("record_bug", () => {
  it("五必填 + 会话键注入 + 可选字段映射（suspected→suspected / error_type→errorType）", async () => {
    const { stub, tools, exec } = harness();
    const r = (await tools["record_bug"].execute(
      { summary: "s", bug_desc: "d", trigger_desc: "t", expected: "e", actual: "a", suspected: "f.ts:1", error_type: "race-condition", recurrence_of: "b0" },
      exec("Z:\\proj", "s9"),
    )) as RegisterBugResult;
    expect(r.card.bugId).toBe("b1");
    expect(stub.registerBug).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        summary: "s",
        suspected: "f.ts:1",
        errorType: "race-condition",
        recurrenceOf: "b0",
        reportSessionId: "s9",
      }),
    );
  });

  it("非 agent 会话（空 sessionId）= reportSessionId 键缺席降级", async () => {
    const { stub, tools, exec } = harness();
    await tools["record_bug"].execute({ summary: "s", bug_desc: "d", trigger_desc: "t", expected: "e", actual: "a" }, exec("Z:\\proj", ""));
    expect(stub.registerBug).toHaveBeenCalledWith(expect.not.objectContaining({ reportSessionId: expect.anything() }));
  });

  it("cwd 无匹配项目 → typed ERR_WORKSPACE_NOT_REGISTERED；summary 空串拒", async () => {
    const { tools, exec } = harness();
    const base = { bug_desc: "d", trigger_desc: "t", expected: "e", actual: "a" };
    await expect(tools["record_bug"].execute({ summary: "s", ...base }, exec("Z:\\other"))).rejects.toBeInstanceOf(WorkspaceNotRegisteredError);
    await expect(tools["record_bug"].execute({ summary: "", ...base }, exec())).rejects.toThrow(/summary/);
  });
});

describe("resolve_bug", () => {
  it("fixed 分支透传 commit_hash/fix_approach + fixSessionId；unresolved 分支透传 reason", async () => {
    const { stub, tools, exec } = harness();
    await tools["resolve_bug"].execute({ bug_id: "b1", outcome: "fixed", commit_hash: "abc1234", fix_approach: "approach" }, exec());
    expect(stub.resolveBug).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: "p1", bugId: "b1", outcome: "fixed", commitHash: "abc1234", fixApproach: "approach", fixSessionId: "s1" }));
    await tools["resolve_bug"].execute({ bug_id: "b1", outcome: "unresolved", unresolved_reason: "cannot repro" }, exec());
    expect(stub.resolveBug).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "unresolved", unresolvedReason: "cannot repro" }));
  });

  it("output 形状 = {card} 对象包装（bug aac1a701：裸 card 与 output schema 漂移）", async () => {
    const { tools, exec } = harness();
    const r = (await tools["resolve_bug"].execute({ bug_id: "b1", outcome: "fixed", commit_hash: "abc1234" }, exec())) as { card?: BugCard };
    expect("card" in r).toBe(true);
    expect(r.card?.bugStatus).toBe("fixed");
  });

  it("outcome 词表外拒", async () => {
    const { tools, exec } = harness();
    await expect(tools["resolve_bug"].execute({ bug_id: "b1", outcome: "wontfix" }, exec())).rejects.toThrow(/outcome/);
  });
});

describe("get_bug / list_bugs", () => {
  it("get_bug 透传 bug_id", async () => {
    const { stub, tools, exec } = harness();
    await tools["get_bug"].execute({ bug_id: "b1" }, exec());
    expect(stub.getBug).toHaveBeenCalledWith({ projectId: "p1", bugId: "b1" });
  });

  it("list_bugs 返回 {cards} 对象 + status/sort 词表与分页透传", async () => {
    const { stub, tools, exec } = harness();
    const r = (await tools["list_bugs"].execute({ status: ["open", "fixed"], sort: "created", offset: 1, limit: 5 }, exec())) as { cards: unknown[] };
    expect(Array.isArray(r)).toBe(false);
    expect(r.cards).toHaveLength(2);
    expect(stub.listBugs).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p1", status: ["open", "fixed"], sort: "created", offset: 1, limit: 5 }));
  });

  it("status/sort 词表外与负 offset 拒", async () => {
    const { tools, exec } = harness();
    await expect(tools["list_bugs"].execute({ status: ["doing"] }, exec())).rejects.toThrow(/status/);
    await expect(tools["list_bugs"].execute({ sort: "newest" }, exec())).rejects.toThrow(/sort/);
    await expect(tools["list_bugs"].execute({ offset: -1 }, exec())).rejects.toThrow(/offset/);
  });
});

describe("render 面", () => {
  it("成功值投影 ✓ 文本；list 空集投影 (no matching bugs)", () => {
    const { tools } = harness();
    const list = tools["list_bugs"].output.render({}, { cards: [] });
    expect(list[0].text).toContain("(no matching bugs)");
    const rec = tools["record_bug"].output.render({}, { card: cardOf("b1"), errorTypeSuggestions: [] });
    expect(rec[0].text).toContain("✓ Bug registered (open)");
  });
});
