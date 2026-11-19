// host/assembly · typert-remotes.ts —— forge:* 五族 UI 数据通路（官方 Typert Remote namespace =
// 官方 UI 数据第一等通道；官方 ui-settings-* / ForgePanelController 动态插件先例同形态背书）。
//
// 形态（typert strict 迁移 1.4 落地——@Remote 装饰器源码形态，U1 消解）：
//   TypertRemoteService 子类 + @Remote 方法装饰器（namespace 经 super 第三参覆写，
//   serviceKey = 既有宿主服务键命名），gateway SRC 发现路径（api/gateway/src/index.ts:
//   891-917）从函数签名解析参数面、codec 全 src-json（JSON 安全校验），端点 =
//   `<namespace>/<method>`；`signal` 尾参 = cancellation（gateway:925-938）。
//   装饰器即 @Remote 的源码形态本体（协议 addMarkerInitializer 消费 context 四面），
//   生成器 WorkspaceAnalyzer.collectInvocations 以此为取材面——构建期 typert 工件
//   （./typert + ./remote）与运行期 gateway SRC 发现共用同一取材真源。
//
// vitest 装饰器适配（1.4）：vitest 5 转换器（vite 8 oxc）不支持标准装饰器降级——
// vitest.config.ts 挂 dsh-decorators 预转换插件（ts.transpileModule 同 generator
// decoratorPlugin 形态）承担测试面装饰器降级；esbuild bundle 链同径插件见 bundle-host.mjs。
//
// 发现面铁律（侦察定谳）：gateway 只遍历根 ctx reflect.props——控制器经 rootCtx.plugin
// 注册进根 ctx（插件子 ctx 注册不可见）；生命周期归插件 fiber（dispose 级联拆卸）。
//
// 范围边界：forge:settings 族归 configForms 自有 namespace（偏好值不经本面——AC③）。
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { Peer } from "@deepseek-ai/dsh-client-connection";
import type { Context } from "@deepseek-ai/cordis";
import type {
  BugsServicePort,
  ProjectsServicePort,
} from "@dsh-forge/lib-api";
import type {
  BugCard,
  BugCommitFilesQuery,
  BugFileDiffQuery,
  DeriveTaskStoreDirResult,
  DirFactRow,
  DirFactsQuery,
  DirListing,
  ListBugsQuery,
  Project,
  ProjectPatch,
  RegisterProjectInput,
  RegisterResult,
  ProjectSummary,
  WorktreeAheadBehindRequest,
  WorktreeAheadBehindResult,
  WorktreeBranchesRequest,
  WorktreeBranchesResult,
  WorktreeChecksRequest,
  WorktreeChecksResult,
  WorktreeCreateRequest,
  WorktreeCreateResult,
  WorktreeDeleteRequest,
  WorktreeDeleteResult,
  WorktreeEnsureWorkspaceRequest,
  WorktreeEnsureWorkspaceResult,
  WorktreeListRequest,
  WorktreeListResult,
  WorktreeResolveRequest,
  WorktreeResolveResult,
  WorktreeSealRequest,
  WorktreeSealResult,
  WorktreeSelectRequest,
  WorktreeSelectResult,
} from "@dsh-forge/contracts";
import type {
  FeatureCard,
  ListFeaturesQuery,
} from "@dsh-forge/contracts";
import type { DirFactsPort } from "@dsh-forge/lib-api";
import { forgeDirOfWorkspace } from "../dirs/anchors.js";
import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type { WorktreeRpcService } from "../worktrees/rpc-service.js";

/** 封存 follow 流重估间隔 ms（外部事实源——git/盘面无事件源，轮询收敛为快照推送） */
export const SEAL_FOLLOW_INTERVAL_MS = 3_000;

/** 提案/feature 域服务惰性取法缝（core 域服务注根 ctx——缺席 = typed unavailable 诚实拒绝） */
export type LazyDomainService = () => unknown;

