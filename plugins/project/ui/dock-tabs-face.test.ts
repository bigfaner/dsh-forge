// dock-tabs-face 注册面单测（bug fba7913c——apply 期 workspaces 闭包缓存退役 RED 面）：
// Desktop 官方服务惰性实例化——apply 点 ctx.get('workspaces') = undefined，inject 时点
// （真机槽 runtime 挂载）服务已在场；selfAnchor 必须在注入束（概览五行真值呈现前提）。
// 同页 sidebar/hero inject 期现查同服务成功——一败一成对照即本面缺陷定位锚。
import { describe, expect, it } from "vitest";
import { registerDockTabsFace } from "./dock-tabs-face.js";
import { DSWF_OVERVIEW_TAB_KIND } from "./dock-tabs/dock-tabs.js";

interface RegisteredEntry {
  options: Record<string, unknown>;
  component: unknown;
}

/** slots 夹具：inject 缝即时回调（挂载形态同型）——register 捕获 options（含 inject face 工厂） */
function slotsFake() {
  const registered: RegisteredEntry[] = [];
  return {
    registered,
    slots: {
      inject: (_key: string, callback: () => (() => void) | undefined) => callback(),
      register: (options: Record<string, unknown>, component: unknown) => {
        registered.push({ options, component });
        return () => undefined;
      },
    },
  };
}

/** locale 夹具（bind → t 键名回退同构） */
const localeFake = { bind: (_ns: string) => (key: string) => key };

/** sessions/uiWorkspace 夹具（inject 面构建所需最小形状） */
const sessionsFake = { list: { getSnapshot: () => ({ byId: {} }) } };
const uiWorkspaceFake = { openSession: () => undefined, startSession: () => undefined };

/** ctx 夹具（workspaces 服务惰性到位——get 逐调用现查 backing，无预置即 undefined） */
function ctxOf(backing: Record<string, unknown>) {
  return {
    get: (name: string) => backing[name],
    reflect: { get: () => undefined },
  };
}

describe("registerDockTabsFace（apply 早于服务实例化——bug fba7913c RED→GREEN）", () => {
  it("apply 点 workspaces undefined + inject 时点服务到位 = selfAnchor 在注入束（概览锚定真值前提）", () => {
    const backing: Record<string, unknown> = {
      sidebarRightTabs: { register: () => () => undefined },
      sessions: sessionsFake,
      uiWorkspace: uiWorkspaceFake,
      // workspaces 惰性实例化——apply 点缺席
    };
    const fake = slotsFake();
    const diag = registerDockTabsFace(ctxOf(backing) as never, fake.slots as never, localeFake as never);
    expect(diag.registered).toContain(DSWF_OVERVIEW_TAB_KIND);
    const overview = fake.registered.find((e) => e.options.key === DSWF_OVERVIEW_TAB_KIND);
    expect(overview).toBeDefined();
    // inject 时点（槽 runtime 挂载）服务已实例化——现查必须命中
    backing["workspaces"] = { list: { getSnapshot: () => ({ items: [] }) } };
    const face = (overview!.options.inject as () => Record<string, unknown>)();
    expect(face["selfAnchor"]).toBeDefined();
    expect((face["selfAnchor"] as Record<string, unknown>)["workspaces"]).toBe(backing["workspaces"]);
  });

  it("inject 时点 workspaces 仍缺席 = 无 selfAnchor 键（无退路维持空态，不悬空炸面）", () => {
    const backing: Record<string, unknown> = {
      sidebarRightTabs: { register: () => () => undefined },
      sessions: sessionsFake,
      uiWorkspace: uiWorkspaceFake,
    };
    const fake = slotsFake();
    registerDockTabsFace(ctxOf(backing) as never, fake.slots as never, localeFake as never);
    const overview = fake.registered.find((e) => e.options.key === DSWF_OVERVIEW_TAB_KIND);
    const face = (overview!.options.inject as () => Record<string, unknown>)();
    expect(face["selfAnchor"]).toBeUndefined();
  });
});
