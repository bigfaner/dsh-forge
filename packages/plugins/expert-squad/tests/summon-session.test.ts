// summon-session 单测（fix-9 返工：[召唤] = 经官方缝打开/切换 HR 预设官方会话）：
// workspace 锚取值径（同参同源 D4）+ openSummonSession 编排逐阶段（锚缺席降级引导 /
// openWorkspace 失败 / beforeOpen 被取代 / HR 预设被拒引导 / 成功），mock 平台窄面。

import { describe, expect, it } from "vitest";
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

  it("openWorkspace 抛错 = create 阶段失败（fail-soft，消息含原因）", async () => {
    const p = platform({
      openWorkspace: async () => {
        throw new Error("unknown workspace");
      },
    });
    const outcome = await openSummonSession(p, ROW);
    expect(outcome).toMatchObject({ ok: false, stage: "create" });
    if (!outcome.ok) expect(outcome.message).toContain("unknown workspace");
  });

  it("beforeOpen 被后续导航取代 = create 阶段失败（官方语义口径）", async () => {
    const p = platform({ openWorkspace: async () => undefined });
    const outcome = await openSummonSession(p, ROW);
    expect(outcome).toMatchObject({ ok: false, stage: "create" });
  });

  it("HR 预设被拒 = preset 阶段降级引导（文案含 preset-hr 装配提示）", async () => {
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
      expect(outcome.message).toContain("not installed");
      expect(outcome.message).toContain("preset-hr");
    }
  });

  it("selectPreset 抛错 = preset 阶段失败（fail-soft）", async () => {
    const p = platform({
      selectPreset: async () => {
        throw new Error("remote down");
      },
    });
    const outcome = await openSummonSession(p, ROW);
    expect(outcome).toMatchObject({ ok: false, stage: "preset" });
    if (!outcome.ok) expect(outcome.message).toContain("remote down");
  });
});
