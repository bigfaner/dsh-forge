// host/assembly · typert-remotes.ts —— forgeTasks Typert Remote namespace（官方 Typert
// Remote 正典通路，形态正本 = plugins/project/host/assembly/typert-remotes.ts 实况逐位对齐）：
//   TypertRemoteService 子类 + @Remote 方法装饰器（namespace 'forgeTasks'、serviceKey
//   'forgeTasksController'——既有宿主服务键命名同型）；gateway SRC 发现路径从函数签名解析
//   参数面、codec 全 src-json，端点 = `forgeTasks/<method>`；`signal` 尾参 = cancellation。
//   键名沿用 ForgeTasksRpc 读面八方法（apps/web/src/rpc/client.ts TASKS_CHANNELS 清单——
//   transport 改型，键不漂移）；写面 transition 若域服务 face 在场则透传、缺席 typed
//   unavailable（typed RemoteError 抛出——code 保真过 wire，gateway 保真折叠。注意：
//   project 的 unavailable 抛普通 new Error、gateway 折 gateway/internal，本插件为
//   更强的 typed 形态，不与其「形态一致」）。
//   键族聚合（2026-11-24 用户方案 A——f5）：快照族 list/stats/graph/follow 按键族聚合
//   （keyFamilyOf = 主根键兜底 + forge.worktrees 注册面 worktree 键增量补充——写侧
//   已按 worktree 形态确定性归拢主根键，注册缝缺席 = 回退主根兜底单键）；非快照操作面维持单键 keyOf。
//
// 发现面铁律（project 侦察定谳同径）：gateway 只遍历根 ctx reflect.props——控制器经
// rootCtx.plugin 注册进根 ctx；生命周期归插件 fiber（dispose 级联拆卸）。
//
// 泛型基型：信封纪律（2026-11-24 真机双层信封根因修口——对齐 project 五族形态）：
// @Remote 端点成功返裸值（官方 gateway serve 层单层包传输信封），typed 失败/身份未解析/
// unavailable 抛 RemoteError（code 保真过 wire——client failure 分支承接）；follow 流帧 =
// Envelope 全量快照信封（baseline 帧 seq=0——流帧不经 Result 信封）。边界类型公共出口 =
// host/types.ts（exports['./types'] 非 root 子路径——官方边界门要求，根出口不在白名单）。
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { Context } from "@deepseek-ai/cordis";
import { rootCtxOf } from "@dsh-forge/lib-util";
import { TASK_STATUSES, type TaskStatus } from "@dsh-forge/contracts";
import { FORGE_TASKS_SERVICE_KEY } from "../../shared/contract-constants.js";
import { projectKeyOf } from "@dsh-forge/lib-path";
import type { Envelope } from "../../shared/result.js";
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
import type { AcSettlementsAggregate } from "../domain/tasks/ac-match.js";
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
  | "matchAcSettlements"
>;

export type { AcSettlementsAggregate };

/** matchAcSettlements 入参（agent/域面同形——判据文本清单进、聚合 DTO 出） */
export interface AcSettlementsRequest {
  readonly projectKey: string;
  readonly criteria: readonly string[];
}

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

// ── 入参身份（bug 9407ff29 修型——host 半解析、客户端零投影，架构裁决）：快照方法族
//    入参身份统一官方语境（projectId），host 半经 forge.projects 缝解析为 project_key 后
//    查域表；浏览器半缺 dirName 派生源（derive-dir 承载 node:crypto），正确性 host 单点
//    保证（AGENTS 1.1 硬约束）。domain 查询类型仍持 projectKey（工具/loop 面 cwd 绑定语义
//    不变）——remote 面 Omit 换身份为唯一改型位。

/** forge.projects 缝结构窄面（projectId → 行真值——plugins/project 五缝 forge.projects
 *  同键结构消费；expert-squad 同径不依赖该包，结构兼容最小面） */
export interface ForgeProjectsIdentityFace {
  getProject(projectId: string): Promise<{ readonly wsPath: string } | null>;
}

/** remote 面查询（list 同形——身份换 projectId） */
export interface TasksRemoteListQuery extends Omit<ListTasksQuery, "projectKey"> {
  readonly projectId: string;
}

