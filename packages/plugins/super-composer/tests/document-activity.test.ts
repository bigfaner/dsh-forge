// @vitest-environment happy-dom
// document-activity 纯逻辑测试（1.39 文档活动判据——官方源码核销锚）。
import { describe, expect, it } from "vitest";
import {
  createDocumentActivityTracker,
  documentActivityFromDocument,
} from "../src/client/document-activity.js";
import { superComposerClient } from "../src/client/index.js";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** 全屏呈现源标记（tracker DOM 兜底读数）。 */
function setFullscreenMarker(on: boolean): void {
  document.querySelectorAll("[data-sidebar-right-panel]").forEach((el) => el.remove());
  if (on) {
    const pane = document.createElement("div");
    pane.setAttribute("data-dockkit-pane", "");
    document.body.appendChild(pane);
    pane.setAttribute("data-sidebar-right-panel", "fullscreen");
  }
}

const sessionsStub = {
  list: { getSnapshot: () => ({ byId: {} }) },
  binding: () => undefined,
};

function stubCtx(): { ctx: import("@deepseek-ai/cordis").Context; effects: Array<() => unknown> } {
  const effects: Array<() => unknown> = [];
  const ctx: Record<string, unknown> = {
    effect: (execute: () => unknown) => {
      effects.push(execute);
      return undefined;
    },
    sessions: sessionsStub,
  };
  return { ctx: ctx as unknown as import("@deepseek-ai/cordis").Context, effects };
}

/** 造 dockkit 布局面 + 可见 content（可选挂文档体锚）。 */
function buildDoc(options: { surface: boolean; visibleContent: boolean; docAnchor: boolean; hiddenAnchor?: boolean }): Document {
  document.body.innerHTML = "";
  if (options.surface) {
    const surface = document.createElement("div");
    surface.setAttribute("data-dockkit-surface", "true");
    document.body.appendChild(surface);
  }
  if (options.hiddenAnchor) {
    // 非可见 tabHost（aria-hidden）内的文档锚——不算活动
    const hidden = document.createElement("section");
    hidden.setAttribute("data-dockkit-content", "tab-doc");
    hidden.setAttribute("aria-hidden", "true");
    const anchor = document.createElement("div");
    anchor.setAttribute("data-textpreview-url", "dsh-resource://file/x");
    hidden.appendChild(anchor);
    document.body.appendChild(hidden);
  }
  if (options.visibleContent) {
    const section = document.createElement("section");
    section.setAttribute("data-dockkit-content", "tab-1");
    if (options.docAnchor) {
      const anchor = document.createElement("div");
      anchor.setAttribute("data-textpreview-url", "dsh-resource://file/x");
      section.appendChild(anchor);
    }
    document.body.appendChild(section);
  }
  return document;
}

describe("documentActivityFromDocument（判据读数）", () => {
  it("布局面缺席 = true（降级不收窄——宿主无 dockkit 布局）", () => {
    expect(documentActivityFromDocument(buildDoc({ surface: false, visibleContent: false, docAnchor: false }))).toBe(true);
  });

  it("doc 缺席 = true（降级）", () => {
    expect(documentActivityFromDocument(undefined)).toBe(true);
  });

  it("布局面在场 + 可见 content 内文档体锚 = 活动", () => {
    expect(documentActivityFromDocument(buildDoc({ surface: true, visibleContent: true, docAnchor: true }))).toBe(true);
  });

  it("布局面在场 + 可见 content 无文档体锚（非文档 tab/插件页/离文档）= 不活动", () => {
    expect(documentActivityFromDocument(buildDoc({ surface: true, visibleContent: true, docAnchor: false }))).toBe(false);
  });

  it("aria-hidden content 内的文档锚不算活动（切到非文档 tab，文档 tab 转后台）", () => {
    expect(
      documentActivityFromDocument(buildDoc({ surface: true, visibleContent: true, docAnchor: false, hiddenAnchor: true })),
    ).toBe(false);
  });

  it("辅锚 [data-document-preview] 与产品 dockkit 文档 tab body 锚 [data-dswf-doc-panel] 亦判活动", () => {
    for (const attr of ["data-document-preview", "data-dswf-doc-panel"]) {
      document.body.innerHTML = "";
      const surface = document.createElement("div");
      surface.setAttribute("data-dockkit-surface", "true");
      const section = document.createElement("section");
      section.setAttribute("data-dockkit-content", "t");
      const anchor = document.createElement("div");
      anchor.setAttribute(attr, "v");
      section.appendChild(anchor);
      surface.appendChild(section);
      document.body.appendChild(surface);
      expect(documentActivityFromDocument(document), attr).toBe(true);
      surface.remove();
    }
  });
});

