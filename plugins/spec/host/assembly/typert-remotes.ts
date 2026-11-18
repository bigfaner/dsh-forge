// host/assembly · typert-remotes.ts —— forgeSpecs host 半 Typert namespace（plugin-spec 1.5，
// code-design §6；形态逐位对齐 plugins/project/host/assembly/typert-remotes.ts 实况正本）。
//
// 官方 Typert Remote namespace = 官方 UI 数据第一等通道：TypertRemoteService 子类 +
// @Remote 方法装饰器（namespace forgeSpecs / serviceKey forgeSpecsController——既有宿主
// 服务键命名同型），gateway SRC 发现路径从函数签名解析参数面、codec 全 src-json，
// 端点 = `forgeSpecs/<method>`；`signal` 尾参 = cancellation。
//
// DTO 单点收口（M5 UI 数据面——禁 client 拼装）：host 半聚合水化，只读消费 forgeSpecs
// 域服务（域逻辑唯一事实源）+ AC 投影现查缝（AGENTS 1.6 每次调用期求值禁缓存）。
// Result/Envelope 沿 shared/result 单源基型（快照方法族返回 Result、follow 流帧携
// Envelope——typed unavailable 诚实降级非抛错折叠；follow 流调用期抛错语义同 project
// followSeal 先例）。
//
// 发现面铁律（project 判例同径）：gateway 只遍历根 ctx reflect.props——控制器经根 ctx
// plugin 注册进根 ctx；生命周期归插件 fiber（dispose 级联拆卸）。
//
// 身份缝：端点入参 projectId → host 半 identity 解析（forge.projects 缝——getProject
// 别名锚单源在 project 侧 queries；本插件零 project 依赖，结构性窄面现查）。未解析分层：
// 快照族（list/follow）空集诚实降级 / detail·query·projection·transition 族 typed 拒绝。
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { Context } from "@deepseek-ai/cordis";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  isSpecError,
  deriveProjectKey,
  type ForgeSpecsService,
} from "../domain/specs/service.js";
import type { SpecRow, SpecStatus, TransitionActor } from "../db/row-types.js";
import { SPEC_STATUSES } from "../db/row-types.js";
import {
  projectAcsStates,
  type AcProjectionRow,
  type AcSettlementsFace,
} from "../tools/projection.js";
import { err, ok, type Envelope, type Result } from "../../shared/result.js";
import { FORGE_SPECS_SERVICE_KEY } from "../../shared/contract-constants.js";

/** 封存 follow 流重估间隔 ms（盘面/db 无跨进程事件源，轮询收敛为快照推送） */
export const SPEC_FOLLOW_INTERVAL_MS = 3_000;

/** 身份解析窄面：projectId → 检出根 + 归属键（forge.projects 缝——未解析 = null） */
export interface SpecIdentityResolution {
  readonly projectKey: string;
  readonly wsPath: string;
}

/** projectId 身份缝（惰性现查——装配面注 forgeProjectsIdentityOf 真实现，测试注桩） */
export type SpecIdentityFace = (projectId: string) => Promise<SpecIdentityResolution | null>;

/** forgeSpecs 控制器依赖缝（全惰性现查——族缺席 = typed unavailable 诚实降级） */
export interface ForgeSpecRemoteDeps {
  /** forgeSpecs 域服务缝（域逻辑唯一事实源只读消费——缺席宿主全族 typed unavailable） */
  readonly specs?: () => ForgeSpecsService | undefined;
  /** AC 投影现查缝（task-loop forgeTasks matchAcSettlements——AGENTS 1.6 调用期求值） */
  readonly acSettlementsOf?: () => AcSettlementsFace | undefined;
  /** projectId 身份缝（forge.projects 缝——缺席/未解析分层降级） */
  readonly identity?: SpecIdentityFace;
  /** follow 重估间隔 ms（缺省 SPEC_FOLLOW_INTERVAL_MS——单测注入收敛节拍） */
  readonly followIntervalMs?: number;
  /** 诊断缝（装配/降级留痕——缺席静默不阻载） */
  readonly diag?: (line: string) => void;
  /** 注册后自探针缝（project 同径——缺席 = 跳过） */
  readonly selfProbe?: (namespace: string, method: string) => Promise<unknown>;
}

/** 注册结果（可观测面——registered = 根 ctx 装上的 namespace；degraded = 降级清单；
 *  pending = inject 生命周期绑挂起中（服务后到经补绑转 registered）） */
