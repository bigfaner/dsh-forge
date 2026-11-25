// tool-whitelist —— agent/created 白名单落定面测试（2026-11-25 宿主崩溃判例的回归守卫）：
// 监听器抛错 = agent 创建事务回滚 = 宿主 fatal；返回 Promise = unhandled rejection 同样 fatal。
// 本面钉住：① 任何载荷形态零外抛、零 Promise；② 非专家子会话零动作（非介入面零行为差异）；
// ③ 专家子会话：restrict 落子 agent scope、allow = 台账原样、disposer 挂子 agent 生命周期；
// ④ fail-open：tools 服务缺席 / restrict 抛错 → 不落白名单（全集）+ diag warn 留痕。

import { describe, expect, it, vi } from "vitest";
import { applyExpertToolWhitelist, type AllowLookup } from "../host/tool-whitelist.js";

const ALLOW: readonly string[] = ["read", "grep", "knowledge_search"];

function allowOf(table: Record<string, readonly string[]> = { "code-reviewer": ALLOW }): AllowLookup {
  return (key) => (key === undefined ? undefined : table[key]);
}

/** 子 agent 切片工厂（restrict 调用可观测；effect 捕获 disposer 供生命周期断言）。 */
function makeAgent(opts?: { preset?: string; withTools?: boolean; restrictThrows?: Error; withEffect?: boolean }) {
  const restrictCalls: object[] = [];
  const effects: Array<{ factory: () => () => void; label?: string }> = [];
  let lifts = 0;
  const tools = opts?.withTools === false
    ? undefined
    : {
        restrict(filter: object) {
          if (opts?.restrictThrows) throw opts.restrictThrows;
          restrictCalls.push(filter);
          return () => {
            lifts += 1;
          };
        },
      };
  const ctx = { ...(tools ? { tools } : {}), ...(opts?.withEffect === false ? {} : { effect: (factory: () => () => void, label?: string) => { effects.push({ factory, label }); return factory(); } }) };
  return { agent: { session: { header: { agentPreset: opts?.preset ?? "code-reviewer" } }, ctx }, restrictCalls, effects, lifts: () => lifts };
}

describe("applyExpertToolWhitelist（专家子会话）", () => {
  it("专家子会话：restrict 落子 agent ctx.tools，allow = 台账原样（拷贝，不共享引用）", () => {
    const { agent, restrictCalls } = makeAgent();
    const diag = vi.fn();
    const out = applyExpertToolWhitelist({ agent }, allowOf(), diag);
    expect(out).toBe("applied");
    expect(restrictCalls).toHaveLength(1);
    const filter = restrictCalls[0] as { allow: string[] };
    expect(filter.allow).toEqual([...ALLOW]);
    expect(filter.allow).not.toBe(ALLOW); // 拷贝——台账只读
    expect(diag).not.toHaveBeenCalled();
  });

  it("disposer 挂子 agent 生命周期（childCtx.effect——随子 agent 回收；不挂 host 层）", () => {
    const { agent, effects, lifts } = makeAgent();
    applyExpertToolWhitelist({ agent }, allowOf(), vi.fn());
    expect(effects).toHaveLength(1);
    expect(effects[0]!.label).toBe("expert-squad: tool whitelist");
    expect(lifts()).toBe(0); // 未回收
    effects[0]!.factory()(); // 模拟子 agent 生命周期结束
    expect(lifts()).toBe(1);
  });

  it("childCtx.effect 缺席：restrict 仍落（disposer 不挂——白名单随 scope 层自然回收）", () => {
    const { agent, restrictCalls } = makeAgent({ withEffect: false });
    const out = applyExpertToolWhitelist({ agent }, allowOf(), vi.fn());
    expect(out).toBe("applied");
    expect(restrictCalls).toHaveLength(1);
  });
});

describe("applyExpertToolWhitelist（非专家子会话——零动作）", () => {
  const nonExpertPayloads: Record<string, unknown> = {
    "payload undefined": undefined,
    "payload null": null,
    "payload.agent 缺席": {},
    "session 缺席": { agent: { ctx: { tools: { restrict: () => () => {} } } } },
    "header 缺席": { agent: { session: {}, ctx: {} } },
    "主会话（Forge）": { agent: makeAgent({ preset: "Forge" }).agent },
    "猎头模式子会话": { agent: makeAgent({ preset: "headhunter" }).agent },
    "官方 standard": { agent: makeAgent({ preset: "standard" }).agent },
    "task worker（继承 Forge）": { agent: makeAgent({ preset: "Forge" }).agent },
    "未注册专家键": { agent: makeAgent({ preset: "ghost-expert" }).agent },
  };

  it.each(Object.entries(nonExpertPayloads))("%s → not-expert，restrict 未调用，零 diag", (_name, payload) => {
    const diag = vi.fn();
    const lookup = vi.fn(allowOf());
    const tools = (payload as { agent?: { ctx?: { tools?: { restrict?: unknown } } } })?.agent?.ctx?.tools;
    const restrictSpy = vi.fn(() => () => {});
    if (tools) (tools as { restrict: unknown }).restrict = restrictSpy;
    const out = applyExpertToolWhitelist(payload, lookup, diag);
    expect(out).toBe("not-expert");
    expect(restrictSpy).not.toHaveBeenCalled();
    expect(diag).not.toHaveBeenCalled();
  });

  it("台账空名单（[]）= not-expert（不落空白 allow——官方 empty-filter 守卫会抛）", () => {
    const { agent, restrictCalls } = makeAgent();
    const out = applyExpertToolWhitelist({ agent }, allowOf({ "code-reviewer": [] }), vi.fn());
    expect(out).toBe("not-expert");
    expect(restrictCalls).toHaveLength(0);
  });
});