/** 五族控制器依赖缝（工厂惰性——缺族 = 该 namespace 不注册，不空挂） */
export interface ForgeTypertDeps {
  readonly projects?: () => ProjectsServicePort | undefined;
  readonly bugs?: () => BugsServicePort | undefined;
  readonly worktrees?: () => WorktreeRpcService | undefined;
  /** core forgeFeatures 服务（listFeatures 读面）——缺席宿主 typed unavailable */
  readonly features?: LazyDomainService;
  /** core forgeProjects 服务（deriveTaskStoreDir 第六法真实现）——在场恒优先委托（bug 8de6b903 委托缝） */
  readonly deriveTaskStoreDir?: LazyDomainService;
  /** 单装态自 derivation 兜底（core face 缺席 = 插件自链——self-derive 缝；双缺 = typed unavailable） */
  readonly selfDerive?: LazyDomainService;
  /** workspaceRoot 解析缝（projectId → 工作区根——fix-1 插件自装配：官方宿主工作区面，零 core face），缺席 typed unavailable */
  readonly dirsWorkspaceRoot?: LazyDomainService;
  /** DirFactsPort 缝（锚注册表解析——forge.docs_root/task_home/worktrees 行事实源），缺席 typed unavailable */
  readonly dirFacts?: () => DirFactsPort | undefined;
  /** followSeal 重估间隔 ms（缺省 SEAL_FOLLOW_INTERVAL_MS——单测注入收敛节拍） */
  readonly followIntervalMs?: number;
  /** 诊断缝（装配/降级留痕——缺席 console 兜底，client 束豁免面同插件先例） */
  readonly diag?: (line: string) => void;
  /** typed 诊断发射缝（AGENTS §7——派生失败等错误源 typed emit，event 用功能域前缀；缺席零发射） */
  readonly diagEmit?: (payload: { readonly level: "warn"; readonly event: string; readonly message: string }) => void;
  /**
   * 注册后自探针缝（boot 竞速根治——1.2 复核欠账 R2-竞速支 host 半）：typertGateway
   * invoke 直探（serve 层认领自证——装配序要求注册先于 gateway 首个 /api 探测，F3
   * srcClaims 记忆化规避锚）。缺席 = 跳过（非 cordis gateway 宿主/测试面）。
   */
  readonly selfProbe?: (namespace: string, method: string) => Promise<unknown>;
}

/** 注册结果（可观测面——registered = 根 ctx 装上的 namespace；degraded = 缺族未装清单；
 *  pending = inject 生命周期绑挂起中（服务后到经重绑补入 registered）） */
export interface ForgeTypertRegistration {
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

/** typed unavailable（族服务缺席——调用期诚实拒绝，非注册期静默空挂） */
function unavailable(method: string, family: string): Error {
  return new Error(unavailableMessage(method, family));
}

/** 未知抛错归一（gateway SRC 对任意抛错折叠 RemoteFailure——本面保 message 可读） */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// ── forge:projects 族（ProjectsServicePort 读/写窄面——UI 消费切片 list/register）──

/** forgeProjects namespace 控制器（serviceKey = forgeProjectsController——官方 settingsController 同型） */
export class ForgeProjectsRemote extends TypertRemoteService {
  private readonly port: () => ProjectsServicePort | undefined;
  private readonly derive: LazyDomainService;
  private readonly selfDerive: LazyDomainService;
  private readonly diag: ((line: string) => void) | undefined;
  private readonly diagEmit: ForgeTypertDeps["diagEmit"];

  constructor(ctx: Context, deps: ForgeTypertDeps) {
    super(ctx, "forgeProjectsController", { namespace: "forgeProjects" });
    this.port = deps.projects ?? (() => undefined);
    this.derive = deps.deriveTaskStoreDir ?? (() => undefined);
    this.selfDerive = deps.selfDerive ?? (() => undefined);
    this.diag = deps.diag;
    this.diagEmit = deps.diagEmit;
  }

  /** 项目清单（UI 台账/选择器数据源） */
  @Remote
  async list(signal?: AbortSignal): Promise<ProjectSummary[]> {
    signal?.throwIfAborted();
    const port = this.port();
    if (port === undefined) throw unavailable("list", "projects");
    return await port.listProjects();
  }

  /** 注册项目（add-project 流程写面） */
  @Remote
  async register(input: RegisterProjectInput, signal?: AbortSignal): Promise<RegisterResult> {
    signal?.throwIfAborted();
    const port = this.port();
    if (port === undefined) throw unavailable("register", "projects");
    return await port.registerProject(input);
  }

