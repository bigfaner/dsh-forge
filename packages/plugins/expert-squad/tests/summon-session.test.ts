// summon-session 单测（fix-9 返工：[唤唤] = 经官方缝打开/切换猎头模式预设官方会话）：
// workspace 锚取值径（同参同源 D4）+ openSummonSession 编排逐阶段（锚缺席降级引导 /
// openWorkspace 失败 / beforeOpen 被取代 / 猎头预设被拒引导 / 成功），mock 平台窄面。
// 降级条阶段化文案口径（fix-14）：create/preset 阶段呈现用户可读人话文案，原始错误
// 细节降级到 console.error 留痕，不直出 error.message 原文。

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HEADHUNTER_PRESET_ID,
  mainViewSessionIdOf,
  openSummonSession,
  summonWorkspaceOf,
  summonWorkspaceRowOf,
  type SummonPresetSelectResult,
  type SummonPlatform,
} from "../src-client/panel/summon-session.js";

function platform(overrides: {
  openWorkspace?: SummonPlatform["openWorkspace"];
  selectPreset?: SummonPlatform["selectPreset"];
}): SummonPlatform & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    openWorkspace:
      overrides.openWorkspace ??
      (async (_workspaceId, beforeOpen) => {
        calls.push("openWorkspace");
        beforeOpen?.("sess-1");
      }),
    selectPreset:
      overrides.selectPreset ??
      (async (sessionId, presetId) => {
        calls.push(`selectPreset:${sessionId}:${presetId}`);
        return { ok: true, value: presetId } as const;
      }),
  };
}

const ROW = { workspaceId: "ws-1", path: "Z:/proj/demo" };

describe("summonWorkspaceOf（单库兜底取值径——仅无锚时消费）", () => {
  it("唯一带 path 的行 = 兜底返回（workspaceId 随行递达）；无 path 行跳过", () => {
    const row = summonWorkspaceOf({
      items: [{ workspaceId: "ws-0" }, { workspaceId: "ws-1", path: "Z:/a" }],
    });
    expect(row).toEqual({ workspaceId: "ws-1", path: "Z:/a" });
  });

  it("多带 path 行 = undefined（不猜）；快照缺席/形状漂移/零带 path 行 = undefined", () => {
    expect(
      summonWorkspaceOf({ items: [{ workspaceId: "ws-1", path: "Z:/a" }, { workspaceId: "ws-2", path: "Z:/b" }] }),
    ).toBeUndefined();
    expect(summonWorkspaceOf(undefined)).toBeUndefined();
    expect(summonWorkspaceOf({})).toBeUndefined();
    expect(summonWorkspaceOf({ items: [{ workspaceId: "ws-1" }] })).toBeUndefined();
  });
});

describe("summonWorkspaceRowOf（主视图会话锚取值径——formal-verifier 评审 2026-11-01 判据）", () => {
  // 多行快照：行序刻意「首行非锚」——固化现 bug（旧实现取 items 首行）不再复发
  const WORKSPACES = {
    items: [
      { workspaceId: "ws-b", path: "Z:/proj/b", sessionIds: ["s-b"] },
      { workspaceId: "ws-a", path: "Z:/proj/a", sessionIds: ["s-a1", "s-a2"] },
      { workspaceId: "ws-nopath", sessionIds: ["s-np"] },
    ],
  };

  it("锚归属行命中：mainView 会话 ∈ 行 2.sessionIds → 返回行 2（不再取首行）", () => {
    const sessions = { byId: { "s-a1": { retainedBy: { mainView: 1 } } } };
    expect(summonWorkspaceRowOf(sessions, WORKSPACES)).toEqual(WORKSPACES.items[1]);
  });

  it("锚在场但无归属行（workspace 已删）= undefined（引导，不落单库兜底）", () => {
    const sessions = { byId: { "s-gone": { retainedBy: { mainView: 1 } } } };
    expect(summonWorkspaceRowOf(sessions, WORKSPACES)).toBeUndefined();
  });

  it("mainView 计数 0 = 非锚", () => {
    const sessions = { byId: { "s-b": { retainedBy: { mainView: 0 } } } };
    expect(summonWorkspaceRowOf(sessions, WORKSPACES)).toBeUndefined();
  });

  it("锚缺席 + 清单唯一带 path 行 = 单库兜底（该行）", () => {
    const workspaces = { items: [{ workspaceId: "ws-1", path: "Z:/only", sessionIds: [] }] };
    expect(summonWorkspaceRowOf({ byId: {} }, workspaces)).toEqual(workspaces.items[0]);
  });

  it("锚缺席 + 多带 path 行 = undefined（不猜，降级引导）", () => {
    expect(summonWorkspaceRowOf(undefined, WORKSPACES)).toBeUndefined();
    expect(summonWorkspaceRowOf({ byId: undefined }, WORKSPACES)).toBeUndefined();
  });

  it("会话快照形状漂移 = 视同无锚（走兜底径，不抛）", () => {
    expect(summonWorkspaceRowOf("garbage", WORKSPACES)).toBeUndefined();
    expect(mainViewSessionIdOf(undefined)).toBeUndefined();
    expect(mainViewSessionIdOf({ byId: { s: undefined } })).toBeUndefined();
  });

  it("mainViewSessionIdOf：多会话取 mainView 计数 > 0 的首个命中", () => {
    expect(
      mainViewSessionIdOf({
        byId: {
          "s-x": { retainedBy: { mainView: 0 } },
          "s-y": { retainedBy: { mainView: 2 } },
        },
      }),
    ).toBe("s-y");
  });
});