/** remote 面查询（stats 同形——身份换 projectId） */
export interface TasksRemoteStatsQuery extends Omit<TaskStatsQuery, "projectKey"> {
  readonly projectId: string;
}

/** remote 面查询（graph 同形——身份换 projectId） */
export interface TasksRemoteGraphQuery extends Omit<TaskGraphQuery, "projectKey"> {
  readonly projectId: string;
}

/** remote 面查询（detail 同形——身份换 projectId） */
export interface TasksRemoteDetailQuery extends Omit<TaskDetailQuery, "projectKey"> {
  readonly projectId: string;
}

/** remote 面查询入参（query 同形——身份换 projectId） */
export interface TasksRemoteQueryRequest extends Omit<TasksQueryRequest, "projectKey"> {
  readonly projectId: string;
}

/** remote 面查询（sessionLinks 同形——身份换 projectId） */
export interface TasksRemoteSessionLinksQuery extends Omit<SessionLinksQuery, "projectKey"> {
  readonly projectId: string;
}

/** remote 面入参（validateFeatureTasks 同形——身份换 projectId） */
export interface TasksRemoteValidateInput extends Omit<ValidateContainerTasksInput, "projectKey"> {
  readonly projectId: string;
}

/** remote 面入参（transition 同形——身份换 projectId） */
export interface TasksRemoteTransitionInput extends Omit<TransitionTaskInput, "projectKey"> {
  readonly projectId: string;
}

/** remote 面查询（follow 同形——身份换 projectId） */
export interface TasksRemoteFollowQuery extends Omit<TasksFollowQuery, "projectKey"> {
  readonly projectId: string;
}

/** remote 面入参（acSettlements 同形——身份换 projectId） */
export interface TasksRemoteAcSettlementsRequest extends Omit<AcSettlementsRequest, "projectKey"> {
  readonly projectId: string;
}

/** forge.worktrees 注册面结构窄面（worktree 键族清单——plugins/project 五缝 forge.worktrees
 *  同键结构消费：list({projectRoot}) → entries[].path（WorktreeEntryDto.path 窄面）；
 *  本面零包依赖，结构兼容最小面——同 ForgeProjectsIdentityFace 形态） */
export interface ForgeWorktreesFamilyFace {
  list(q: { readonly projectRoot: string }): Promise<{ readonly entries: readonly { readonly path: string }[] }>;
}
/**
 * forge.worktrees 键族缝组合根取法（f5 键族聚合——快照族 worktree 键清单源单源）：
 * plugins/project 五缝 forge.worktrees 结构消费（PROJECT_SEAM_KEYS.worktrees 同键——
 * 缝为惰性工厂 provide，工厂调用产 face；本面只取 list 清单窄面 entries[].path）。
 * 现查永不缓存（AGENTS 1.6）；三级劣形收窄：reflect.get 产出非函数（劣形①）→ 工厂
 * 调用产出 null/原始值（劣形②）→ face.list 非函数（劣形③），均 undefined——remote
 * 面回退单键降级承担；取法恒走 "forge.worktrees" 点分键（ctxReflectGet 同 project 缝）。
 * 留痕（评审 E①）：本取法与 plugins/spec 同型复制、未收敛跨插件单源——收敛需新建
 * 共享包（超出本任务影响范围）；形状漂移由两侧组合根 pin（worktrees-face-pin）对锁。
 */
export function lazyWorktreesFace(ctx: unknown): () => ForgeWorktreesFamilyFace | undefined {
  return () => {
    try {
      const factory = (ctx as { reflect?: { get?(name: string): unknown } }).reflect?.get?.("forge.worktrees");
      if (typeof factory !== "function") return undefined;
      const face = (factory as () => unknown)();
      if (face === null || face === undefined || typeof face !== "object") return undefined;
      const candidate = face as { list?: unknown };
      return typeof candidate.list === "function" ? (candidate as ForgeWorktreesFamilyFace) : undefined;
    } catch {
      return undefined;
    }
  };
}

