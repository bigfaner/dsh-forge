// @vitest-environment happy-dom
// data-face 替身数据面接线测试（真实 DOM——happy-dom）：
//   - 同草稿读写：全部操作走 ctx.conversation.input.for(actx) 同一 facade——
//     setDraft / insertReference / submit 官方链路由 + 共享 state 快照投影
//     （draft / occurrences chip 行 / 退出全屏共享无损）。
//   - mention 菜单：官方 inputTriggers controller（menu store / track / arbitrate /
//     pick）同壳菜单键盘链（↑↓/Enter/Esc/点击）。
//   - 消息流投影：同一 session eventSource 快照——durable user/assistant message +
//     assistant/live-chunk 流式增量上屏 + 滚动吸底。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MiniComposerCard, type MiniComposerProps } from "../src/client/mini-composer.js";
import {
  activeSessionIdOf,
  createSuperComposerDataFace,
  mentionMenuOf,
  miniComposerPropsOf,
  projectEventWindow,
  sessionTitleOf,
  trackGuardOf,
  type DataFaceServices,
  type EventEntryMirror,
  type ReferenceInsertMirror,
} from "../src/client/data-face.js";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// ─────────────────────────── fake 官方面（结构同型） ───────────────────────────

interface FakeStore<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
  set(next: T): void;
}

function storeOf<T>(initial: T): FakeStore<T> & { setSnapshot(next: T): void } {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSnapshot(next) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    set(next) {
      this.setSnapshot(next);
    },
  };
}

function makeInputState(overrides: Partial<{ draft: string; draftRev: number; phase: string; occurrences: unknown[] }> = {}) {
  return {
    draft: overrides.draft ?? "",
    draftRev: overrides.draftRev ?? 1,
    phase: overrides.phase ?? "plain",
    attachmentIds: [],
    occurrences: overrides.occurrences ?? [],
    queue: { rows: [] },
  };
}

interface FakeWorld {
  services: DataFaceServices;
  actx: Record<string, unknown>;
  otherActx: Record<string, unknown>;
  inputState: ReturnType<typeof storeOf<ReturnType<typeof makeInputState>>>;
  setDraft: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  bail: ReturnType<typeof vi.fn>;
  eventWindow: ReturnType<typeof storeOf<{ entries: EventEntryMirror[] }>>;
  menu: ReturnType<typeof storeOf<{
    open: boolean;
    groups: { source: string; items: { name: string; label?: string }[] }[];
    highlight: { source: string; index: number } | null;
  }>>;
  track: ReturnType<typeof vi.fn>;
  arbitrate: ReturnType<typeof vi.fn>;
  pick: ReturnType<typeof vi.fn>;
}

function makeWorld(): FakeWorld {
  const actx = { tag: "actx-main" };
  const otherActx = { tag: "actx-other" };
  const inputState = storeOf(makeInputState());
  const setDraft = vi.fn((text: string) => {
    inputState.setSnapshot({ ...inputState.getSnapshot(), draft: text, draftRev: inputState.getSnapshot().draftRev + 1 });
  });
  const submit = vi.fn();
  const face = {
    setDraft,
    submit,
    focus: vi.fn(),
    state: { getSnapshot: () => inputState.getSnapshot(), subscribe: (l: () => void) => inputState.subscribe(l) },
  };
  const eventWindow = storeOf<{ entries: EventEntryMirror[] }>({ entries: [] });
  const binding = { sessionId: "s-1", ctx: actx, eventSource: eventWindow };
  const menu = storeOf({ open: false, groups: [] as { source: string; items: { name: string; label?: string }[] }[], highlight: null as { source: string; index: number } | null });
  const track = vi.fn();
  const arbitrate = vi.fn(() => "consumed" as const);
  const pick = vi.fn();
  const bail = vi.fn(() => true);
  const services: DataFaceServices = {
    sessions: {
      binding: (id: string) => (id === "s-1" ? binding : undefined),
      list: {
        getSnapshot: () => ({ byId: { "s-1": { id: "s-1", retainedBy: { mainView: 1 } } } }),
      },
    },
    conversation: { input: { for: (a: unknown) => (a === actx ? face : undefined) } },
    bail: bail as unknown as DataFaceServices["bail"],
    inputTriggers: {
      sessionOf: (a: unknown) => {
        if (a !== actx) throw new Error("no scope");
        return {
          menu: { getSnapshot: () => menu.getSnapshot(), subscribe: (l: () => void) => menu.subscribe(l) },
          track,
          arbitrate,
          pick,
          dismiss: vi.fn(),
        };
      },
    },
  };
  return { services, actx, otherActx, inputState, setDraft, submit, focus: face.focus, bail, eventWindow, menu, track, arbitrate, pick };
}