export interface SpecTypertRegistration {
  readonly registered: readonly string[];
  readonly degraded: readonly string[];
  readonly pending: readonly string[];
}

/**
 * typed unavailable message 模板（前置修显式化——message 字面量钉单源：
 * 实现与测试 pin 同引本函数，漂移在类型层可见）。
 */
export function unavailableMessage(method: string, family: string): string {
  return `forge.${family} ${method} unavailable（本宿主缺 ${family} 域服务面）`;
}

/** Result error 分支 typed 码集（本端点族封闭——域 typed code 直透） */
const UNAVAILABLE_CODE = "ERR_SPEC_UNAVAILABLE";
const IDENTITY_UNRESOLVED_CODE = "ERR_SPEC_IDENTITY_UNRESOLVED";
const NOT_FOUND_CODE = "ERR_SPEC_NOT_FOUND";
const FAILED_CODE = "ERR_SPEC_REMOTE_FAILED";

function resultError(code: string, message: string): Result<never> {
  return err({ code, message });
}

/** 未知抛错归一（Result error 分支——域 SpecError code 直透） */
function errorOf(cause: unknown): Result<never> {
  if (isSpecError(cause)) return resultError(cause.code, cause.message);
  return resultError(FAILED_CODE, cause instanceof Error ? cause.message : String(cause));
}

// ── host 半 DTO（单点水化——禁 client 拼装）──

/** Spec 卡片（M5 UI 三视图清单行） */
export interface SpecCardDto {
  readonly slug: string;
  readonly title: string;
  readonly specStatus: SpecStatus;
  readonly tiers: readonly string[];
  readonly goalCount: number;
  readonly acCount: number;
  readonly updatedAt: string;
}

/** 流转台账行 DTO（transitions 节 wire 形态——边界门要约束类型禁 unknown） */
export interface SpecTransitionDto {
  readonly id: string;
  readonly specId: string;
  readonly fromStatus: SpecStatus;
  readonly toStatus: SpecStatus;
  readonly note: string | null;
  readonly actor: TransitionActor;
  readonly createdAt: string;
}

/** Spec 详情（父链全量 + 文档登记悬空态 + 流转台账） */
export interface SpecDetailDto extends SpecCardDto {
  readonly goals: readonly {
    readonly title: string;
    readonly brief?: string;
    readonly acs: readonly { readonly criterion: string }[];
  }[];
  readonly doc?: { readonly relPath: string; readonly dangling: boolean };
  readonly transitions: readonly SpecTransitionDto[];
}

/** query 端点 include 四节门控（缺省 = 全节） */
export interface SpecQueryInclude {
  readonly goals?: boolean;
  readonly acs?: boolean;
  readonly projection?: boolean;
  readonly transitions?: boolean;
}

/** query 端点返回（agent 面读面同形——include 关节 = 键缺席；边界类型全约束） */
export type SpecQueryResultDto =
  & { readonly spec: SpecRow }
  & Partial<{
    readonly goals: readonly {
      readonly title: string;
      readonly brief?: string;
      readonly acs: readonly { readonly criterion: string }[];
    }[];
    readonly doc: { readonly relPath: string };
    readonly transitions: readonly SpecTransitionDto[];
    readonly acProjection: readonly AcProjectionRow[];
  }>;

/** AC 投影聚合 DTO（模块③投影流水复用——goals 分组保父链序） */
export interface AcProjectionDto {
  readonly goals: readonly { readonly title: string; readonly acs: readonly AcProjectionRow[] }[];
}

/** 看板统计（follow 快照节） */
export interface SpecBoardStats {
  readonly total: number;
  readonly byStatus: Readonly<Record<SpecStatus, number>>;
}

/** 看板快照（follow 流帧载荷——cards + stats） */
export interface SpecBoardDto {
  readonly cards: readonly SpecCardDto[];
  readonly stats: SpecBoardStats;
}

/** transition 写面透传快照（SpecRow 形态直投） */
export type SpecSnapshot = SpecRow;

/** forgeSpecs namespace 控制器（serviceKey = forgeSpecsController——官方 settingsController 同型） */
export class ForgeSpecsRemote extends TypertRemoteService {
  private readonly specsOf: () => ForgeSpecsService | undefined;
  private readonly acSettlementsOf: () => AcSettlementsFace | undefined;
  private readonly identityOf: SpecIdentityFace | undefined;
  private readonly intervalMs: number;

