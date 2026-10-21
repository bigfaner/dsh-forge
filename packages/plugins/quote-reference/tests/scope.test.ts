import { describe, expect, it } from "vitest";
import {
  DEFAULT_FULLSCREEN_SURFACE,
  DEFAULT_SELECTION_ROOTS,
  isQuotableSelection,
  resolveSelectionScope,
  type SelectionProbe,
} from "../src/client/scope.js";

/** 合法选区基线探针（各排除用例在此上改单一字段）。 */
function quotable(overrides: Partial<SelectionProbe> = {}): SelectionProbe {
  return {
    collapsed: false,
    editableTarget: false,
    overlayRole: null,
    scopeRoot: "[data-dockkit-pane]",
    ...overrides,
  };
}

describe("resolveSelectionScope（组合配置解析）", () => {
  it("未声明 = 默认全量覆盖：默认 root 清单 + 监听挂起 + 默认全屏源", () => {
    const scope = resolveSelectionScope();
    expect(scope.selectionRoots).toEqual(DEFAULT_SELECTION_ROOTS);
    expect(scope.listening).toBe(true);
    expect(scope.fullscreenSurface).toBe(DEFAULT_FULLSCREEN_SURFACE);
  });

  it("声明为空清单 = 插件静默不挂监听（零固定税）", () => {
    const scope = resolveSelectionScope({ selection: { roots: [] } });
    expect(scope.selectionRoots).toEqual([]);
    expect(scope.listening).toBe(false);
  });

  it("roots 未声明而其他面声明 = 监听仍按默认清单挂起", () => {
    const scope = resolveSelectionScope({
      fullscreen: { surface: "custom-fullscreen" },
    });
    expect(scope.selectionRoots).toEqual(DEFAULT_SELECTION_ROOTS);
    expect(scope.listening).toBe(true);
    expect(scope.fullscreenSurface).toBe("custom-fullscreen");
  });

  it("roots 可增删收窄——声明清单即监听域（可引用域 = 声明清单）", () => {
    const roots = ["[data-my-doc]", "[data-chat-messages]"];
    const scope = resolveSelectionScope({ selection: { roots } });
    expect(scope.selectionRoots).toEqual(roots);
    expect(scope.listening).toBe(true);
  });

  it("bug: 默认清单对齐官方真实 DOM（[data-chat-flow] 官方核销锚在场；[data-chat-messages] 退役）", () => {
    expect(DEFAULT_SELECTION_ROOTS).toContain("[data-chat-flow]");
    expect(DEFAULT_SELECTION_ROOTS).not.toContain("[data-chat-messages]");
  });

  it("fullscreen.surface 未声明 = rightbar fullscreen 默认", () => {
    expect(DEFAULT_FULLSCREEN_SURFACE).toBe("rightbar-fullscreen");
    expect(resolveSelectionScope({}).fullscreenSurface).toBe("rightbar-fullscreen");
  });
});

describe("isQuotableSelection（选区过滤纯模型）", () => {
  it("非折叠选区 + 声明域内 = 可引用", () => {
    expect(isQuotableSelection(quotable())).toBe(true);
  });

  it("折叠选区排除", () => {
    expect(isQuotableSelection(quotable({ collapsed: true }))).toBe(false);
  });

  it.each([
    ["input", { editableTarget: true }],
    ["textarea", { editableTarget: true }],
    ["contenteditable", { editableTarget: true }],
  ])("编辑域（%s）划选排除", (_label, overrides) => {
    expect(isQuotableSelection(quotable(overrides))).toBe(false);
  });

  it("浮层输入区排除", () => {
    expect(
      isQuotableSelection(quotable({ overlayRole: "input" })),
    ).toBe(false);
  });

  it("浮层控件区排除", () => {
    expect(
      isQuotableSelection(quotable({ overlayRole: "control" })),
    ).toBe(false);
  });

  it("浮层标题区排除", () => {
    expect(
      isQuotableSelection(quotable({ overlayRole: "title" })),
    ).toBe(false);
  });

  it("scope 声明外的划选域排除（可引用域 = 声明清单）", () => {
    expect(isQuotableSelection(quotable({ scopeRoot: null }))).toBe(false);
    expect(
      isQuotableSelection(quotable({ scopeRoot: "[data-not-declared]" })),
    ).toBe(false);
  });

  it("替身/浮层消息正文（无浮层角色标记）不在排除集——可引用域仍由声明清单裁定", () => {
    expect(
      isQuotableSelection(
        quotable({ scopeRoot: "[data-chat-flow]", overlayRole: null }),
      ),
    ).toBe(true);
  });
});