  /**
   * 任务库派生行（lib-path 单源真派生端点——占位已退役）：core face 在场（宿主集成态）
   * 恒委托 core（bug 8de6b903——不遮蔽真失败纪律，集成态派生根与注册闭包同 core 单源
   * 不分叉）；core face 缺席/劣形（单装态）= selfDerive 插件自链兜底（1.32②——tasksHome
   * 三级解析与官方 forge.project_home 锚同口径：config.tasksHome > env DSH_FORGE_TASKS_HOME
   * > 宿主 forge-workspaces 数据域约定）；兜底亦缺席 = typed unavailable 诚实拒绝。
   * 派生失败 fail-soft 观测面（AGENTS §7）：typed 错误原样上抛（UI 派生行降级「—」）+
   * diagEmit event=project-derive-store-dir 留痕——失败不静默，成功路径零发射。
   */
  @Remote
  async deriveTaskStoreDir(workspaceDir: string, signal?: AbortSignal): Promise<DeriveTaskStoreDirResult> {
    signal?.throwIfAborted();
    try {
      const face = this.derive() as
        | { deriveTaskStoreDir?: (q: { workspaceDir: string }) => Promise<DeriveTaskStoreDirResult> }
        | undefined;
      if (face !== undefined && typeof face.deriveTaskStoreDir === "function") {
        return await face.deriveTaskStoreDir({ workspaceDir });
      }
      const fallback = this.selfDerive() as ((workspaceDir: string) => Promise<DeriveTaskStoreDirResult>) | undefined;
      if (fallback === undefined) throw unavailable("deriveTaskStoreDir", "projects");
      this.diag?.("[project-typert] deriveTaskStoreDir core face 缺席——self-derive 单装态兜底承接");
      return await fallback(workspaceDir);
    } catch (cause) {
      this.diagEmit?.({
        level: "warn",
        event: "project-derive-store-dir",
        message: `deriveTaskStoreDir 派生失败（typed 上抛，UI 派生行降级）：${messageOf(cause)}`,
      });
      throw cause;
    }
  }

  /** 项目行变更（sidebar 五功能写面：rename/archived/sortOrders patch——host 权威 registry 写入） */
  @Remote
  async update(id: string, patch: ProjectPatch, signal?: AbortSignal): Promise<Project> {
    signal?.throwIfAborted();
    const port = this.port();
    if (port === undefined) throw unavailable("update", "projects");
    return await port.updateProject(id, patch);
  }
}

// ── forge:bugs 族（BugsServicePort list 读面；commitFiles/fileDiff 变更读面归宿主 git 面）──

export class ForgeBugsRemote extends TypertRemoteService {
  private readonly port: () => BugsServicePort | undefined;

  constructor(ctx: Context, deps: ForgeTypertDeps) {
    super(ctx, "forgeBugsController", { namespace: "forgeBugs" });
    this.port = deps.bugs ?? (() => undefined);
  }

  /** Bug 台账清单（Bug 面板/tab 现查读面） */
  @Remote
  async list(query: ListBugsQuery, signal?: AbortSignal): Promise<BugCard[]> {
    signal?.throwIfAborted();
    const port = this.port();
    if (port === undefined) throw unavailable("list", "bugs");
    return await port.listBugs(query);
  }

  /**
   * 【退役面登记】占位端点（Bug 变更读面归宿主 git 面——本插件 typed unavailable）：
   * 官方宿主 git 真实现落位时须归并/删除，face 合同含本端点——防占位转永久。
   */
  @Remote
  async commitFiles(input: BugCommitFilesQuery, signal?: AbortSignal): Promise<never> {
    signal?.throwIfAborted();
    void input;
    throw unavailable("commitFiles", "bugs");
  }

  /** 【退役面登记】占位端点（同 commitFiles——官方宿主 git 面落位时归并/删除） */
  @Remote
  async fileDiff(input: BugFileDiffQuery, signal?: AbortSignal): Promise<never> {
    signal?.throwIfAborted();
    void input;
    throw unavailable("fileDiff", "bugs");
  }
}

// ── forge:fs 族（本机只读目录列举——node:fs 宿主自有能力，apps/host ipc/fs-rpc 同缝平移）──

/**
 * 列举目录（canonical 化 = path.resolve——调用方以此为对账基准）。
 * 仅真实子目录入列（符号链接目录/文件不入列，P1 口径）；名称序。
 * @param dirPath - 缺省 = 用户主目录（浏览器起始态）
 */
export async function listDir(dirPath: string | undefined, signal?: AbortSignal): Promise<DirListing> {
  signal?.throwIfAborted();
  const target =
    typeof dirPath === "string" && dirPath !== "" ? resolve(dirPath) : homedir();
  let dirents: readonly Dirent[];
  try {
    dirents = await readdir(target, { withFileTypes: true });
  } catch (cause) {
    throw new Error(`目录不可达：${target}（${messageOf(cause)}）`);
  }
  const entries = dirents
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => ({ name: dirent.name, path: resolve(target, dirent.name) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const parent = dirname(target);
  return { path: target, parentPath: parent === target ? null : parent, entries };
}

export class ForgeFsRemote extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, "forgeFsController", { namespace: "forgeFs" });
  }

