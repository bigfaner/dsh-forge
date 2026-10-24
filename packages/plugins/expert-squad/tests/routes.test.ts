// routes 契约镜像测试（tech-design §6 / §10.2 / §13 D4）：对照官方
// ctx.connection.fetch.register 先例（session-log-export / annotutor 镜像）——
// ①注册形态镜像官方 ConnectionFetchRoute 面（path/methods/requestBody/fetch）；
// ②路由面 zod 门：非法载荷 400 文本且 handler 不运行；③workspace 参数经 zod
// 校验并原样下传禁用状态层（canonical 化与 key 构造由 state 层承担，D4）。

import { describe, expect, it, vi } from "vitest";
import {
  EXPERT_SQUAD_API_BASE,
  EXPERT_SQUAD_ENDPOINTS,
  type ConnectionLike,
  type ExpertRoutesDeps,
  type FetchRouteLike,
  expertSquadRoute,
  expertSquadRoutes,
  expertUpdateBodySchema,
  registerExpertSquadRoutes,
} from "../src/routes.js";

/** 官方 register 正门 spy（annotutor host-inject.test 同型）。 */
function makeConnection(): { connection: ConnectionLike; routes: FetchRouteLike[] } {
  const routes: FetchRouteLike[] = [];
  return {
    routes,
    connection: { fetch: { register: vi.fn((r: FetchRouteLike) => routes.push(r)) } },
  };
}

/** 结构化 deps（路由层只消费该面）。 */
function makeDeps(): ExpertRoutesDeps & {
  list: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  setEnabled: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
} {
  const entry = {
    name: "code-reviewer",
    title: "资深评审",
    description: "Runs code review",
    personaMd: "## 职责",
    tools: ["read"],
    skills: [],
    origin: "project",
    enabled: true,
  } as const;
  const list = vi.fn(async () => [entry]);
  const get = vi.fn(async (_ws: string, key: string) => {
    if (key !== "code-reviewer") throw new Error(`expert not found: ${key}`);
    return { ...entry };
  });
  const setEnabled = vi.fn(async () => ({ ...entry }));
  const update = vi.fn(async (input) => ({ ...entry, ...input, enabled: true }));
  return { list, get, setEnabled, update } as never;
}

function text(res: Response): Promise<string> {
  return res.text();
}

