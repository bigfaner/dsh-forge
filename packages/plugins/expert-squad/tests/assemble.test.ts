// 装配缝测试（host 入口 expertSquadPlugin——routes 依赖面供给接线）：
// ① bug 4ed8549f：update 通道真装配——fail-loud 占位（"expert update channel not
//    assembled yet"）必须替换为真实写面（project 层 <workspace>/.dsh/experts/<key>.md
//    写盘 + 回包换新档案）；② bug 34a284e3：enable/disable 回包 = 换新档案
//    （client defaultDetailMutations 契约消费 updated.enabled，{ok:true} 即渲染断链）。

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FetchRouteLike } from "../src/routes.js";
import expertSquadPlugin from "../src/index.js";

const KEY = "test-reviewer";

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

function makeWorkspace(): string {
  wsDir = mkdtempSync(join(tmpdir(), "dsh-forge-xsq-assemble-ws-"));
  const expertsDir = join(wsDir, ".dsh", "experts");
  mkdirSync(expertsDir, { recursive: true });
  writeFileSync(join(expertsDir, `${KEY}.md`), expertMd(KEY, "夹具评审"));
  return wsDir;
}

afterEach(() => {
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
    effect: (): unknown => undefined,
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
  it("POST update：档案写盘到 project 层 + 回包换新档案（enabled 在场）", async () => {
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

  it("POST update：裸 {{ 人设 → 400 且不落盘（frontmatter 门与 tool 写路径同源）", async () => {
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