describe("1.39 可见性合取（apply 正门 + MutationObserver 扇出）", () => {
  it("dockkit 布局面在场 + 可见文档锚 = 显示；aria-hidden 翻转切非文档 tab = 隐藏；回文档 tab = 恢复", async () => {
    setFullscreenMarker(true);
    const panel = document.createElement("div");
    panel.setAttribute("data-sidebar-right-panel", "fullscreen");
    document.body.appendChild(panel);
    const surface = document.createElement("div");
    surface.setAttribute("data-dockkit-surface", "true");
    document.body.appendChild(surface);
    const { ctx, effects } = stubCtx();
    try {
      superComposerClient.apply(ctx);
      await tick();
      // 布局面在场但无可见文档锚（非文档 tab）→ 隐藏
      expect(document.querySelector('[data-testid="dscf-root"]'), "非文档 tab 须隐藏").toBeNull();
      // 切到文档 tab：可见 content + 官方文档体锚（插入后补属性变更供 attributes
      // observer 扇出——与官方 dockkit aria-hidden/class 翻转同径）
      const section = document.createElement("section");
      section.setAttribute("data-dockkit-content", "tab-doc");
      const anchor = document.createElement("div");
      anchor.setAttribute("data-textpreview-url", "dsh-resource://file/a.md");
      section.appendChild(anchor);
      surface.appendChild(section);
      anchor.setAttribute("data-textpreview-url", "dsh-resource://file/a.md");
      await tick();
      await tick();
      expect(document.querySelector('[data-testid="dscf-root"]'), "文档 tab 回场须恢复显示").not.toBeNull();
      // 切回非文档 tab（官方 dockkit 切 tab = aria-hidden 翻转）→ 隐藏
      section.setAttribute("aria-hidden", "true");
      await tick();
      await tick();
      expect(document.querySelector('[data-testid="dscf-root"]'), "切走文档 tab 须隐藏").toBeNull();
    } finally {
      if (effects.length > 0) (effects[0]!() as () => void)();
      panel.remove();
      surface.remove();
      setFullscreenMarker(false);
    }
  });

  it("降级：dockkit 布局面缺席（无 surface）= 判据未知，保持全屏单信号语义", async () => {
    setFullscreenMarker(true);
    const { ctx, effects } = stubCtx();
    try {
      superComposerClient.apply(ctx);
      await tick();
      expect(document.querySelector('[data-testid="dscf-root"]')).not.toBeNull();
    } finally {
      if (effects.length > 0) (effects[0]!() as () => void)();
      setFullscreenMarker(false);
    }
  });
});

describe("createDocumentActivityTracker（推送语义）", () => {
  it("watch notify 值变化广播 + 值不变不广播 + dispose 后静默", () => {
    document.body.innerHTML = "";
    const surface = document.createElement("div");
    surface.setAttribute("data-dockkit-surface", "true");
    document.body.appendChild(surface);
    let notify: (() => void) | undefined;
    const watch = (cb: () => void): (() => void) => {
      notify = cb;
      return () => {
        notify = undefined;
      };
    };
    const tracker = createDocumentActivityTracker({ doc: document, watch });
    const seen: boolean[] = [];
    tracker.subscribe((active) => seen.push(active));
    // 无锚 → false；挂锚 → true 扇出；再摘回 → false 扇出
    expect(tracker.isActive()).toBe(false);
    const section = document.createElement("section");
    section.setAttribute("data-dockkit-content", "t");
    const anchor = document.createElement("div");
    anchor.setAttribute("data-textpreview-url", "u");
    section.appendChild(anchor);
    surface.appendChild(section);
    notify!();
    expect(seen).toEqual([true]);
    notify!(); // 值不变不广播
    expect(seen).toEqual([true]);
    tracker.dispose();
    notify?.();
    expect(seen).toEqual([true]);
    expect(tracker.isActive()).toBe(true); // dispose 只停推送，拉取仍可用
  });
});