  constructor(ctx: Context, deps: ForgeSpecRemoteDeps) {
    super(ctx, "forgeSpecsController", { namespace: "forgeSpecs" });
    this.specsOf = deps.specs ?? (() => undefined);
    this.acSettlementsOf = deps.acSettlementsOf ?? (() => undefined);
    this.identityOf = deps.identity;
    this.intervalMs = deps.followIntervalMs ?? SPEC_FOLLOW_INTERVAL_MS;
  }

  /** 域服务窄取（族缺席 = typed unavailable——Result error 分支携带） */
  private specs(): ForgeSpecsService {
    const svc = this.specsOf();
    if (svc === undefined) {
      throw new Error(unavailableMessage("*", "specs"));
    }
    return svc;
  }

  /** 族缺席 Result 归一（快照方法族——诚实降级非抛错折叠） */
  private unavailableResult<T>(method: string): Result<T> {
    return resultError(UNAVAILABLE_CODE, unavailableMessage(method, "specs"));
  }

  /** 身份解析（未解析/缝抛错 = null——分层降级判定基点） */
  private async resolveIdentity(projectId: string): Promise<SpecIdentityResolution | null> {
    if (this.identityOf === undefined) return null;
    try {
      return await this.identityOf(projectId);
    } catch {
      return null;
    }
  }

  /** 卡片水化（父链回查计数——host 半单点聚合，UI 零拼装） */
  private cardOf(chain: NonNullable<ReturnType<ForgeSpecsService["getSpec"]>>): SpecCardDto {
    const spec = chain.spec;
    const acCount = chain.goals.reduce((sum, g) => sum + g.acs.length, 0);
    return {
      slug: spec.slug,
      title: spec.title,
      specStatus: spec.specStatus,
      tiers: spec.tiers,
      goalCount: chain.goals.length,
      acCount,
      updatedAt: spec.updatedAt,
    };
  }

  /** 看板快照装配（cards + status 统计——follow/list 共用水化流水） */
  private boardOf(cards: readonly SpecCardDto[]): SpecBoardDto {
    const byStatus = Object.fromEntries(SPEC_STATUSES.map((s) => [s, 0] as const)) as Record<SpecStatus, number>;
    for (const card of cards) byStatus[card.specStatus] = (byStatus[card.specStatus] ?? 0) + 1;
    return { cards, stats: { total: cards.length, byStatus } };
  }

  /** AC 投影聚合（投影流水复用——缺席/抛错降级 no-task-data 由 projectAcsStates 承担） */
  private async projectOf(
    projectKey: string,
    goals: readonly { title: string; acs: readonly { criterion: string }[] }[],
  ): Promise<AcProjectionDto> {
    const criteria = goals.flatMap((g) => g.acs.map((a) => a.criterion));
    let settlements;
    try {
      const face = this.acSettlementsOf();
      settlements = face !== undefined ? await face.matchAcSettlements(projectKey, criteria) : undefined;
    } catch {
      settlements = undefined;
    }
    const rows = projectAcsStates(criteria, settlements);
    let cursor = 0;
    return {
      goals: goals.map((goal) => ({
        title: goal.title,
        acs: rows.slice(cursor, (cursor += goal.acs.length)),
      })),
    };
  }

  /** Spec 卡片清单（listing 索引序——UI 台账数据源） */
  @Remote
  async list(q: { readonly projectId: string; readonly statusFilter?: SpecStatus; readonly search?: string }, signal?: AbortSignal): Promise<Result<readonly SpecCardDto[]>> {
    signal?.throwIfAborted();
    try {
      const svc = this.specs();
      const ws = await this.resolveIdentity(q.projectId);
      if (ws === null) return ok<readonly SpecCardDto[]>([]);
      const rows = svc.listSpecs({ cwd: ws.wsPath, statusFilter: q.statusFilter });
      const cards: SpecCardDto[] = [];
      for (const row of rows) {
        const chain = svc.getSpec({ cwd: ws.wsPath, slug: row.slug });
        if (chain === undefined) continue;
        cards.push(this.cardOf(chain));
      }
      const search = q.search?.trim().toLowerCase();
      const filtered = search !== undefined && search !== ""
        ? cards.filter((c) => c.slug.toLowerCase().includes(search) || c.title.toLowerCase().includes(search))
        : cards;
      return ok(filtered);
    } catch (cause) {
      // 族缺席 → unavailable；其余（身份缝抛错等）→ errorOf 归一
      return this.specsOf() === undefined ? this.unavailableResult("list") : errorOf(cause);
    }
  }

