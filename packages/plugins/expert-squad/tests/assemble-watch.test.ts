// 装配缝热刷新测试（bug 09356510：host 装配缺 watcher/fs-observed 接线——档案索引
// 永不换代）。装配层真 FS + 真 chokidar 取证：boot 插件默认导出（与 host 同径）后，
// project 层直写 .md 必须在预算内经 list 换代可见；fs/observed 失效处理器必须在装配
// 期注册（官方 skill-filesystem 同缝：ctx.on("fs/observed", …)）。
// watch 层自身语义（事件过滤/竞速合并/重挂）由 watch.test.ts 承载，本文件只钉装配断链。

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FetchRouteLike } from "../src/routes.js";
import expertSquadPlugin from "../src/index.js";

const KEY = "test-reviewer";

function expertMd(name: string, title: string): string {
  return [
    "---",
    `name: ${name}`,
    "description: >-",
    "  Fixture expert for wiring watch tests.",
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
let pendingEffects: Array<() => unknown> = [];

function makeWorkspace(): string {
  wsDir = mkdtempSync(join(tmpdir(), "dsh-forge-xsq-wiring-ws-"));
  const expertsDir = join(wsDir, ".dsh", "experts");
  mkdirSync(expertsDir, { recursive: true });
  writeFileSync(join(expertsDir, `${KEY}.md`), expertMd(KEY, "v1"));
  return wsDir;
}

interface Wiring {
  routes: FetchRouteLike[];
  observedHandlers: Array<(...args: unknown[]) => unknown>;
}

type CtxWithOn = Parameters<typeof expertSquadPlugin>[0] & {
  on?: (event: string, listener: (...args: unknown[]) => unknown) => unknown;
};

/** 装配插件（与 host 同径：connection 在场，storage/tools 缺席降级），收集 fs/observed 监听。 */
async function boot(): Promise<Wiring> {
  const routes: FetchRouteLike[] = [];
  const observedHandlers: Array<(...args: unknown[]) => unknown> = [];
  const ctx: CtxWithOn = {
    connection: {
      fetch: {
        register: (route: FetchRouteLike): unknown => {
          routes.push(route);
          return route;
        },
      },
    },
    on: (event, listener) => {
      if (event === "fs/observed") observedHandlers.push(listener);
      return undefined;
    },
    effect: (dispose: () => unknown): unknown => {
      pendingEffects.push(dispose);
      return undefined;
    },
  };
  await expertSquadPlugin(ctx);
  return { routes, observedHandlers };
}

function routeOf(routes: readonly FetchRouteLike[], endpoint: string): FetchRouteLike {
  const hit = routes.find((r) => r.path === `/api/expert-squad/${endpoint}`);
  if (hit === undefined) throw new Error(`路由未注册：${endpoint}`);
  return hit;
}

async function listTitles(workspace: string, routes: readonly FetchRouteLike[]): Promise<string[]> {
  const res = await routeOf(routes, "list").fetch(
    new Request(`http://host/api/expert-squad/list?workspace=${encodeURIComponent(workspace)}`),
  );
  expect(res.status).toBe(200);
  const entries = (await res.json()) as Array<{ name: string; title: string }>;
  return entries.filter((e) => e.name === KEY).map((e) => e.title);
}

/** 轮询直到断言成立（热刷新预算窗——watch 失效 + 重扫 + 轮询周期）。 */
async function pollUntil<T>(probe: () => Promise<T>, match: (v: Awaited<T>) => boolean, budgetMs = 8000): Promise<Awaited<T>> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const value = await probe();
    if (match(value)) return value;
    if (Date.now() > deadline) throw new Error(`预算 ${budgetMs}ms 内未观测到换代（末次值：${JSON.stringify(value)}）`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

afterEach(async () => {
  // 先 disposer（关 watcher）再删夹具，避免 root 删除触发重挂爬升 Temp 祖先。
  // cordis effect 契约：effect(cb) 的 cb() 返回值才是 disposer。
  for (const effect of pendingEffects) {
    const dispose = effect();
    if (typeof dispose === "function") await dispose();
  }
  pendingEffects = [];
  if (wsDir !== undefined) rmSync(wsDir, { recursive: true, force: true });
  wsDir = undefined;
});

describe("bug 09356510: host 装配缝热刷新接线（watch + fs/observed 双通道）", () => {
  it("fs/observed 失效处理器在装配期注册（官方 skill-filesystem 同缝）", async () => {
    const { observedHandlers } = await boot();
    expect(observedHandlers.length, "ctx.on('fs/observed', …) 未接线——通道二缺席").toBeGreaterThan(0);
  });

  it("project 层直写档案 → list 预算内换代（通道一：chokidar 深度 1）", { timeout: 20_000 }, async () => {
    const ws = makeWorkspace();
    const { routes } = await boot();
    expect(await listTitles(ws, routes)).toEqual(["v1"]);
    // 外部编辑器同语义：Node 测试进程直写正本
    writeFileSync(join(ws, ".dsh", "experts", `${KEY}.md`), expertMd(KEY, "v2-hot"));
    const titles = await pollUntil(
      () => listTitles(ws, routes),
      (t) => t.includes("v2-hot"),
    );
    expect(titles).toEqual(["v2-hot"]);
  });
});
