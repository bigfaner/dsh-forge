// routes.ts —— 面板 fetch 路由族（tech-design §6 面板数据通道 / §13 D4）：
// ctx.connection.fetch.register 精确 /api/expert-squad/* 路由（session-log-export /
// annotutor 先例；官方契约 ConnectionFetchRoute：dsh-client-connection rpc.d.ts:111-129
// —— path/methods(GET|HEAD|POST)/requestBody/fetch，由既有 /api 桥分发，不触 webServer）。
// 路由面 zod 门：非法载荷在任何 handler 逻辑运行前以 400 文本应答（annotutor 先例）。
// workspace 参数（D4 钉死）：client 请求显式携带（来源 WorkspaceView.path），
// 经 zod 门校验后原样下传 deps（canonical 化与禁用状态 key 由 state 层承担）——
// 杜绝进程级 cwd 串域。

import { workspaceParamSchema } from "./state.js";
import type { ExpertEntry } from "./registry.js";
import { z } from "zod";

/** API 基前缀（精确路由：一个 endpoint 一条路由）。 */
export const EXPERT_SQUAD_API_BASE = "/api/expert-squad";

/** endpoint 名（§6：GET list|get + POST update|enable|disable）。 */
export const EXPERT_SQUAD_ENDPOINTS = [
  "list",
  "get",
  "update",
  "enable",
  "disable",
] as const;
export type ExpertSquadEndpoint = (typeof EXPERT_SQUAD_ENDPOINTS)[number];

/** 精确路由路径。 */
export function expertSquadRoute(endpoint: ExpertSquadEndpoint): string {
  return `${EXPERT_SQUAD_API_BASE}/${endpoint}`;
}

/** 官方 exact Fetch-route 镜像（dsh-client-connection ConnectionFetchRoute 面）。 */
export interface FetchRouteLike {
  readonly path: string;
  readonly methods: readonly ("GET" | "HEAD" | "POST")[];
  readonly requestBody: "buffered" | "streaming";
  fetch(request: Request): Promise<Response>;
}

/** 官方 connection 服务缝（结构最小面；register 返回官方 disposer，本层不消费）。 */
export interface ConnectionLike {
  readonly fetch: {
    register(route: FetchRouteLike): unknown;
  };
}

// ---- 载荷门（路由面 zod gate）----------------------------------------------

/** GET get 查询门：key + workspace（均必填）。 */
export const expertGetQuerySchema = z.object({
  key: z.string().min(1),
  workspace: workspaceParamSchema,
});

/** GET list 查询门：workspace 必填；includeDisabled 经查询串枚举承载。 */
export const expertListQuerySchema = z.object({
  workspace: workspaceParamSchema,
  includeDisabled: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

/** POST enable/disable 体门：workspace + key（禁用状态 key 取值点，D4）。 */
export const expertEnableBodySchema = z.object({
  workspace: workspaceParamSchema,
  key: z.string().min(1),
});

/** POST update 体门（§8 档案字段；[召唤] 对话建档走同一通道）：name/title/description/tools 必填，skills/model/personaMd 可选。 */
export const expertUpdateBodySchema = z.object({
  workspace: workspaceParamSchema,
  name: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9-]*$/, "expert key must be a kebab-case identifier"),
  title: z.string().min(1),
  description: z.string().min(1).max(120),
  tools: z.array(z.string().min(1)).min(1),
  skills: z.array(z.string().min(1)).default([]),
  model: z.string().min(1).optional(),
  personaMd: z.string().optional(),
});

export type ExpertUpdateInput = z.infer<typeof expertUpdateBodySchema>;

// ---- 依赖面 -----------------------------------------------------------------

/** 路由依赖面（装配层由 registry/state 组合供给；本层只消费该结构）。 */
export interface ExpertRoutesDeps {
  /** 面板列表（含各专家在该 workspace 的启用态；排序由 registry 承担）。 */
  list(workspace: string, includeDisabled: boolean): Promise<ExpertEntry[]>;
  /** 单专家取用（不存在/禁用 → 抛业务错，404/400 文本应答）。 */
  get(workspace: string, key: string): Promise<ExpertEntry>;
  /** 启停切换（workspace 经 state 层 canonical 化后做禁用状态 key，D4）。 */
  setEnabled(workspace: string, key: string, enabled: boolean): Promise<void>;
  /** 档案 upsert（update 通道；持久化层由装配侧供给）。 */
  update(input: ExpertUpdateInput): Promise<ExpertEntry>;
}

/**
 * 组装五条精确路由（每 endpoint 一条，official ConnectionFetchRoute 形态）。
 * zod 门语义：载荷非法（含缺 workspace）→ 400 文本、handler 不运行；handler
 * 抛错（键不存在/禁用/写失败）→ 400 文本（annotutor 先例同型）。
 */
export function expertSquadRoutes(deps: ExpertRoutesDeps): FetchRouteLike[] {
  const post = (
    endpoint: ExpertSquadEndpoint,
    handler: (payload: unknown) => Promise<unknown>,
  ): FetchRouteLike => ({
    path: expertSquadRoute(endpoint),
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      try {
        return Response.json(await handler(await request.json()));
      } catch (err) {
        return new Response(err instanceof Error ? err.message : String(err), {
          status: 400,
        });
      }
    },
  });

  return [
    {
      path: expertSquadRoute("list"),
      methods: ["GET"],
      requestBody: "buffered",
      fetch: async (request) => {
        try {
          const query = expertListQuerySchema.parse(
            Object.fromEntries(new URL(request.url).searchParams),
          );
          return Response.json(
            await deps.list(query.workspace, query.includeDisabled),
          );
        } catch (err) {
          return new Response(err instanceof Error ? err.message : String(err), {
            status: 400,
          });
        }
      },
    },
    {
      path: expertSquadRoute("get"),
      methods: ["GET"],
      requestBody: "buffered",
      fetch: async (request) => {
        try {
          const query = expertGetQuerySchema.parse(
            Object.fromEntries(new URL(request.url).searchParams),
          );
          return Response.json(await deps.get(query.workspace, query.key));
        } catch (err) {
          return new Response(err instanceof Error ? err.message : String(err), {
            status: 400,
          });
        }
      },
    },
    post("update", async (payload) =>
      deps.update(expertUpdateBodySchema.parse(payload)),
    ),
    post("enable", async (payload) => {
      const body = expertEnableBodySchema.parse(payload);
      await deps.setEnabled(body.workspace, body.key, true);
      return { ok: true };
    }),
    post("disable", async (payload) => {
      const body = expertEnableBodySchema.parse(payload);
      await deps.setEnabled(body.workspace, body.key, false);
      return { ok: true };
    }),
  ];
}

/** 注册路由族（官方正门 ctx.connection.fetch.register，每 endpoint 一条）。 */
export function registerExpertSquadRoutes(
  connection: ConnectionLike,
  deps: ExpertRoutesDeps,
): void {
  for (const route of expertSquadRoutes(deps)) {
    connection.fetch.register(route);
  }
}