describe("applyExpertToolWhitelist（畸形载荷与 fail-open——崩溃判例回归）", () => {
  it("agent.ctx 缺失（2026-11-25 崩溃形态）→ no-tools-service + warn，零外抛", () => {
    const diag = vi.fn();
    const out = applyExpertToolWhitelist({ agent: { session: { header: { agentPreset: "code-reviewer" } } } }, allowOf(), diag);
    expect(out).toBe("no-tools-service");
    expect(diag).toHaveBeenCalledWith("expert-squad-whitelist-no-tools", expect.any(String));
  });

  it("agent.tools 直挂（Agent 本体挂服务的误写形态）→ 仍按 ctx.tools 取 → no-tools-service", () => {
    const diag = vi.fn();
    const out = applyExpertToolWhitelist({ agent: { session: { header: { agentPreset: "code-reviewer" } }, tools: { restrict: () => () => {} }, ctx: {} } }, allowOf(), diag);
    expect(out).toBe("no-tools-service");
  });

  it("ctx.tools.schemas 之类无关面不触达——只调 restrict", () => {
    const { agent } = makeAgent();
    (agent.ctx.tools as Record<string, unknown>).schemas = () => {
      throw new Error("must not be called");
    };
    const out = applyExpertToolWhitelist({ agent }, allowOf(), vi.fn());
    expect(out).toBe("applied");
  });

  it("restrict 抛错（未知名 fail-loud）→ failed + warn 留痕，不外抛（该会话 fail-open 全集）", () => {
    const { agent } = makeAgent({ restrictThrows: new Error('tools.restrict() names unknown global tool "xyz"') });
    const diag = vi.fn();
    const out = applyExpertToolWhitelist({ agent }, allowOf(), diag);
    expect(out).toBe("failed");
    expect(diag).toHaveBeenCalledWith("expert-squad-whitelist-fail", expect.stringContaining("unknown global tool"));
  });

  it("effect 抛错 → failed + warn（restrict 已落但 disposer 未挂——不炸创建事务）", () => {
    const { agent } = makeAgent();
    agent.ctx.effect = () => {
      throw new Error("effect boom");
    };
    const diag = vi.fn();
    const out = applyExpertToolWhitelist({ agent }, allowOf(), diag);
    expect(out).toBe("failed");
    expect(diag).toHaveBeenCalledWith("expert-squad-whitelist-fail", expect.stringContaining("effect boom"));
  });

  it("allowOf 抛错 → failed + warn（台账读面异常不外溢）", () => {
    const diag = vi.fn();
    const out = applyExpertToolWhitelist(
      { agent: makeAgent().agent },
      () => {
        throw new Error("ledger boom");
      },
      diag,
    );
    expect(out).toBe("failed");
    expect(diag).toHaveBeenCalledWith("expert-squad-whitelist-fail", expect.stringContaining("ledger boom"));
  });

  it("diag 自身抛错 → 仍零外抛且处置结果正确（最后一道防线——no-tools 分支的 diag 在 try 内，抛错不得穿出）", () => {
    const diag = (): void => {
      throw new Error("diag boom");
    };
    const a = applyExpertToolWhitelist({ agent: makeAgent({ withTools: false }).agent }, allowOf(), diag);
    const b = applyExpertToolWhitelist({ agent: makeAgent({ restrictThrows: new Error("x") }).agent }, allowOf(), diag);
    const c = applyExpertToolWhitelist({ agent: makeAgent().agent }, allowOf(), diag); // 成功路径不调 diag
    expect([a, b, c]).toEqual(["no-tools-service", "failed", "applied"]);
  });

  it("任何分支都不返回 Promise（监听器 async 化 = unhandled rejection 致宿主 fatal）", () => {
    const returns = [
      applyExpertToolWhitelist(undefined, allowOf(), vi.fn()),
      applyExpertToolWhitelist({ agent: makeAgent().agent }, allowOf(), vi.fn()),
      applyExpertToolWhitelist({ agent: makeAgent({ withTools: false }).agent }, allowOf(), vi.fn()),
      applyExpertToolWhitelist({ agent: makeAgent({ restrictThrows: new Error("x") }).agent }, allowOf(), vi.fn()),
    ];
    for (const r of returns) {
      const isPromise = r !== undefined && typeof (r as PromiseLike<unknown>).then === "function";
      expect(isPromise).toBe(false);
    }
  });
});
