// @vitest-environment happy-dom
// official-chatview 复制件装配测试（1.28）：SurrogateChatView 以官方 ConversationContent
// 复制件渲染替身消息流——user 气泡走 MessageItem/projectUserText 官方投影、assistant 走
// AssistantMarkdown/MarkdownText、composer 槽承载注入节点、官方 scrollport 吸底、quote
// mention `〔引用：..〕` 明文投影（形状集零命中——与官方 chat-view 同源形态）。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SurrogateChatView, assistantBlocksOf } from "../src/client/official-chatview/surrogate-chatview.js";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(element: React.ReactElement): HTMLElement {
  act(() => {
    root!.render(element);
  });
  return container!;
}

describe("SurrogateChatView（官方 ConversationContent 复制件装配）", () => {
  it("官方骨架在场：data-conversation-content + 官方 scrollport + composerSeat；composer 槽承载注入节点", () => {
    const dom = render(
      <SurrogateChatView
        messages={[{ id: "m1", role: "user", content: "历史消息一" }]}
        streaming={false}
        composerBar={<div data-testid="composer-slot-marker" />}
      />,
    );
    expect(dom.querySelector("[data-conversation-content]")).not.toBeNull();
    expect(dom.querySelector("[data-conversation-scroll]")).not.toBeNull();
    expect(dom.querySelector("[data-composer-seat]")).not.toBeNull();
    expect(dom.querySelector("[data-testid='composer-slot-marker']")).not.toBeNull();
    // 会话行落在 conversation.session 槽（durable 历史消息完整显示）
    expect(dom.querySelector("[data-conversation-scroll]")!.textContent).toContain("历史消息一");
  });

  it("user 气泡 = 官方 MessageItem 投影（.bubble + projectUserText 纯文本）；quote mention 不落 file chip 形状", () => {
    const dom = render(
      <SurrogateChatView
        messages={[
          { id: "m1", role: "user", content: "〔引用：文本引用锚定的核心〕 这段什么意思？" },
          { id: "m2", role: "assistant", content: "回答正文" },
        ]}
        streaming={false}
      />,
    );
    const scroll = dom.querySelector("[data-conversation-scroll]")!;
    expect(scroll.textContent).toContain("〔引用：文本引用锚定的核心〕");
    expect(scroll.textContent).toContain("回答正文");
    // 官方气泡 chrome 类（MessageItem.module.css 类名恒等映射）在场
    expect(dom.querySelector("[class*='userRow']")).not.toBeNull();
    expect(dom.querySelector("[class*='bubble']")).not.toBeNull();
    // 形状集零命中：uuid/file chip 锚（projectUserText file chip 渲染为交互 chip）不在场
    expect(dom.querySelector("[data-dsh-file-chip], [class*='fileChip']")).toBeNull();
  });

  it("流式：末条 assistant 行 MarkdownText streaming 标记 + wrapper data-streaming", () => {
    const dom = render(
      <SurrogateChatView
        messages={[
          { id: "m1", role: "user", content: "问" },
          { id: "live:a1", role: "assistant", content: "回" },
        ]}
        streaming={true}
      />,
    );
    expect(dom.querySelector("[data-testid='dscf-messages']")!.getAttribute("data-streaming")).toBe("true");
    expect(dom.querySelector("[data-streaming='true']")).not.toBeNull();
  });

  it("assistantBlocksOf：空文本 = 零块（hasVisible 空壳跳过），非空 = 单 text 块", () => {
    expect(assistantBlocksOf("")).toEqual([]);
    expect(assistantBlocksOf("回答")).toEqual([{ kind: "text", text: "回答" }]);
  });
});