  /** 目录列举（add-project 浏览器数据源——只读） */
  @Remote
  async listDir(dirPath: string | undefined, signal?: AbortSignal): Promise<DirListing> {
    return await listDir(dirPath, signal);
  }
}

// ── forge:dirs 族（基本信息区 2026-11-13——forge 相关目录行 host 侧解析后 Typert 下发，
//    UI 面只渲染零拼接；数据源 = host/dirs 锚注册表 DIR_KEY_REGISTRY 单源）──

/** 基本信息区列示键（有序——workspaceRoot/forgeDir 项目行 + 注册表三键；forge.tmp 与
 *  forge.project_home 不列示，永不越过本面下发） */
const DIR_FACTS_PRESENTED_KEYS = ["forge.docs_root", "forge.task_home", "forge.worktrees"] as const;

export class ForgeDirsRemote extends TypertRemoteService {
  private readonly wsRoot: LazyDomainService;
  private readonly dirFacts: () => DirFactsPort | undefined;

  constructor(ctx: Context, deps: ForgeTypertDeps) {
    super(ctx, "forgeDirsController", { namespace: "forgeDirs" });
    this.wsRoot = deps.dirsWorkspaceRoot ?? (() => undefined);
    this.dirFacts = deps.dirFacts ?? (() => undefined);
  }

  /** projectId → 工作区根（fail-soft——解析面缺席/抛错/空值 = null 行，UI 呈「—」不阻断） */
  private async workspaceRootOf(projectId: string): Promise<string | null> {
    const face = this.wsRoot() as ((id: string) => Promise<unknown>) | undefined;
    if (typeof face !== "function") return null;
    try {
      const value = await face(projectId);
      return typeof value === "string" && value !== "" ? value : null;
    } catch {
      return null;
    }
  }

  /** 单键锚事实（fail-soft——缺席/解析失败 = null 行，UI 呈现「—」不阻断其余行） */
  private async anchorRow(projectId: string, dirKey: string): Promise<DirFactRow> {
    const port = this.dirFacts();
    if (port === undefined) return { dirKey, dir: null, description: "" };
    try {
      const fact = (await port.listAnchors(projectId, dirKey))[0];
      return fact === undefined
        ? { dirKey, dir: null, description: "" }
        : { dirKey, dir: fact.dir, description: fact.description };
    } catch {
      return { dirKey, dir: null, description: "" };
    }
  }

  /**
   * 基本信息区五行目录事实（fix-1 插件自装配——workspaceRoot 经插件工作区面，
   * forgeDir = workspaceRoot/.forge 插件内 joinDirSegment 派生，零 core face；
   * 逐键 fail-soft，项目行缺席 = null）。
   */
  @Remote
  async facts(query: DirFactsQuery, signal?: AbortSignal): Promise<DirFactRow[]> {
    signal?.throwIfAborted();
    const dirFactsPort = this.dirFacts();
    const wsPath = await this.workspaceRootOf(query.projectId);
    if (wsPath === null && dirFactsPort === undefined) {
      throw unavailable("facts", "dirs");
    }
    const forgeDir = wsPath === null ? null : forgeDirOfWorkspace(wsPath);
    const rows: DirFactRow[] = [
      { dirKey: "workspaceRoot", dir: wsPath, description: "项目工作区根" },
      { dirKey: "forgeDir", dir: forgeDir, description: "本工作区 .forge 目录" },
    ];
    for (const dirKey of DIR_FACTS_PRESENTED_KEYS) {
      rows.push(await this.anchorRow(query.projectId, dirKey));
    }
    return rows;
  }
}

