// 装配缝测试（host 入口 expertSquadPlugin——routes 依赖面供给接线）：
// ① bug 4ed8549f：update 通道真装配——fail-loud 占位（"expert update channel not
//    assembled yet"）必须替换为真实写面（project 层 <workspace>/.dsh/experts/<key>.md
//    写盘 + 回包换新档案）；② bug 34a284e3：enable/disable 回包 = 换新档案
//    （client defaultDetailMutations 契约消费 updated.enabled，{ok:true} 即渲染断链）。

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FetchRouteLike } from "../src/routes.js";
import expertSquadPlugin from "../src/index.js";

const KEY = "test-reviewer";

// bug 31a989d2 观测探针：包裹 ExpertWatchManager 记录实例化与 dispose（透明包装，
// 行为零差异——只多记存活面）。vi.hoisted 供 mock 工厂与用例共享。
const watchProbe = vi.hoisted(() => ({
  instances: [] as Array<{ isDisposed: () => boolean }>,
}));
vi.mock("../src/store/watch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/store/watch.js")>();
  class CountingExpertWatchManager extends actual.ExpertWatchManager {
    private disposed = false;
    constructor(...args: ConstructorParameters<typeof actual.ExpertWatchManager>) {
      super(...args);
      watchProbe.instances.push({ isDisposed: () => this.disposed });
    }
    override async dispose(): Promise<void> {
      this.disposed = true;
      await super.dispose();
    }
  }
  return { ...actual, ExpertWatchManager: CountingExpertWatchManager };
});

/** project 层夹具档案（同 e2e 形状：frontmatter 必填齐 + 人设正文）。 */
function expertMd(name: string, title: string): string {
  return [
    "---",
    `name: ${name}`,
    "description: >-",
    "  Fixture expert for assemble tests.",
    `title: ${title}`,
    "tools: [read, grep]",
    "skills: [review]",
    "---",
    "",
    "## 职责",
    "",
    "评审变更。",
    "",
  ].join("\n");
}

let wsDir: string | undefined;
let disposers: Array<() => unknown> = [];

function makeWorkspace(): string {
  wsDir = mkdtempSync(join(tmpdir(), "dsh-forge-xsq-assemble-ws-"));
  const expertsDir = join(wsDir, ".dsh", "experts");
  mkdirSync(expertsDir, { recursive: true });
  writeFileSync(join(expertsDir, `${KEY}.md`), expertMd(KEY, "夹具评审"));
  return wsDir;
}

afterEach(async () => {
  // 先 disposer（关 watcher）再删夹具：root 删除会触发重挂爬升至 Temp 祖先（热刷新
  // 接线后的真实语义），先关 watcher 避免遍历成本外溢到后续用例。
  // cordis effect 契约：effect(cb) 的 cb() 返回值才是 disposer。
  for (const effect of disposers) {
    const dispose = effect();
    if (typeof dispose === "function") await dispose();
  }
  disposers = [];
  if (wsDir !== undefined) rmSync(wsDir, { recursive: true, force: true });
  wsDir = undefined;
});

/** 装配插件（storage 缺席 = 内存态降级路径），返回已注册路由族。 */
async function boot(): Promise<FetchRouteLike[]> {
  const routes: FetchRouteLike[] = [];
  await expertSquadPlugin({
    connection: {
      fetch: {
        register: (route: FetchRouteLike): unknown => {
          routes.push(route);
          return route;
        },
      },
    },
    effect: (dispose: () => unknown): unknown => {
      disposers.push(dispose);
      return undefined;
    },
  });
  return routes;
}

function routeOf(routes: readonly FetchRouteLike[], endpoint: string): FetchRouteLike {
  const hit = routes.find((r) => r.path === `/api/expert-squad/${endpoint}`);
  if (hit === undefined) throw new Error(`路由未注册：${endpoint}`);
  return hit;
}

