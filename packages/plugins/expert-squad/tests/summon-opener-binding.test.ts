// summon-opener-binding 单测（bug 9d9d1bd3——召唤必败：官方服务方法被剥成裸函数引用，
// platform.openWorkspace(...) 调用时 this 绑定到平台字面量，官方实现首行 this.ctx.layout
// 抛 TypeError → 降级条「召唤会话打开失败」恒现）。同成因复现：官方服务方法以 this 依赖
// 形态在场（镜像官方 client.js openWorkspace 首行 AbortSignal.any([this.ctx.layout...])），
// 经 summonOpenerOf 真实装配路径调用——修复前必败（this 脱绑），修复后（保 receiver）
// 必过。语境注记：open-session.ts:377 先例 = face 内经成员访问调用保 receiver；
// 本处经 platform 字面量，故 .call 显式保 receiver——同一机制两处落地。

import { describe, expect, it } from "vitest";
import { summonOpenerOf } from "../src-client/index.js";
import type { SummonWorkspaceRow } from "../src-client/panel/summon-session.js";

const ROW: SummonWorkspaceRow = { workspaceId: "ws-1", path: "Z:/proj/demo" };

/** 官方服务镜像：方法体真实消费 this（与官方 openWorkspace 首行 this.ctx.layout 同形）。 */
function officialUiWorkspaceLike() {
  return {
    ctx: { layout: { beginNavigation: () => new AbortController().signal } },
    openWorkspace(this: { ctx: { layout: { beginNavigation(): AbortSignal } } }, workspaceId: string, beforeOpen?: (id: string) => void): Promise<void> {
      // 官方同形首行：this 脱绑即抛 TypeError: Cannot read properties of undefined (reading 'layout')
      void this.ctx.layout.beginNavigation();
      beforeOpen?.(`sess-${workspaceId}`);
      return Promise.resolve();
    },
  };
}

function officialAgentPresetsLike() {
  // reflect.get("remote") 返回 remote 命名空间本体（agentPresets 直挂其上——官方形状）。
  return {
    agentPresets: {
      select(this: unknown, _sessionId: string, presetId: string) {
        // this 依赖形态在场（官方 select 消费 this 面同险）；本断言聚焦 receiver 保持
        if (this === undefined) throw new TypeError("select unbound");
        return Promise.resolve({ ok: true, value: presetId } as const);
      },
    },
  };
}

function fakeCtx(uiWorkspace: unknown, remoteNamespace: unknown) {
  return {
    reflect: {
      get(name: string): unknown {
        if (name === "uiWorkspace") return uiWorkspace;
        if (name === "remote") return remoteNamespace;
        return undefined;
      },
    },
  };
}

describe("summonOpenerOf 装配保 receiver（bug 9d9d1bd3——this 脱绑召唤必败）", () => {
  it("官方服务方法以 this 依赖形态在场时，召唤成功而非降级条", async () => {
    const uiWorkspace = officialUiWorkspaceLike();
    const remote = officialAgentPresetsLike();
    const outcome = await summonOpenerOf(fakeCtx(uiWorkspace, remote))(ROW);
    expect(outcome).toEqual({ ok: true, sessionId: "sess-ws-1", presetApplied: true });
  });

  it("selectPreset 同险：select 以方法形态被调（this 保持官方服务对象）", async () => {
    const uiWorkspace = officialUiWorkspaceLike();
    const remote = officialAgentPresetsLike();
    const presetNs = remote.agentPresets;
    let receivedThisIsNamespace = false;
    presetNs.select = function (this: unknown, _sessionId: string, presetId: string) {
      receivedThisIsNamespace = this === presetNs;
      return Promise.resolve({ ok: true, value: presetId } as const);
    };
    const outcome = await summonOpenerOf(fakeCtx(uiWorkspace, remote))(ROW);
    expect(outcome.ok).toBe(true);
    expect(receivedThisIsNamespace).toBe(true);
  });
});