describe("expert-squad fetch 路由族（官方 fetch.register 契约镜像）", () => {
  it("注册五条精确路由：path/methods/requestBody 镜像官方 ConnectionFetchRoute 面", () => {
    const { connection, routes } = makeConnection();
    registerExpertSquadRoutes(connection, makeDeps());
    expect(connection.fetch.register).toHaveBeenCalledTimes(5);
    expect(routes.map((r) => r.path)).toEqual(
      EXPERT_SQUAD_ENDPOINTS.map((e) => expertSquadRoute(e)),
    );
    expect(routes.map((r) => r.path)).toEqual([
      "/api/expert-squad/list",
      "/api/expert-squad/get",
      "/api/expert-squad/update",
      "/api/expert-squad/enable",
      "/api/expert-squad/disable",
    ]);
    for (const route of routes) {
      const isGet = route.path.endsWith("/list") || route.path.endsWith("/get");
      expect(route.methods).toEqual(isGet ? ["GET"] : ["POST"]);
      expect(route.requestBody).toBe("buffered");
      expect(typeof route.fetch).toBe("function");
    }
  });

  it("GET list：查询门解析 workspace/includeDisabled，JSON 应答", async () => {
    const deps = makeDeps();
    const [route] = expertSquadRoutes(deps);
    const res = await route.fetch(
      new Request(
        "http://host/api/expert-squad/list?workspace=C%3A%5Cws%5Ca&includeDisabled=true",
      ),
    );
    expect(res.status).toBe(200);
    expect(deps.list).toHaveBeenCalledWith("C:\\ws\\a", true);
    const body = (await res.json()) as { name: string }[];
    expect(body[0]?.name).toBe("code-reviewer");
  });

  it("GET list：缺 workspace → 400 文本，handler 不运行", async () => {
    const deps = makeDeps();
    const [route] = expertSquadRoutes(deps);
    const res = await route.fetch(
      new Request("http://host/api/expert-squad/list"),
    );
    expect(res.status).toBe(400);
    expect(await text(res)).not.toBe("");
    expect(deps.list).not.toHaveBeenCalled();
  });

  it("GET get：key+workspace 查询门，handler 收到显式 workspace", async () => {
    const deps = makeDeps();
    const [, route] = expertSquadRoutes(deps);
    const res = await route.fetch(
      new Request(
        "http://host/api/expert-squad/get?workspace=C%3A%5Cws&key=code-reviewer",
      ),
    );
    expect(res.status).toBe(200);
    expect(deps.get).toHaveBeenCalledWith("C:\\ws", "code-reviewer");
  });

  it("POST disable：体门通过后 workspace 原样下传禁用状态层（D4）", async () => {
    const deps = makeDeps();
    const routes = expertSquadRoutes(deps);
    const disable = routes.find((r) => r.path === expertSquadRoute("disable"));
    const res = await disable!.fetch(
      new Request("http://host/api/expert-squad/disable", {
        method: "POST",
        body: JSON.stringify({ workspace: "C:\\ws\\b", key: "code-reviewer" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(deps.setEnabled).toHaveBeenCalledWith("C:\\ws\\b", "code-reviewer", false);
    const body = (await res.json()) as { name?: string; enabled?: boolean };
    expect(body, "回包 = 换新档案（bug 34a284e3 契约，非 {ok:true}）").toMatchObject({
      name: "code-reviewer",
      enabled: true,
    });
  });

  it("POST disable：非法载荷（缺 workspace / 空 key）→ 400 文本，handler 不运行", async () => {
    const deps = makeDeps();
    const routes = expertSquadRoutes(deps);
    const disable = routes.find((r) => r.path === expertSquadRoute("disable"))!;
    for (const payload of [{}, { workspace: "", key: "k" }, { workspace: "C:\\ws" }, 42]) {
      const res = await disable.fetch(
        new Request("http://host/api/expert-squad/disable", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );
      expect(res.status).toBe(400);
      expect(await text(res)).not.toBe("");
    }
    expect(deps.setEnabled).not.toHaveBeenCalled();
  });

  it("POST enable：合法体门 → setEnabled(key, true)", async () => {
    const deps = makeDeps();
    const routes = expertSquadRoutes(deps);
    const enable = routes.find((r) => r.path === expertSquadRoute("enable"))!;
    const res = await enable.fetch(
      new Request("http://host/api/expert-squad/enable", {
        method: "POST",
        body: JSON.stringify({ workspace: "C:\\ws", key: "code-reviewer" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(deps.setEnabled).toHaveBeenCalledWith("C:\\ws", "code-reviewer", true);
  });

  it("POST update：档案字段门（kebab-case name / description ≤120），skills 默认空", async () => {
    const deps = makeDeps();
    const routes = expertSquadRoutes(deps);
    const update = routes.find((r) => r.path === expertSquadRoute("update"))!;
    const res = await update.fetch(
      new Request("http://host/api/expert-squad/update", {
        method: "POST",
        body: JSON.stringify({
          workspace: "C:\\ws",
          name: "new-expert",
          title: "新专家",
          description: "x",
          tools: ["read"],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(deps.update).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: "C:\\ws", name: "new-expert", skills: [] }),
    );

    // 负向：坏键名 / 超长 description / 缺 tools → 400 且 handler 不运行
    for (const payload of [
      { workspace: "C:\\ws", name: "Bad_Key", title: "t", description: "d", tools: ["read"] },
      { workspace: "C:\\ws", name: "ok", title: "t", description: "d".repeat(121), tools: ["read"] },
      { workspace: "C:\\ws", name: "ok", title: "t", description: "d" },
    ]) {
      const bad = await update.fetch(
        new Request("http://host/api/expert-squad/update", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );
      expect(bad.status).toBe(400);
    }
    expect(deps.update).toHaveBeenCalledTimes(1);
  });

  it("handler 抛业务错（键不存在）→ 400 文本（annotutor 先例同型）", async () => {
    const deps = makeDeps();
    const [, route] = expertSquadRoutes(deps);
    const res = await route.fetch(
      new Request("http://host/api/expert-squad/get?workspace=C%3A%5Cws&key=ghost"),
    );
    expect(res.status).toBe(400);
    expect(await text(res)).toBe("expert not found: ghost");
  });

  it("update 体门 schema 直接核销：workspace 门沿用 state 层 workspaceParamSchema", () => {
    expect(
      expertUpdateBodySchema.safeParse({ workspace: "", name: "ok", title: "t", description: "d", tools: ["r"] })
        .success,
    ).toBe(false);
    expect(
      expertUpdateBodySchema.safeParse({ workspace: "C:\\ws", name: "ok", title: "t", description: "d", tools: ["r"] })
        .success,
    ).toBe(true);
  });

  it("基前缀契约：/api/expert-squad（§6 面板数据通道）", () => {
    expect(EXPERT_SQUAD_API_BASE).toBe("/api/expert-squad");
  });
});