describe("openSummonSession 编排（openSessionWithPreset 同构最小面）", () => {
  it("成功：openWorkspace → selectPreset('headhunter')，返回会话 id 与 presetApplied", async () => {
    const p = platform({});
    const outcome = await openSummonSession(p, ROW);
    expect(outcome).toEqual({ ok: true, sessionId: "sess-1", presetApplied: true });
    expect(p.calls).toEqual(["openWorkspace", `selectPreset:sess-1:${HEADHUNTER_PRESET_ID}`]);
    expect(HEADHUNTER_PRESET_ID).toBe("headhunter");
  });

  it("workspace 锚无 workspaceId = 阶段化降级引导（不弹选择器不空绑定）", async () => {
    const p = platform({});
    const outcome = await openSummonSession(p, { path: "Z:/proj/demo" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stage).toBe("workspace");
      expect(outcome.message).toContain("未找到当前打开的工作区");
    }
    expect(p.calls).toEqual([]);
  });

  it("openWorkspace 抛错 = create 阶段失败（人话文案，原始错误 console 留痕不直出）", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const p = platform({
        openWorkspace: async () => {
          throw new TypeError("Cannot read properties of undefined (reading 'client')");
        },
      });
      const outcome = await openSummonSession(p, ROW);
      expect(outcome).toMatchObject({ ok: false, stage: "create" });
      if (!outcome.ok) {
        expect(outcome.message).toContain("寻访会话打开失败");
        expect(outcome.message).not.toContain("Cannot read properties");
      }
      expect(errSpy).toHaveBeenCalled();
      expect(String(errSpy.mock.calls.flat().join(" "))).toContain("Cannot read properties");
    } finally {
      errSpy.mockRestore();
    }
  });

  it("beforeOpen 被后续导航取代 = create 阶段失败（官方语义口径）", async () => {
    const p = platform({ openWorkspace: async () => undefined });
    const outcome = await openSummonSession(p, ROW);
    expect(outcome).toMatchObject({ ok: false, stage: "create" });
  });

  it("猎头预设被拒 = preset 阶段人话引导（装配提示，拒绝细节 console 留痕不直出）", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const p = platform({
        selectPreset: async () =>
          ({
            ok: false,
            error: { message: "preset not found", details: { reason: "not installed" } },
          }) as SummonPresetSelectResult,
      });
      const outcome = await openSummonSession(p, ROW);
      expect(outcome).toMatchObject({ ok: false, stage: "preset" });
      if (!outcome.ok) {
        expect(outcome.message).toContain("preset-headhunter");
        expect(outcome.message).toContain("已装配");
        expect(outcome.message).not.toContain("not installed");
        expect(outcome.message).not.toContain("preset not found");
      }
      expect(errSpy).toHaveBeenCalled();
      expect(String(errSpy.mock.calls.flat().join(" "))).toContain("not installed");
    } finally {
      errSpy.mockRestore();
    }
  });

  it("selectPreset 抛错 = preset 阶段失败（人话文案，原始错误 console 留痕不直出）", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const p = platform({
        selectPreset: async () => {
          throw new TypeError("remote of undefined is not a function");
        },
      });
      const outcome = await openSummonSession(p, ROW);
      expect(outcome).toMatchObject({ ok: false, stage: "preset" });
      if (!outcome.ok) {
        expect(outcome.message).toContain("猎头模式预设切换失败");
        expect(outcome.message).not.toContain("is not a function");
      }
      expect(errSpy).toHaveBeenCalled();
      expect(String(errSpy.mock.calls.flat().join(" "))).toContain("is not a function");
    } finally {
      errSpy.mockRestore();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
