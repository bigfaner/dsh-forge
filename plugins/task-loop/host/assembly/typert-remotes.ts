// host/assembly · typert-remotes.ts —— forgeTasks Typert Remote namespace（官方 Typert
// Remote 正典通路，形态正本 = plugins/project/host/assembly/typert-remotes.ts 实况逐位对齐）：
//   TypertRemoteService 子类 + @Remote 方法装饰器（namespace 'forgeTasks'、serviceKey
//   'forgeTasksController'——既有宿主服务键命名同型）；gateway SRC 发现路径从函数签名解析
//   参数面、codec 全 src-json，端点 = `forgeTasks/<method>`；`signal` 尾参 = cancellation。
//   键名沿用 ForgeTasksRpc 读面八方法（apps/web/src/rpc/client.ts TASKS_CHANNELS 清单——
//   transport 改型，键不漂移）；写面 transition 若域服务 face 在场则透传、缺席 typed
//   unavailable（Result error 分支诚实降级，与 project unavailableMessage 形态一致）。
//
// 发现面铁律（project 侦察定谳同径）：gateway 只遍历根 ctx reflect.props——控制器经
// rootCtx.plugin 注册进根 ctx；生命周期归插件 fiber（dispose 级联拆卸）。
//
// 泛型基型：方法签名经 shared/result.ts Result<T>/Envelope<T> 单点实例化——快照方法族
// 返回 Result<DTO>（ok 携值 / error 携 typed unavailable），follow 流帧 = Envelope 全量
// 快照信封（baseline 帧 seq=0）。边界类型公共出口 = host/types.ts（exports['./types']
// 非 root 子路径——官方边界门要求，根出口不在白名单）。
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { Context } from "@deepseek-ai/cordis";
import { FORGE_TASKS_SERVICE_KEY } from "../../shared/contract-constants.js";
import { err, ok, type Envelope, type Result } from "../../shared/result.js";
import type { SessionTaskLinkCard, TaskCard, TaskSnapshot } from "../domain/tasks/types.js";
import type { QueryTaskResult } from "../domain/tasks/query.js";
import type { TaskDetail, TaskDetailQuery } from "../domain/tasks/detail.js";
import type {
  ListTasksQuery,
  TaskGraphEdge,
  TaskGraphQuery,
  TaskStats,
  TaskStatsQuery,
} from "../domain/tasks/list.js";
import type { SessionLinksQuery } from "../domain/tasks/session-links.js";
import type { TasksService } from "../domain/tasks/service.js";
import type { TransitionTaskInput } from "../domain/tasks/transition.js";
import type { ValidateContainerTasksInput, ValidateReport } from "../domain/tasks/validate.js";

/** follow 流重估间隔 ms（任务面无跨进程事件源——收敛定时重估推送，project SEAL 节拍同型） */
export const TASKS_FOLLOW_INTERVAL_MS = 3_000;

/**
 * 任务域服务消费窄面（typert 面只挂快照读 + transition 写 + 批量结算读三族——
 * 惰性现查永不缓存，AGENTS 1.6：检测结果禁 memoize）。
 */
export type TasksServiceFace = Pick<
  TasksService,
  | "listTasks"
  | "taskStats"
  | "taskGraph"
  | "taskDetail"
  | "queryTask"
  | "sessionLinks"
  | "validateFeatureTasks"
  | "transitionTask"
  | "latestSettlementsByTask"
>;

// ── 聚合 DTO（水化 host 半单点完成——client 零拼装）──

/** AC 核销进度（最新结算行的判据核销计数——done = met 数、total = 判据总数） */
export interface AcProgress {
  readonly done: number;
  readonly total: number;
}

/** TaskCard 扩展形态：卡面 + AC 进度聚合（无结算行/零判据 = acProgress 键缺席） */
export interface TaskCardDto extends TaskCard {
  readonly acProgress?: AcProgress;
}

/** TaskDetail 扩展形态：详情全量 + AC 进度聚合 */
export interface TaskDetailDto extends TaskDetail {
  readonly acProgress?: AcProgress;
}

/** 容器任务图 DTO：cards 全量水化 AC 进度 + 边三元组 */
export interface TaskGraphDto {
  readonly tasks: readonly TaskCardDto[];
  readonly edges: readonly TaskGraphEdge[];
}

/** follow 流全量快照（项目/容器任务板——cards + stats 一次取齐） */
export interface TaskBoardDto {
  readonly projectKey: string;
  readonly cards: readonly TaskCardDto[];
  readonly stats: TaskStats;
}

