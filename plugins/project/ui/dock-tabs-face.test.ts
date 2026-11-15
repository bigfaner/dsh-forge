// dock-tabs-face 注册面单测（bug fba7913c——apply 期 workspaces 闭包缓存退役 RED 面）：
// Desktop 官方服务惰性实例化——apply 点 ctx.get('workspaces') = undefined，inject 时点
// （真机槽 runtime 挂载）服务已在场；selfAnchor 必须在注入束（概览五行真值呈现前提）。
// 同页 sidebar/hero inject 期现查同服务成功——一败一成对照即本面缺陷定位锚。
import { describe, expect, it } from "vitest";
import { registerDockTabsFace } from "./dock-tabs-face.js";
import { installForgeRemoteFace } from "./rpc.js";
import { DSWF_OVERVIEW_TAB_KIND, ForgeOverviewSectionHost, OVERVIEW_SECTIONS_CHILDREN } from "./dock-tabs/dock-tabs.js";

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

describe("概览 keyed body 注册/挂载拆分（bug 757b0441 RED→GREEN——apply 期 sessions/uiWorkspace 缺席不阻断注册）", () => {
  it("apply 点 sessions/uiWorkspace 缺席 = 概览 keyed body 仍注册成立（tab 骨架恒在，注册不绑数据服务）", () => {
    const backing: Record<string, unknown> = {
      sidebarRightTabs: { register: () => () => undefined },
      // sessions/uiWorkspace electron dev 宿主 apply 点缺席（bug 757b0441 实锤）
    };
    const fake = slotsFake();
    const diag = registerDockTabsFace(ctxOf(backing) as never, fake.slots as never, localeFake as never);
    const overview = fake.registered.find((e) => e.options.key === DSWF_OVERVIEW_TAB_KIND);
    expect(diag.registered).toContain(`${"sidebar.right.pane.tab"}:${DSWF_OVERVIEW_TAB_KIND}`);
    expect(overview).toBeDefined();
  });

  it("注册后服务到场：inject 时点现查命中 = 会话动作面在注入束（到场补挂真值内容）", () => {
    const backing: Record<string, unknown> = {
      sidebarRightTabs: { register: () => () => undefined },
    };
    const fake = slotsFake();
    registerDockTabsFace(ctxOf(backing) as never, fake.slots as never, localeFake as never);
    const overview = fake.registered.find((e) => e.options.key === DSWF_OVERVIEW_TAB_KIND)!;
    // 挂载时点（槽 runtime 求值 inject 工厂）服务已实例化——现查必须命中
    backing["sessions"] = sessionsFake;
    backing["uiWorkspace"] = uiWorkspaceFake;
    backing["workspaces"] = { list: { getSnapshot: () => ({ items: [] }) } };
    const face = (overview.options.inject as () => Record<string, unknown>)();
    expect(face["selfAnchor"]).toBeDefined();
    expect(typeof face["onOpenSession"]).toBe("function");
    expect(face["openSession"]).toBeDefined();
    expect(typeof face["addBugToSession"]).toBe("function");
  });

  it("挂载时点服务仍缺席 = 会话动作面整体缺键（空态呈现，不悬空炸面）", () => {
    const backing: Record<string, unknown> = {
      sidebarRightTabs: { register: () => () => undefined },
    };
    const fake = slotsFake();
    registerDockTabsFace(ctxOf(backing) as never, fake.slots as never, localeFake as never);
    const overview = fake.registered.find((e) => e.options.key === DSWF_OVERVIEW_TAB_KIND)!;
    const face = (overview.options.inject as () => Record<string, unknown>)();
    expect(face["onOpenSession"]).toBeUndefined();
    expect(face["onOpenWorkerSession"]).toBeUndefined();
    expect(face["openSession"]).toBeUndefined();
    expect(face["addBugToSession"]).toBeUndefined();
    expect(face["selfAnchor"]).toBeUndefined();
    expect(face["makeClient"]).toBeDefined();
  });
});