// ─────────────────────────── React 卡片挂载 harness ───────────────────────────

interface Harness {
  root: Root;
  container: HTMLElement;
  rerender(): void;
  unmount(): void;
  face: ReturnType<typeof createSuperComposerDataFace>;
  composerFace: ReturnType<typeof createSuperComposerDataFace>;
}

function mountWithFace(world: FakeWorld): Harness {
  const face = createSuperComposerDataFace(world.services);
  // fix-12：替身输入面 = 官方复制件宿主的专用数据面（单订阅者——与外层渲染扇出分实例）
  const composerFace = createSuperComposerDataFace(world.services);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (): void => {
    const mention = mentionMenuOf(face);
    const props: MiniComposerProps = {
      ...miniComposerPropsOf(face, { title: "示例会话" }),
      ...(mention === undefined ? {} : { mention }),
      composer: composerFace,
    };
    root.render(<MiniComposerCard {...props} />);
  };
  const offs = [face.subscribe(() => render())];
  act(() => render());
  return {
    root,
    container,
    face,
    composerFace,
    rerender() {
      act(() => render());
    },
    unmount() {
      for (const off of offs) off();
      act(() => {
        root.unmount();
      });
      container.remove();
      face.dispose();
      composerFace.dispose();
    },
  };
}

function q(h: Harness, testId: string): HTMLElement | null {
  return h.container.querySelector(`[data-testid="${testId}"]`);
}

function editorOf(h: Harness): HTMLElement {
  const editor = h.container.querySelector("[data-dscf-official-input] [data-composer-input]");
  if (editor === null) throw new Error("missing official composer input");
  return editor;
}

function fireKey(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
}

let harness: Harness | null = null;

afterEach(() => {
  harness?.unmount();
  harness = null;
});

// ─────────────────────────── 同草稿读写（同一 facade） ───────────────────────────

