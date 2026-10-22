// @vitest-environment happy-dom
// mini-composer 一体卡四态状态机全转换测试（真实 DOM——happy-dom；fake timers 承载
// 30s 空闲 + 3s 预告时序）。转换表逐条（proposal §UI/UX 交互规格）：
// 标题栏热区开合 /「—」收球 /「⧉」退全屏 / Esc 逐层 / 发送自动展开 / 流式钉死 /
// 30s 四条件 + 3s 预告（可拦截）/ 点球未读直达 S2 / 鼠标离开不收起。
//
// fix-12 输入面切换：官方 InputBar/DraftEditor 复制件（SurrogateComposer 宿主）——
// textarea 旧径退役；输入/发送断言改走复制件官方面（data-composer-card / .primary
// 官方钮 / face.setDraft·submit 官方发送链）。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MiniComposerCard,
  splitQuoteSegments,
  type MiniComposerMessage,
  type MiniComposerProps,
} from "../src/client/mini-composer.js";
import { SUPER_COMPOSER_CSS } from "../src/client/styles.js";
import type { SuperComposerDataFace } from "../src/client/data-face.js";
import type { InputStateMirror } from "../src/client/data-face.js";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  root: Root;
  container: HTMLElement;
  rerender(props: Partial<MiniComposerProps>): void;
  unmount(): void;
}

/** 替身数据面桩（单订阅者——notify 手动扇出；state 由用例直改后 notify）。 */
function makeFace(initial?: Partial<InputStateMirror>): SuperComposerDataFace & {
  state: InputStateMirror;
  notify(): void;
  setDraft: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
  trackMention: ReturnType<typeof vi.fn>;
} {
  let listener: (() => void) | null = null;
  const face = {
    state: { draft: "", draftRev: 0, phase: "plain" as const, occurrences: [], queue: [], ...initial },
    notify() {
      listener?.();
    },
    activeBinding: () => undefined,
    draftProjection() {
      return { draft: face.state.draft, chipCount: face.state.occurrences?.length ?? 0 };
    },
    inputState: () => face.state,
    setDraft: vi.fn((text: string) => {
      face.state = { ...face.state, draft: text, draftRev: face.state.draftRev + 1 };
    }),
    insertReference: () => false,
    submit: vi.fn(),
    streamProjection: () => ({ messages: [], streaming: false }),
    mention: () => undefined,
    trackMention: vi.fn(),
    subscribe(l: () => void) {
      listener = l;
      return () => {
        listener = null;
      };
    },
    syncSubscriptions: () => true,
    dispose: () => undefined,
  };
  return face as never;
}

function baseProps(): MiniComposerProps {
  return {
    title: "示例会话",
    draft: "",
    chipCount: 0,
    messages: [],
    streaming: false,
    onDraftChange: () => undefined,
    onSend: () => undefined,
    onExitFullscreen: () => undefined,
  };
}

