// routes.ts —— 面板 fetch 路由族（tech-design §6 面板数据通道 / §13 D4）：
// ctx.connection.fetch.register 精确 /api/expert-squad/* 路由（session-log-export /
// annotutor 先例；官方契约 ConnectionFetchRoute：dsh-client-connection rpc.d.ts:111-129
// —— path/methods(GET|HEAD|POST)/requestBody/fetch，由既有 /api 桥分发，不触 webServer）。
// 路由面 zod 门：非法载荷在任何 handler 逻辑运行前以 400 文本应答（annotutor 先例）。
// workspace 参数（D4 钉死）：client 请求显式携带（来源 WorkspaceView.path），
// 经 zod 门校验后原样下传 deps（canonical 化与禁用状态 key 由 state 层承担）——
// 杜绝进程级 cwd 串域。

import { workspaceParamSchema } from "./state.js";
import type { ExpertEntry, LayeredExpertEntry } from "./registry.js";
import type { ExpertRunPanelEntry } from "./dispatch/dispatch.js";
import { z } from "zod";

/** API 基前缀（精确路由：一个 endpoint 一条路由）。 */
export const EXPERT_SQUAD_API_BASE = "/api/expert-squad";

/** endpoint 名（api-contract §2.1 面板路由 + §7 候选读口：GET list|get|run-state|candidates + POST update|enable|disable）。 */
export const EXPERT_SQUAD_ENDPOINTS = [
  "list",
  "get",
  "update",
  "enable",
  "disable",
  "run-state",
  "candidates",
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
  provider: z.string().min(1).optional(),
  personaMd: z.string().optional(),
});

export type ExpertUpdateInput = z.infer<typeof expertUpdateBodySchema>;

/** GET run-state 查询门：无参（面板运行状态为进程级纯 UI 数据，不带 workspace 维度）。 */
export const runStateQuerySchema = z.object({}).passthrough();

/** GET candidates 查询门：无参（候选目录为进程级宿主半读口，不带 workspace 维度）。 */
export const candidatesQuerySchema = z.object({}).passthrough();

// ---- 候选目录读口（Dialog 工具/技能下拉候选用——目录缺席 = 字段缺席，client 兜底） ----

/** 候选目录应答（tools/skills 字段缺席 = 对应官方目录缺席——client 侧回退兜底语义）。
 *  口径：全局注册视图——tools 不含 preset 域 scoped deny 效果（守卫态 restrict 只作用
 *  于 preset 域 scoped apply）；skills = root 全局层技能目录视图。 */
export interface CandidateCatalog {
  /** 宿主 ToolRuntime 目录工具名（schemas() 全局注册视图——全局视图永不含 scoped deny，
   *  含插件追加工具；scope 视图不实现，候选是「可选白名单建议」）。 */
  readonly tools?: readonly string[];
  /** 官方 skill 目录技能名（ctx.skills 清单面——root 全局层视图）。 */
  readonly skills?: readonly string[];
}

// ---- delegate 装配状态（观测面-only）---------------------------------------

/** delegate_expert 装配状态（apply 尾部装配结果——run-state 读口暴露，装配降级
 *  不再依赖主进程 stdout 可观测）。status：registered = 委派工具已注册；
 *  degraded = 未注册，reason 携降级原因（subagents-absent / shape-mismatch /
 *  tools-absent）。 */
export type DelegateAssemblyState =
  | { readonly status: "registered" }
  | { readonly status: "degraded"; readonly reason: string };

// ---- 依赖面 -----------------------------------------------------------------

/** 路由依赖面（装配层由 registry/state 组合供给；本层只消费该结构）。 */
export interface ExpertRoutesDeps {
  /**
   * 面板列表（1.60 用户裁决：同键全层条目——每条携 origin + effective 位，展示层
   * 聚组数据源；排序由 registry 承担。取用面 get/setEnabled 零改动）。
   */
  list(workspace: string, includeDisabled: boolean): Promise<LayeredExpertEntry[]>;
  /** 单专家取用（不存在/禁用 → 抛业务错，404/400 文本应答）。 */
  get(workspace: string, key: string): Promise<ExpertEntry>;
  /** 启停切换（workspace 经 state 层 canonical 化后做禁用状态 key，D4）；成功返回换新档案。 */
  setEnabled(workspace: string, key: string, enabled: boolean): Promise<ExpertEntry>;
  /** 档案 upsert（update 通道；持久化层由装配侧供给）。 */
  update(input: ExpertUpdateInput): Promise<ExpertEntry>;
  /** 面板运行状态读口（subagent/end 换代后的当前快照；纯 UI，不进会话流）。 */
  runState(): ExpertRunPanelEntry[];
  /** delegate 装配状态读口（可选——供给即随 run-state 应答透出 delegate 字段）。 */
  delegateState?(): DelegateAssemblyState;
  /** 候选目录读口（可选——缺席 = 应答零字段，client 回退内置兜底清单/并集语义）。 */
  candidates?(): Promise<CandidateCatalog>;
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
    // 启停回包 = 换新档案（bug 34a284e3 契约收敛：client defaultDetailMutations 消费
    // updated.enabled 切状态灯——{ok:true} 即渲染断链；与 update 路由同型）。
    post("enable", async (payload) => {
      const body = expertEnableBodySchema.parse(payload);
      return deps.setEnabled(body.workspace, body.key, true);
    }),
    post("disable", async (payload) => {
      const body = expertEnableBodySchema.parse(payload);
      return deps.setEnabled(body.workspace, body.key, false);
    }),
    {
      path: expertSquadRoute("run-state"),
      methods: ["GET"],
      requestBody: "buffered",
      fetch: async (request) => {
        try {
          runStateQuerySchema.parse(
            Object.fromEntries(new URL(request.url).searchParams),
          );
          const delegate = deps.delegateState?.();
          return Response.json({
            entries: deps.runState(),
            ...(delegate !== undefined ? { delegate } : {}),
          });
        } catch (err) {
          return new Response(err instanceof Error ? err.message : String(err), {
            status: 400,
          });
        }
      },
    },
    {
      path: expertSquadRoute("candidates"),
      methods: ["GET"],
      requestBody: "buffered",
      fetch: async (request) => {
        try {
          candidatesQuerySchema.parse(
            Object.fromEntries(new URL(request.url).searchParams),
          );
          // 异常分类观测注记：目录读口 handler 抛错（目录面异常/序列化失败）与 zod 门
          // 400 同型归一为 400 文本应答——候选是建议面，无 5xx 分级（client 回退兜底）。
          const catalog = (await deps.candidates?.()) ?? {};
          return Response.json({
            ...(catalog.tools !== undefined ? { tools: catalog.tools } : {}),
            ...(catalog.skills !== undefined ? { skills: catalog.skills } : {}),
          });
        } catch (err) {
          return new Response(err instanceof Error ? err.message : String(err), {
            status: 400,
          });
        }
      },
    },
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
