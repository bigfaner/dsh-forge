// summon-session 单测（fix-9 返工：[召唤] = 经官方缝打开/切换 HR 预设官方会话）：
// workspace 锚取值径（同参同源 D4）+ openSummonSession 编排逐阶段（锚缺席降级引导 /
// openWorkspace 失败 / beforeOpen 被取代 / HR 预设被拒引导 / 成功），mock 平台窄面。
// 降级条阶段化文案口径（fix-14）：create/preset 阶段呈现用户可读人话文案，原始错误
// 细节降级到 console.error 留痕，不直出 error.message 原文。

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HR_PRESET_ID,
  openSummonSession,
  summonWorkspaceOf,
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

describe("summonWorkspaceOf（workspace 锚——与面板 list workspace 参数同参同源）", () => {
  it("取首个带 path 的行（workspaceId 随行递达）；无 path 行跳过", () => {
    const row = summonWorkspaceOf({
      items: [{ workspaceId: "ws-0" }, { workspaceId: "ws-1", path: "Z:/a" }],
    });
    expect(row).toEqual({ workspaceId: "ws-1", path: "Z:/a" });
  });

  it("快照缺席/形状漂移/零带 path 行 = undefined", () => {
    expect(summonWorkspaceOf(undefined)).toBeUndefined();
    expect(summonWorkspaceOf({})).toBeUndefined();
    expect(summonWorkspaceOf({ items: [{ workspaceId: "ws-1" }] })).toBeUndefined();
  });
});

describe("openSummonSession 编排（openSessionWithPreset 同构最小面）", () => {
  it("成功：openWorkspace → selectPreset('hr')，返回会话 id 与 presetApplied", async () => {
    const p = platform({});
    const outcome = await openSummonSession(p, ROW);
    expect(outcome).toEqual({ ok: true, sessionId: "sess-1", presetApplied: true });
    expect(p.calls).toEqual(["openWorkspace", `selectPreset:sess-1:${HR_PRESET_ID}`]);
    expect(HR_PRESET_ID).toBe("hr");
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
        expect(outcome.message).toContain("召唤会话打开失败");
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

  it("HR 预设被拒 = preset 阶段人话引导（装配提示，拒绝细节 console 留痕不直出）", async () => {
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
        expect(outcome.message).toContain("preset-hr");
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
        expect(outcome.message).toContain("HR 预设切换失败");
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
