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
}

function mountWithFace(world: FakeWorld): Harness {
  const face = createSuperComposerDataFace(world.services);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (): void => {
    const mention = mentionMenuOf(face);
    const props: MiniComposerProps = {
      ...miniComposerPropsOf(face, { title: "示例会话" }),
      ...(mention === undefined ? {} : { mention }),
    };
    root.render(<MiniComposerCard {...props} />);
  };
  const offs = [face.subscribe(() => render())];
  act(() => render());
  return {
    root,
    container,
    face,
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
    },
  };
}

function q(h: Harness, testId: string): HTMLElement | null {
  return h.container.querySelector(`[data-testid="${testId}"]`);
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

  it("草稿投影驱动卡片输入值——共享 state 快照变更 → 卡片 rerender 上屏", () => {
    const world = makeWorld();
    harness = mountWithFace(world);
    const input = q(harness, "dscf-input") as HTMLTextAreaElement;
    expect(input.value).toBe("");
    act(() => {
      harness!.face.setDraft("共享草稿");
    });
    expect((q(harness, "dscf-input") as HTMLTextAreaElement).value).toBe("共享草稿");
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

  it("occurrences 投影 chip 行：state.occurrences 增长 → 卡片 chip 行计数上屏", () => {
    const world = makeWorld();
    harness = mountWithFace(world);
    expect(q(harness, "dscf-chips")).toBeNull();
    act(() => {
      world.inputState.setSnapshot(makeInputState({ occurrences: [{ start: 0, end: 5 }, { start: 6, end: 9 }] }));
    });
    const chips = q(harness, "dscf-chips");
    expect(chips?.textContent).toContain("2");
  });

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
    clipboardText: "@[选段摘要](quote:abc)",
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

  it("track：草稿变更携带 caret + 官方 guard tier（phase 映射）", () => {
    expect(trackGuardOf("plain")).toBe("plain");
    expect(trackGuardOf("adjudicating")).toBe("claimed");
    expect(trackGuardOf("claimed")).toBe("claimed");
    expect(trackGuardOf("submitting")).toBe("frozen");
    const world = makeWorld();
    harness = mountWithFace(world);
    const input = q(harness, "dscf-input") as HTMLTextAreaElement;
    act(() => {
      // 绕过 React value tracker（原型 setter）——否则 React 判定值未变不派发 onChange
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(input, "/he");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // onChange → onDraftChange(text, caret) → face.trackMention → controller.track
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
    const input = q(harness, "dscf-input") as HTMLTextAreaElement;
    expect(q(harness, "dscf-mention")).not.toBeNull();
    fireKey(input, "ArrowDown");
    expect(world.arbitrate).toHaveBeenLastCalledWith("down", false);
    fireKey(input, "ArrowUp");
    expect(world.arbitrate).toHaveBeenLastCalledWith("up", false);
    fireKey(input, "Enter");
    expect(world.arbitrate).toHaveBeenLastCalledWith("enter", false);
    expect(world.submit).not.toHaveBeenCalled();
    fireKey(input, "Escape");
    expect(world.arbitrate).toHaveBeenLastCalledWith("escape", false);
  });

  it("键盘链（菜单开 + arbitrate pass）：Enter 落回发送链", () => {
    const world = makeWorld();
    world.menu.setSnapshot({ open: true, groups: [], highlight: null });
    world.arbitrate.mockReturnValue("pass");
    harness = mountWithFace(world);
    const input = q(harness, "dscf-input") as HTMLTextAreaElement;
    act(() => {
      harness!.face.setDraft("发送我");
    });
    fireKey(input, "Enter");
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

  it("流式增量上屏 + 滚动吸底：eventSource append → 卡片消息流增长且 scrollTop 吸底", () => {
    const world = makeWorld();
    harness = mountWithFace(world);
    expect(q(harness, "dscf-messages")).toBeNull();
    // 发送首条 → 自动展开 S2；durable user message + transient chunk 同窗投影
    act(() => {
      harness!.face.setDraft("问");
    });
    fireKey(q(harness, "dscf-input") as HTMLTextAreaElement, "Enter");
    act(() => {
      world.eventWindow.set({
        entries: [
          { type: "event", event: { type: "user/message", seq: 1, data: { id: "m1", role: "user", content: [{ type: "text", text: "问" }] } } },
          { type: "transient", event: { type: "assistant/live-chunk", seq: 2, data: { attemptId: "a1", chunk: { type: "text-delta", text: "流" } } } },
        ],
      });
    });
    const messages = q(harness, "dscf-messages");
    expect(messages?.textContent).toContain("流");
    expect(messages?.getAttribute("data-streaming")).toBe("true");
    // 流式增量：追加 chunk → 同一行文本增长
    act(() => {
      world.eventWindow.set({
        entries: [
          ...(world.eventWindow.getSnapshot().entries ?? []),
          { type: "transient", event: { type: "assistant/live-chunk", seq: 3, data: { attemptId: "a1", chunk: { type: "text-delta", text: "式回复" } } } },
        ],
      });
    });
    expect(q(harness, "dscf-messages")?.textContent).toContain("流式回复");
    // 滚动吸底：消息流变更后 scrollTop 钉在底部
    const scroller = q(harness, "dscf-messages") as HTMLElement;
    expect(scroller.scrollTop).toBe(scroller.scrollHeight);
  });

  it("发送自动展开：onSend（face.submit 径）→ 消息流展开", () => {
    const world = makeWorld();
    harness = mountWithFace(world);
    act(() => {
      harness!.face.setDraft("首条");
    });
    const input = q(harness, "dscf-input") as HTMLTextAreaElement;
    fireKey(input, "Enter");
    expect(world.submit).toHaveBeenCalledTimes(1);
    act(() => {
      world.eventWindow.set({
        entries: [{ type: "event", event: { type: "user/message", seq: 1, data: { id: "m1", role: "user", content: [{ type: "text", text: "首条" }] } } }],
      });
    });
    expect(q(harness, "dscf-messages")).not.toBeNull();
    expect(q(harness, "dscf-controls")).not.toBeNull();
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