describe("同草稿机操作（ctx.conversation.input.for(actx) 同一 facade）", () => {
  it("setDraft 路由到活跃会话 binding.ctx 的 SessionInput.setDraft——同草稿机单写径", () => {
    const world = makeWorld();
    harness = mountWithFace(world);
    harness.face.setDraft("你好");
    expect(world.setDraft).toHaveBeenCalledWith("你好");
    expect(harness.face.draftProjection()).toEqual({ draft: "你好", chipCount: 0 });
  });

  it("草稿投影驱动复制件 editor——共享 state 快照变更 → 官方机器草稿同步入复制件", () => {
    const world = makeWorld();
    harness = mountWithFace(world);
    expect(editorOf(harness).textContent).toBe("");
    act(() => {
      harness!.face.setDraft("共享草稿");
    });
    expect(editorOf(harness).textContent).toBe("共享草稿");
  });

  it("退出全屏共享无损：卡片卸载后草稿仍在共享 state——重读投影不丢", () => {
    const world = makeWorld();
    harness = mountWithFace(world);
    harness.face.setDraft("未发送内容");
    harness.unmount();
    harness = null;
    const face = createSuperComposerDataFace(world.services);
    expect(face.draftProjection().draft).toBe("未发送内容");
    face.dispose();
  });

  it("occurrences 投影 → chipCount 判据（叠加 chip 计数行已退役，native chip 走复制件）", () => {
    const world = makeWorld();
    harness = mountWithFace(world);
    expect(q(harness, "dscf-chips")).toBeNull();
    act(() => {
      world.inputState.setSnapshot(makeInputState({ occurrences: [{ start: 0, end: 5 }, { start: 6, end: 9 }] }));
    });
    // chip 计数进 active 判据：无草稿无消息但有 chip → S1
    expect(phaseOf(harness)).toBe("s1");
  });

  function phaseOf(h: Harness): string {
    return q(h, "dscf-root")!.getAttribute("data-phase") ?? "";
  }

  it("submit 走官方发送链（face.submit 同径）；会话寻址失败 = fail-soft 不抛", () => {
    const world = makeWorld();
    harness = mountWithFace(world);
    harness.face.submit();
    expect(world.submit).toHaveBeenCalledTimes(1);
    const lonely = createSuperComposerDataFace({
      sessions: { binding: () => undefined, list: { getSnapshot: () => ({ byId: {} }) } },
      conversation: { input: { for: () => undefined } },
    });
    expect(() => {
      lonely.setDraft("x");
      lonely.submit();
    }).not.toThrow();
    lonely.dispose();
  });
});

// ─────────────────────────── insertReference（span-CAS + bail 官方径） ───────────────────────────

describe("insertReference（官方 scoped 事件径）", () => {
  const REFERENCE: ReferenceInsertMirror = {
    source: "quote",
    ref: "quote:abc",
    label: "选段摘要",
    clipboardText: "〔引用：选段摘要〕",
  };

  it("bail 返回 true：tail span-CAS 载荷 + 聚焦归还", () => {
    const world = makeWorld();
    harness = mountWithFace(world);
    expect(harness.face.insertReference(REFERENCE)).toBe(true);
    expect(world.bail).toHaveBeenCalledWith(world.actx, "slash/input-insert-reference", {
      reference: REFERENCE,
      span: { start: 0, end: 0, draftRev: 1 },
    });
    expect(world.focus).toHaveBeenCalledTimes(1);
  });

  it("bail 返回值漂移但 occurrences 增长（bug 2d5434d1 症状级复核）= 仍判成功", () => {
    const world = makeWorld();
    world.bail.mockReturnValue(undefined);
    harness = mountWithFace(world);
    const apply = (): void => {
      world.inputState.setSnapshot(
        makeInputState({ occurrences: [...world.inputState.getSnapshot().occurrences, { start: 0, end: 5 }] }),
      );
    };
    world.bail.mockImplementation(() => {
      apply();
      return undefined;
    });
    expect(harness.face.insertReference(REFERENCE)).toBe(true);
  });

  it("bail 未应用且快照无变化 = false（调用方 fail-soft）", () => {
    const world = makeWorld();
    world.bail.mockReturnValue(undefined);
    harness = mountWithFace(world);
    expect(harness.face.insertReference(REFERENCE)).toBe(false);
  });
});

// ─────────────────────────── mention 菜单（官方 inputTriggers 源候选） ───────────────────────────