// ── forge:worktree 族（WorktreeRpcService 全量委托 + 封存 follow 流）──

export class ForgeWorktreeRemote extends TypertRemoteService {
  private readonly svc: () => WorktreeRpcService | undefined;
  private readonly intervalMs: number;

  constructor(ctx: Context, deps: ForgeTypertDeps) {
    super(ctx, "forgeWorktreeController", { namespace: "forgeWorktree" });
    this.svc = deps.worktrees ?? (() => undefined);
    this.intervalMs = deps.followIntervalMs ?? SEAL_FOLLOW_INTERVAL_MS;
  }

  private service(): WorktreeRpcService {
    const svc = this.svc();
    if (svc === undefined) throw unavailable("*", "worktree");
    return svc;
  }

  @Remote
  async list(query: WorktreeListRequest, signal?: AbortSignal): Promise<WorktreeListResult> {
    signal?.throwIfAborted();
    return await this.service().list(query);
  }

  @Remote
  async create(query: WorktreeCreateRequest, signal?: AbortSignal): Promise<WorktreeCreateResult> {
    signal?.throwIfAborted();
    return await this.service().create(query);
  }

  /** 删除（contracts delete 动词——域实现名 remove，exportName 别名投影） */
  @Remote("delete")
  async remove(query: WorktreeDeleteRequest, signal?: AbortSignal): Promise<WorktreeDeleteResult> {
    signal?.throwIfAborted();
    return await this.service().remove(query);
  }

  @Remote
  async aheadBehind(query: WorktreeAheadBehindRequest, signal?: AbortSignal): Promise<WorktreeAheadBehindResult> {
    signal?.throwIfAborted();
    return await this.service().aheadBehind(query);
  }

  @Remote
  async branches(query: WorktreeBranchesRequest, signal?: AbortSignal): Promise<WorktreeBranchesResult> {
    signal?.throwIfAborted();
    return await this.service().branches(query);
  }

  @Remote
  async checks(query: WorktreeChecksRequest, signal?: AbortSignal): Promise<WorktreeChecksResult> {
    signal?.throwIfAborted();
    return await this.service().checks(query);
  }

  /** 封存判定快照（单发读面——chip 重建等现查消费） */
  @Remote
  async seal(query: WorktreeSealRequest, signal?: AbortSignal): Promise<WorktreeSealResult> {
    signal?.throwIfAborted();
    return await this.service().seal(query);
  }

  /**
   * 封存态 follow 流（mode:'stream'——AC② 封存通知推流化）：先 yield 完整 baseline，
   * 后随快照变化逐帧增量（快照钩 = JSON 全量比对，变才 yield）。封存态事实源 = git/盘面
   * （无领域事件源），收敛为定时重估推送——重估间隔 SEAL_FOLLOW_INTERVAL_MS。
   */
  @Remote({ mode: "stream" })
  async *followSeal(
    query: WorktreeSealRequest,
    signal?: AbortSignal,
  ): AsyncIterable<WorktreeSealResult> {
    const svc = this.service();
    let last = "";
    let first = true;
    while (first || (signal?.aborted !== true)) {
      first = false;
      const snapshot = await svc.seal(query);
      const json = JSON.stringify(snapshot);
      if (json !== last) {
        last = json;
        yield snapshot;
      }
      if (signal?.aborted === true) return;
      await sealFollowDelay(signal, this.intervalMs);
    }
  }

  @Remote
  async select(query: WorktreeSelectRequest, signal?: AbortSignal): Promise<WorktreeSelectResult> {
    signal?.throwIfAborted();
    return await this.service().select(query);
  }

  @Remote
  async selected(query: { readonly projectRoot: string }, signal?: AbortSignal): Promise<{ readonly path?: string }> {
    signal?.throwIfAborted();
    return await this.service().selected(query);
  }

  @Remote
  async ensureWorkspace(query: WorktreeEnsureWorkspaceRequest, signal?: AbortSignal): Promise<WorktreeEnsureWorkspaceResult> {
    signal?.throwIfAborted();
    return await this.service().ensureWorkspace(query);
  }

  /** 批量归属解析（sidebar 树分组/概览锚定——身份归并单点；1.6 Typert 正典通路） */
  @Remote
  async resolve(query: WorktreeResolveRequest, signal?: AbortSignal): Promise<WorktreeResolveResult> {
    signal?.throwIfAborted();
    return await this.service().resolve(query);
  }
}