  /** Spec 详情（父链全量 + doc 悬空态现算 + transitions 台账） */
  @Remote
  async detail(q: { readonly projectId: string; readonly slug: string }, signal?: AbortSignal): Promise<Result<SpecDetailDto>> {
    signal?.throwIfAborted();
    try {
      const svc = this.specs();
      const ws = await this.resolveIdentity(q.projectId);
      if (ws === null) return resultError(IDENTITY_UNRESOLVED_CODE, `projectId 未解析：${q.projectId}`);
      const chain = svc.getSpec({ cwd: ws.wsPath, slug: q.slug });
      if (chain === undefined) {
        return resultError(NOT_FOUND_CODE, `spec 不存在：${q.slug}`);
      }
      const card = this.cardOf(chain);
      const doc = chain.doc === undefined
        ? undefined
        : { relPath: chain.doc.relPath, dangling: !existsSync(join(ws.wsPath, chain.doc.relPath)) };
      return ok({
        ...card,
        goals: chain.goals.map(({ goal, acs }) => ({
          title: goal.title,
          ...(goal.brief !== null ? { brief: goal.brief } : {}),
          acs: acs.map((ac) => ({ criterion: ac.criterion })),
        })),
        ...(doc !== undefined ? { doc } : {}),
        transitions: chain.transitions,
      });
    } catch (cause) {
      return errorOf(cause);
    }
  }

  /** agent 面同法读面复用（include 四节门控——缺省全节；关节 = 键缺席） */
  @Remote
  async query(
    input: { readonly projectId: string; readonly slug: string; readonly include?: SpecQueryInclude },
    signal?: AbortSignal,
  ): Promise<Result<SpecQueryResultDto>> {
    signal?.throwIfAborted();
    try {
      const svc = this.specs();
      const ws = await this.resolveIdentity(input.projectId);
      if (ws === null) return resultError(IDENTITY_UNRESOLVED_CODE, `projectId 未解析：${input.projectId}`);
      const chain = svc.getSpec({ cwd: ws.wsPath, slug: input.slug });
      if (chain === undefined) {
        return resultError(NOT_FOUND_CODE, `spec 不存在：${input.slug}`);
      }
      const include = input.include ?? {};
      const hydratedGoals = chain.goals.map(({ goal, acs }) => ({
        title: goal.title,
        ...(goal.brief !== null ? { brief: goal.brief } : {}),
        acs: include.acs === false ? [] : acs.map((ac) => ({ criterion: ac.criterion })),
      }));
      let acProjection: readonly AcProjectionRow[] | undefined;
      if (include.projection !== false) {
        acProjection = (await this.projectOf(chain.spec.projectKey, hydratedGoals)).goals.flatMap((g) => g.acs);
      }
      return ok({
        spec: chain.spec,
        ...(include.goals === false ? {} : { goals: hydratedGoals }),
        ...(chain.doc !== undefined ? { doc: { relPath: chain.doc.relPath } } : {}),
        ...(include.transitions === false ? {} : { transitions: chain.transitions }),
        ...(acProjection !== undefined ? { acProjection } : {}),
      });
    } catch (cause) {
      return errorOf(cause);
    }
  }

  /** AC 投影聚合端点（模块③投影流水复用） */
  @Remote
  async projection(q: { readonly projectId: string; readonly slug: string }, signal?: AbortSignal): Promise<Result<AcProjectionDto>> {
    signal?.throwIfAborted();
    try {
      const svc = this.specs();
      const ws = await this.resolveIdentity(q.projectId);
      if (ws === null) return resultError(IDENTITY_UNRESOLVED_CODE, `projectId 未解析：${q.projectId}`);
      const chain = svc.getSpec({ cwd: ws.wsPath, slug: q.slug });
      if (chain === undefined) {
        return resultError(NOT_FOUND_CODE, `spec 不存在：${q.slug}`);
      }
      return ok(
        await this.projectOf(
          chain.spec.projectKey,
          chain.goals.map(({ goal, acs }) => ({
            title: goal.title,
            acs: acs.map((ac) => ({ criterion: ac.criterion })),
          })),
        ),
      );
    } catch (cause) {
      return errorOf(cause);
    }
  }