describe("mention 菜单（官方 controller 同壳）", () => {
  it("mention() 解析活跃会话 controller；服务缺席 = undefined", () => {
    const world = makeWorld();
    harness = mountWithFace(world);
    expect(harness.face.mention()).toBeDefined();
    const bare = createSuperComposerDataFace({
      sessions: world.services.sessions,
      conversation: world.services.conversation,
    });
    expect(bare.mention()).toBeUndefined();
    bare.dispose();
  });

  it("track：guard tier 映射（phase）+ 替身 trackMention 路由 controller.track", () => {
    expect(trackGuardOf("plain")).toBe("plain");
    expect(trackGuardOf("adjudicating")).toBe("claimed");
    expect(trackGuardOf("claimed")).toBe("claimed");
    expect(trackGuardOf("submitting")).toBe("frozen");
    const world = makeWorld();
    harness = mountWithFace(world);
    harness.face.trackMention("/he", 3);
    expect(world.track).toHaveBeenCalledWith("/he", 3, { tier: "plain" }, expect.any(Number));
  });

  it("键盘链（菜单开）：↑↓/Enter/Esc 全路由 arbitrate——Enter 命中不发送", () => {
    const world = makeWorld();
    world.menu.setSnapshot({
      open: true,
      groups: [{ source: "commands", items: [{ name: "help" }] }],
      highlight: { source: "commands", index: 0 },
    });
    world.arbitrate.mockImplementation((key: string) => (key === "enter" ? "pick-highlighted" : "consumed"));
    harness = mountWithFace(world);
    const editor = editorOf(harness);
    expect(q(harness, "dscf-mention")).not.toBeNull();
    fireKey(editor, "ArrowDown");
    expect(world.arbitrate).toHaveBeenLastCalledWith("down", false);
    fireKey(editor, "ArrowUp");
    expect(world.arbitrate).toHaveBeenLastCalledWith("up", false);
    fireKey(editor, "Enter");
    expect(world.arbitrate).toHaveBeenLastCalledWith("enter", false);
    expect(world.submit).not.toHaveBeenCalled();
    fireKey(editor, "Escape");
    expect(world.arbitrate).toHaveBeenLastCalledWith("escape", false);
  });

  it("键盘链（菜单开 + arbitrate pass）：Enter 落回发送链（复制件 keymap submit → face.submit）", () => {
    const world = makeWorld();
    world.menu.setSnapshot({ open: true, groups: [], highlight: null });
    world.arbitrate.mockReturnValue("pass");
    harness = mountWithFace(world);
    act(() => {
      harness!.face.setDraft("发送我");
    });
    fireKey(editorOf(harness), "Enter");
    expect(world.submit).toHaveBeenCalledTimes(1);
  });

  it("点击候选 → controller.pick(source, index)", () => {
    const world = makeWorld();
    world.menu.setSnapshot({
      open: true,
      groups: [{ source: "commands", items: [{ name: "help" }] }],
      highlight: { source: "commands", index: 0 },
    });
    harness = mountWithFace(world);
    const item = q(harness, "dscf-mention-item-commands-0");
    expect(item).not.toBeNull();
    act(() => {
      item!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(world.pick).toHaveBeenCalledWith("commands", 0);
  });
});

// ─────────────────────────── 消息流投影（同一 session eventSource） ───────────────────────────

describe("bug e9fec642：streamProjection 历史分页（loadOlder 官方缝补齐超窗 durable 历史）", () => {
  function makePagingWorld(): {
    world: FakeWorld;
    loadOlder: ReturnType<typeof vi.fn>;
  } {
    const world = makeWorld();
    const loadOlder = vi.fn(async () => {
      // 官方 loadOlder 同型：异步拉页——prepend 一页更早历史 + 收敛 hasMore
      await Promise.resolve();
      const current = world.eventWindow.getSnapshot() as { entries: EventEntryMirror[]; hasMore?: boolean };
      world.eventWindow.setSnapshot({
        entries: [
          { type: "event", event: { type: "user/message", seq: 0, data: { id: "m0", role: "user", content: [{ type: "text", text: "更早历史消息" }] } } },
          ...current.entries,
        ],
        hasMore: false,
      } as never);
    });
    (world.services.sessions as { binding: (id: string) => unknown }).binding = (id: string) =>
      id === "s-1"
        ? { sessionId: "s-1", ctx: world.actx, eventSource: world.eventWindow, session: { loadOlder } }
        : undefined;
    return { world, loadOlder };
  }

  it("window.hasMore=true → 经 binding.session.loadOlder 拉页；补齐后投影含更早历史", async () => {
    const { world, loadOlder } = makePagingWorld();
    world.eventWindow.setSnapshot({
      entries: [{ type: "event", event: { type: "user/message", seq: 9, data: { id: "m9", role: "user", content: [{ type: "text", text: "窗口内消息" }] } } }],
      hasMore: true,
    } as never);
    harness = mountWithFace(world);
    const first = harness.face.streamProjection();
    expect(first.messages.map((m) => m.id)).toEqual(["m9"]);
    // 分页为 fire-and-forget 官方异步缝——微任务推进后收敛
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadOlder).toHaveBeenCalledTimes(1);
    const settled = harness.face.streamProjection();
    expect(settled.messages.map((m) => m.id)).toEqual(["m0", "m9"]);
  });

  it("hasMore 收敛后不再拉页（单飞 + 终态零重复调用）；无 session 面 = 静默跳过", async () => {
    const { world, loadOlder } = makePagingWorld();
    world.eventWindow.setSnapshot({ entries: [], hasMore: true } as never);
    harness = mountWithFace(world);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadOlder).toHaveBeenCalledTimes(1);
    harness.face.streamProjection();
    harness.face.streamProjection();
    await act(async () => {
      await Promise.resolve();
    });
    expect(loadOlder).toHaveBeenCalledTimes(1);
    // 无 session 面的 binding：投影不抛、不拉页
    const bare = createSuperComposerDataFace({
      sessions: {
        binding: () => ({ sessionId: "s-1", ctx: world.actx, eventSource: world.eventWindow }),
        list: world.services.sessions!.list,
      },
      conversation: world.services.conversation,
    });
    expect(() => bare.streamProjection()).not.toThrow();
    bare.dispose();
  });
});