/** follow 流查询（list 同形作用域——容器限定可选） */
export interface TasksFollowQuery {
  readonly projectKey: string;
  readonly slug?: string;
}

/** query 方法入参（显式命名边界类型——四节 include 门控；agent 面同形） */
export interface TasksQueryRequest {
  readonly projectKey: string;
  readonly taskRef: { readonly slug: string; readonly localId: string };
  readonly include?: {
    readonly prerequisites?: boolean;
    readonly waitingOnMe?: boolean;
    readonly records?: boolean;
    readonly sessions?: boolean;
  };
}

/** 控制器依赖缝（工厂惰性——域服务缺席 = namespace 诚实降级，不空挂） */
export interface ForgeTasksRemoteDeps {
  /** 任务域服务惰性现查缝（forgeTasks 具名服务——每个消费点调用期求值，AGENTS 1.6） */
  readonly tasks?: () => TasksServiceFace | undefined;
  /** follow 重估间隔 ms（缺省 TASKS_FOLLOW_INTERVAL_MS——单测注入收敛节拍） */
  readonly followIntervalMs?: number;
  /** 诊断缝（装配/降级留痕——禁直落 console 新增站点，走 config.diag 注入面） */
  readonly diag?: (line: string) => void;
}

/** 注册结果（可观测面——registered = 根 ctx 装上的 namespace；degraded = 降级清单；
 *  pending = inject 生命周期绑挂起中（服务后到经重绑补入 registered）） */
export interface ForgeTasksRegistration {
  readonly registered: readonly string[];
  readonly degraded: readonly string[];
  readonly pending: readonly string[];
}

/**
 * typed unavailable message 模板（前置修显式化——message 字面量钉单源：实现与测试
 * pin 同引本函数，漂移在类型层可见；project unavailableMessage 同型）。
 */
export function unavailableMessage(method: string): string {
  return `forge.tasks ${method} unavailable（本宿主缺 tasks 域服务面）`;
}

/** typed unavailable（族服务缺席——调用期诚实拒绝，Result error 分支非抛错折叠） */
function unavailableResult<T>(method: string): Result<T> {
  return err<T>({ code: "ERR_FORGE_TASKS_UNAVAILABLE", message: unavailableMessage(method) });
}

/** 域服务惰性现查（缺席返回 undefined——本面各方法统一转 typed unavailable） */
function resolveService(deps: ForgeTasksRemoteDeps): TasksServiceFace | undefined {
  return deps.tasks?.();
}

/** AC 进度聚合（最新结算行判据核销计数——零判据/无行 = undefined 键缺席） */
function acProgressOf(latest: { readonly acResults: readonly { readonly met: boolean }[] } | undefined): AcProgress | undefined {
  const total = latest?.acResults.length ?? 0;
  if (total === 0) return undefined;
  return { done: latest!.acResults.filter((r) => r.met).length, total };
}

/**
 * TaskCard → TaskCardDto 批量水化（AC 进度批水化零 N+1）：一次批量结算读
 * （单条 SQL 按 task 取最新行）后按 taskId 拼 Map——禁逐卡查询。
 */
async function hydrateCards(svc: TasksServiceFace, projectKey: string, cards: readonly TaskCard[]): Promise<TaskCardDto[]> {
  const slugs = [...new Set(cards.map((c) => c.slug))];
  const rows = slugs.length === 0 ? [] : await svc.latestSettlementsByTask(projectKey, slugs);
  const latestByTask = new Map(rows.map((r) => [r.taskId, r]));
  return cards.map((card) => {
    const progress = acProgressOf(latestByTask.get(card.taskId));
    return progress === undefined ? card : { ...card, acProgress: progress };
  });
}

/** 任务板快照重估（follow 单帧取数——cards 批水化 + stats 现查一次取齐） */
async function estimateBoard(svc: TasksServiceFace, q: TasksFollowQuery): Promise<TaskBoardDto> {
  const cards = await hydrateCards(svc, q.projectKey, await svc.listTasks({ projectKey: q.projectKey, ...(q.slug !== undefined ? { slug: q.slug } : {}), sort: "created" }));
  const stats = await svc.taskStats({ projectKey: q.projectKey, ...(q.slug !== undefined ? { slug: q.slug } : {}) });
  return { projectKey: q.projectKey, cards, stats };
}