/** 项目身份未解析 typed message（钉单源——实现与测试同引本函数） */
export function projectUnresolvedMessage(projectId: string): string {
  return `forge.tasks project 未解析（forge.projects 缝缺席或 projectId 未命中）：projectId=${projectId}`;
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
  /**
   * forge.projects 身份解析缝（惰性现查——每个消费点调用期求值，AGENTS 1.6；缺席 =
   * 解析失败 fail-soft 降级「无任务数据」+ 诊断留痕，不静默空集）。253b8265 判例同族：
   * 缝生命周期绑由 host/index.ts inject 名单显式声明承担，本面零缓存。
   */
  readonly projects?: () => ForgeProjectsIdentityFace | undefined;
  /**
   * forge.worktrees 注册面缝（惰性现查——每个消费点调用期求值，AGENTS 1.6）：键族解析
   * 依据（主根 wsPath → 注册面 worktree 清单 → 各 path 派生 worktree 键）；缺席/抛错 =
   * 快照族回退单键现状（worktrees 注册缝缺席降级），诊断留痕不静默。
   */
  readonly worktrees?: () => ForgeWorktreesFamilyFace | undefined;
  /**
   * 注册后自探针缝（boot 竞速根治——project 实况同径）：typertGateway invoke 直探 =
   * serve 层认领自证（零副作用读面；注册完成行后时点即装配序判据——先于 client mount
   * 首探）。gateway 缺席/调用失败 = 自探针失败诊断行，fail-soft 不阻载。
   */
  readonly selfProbe?: (namespace: string, method: string, args?: Record<string, unknown>) => Promise<unknown>;
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

/** typed unavailable 抛出（信封去 Result 化——gateway rpcFailure 保真折叠 code 过 wire） */
function unavailableFailure(method: string): never {
  throw new RemoteError("ERR_FORGE_TASKS_UNAVAILABLE", unavailableMessage(method), {});
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

/** 任务板快照重估（follow 单帧取数——键族逐键 cards 批水化 + stats 求和一次取齐） */
async function estimateBoard(svc: TasksServiceFace, keys: readonly string[], slug?: string): Promise<TaskBoardDto> {
  const cards: TaskCardDto[][] = [];
  const statsRows: TaskStats[] = [];
  for (const key of keys) {
    const slugQuery = slug !== undefined ? { slug } : {};
    cards.push(await hydrateCards(svc, key, await svc.listTasks({ projectKey: key, ...slugQuery, sort: "created" })));
    statsRows.push(await svc.taskStats({ projectKey: key, ...slugQuery }));
  }
  return { projectKey: keys[0] ?? "", cards: mergeCards(cards), stats: sumStats(statsRows) };
}

/** 键族边合并（graph 同径聚合——(taskId, prerequisiteId, origin) 三元组显式去重键、保首见序：
 *  同 slug 双键（worktree 检出含同 .forge 属常态）下同一 taskId 的边行两键同现，不去重即
 *  DAG/泳道渲染边双计——该去重分支被 tests/assembly/typert-remotes.test.ts 双键反例钉死可失败） */
function mergeEdges(lists: readonly (readonly TaskGraphEdge[])[]): TaskGraphEdge[] {
  const seen = new Set<string>();
  const merged: TaskGraphEdge[] = [];
  for (const list of lists) {
    for (const edge of list) {
      const dedupeKey = `${edge.taskId}\u0000${edge.prerequisiteId}\u0000${edge.origin}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      merged.push(edge);
    }
  }
  return merged;
}

/** 零任务统计（解析失败 fail-soft 降级形态——八态含 0 键，域统计同形） */
function zeroStats(): {
  total: number;
  byStatus: Record<TaskStatus, number>;
  unmetPending: number;
  gatedPending: number;
} {
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
  return { total: 0, byStatus, unmetPending: 0, gatedPending: 0 };
}

/** 键族卡片合并（list/graph/follow 同径聚合——taskId 去重保首见序，主根键先行） */
function mergeCards(lists: readonly (readonly TaskCardDto[])[]): TaskCardDto[] {
  const seen = new Set<string>();
  const merged: TaskCardDto[] = [];
  for (const list of lists) {
    for (const card of list) {
      if (seen.has(card.taskId)) continue;
      seen.add(card.taskId);
      merged.push(card);
    }
  }
  return merged;
}

/** 键族统计求和（八态逐键累加——byStatus 全键并集含 0 键） */
function sumStats(list: readonly TaskStats[]): TaskStats {
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
  let total = 0;
  let unmetPending = 0;
  let gatedPending = 0;
  for (const s of list) {
    total += s.total;
    unmetPending += s.unmetPending;
    gatedPending += s.gatedPending;
    for (const k of TASK_STATUSES) byStatus[k] += s.byStatus[k] ?? 0;
  }
  return { total, byStatus, unmetPending, gatedPending };
}

/** 项目身份未解析 typed 抛出（row/write 面——非快照族，诚实拒绝不空集） */
function unresolvedFailure(projectId: string): never {
  throw new RemoteError("ERR_FORGE_TASKS_PROJECT_UNRESOLVED", projectUnresolvedMessage(projectId), {});
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

  /**
   * 项目身份解析（host 半单点——projectId → {wsPath, project_key}）：forge.projects 缝现查
   * getProject().wsPath → deriveProjectKey 本地派生（lib-path 单源）；缝缺席/未命中/
   * 抛错 = 诊断留痕（不静默）返回 undefined——快照族调用方降级「无任务数据」。
   */
  private async resolveProject(projectId: string): Promise<{ readonly wsPath: string; readonly key: string } | undefined> {
    const projects = this.deps.projects?.();
    if (projects === undefined) {
      this.deps.diag?.(`[forgeTasks] 身份解析缝缺席（forge.projects）——快照族降级无任务数据：projectId=${projectId}`);
      return undefined;
    }
    try {
      const project = await projects.getProject(projectId);
      if (project !== null && project !== undefined && typeof project.wsPath === "string" && project.wsPath !== "") {
        return { wsPath: project.wsPath, key: projectKeyOf(project.wsPath) };
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.deps.diag?.(`[forgeTasks] 身份解析失败（getProject 抛错 fail-soft）——快照族降级无任务数据：projectId=${projectId}：${message}`);
      return undefined;
    }
    this.deps.diag?.(`[forgeTasks] 身份解析未命中（行空/wsPath 空）——快照族降级无任务数据：projectId=${projectId}`);
    return undefined;
  }

  /** 单键身份解析（非快照操作面 detail/query/sessionLinks/validate/transition/acSettlements 维持现状） */
  private async keyOf(projectId: string): Promise<string | undefined> {
    return (await this.resolveProject(projectId))?.key;
  }

  /**
   * 键族解析（2026-11-24 用户方案 A——快照族按键族聚合；同日用户裁决——worktree 归拢
   * 确定性化）：主根键恒为键族**兜底成员**（写侧 tool-family resolveProjectKey 已按
   * `{root}\.forge\worktrees\<name>` 形态确定性归拢主根键——不依赖本缝在场，缝缺席
   * ≠ 归拢失效）；forge.worktrees 注册缝降级为**增量补充**（存量 worktree 键行仍经
   * `list entries[].path` 逐 path 派生可见——写面不外溢）。缝缺席/list 抛错 = 回退
   * 主根兜底单键（降级显式诊断留痕，不静默）。
   */
  private async keyFamilyOf(projectId: string): Promise<string[]> {
    const main = await this.resolveProject(projectId);
    if (main === undefined) return [];
    const worktrees = this.deps.worktrees?.();
    if (worktrees === undefined) {
      this.deps.diag?.(`[forgeTasks] 键族缝缺席（forge.worktrees）——快照族回退主根兜底单键（写侧已确定性归拢）：projectId=${projectId}`);
      return [main.key];
    }
    try {
      const result = await worktrees.list({ projectRoot: main.wsPath });
      const keys = [main.key, ...result.entries.map((entry) => projectKeyOf(entry.path))];
      return [...new Set(keys)];
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.deps.diag?.(`[forgeTasks] 键族清单失败（forge.worktrees list 抛错 fail-soft）——快照族回退单键：projectId=${projectId}：${message}`);
      return [main.key];
    }
  }

  /** 任务清单（键族聚合——search 中英过滤 + sort + AC 进度批水化；taskId 去重合并） */
  @Remote
  async list(q: TasksRemoteListQuery, signal?: AbortSignal): Promise<TaskCardDto[]> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) unavailableFailure("list");
    const keys = await this.keyFamilyOf(q.projectId);
    if (keys.length === 0) return [];
    const lists: TaskCardDto[][] = [];
    for (const key of keys) {
      lists.push(
        await hydrateCards(
          svc,
          key,
          await svc.listTasks({
            projectKey: key,
            ...(q.slug !== undefined ? { slug: q.slug } : {}),
            ...(q.statusFilter !== undefined ? { statusFilter: q.statusFilter } : {}),
            ...(q.search !== undefined ? { search: q.search } : {}),
            ...(q.sort !== undefined ? { sort: q.sort } : {}),
          }),
        ),
      );
    }
    return mergeCards(lists);
  }

  /** 八态计数（键族聚合——total + byStatus + unmetPending + gatedPending 逐键求和） */
  @Remote
  async stats(q: TasksRemoteStatsQuery, signal?: AbortSignal): Promise<TaskStats> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) unavailableFailure("stats");
    const keys = await this.keyFamilyOf(q.projectId);
    if (keys.length === 0) return zeroStats();
    const rows: TaskStats[] = [];
    for (const key of keys) {
      rows.push(await svc.taskStats({ projectKey: key, ...(q.slug !== undefined ? { slug: q.slug } : {}) }));
    }
    return sumStats(rows);
  }

  /** 容器任务图（键族聚合——DAG/泳道渲染源：tasks 并集去重 + edges 三元组并集去重，cards 全量水化） */
  @Remote
  async graph(q: TasksRemoteGraphQuery, signal?: AbortSignal): Promise<TaskGraphDto> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) unavailableFailure("graph");
    const keys = await this.keyFamilyOf(q.projectId);
    if (keys.length === 0) return { tasks: [], edges: [] };
    const tasks: TaskCardDto[][] = [];
    const edges: TaskGraphEdge[] = [];
    for (const key of keys) {
      const graph = await svc.taskGraph({ projectKey: key, slug: q.slug });
      tasks.push(await hydrateCards(svc, key, graph.tasks));
      edges.push(...graph.edges);
    }
    return { tasks: mergeCards(tasks), edges: mergeEdges([edges]) };
  }

  /** 任务详情（records/waitingOnMe/sessions/actualFiles/refs 全量水化 + AC 进度） */
  @Remote
  async detail(q: TasksRemoteDetailQuery, signal?: AbortSignal): Promise<TaskDetailDto> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) unavailableFailure("detail");
    const projectKey = await this.keyOf(q.projectId);
    if (projectKey === undefined) unresolvedFailure(q.projectId);
    const detail = await svc.taskDetail({ ...q, projectKey });
    const rows = await svc.latestSettlementsByTask(projectKey, [detail.slug]);
    const progress = acProgressOf(rows.find((r) => r.taskId === detail.taskId));
    return progress === undefined ? detail : { ...detail, acProgress: progress };
  }

  /** 查询（四节按 include 门控——agent 面同法的 RPC 读面复用） */
  @Remote
  async query(input: TasksRemoteQueryRequest, signal?: AbortSignal): Promise<QueryTaskResult> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) unavailableFailure("query");
    const projectKey = await this.keyOf(input.projectId);
    if (projectKey === undefined) unresolvedFailure(input.projectId);
    return svc.queryTask({ ...input, projectKey });
  }

  /** 挂接双源分型卡（会话头 pill 数据源） */
  @Remote
  async sessionLinks(q: TasksRemoteSessionLinksQuery, signal?: AbortSignal): Promise<SessionTaskLinkCard[]> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) unavailableFailure("sessionLinks");
    const projectKey = await this.keyOf(q.projectId);
    if (projectKey === undefined) unresolvedFailure(q.projectId);
    return svc.sessionLinks({ ...q, projectKey });
  }

  /** 只读校验（单 feature 子图五类检查） */
  @Remote
  async validateFeatureTasks(input: TasksRemoteValidateInput, signal?: AbortSignal): Promise<ValidateReport> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) unavailableFailure("validateFeatureTasks");
    const projectKey = await this.keyOf(input.projectId);
    if (projectKey === undefined) unresolvedFailure(input.projectId);
    return svc.validateFeatureTasks({ ...input, projectKey });
  }

  /** 人类纠偏转移（写面透传——域服务 face 在场才可调用；缺席 typed unavailable） */
  @Remote
  async transition(input: TasksRemoteTransitionInput, signal?: AbortSignal): Promise<TaskSnapshot> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) unavailableFailure("transition");
    const projectKey = await this.keyOf(input.projectId);
    if (projectKey === undefined) unresolvedFailure(input.projectId);
    return svc.transitionTask({ ...input, projectKey });
  }

  /** AC 结算聚合（判据文本清单进、聚合 DTO 出——criterion/met/evidence?/taskRefs[]/unmatched） */
  @Remote
  async acSettlements(q: TasksRemoteAcSettlementsRequest, signal?: AbortSignal): Promise<AcSettlementsAggregate> {
    signal?.throwIfAborted();
    const svc = resolveService(this.deps);
    if (svc === undefined) unavailableFailure("acSettlements");
    const projectKey = await this.keyOf(q.projectId);
    if (projectKey === undefined) unresolvedFailure(q.projectId);
    return svc.matchAcSettlements(projectKey, q.criteria);
  }

  /**
   * 任务板 follow 流（mode:'stream'）：先 yield 完整 baseline（seq=0），后随快照变化
   * 逐帧增量（JSON 全量比对，变才 yield）。任务面无跨进程事件源——收敛定时重估推送，
   * 重估间隔 TASKS_FOLLOW_INTERVAL_MS（project followSeal 节拍形态同型）。
   */
  @Remote({ mode: "stream" })
  async *follow(q: TasksRemoteFollowQuery, signal?: AbortSignal): AsyncIterable<Envelope<TaskBoardDto>> {
    const svc = this.service();
    let seq = 0;
    let last = "";
    let first = true;
    while (first || signal?.aborted !== true) {
      first = false;
      const keys = await this.keyFamilyOf(q.projectId);
      if (keys.length === 0) {
        // 解析失败 fail-soft：单帧「无任务数据」baseline 后收流（每帧诊断已由 keyFamilyOf 留痕，
        // 不静默空转——客户端呈「无任务数据」终态，缝到场由客户端重订阅承接）
        yield { seq, snapshot: { projectKey: "", cards: [], stats: zeroStats() } };
        return;
      }
      const snapshot = await estimateBoard(svc, keys, q.slug);
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

/** 插件 ctx 窄面（根 ctx 取法走符号键 rootCtxOf——bug 2801eeeb 同族复发：ctx.root 属性访问触发 cordis 1.1.0 inject 门控；非 ctx 形入参退自身） */
export interface TypertAssemblyCtxFace {
  plugin?(options: { name: string; apply: (scope: unknown) => void }): unknown;
  /** cordis inject 生命周期缝（官方机械——deps 在场激活 cb、后到补激活、撤回随 fiber 退） */
  inject?(deps: readonly string[], cb: (scope: Record<string, unknown>) => void): unknown;
}

/** 未知抛错归一（诊断行保 message 可读） */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** 控制器注册表（namespace → 工厂——project 实况形态；缺族不注册不空挂。injectKey =
 *  cordis inject 生命周期绑族（域服务 provide 时点可晚于本装配——bug 253b8265：apply
 *  时点探针冻结 degraded，迟到服务恒 404；官方 inject 缝——在场激活/后到补激活/撤回随
 *  fiber 退）。absentWhen 探针调用期求值（惰性现查永不缓存，AGENTS 1.6）。 */
const CONTROLLERS: readonly {
  readonly namespace: string;
  readonly injectKey?: string;
  readonly absentWhen?: (deps: ForgeTasksRemoteDeps) => boolean;
  readonly mount: (scope: Context, deps: ForgeTasksRemoteDeps) => unknown;
}[] = [
  {
    namespace: "forgeTasks",
    injectKey: FORGE_TASKS_SERVICE_KEY,
    absentWhen: (d) => d.tasks?.() === undefined,
    mount: (scope, deps) => new ForgeTasksRemote(scope, deps),
  },
];

/**
 * forgeTasks Typert Remote 控制器注册（根 ctx plugin——fiber 生命周期归宿主管辖；CONTROLLERS
 * 注册表逐行挂载，注册三态可观测 registered/degraded/pending + 完成行诊断留痕；单族注册
 * 抛错 fail-soft 不阻载。注册后自探针：registered 族经 gateway invoke 直探零副作用读面 =
 * serve 层认领自证（boot 竞速根治——project 实况同径；失败只落诊断不阻载）。
 */
export function registerForgeTasksRemote(
  ctx: TypertAssemblyCtxFace,
  deps: ForgeTasksRemoteDeps,
): ForgeTasksRegistration {
  const diag = deps.diag;
  const host = (rootCtxOf(ctx) ?? ctx) as TypertAssemblyCtxFace;
  const registered: string[] = [];
  const degraded: string[] = [];
  const pending: string[] = [];
  if (typeof host.plugin !== "function") {
    const line = "[task-loop-typert] ctx.plugin 缺席——Typert 控制器不注册（非 cordis 宿主）";
    diag?.(line);
    degraded.push("assembly");
    return { registered, degraded, pending };
  }
  for (const controller of CONTROLLERS) {
    const inject = host.inject;
    if (controller.injectKey !== undefined && typeof inject === "function") {
      // 生命周期绑（官方 ctx.inject 缝——挂起期 namespace 不认领 = 诚实降级 404 语义不变）
      pending.push(controller.namespace);
      degraded.push(controller.namespace);
      // 方法调用形态（receiver 保持 host 官方面——cordis 4 Proxy 方法解绑即崩，provide 同判例）
      host.inject!([controller.injectKey], (scope) => {
        try {
          if (scope[controller.injectKey!] === undefined) return;
          host.plugin!({
            name: `task-loop-typert-${controller.namespace}`,
            apply: (pluginScope: unknown) => {
              controller.mount(pluginScope as Context, deps);
            },
          });
          registered.push(controller.namespace);
          diag?.(`[task-loop-typert] 迟到重绑：${controller.namespace} 服务在场认领（inject 生命周期缝）`);
        } catch (cause) {
          const line = `[task-loop-typert] ${controller.namespace} 激活失败——本族降级（fail-soft 不阻载）：${messageOf(cause)}`;
          diag?.(line);
        }
      });
      continue;
    }
    if (controller.absentWhen?.(deps) === true) {
      degraded.push(controller.namespace);
      continue;
    }
    try {
      host.plugin({
        name: `task-loop-typert-${controller.namespace}`,
        apply: (pluginScope: unknown) => {
          controller.mount(pluginScope as Context, deps);
        },
      });
      registered.push(controller.namespace);
    } catch (cause) {
      const line = `[task-loop-typert] ${controller.namespace} 注册抛错——本族降级（fail-soft 不阻载）：${messageOf(cause)}`;
      diag?.(line);
      degraded.push(controller.namespace);
    }
  }
  diag?.(
    `[task-loop-typert] Typert 遥控器注册完成：registered=[${registered.join(", ")}] degraded=[${degraded.join(", ")}] pending-inject=[${pending.join(", ")}]`,
  );
  // 注册后自探针（boot 竞速根治）：registered 族立即经 gateway invoke 直探零副作用读面
  // ——serve 层认领自证（装配序判据 = 本探针时点晚于注册、早于 client mount 首探）。
  // fail-soft：结果只落诊断（ok=info 形完成行、失败=失败因），不阻载。
  if (typeof deps.selfProbe === "function" && registered.includes("forgeTasks")) {
    void Promise.resolve()
      .then(() => deps.selfProbe!("forgeTasks", "list", { projectId: "" }))
      .then(
        () => diag?.("[task-loop-typert] 注册后自探针 ok：forgeTasks/list（serve 层认领在场）"),
        (cause: unknown) =>
          diag?.(`[task-loop-typert] 注册后自探针失败：forgeTasks/list——${messageOf(cause)}`),
      );
  }
  return { registered, degraded, pending };
}
