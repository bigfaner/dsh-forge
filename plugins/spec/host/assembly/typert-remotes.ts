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
// 信封纪律（2026-11-24 真机双层信封根因修口）：@Remote 端点成功返裸值，官方 gateway
// serve 层单层包传输信封；typed 失败/身份未解析/unavailable 抛 typed RemoteError（code
// 保真过 wire——client remoteResultOf failure 分支承接）。注意：project 的 unavailable
// 抛普通 new Error（gateway 折 gateway/internal），本插件为更强的 typed 形态，不与其
// 「形态一致」；follow 流帧携 Envelope（流帧不经 Result 信封——typed unavailable 调用期
// 抛错折叠）。
//
// 发现面铁律（project 判例同径）：gateway 只遍历根 ctx reflect.props——控制器经根 ctx
// plugin 注册进根 ctx；生命周期归插件 fiber（dispose 级联拆卸）。
//
// 身份缝：端点入参 projectId → host 半 identity 解析（forge.projects 点分缝正源——签发
// projectId 的生态正源，getProject 别名锚单源在 project 侧 queries；本插件零 project 依赖，
// 结构性窄面现查 + workspaceRegistry 回落覆盖纯官方 workspaceId 语境）。未解析分层：
// 快照族（list/follow）空集诚实降级 / detail·query·projection·transition 族 typed 拒绝。
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { RemoteErrorCode } from "@deepseek-ai/dsh-typert-protocol";
import type { Context } from "@deepseek-ai/cordis";
import { rootCtxOf } from "@dsh-forge/lib-util";
import { ProjectKeyDerivationError, canonicalizePath, projectKeyOf, resolveProjectKey } from "@dsh-forge/lib-path";
import type { WorkspaceId } from "@deepseek-ai/dsh-workspace";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  isSpecError,
  type ForgeSpecsService,
} from "../domain/specs/service.js";
import { SpecError } from "../domain/specs/errors.js";
import type { SpecDomainDb } from "../db/connection.js";
import type {
  EntityTransitionRow,
  GoalRow,
  MilestoneRow,
  RoadmapRow,
  SpecRow,
  SpecStatus,
  TransitionActor,
} from "../db/row-types.js";
import { SPEC_STATUSES } from "../db/row-types.js";
import { goalMachine, type GoalStatus } from "../domain/status-machines.js";
import { TRANSITION_TAIL, type ForgeToolServices } from "../domain/specs/tool-service.js";
import type { RoadmapAchievementDto } from "../domain/specs/roadmap-service.js";
import type { MoveMilestoneResult } from "../domain/specs/milestone-service.js";
import {
  projectAcsStates,
  type AcProjectionRow,
  type AcSettlementsFace,
} from "../tools/projection.js";
import {
  matchPathSpelling,
  spawnGitWorktreePorcelain,
  type GitPorcelainRunner,
} from "@dsh-forge/lib-path/project-root";
import { FORGE_SPECS_SERVICE_KEY } from "../../shared/contract-constants.js";
import type { Envelope } from "../../shared/result.js";

/** 封存 follow 流重估间隔 ms（盘面/db 无跨进程事件源，轮询收敛为快照推送） */
export const SPEC_FOLLOW_INTERVAL_MS = 3_000;

/** 身份解析窄面：projectId → 检出根 + 归属键（forge.projects 缝——未解析 = null） */
export interface SpecIdentityResolution {
  readonly projectKey: string;
  readonly wsPath: string;
}

/** projectId 身份缝（惰性现查——装配面注 forgeProjectsIdentityOf 真实现，测试注桩） */
export type SpecIdentityFace = (projectId: string) => Promise<SpecIdentityResolution | null>;

/** forge.worktrees 注册面结构窄面（f5 键族同径——plugins/project 五缝 forge.worktrees 同键
 *  结构消费：list({projectRoot}) → entries[].path；本面零包依赖，task-loop 同形最小面） */
