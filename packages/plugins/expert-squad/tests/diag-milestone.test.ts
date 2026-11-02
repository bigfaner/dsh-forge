// diag-milestone-coverage 补钉：成功里程碑 info 埋点（expert-squad-setenabled——落盘成功
// 此前仅失败 warn，成功径不可见）与 onError 定级（index.ts:309——watch 通道异常 →
// level=error，方案 8：错误径不降 warn）。
// chokidar 以假 watcher 替身（ready 前即 error）——装配缝 onError 全径确定性驱动。

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/** 假 watcher：once("error") 微任务即抛——openWatcher ready promise 恒拒绝（watch 通道对 workspace 实际失败形态）。 */
vi.mock("chokidar", () => ({
  default: {
    watch: () => ({
      on: () => undefined,
      once: (event: string, listener: (error: unknown) => void) => {
        if (event === "error") queueMicrotask(() => listener(new Error("watch channel down")));
        return undefined;
      },
      close: () => Promise.resolve(),
    }),
  },
}));

import type { FetchRouteLike } from "../src/routes.js";
import expertSquadPlugin from "../src/index.js";

const KEY = "diag-reviewer";

interface DiagPayload {
  level: string;
  event: string;
  message: string;
}

let wsDir: string | undefined;
let pendingEffects: Array<() => unknown> = [];

function makeWorkspace(): string {
  wsDir = mkdtempSync(join(tmpdir(), "dsh-forge-xsq-diag-ws-"));
  const expertsDir = join(wsDir, ".dsh", "experts");
  mkdirSync(expertsDir, { recursive: true });
  writeFileSync(
    join(expertsDir, `${KEY}.md`),
    [
      "---",
      `name: ${KEY}`,
      "description: >-",
      "  Fixture expert for diag milestone tests.",
      "title: 诊断夹具",
      "tools: [read]",
      "skills: []",
      "---",
      "",
      "## 职责",
      "",
      "诊断埋点夹具。",
      "",
    ].join("\n"),
  );
  return wsDir;
}

type PluginCtx = Parameters<typeof expertSquadPlugin>[0];

/** 装配插件（与 host 同径：connection 在场，storage/tools 缺席降级），捕获 diag/log 发射。 */
async function boot(): Promise<{ routes: FetchRouteLike[]; diags: DiagPayload[] }> {
  const routes: FetchRouteLike[] = [];
  const diags: DiagPayload[] = [];
  const ctx: PluginCtx = {
    connection: {
      fetch: {
        register: (route: FetchRouteLike): unknown => {
          routes.push(route);
          return route;
        },
      },
    },
    emit: (_event: string, ...args: unknown[]): unknown => {
      diags.push(args[0] as DiagPayload);
      return undefined;
    },
    effect: (dispose: () => unknown): unknown => {
      pendingEffects.push(dispose);
      return undefined;
    },
  };
  await expertSquadPlugin(ctx);
  return { routes, diags };
}

function routeOf(routes: readonly FetchRouteLike[], endpoint: string): FetchRouteLike {
  const hit = routes.find((r) => r.path === `/api/expert-squad/${endpoint}`);
  if (hit === undefined) throw new Error(`路由未注册：${endpoint}`);
  return hit;
}

afterEach(async () => {
  for (const effect of pendingEffects) {
    const dispose = effect();
    if (typeof dispose === "function") await dispose();
  }
  pendingEffects = [];
  if (wsDir !== undefined) rmSync(wsDir, { recursive: true, force: true });
  wsDir = undefined;
});

describe("diag-milestone-coverage：expert-squad onError 定级 + setEnabled 成功 info 埋点", () => {
  it("watch 通道异常（openWatcher 抛）→ onError 定级 error（event=expert-squad-watch-error，不降 warn）", async () => {
    makeWorkspace();
    const { routes, diags } = await boot();
    const list = routeOf(routes, "list");
    const res = await list.fetch(
      new Request(`http://host/api/expert-squad/list?workspace=${encodeURIComponent(wsDir!)}`),
    );
    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(
        diags.some((d) => d.level === "error" && d.event === "expert-squad-watch-error"),
        "watch 通道实际失败必须落 error 级诊断（方案 8：错误径不降 warn）",
      ).toBe(true);
    });
    expect(diags.find((d) => d.event === "expert-squad-watch-error")?.message).toContain("watch channel down");
  });

  it("setEnabled 落盘成功 → info 埋点 expert-squad-setenabled（成功径可见，携带 key）", async () => {
    makeWorkspace();
    const { routes, diags } = await boot();
    const enable = routeOf(routes, "enable");
    const res = await enable.fetch(
      new Request("http://host/api/expert-squad/enable", {
        method: "POST",
        body: JSON.stringify({ workspace: wsDir, key: KEY }),
      }),
    );
    expect(res.status).toBe(200);
    const info = diags.find((d) => d.level === "info" && d.event === "expert-squad-setenabled");
    expect(info, "启停落盘成功必须可见（AGENTS §7——成功里程碑 info 埋点）").toBeDefined();
    expect(info?.message).toContain(KEY);
    expect(info?.message).toContain("落盘成功");
  });
});