/** follow 流节拍（abort 感知 sleep——取消即出循环，不悬空 fiber；project 同型） */
function followDelay(signal: AbortSignal | undefined, intervalMs: number): Promise<void> {
  return new Promise((resolveDelay) => {
    if (signal?.aborted === true) {
      resolveDelay();
      return;
    }
    const timer = setTimeout(finish, intervalMs);
    const onAbort = (): void => finish();
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolveDelay();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// ── forgeTasks namespace 控制器 ──

export class ForgeTasksRemote extends TypertRemoteService {
  private readonly deps: ForgeTasksRemoteDeps;
  private readonly intervalMs: number;

  constructor(ctx: Context, deps: ForgeTasksRemoteDeps) {
    super(ctx, "forgeTasksController", { namespace: "forgeTasks" });
    this.deps = deps;
    this.intervalMs = deps.followIntervalMs ?? TASKS_FOLLOW_INTERVAL_MS;
  }

  /** 族服务现查（stream 面用——缺席 typed unavailable 抛错，gateway 折叠 RemoteFailure） */
  private service(): TasksServiceFace {
    const svc = resolveService(this.deps);
    if (svc === undefined) throw new Error(unavailableMessage("*"));
    return svc;
  }

  /** 任务清单（search 中英过滤 + sort + AC 进度批水化） */
  @Remote
  async list(q: ListTasksQuery, signal?: AbortSignal): Promise<Result<TaskCardDto[]>> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) return unavailableResult<TaskCardDto[]>("list");
    return ok(await hydrateCards(svc, q.projectKey, await svc.listTasks(q)));
  }

  /** 八态计数（total + byStatus + unmetPending + gatedPending） */
  @Remote
  async stats(q: TaskStatsQuery, signal?: AbortSignal): Promise<Result<TaskStats>> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) return unavailableResult<TaskStats>("stats");
    return ok(await svc.taskStats(q));
  }

  /** 容器任务图（DAG/泳道渲染源——cards 全量 AC 进度水化） */
  @Remote
  async graph(q: TaskGraphQuery, signal?: AbortSignal): Promise<Result<TaskGraphDto>> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) return unavailableResult<TaskGraphDto>("graph");
    const graph = await svc.taskGraph(q);
    return ok({ tasks: await hydrateCards(svc, q.projectKey, graph.tasks), edges: graph.edges });
  }

  /** 任务详情（records/waitingOnMe/sessions/actualFiles/refs 全量水化 + AC 进度） */
  @Remote
  async detail(q: TaskDetailQuery, signal?: AbortSignal): Promise<Result<TaskDetailDto>> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) return unavailableResult<TaskDetailDto>("detail");
    const detail = await svc.taskDetail(q);
    const rows = await svc.latestSettlementsByTask(q.projectKey, [detail.slug]);
    const progress = acProgressOf(rows.find((r) => r.taskId === detail.taskId));
    return ok(progress === undefined ? detail : { ...detail, acProgress: progress });
  }

  /** 查询（四节按 include 门控——agent 面同法的 RPC 读面复用） */
  @Remote
  async query(input: TasksQueryRequest, signal?: AbortSignal): Promise<Result<QueryTaskResult>> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) return unavailableResult<QueryTaskResult>("query");
    return ok(await svc.queryTask(input));
  }

  /** 挂接双源分型卡（会话头 pill 数据源） */
  @Remote
  async sessionLinks(q: SessionLinksQuery, signal?: AbortSignal): Promise<Result<SessionTaskLinkCard[]>> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) return unavailableResult<SessionTaskLinkCard[]>("sessionLinks");
    return ok(await svc.sessionLinks(q));
  }

  /** 只读校验（单 feature 子图五类检查） */
  @Remote
  async validateFeatureTasks(input: ValidateContainerTasksInput, signal?: AbortSignal): Promise<Result<ValidateReport>> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) return unavailableResult<ValidateReport>("validateFeatureTasks");
    return ok(await svc.validateFeatureTasks(input));
  }

  /** 人类纠偏转移（写面透传——域服务 face 在场才可调用；缺席 typed unavailable） */
  @Remote
  async transition(input: TransitionTaskInput, signal?: AbortSignal): Promise<Result<TaskSnapshot>> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) return unavailableResult<TaskSnapshot>("transition");
    return ok(await svc.transitionTask(input));
  }

  /**
   * 任务板 follow 流（mode:'stream'）：先 yield 完整 baseline（seq=0），后随快照变化
   * 逐帧增量（JSON 全量比对，变才 yield）。任务面无跨进程事件源——收敛定时重估推送，
   * 重估间隔 TASKS_FOLLOW_INTERVAL_MS（project followSeal 节拍形态同型）。
   */
  @Remote({ mode: "stream" })
  async *follow(q: TasksFollowQuery, signal?: AbortSignal): AsyncIterable<Envelope<TaskBoardDto>> {
    const svc = this.service();
    let seq = 0;
    let last = "";
    let first = true;
    while (first || signal?.aborted !== true) {
      first = false;
      const snapshot = await estimateBoard(svc, q);
      const json = JSON.stringify(snapshot);
      if (json !== last) {
        last = json;
        yield { seq, snapshot };
        seq += 1;
      }
      if (signal?.aborted === true) return;
      await followDelay(signal, this.intervalMs);
    }
  }
}

