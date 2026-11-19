// conversation-views-face 注册面单测（1.13 迁移退役改锚——① dispatchTask 工具行与
// ② 事件折叠组三段已迁 @dsh-forge/task-loop（task-loop tests/ui 同批锚）；本面只余
// worktree 切换闸虚线标记行 ③：registered 恒含 dswf-worktree-switch，slots 劣形降级不注册。
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKTREE_SWITCH_ENTRY_ID,
  registerConversationToolFaces,
  type ConversationToolFacesDiagnostics,
} from "./conversation-views-face.js";

function fakeSlots() {
  const slots = {
    inject: (key: string, cb: () => (() => void) | undefined) => {
      const dispose = cb();
      return () => dispose?.();
    },
    register: (_options: Record<string, unknown>, _component: unknown) => () => {},
  };
  return { slots };
}

function register(ctx: unknown, slots: unknown): ConversationToolFacesDiagnostics {
  return registerConversationToolFaces(ctx as never, slots as never);
}

afterEach(() => vi.restoreAllMocks());

describe("worktree 切换闸标记行注册（1.13 六组件迁批后本面余量）", () => {
  it("slots 在场：registered 恒含 dswf-worktree-switch（①② 已迁 task-loop，不再出现）", () => {
    const { slots } = fakeSlots();
    const result = register({}, slots);
    expect(result.registered).toEqual([WORKTREE_SWITCH_ENTRY_ID]);
  });

  it("slots 劣形（inject 缺席）：fail-soft warn 不炸装配，registered 空", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = register({}, {});
    expect(result.registered).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});
