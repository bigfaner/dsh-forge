// @vitest-environment happy-dom
// mini-composer 挂载接线测试（真实 DOM 链路——apply 正门 createRoot 替身容器）。
// bug ba885f7d：④ 全屏门控（非全屏不常驻）/ ② 装配序兜底（inject scope 接线）/
// ⑤ inputTriggers 接线 / ④ ⧉ exitFullscreen 官方径。
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import { superComposerClient } from "../src/client/index.js";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** 全屏呈现源标记（tracker DOM 兜底读数——在场 = 替身可见；兼 dockkit pane 供 ⧉ target 捕获）。 */
function setFullscreenMarker(on: boolean): void {
  document.querySelectorAll("[data-sidebar-right-panel]").forEach((el) => el.remove());
  if (on) {
    const pane = document.createElement("div");
    pane.setAttribute("data-dockkit-pane", "");
    document.body.appendChild(pane);
    // 先插入后打标：attribute mutation 发生在插入后，MutationObserver 才会扇出
    pane.setAttribute("data-sidebar-right-panel", "fullscreen");
  }
}

const menuStore = {
  open: false,
  groups: [],
  highlight: null,
  listeners: new Set<() => void>(),
  getSnapshot(): { open: boolean; groups: never[]; highlight: null } {
    return { open: menuStore.open, groups: [], highlight: null };
  },
  subscribe(listener: () => void): () => void {
    menuStore.listeners.add(listener);
    return () => menuStore.listeners.delete(listener);
  },
};

const triggersStub = {
  sessionOf: () => ({
    menu: menuStore,
    track: () => undefined,
    arbitrate: () => "pass" as const,
    pick: () => undefined,
    dismiss: () => undefined,
  }),
};

const sidebarRightCalls: string[] = [];
const capturedTargets: unknown[] = [];
const sidebarRightStub = {
  commandTarget: (el: Element | null) => {
    capturedTargets.push(el);
    return el === null ? null : { pane: "p1" };
  },
  toggleFullscreen: () => sidebarRightCalls.push("toggle"),
};

/** 在留会话 + 官方 conversation.input 面（state store 可订阅——draft 投影供给链）。 */
const stateListeners = new Set<() => void>();
const inputState = {
  draft: "",
  draftRev: 0,
  phase: "plain" as const,
  occurrences: [],
  getSnapshot() {
    return inputState;
  },
  subscribe(listener: () => void): () => void {
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  },
};
const sessionsLiveWithInput = {
  list: { getSnapshot: () => ({ byId: { s1: { id: "s1", retainedBy: { mainView: 1 } } } }) },
  binding: () => ({
    sessionId: "s1",
    ctx: {},
    eventSource: {
      getSnapshot: () => ({ entries: [] }),
      subscribe: () => () => undefined,
    },
  }),
};

function stubCtx(options: { sessions?: unknown; inject?: boolean } = {}): Context {
  const effects: Array<() => unknown> = [];
  const ctx: Record<string, unknown> = {
    effect: (execute: () => unknown) => {
      effects.push(execute);
      return undefined;
    },
  };
  // inject:true = 模拟真机 provide 晚于 apply——ctx 不直挂 sessions（快路径不触发）
  if (options.sessions !== undefined && options.inject !== true) ctx.sessions = options.sessions;
  if (options.inject === true) {
    ctx.inject = (names: readonly string[], cb: (scope: unknown) => void) => {
      // provide 晚于 apply：注入 scope 承载服务切片
      cb({ sessions: options.sessions, inputTriggers: triggersStub, sidebarRight: sidebarRightStub });
      return undefined;
    };
  }
  (ctx as { __effects: Array<() => unknown> }).__effects = effects;
  return ctx as unknown as Context;
}

const sessionsStub = {
  list: { getSnapshot: () => ({ byId: {} }) },
  binding: () => undefined,
};

/** 带在留会话的 sessions 替身（durable user message → 卡 active → 标题栏/⧉ 在场）。 */
const sessionsWithMessage = {
  list: { getSnapshot: () => ({ byId: { s1: { id: "s1", retainedBy: { mainView: 1 } } } }) },
  binding: () => ({
    sessionId: "s1",
    ctx: {},
    eventSource: {
      getSnapshot: () => ({
        entries: [{ type: "event", event: { type: "user/message", data: { id: "m1", content: [{ type: "text", text: "hello" }] } } }],
      }),
      subscribe: () => () => undefined,
    },
  }),
};

/** 用例间隔离：摘除上一用例残留替身容器（mount 容器无锚——按 dscf-root 父链清理）。 */
afterEach(() => {
  document.querySelectorAll('[data-testid="dscf-root"]').forEach((el) => el.parentElement?.remove());
  setFullscreenMarker(false);
});