// ── 装配（根 ctx plugin 注册——gateway SRC 发现面 = 根 ctx reflect.props）──

/** 插件 ctx 窄面（root 取法——cordis 子 ctx.root 指根；缺席宿主退 ctx 自身） */
export interface TypertAssemblyCtxFace {
  readonly root?: unknown;
  plugin?(options: { name: string; apply: (scope: unknown) => void }): unknown;
  /** cordis inject 生命周期缝（官方机械——deps 在场激活 cb、后到补激活、撤回随 fiber 退） */
  inject?(deps: readonly string[], cb: (scope: Record<string, unknown>) => void): unknown;
}

/** 未知抛错归一（诊断行保 message 可读） */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * forgeTasks Typert Remote 控制器注册（根 ctx plugin——fiber 生命周期归宿主管辖；inject
 * 生命周期绑 forgeTasks 服务键：在场同步激活、后到补激活（bug 253b8265 同径）、撤回随
 * fiber 退；域服务缺席 = namespace 诚实降级 404 语义，单族注册抛错 fail-soft 不阻载）。
 */
export function registerForgeTasksRemote(
  ctx: TypertAssemblyCtxFace,
  deps: ForgeTasksRemoteDeps,
): ForgeTasksRegistration {
  const diag = deps.diag;
  const host = (ctx.root ?? ctx) as TypertAssemblyCtxFace;
  const namespace = "forgeTasks";
  const registered: string[] = [];
  const degraded: string[] = [];
  const pending: string[] = [];
  if (typeof host.plugin !== "function") {
    const line = "[task-loop-typert] ctx.plugin 缺席——forgeTasks 控制器不注册（非 cordis 宿主）";
    diag?.(line);
    degraded.push("assembly");
    return { registered, degraded, pending };
  }
  const inject = host.inject;
  if (typeof inject === "function") {
    // 生命周期绑（官方 ctx.inject 缝——挂起期 namespace 不认领 = 诚实降级 404 语义不变）
    pending.push(namespace);
    degraded.push(namespace);
    inject.call(host, [FORGE_TASKS_SERVICE_KEY], (scope) => {
      try {
        if (scope[FORGE_TASKS_SERVICE_KEY] === undefined) return;
        host.plugin!({
          name: `task-loop-typert-${namespace}`,
          apply: (pluginScope: unknown) => {
            new ForgeTasksRemote(pluginScope as Context, deps);
          },
        });
        registered.push(namespace);
        diag?.(`[task-loop-typert] 迟到重绑：${namespace} 服务在场认领（inject 生命周期缝）`);
      } catch (cause) {
        const line = `[task-loop-typert] ${namespace} 激活失败——本族降级（fail-soft 不阻载）：${messageOf(cause)}`;
        diag?.(line);
      }
    });
  } else if (deps.tasks?.() === undefined) {
    degraded.push(namespace);
  } else {
    try {
      host.plugin({
        name: `task-loop-typert-${namespace}`,
        apply: (pluginScope: unknown) => {
          new ForgeTasksRemote(pluginScope as Context, deps);
        },
      });
      registered.push(namespace);
    } catch (cause) {
      const line = `[task-loop-typert] ${namespace} 注册抛错——本族降级（fail-soft 不阻载）：${messageOf(cause)}`;
      diag?.(line);
      degraded.push(namespace);
    }
  }
  diag?.(
    `[task-loop-typert] forgeTasks 控制器注册完成：registered=[${registered.join(", ")}] degraded=[${degraded.join(", ")}] pending-inject=[${pending.join(", ")}]`,
  );
  return { registered, degraded, pending };
}
