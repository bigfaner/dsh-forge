// @vitest-environment happy-dom
// mini-composer 一体卡四态状态机全转换测试（真实 DOM——happy-dom；fake timers 承载
// 30s 空闲 + 3s 预告时序）。转换表逐条（proposal §UI/UX 交互规格）：
// 标题栏热区开合 /「—」收球 /「⧉」退全屏 / Esc 逐层 / 发送自动展开 / 流式钉死 /
// 30s 四条件 + 3s 预告（可拦截）/ 点球未读直达 S2 / 鼠标离开不收起。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MiniComposerCard,
  type MiniComposerMessage,
  type MiniComposerProps,
} from "../src/client/mini-composer.js";
import { SUPER_COMPOSER_CSS } from "../src/client/styles.js";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  root: Root;
  container: HTMLElement;
  rerender(props: Partial<MiniComposerProps>): void;
  unmount(): void;
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
  it("初始 = S0 输入卡：无标题栏、无消息流、无控件行（简易 composer）", () => {
    harness = mount();
    expect(phaseOf(harness)).toBe("s0");
    expect(q(harness, "dscf-header")).toBeNull();
    expect(q(harness, "dscf-messages")).toBeNull();
    expect(q(harness, "dscf-controls")).toBeNull();
    expect(q(harness, "dscf-input")).not.toBeNull();
  });

  it.each([
    ["chip", { chipCount: 1 }],
    ["草稿", { draft: "hello" }],
    ["消息", { messages: [msg("m1", "user", "hi")] }],
  ])("active 判据（%s）→ S1 标题栏态：标题栏在场 + composer 仍简易", (_, props) => {
    harness = mount(props);
    expect(phaseOf(harness)).toBe("s1");
    expect(q(harness, "dscf-header")).not.toBeNull();
    expect(q(harness, "dscf-messages")).toBeNull();
    expect(q(harness, "dscf-controls")).toBeNull();
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

  it("发送首条消息 → 自动进入 S2（消息流 + 完整控件行）", () => {
    harness = mount({ draft: "hi" });
    const input = q(harness, "dscf-input") as HTMLTextAreaElement;
    fireKey(input, "Enter");
    harness.rerender({ draft: "", messages: [msg("m1", "user", "hi")] });
    expect(phaseOf(harness)).toBe("s2");
    expect(q(harness, "dscf-messages")).not.toBeNull();
    expect(q(harness, "dscf-controls")).not.toBeNull();
  });

  it("S2 热区点击 → 收起回 S1（composer 回简易态）", () => {
    harness = mount({ messages: [msg("m1", "user", "hi")] });
    // 直挂消息 = active → S1；热区展开
    fire(harness, "dscf-hotzone", "click");
    expect(phaseOf(harness)).toBe("s2");
    fire(harness, "dscf-hotzone", "click");
    expect(phaseOf(harness)).toBe("s1");
    expect(q(harness, "dscf-messages")).toBeNull();
    expect(q(harness, "dscf-controls")).toBeNull();
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

  it("S0 无标题栏：Esc 直接收球（active 前置只有 S0/S2 之外的中间层 = S1）", () => {
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
    harness = mount({ chipCount: 1 });
    const input = q(harness, "dscf-input") as HTMLTextAreaElement;
    act(() => {
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
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

describe("发送链与输入", () => {
  it("Enter 发送：onSend 携带草稿 + 自动展开；Shift+Enter 不发送", () => {
    const onSend = vi.fn();
    harness = mount({ draft: "问题", onSend });
    const input = q(harness, "dscf-input") as HTMLTextAreaElement;
    fireKey(input, "Enter", { shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireKey(input, "Enter");
    expect(onSend).toHaveBeenCalledWith("问题");
  });

  it("空草稿 Enter 不发送", () => {
    const onSend = vi.fn();
    harness = mount({ onSend });
    fireKey(q(harness, "dscf-input") as HTMLTextAreaElement, "Enter");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("输入触发 onDraftChange", () => {
    const onDraftChange = vi.fn();
    harness = mount({ onDraftChange });
    const input = q(harness, "dscf-input") as HTMLTextAreaElement;
    // React value tracker 拦截直接赋值（视为无变化而吞掉 onChange）——走原型原生
    // setter 绕过 tracker，再派发 input 事件（testing-library 同款配方）。
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    nativeSetter.call(input, "x");
    act(() => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // 1.7 起 onDraftChange 携带 caret（mention 官方 track 检测入口的光标偏移）
    expect(onDraftChange).toHaveBeenCalledWith("x", expect.any(Number));
  });

  it("流式中发送钮 = 禁用态（评审 C3：不再假「停止」标签），点击不重复提交", () => {
    const onSend = vi.fn();
    harness = mount({ messages: [msg("m1", "user", "hi")], streaming: true, onSend });
    fire(harness, "dscf-hotzone", "click");
    const send = q(harness, "dscf-send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(send.getAttribute("aria-label")).toBe("生成中");
    fire(harness, "dscf-send", "click");
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("bug f863404a: 输入以本地态为源（官方投影回摆不清空 textarea）", () => {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;

  function typeInto(h: Harness, text: string): void {
    const input = q(h, "dscf-input") as HTMLTextAreaElement;
    nativeSetter.call(input, text);
    act(() => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("输入后 props.draft 回摆空串：textarea 保持所键文本（受控回读链不回滚）", () => {
    harness = mount();
    typeInto(harness, "回读样本");
    expect((q(harness, "dscf-input") as HTMLTextAreaElement).value).toBe("回读样本");
    // 官方 store 周期性回摆（真机 run3/run4 取证）：投影重渲染以旧值回灌
    harness.rerender({ draft: "" });
    expect((q(harness, "dscf-input") as HTMLTextAreaElement).value).toBe("回读样本");
  });

  it("外部非空草稿变更（chip 插入径）采纳投影：textarea 跟随增长", () => {
    harness = mount();
    typeInto(harness, "abc");
    harness.rerender({ draft: "abc@\"docs/x.md\"" });
    expect((q(harness, "dscf-input") as HTMLTextAreaElement).value).toBe("abc@\"docs/x.md\"");
  });

  it("本机输入回声（props.draft 回灌同值）不抖动", () => {
    harness = mount();
    typeInto(harness, "abc");
    harness.rerender({ draft: "abc" });
    expect((q(harness, "dscf-input") as HTMLTextAreaElement).value).toBe("abc");
  });

  it("发送后本地清稿：textarea 清空且 onSend 携带所键文本", () => {
    const onSend = vi.fn();
    harness = mount({ onSend });
    typeInto(harness, "替身发送样本");
    fireKey(q(harness, "dscf-input") as HTMLTextAreaElement, "Enter");
    expect(onSend).toHaveBeenCalledWith("替身发送样本");
    expect((q(harness, "dscf-input") as HTMLTextAreaElement).value).toBe("");
  });
});

describe("bug 008d44e7: 发送钮逐位对齐官方 composer（InputBar .primary 形态）", () => {
  function openS2(): Harness {
    harness = mount({ messages: [msg("m1", "user", "hi")], draft: "" });
    fire(harness, "dscf-hotzone", "click");
    return harness;
  }

  it("发送钮 = 官方主题色圆钮：info-fill 令牌背景 + #fff + 999px 圆 + 34×34 + 右下定位", () => {
    openS2();
    const send = q(harness, "dscf-send") as HTMLButtonElement;
    const style = send.style;
    expect(style.background).toContain("var(--dsw-alias-button-info-fill)");
    expect(style.color).toBe("#fff");
    expect(style.borderRadius).toBe("999px");
    expect(style.width).toBe("34px");
    expect(style.height).toBe("34px");
    // 右下定位：控件行内 flex 尾随（前置 flex:1 占位把钮推到行尾=卡体右下）
    const row = q(harness, "dscf-controls")!;
    expect(row.children[row.children.length - 1]).toBe(send);
    // 官方 transition / hover / disabled 态令牌
    expect(style.transition).toContain("background-color");
  });

  it("发送钮图标 = 官方 16×16 svg 箭头（viewBox 0 0 16 16），非文本字形", () => {
    openS2();
    const send = q(harness, "dscf-send")!;
    const svg = send.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("viewBox")).toBe("0 0 16 16");
    expect(svg!.getAttribute("width")).toBe("16");
    expect(send.textContent!.trim()).not.toContain("↑");
  });

  it("流式停止图标 = 官方圆角方块 rect（rx 3），非文本「■」", () => {
    harness = mount({ messages: [msg("m1", "user", "hi")], streaming: true });
    fire(harness, "dscf-hotzone", "click");
    const send = q(harness, "dscf-send")!;
    const rect = send.querySelector("svg rect");
    expect(rect).not.toBeNull();
    expect(rect!.getAttribute("rx")).toBe("3");
    expect(send.textContent!.trim()).not.toContain("■");
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