async function post(route: FetchRouteLike, body: unknown): Promise<{ status: number; json: unknown; text: string }> {
  const res = await route.fetch(
    new Request(`http://host${route.path}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text };
}

describe("bug 34a284e3: enable/disable 回包契约（换新档案而非 {ok:true}）", () => {
  it("POST disable：回包 = 换新档案（enabled=false）且状态即时生效", async () => {
    const ws = makeWorkspace();
    const routes = await boot();
    const result = await post(routeOf(routes, "disable"), { workspace: ws, key: KEY });
    expect(result.status, `disable 应成功：${result.text}`).toBe(200);
    const entry = result.json as { name?: string; enabled?: boolean };
    expect(entry.name).toBe(KEY);
    expect(entry.enabled, "回包档案 enabled=false（client defaultDetailMutations 契约）").toBe(false);
  });

  it("POST enable：回包 = 换新档案（enabled=true）", async () => {
    const ws = makeWorkspace();
    const routes = await boot();
    await post(routeOf(routes, "disable"), { workspace: ws, key: KEY });
    const result = await post(routeOf(routes, "enable"), { workspace: ws, key: KEY });
    expect(result.status).toBe(200);
    const entry = result.json as { name?: string; enabled?: boolean };
    expect(entry.name).toBe(KEY);
    expect(entry.enabled, "回包档案 enabled=true").toBe(true);
  });
});

describe("bug 4ed8549f: expert update 通道装配（host 装配缝）", () => {
  it("POST update：档案写盘到 project 层 + 回包换新档案（enabled 在场）", { timeout: 20_000 }, async () => {
    const ws = makeWorkspace();
    const routes = await boot();
    const result = await post(routeOf(routes, "update"), {
      workspace: ws,
      name: KEY,
      title: "复核岗",
      description: "updated description",
      tools: ["read", "bash"],
      skills: ["review", "tsc"],
      personaMd: "## 职责\n\n更新后的人设。",
    });
    expect(result.status, `update 应成功：${result.text}`).toBe(200);
    const entry = result.json as { name?: string; title?: string; enabled?: boolean; tools?: string[] };
    expect(entry.name).toBe(KEY);
    expect(entry.title, "回包 = 换新档案（新岗位）").toBe("复核岗");
    expect(entry.tools).toContain("bash");
    expect(entry.enabled, "enabled 标记在场（client ExpertView 契约）").toBe(true);
    // 落盘：project 层档案内容换新（重新扫描可见）
    const file = readFileSync(join(ws, ".dsh", "experts", `${KEY}.md`), "utf8");
    expect(file).toContain("复核岗");
    expect(file).toContain("bash");
  });

  it("POST update：裸 {{ 人设 → 400 且不落盘（frontmatter 门与 tool 写路径同源）", { timeout: 20_000 }, async () => {
    const ws = makeWorkspace();
    const routes = await boot();
    const before = readFileSync(join(ws, ".dsh", "experts", `${KEY}.md`), "utf8");
    const result = await post(routeOf(routes, "update"), {
      workspace: ws,
      name: KEY,
      title: "t",
      description: "d",
      tools: ["read"],
      personaMd: "bad {{ x",
    });
    expect(result.status).toBe(400);
    expect(readFileSync(join(ws, ".dsh", "experts", `${KEY}.md`), "utf8")).toBe(before);
  });
});

describe("bug 767e7580: run-state 读口装配 + subagent/end 监听接线", () => {
  /** 装配插件（捕获 subagent/end 监听与 effect），收集读口路由。 */
  async function bootWithEvents(): Promise<{
    routes: FetchRouteLike[];
    endListeners: Array<(...args: unknown[]) => unknown>;
  }> {
    const routes: FetchRouteLike[] = [];
    const endListeners: Array<(...args: unknown[]) => unknown> = [];
    await expertSquadPlugin({
      connection: {
        fetch: {
          register: (route: FetchRouteLike): unknown => {
            routes.push(route);
            return route;
          },
        },
      },
      on: (event: string, listener: (...args: unknown[]) => unknown): unknown => {
        if (event === "subagent/end") endListeners.push(listener);
        return undefined;
      },
      effect: (dispose: () => unknown): unknown => {
        disposers.push(dispose);
        return undefined;
      },
    } as never);
    return { routes, endListeners };
  }

  it("GET run-state 路由注册（GET 形制对齐既有路由族）", async () => {
    const { routes } = await bootWithEvents();
    const route = routes.find((r) => r.path === "/api/expert-squad/run-state");
    expect(route, "run-state 读口路由必须在装配期注册").toBeDefined();
    expect(route?.methods).toEqual(["GET"]);
    const res = await route!.fetch(new Request("http://host/api/expert-squad/run-state"));
    expect(res.status).toBe(200);
  });

  it("subagent/end 监听在装配期注册；end 载荷 → 面板换代 → 路由读口可见", async () => {
    const { routes, endListeners } = await bootWithEvents();
    expect(endListeners, "subagent/end 监听必须在装配期挂接").toHaveLength(1);
    // end 载荷 → 面板换代 → 路由读口：同链路单元组装取证（面板闭包在 apply 内，
    // 监听体即 observeSubagentEnd——markEnded 对未知 childId 零操作，读口恒 200）。
    endListeners[0]!({ id: "stranger", stopReason: "completed" });
    const route = routes.find((r) => r.path === "/api/expert-squad/run-state")!;
    const res = await route.fetch(new Request("http://host/api/expert-squad/run-state"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: unknown[]; delegate: unknown };
    expect(body.entries).toEqual([]);
  });

  it("end 载荷 → state 换代 → 路由读口（observeSubagentEnd + run-state dep 全链）", async () => {
    const { ExpertRunPanelState, observeSubagentEnd } = await import("../src/dispatch/dispatch.js");
    const { expertSquadRoutes } = await import("../src/routes.js");
    const panel = new ExpertRunPanelState();
    panel.markDispatched("child-1", KEY, "msg-1");
    const listeners: Array<(info: { id: string; stopReason: string }) => void> = [];
    observeSubagentEnd(
      { on: (_e, l) => (listeners.push(l as never), () => void listeners.pop()) },
      panel,
    );
    listeners[0]!({ id: "child-1", stopReason: "completed" });
    const routes = expertSquadRoutes({
      list: async () => [],
      get: async () => {
        throw new Error("unused");
      },
      setEnabled: async () => {
        throw new Error("unused");
      },
      update: async () => {
        throw new Error("unused");
      },
      runState: () => panel.list(),
    });
    const route = routes.find((r) => r.path === "/api/expert-squad/run-state")!;
    const res = await route.fetch(new Request("http://host/api/expert-squad/run-state"));
    const body = (await res.json()) as { entries: Array<{ childId: string; stopReason: string }> };
    expect(body.entries).toEqual([{ childId: "child-1", expert: KEY, messageId: "msg-1", stopReason: "completed" }]);
  });
});

describe("bug 7b1c9ed4: experts 服务键 provide（ctx.experts 正门）", () => {
  it("apply 内以官方 provide 机械注册服务键 experts（ExpertsService 契约面）", async () => {
    makeWorkspace();
    const provided: Array<{ name: string; value: unknown }> = [];
    const routes: FetchRouteLike[] = [];
    await expertSquadPlugin({
      connection: {
        fetch: {
          register: (route: FetchRouteLike): unknown => {
            routes.push(route);
            return route;
          },
        },
      },
      reflect: {
        provide: (name: string, value: unknown): unknown => {
          provided.push({ name, value });
          return () => undefined;
        },
      },
      effect: (dispose: () => unknown): unknown => {
        disposers.push(dispose);
        return undefined;
      },
    } as never);
    const hit = provided.find((p) => p.name === "experts");
    expect(hit, "服务键 experts 必须 provide（ctx.experts 正门）").toBeDefined();
    const service = hit!.value as Record<string, unknown>;
    expect(typeof service.get).toBe("function");
    expect(typeof service.list).toBe("function");
    expect(typeof service.registerRoot).toBe("function");
    expect(typeof service.setEnabled).toBe("function");
  });

  it("registerRoot 跨实例族传播：外部插件注册的内置目录对面板 list 同可见（forge 55 档案缺席缺陷回归）", async () => {
    const ws = makeWorkspace();
    const provided: Array<{ name: string; value: unknown }> = [];
    const routes: FetchRouteLike[] = [];
    // 外部插件内置层目录（模拟 packages/plugin-forge/experts）
    const externalDir = join(ws, "..", `dsh-forge-xsq-external-${Date.now()}-experts`);
    mkdirSync(externalDir, { recursive: true });
    writeFileSync(join(externalDir, "forge-expert.md"), expertMd("forge-expert", "外部内置专家"));
    try {
      await expertSquadPlugin({
        connection: {
          fetch: {
            register: (route: FetchRouteLike): unknown => {
              routes.push(route);
              return route;
            },
          },
        },
        reflect: {
          provide: (name: string, value: unknown): unknown => {
            provided.push({ name, value });
            return () => undefined;
          },
        },
        effect: (dispose: () => unknown): unknown => {
          disposers.push(dispose);
          return undefined;
        },
      } as never);
      const service = provided.find((p) => p.name === "experts")!.value as {
        registerRoot(ctx: unknown, dir: string): void;
      };
      // 面板 list 先行建 registry（面板先开、外部插件后注册的时序）
      const list = routeOf(routes, "list");
      const url = `/api/expert-squad/list?workspace=${encodeURIComponent(ws)}&includeDisabled=true`;
      const before = JSON.parse(await (await list.fetch(new Request(`http://host${url}`))).text()) as unknown[];
      expect(before.some((e) => (e as { name: string }).name === "forge-expert")).toBe(false);
      // 外部插件注册内置目录 → 面板 list 即可见（跨实例族传播 + 主动换代）
      service.registerRoot({}, externalDir);
      await new Promise((resolve) => setTimeout(resolve, 150)); // 主动换代异步链落地
      const after = JSON.parse(await (await list.fetch(new Request(`http://host${url}`))).text()) as Array<{
        name: string;
        origin: string;
        effective: boolean;
      }>;
      const row = after.find((e) => e.name === "forge-expert");
      expect(row, "注册后面板 list 应含外部内置专家").toBeDefined();
      expect(row!.origin).toBe("plugin");
      expect(row!.effective).toBe(true);
      // 幂等：同目录重复注册不产生重复条目
      service.registerRoot({}, externalDir);
      const again = JSON.parse(await (await list.fetch(new Request(`http://host${url}`))).text()) as Array<{ name: string }>;
      expect(again.filter((e) => e.name === "forge-expert").length).toBe(1);
    } finally {
      rmSync(externalDir, { recursive: true, force: true });
    }
  });
});