  /** 状态流转写面透传（actor='ui' 审计锚缺省——域状态机/台账单源承担守卫与 append） */
  @Remote
  async transition(
    input: { readonly projectId: string; readonly slug: string; readonly to: SpecStatus; readonly note?: string; readonly actor?: TransitionActor },
    signal?: AbortSignal,
  ): Promise<Result<SpecSnapshot>> {
    signal?.throwIfAborted();
    try {
      const svc = this.specs();
      const ws = await this.resolveIdentity(input.projectId);
      if (ws === null) return resultError(IDENTITY_UNRESOLVED_CODE, `projectId 未解析：${input.projectId}`);
      const row = svc.transitionSpec({
        cwd: ws.wsPath,
        slug: input.slug,
        to: input.to,
        ...(input.note !== undefined ? { note: input.note } : {}),
        actor: input.actor ?? "ui",
      });
      return ok(row);
    } catch (cause) {
      return errorOf(cause);
    }
  }

  /**
   * 看板 follow 流（mode:'stream'——先 yield 完整 baseline，后随快照变化逐帧增量
   * （快照钩 = JSON 全量比对，变才 yield）；seq 自 baseline 帧起单调递增。
   * 事实源 = 本地 db（无跨进程事件源），收敛为定时重估推送——SPEC_FOLLOW_INTERVAL_MS。
   */
  @Remote({ mode: "stream" })
  async *follow(q: { readonly projectId: string }, signal?: AbortSignal): AsyncIterable<Envelope<SpecBoardDto>> {
    const svc = this.specsOf() === undefined ? undefined : this.specsOf();
    if (svc === undefined) throw new Error(unavailableMessage("follow", "specs"));
    let seq = 0;
    let last = "";
    let first = true;
    while (first || signal?.aborted !== true) {
      first = false;
      const board = this.boardOf(await this.listCards(svc, q.projectId));
      const json = JSON.stringify(board);
      if (json !== last) {
        last = json;
        seq += 1;
        yield { seq, snapshot: board };
      }
      if (signal?.aborted === true) return;
      await specFollowDelay(signal, this.intervalMs);
    }
  }

  /** follow 流卡片装配（list 读面共用——身份未解析 = 空集快照诚实降级） */
  private async listCards(svc: ForgeSpecsService, projectId: string): Promise<readonly SpecCardDto[]> {
    const ws = await this.resolveIdentity(projectId);
    if (ws === null) return [];
    const cards: SpecCardDto[] = [];
    for (const row of svc.listSpecs({ cwd: ws.wsPath })) {
      const chain = svc.getSpec({ cwd: ws.wsPath, slug: row.slug });
      if (chain === undefined) continue;
      cards.push(this.cardOf(chain));
    }
    return cards;
  }
}