describe("bug 1ab2f4e6: apply 提供 superComposer 服务（cordis reflect.provide——quote-reference 全屏聚焦缝组合面）", () => {
  function ctxWithReflect(options: { sessions?: unknown } = {}): Context {
    const ctx = stubCtx(options) as unknown as Record<string, unknown>;
    const provided: Record<string, unknown> = {};
    ctx.reflect = {
      provide: (name: string, value?: unknown) => {
        provided[name] = value;
        return () => undefined;
      },
      get: (name: string) => provided[name],
    };
    (ctx as { __provided: Record<string, unknown> }).__provided = provided;
    return ctx as unknown as Context;
  }

  it("apply 经 ctx.reflect.provide('superComposer', { focusFullscreenInput }) 注册组合服务", async () => {
    setFullscreenMarker(true);
    const ctx = ctxWithReflect({ sessions: sessionsStub });
    superComposerClient.apply(ctx);
    await tick();
    const provided = (ctx as unknown as { __provided: Record<string, unknown> }).__provided;
    const svc = provided["superComposer"] as { focusFullscreenInput?: unknown } | undefined;
    expect(svc, "superComposer 服务未注册——quote-reference 全屏聚焦缝零接线").toBeDefined();
    expect(typeof svc?.focusFullscreenInput).toBe("function");
  });

  it("focusFullscreenInput：全屏替身在场 = 聚焦官方复制件输入区返回 true；非全屏（替身不在场）= 返回 false", async () => {
    setFullscreenMarker(false);
    const ctx = ctxWithReflect({ sessions: sessionsStub });
    superComposerClient.apply(ctx);
    await tick();
    const svc = (ctx as unknown as { __provided: Record<string, unknown> }).__provided["superComposer"] as {
      focusFullscreenInput(): boolean;
    };
    // 非全屏：替身未渲染 → false
    expect(svc.focusFullscreenInput()).toBe(false);
    // 全屏激活 → 替身浮现 → 聚焦替身输入区（官方复制件 contenteditable 锚）并返回 true
    setFullscreenMarker(true);
    await tick();
    await tick();
    expect(svc.focusFullscreenInput()).toBe(true);
    const input = document.querySelector("[data-dscf-official-input] [data-composer-input]") as HTMLElement | null;
    expect(input, "替身输入区锚 [data-composer-input] 不在场").not.toBeNull();
    expect(document.activeElement).toBe(input);
  });
});