/** follow 流节拍（abort 感知 sleep——取消即出循环，不悬空 fiber） */
function sealFollowDelay(signal: AbortSignal | undefined, intervalMs: number): Promise<void> {
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

// ── forge:features 族（core 域服务读面——惰性现查，缺席 typed unavailable）──

export class ForgeFeaturesRemote extends TypertRemoteService {
  private readonly resolve: LazyDomainService;

  constructor(ctx: Context, deps: ForgeTypertDeps) {
    super(ctx, "forgeFeaturesController", { namespace: "forgeFeatures" });
    this.resolve = deps.features ?? (() => undefined);
  }

  /** feature 清单（新建弹窗 slug 候选数据源） */
  @Remote
  async list(query: ListFeaturesQuery, signal?: AbortSignal): Promise<FeatureCard[]> {
    signal?.throwIfAborted();
    const svc = this.resolve() as
      | { listFeatures?: (q: ListFeaturesQuery) => Promise<FeatureCard[]> }
      | undefined;
    if (svc === undefined || typeof svc.listFeatures !== "function") {
      throw unavailable("list", "features");
    }
    return await svc.listFeatures(query);
  }
}

// ── 装配（根 ctx plugin 注册——gateway SRC 发现面 = 根 ctx reflect.props）──

/** 插件 ctx 窄面（root 取法——cordis 子 ctx.root 指根；缺席宿主退 ctx 自身） */
export interface TypertAssemblyCtxFace {
  readonly root?: unknown;
  plugin?(options: { name: string; apply: (scope: Context) => void }): unknown;
  /** cordis inject 生命周期缝（官方机械——deps 在场激活 cb、后到补激活、撤回随 fiber 退） */
  inject?(deps: readonly string[], cb: (scope: Record<string, unknown>) => void): unknown;
}

/** 控制器注册表（namespace → 工厂——缺族不注册，不空挂；injectKey = cordis inject
 *  生命周期绑族（core 域服务 provide 时点可晚于本装配——bug 253b8265：apply 时点
 *  absentWhen 探针冻结 degraded，迟到服务恒 404；改官方 inject 缝——在场激活/后到
 *  补激活/撤回随 fiber 退，1.12 conversation-views-face 同型）） */
const CONTROLLERS: readonly {
  readonly namespace: string;
  readonly injectKey?: string;
  readonly absentWhen?: (deps: ForgeTypertDeps) => boolean;
  readonly mount: (scope: Context, deps: ForgeTypertDeps) => unknown;
}[] = [
  { namespace: "forgeProjects", absentWhen: (d) => d.projects?.() === undefined, mount: (s, d) => new ForgeProjectsRemote(s, d) },
  { namespace: "forgeBugs", absentWhen: (d) => d.bugs?.() === undefined, mount: (s, d) => new ForgeBugsRemote(s, d) },
  { namespace: "forgeFs", mount: (s) => new ForgeFsRemote(s) },
  { namespace: "forgeWorktree", absentWhen: (d) => d.worktrees?.() === undefined, mount: (s, d) => new ForgeWorktreeRemote(s, d) },
  { namespace: "forgeFeatures", injectKey: "forgeFeatures", absentWhen: (d) => d.features?.() === undefined, mount: (s, d) => new ForgeFeaturesRemote(s, d) },
  { namespace: "forgeDirs", absentWhen: (d) => d.dirsWorkspaceRoot?.() === undefined && d.dirFacts?.() === undefined, mount: (s, d) => new ForgeDirsRemote(s, d) },
];

/**
 * 五族 Typert Remote 控制器注册（根 ctx plugin——fiber 生命周期归宿主管辖，dispose
 * 级联拆卸；单族注册抛错只降本族 fail-soft 不阻载，诊断留痕不静默）。
 */
export function registerForgeTypertRemotes(
  ctx: TypertAssemblyCtxFace,
  deps: ForgeTypertDeps,
): ForgeTypertRegistration {
  const diag = deps.diag;
  const host = (ctx.root ?? ctx) as TypertAssemblyCtxFace;
  const registered: string[] = [];
  const degraded: string[] = [];
  const pending: string[] = [];
  if (typeof host.plugin !== "function") {
    const line = "[project-typert] ctx.plugin 缺席——Typert 控制器不注册（非 cordis 宿主）";
    diag?.(line);
    degraded.push("assembly");
    return { registered, degraded, pending };
  }
  for (const controller of CONTROLLERS) {
    const inject = host.inject;
    if (controller.injectKey !== undefined && typeof inject === "function") {
      // 生命周期绑（官方 ctx.inject 缝——服务在场同步激活、后到补激活、撤回随 fiber 退；
      // 挂起期 namespace 不认领 = 官方 web 舞台真缺席诚实降级 404 语义不变）。
      pending.push(controller.namespace);
      degraded.push(controller.namespace);
      inject.call(host, [controller.injectKey], (scope) => {
        try {
          if (scope[controller.injectKey!] === undefined) return;
          host.plugin!({
            name: `project-typert-${controller.namespace}`,
            apply: (pluginScope: Context) => {
              controller.mount(pluginScope, deps);
            },
          });
          registered.push(controller.namespace);
          diag?.(`[project-typert] 迟到重绑：${controller.namespace} 服务在场认领（inject 生命周期缝）`);
        } catch (cause) {
          const line = `[project-typert] ${controller.namespace} 激活失败——本族降级（fail-soft 不阻载）：${messageOf(cause)}`;
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
        name: `project-typert-${controller.namespace}`,
        apply: (scope: Context) => {
          controller.mount(scope, deps);
        },
      });
      registered.push(controller.namespace);
    } catch (cause) {
      const line = `[project-typert] ${controller.namespace} 注册抛错——本族降级（fail-soft 不阻载）：${messageOf(cause)}`;
      diag?.(line);
      degraded.push(controller.namespace);
    }
  }
  diag?.(
    `[project-typert] Typert 遥控器注册完成：registered=[${registered.join(", ")}] degraded=[${degraded.join(", ")}] pending-inject=[${pending.join(", ")}]`,
  );
  // 注册后自探针（boot 竞速根治）：完成行后立即经 gateway invoke 直探 forgeProjects/list
  // ——serve 层认领自证（零副作用读面）；装配序判据 = 本探针时点晚于注册、早于 client
  // mount 首探。fail-soft：结果只落诊断（ok=info 形完成行、失败=失败因），不阻载。
  if (typeof deps.selfProbe === "function" && registered.includes("forgeProjects")) {
    void Promise.resolve()
      .then(() => deps.selfProbe!("forgeProjects", "list"))
      .then(
        () => diag?.("[project-typert] 注册后自探针 ok：forgeProjects/list（serve 层认领在场）"),
        (cause: unknown) =>
          diag?.(`[project-typert] 注册后自探针失败：forgeProjects/list——${messageOf(cause)}`),
      );
  }
  return { registered, degraded, pending };
}

/**
 * 注册后自探针缝实现（bug a99a7293——官方 gateway 2.x `invoke` 请求必携 Peer：
 * prepareInvocation 首行 `assertPeerLive(request.peer)` 读 `peer.signal`，缺 peer 即
 * 「Cannot read properties of undefined (reading 'signal')」）。owner Peer 经官方
 * dsh-client-connection 正门构造（principal kind = owner——宿主浏览器连接同型），
 * 探针结算即 dispose（scope fiber 随 root ctx 生命周期兜底回收，零悬空 Peer）。
 */
export function selfProbeOf(face: TypertAssemblyCtxFace): NonNullable<ForgeTypertDeps["selfProbe"]> {
  const root = (face.root ?? face) as Context & { get?: (name: string) => unknown };
  return async (namespace, method) => {
    let gateway: unknown;
    try {
      gateway = root.get?.("typertGateway");
    } catch {
      gateway = undefined;
    }
    const invoke = (gateway as { invoke?: (request: unknown) => Promise<unknown> } | undefined)?.invoke;
    if (invoke === undefined) {
      throw new Error("typertGateway 服务缺席——serve 层认领不可达");
    }
    const peer = new Peer(root, { principal: { kind: "owner" } });
    try {
      // receiver 保真调用（cordis/gateway Service 方法解绑 this 即崩——原型链 invokePrepared
      // 取不到；方法调用形态判例同 task-loop reflect.provide）
      return await Reflect.apply(invoke, gateway, [{ namespace, method, args: {}, peer }]);
    } finally {
      await peer.dispose();
    }
  };
}