/** follow 流节拍（abort 感知 sleep——取消即出循环，不悬空 fiber） */
function specFollowDelay(signal: AbortSignal | undefined, intervalMs: number): Promise<void> {
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

// ── 身份缝真实现（forge.projects 缝——结构性窄面现查，零 project 包依赖）──

/** 插件 ctx 结构防御读取（cordis inject 门——属性访问未声明即抛，try/catch fail-soft） */
function ctxReflectGet(ctx: unknown, name: string): unknown {
  try {
    return (ctx as { reflect?: { get?(name: string): unknown } }).reflect?.get?.(name);
  } catch {
    return undefined;
  }
}

/**
 * forge.projects 缝 identity 单源：projectId（官方 workspace id / forge 归属键别名——
 * project 侧 getProject 别名锚单源承担）→ wsPath → deriveProjectKey 派生归属键。
 * forgeProjects 服务缺席/抛错/未命中 = null（分层降级判定基点，不缓存）。
 */
export function forgeProjectsIdentityOf(ctx: unknown): SpecIdentityFace {
  return async (projectId) => {
    try {
      const svc = ctxReflectGet(ctx, "forgeProjects") as
        | { getProject?: (id: string) => Promise<{ wsPath?: string } | null> }
        | undefined;
      const project = await svc?.getProject?.(projectId);
      const wsPath = typeof project?.wsPath === "string" && project.wsPath !== "" ? project.wsPath : undefined;
      if (wsPath === undefined) return null;
      return { wsPath, projectKey: deriveProjectKey(wsPath) };
    } catch {
      return null;
    }
  };
}

// ── 装配（根 ctx plugin 注册——gateway SRC 发现面 = 根 ctx reflect.props）──

/** 插件 ctx 窄面（root 取法——cordis 子 ctx.root 指根；缺席宿主退 ctx 自身） */
export interface TypertAssemblyCtxFace {
  readonly root?: unknown;
  plugin?(options: { name: string; apply: (scope: Context) => void }): unknown;
  /** cordis inject 生命周期缝（官方机械——服务在场激活、后到补绑、撤回随 fiber 退） */
  inject?(deps: readonly string[], cb: (scope: Record<string, unknown>) => void): unknown;
}

/** 控制器注册表（单族——specs 服务缺席不注册，不空挂） */
const CONTROLLER: {
  readonly namespace: string;
  readonly injectKey: string;
  readonly mount: (scope: Context, deps: ForgeSpecRemoteDeps) => unknown;
} = {
  namespace: "forgeSpecs",
  injectKey: FORGE_SPECS_SERVICE_KEY,
  mount: (scope, deps) => new ForgeSpecsRemote(scope, deps),
};

/**
 * forgeSpecs Typert 遥控器注册（根 ctx plugin——fiber 生命周期归宿主管辖，dispose 级联
 * 拆卸；注册三态可观测——registered/degraded/pending + 诊断留痕不静默）：
 * - inject 缝在场：服务在场同步激活；缺席挂起（pending + degraded——官方 web 舞台真缺席
 *   诚实降级语义），后到补绑转 registered（bug 253b8265 同缝根治）；
 * - inject 缝缺席：specs 服务即缺席 = degraded（快照族 typed unavailable）；
 * - ctx.plugin 缺席（非 cordis 宿主）= assembly 降级。
 */
export function registerSpecTypertRemotes(
  face: TypertAssemblyCtxFace,
  deps: ForgeSpecRemoteDeps,
): SpecTypertRegistration {
  const diag = deps.diag;
  const host = (face.root ?? face) as TypertAssemblyCtxFace;
  const registered: string[] = [];
  const degraded: string[] = [];
  const pending: string[] = [];
  const { namespace, injectKey, mount } = CONTROLLER;
  if (typeof host.plugin !== "function") {
    const line = "[spec-typert] ctx.plugin 缺席——Typert 控制器不注册（非 cordis 宿主）";
    diag?.(line);
    degraded.push("assembly");
    return { registered, degraded, pending };
  }
  const inject = face.inject;
  if (typeof inject === "function") {
    // 生命周期绑（官方 ctx.inject 缝——face 为插件自身 scope：域服务 provide 落本 scope，
    // root 不可见；挂起期 namespace 不认领 = 真缺席诚实降级语义不变）。
    pending.push(namespace);
    degraded.push(namespace);
    inject.call(face, [injectKey], (scope) => {
      try {
        if (scope[injectKey] === undefined) return;
        host.plugin!({
          name: "spec-typert-forgeSpecs",
          apply: (pluginScope: Context) => {
            mount(pluginScope, deps);
          },
        });
        registered.push(namespace);
        const degradedAt = degraded.indexOf(namespace);
        if (degradedAt >= 0) degraded.splice(degradedAt, 1);
        const pendingAt = pending.indexOf(namespace);
        if (pendingAt >= 0) pending.splice(pendingAt, 1);
        diag?.(`[spec-typert] 迟到重绑：${namespace} 服务在场认领（inject 生命周期缝）`);
      } catch (cause) {
        const line = `[spec-typert] ${namespace} 激活失败——本族降级（fail-soft 不阻载）：${messageOf(cause)}`;
        diag?.(line);
      }
    });
  } else if (deps.specs?.() === undefined) {
    degraded.push(namespace);
  } else {
    try {
      host.plugin({
        name: "spec-typert-forgeSpecs",
        apply: (scope: Context) => {
          mount(scope, deps);
        },
      });
      registered.push(namespace);
    } catch (cause) {
      const line = `[spec-typert] ${namespace} 注册抛错——本族降级（fail-soft 不阻载）：${messageOf(cause)}`;
      diag?.(line);
      degraded.push(namespace);
    }
  }
  diag?.(
    `[spec-typert] Typert 遥控器注册完成：registered=[${registered.join(", ")}] degraded=[${degraded.join(", ")}] pending-inject=[${pending.join(", ")}]`,
  );
  // 注册后自探针（project 同径——boot 竞速根治）：完成行后经 gateway invoke 直探
  // forgeSpecs/list（serve 层认领自证）；fail-soft 只落诊断，不阻载。
  if (typeof deps.selfProbe === "function" && registered.includes(namespace)) {
    void Promise.resolve()
      .then(() => deps.selfProbe!(namespace, "list"))
      .then(
        () => diag?.("[spec-typert] 注册后自探针 ok：forgeSpecs/list（serve 层认领在场）"),
        (cause: unknown) =>
          diag?.(`[spec-typert] 注册后自探针失败：forgeSpecs/list——${messageOf(cause)}`),
      );
  }
  return { registered, degraded, pending };
}

/** 未知抛错归一（诊断行保 message 可读） */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
