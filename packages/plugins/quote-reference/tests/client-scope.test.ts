// @vitest-environment happy-dom
// bug 复现钉（ba885f7d ①）：inject 兜底回调时点服务落在注入 scope 上——
// mountQuoteSelectionMenu 必须支持 scope 优先取服务切片（ctx 只作缺省），
// 否则真机划选菜单永不挂载（menuRootInDom=0）。
import { describe, expect, it } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import { mountQuoteSelectionMenu } from "../src/client/index.js";

const sessionsStub = {
  list: { getSnapshot: () => ({ byId: {} }) },
  binding: () => undefined,
};
const bailStub = (): undefined => undefined;

describe("bug: mountQuoteSelectionMenu scope 优先服务切片", () => {
  it("ctx 缺 sessions + 注入 scope 在场 = 菜单装配成功（真机 inject 兜底径）", () => {
    const ctx = {} as unknown as Context;
    const handle = mountQuoteSelectionMenu(ctx, { sessions: sessionsStub, bail: bailStub });
    expect(handle).toBeDefined();
    handle?.dispose();
  });

  it("scope 缺省 = ctx 兜底（直驱快路径同径装配）", () => {
    const handle = mountQuoteSelectionMenu({ sessions: sessionsStub, bail: bailStub } as unknown as Context);
    expect(handle).toBeDefined();
    handle?.dispose();
  });

  it("两源俱缺 sessions = undefined 不装配", () => {
    expect(mountQuoteSelectionMenu({} as unknown as Context)).toBeUndefined();
    expect(mountQuoteSelectionMenu({} as unknown as Context, { bail: bailStub })).toBeUndefined();
  });
});