function mount(props: Partial<MiniComposerProps> = {}): Harness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let current: MiniComposerProps = { ...baseProps(), ...props };
  act(() => {
    root.render(<MiniComposerCard {...current} />);
  });
  return {
    root,
    container,
    rerender(next) {
      current = { ...current, ...next };
      act(() => {
        root.render(<MiniComposerCard {...current} />);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function q(h: Harness, testId: string): HTMLElement | null {
  return h.container.querySelector(`[data-testid="${testId}"]`);
}

function qOff(h: Harness, selector: string): HTMLElement | null {
  return h.container.querySelector(`[data-dscf-official-input] ${selector}`);
}

function phaseOf(h: Harness): string {
  const rootNode = q(h, "dscf-root");
  if (rootNode === null) throw new Error("missing dscf-root");
  return rootNode.getAttribute("data-phase") ?? "";
}

function msg(id: string, role: "user" | "assistant", content: string): MiniComposerMessage {
  return { id, role, content };
}

function fire(h: Harness, testId: string, event: string, init?: MouseEventInit): void {
  const node = q(h, testId);
  if (node === null) throw new Error(`missing ${testId}`);
  act(() => {
    node.dispatchEvent(new MouseEvent(event, { bubbles: true, cancelable: true, ...init }));
  });
}

function fireKey(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
}

let harness: Harness | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  harness?.unmount();
  harness = null;
  vi.useRealTimers();
});

describe("四态派生（S0/S1/S2/C）", () => {
  it("初始 = S0 输入卡：无标题栏、无消息流；输入面 = 官方复制件（textarea 旧径退役）", () => {
    harness = mount({ composer: makeFace() });
    expect(phaseOf(harness)).toBe("s0");
    expect(q(harness, "dscf-header")).toBeNull();
    expect(q(harness, "dscf-messages")).toBeNull();
    expect(qOff(harness, "[data-composer-card]")).not.toBeNull();
    expect(qOff(harness, "[data-composer-input]")).not.toBeNull();
    expect(q(harness, "dscf-input")).toBeNull();
  });

  it.each([
    ["chip", { chipCount: 1 }],
    ["草稿", { draft: "hello" }],
    ["消息", { messages: [msg("m1", "user", "hi")] }],
  ])("active 判据（%s）→ S1 标题栏态：标题栏在场 + 输入面仍在", (_, props) => {
    harness = mount({ ...props, composer: makeFace() });
    expect(phaseOf(harness)).toBe("s1");
    expect(q(harness, "dscf-header")).not.toBeNull();
    expect(q(harness, "dscf-messages")).toBeNull();
    expect(q(harness, "dscf-title")?.textContent).toContain("示例会话");
  });
});

describe("标题栏转换", () => {
  it("无消息（不可展开）：热区点击无动作（纯展示）", () => {
    harness = mount({ chipCount: 1 });
    expect(phaseOf(harness)).toBe("s1");
    fire(harness, "dscf-hotzone", "click");
    expect(phaseOf(harness)).toBe("s1");
  });

  it("官方发送链提交（.primary 钮）→ onSubmitted 自动进入 S2", () => {
    const face = makeFace({ draft: "hi", draftRev: 1 });
    harness = mount({ composer: face });
    const send = qOff(harness, 'button[aria-label="发送消息"]') as HTMLButtonElement;
    expect(send).not.toBeNull();
    act(() => {
      send.click();
    });
    expect(face.submit).toHaveBeenCalled();
    // 发送落账（消息流增长 + 草稿清空）后 S2 自动展开
    harness.rerender({ draft: "", messages: [msg("m1", "user", "hi")] });
    expect(phaseOf(harness)).toBe("s2");
    expect(q(harness, "dscf-messages")).not.toBeNull();
  });

  it("S2 热区点击 → 收起回 S1（composer 回简易态）", () => {
    harness = mount({ messages: [msg("m1", "user", "hi")] });
    // 直挂消息 = active → S1；热区展开
    fire(harness, "dscf-hotzone", "click");
    expect(phaseOf(harness)).toBe("s2");
    fire(harness, "dscf-hotzone", "click");
    expect(phaseOf(harness)).toBe("s1");
    expect(q(harness, "dscf-messages")).toBeNull();
  });

  it("S1（有消息）热区点击 → 展开进 S2", () => {
    harness = mount({ messages: [msg("m1", "user", "hi")] });
    fire(harness, "dscf-hotzone", "click");
    expect(phaseOf(harness)).toBe("s2");
  });

  it("「—」点击 → C 悬浮球（卡体退场，球体在场）", () => {
    harness = mount({ chipCount: 1 });
    fire(harness, "dscf-minimize", "click");
    expect(phaseOf(harness)).toBe("ball");
    expect(q(harness, "dscf-header")).toBeNull();
    expect(q(harness, "dscf-ball")).not.toBeNull();
  });

  it("「⧉」点击 → onExitFullscreen（退出全屏）", () => {
    const onExitFullscreen = vi.fn();
    harness = mount({ draft: "abc", onExitFullscreen });
    fire(harness, "dscf-fullscreen", "click");
    expect(onExitFullscreen).toHaveBeenCalledTimes(1);
  });
});

describe("Esc 逐层退", () => {
  it("S2 → S1 → C（逐层，不跳层）", () => {
    harness = mount({ messages: [msg("m1", "user", "hi")] });
    fire(harness, "dscf-hotzone", "click");
    expect(phaseOf(harness)).toBe("s2");
    fireKey(document, "Escape");
    expect(phaseOf(harness)).toBe("s1");
    fireKey(document, "Escape");
    expect(phaseOf(harness)).toBe("ball");
  });

  it("S0 无标题栏：Esc 直接收球", () => {
    harness = mount();
    expect(phaseOf(harness)).toBe("s0");
    fireKey(document, "Escape");
    expect(phaseOf(harness)).toBe("ball");
  });

  it("C 态 Esc 不再动作", () => {
    harness = mount({ chipCount: 1 });
    fire(harness, "dscf-minimize", "click");
    fireKey(document, "Escape");
    expect(phaseOf(harness)).toBe("ball");
  });
});

describe("点球 C 回归", () => {
  it("无未读 → 回 S1（有消息）/ S0（无消息）", () => {
    harness = mount({ chipCount: 1 });
    fire(harness, "dscf-minimize", "click");
    fire(harness, "dscf-ball", "click");
    expect(phaseOf(harness)).toBe("s1");

    harness.rerender({ chipCount: 0, draft: "" });
    fireKey(document, "Escape");
    fire(harness, "dscf-ball", "click");
    expect(phaseOf(harness)).toBe("s0");
  });

  it("有未读流式回复 → 点球直达 S2", () => {
    harness = mount({ messages: [msg("m1", "user", "hi")] });
    fire(harness, "dscf-minimize", "click");
    // 球态期间流式回复增长 = 未读
    harness.rerender({ messages: [msg("m1", "user", "hi"), msg("m2", "assistant", "答")], streaming: true });
    fire(harness, "dscf-ball", "click");
    expect(phaseOf(harness)).toBe("s2");
  });
});

describe("30s 空闲 + 3s 预告（可拦截）", () => {
  function armIdle(): void {
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
  }

  it("四条件齐备 30s → 预告（淡化 + 提示文案）", () => {
    harness = mount({ chipCount: 1 });
    // 无焦点：不聚焦输入区即满足「无焦点」
    armIdle();
    expect(phaseOf(harness)).toBe("s1");
    expect(q(harness, "dscf-preview")).not.toBeNull();
    expect(q(harness, "dscf-preview")?.textContent).toContain("即将收起");
  });

  it("预告 3s → 收成球 C", () => {
    harness = mount({ chipCount: 1 });
    armIdle();
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(phaseOf(harness)).toBe("ball");
  });

  it.each([
    ["草稿恢复", (h: Harness) => h.rerender({ draft: "新输入" })],
    ["hover 恢复", (h: Harness) => fire(h, "dscf-root", "mouseover")],
    ["流式恢复", (h: Harness) => h.rerender({ streaming: true })],
  ])("预告期间条件恢复（%s）→ 预告取消，不收球", (_, restore) => {
    harness = mount({ chipCount: 1 });
    armIdle();
    expect(q(harness, "dscf-preview")).not.toBeNull();
    restore(harness);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(phaseOf(harness)).not.toBe("ball");
    expect(q(harness, "dscf-preview")).toBeNull();
  });

  it("焦点在场 → 30s 不进入预告（四条件未齐）", () => {
    const face = makeFace();
    harness = mount({ chipCount: 1, composer: face });
    const wrapper = harness.container.querySelector("[data-dscf-official-input]")!;
    act(() => {
      wrapper.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(q(harness, "dscf-preview")).toBeNull();
    expect(phaseOf(harness)).toBe("s1");
  });

  it("流式钉死：流式期间任何时长都不自动收起（预告与收球禁用）", () => {
    harness = mount({ chipCount: 1, streaming: true });
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(phaseOf(harness)).not.toBe("ball");
    expect(q(harness, "dscf-preview")).toBeNull();
  });

  it("鼠标离开（mouseout）不收起", () => {
    harness = mount({ messages: [msg("m1", "user", "hi")] });
    fire(harness, "dscf-hotzone", "click");
    fire(harness, "dscf-root", "mouseout");
    expect(phaseOf(harness)).toBe("s2");
  });
});

describe("发送链与输入（官方复制件面）", () => {
  it("官方机器草稿 → 复制件 editor 回灌（共享草稿同步入复制件）", () => {
    const face = makeFace();
    harness = mount({ composer: face });
    act(() => {
      face.state = { ...face.state, draft: "外部草稿", draftRev: 3 };
      face.notify();
    });
    expect(qOff(harness, "[data-composer-input]")!.textContent).toContain("外部草稿");
  });

  it("流式中空草稿 = 官方 Stop 钮（禁用，无 stop 面）；非空草稿 = 发送（busy Enter 同径）", () => {
    const face = makeFace();
    harness = mount({ messages: [msg("m1", "user", "hi")], streaming: true, composer: face });
    fire(harness, "dscf-hotzone", "click");
    const stop = qOff(harness, 'button[aria-label="停止生成"]') as HTMLButtonElement;
    expect(stop).not.toBeNull();
    expect(stop.disabled).toBe(true);
    // 非空草稿 = busy Send（官方 submission policy：queue 投影）
    act(() => {
      face.state = { ...face.state, draft: "追 加", draftRev: 1 };
      face.notify();
    });
    const send = qOff(harness, 'button[aria-label="排队发送"]') as HTMLButtonElement;
    expect(send).not.toBeNull();
  });
});

describe("fix-12: quote chip 原生原子渲染（Lexical ReferenceChipNode，叠加层退役）", () => {
  const REF = "〔引用：文档摘要〕";

  it("分段纯函数：明文与引用段逐段拆分（raw/label 保真）", () => {
    expect(splitQuoteSegments(`前文${REF}后文`)).toEqual([
      { kind: "text", text: "前文" },
      { kind: "quote", raw: REF, label: "文档摘要" },
      { kind: "text", text: "后文" },
    ]);
  });

  it("无引用草稿 = 单明文段（不误伤 @\"path\" 官方 file mention 语法）", () => {
    expect(splitQuoteSegments('看 @"docs/x.md" 即可')).toEqual([
      { kind: "text", text: '看 @"docs/x.md" 即可' },
    ]);
  });

  it("官方机器草稿含 quote token → 复制件以原生 chip 呈现（非明文 token）", () => {
    const face = makeFace({ draft: `前${REF}后`, draftRev: 1 });
    harness = mount({ composer: face });
    act(() => {
      face.notify();
    });
    const editorRoot = qOff(harness, "[data-composer-input]")!;
    expect(editorRoot.textContent).toContain("前");
    expect(editorRoot.textContent).toContain("后");
    // 原子 chip：官方 ReferenceChip portal 在场（label 形态），明文 token 不见裸形
    const chip = harness.container.querySelector("[data-dscf-official-input] .dsh-composer-reference-chip, [data-dscf-official-input] [class*='reference']");
    expect(chip).not.toBeNull();
    expect(harness.container.querySelector("[data-dscf-official-input]")!.textContent).toContain("文档摘要");
    expect(editorRoot.textContent).not.toContain("〔引用：");
  });

  it("叠加 chip 层旧径退役（dscf-mirror / dscf-quote-chip / dscf-chips 计数行不在场）", () => {
    const face = makeFace({ draft: `前${REF}后`, draftRev: 1 });
    harness = mount({ composer: face, chipCount: 1 });
    expect(q(harness, "dscf-mirror")).toBeNull();
    expect(q(harness, "dscf-quote-chip")).toBeNull();
    expect(q(harness, "dscf-chips")).toBeNull();
  });
});

describe("标题栏热区光标 + 浮层 tooltip（应用风格，非原生 title）", () => {
  it("可展开/可折叠类名切换 + 热区不落原生 title 属性", () => {
    harness = mount({ messages: [msg("m1", "user", "hi")] });
    const hotzone = q(harness, "dscf-hotzone")!;
    expect(hotzone.className).toContain("dscf-hotzone-expand");
    expect(hotzone.hasAttribute("title")).toBe(false);
    fire(harness, "dscf-hotzone", "click");
    expect(hotzone.className).toContain("dscf-hotzone-collapse");
  });

  it("不可展开（无消息）热区无 chevron 光标类", () => {
    harness = mount({ chipCount: 1 });
    expect(q(harness, "dscf-hotzone")!.className).not.toContain("dscf-hotzone-expand");
    expect(q(harness, "dscf-hotzone")!.className).not.toContain("dscf-hotzone-collapse");
  });

  it("mousemove 显浮层 tooltip（展开/收起文案随向），离开即隐", () => {
    harness = mount({ messages: [msg("m1", "user", "hi")] });
    const hotzone = q(harness, "dscf-hotzone")!;
    fire(harness, "dscf-hotzone", "mousemove", { clientX: 40, clientY: 20 });
    const tooltip = q(harness, "dscf-tooltip");
    expect(tooltip?.textContent).toContain("展开");
    fire(harness, "dscf-hotzone", "click");
    fire(harness, "dscf-hotzone", "mousemove", { clientX: 50, clientY: 24 });
    expect(q(harness, "dscf-tooltip")?.textContent).toContain("收起");
    fire(harness, "dscf-hotzone", "mouseout");
    expect(q(harness, "dscf-tooltip")).toBeNull();
    void hotzone;
  });

  it("chevron 光标规则在注入样式表中（应用风格自定义光标，非系统指针）", () => {
    expect(SUPER_COMPOSER_CSS).toContain("dscf-hotzone-expand");
    expect(SUPER_COMPOSER_CSS).toContain("cursor:");
    expect(SUPER_COMPOSER_CSS).toContain("data:image/svg+xml");
    // 暗色锚随主题切换（body[data-ds-dark-theme] 覆写光标色）
    expect(SUPER_COMPOSER_CSS).toContain("data-ds-dark-theme");
  });

  it("bug 64817807: data-uri 内色值须转义 #（裸 # 截断 URI → 光标加载失败回落 ns-resize 双向箭头）", () => {
    // URL 片段语义：data-uri 中裸 `#` 起始 fragment，svg 截断解析失败，浏览器回落
    // ns-resize（↕ 双向）——用户所见双向箭头即此回落。色值必须 %23 转义。
    expect(SUPER_COMPOSER_CSS).toMatch(/%23[0-9a-fA-F]{6}/);
    expect(SUPER_COMPOSER_CSS).not.toMatch(/stroke='#|stroke="#/);
  });

  it("bug 64817807: 光标回落不得为双向箭头（expand=n-resize 单向上 / collapse=s-resize 单向下）", () => {
    // 光标与点击语义一致：可展开态单向上、可折叠态单向下；ns-resize（↕ 双向）禁用。
    expect(SUPER_COMPOSER_CSS).not.toContain("ns-resize");
    expect(SUPER_COMPOSER_CSS).toMatch(/dscf-hotzone-expand[^}]*n-resize/);
    expect(SUPER_COMPOSER_CSS).toMatch(/dscf-hotzone-collapse[^}]*s-resize/);
  });
});

describe("消息流投影", () => {
  it("S2 渲染消息文本 + 流式尾部标记", () => {
    harness = mount({
      messages: [msg("m1", "user", "问题"), msg("m2", "assistant", "回答中")],
      streaming: true,
    });
    fire(harness, "dscf-hotzone", "click");
    const flow = q(harness, "dscf-messages")!;
    expect(flow.textContent).toContain("问题");
    expect(flow.textContent).toContain("回答中");
    expect(flow.getAttribute("data-streaming")).toBe("true");
  });
});