describe("来源保持（用户裁决 2026-10-31）：编辑不换层、不新建；召唤才是新建面", () => {
  /** 隔离 DSH_HOME（user 层写点锚到沙箱；boot 前设置——roots 每刷求值）。 */
  function stubDshHome(): string {
    const home = mkdtempSync(join(tmpdir(), "dsh-forge-xsq-home-"));
    const prior = process.env.DSH_HOME;
    process.env.DSH_HOME = home;
    return prior as unknown as string;
  }

  it("user 层档案：面板编辑原地写回 user 根（project 层不落新文件）", { timeout: 20_000 }, async () => {
    const prior = stubDshHome();
    try {
      const ws = makeWorkspace();
      const userRoot = join(process.env.DSH_HOME!, "experts");
      mkdirSync(userRoot, { recursive: true });
      const USER_KEY = "solo-user-expert";
      writeFileSync(join(userRoot, `${USER_KEY}.md`), expertMd(USER_KEY, "用户层评审"));
      const routes = await boot();
      const result = await post(routeOf(routes, "update"), {
        workspace: ws,
        name: USER_KEY,
        title: "用户层复核岗",
        description: "d",
        tools: ["read"],
        skills: ["review"],
        personaMd: "## 职责\n\nok",
      });
      expect(result.status, `update 应成功：${result.text}`).toBe(200);
      const entry = result.json as { origin?: string; title?: string };
      expect(entry.origin, "回包档案 origin 仍 = user（来源保持）").toBe("user");
      expect(entry.title).toBe("用户层复核岗");
      // 原地写回：user 根文件换新；project 层零新增落盘（不换层不新建）
      expect(readFileSync(join(userRoot, `${USER_KEY}.md`), "utf8")).toContain("用户层复核岗");
      const projectFiles = readdirSync(join(ws, ".dsh", "experts"));
      expect(projectFiles).toEqual([`${KEY}.md`]); // 仅既有夹具，无新文件
    } finally {
      if (prior === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = prior;
    }
  });

  it("plugin 层内置（随包只读）：面板编辑回落 user 层覆写（键不变，不新建专家）", { timeout: 20_000 }, async () => {
    const prior = stubDshHome();
    const externalDir = mkdtempSync(join(tmpdir(), "dsh-forge-xsq-plugin-"));
    try {
      const ws = makeWorkspace(); // project 层无此键 → 生效层 = plugin
      writeFileSync(join(externalDir, "builtin-one.md"), expertMd("builtin-one", "内置一号"));
      const provided: Array<{ name: string; value: unknown }> = [];
      const routes: FetchRouteLike[] = [];
      await expertSquadPlugin({
        connection: {
          fetch: {
            register: (route: FetchRouteLike): unknown => {
              routes.push(route);
              return route;
            },
          },
        },
        reflect: {
          provide: (name: string, value: unknown): unknown => {
            provided.push({ name, value });
            return () => undefined;
          },
        },
        effect: (dispose: () => unknown): unknown => {
          disposers.push(dispose);
          return undefined;
        },
      } as never);
      const service = provided.find((p) => p.name === "experts")!.value as {
        registerRoot(ctx: unknown, dir: string): void;
      };
      service.registerRoot({}, externalDir);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const result = await post(routeOf(routes, "update"), {
        workspace: ws,
        name: "builtin-one",
        title: "内置一号（覆写）",
        description: "d",
        tools: ["read"],
        skills: [],
        personaMd: "## 职责\n\nok",
      });
      expect(result.status, `update 应成功：${result.text}`).toBe(200);
      const entry = result.json as { origin?: string; title?: string };
      // user 层覆写生效（遮蔽 plugin）——键不变，非新建专家
      expect(entry.title).toBe("内置一号（覆写）");
      const userRoot = join(process.env.DSH_HOME!, "experts");
      expect(readFileSync(join(userRoot, "builtin-one.md"), "utf8")).toContain("内置一号（覆写）");
      // project 层零落盘
      expect(readdirSync(join(ws, ".dsh", "experts"))).toEqual([`${KEY}.md`]);
    } finally {
      rmSync(externalDir, { recursive: true, force: true });
      if (prior === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = prior;
    }
  });
});

describe("bug f9410209: registry 首刷 rejected promise 逐出（下次请求重试而非恒 400）", () => {
  /** flaky state 存储面：blocked 期间 table().get 抛错（registry 刷新 reject），解除后恢复。 */
  function bootWithFlakyStorage(blocked: { value: boolean }): Promise<FetchRouteLike[]> {
    const routes: FetchRouteLike[] = [];
    const fakeDomain = {
      // 官方 Domain 表契约：table().get 同步返回记录或 undefined（state.isDisabled
      // 直接 `!== undefined` 判读，不 await）——fake 必须同形同步。
      table: () => ({
        get: (): undefined => {
          if (blocked.value) throw new Error("storage 首刷抖动");
          return undefined;
        },
        put: (): void => undefined,
        delete: (): void => undefined,
      }),
      close: async (): Promise<void> => undefined,
    };
    const storage = {
      domain: { open: async () => fakeDomain },
    };
    return expertSquadPlugin({
      connection: {
        fetch: {
          register: (route: FetchRouteLike): unknown => {
            routes.push(route);
            return route;
          },
        },
      },
      reflect: { get: (name: string) => (name === "storage" ? storage : undefined) },
      effect: (dispose: () => unknown): unknown => {
        disposers.push(dispose);
        return undefined;
      },
    } as never).then(() => routes);
  }

  async function get(route: FetchRouteLike, url: string): Promise<{ status: number; text: string }> {
    const res = await route.fetch(new Request(`http://host${url}`, { method: "GET" }));
    return { status: res.status, text: await res.text() };
  }

  it("首刷拒绝 → list 如实 400；同 workspace 下次请求重试成功", { timeout: 20_000 }, async () => {
    const ws = makeWorkspace();
    const blocked = { value: true };
    const routes = await bootWithFlakyStorage(blocked);
    const list = routeOf(routes, "list");
    const url = `/api/expert-squad/list?workspace=${encodeURIComponent(ws)}&includeDisabled=true`;
    const first = await get(list, url);
    expect(first.status, `首刷失败应如实 400：${first.text}`).toBe(400);
    blocked.value = false;
    const second = await get(list, url);
    expect(second.status, `逐出后重试应 200：${second.text}`).toBe(200);
  });

  it("bug 31a989d2: 持续首刷失败 + 3 次重试——失败代逐一 dispose，存活 watcher 有界（≤1）", { timeout: 30_000 }, async () => {
    const ws = makeWorkspace();
    const blocked = { value: true };
    const routes = await bootWithFlakyStorage(blocked);
    const before = watchProbe.instances.length;
    const list = routeOf(routes, "list");
    const url = `/api/expert-squad/list?workspace=${encodeURIComponent(ws)}&includeDisabled=true`;
    for (let i = 0; i < 3; i += 1) {
      const res = await get(list, url);
      expect(res.status, `第 ${i + 1} 次重试应如实 400：${res.text}`).toBe(400);
    }
    const created = watchProbe.instances.slice(before);
    expect(created.length, "每次重试都应重建 manager（毒化代不复用）").toBe(3);
    const alive = created.filter((m) => !m.isDisposed());
    expect(
      alive.length,
      `失败代必须逐一 dispose（存活恒 ≤1 与 workspace 一一对应，有界）：共 ${created.length} 建却 ${alive.length} 存活`,
    ).toBe(0);
    for (const [i, m] of created.entries()) {
      expect(m.isDisposed(), `第 ${i + 1} 个失败代 manager 已 dispose`).toBe(true);
    }
  });
});