describe("项目台插槽节宿主（fix-7——project.section.knowledge-dir 槽声明缝 + 渲染消费面）", () => {
  it("概览 keyed body 注册携 children 槽声明：project.section.knowledge-dir = keyed/root（宿主单点声明——settings-unification 圆桌裁定）", () => {
    const backing: Record<string, unknown> = {
      sidebarRightTabs: { register: () => () => undefined },
    };
    const fake = slotsFake();
    registerDockTabsFace(ctxOf(backing) as never, fake.slots as never, localeFake as never);
    const overview = fake.registered.find((e) => e.options.key === DSWF_OVERVIEW_TAB_KIND)!;
    expect(overview.options.children).toEqual(OVERVIEW_SECTIONS_CHILDREN);
    expect(OVERVIEW_SECTIONS_CHILDREN).toEqual({
      "project.section.knowledge-dir": { kind: "keyed", scope: "root" },
    });
  });

  it("概览 keyed body 组件 = 插槽节宿主（ForgeOverviewSectionHost——renderSlot 消费面）", () => {
    const backing: Record<string, unknown> = {
      sidebarRightTabs: { register: () => () => undefined },
    };
    const fake = slotsFake();
    registerDockTabsFace(ctxOf(backing) as never, fake.slots as never, localeFake as never);
    const overview = fake.registered.find((e) => e.options.key === DSWF_OVERVIEW_TAB_KIND)!;
    expect(overview.component).toBe(ForgeOverviewSectionHost);
  });
});

describe("概览注入束 makeClient（fix-15——官方宿主无 window.dshForge RED→GREEN）", () => {
  /** Typert face 夹具（forgeProjects.list 命中 + forgeTasks namespace 缺席——官方宿主通道面） */
  function faceFake() {
    return {
      forgeProjects: { list: async () => ({ ok: true, value: [{ id: "p-1", workspaceId: "w-1", name: "n", wsPath: "Z:/x", archived: false }] }) },
      forgeFs: {},
      forgeBugs: {},
      forgeWorktree: {},
      forgeProposals: {},
      forgeFeatures: {},
      forgeDirs: {},
      // forgeTasks/forgeDocs/forgeKnowledge/forgeSettings 官方宿主无对应 namespace
    };
  }

  it("注入束携 makeClient：无 dshForge 环境构造不炸，Typert 在场通道送达、缺席通道 typed 降级", async () => {
    delete (globalThis as { dshForge?: unknown }).dshForge;
    installForgeRemoteFace(faceFake as never);
    const backing: Record<string, unknown> = {
      sidebarRightTabs: { register: () => () => undefined },
      sessions: sessionsFake,
      uiWorkspace: uiWorkspaceFake,
      workspaces: { list: { getSnapshot: () => ({ items: [] }) } },
    };
    const fake = slotsFake();
    registerDockTabsFace(ctxOf(backing) as never, fake.slots as never, localeFake as never);
    const overview = fake.registered.find((e) => e.options.key === DSWF_OVERVIEW_TAB_KIND);
    const face = (overview!.options.inject as () => Record<string, unknown>)();
    const makeClient = face["makeClient"] as () => { projects: { list(): Promise<unknown> }; tasks: { list(q: unknown): Promise<unknown> } };
    expect(typeof makeClient).toBe("function");
    const client = makeClient(); // 构造期零 window.dshForge 依赖——不抛
    const rows = (await client.projects.list()) as { id: string }[];
    expect(rows[0]!.id).toBe("p-1");
    // 缺席通道 = typed 拒绝（错误相位收敛），非「window.dshForge 缺席」构造崩
    await expect(client.tasks.list({ projectId: "p-1" })).rejects.toThrow(/通道在官方宿主不可达/);
  });

  it("文档 keyed body 注入束同样携 makeClient（同族残留同批斩除）", () => {
    delete (globalThis as { dshForge?: unknown }).dshForge;
    installForgeRemoteFace(faceFake as never);
    const backing: Record<string, unknown> = {
      sidebarRightTabs: { register: () => () => undefined },
      sessions: sessionsFake,
      uiWorkspace: uiWorkspaceFake,
    };
    const fake = slotsFake();
    registerDockTabsFace(ctxOf(backing) as never, fake.slots as never, localeFake as never);
    const doc = fake.registered.find((e) => e.options.key === "dswf-doc");
    expect(doc).toBeDefined();
    const face = (doc!.options.inject as () => Record<string, unknown>)();
    expect(typeof face["makeClient"]).toBe("function");
  });

  it("结构门：typert-transport 全文件零 window.dshForge/preload 引用（同族传输残留机检——fix-14 门①同型）", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "dock-tabs", "typert-transport.ts"), "utf-8");
    expect(source).not.toMatch(/dshForge|preloadTransport|window\./);
  });
});
