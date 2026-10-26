import { describe, expect, it, vi } from "vitest";
import {
  DOM_FULLSCREEN_SELECTORS,
  createFullscreenTracker,
  fullscreenFromDocument,
  fullscreenFromTabInfo,
  type FullscreenDom,
} from "../src/client/fullscreen.js";

/**
 * 全屏呈现感知纯逻辑单测（proposal §3 包二 fullscreen.ts）：
 * - 正门 = SidebarRightTabInfo.sidebar.fullscreen（tabInfo hook 订阅——本面只消费
 *   hook 已取出的布尔快照，React 侧订阅由 client face 组装缝承担）；
 * - 兜底 = DOM 标记（[data-sidebar-right-panel="fullscreen"] / [data-dockkit-*]
 *   全屏标记）——hook 形状漂移或缺席时的降级读数；
 * - 全屏语义 = 文档占中间 + 右侧区域、左侧栏保持不变（右栏 100vw 呈现态）。
 */

/** 稳定 DOM 桩：按选择器清单回放命中集合。 */
function stubDom(hits: string[] = []): FullscreenDom {
  return {
    querySelectorAll: (selectors: string) => (hits.includes(selectors) ? [{}] : []),
  };
}

describe("fullscreenFromTabInfo（正门——tabInfo hook 快照消费）", () => {
  it("sidebar.fullscreen 布尔逐值透传", () => {
    expect(fullscreenFromTabInfo({ sidebar: { fullscreen: true } })).toBe(true);
    expect(fullscreenFromTabInfo({ sidebar: { fullscreen: false } })).toBe(false);
  });

  it("形状漂移（缺 sidebar / 缺 fullscreen / 非布尔 / 非对象）= undefined", () => {
    expect(fullscreenFromTabInfo(undefined)).toBeUndefined();
    expect(fullscreenFromTabInfo(null)).toBeUndefined();
    expect(fullscreenFromTabInfo({})).toBeUndefined();
    expect(fullscreenFromTabInfo({ sidebar: {} })).toBeUndefined();
    expect(fullscreenFromTabInfo({ sidebar: { fullscreen: "yes" } })).toBeUndefined();
    expect(fullscreenFromTabInfo("fullscreen")).toBeUndefined();
  });
});

describe("fullscreenFromDocument（兜底——DOM 标记）", () => {
  it("默认选择器清单 = right panel fullscreen 主标记（评审 A2：dockkit 死选择器已删）", () => {
    expect(DOM_FULLSCREEN_SELECTORS).toEqual(['[data-sidebar-right-panel="fullscreen"]']);
  });

  it("命中标记 = true（right panel 主标记）", () => {
    expect(fullscreenFromDocument(stubDom(['[data-sidebar-right-panel="fullscreen"]']))).toBe(true);
  });

  it("无命中 = false；doc 缺席 = false", () => {
    expect(fullscreenFromDocument(stubDom([]))).toBe(false);
    expect(fullscreenFromDocument(undefined)).toBe(false);
  });
});

describe("createFullscreenTracker（正门优先 + DOM 兜底 + 订阅通知）", () => {
  it("正门布尔优先于 DOM：hook=false 而 DOM 命中 = false", () => {
    const tracker = createFullscreenTracker({
      readFullscreenFromHook: () => false,
      doc: stubDom(['[data-sidebar-right-panel="fullscreen"]']),
    });
    expect(tracker.isFullscreen()).toBe(false);
    tracker.dispose();
  });

  it("hook 在场 = true 直接采信", () => {
    const tracker = createFullscreenTracker({ readFullscreenFromHook: () => true });
    expect(tracker.isFullscreen()).toBe(true);
    tracker.dispose();
  });

  it("hook 形状漂移（undefined）→ DOM 兜底", () => {
    const tracker = createFullscreenTracker({
      readFullscreenFromHook: () => undefined,
      doc: stubDom(['[data-sidebar-right-panel="fullscreen"]']),
    });
    expect(tracker.isFullscreen()).toBe(true);
    tracker.dispose();
  });

  it("无 hook 无 doc = false（静默降级）", () => {
    const tracker = createFullscreenTracker({});
    expect(tracker.isFullscreen()).toBe(false);
    tracker.dispose();
  });

  it("watch 通知驱动重算——值变化才通知订阅者", () => {
    let hookValue: boolean | undefined = false;
    const notifyRef: Array<() => void> = [];
    const tracker = createFullscreenTracker({
      readFullscreenFromHook: () => hookValue,
      watch: (notify) => {
        notifyRef.push(notify);
        return () => {
          notifyRef.length = 0;
        };
      },
    });
    const seen: boolean[] = [];
    const unsubscribe = tracker.subscribe((fs) => seen.push(fs));

    hookValue = true;
    notifyRef[0]!();
    expect(seen, "false→true 变化通知").toEqual([true]);

    hookValue = true;
    notifyRef[0]!();
    expect(seen, "同值重算不重复通知").toEqual([true]);

    hookValue = undefined; // hook 漂移 → DOM 兜底缺席 = false
    notifyRef[0]!();
    expect(seen, "true→false 变化通知").toEqual([true, false]);

    unsubscribe();
    hookValue = true;
    notifyRef[0]!();
    expect(seen, "退订后不再通知").toEqual([true, false]);
    tracker.dispose();
  });

  it("dispose 幂等且停 watch；dispose 后 subscribe 静默无效", () => {
    const stopped = vi.fn();
    const notifyRef: Array<() => void> = [];
    let hookValue: boolean | undefined = false;
    const tracker = createFullscreenTracker({
      readFullscreenFromHook: () => hookValue,
      watch: (notify) => {
        notifyRef.push(notify);
        return stopped;
      },
    });
    tracker.dispose();
    tracker.dispose();
    expect(stopped, "dispose 停 watch").toHaveBeenCalledTimes(1);
    const seen: boolean[] = [];
    tracker.subscribe((fs) => seen.push(fs));
    hookValue = true;
    expect(() => notifyRef.forEach((n) => n())).not.toThrow();
    expect(seen, "dispose 后订阅不再收到通知").toEqual([]);
  });
});