describe("消息流投影（同一 eventSource 快照）", () => {
  it("projectEventWindow：durable user/assistant message + live-chunk 流式增量聚合", () => {
    const window = {
      entries: [
        {
          type: "event",
          event: { type: "user/message", seq: 1, data: { id: "m1", role: "user", content: [{ type: "text", text: "这段什么意思？" }] } },
        },
        { type: "transient", event: { type: "assistant/live-chunk", seq: 2, data: { attemptId: "a1", chunk: { type: "text-delta", text: "文本引用" } } } },
        { type: "transient", event: { type: "assistant/live-chunk", seq: 3, data: { attemptId: "a1", chunk: { type: "text-delta", text: "锚定是……" } } } },
      ],
    } as const;
    const projection = projectEventWindow(window);
    expect(projection.streaming).toBe(true);
    expect(projection.messages).toEqual([
      { id: "m1", role: "user", content: "这段什么意思？" },
      { id: "live:a1", role: "assistant", content: "文本引用锚定是……" },
    ]);
  });

  it("settle 后（无 transient）streaming=false，durable assistant/message 上屏", () => {
    const projection = projectEventWindow({
      entries: [
        { type: "event", event: { type: "user/message", seq: 1, data: { id: "m1", role: "user", content: [{ type: "text", text: "hi" }] } } },
        { type: "event", event: { type: "assistant/message", seq: 2, data: { message: { id: "m2", role: "assistant", content: [{ type: "text", text: "答案" }] } } } },
      ],
    });
    expect(projection.streaming).toBe(false);
    expect(projection.messages).toEqual([
      { id: "m1", role: "user", content: "hi" },
      { id: "m2", role: "assistant", content: "答案" },
    ]);
  });

  it("流式投影驱动 S2 工厂宿主：eventSource append → 可展开/S2 宿主锚在场且流式标记跟随（消息内容渲染 = 官方工厂，真机取证）", () => {
    const world = makeWorld();
    harness = mountWithFace(world);
    expect(q(harness, "dscf-messages")).toBeNull();
    // durable user message + transient chunk 同窗投影 → 消息非空（可展开）→ 热区展开 S2
    act(() => {
      world.eventWindow.set({
        entries: [
          { type: "event", event: { type: "user/message", seq: 1, data: { id: "m1", role: "user", content: [{ type: "text", text: "问" }] } } },
          { type: "transient", event: { type: "assistant/live-chunk", seq: 2, data: { attemptId: "a1", chunk: { type: "text-delta", text: "流" } } } },
        ],
      });
    });
    act(() => {
      q(harness, "dscf-hotzone")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const messages = q(harness, "dscf-messages");
    expect(messages).not.toBeNull();
    expect(messages!.getAttribute("data-streaming")).toBe("true");
    // 流式增量：追加 chunk → 投影面增长（卡片判据跟随；渲染本体 = conversation.content 工厂）
    act(() => {
      world.eventWindow.set({
        entries: [
          ...(world.eventWindow.getSnapshot().entries ?? []),
          { type: "transient", event: { type: "assistant/live-chunk", seq: 3, data: { attemptId: "a1", chunk: { type: "text-delta", text: "式回复" } } } },
        ],
      });
    });
    expect(q(harness, "dscf-messages")).not.toBeNull();
    expect(q(harness, "dscf-messages")!.getAttribute("data-streaming")).toBe("true");
  });

  it("发送自动展开：复制件 Enter 提交（face.submit 径）→ 消息流展开", () => {
    const world = makeWorld();
    world.menu.setSnapshot({ open: false, groups: [], highlight: null });
    world.arbitrate.mockReturnValue("pass");
    harness = mountWithFace(world);
    act(() => {
      harness!.face.setDraft("首条");
    });
    fireKey(editorOf(harness), "Enter");
    expect(world.submit).toHaveBeenCalledTimes(1);
    act(() => {
      world.eventWindow.set({
        entries: [{ type: "event", event: { type: "user/message", seq: 1, data: { id: "m1", role: "user", content: [{ type: "text", text: "首条" }] } } }],
      });
    });
    expect(q(harness, "dscf-messages")).not.toBeNull();
  });
});

// ─────────────────────────── 会话切换订阅重挂（bug 1d1e07af） ───────────────────────────

describe("活跃会话切换订阅重挂（bug 1d1e07af：订阅闩锁首会话）", () => {
  it("binding 变更 → 摘旧会话订阅、重挂新会话——新会话 state 发布驱动替身投影", async () => {
    const actx1 = { tag: "actx-1" };
    const actx2 = { tag: "actx-2" };
    const state1 = storeOf(makeInputState({ draft: "旧会话稿" }));
    const state2 = storeOf(makeInputState({ draft: "" }));
    const eventWindow2 = storeOf<{ entries: EventEntryMirror[] }>({ entries: [] });
    const face1 = { setDraft: vi.fn(), submit: vi.fn(), focus: vi.fn(), state: { getSnapshot: () => state1.getSnapshot(), subscribe: (l: () => void) => state1.subscribe(l) } };
    const face2 = { setDraft: vi.fn(), submit: vi.fn(), focus: vi.fn(), state: { getSnapshot: () => state2.getSnapshot(), subscribe: (l: () => void) => state2.subscribe(l) } };
    const binding1 = { sessionId: "s-1", ctx: actx1, eventSource: storeOf<{ entries: EventEntryMirror[] }>({ entries: [] }) };
    const binding2 = { sessionId: "s-2", ctx: actx2, eventSource: eventWindow2 };
    let listSnap: unknown = { byId: { "s-1": { id: "s-1", retainedBy: { mainView: 1 } }, "s-2": { id: "s-2", retainedBy: { mainView: 0 } } } };
    const listSubs = new Set<() => void>();
    const services: DataFaceServices = {
      sessions: {
        binding: (id: string) => (id === "s-1" ? binding1 : id === "s-2" ? binding2 : undefined),
        list: { getSnapshot: () => listSnap, subscribe: (l: () => void) => (listSubs.add(l), () => listSubs.delete(l)) },
      },
      conversation: { input: { for: (a: unknown) => (a === actx1 ? face1 : a === actx2 ? face2 : undefined) } },
    };
    const face = createSuperComposerDataFace(services);
    try {
      const fired: string[] = [];
      face.subscribe(() => fired.push(face.draftProjection().draft));
      // 切换活跃会话 s-1 → s-2（sessions.list 快照变更通知；重挂出通知循环微任务执行）
      await act(async () => {
        listSnap = { byId: { "s-1": { id: "s-1", retainedBy: { mainView: 0 } }, "s-2": { id: "s-2", retainedBy: { mainView: 1 } } } };
        Array.from(listSubs).forEach((listener) => listener());
        await Promise.resolve();
      });
      // 新会话 state 发布（官方 shell.publish 径）→ 须驱动替身
      act(() => {
        state2.setSnapshot(makeInputState({ draft: "新会话稿", draftRev: 6, occurrences: [{ start: 0, end: 5 }] }));
      });
      expect(fired.at(-1)).toBe("新会话稿");
      expect(face.draftProjection()).toEqual({ draft: "新会话稿", chipCount: 1 });
    } finally {
      face.dispose();
    }
  });
});

// ─────────────────────────── 卸载竞态（bug 0b94b710） ───────────────────────────

describe("dispose 后微任务重挂竞态守卫（bug 0b94b710）", () => {
  it("sessions.list 通知后立即 dispose：已排队微任务不重挂订阅、不触发 render", async () => {
    const state = storeOf(makeInputState({ draft: "" }));
    const faceImpl = { setDraft: vi.fn(), submit: vi.fn(), focus: vi.fn(), state: { getSnapshot: () => state.getSnapshot(), subscribe: (l: () => void) => state.subscribe(l) } };
    const binding = { sessionId: "s-1", ctx: { tag: "actx" }, eventSource: storeOf<{ entries: EventEntryMirror[] }>({ entries: [] }) };
    const listStore = storeOf<unknown>({ byId: { "s-1": { id: "s-1", retainedBy: { mainView: 1 } } } });
    const services: DataFaceServices = {
      sessions: {
        binding: () => binding,
        list: { getSnapshot: () => listStore.getSnapshot(), subscribe: (l: () => void) => listStore.subscribe(l) },
      },
      conversation: { input: { for: () => faceImpl } },
    };
    const face = createSuperComposerDataFace(services);
    let renders = 0;
    face.subscribe(() => {
      renders += 1;
    });
    expect(renders).toBe(0);
    // 通知 sessions.list → 已排微任务；随后立即 dispose（卸载竞态窗口）
    listStore.setSnapshot({ byId: { "s-1": { id: "s-1", retainedBy: { mainView: 2 } } } });
    face.dispose();
    // 微任务推进：dispose 后已排队微任务不得执行 attachSessionSubs / listener
    await Promise.resolve();
    await Promise.resolve();
    // 零重挂判据：state store 上无替身订阅残留——发布不触达 listener
    state.setSnapshot(makeInputState({ draft: "dispose 后变更" }));
    expect(renders).toBe(0);
  });
});

// ─────────────────────────── 纯函数边角 ───────────────────────────

describe("纯函数边角", () => {
  it("activeSessionIdOf：retainedBy.mainView 在留行；形状漂移 = undefined", () => {
    const listOf = (byId: unknown): unknown => ({ getSnapshot: () => ({ byId }) });
    expect(activeSessionIdOf(listOf({ a: { id: "a", retainedBy: { mainView: 2 } } }))).toBe("a");
    expect(activeSessionIdOf(listOf({ a: { id: "a", retainedBy: { mainView: 0 } } }))).toBeUndefined();
    expect(activeSessionIdOf(null)).toBeUndefined();
    expect(activeSessionIdOf(undefined)).toBeUndefined();
  });

  it("projectEventWindow：空窗口 / 非消息事件 = 空投影不抛", () => {
    expect(projectEventWindow({ entries: [] })).toEqual({ messages: [], streaming: false });
    expect(
      projectEventWindow({ entries: [{ type: "event", event: { type: "turn/start", seq: 1, data: {} } }] }).messages,
    ).toEqual([]);
  });
});

describe("1.41 标题栏左侧会话标题（sessions.list title/displayTitle 口径）", () => {
  const listOf = (byId: unknown): unknown => ({ getSnapshot: () => ({ byId }) });

  it("sessionTitleOf：durable title 优先；未命名回落 displayTitle（官方侧栏同口径）", () => {
    expect(
      sessionTitleOf(listOf({ s1: { id: "s1", title: "重命名后", displayTitle: "重命名后", retainedBy: { mainView: 1 } } })),
    ).toBe("重命名后");
    expect(
      sessionTitleOf(listOf({ s1: { id: "s1", displayTitle: "proj-basename", retainedBy: { mainView: 1 } } })),
    ).toBe("proj-basename");
    // 官方 manager 投影保证 displayTitle 在场；双缺 = 回空串（fail-soft）
    expect(sessionTitleOf(listOf({ s1: { id: "s1", retainedBy: { mainView: 1 } } }))).toBe("");
  });

  it("sessionTitleOf：非活跃行不取；快照/形状缺席 = 空串不抛", () => {
    expect(
      sessionTitleOf(listOf({
        s1: { id: "s1", title: "主会话", retainedBy: { mainView: 1 } },
        s2: { id: "s2", title: "后台会话", retainedBy: { mainView: 0 } },
      })),
    ).toBe("主会话");
    expect(sessionTitleOf(null)).toBe("");
    expect(sessionTitleOf(undefined)).toBe("");
    expect(sessionTitleOf({})).toBe("");
  });

  it("titleProjection/miniComposerPropsOf：标题注入 props.title；重命名经 list 通知后投影更新", async () => {
    const world = makeWorld();
    const listStore = storeOf({
      byId: { s1: { id: "s1", title: "首会话", displayTitle: "首会话", retainedBy: { mainView: 1 } } },
    });
    world.services.sessions = {
      binding: world.services.sessions!.binding,
      list: {
        getSnapshot: () => listStore.getSnapshot(),
        subscribe: (l: () => void) => listStore.subscribe(l),
      },
    };
    const face = createSuperComposerDataFace(world.services);
    try {
      expect(face.titleProjection()).toBe("首会话");
      expect(miniComposerPropsOf(face).title).toBe("首会话");

      // 活跃会话切换：list 快照换代 → 投影随行
      listStore.setSnapshot({
        byId: {
          s1: { id: "s1", title: "首会话", retainedBy: { mainView: 0 } },
          s2: { id: "s2", title: "切到的会话", displayTitle: "切到的会话", retainedBy: { mainView: 1 } },
        },
      });
      expect(face.titleProjection()).toBe("切到的会话");

      // 重命名：官方 manager rename → list 投影列更新 → 通知扇出后重读
      let notified = 0;
      const off = face.subscribe(() => {
        notified += 1;
      });
      listStore.setSnapshot({
        byId: {
          s1: { id: "s1", title: "首会话", retainedBy: { mainView: 0 } },
          s2: { id: "s2", title: "重命名后的标题", displayTitle: "重命名后的标题", retainedBy: { mainView: 1 } },
        },
      });
      await Promise.resolve();
      expect(notified, "list 通知扇出（订阅链驱动实时更新）").toBeGreaterThan(0);
      expect(miniComposerPropsOf(face).title).toBe("重命名后的标题");
      off();
    } finally {
      face.dispose();
    }
  });

  it("会话缺席（binding 不可寻）= 标题空投影不抛", () => {
    const world = makeWorld();
    world.services.sessions = {
      binding: () => undefined,
      list: { getSnapshot: () => ({ byId: {} }) },
    };
    const face = createSuperComposerDataFace(world.services);
    expect(face.titleProjection()).toBe("");
    expect(miniComposerPropsOf(face).title).toBe("");
    face.dispose();
  });
});