describe("bug: apply 挂载 mini-composer 替身（MiniComposerCard + DataFace 真实接线）", () => {
  it("apply（sessions 在场 + 全屏标记）后 DOM 在场 dscf-root/官方复制件输入锚", async () => {
    setFullscreenMarker(true);
    const ctx = stubCtx({ sessions: sessionsStub });
    superComposerClient.apply(ctx);
    await tick();
    expect(document.querySelector('[data-testid="dscf-root"]')).not.toBeNull();
    expect(document.querySelector('[data-dscf-official-input] [data-composer-input]')).not.toBeNull();
    const effects = (ctx as unknown as { __effects: Array<() => unknown> }).__effects;
    expect(effects.length).toBe(1);
  });

  it("1.30：S2 展开后复制件输入退役——工厂宿主锚在场（官方 composer.bar 经桥 portal 自供）", async () => {
    setFullscreenMarker(true);
    // 消息流非空 = 可展开 → s2
    const ctx = stubCtx({ sessions: sessionsWithMessage });
    superComposerClient.apply(ctx);
    await tick();
    const hotzone = document.querySelector('[data-testid="dscf-hotzone"]') as HTMLElement | null;
    expect(hotzone).not.toBeNull();
    hotzone!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    // S2 = 工厂宿主锚（conversation.content occurrence 渲入）；复制件输入面退役
    expect(document.querySelector('[data-testid="dscf-messages"] [data-dscf-factory-host], [data-dscf-factory-host]')).not.toBeNull();
    expect(document.querySelector('[data-dscf-official-input] [data-composer-card]')).toBeNull();
  });

  it("disposer 收口：root.unmount 摘除替身 DOM（幂等不抛）", async () => {
    setFullscreenMarker(true);
    const ctx = stubCtx({ sessions: sessionsStub });
    superComposerClient.apply(ctx);
    await tick();
    const effects = (ctx as unknown as { __effects: Array<() => unknown> }).__effects;
    const before = document.querySelectorAll('[data-testid="dscf-root"]').length;
    expect(before).toBeGreaterThan(0);
    // cordis 语义：effect mount 返回 disposer，fiber unload 时执行返回值
    const dispose = effects[0]!() as () => void;
    dispose();
    await tick();
    expect(document.querySelectorAll('[data-testid="dscf-root"]').length).toBe(before - 1);
    expect(() => dispose()).not.toThrow();
  });

  it("bug ba885f7d ④: 全屏门控——fullscreenMarkers=0 时替身不常驻（dscf-root 不在场）", async () => {
    setFullscreenMarker(false);
    const ctx = stubCtx({ sessions: sessionsStub });
    superComposerClient.apply(ctx);
    await tick();
    const before = document.querySelectorAll('[data-testid="dscf-root"]').length;
    expect(before, "前置测试残留替身须为零").toBe(0);
    // 全屏激活（DOM 标记出现）→ tracker 扇出重渲染 → 替身浮现
    setFullscreenMarker(true);
    await tick();
    await tick();
    expect(document.querySelector('[data-testid="dscf-root"]')).not.toBeNull();
  });

  it("bug ba885f7d ②: 装配序兜底——sessions 缺席 + inject 缝 = 注入 scope 接线后替身在常", async () => {
    setFullscreenMarker(true);
    const ctx = stubCtx({ inject: true, sessions: sessionsStub });
    superComposerClient.apply(ctx);
    await tick();
    expect(document.querySelector('[data-testid="dscf-root"]')).not.toBeNull();
  });

  it("bug d976ed15: ⧉ 退全屏捕获真实全屏 pane（fullscreen panel 内 dockkit pane）", async () => {
    sidebarRightCalls.length = 0;
    capturedTargets.length = 0;
    // 真实全屏形态：fullscreen panel 内含带 id 的 dockkit pane（官方 sidebarTargetFromElement 读 dataset 捕获）
    const panel = document.createElement("div");
    panel.setAttribute("data-sidebar-right-panel", "fullscreen");
    const session = document.createElement("div");
    session.setAttribute("data-sidebar-right-session", "s1");
    const pane = document.createElement("div");
    pane.setAttribute("data-dockkit-pane", "pane-1");
    session.appendChild(pane);
    panel.appendChild(session);
    document.body.appendChild(panel);
    const ctx = stubCtx({ inject: true, sessions: sessionsWithMessage });
    superComposerClient.apply(ctx);
    await tick();
    const btn = document.querySelector('[data-testid="dscf-fullscreen"]');
    expect(btn).not.toBeNull();
    (btn as HTMLElement).click();
    await tick();
    expect(sidebarRightCalls).toEqual(["toggle"]);
    // 官方公开命令径：commandTarget() 无参捕获（activeElement 回落 active dock pane）
    expect(capturedTargets[0]).toBeUndefined();
  });

  it("bug d976ed15: 无真实全屏 pane（注入式假标记）时 ⧉ no-op（禁把常规视图翻进全屏）", async () => {
    setFullscreenMarker(true);
    sidebarRightCalls.length = 0;
    capturedTargets.length = 0;
    const ctx = stubCtx({ inject: true, sessions: sessionsWithMessage });
    superComposerClient.apply(ctx);
    await tick();
    const btn = document.querySelector('[data-testid="dscf-fullscreen"]');
    expect(btn).not.toBeNull();
    (btn as HTMLElement).click();
    await tick();
    expect(sidebarRightCalls).toEqual([]);
    expect(capturedTargets).toEqual([]);
  });

  it("bug 80421b57: inputTriggers 晚序 provide 后 menu store 补挂——'@' 菜单投影进替身渲染", async () => {
    setFullscreenMarker(true);
    // 首轮订阅时 inputTriggers 缺席（真机 provide 晚序——run3/run4 取证持续 absent）
    const ctx = stubCtx({ sessions: sessionsLiveWithInput });
    superComposerClient.apply(ctx);
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 2_300)); // 首轮 sync tick：state+evs 挂上、triggers 缺席
    // 晚序 provide（官方 inputTriggers 服务就绪）
    (ctx as Record<string, unknown>).inputTriggers = triggersStub;
    await new Promise((resolve) => setTimeout(resolve, 2_300)); // 次轮 sync tick：menu store 补挂
    // 官方 controller 菜单开（'@' trigger 命中 roster）→ store notify → 替身重渲染
    menuStore.open = true;
    const sessionOfSpy = vi.fn(triggersStub.sessionOf);
    (ctx as Record<string, unknown>).inputTriggers = { sessionOf: sessionOfSpy };
    for (const listener of menuStore.listeners) listener();
    await new Promise((resolve) => setTimeout(resolve, 120)); // React 并发调度 flush（Scheduler macrotask）
    await tick();
    console.log("DBG open", menuStore.getSnapshot().open, "sessionOfCalls", sessionOfSpy.mock.calls.length,
      "rootHtml", document.querySelector('[data-testid="dscf-root"]')?.innerHTML.length);
    expect(document.querySelector('[data-testid="dscf-mention"]')).not.toBeNull();
  });
});