export interface ForgeWorktreesFamilyFace {
  list(q: { readonly projectRoot: string }): Promise<{ readonly entries: readonly { readonly path: string }[] }>;
}
/**
 * forge.worktrees 键族缝组合根取法（f5 键族同径——list/follow 快照族 worktree 身份清单
 * 源单源）：plugins/project 五缝 forge.worktrees 结构消费（ctxReflectGet 点分键同
 * task-loop 形态——缝为惰性工厂 provide，工厂调用产 face；本面只取 list 清单窄面
 * entries[].path）。现查永不缓存（AGENTS 1.6）；三级劣形收窄：reflect.get 产出非函数
 * （劣形①）→ 工厂调用产出 null/原始值（劣形②）→ face.list 非函数（劣形③），均
 * undefined——remote 面回退单键降级承担。留痕（评审 E①）：本取法与 plugins/task-loop
 * 同型复制、未收敛跨插件单源——收敛需新建共享包（超出本任务影响范围）；形状漂移由
 * 两侧组合根 pin（worktrees-face-pin）对锁。
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

/** forgeSpecs 控制器依赖缝（全惰性现查——族缺席 = typed unavailable 诚实降级） */
export interface ForgeSpecRemoteDeps {
  /** forgeSpecs 域服务缝（域逻辑唯一事实源只读消费——缺席宿主全族 typed unavailable） */
  readonly specs?: () => ForgeSpecsService | undefined;
  /** 工具面动词缝（1.8 ForgeToolServices——roadmap/milestone/goal 族读面与 CRUD 复用；
   *  缺席 = M4a 五端点族 typed unavailable，M3 六端点零感知） */
  readonly tools?: () => ForgeToolServices | undefined;
  /** UI 径动词缝（同 ForgeToolServices——actor='ui' 组装第二实例；human-only 写边
   *  （roadmapMutate confirm / goalReviewMutate）专用，缺席 = 写族 typed unavailable） */
  readonly uiTools?: () => ForgeToolServices | undefined;
  /** repo 只读缝（goalBoard 台账/复核现读——缺席 = goalBoard typed unavailable） */
  readonly repos?: () => SpecDomainDb["repos"] | undefined;
  /** AC 投影现查缝（task-loop forgeTasks matchAcSettlements——AGENTS 1.6 调用期求值） */
  readonly acSettlementsOf?: () => AcSettlementsFace | undefined;
  /** projectId 身份缝（forge.projects 缝——缺席/未解析分层降级） */
  readonly identity?: SpecIdentityFace;
  /** forge.worktrees 注册面缝（f5 键族同径——list 快照族聚合清单源；缺席/抛错 = 回退单键） */
  readonly worktrees?: () => ForgeWorktreesFamilyFace | undefined;
  /** git porcelain 探针缝（主根归拢 lib 单源消费——测试注桩；缺省 = lib spawnGitWorktreePorcelain 真探针） */
  readonly gitPorcelain?: GitPorcelainRunner;
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
const INVALID_INPUT_CODE = "ERR_SPEC_REMOTE_INVALID_INPUT";

/** typed 失败抛出（信封去 Result 化——gateway rpcFailure 对 RemoteError 保真折叠 code/message/details，
 *  client remoteResultOf failure 分支承接） */
type FailureCode = RemoteErrorCode;
function typedFailure(code: FailureCode, message: string): never {
  throw new RemoteError(code, message, {});
}

/** 未知抛错归一（typed 失败——RemoteError 直透非再包；域 SpecError code 直透，码族同
 *  remote-error-codes.d.ts 增量；其余归一 FAILED_CODE） */
function failureOf(cause: unknown): never {
  if (typeof cause === "object" && cause !== null && (cause as { isDSHRemoteError?: boolean }).isDSHRemoteError === true) {
    throw cause;
  }
  if (isSpecError(cause)) typedFailure(cause.code, cause.message);
  if (cause instanceof ProjectKeyDerivationError) typedFailure(cause.code, cause.message);
  typedFailure(FAILED_CODE, cause instanceof Error ? cause.message : String(cause));
}

/** 入参封闭枚举/必填违例（typed code——wire 面显式失败非魔法值） */
function invalidInput(message: string): SpecError {
  return new SpecError(INVALID_INPUT_CODE, message, {});
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

// ── M4a 目标域 DTO（plugin-spec-roadmaps 1.9，code-design §6 端点族表）——
//    零拼装纪律：行级/动词出参直投（tools.md §一·五 camelCase 行基线），仅
//    goalBoard 徽标面（status-machine isTerminal/availableTransitions 数据化）为
//    本端点族新增节——host 半单点水化，UI 零拼装。

/** Roadmap 快照（RoadmapRow 直投——零拼装） */
export type RoadmapSnapshot = RoadmapRow;

/** Roadmap 详情（queryRoadmap 动词出参直投：本体 + milestones 内嵌 + 达成派生 + warns） */
export interface RoadmapDetailDto {
  readonly roadmap: RoadmapRow;
  readonly milestones: MilestoneRow[];
  readonly achievement: RoadmapAchievementDto;
}

/** Roadmap 写面快照（create/update/confirm → RoadmapRow；moveMilestone → 全量新序） */
export type RoadmapMutateSnapshot = RoadmapRow | MoveMilestoneResult;

/** Goal 徽标面（status-machine 查询面直译——status(s).isTerminal() / .availableTransitions()） */
export interface GoalBadgeDto {
  readonly isTerminal: boolean;
  readonly availableTransitions: readonly GoalStatus[];
}

/** Goal 看板行（GoalCard 基形 + 徽标面 + 最新复核摘要——querySpec include 同形 camelCase） */
export interface GoalBoardEntryDto {
  readonly goalId: string;
  readonly goalSeq: number;
  readonly title: string;
  readonly brief?: string;
  readonly goalStatus: GoalStatus;
  readonly badge: GoalBadgeDto;
  readonly latestReview?: {
    readonly verdict: "passed" | "failed";
    readonly gapNote?: string;
    readonly createdAt: string;
  };
}

/** Goal 看板（spec 本体 + goals 徽标面 + goal 台账尾帧——纯读面，零状态机触发） */
export interface GoalBoardDto {
  readonly spec: SpecRow;
  readonly goals: readonly GoalBoardEntryDto[];
  readonly transitions: readonly EntityTransitionRow[];
}

/** Goal 终审写面快照（GoalRow 直投——零拼装；审计史由台账行承载） */
export type GoalSnapshot = GoalRow;

/** roadmapMutate 封闭动作值域（code-design §6——create/update/moveMilestone/confirm） */
export type RoadmapMutateAction = "create" | "update" | "moveMilestone" | "confirm";

/** goalReviewMutate 封闭动作值域（finalize=终审确认 / reject=驳回——human-only UI 径） */
export type GoalReviewMutateAction = "finalize" | "reject";

/** forgeSpecs namespace 控制器（serviceKey = forgeSpecsController——官方 settingsController 同型） */
export class ForgeSpecsRemote extends TypertRemoteService {
  private readonly specsOf: () => ForgeSpecsService | undefined;
  private readonly toolsOf: () => ForgeToolServices | undefined;
  private readonly uiToolsOf: () => ForgeToolServices | undefined;
  private readonly reposOf: () => SpecDomainDb["repos"] | undefined;
  private readonly acSettlementsOf: () => AcSettlementsFace | undefined;
  private readonly identityOf: SpecIdentityFace | undefined;
  private readonly worktreesOf: () => ForgeWorktreesFamilyFace | undefined;
  private readonly gitPorcelain: GitPorcelainRunner;
  private readonly diagLine: ((line: string) => void) | undefined;
  private readonly intervalMs: number;

  constructor(ctx: Context, deps: ForgeSpecRemoteDeps) {
    super(ctx, "forgeSpecsController", { namespace: "forgeSpecs" });
    this.specsOf = deps.specs ?? (() => undefined);
    this.toolsOf = deps.tools ?? (() => undefined);
    this.uiToolsOf = deps.uiTools ?? (() => undefined);
    this.reposOf = deps.repos ?? (() => undefined);
    this.acSettlementsOf = deps.acSettlementsOf ?? (() => undefined);
    this.identityOf = deps.identity;
    this.worktreesOf = deps.worktrees ?? (() => undefined);
    this.gitPorcelain = deps.gitPorcelain ?? spawnGitWorktreePorcelain;
    this.diagLine = deps.diag;
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

  /** 工具面动词窄取（M4a 族缺席 = typed unavailable 同径） */
  private requireTools(method: string): ForgeToolServices {
    const tools = this.toolsOf();
    if (tools === undefined) {
      throw new Error(unavailableMessage(method, "specs"));
    }
    return tools;
  }

  /** UI 径动词窄取（human-only 写边专用——缺席 = typed unavailable，actor 不降级伪装） */
  private requireUiTools(method: string): ForgeToolServices {
    const ui = this.uiToolsOf();
    if (ui === undefined) {
      throw new Error(unavailableMessage(method, "specs"));
    }
    return ui;
  }

  /** repo 只读缝窄取（goalBoard 现读——缺席 = typed unavailable 同径） */
  private requireRepos(method: string): SpecDomainDb["repos"] {
    const repos = this.reposOf();
    if (repos === undefined) {
      throw new Error(unavailableMessage(method, "specs"));
    }
    return repos;
  }

  /** 族缺席 typed unavailable（信封去 Result 化——调用期抛 RemoteError，gateway 保真折叠） */
  private unavailableFailure(method: string): never {
    typedFailure(UNAVAILABLE_CODE, unavailableMessage(method, "specs"));
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

  /**
   * 身份键族解析（2026-11-24 用户方案 A——f5 同径聚合）：主根身份 + forge.worktrees 注册面
   * 下该根的全部 worktree 身份（list entries[].path 逐 path 派生）。注册缝缺席/list 抛错 =
   * 回退单键现状（降级显式诊断留痕，不静默）。仅快照读族（list）消费——写面/详情面单键不动。
   * 主根归拢（2026-11-24 同日裁决——归拢推导抽 lib 单源三插件共享）：注册行本身落 worktree
   * 检出（marker 触发）时经 lib-path project-root 单源现查归拢主检出根再入族（主根拼写随
   * 注册行风格改写——键派生拼写敏感）；git 缺席/失败/非本仓清单 = fail-soft 原样注册行
   * （显式留痕，普通目录零 git 调用零噪声）。
   */
  private async resolveIdentityFamily(projectId: string): Promise<SpecIdentityResolution[]> {
    const main = await this.resolveIdentity(projectId);
    if (main === null) return [];
    const root = this.rollupMainRoot(main);
    const worktrees = this.worktreesOf();
    if (worktrees === undefined) {
      this.diagLine?.(`[spec-typert] 键族缝缺席（forge.worktrees）——快照族回退单键：projectId=${projectId}`);
      return [root];
    }
    try {
      const result = await worktrees.list({ projectRoot: root.wsPath });
      const family = [root, ...result.entries.map((entry) => ({ wsPath: entry.path, projectKey: projectKeyOf(entry.path) }))];
      const seen = new Set<string>();
      return family.filter((row) => (seen.has(row.projectKey) ? false : (seen.add(row.projectKey), true)));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.diagLine?.(`[spec-typert] 键族清单失败（forge.worktrees list 抛错 fail-soft）——快照族回退单键：projectId=${projectId}：${message}`);
      return [root];
    }
  }

  /** 主根归拢消费面（lib-path resolveProjectKey 单源——marker 触发 + fail-soft 原样 + 留痕） */
  private rollupMainRoot(main: SpecIdentityResolution): SpecIdentityResolution {
    const resolved = resolveProjectKey(main.wsPath, { registryQuery: () => undefined, gitRunner: this.gitPorcelain });
    if (!resolved.rolledUp || resolved.mainRoot === undefined) {
      if (resolved.fallbackReason !== undefined) {
        this.diagLine?.(`[spec-typert] 主根归拢 fail-soft（lib porcelain 现查未命中）——快照族回退注册行键：wsPath=${main.wsPath}：${resolved.fallbackReason}`);
      }
      return main;
    }
    const rootPath = matchPathSpelling(main.wsPath, resolved.mainRoot);
    return { wsPath: rootPath, projectKey: resolved.key };
  }

  /**
   * 单 spec 键族寻径（M4 收口——detail/query/projection/transition 单键面改键族兼容读）：
   * 沿 resolveIdentityFamily 以 family[i].projectKey 经不归拢纯键通道（getSpecByKey）
   * 逐键直查 repo，首见命中即返回——族成员查询键不被 svc keyOf 主根归拢自我中和
   * （评审 H-P1：存量 worktree 键行经族内 worktree 键兼容读可达）；族全键未命中 =
   * missing（typed NOT_FOUND），身份未解析 = unresolved（typed 拒绝）。
   */
  private async locateInFamily(projectId: string, slug: string): Promise<
    | { kind: "unresolved" }
    | { kind: "missing" }
    | { kind: "found"; ws: SpecIdentityResolution; chain: NonNullable<ReturnType<ForgeSpecsService["getSpec"]>>; mainKey: string }
  > {
    const family = await this.resolveIdentityFamily(projectId);
    if (family.length === 0) return { kind: "unresolved" };
    const svc = this.specs();
    for (const ws of family) {
      const chain = svc.getSpecByKey({ projectKey: ws.projectKey, slug });
      if (chain !== undefined) {
        return { kind: "found", ws, chain, mainKey: family[0]!.projectKey };
      }
    }
    return { kind: "missing" };
  }

  /** Spec 卡片清单（listing 索引序——UI 台账数据源；f5 键族聚合——主根 + worktree 键逐键
   *  取卡合并，slug 去重保首见序主根先行） */
  @Remote
  async list(q: { readonly projectId: string; readonly statusFilter?: SpecStatus; readonly search?: string }, signal?: AbortSignal): Promise<readonly SpecCardDto[]> {
    signal?.throwIfAborted();
    try {
      const svc = this.specs();
      const family = await this.resolveIdentityFamily(q.projectId);
      if (family.length === 0) return [];
      const seen = new Set<string>();
      const cards: SpecCardDto[] = [];
      for (const ws of family) {
        const rows = svc.listSpecs({ cwd: ws.wsPath, statusFilter: q.statusFilter });
        for (const row of rows) {
          if (seen.has(row.slug)) continue;
          const chain = svc.getSpec({ cwd: ws.wsPath, slug: row.slug });
          if (chain === undefined) continue;
          seen.add(row.slug);
          cards.push(this.cardOf(chain));
        }
      }
      const search = q.search?.trim().toLowerCase();
      const filtered = search !== undefined && search !== ""
        ? cards.filter((c) => c.slug.toLowerCase().includes(search) || c.title.toLowerCase().includes(search))
        : cards;
      return filtered;
    } catch (cause) {
      // 族缺席 → unavailable；其余（身份缝抛错等）→ failureOf 归一
      if (this.specsOf() === undefined) this.unavailableFailure("list");
      failureOf(cause);
    }
  }

  /** Spec 详情（父链全量 + doc 悬空态现算 + transitions 台账；键族兼容读——命中键即
   *  悬空判定锚 wsPath，存量 worktree 文档对 worktree 键不恒 dangling） */
  @Remote
  async detail(q: { readonly projectId: string; readonly slug: string }, signal?: AbortSignal): Promise<SpecDetailDto> {
    signal?.throwIfAborted();
    try {
      const located = await this.locateInFamily(q.projectId, q.slug);
      if (located.kind === "unresolved") typedFailure(IDENTITY_UNRESOLVED_CODE, `projectId 未解析：${q.projectId}`);
      if (located.kind === "missing") typedFailure(NOT_FOUND_CODE, `spec 不存在：${q.slug}`);
      const { ws, chain } = located;
      const card = this.cardOf(chain);
      const doc = chain.doc === undefined
        ? undefined
        : { relPath: chain.doc.relPath, dangling: !existsSync(join(ws.wsPath, chain.doc.relPath)) };
      return {
        ...card,
        goals: chain.goals.map(({ goal, acs }) => ({
          title: goal.title,
          ...(goal.brief !== null ? { brief: goal.brief } : {}),
          acs: acs.map((ac) => ({ criterion: ac.criterion })),
        })),
        ...(doc !== undefined ? { doc } : {}),
        transitions: chain.transitions,
      };
    } catch (cause) {
      failureOf(cause);
    }
  }

  /** agent 面同法读面复用（include 四节门控——缺省全节；关节 = 键缺席） */
  @Remote
  async query(
    input: { readonly projectId: string; readonly slug: string; readonly include?: SpecQueryInclude },
    signal?: AbortSignal,
  ): Promise<SpecQueryResultDto> {
    signal?.throwIfAborted();
    try {
      const located = await this.locateInFamily(input.projectId, input.slug);
      if (located.kind === "unresolved") typedFailure(IDENTITY_UNRESOLVED_CODE, `projectId 未解析：${input.projectId}`);
      if (located.kind === "missing") typedFailure(NOT_FOUND_CODE, `spec 不存在：${input.slug}`);
      const { chain, mainKey } = located;
      const include = input.include ?? {};
      const hydratedGoals = chain.goals.map(({ goal, acs }) => ({
        title: goal.title,
        ...(goal.brief !== null ? { brief: goal.brief } : {}),
        acs: include.acs === false ? [] : acs.map((ac) => ({ criterion: ac.criterion })),
      }));
      let acProjection: readonly AcProjectionRow[] | undefined;
      if (include.projection !== false) {
        // M5 投影键同步：task-loop 结算行自写侧归拢起恒落主根键——投影按键族主根键查
        // 结算（存量 worktree 键 spec 行亦命中，进度不再恒 0）
        acProjection = (await this.projectOf(mainKey, hydratedGoals)).goals.flatMap((g) => g.acs);
      }
      return {
        spec: chain.spec,
        ...(include.goals === false ? {} : { goals: hydratedGoals }),
        ...(chain.doc !== undefined ? { doc: { relPath: chain.doc.relPath } } : {}),
        ...(include.transitions === false ? {} : { transitions: chain.transitions }),
        ...(acProjection !== undefined ? { acProjection } : {}),
      };
    } catch (cause) {
      failureOf(cause);
    }
  }

  /** AC 投影聚合端点（模块③投影流水复用；键族兼容读 + M5 投影键同步——结算查主根键） */
  @Remote
  async projection(q: { readonly projectId: string; readonly slug: string }, signal?: AbortSignal): Promise<AcProjectionDto> {
    signal?.throwIfAborted();
    try {
      const located = await this.locateInFamily(q.projectId, q.slug);
      if (located.kind === "unresolved") typedFailure(IDENTITY_UNRESOLVED_CODE, `projectId 未解析：${q.projectId}`);
      if (located.kind === "missing") typedFailure(NOT_FOUND_CODE, `spec 不存在：${q.slug}`);
      return await this.projectOf(
        located.mainKey,
        located.chain.goals.map(({ goal, acs }) => ({
          title: goal.title,
          acs: acs.map((ac) => ({ criterion: ac.criterion })),
        })),
      );
    } catch (cause) {
      failureOf(cause);
    }
  }

  /** 状态流转写面透传（actor='ui' 审计锚缺省——域状态机/台账单源承担守卫与 append） */
  @Remote
  async transition(
    input: { readonly projectId: string; readonly slug: string; readonly to: SpecStatus; readonly note?: string; readonly actor?: TransitionActor },
    signal?: AbortSignal,
  ): Promise<SpecSnapshot> {
    signal?.throwIfAborted();
    try {
      const svc = this.specs();
      const located = await this.locateInFamily(input.projectId, input.slug);
      if (located.kind === "unresolved") typedFailure(IDENTITY_UNRESOLVED_CODE, `projectId 未解析：${input.projectId}`);
      if (located.kind === "missing") typedFailure(NOT_FOUND_CODE, `spec 不存在：${input.slug}`);
      const row = svc.transitionSpecByKey({
        projectKey: located.ws.projectKey,
        slug: input.slug,
        to: input.to,
        ...(input.note !== undefined ? { note: input.note } : {}),
        actor: input.actor ?? "ui",
      });
      return row;
    } catch (cause) {
      failureOf(cause);
    }
  }

  // ── M4a 目标域五端点（plugin-spec-roadmaps 1.9——写面透传 actor='ui'，零改 M3 六端点）──

  /** roadmap 清单（listing 索引序——身份未解析 = 空集诚实降级，清单族同 list 判型） */
  @Remote
  async roadmaps(q: { readonly projectId: string }, signal?: AbortSignal): Promise<readonly RoadmapRow[]> {
    signal?.throwIfAborted();
    try {
      const tools = this.requireTools("roadmaps");
      const ws = await this.resolveIdentity(q.projectId);
      if (ws === null) return [];
      return tools.listRoadmaps({ cwd: ws.wsPath });
    } catch (cause) {
      if (this.toolsOf() === undefined) this.unavailableFailure("roadmaps");
      failureOf(cause);
    }
  }

  /** roadmap 详情（queryRoadmap 动词直投——milestones 下钻 + 达成派生 + warns） */
  @Remote
  async roadmapDetail(q: { readonly projectId: string; readonly slug: string }, signal?: AbortSignal): Promise<RoadmapDetailDto> {
    signal?.throwIfAborted();
    try {
      const tools = this.requireTools("roadmapDetail");
      const ws = await this.resolveIdentity(q.projectId);
      if (ws === null) typedFailure(IDENTITY_UNRESOLVED_CODE, `projectId 未解析：${q.projectId}`);
      const detail = tools.queryRoadmap({ cwd: ws.wsPath, slug: q.slug, include: ["achievement"] });
      return {
        roadmap: detail.roadmap,
        milestones: detail.milestones,
        achievement: detail.achievement ?? { roadmap: detail.roadmap, completed: false, perMilestone: [], warns: [] },
      };
    } catch (cause) {
      if (this.toolsOf() === undefined) this.unavailableFailure("roadmapDetail");
      failureOf(cause);
    }
  }

  /**
   * roadmap 写面透传（CRUD/重排/确认——域动词零重复逻辑）：create/update/moveMilestone
   * 走工具面动词；confirm = human-only 验收确认边（awaiting_acceptance→completed），走
   * actor='ui' 实例——actor 不降级伪装（uiTools 缺席 = typed unavailable）。
   */
  @Remote
  async roadmapMutate(
    input: {
      readonly projectId: string;
      readonly action: RoadmapMutateAction;
      readonly slug?: string;
      readonly title?: string;
      readonly brief?: string;
      /** AC 条目结构面（parseAcEntries 入参形状约束——wire 边界禁 unconstrained unknown） */
      readonly acEntries?: readonly { readonly criterion: string; readonly id?: string; readonly address?: string }[];
      readonly milestoneId?: string;
      readonly before?: string;
      readonly after?: string;
      readonly note?: string;
    },
    signal?: AbortSignal,
  ): Promise<RoadmapMutateSnapshot> {
    signal?.throwIfAborted();
    try {
      const tools = this.requireTools("roadmapMutate");
      const ws = await this.resolveIdentity(input.projectId);
      if (ws === null) typedFailure(IDENTITY_UNRESOLVED_CODE, `projectId 未解析：${input.projectId}`);
      if (input.action !== "create" && input.action !== "update" && input.action !== "moveMilestone" && input.action !== "confirm") {
        throw invalidInput(`未知 action：${String(input.action)}`);
      }
      if (input.action === "create") {
        if (input.slug === undefined || input.slug === "" || input.title === undefined || input.title === "") {
          throw invalidInput("create 动作必填 slug + title");
        }
        return tools.createRoadmap({
          cwd: ws.wsPath,
          slug: input.slug,
          title: input.title,
          ...(input.brief !== undefined ? { brief: input.brief } : {}),
          ...(input.acEntries !== undefined ? { acEntries: input.acEntries } : {}),
        });
      }
      if (input.action === "update") {
        if (input.slug === undefined || input.slug === "") {
          throw invalidInput("update 动作必填 slug");
        }
        return tools.updateRoadmap({
          cwd: ws.wsPath,
          slug: input.slug,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.brief !== undefined ? { brief: input.brief } : {}),
          ...(input.acEntries !== undefined ? { acEntries: input.acEntries } : {}),
        });
      }
      if (input.action === "moveMilestone") {
        if (input.slug === undefined || input.slug === "" || input.milestoneId === undefined) {
          throw invalidInput("moveMilestone 动作必填 slug + milestoneId");
        }
        if ((input.before === undefined) === (input.after === undefined)) {
          throw invalidInput("moveMilestone 动作 before/after 互斥二选一");
        }
        return tools.moveMilestone({
          cwd: ws.wsPath,
          roadmapSlug: input.slug,
          milestoneId: input.milestoneId,
          ...(input.before !== undefined ? { before: input.before } : {}),
          ...(input.after !== undefined ? { after: input.after } : {}),
        });
      }
      // confirm：human-only 验收确认边——actor='ui' 实例透传（UI 径审计锚）
      if (input.slug === undefined || input.slug === "") {
        throw invalidInput("confirm 动作必填 slug");
      }
      const ui = this.requireUiTools("roadmapMutate");
      return ui.transitionRoadmap({
        cwd: ws.wsPath,
        roadmapSlug: input.slug,
        to: "completed",
        ...(input.note !== undefined ? { note: input.note } : {}),
      });
    } catch (cause) {
      if (this.toolsOf() === undefined) this.unavailableFailure("roadmapMutate");
      failureOf(cause);
    }
  }

  /**
   * Goal 看板（纯读面——零状态机触发，防 UI 轮询驱动状态机）：goal 现值 + 徽标面
   * （goalMachine.status(s).isTerminal() / .availableTransitions()）+ 最新复核摘要 +
   * goal 台账尾帧（统一台账 entity_kind='goal'，尾 TRANSITION_TAIL 条）。
   */
  @Remote
  async goalBoard(q: { readonly projectId: string; readonly specSlug: string }, signal?: AbortSignal): Promise<GoalBoardDto> {
    signal?.throwIfAborted();
    try {
      const repos = this.requireRepos("goalBoard");
      const ws = await this.resolveIdentity(q.projectId);
      if (ws === null) typedFailure(IDENTITY_UNRESOLVED_CODE, `projectId 未解析：${q.projectId}`);
      const spec = repos.specs.getBySlug(ws.projectKey, q.specSlug);
      if (spec === undefined) {
        typedFailure(NOT_FOUND_CODE, `spec 不存在：${q.specSlug}`);
      }
      const goals = repos.specs.listGoalsBySpec(spec.id);
      const entries: GoalBoardEntryDto[] = goals.map((goal) => {
        const status = goalMachine.status(goal.goalStatus);
        const latest = repos.reviews.latestByEntity("goal", goal.id);
        return {
          goalId: goal.id,
          goalSeq: goal.sortKey,
          title: goal.title,
          ...(goal.brief !== null ? { brief: goal.brief } : {}),
          goalStatus: goal.goalStatus,
          badge: { isTerminal: status.isTerminal(), availableTransitions: status.availableTransitions() },
          ...(latest !== undefined
            ? {
                latestReview: {
                  verdict: latest.verdict,
                  ...(latest.gapNote !== null ? { gapNote: latest.gapNote } : {}),
                  createdAt: latest.createdAt,
                },
              }
            : {}),
        };
      });
      const transitions = goals
        .flatMap((goal) => repos.transitions.listByEntity("goal", goal.id))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1))
        .slice(-TRANSITION_TAIL);
      return { spec, goals: entries, transitions };
    } catch (cause) {
      if (this.reposOf() === undefined) this.unavailableFailure("goalBoard");
      failureOf(cause);
    }
  }

  /**
   * Goal 终审写面透传（human-only UI 径——finalizeGoal verb actor='ui' 透传）：
   * finalize = 终审确认（awaiting_confirmation→completed）/ reject = 驳回（note 域守卫
   * 必填）。goal 寻径沿工具面纪律 = specSlug + goalSeq（UUID goalId 不作 wire 入参）。
   */
  @Remote
  async goalReviewMutate(
    input: {
      readonly projectId: string;
      readonly specSlug: string;
      readonly goalSeq: number;
      readonly action: GoalReviewMutateAction;
      readonly note?: string;
    },
    signal?: AbortSignal,
  ): Promise<GoalSnapshot> {
    signal?.throwIfAborted();
    try {
      const ui = this.requireUiTools("goalReviewMutate");
      const ws = await this.resolveIdentity(input.projectId);
      if (ws === null) typedFailure(IDENTITY_UNRESOLVED_CODE, `projectId 未解析：${input.projectId}`);
      if (input.action !== "finalize" && input.action !== "reject") {
        throw invalidInput(`未知 action：${String(input.action)}`);
      }
      const result = ui.finalizeGoal({
        cwd: ws.wsPath,
        slug: input.specSlug,
        goalSeq: input.goalSeq,
        decision: input.action === "finalize" ? "completed" : "rejected",
        ...(input.note !== undefined ? { note: input.note } : {}),
      });
      return result.goal;
    } catch (cause) {
      if (this.uiToolsOf() === undefined) this.unavailableFailure("goalReviewMutate");
      failureOf(cause);
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
    if (svc === undefined) typedFailure(UNAVAILABLE_CODE, unavailableMessage("follow", "specs"));
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

  /** follow 流卡片装配（list 读面共用——f5 键族同径聚合，slug 去重保首见序主根先行；
   *  身份未解析 = 空集快照诚实降级） */
  private async listCards(svc: ForgeSpecsService, projectId: string): Promise<readonly SpecCardDto[]> {
    const family = await this.resolveIdentityFamily(projectId);
    const seen = new Set<string>();
    const cards: SpecCardDto[] = [];
    for (const ws of family) {
      for (const row of svc.listSpecs({ cwd: ws.wsPath })) {
        if (seen.has(row.slug)) continue;
        const chain = svc.getSpec({ cwd: ws.wsPath, slug: row.slug });
        if (chain === undefined) continue;
        seen.add(row.slug);
        cards.push(this.cardOf(chain));
      }
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

// ── 身份缝真实现（identity 双源：forge.projects 点分缝正源 + workspaceRegistry 回落——
//    bug ac27ab1a / recurrence b990aa94：projectId 是 forge 签发 ID（register 返回
//    projectId ≠ workspaceId），workspaceRegistry 以 workspaceId 为键、对 projectId 恒
//    miss——正源 = 签发方 forge.projects 缝（点分键，plugins/project PROJECT_SEAM_KEYS.projects
//    同值；读取径对齐 task-loop 在役先例 host/index.ts:100 reflect.get(PROJECT_SEAM_KEY)
//    + typert-remotes.ts ForgeProjectsIdentityFace 窄面 getProject→wsPath），registry
//    降回落覆盖纯官方 workspaceId 语境。双源均现查零缓存——AGENTS 1.6）──

/** forge.projects 缝键（plugins/project host/assembly/seams.ts PROJECT_SEAM_KEYS.projects
 *  同值——跨包结构消费，本包零依赖声明只持同值常量，漂移由 identity 解析面诊断兜底；
 *  task-loop host/index.ts:307 先例同径） */
const PROJECT_SEAM_KEY = "forge.projects";

/** 插件 ctx 结构防御读取（cordis inject 门——属性访问未声明即抛，try/catch fail-soft） */
function ctxReflectGet(ctx: unknown, name: string): unknown {
  try {
    return (ctx as { reflect?: { get?(name: string): unknown } }).reflect?.get?.(name);
  } catch {
    return undefined;
  }
}

/** forge.projects 缝消费窄面（plugins/project ProjectsServicePort getProject 同形子集——
 *  行真值 wsPath 即 canonical 检出根；缝为惰性工厂 provide，factory 调用产 face） */
interface ForgeProjectsIdentityFace {
  getProject(projectId: string): Promise<{ readonly wsPath: string } | null>;
}

/** 官方 workspaceRegistry 消费窄面（@deepseek-ai/dsh-workspace Workspace 同形子集——get 返回行 path 即 canonical 检出根） */
interface OfficialWorkspaceRegistryFace {
  get(id: WorkspaceId): Promise<{ readonly path: string } | undefined>;
}

/** 官方 workspaceRegistry face 形状校验（防御读取——AGENTS 1.6 检测永不缓存） */
function isWorkspaceRegistryFace(value: unknown): value is OfficialWorkspaceRegistryFace {
  if (value === null || typeof value !== "object") return false;
  return typeof (value as { get?: unknown }).get === "function";
}

/** forge.projects 缝 face 现查（factory 调用产 face + 形状校验——缺席/劣形 = undefined） */
function forgeProjectsSeamFaceOf(ctx: unknown): ForgeProjectsIdentityFace | undefined {
  try {
    const factory = ctxReflectGet(ctx, PROJECT_SEAM_KEY);
    if (typeof factory !== "function") return undefined;
    const face = (factory as () => unknown)();
    if (face === null || typeof face !== "object") return undefined;
    return typeof (face as { getProject?: unknown }).getProject === "function"
      ? (face as ForgeProjectsIdentityFace)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * identity 双源缝（每次调用现查零缓存——AGENTS 1.6）：
 * ① 正源：forge.projects 点分缝（签发 projectId 的生态正源——ctx.reflect.get 缝键取
 *    惰性工厂，factory 调用产 getProject 窄面，wsPath 直取；点分键合法径）；
 * ② 回落：ctx.workspaceRegistry.get(projectId as WorkspaceId).path（纯官方 workspaceId
 *    语境——type-only import 保 typed 具名取法）。
 * 双源全缺/抛错/miss = null + diag warn 留痕（不静默）。
 */
export function forgeProjectsIdentityOf(
  ctx: unknown,
  diag?: (line: string) => void,
): SpecIdentityFace {
  return async (projectId) => {
    // ① 正源 forge.projects 点分缝（face 缺席/劣形/抛错/miss = 静默入回落）
    try {
      const face = forgeProjectsSeamFaceOf(ctx);
      if (face !== undefined) {
        const project = await face.getProject(projectId);
        const wsPath = typeof project?.wsPath === "string" && project.wsPath !== "" ? project.wsPath : undefined;
        if (wsPath !== undefined) {
          // 键先规范化再派生（bug 3467e146——与 resolveProjectKey 消费点同口径）
          return { wsPath, projectKey: projectKeyOf(canonicalizePath(wsPath)) };
        }
      }
    } catch {
      // 回落承担——不在此分流诊断（双缺统一留痕）
    }
    // ② 回落 workspaceRegistry（官方 workspaceId 语境）
    try {
      const registry: unknown = (ctx as { workspaceRegistry?: unknown }).workspaceRegistry;
      if (isWorkspaceRegistryFace(registry)) {
        const ws = await registry.get(projectId as WorkspaceId);
        const path = typeof ws?.path === "string" && ws.path !== "" ? ws.path : undefined;
        if (path !== undefined) {
          return { wsPath: path, projectKey: projectKeyOf(canonicalizePath(path)) };
        }
      }
    } catch {
      // 双缺统一留痕
    }
    diag?.(`[spec-typert] identity 双源未解析（forge.projects 缝缺席/miss/抛错 + workspaceRegistry miss/缺席）：projectId=${projectId}`);
    return null;
  };
}

// ── 装配（根 ctx plugin 注册——gateway SRC 发现面 = 根 ctx reflect.props）──

/** 插件 ctx 窄面（根 ctx 取法走符号键 rootCtxOf——bug 2801eeeb 同族复发：ctx.root 属性访问触发 cordis 1.1.0 inject 门控；非 ctx 形入参退自身） */
export interface TypertAssemblyCtxFace {
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
  const host = (rootCtxOf(face) ?? face) as TypertAssemblyCtxFace;
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
