// host/assembly · typert-remotes.ts —— forge:* 六族 UI 数据通路（官方 Typert Remote namespace =
// 官方 UI 数据第一等通道；官方 ui-settings-* / ForgePanelController 动态插件先例同形态背书）。
//
// 形态（官方 ForgePanelController 先例，experimental/client-ui-forge/src/index.ts:60-160）：
//   TypertRemoteService 子类 + Remote 方法标记（namespace 覆写，serviceKey = 既有宿主服务
//   键命名），纯 runtime 协议零 codegen——gateway SRC 发现路径（api/gateway/src/index.ts:
//   891-917）从函数签名解析参数面、codec 全 src-json（JSON 安全校验），端点 =
//   `<namespace>/<method>`；`signal` 尾参 = cancellation（gateway:925-938）。
//
// 方法标记落法说明：标记 = @Remote 装饰器的程序化等价调用（remoteMark——协议 addMarker-
// Initializer 只消费 context.name/static/private/addInitializer 四面，构造 context 后即时
// 执行 = 运行期 marker 逐位同型）。不用装饰器语法的原因：vitest 5 转换器（vite 8 oxc）
// 不支持标准装饰器降级，测试面语法性 SyntaxError——程序化调用零转换依赖，官方 API 面
// 零改制（AGENTS 1.1 只插孔）。
//
// 发现面铁律（侦察定谳）：gateway 只遍历根 ctx reflect.props——控制器经 rootCtx.plugin
// 注册进根 ctx（插件子 ctx 注册不可见）；生命周期归插件 fiber（dispose 级联拆卸）。
//
// 范围边界：forge:settings 族归 configForms 自有 namespace（偏好值不经本面——AC③）。
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { Context } from "@deepseek-ai/cordis";
import type {
  BugsServicePort,
  ProjectsServicePort,
} from "@dsh-forge/lib-api";
import type {
  BugCard,
  DirFactRow,
  DirFactsQuery,
  DirListing,
  ListBugsQuery,
  RegisterProjectInput,
  RegisterResult,
  ProjectSummary,
  WorktreeSealRequest,
  WorktreeSealResult,
} from "@dsh-forge/contracts";
import type { DirFactsPort } from "@dsh-forge/lib-api";
import { forgeDirOfWorkspace } from "../dirs/anchors.js";
import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type { WorktreeRpcService } from "../worktrees/rpc-service.js";

// ── Remote 方法标记（@Remote 装饰器程序化等价——见文件头「落法说明」）──

/** 标准 method decorator context 结构切片（协议 addMarkerInitializer 消费面） */
interface RemoteMarkContext {
  readonly kind: "method";
  readonly name: string;
  readonly static: false;
  readonly private: false;
  readonly access: { get(): unknown };
  readonly metadata: object;
  addInitializer(initializer: (this: object) => void): void;
}

type RemoteOptionDecorator = (
  option: string | { readonly mode: "stream" },
) => (method: unknown, context: RemoteMarkContext) => void;
type RemoteBareDecorator = (method: unknown, context: RemoteMarkContext) => void;

/** 单方法标记（option 缺省 = @Remote 一元直通；'delete' = exportName 别名；stream = 推流） */
function remoteMark(proto: object, method: string, option?: string | { readonly mode: "stream" }): void {
  const members = proto as Record<string, unknown>;
  const context: RemoteMarkContext = {
    kind: "method",
    name: method,
    static: false,
    private: false,
    access: { get: () => members[method] },
    metadata: {},
    addInitializer: (initializer) => {
      initializer.call(Object.create(proto));
    },
  };
  if (option === undefined) {
    (Remote as unknown as RemoteBareDecorator)(members[method], context);
    return;
  }
  (Remote as unknown as RemoteOptionDecorator)(option)(members[method], context);
}

/** 类方法标记批（声明序 = marker 序——gateway remoteMethods 快照消费同序） */
function remoteMarks(
  proto: object,
  marks: readonly (readonly [method: string, option?: string | { readonly mode: "stream" }])[],
): void {
  for (const [method, option] of marks) remoteMark(proto, method, option);
}

/** 封存 follow 流重估间隔 ms（外部事实源——git/盘面无事件源，轮询收敛为快照推送） */
export const SEAL_FOLLOW_INTERVAL_MS = 3_000;

/** 提案/feature 域服务惰性取法缝（core 域服务注根 ctx——缺席 = typed unavailable 诚实拒绝） */
export type LazyDomainService = () => unknown;

/** 六族控制器依赖缝（工厂惰性——缺族 = 该 namespace 不注册，不空挂） */
export interface ForgeTypertDeps {
  readonly projects?: () => ProjectsServicePort | undefined;
  readonly bugs?: () => BugsServicePort | undefined;
  readonly worktrees?: () => WorktreeRpcService | undefined;
  /** core forgeProposals 服务（listProposals 读面）——缺席宿主 typed unavailable */
  readonly proposals?: LazyDomainService;
  /** core forgeFeatures 服务（listFeatures 读面）——缺席宿主 typed unavailable */
  readonly features?: LazyDomainService;
  /** workspaceRoot 解析缝（projectId → 工作区根——fix-1 插件自装配：官方宿主工作区面，零 core face），缺席 typed unavailable */
  readonly dirsWorkspaceRoot?: LazyDomainService;
  /** DirFactsPort 缝（锚注册表解析——forge.docs_root/task_home/worktrees 行事实源），缺席 typed unavailable */
  readonly dirFacts?: () => DirFactsPort | undefined;
  /** followSeal 重估间隔 ms（缺省 SEAL_FOLLOW_INTERVAL_MS——单测注入收敛节拍） */
  readonly followIntervalMs?: number;
  /** 诊断缝（装配/降级留痕——缺席 console 兜底，client 束豁免面同插件先例） */
  readonly diag?: (line: string) => void;
}

/** 注册结果（可观测面——registered = 根 ctx 装上的 namespace；degraded = 缺族未装清单） */
export interface ForgeTypertRegistration {
  readonly registered: readonly string[];
  readonly degraded: readonly string[];
}

/** typed unavailable（族服务缺席——调用期诚实拒绝，非注册期静默空挂） */
function unavailable(method: string, family: string): Error {
  return new Error(`forge.${family} ${method} unavailable（本宿主缺 ${family} 域服务面）`);
}

/** 未知抛错归一（gateway SRC 对任意抛错折叠 RemoteFailure——本面保 message 可读） */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// ── forge:projects 族（ProjectsServicePort 读/写窄面——UI 消费切片 list/register）──

/** forgeProjects namespace 控制器（serviceKey = forgeProjectsController——官方 settingsController 同型） */
export class ForgeProjectsRemote extends TypertRemoteService {
  private readonly port: () => ProjectsServicePort | undefined;

  constructor(ctx: Context, deps: ForgeTypertDeps) {
    super(ctx, "forgeProjectsController", { namespace: "forgeProjects" });
    this.port = deps.projects ?? (() => undefined);
  }

  /** 项目清单（UI 台账/选择器数据源） */
  async list(signal?: AbortSignal): Promise<ProjectSummary[]> {
    signal?.throwIfAborted();
    const port = this.port();
    if (port === undefined) throw unavailable("list", "projects");
    return await port.listProjects();
  }

  /** 注册项目（add-project 流程写面） */
  async register(input: RegisterProjectInput, signal?: AbortSignal): Promise<RegisterResult> {
    signal?.throwIfAborted();
    const port = this.port();
    if (port === undefined) throw unavailable("register", "projects");
    return await port.registerProject(input);
  }

  /** 任务库派生行（core forgeProjects 服务专属——本插件 port 不承载，typed unavailable） */
  async deriveTaskStoreDir(workspaceDir: string, signal?: AbortSignal): Promise<never> {
    signal?.throwIfAborted();
    void workspaceDir;
    throw unavailable("deriveTaskStoreDir", "projects");
  }
}
remoteMarks(ForgeProjectsRemote.prototype, [["list"], ["register"], ["deriveTaskStoreDir"]]);

// ── forge:bugs 族（BugsServicePort list 读面；commitFiles/fileDiff 变更读面归宿主 git 面）──

export class ForgeBugsRemote extends TypertRemoteService {
  private readonly port: () => BugsServicePort | undefined;

  constructor(ctx: Context, deps: ForgeTypertDeps) {
    super(ctx, "forgeBugsController", { namespace: "forgeBugs" });
    this.port = deps.bugs ?? (() => undefined);
  }

  /** Bug 台账清单（Bug 面板/tab 现查读面） */
  async list(query: ListBugsQuery, signal?: AbortSignal): Promise<BugCard[]> {
    signal?.throwIfAborted();
    const port = this.port();
    if (port === undefined) throw unavailable("list", "bugs");
    return await port.listBugs(query);
  }

  async commitFiles(input: unknown, signal?: AbortSignal): Promise<never> {
    signal?.throwIfAborted();
    void input;
    throw unavailable("commitFiles", "bugs");
  }

  async fileDiff(input: unknown, signal?: AbortSignal): Promise<never> {
    signal?.throwIfAborted();
    void input;
    throw unavailable("fileDiff", "bugs");
  }
}
remoteMarks(ForgeBugsRemote.prototype, [["list"], ["commitFiles"], ["fileDiff"]]);

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
  async listDir(dirPath: string | undefined, signal?: AbortSignal): Promise<DirListing> {
    return await listDir(dirPath, signal);
  }
}
remoteMarks(ForgeFsRemote.prototype, [["listDir"]]);

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
remoteMarks(ForgeDirsRemote.prototype, [["facts"]]);

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

  async list(query: Parameters<WorktreeRpcService["list"]>[0], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return await this.service().list(query);
  }

  async create(query: Parameters<WorktreeRpcService["create"]>[0], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return await this.service().create(query);
  }

  /** 删除（contracts delete 动词——域实现名 remove，exportName 别名投影） */
  async remove(query: Parameters<WorktreeRpcService["remove"]>[0], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return await this.service().remove(query);
  }

  async aheadBehind(query: Parameters<WorktreeRpcService["aheadBehind"]>[0], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return await this.service().aheadBehind(query);
  }

  async branches(query: Parameters<WorktreeRpcService["branches"]>[0], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return await this.service().branches(query);
  }

  async checks(query: Parameters<WorktreeRpcService["checks"]>[0], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return await this.service().checks(query);
  }

  /** 封存判定快照（单发读面——chip 重建等现查消费） */
  async seal(query: WorktreeSealRequest, signal?: AbortSignal): Promise<WorktreeSealResult> {
    signal?.throwIfAborted();
    return await this.service().seal(query);
  }

  /**
   * 封存态 follow 流（mode:'stream'——AC② 封存通知推流化）：先 yield 完整 baseline，
   * 后随快照变化逐帧增量（快照钩 = JSON 全量比对，变才 yield）。封存态事实源 = git/盘面
   * （无领域事件源），收敛为定时重估推送——重估间隔 SEAL_FOLLOW_INTERVAL_MS。
   */
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

  async select(query: Parameters<WorktreeRpcService["select"]>[0], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return await this.service().select(query);
  }

  async selected(query: Parameters<WorktreeRpcService["selected"]>[0], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return await this.service().selected(query);
  }

  async ensureWorkspace(query: Parameters<WorktreeRpcService["ensureWorkspace"]>[0], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return await this.service().ensureWorkspace(query);
  }
}
remoteMarks(ForgeWorktreeRemote.prototype, [
  ["list"],
  ["create"],
  ["remove", "delete"],
  ["aheadBehind"],
  ["branches"],
  ["checks"],
  ["seal"],
  ["followSeal", { mode: "stream" }],
  ["select"],
  ["selected"],
  ["ensureWorkspace"],
]);

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

// ── forge:{proposals,features} 族（core 域服务读面——惰性现查，缺席 typed unavailable）──

export class ForgeProposalsRemote extends TypertRemoteService {
  private readonly resolve: LazyDomainService;

  constructor(ctx: Context, deps: ForgeTypertDeps) {
    super(ctx, "forgeProposalsController", { namespace: "forgeProposals" });
    this.resolve = deps.proposals ?? (() => undefined);
  }

  /** 提案清单（新建弹窗 slug 候选数据源） */
  async list(query: unknown, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const svc = this.resolve() as { listProposals?: (q: unknown) => Promise<unknown> } | undefined;
    if (svc === undefined || typeof svc.listProposals !== "function") {
      throw unavailable("list", "proposals");
    }
    return await svc.listProposals(query);
  }
}
remoteMarks(ForgeProposalsRemote.prototype, [["list"]]);

export class ForgeFeaturesRemote extends TypertRemoteService {
  private readonly resolve: LazyDomainService;

  constructor(ctx: Context, deps: ForgeTypertDeps) {
    super(ctx, "forgeFeaturesController", { namespace: "forgeFeatures" });
    this.resolve = deps.features ?? (() => undefined);
  }

  /** feature 清单（新建弹窗 slug 候选数据源） */
  async list(query: unknown, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const svc = this.resolve() as { listFeatures?: (q: unknown) => Promise<unknown> } | undefined;
    if (svc === undefined || typeof svc.listFeatures !== "function") {
      throw unavailable("list", "features");
    }
    return await svc.listFeatures(query);
  }
}
remoteMarks(ForgeFeaturesRemote.prototype, [["list"]]);

// ── 装配（根 ctx plugin 注册——gateway SRC 发现面 = 根 ctx reflect.props）──

/** 插件 ctx 窄面（root 取法——cordis 子 ctx.root 指根；缺席宿主退 ctx 自身） */
export interface TypertAssemblyCtxFace {
  readonly root?: unknown;
  plugin?(options: { name: string; apply: (scope: Context) => void }): unknown;
}

/** 控制器注册表（namespace → 工厂——缺族不注册，不空挂） */
const CONTROLLERS: readonly {
  readonly namespace: string;
  readonly absentWhen?: (deps: ForgeTypertDeps) => boolean;
  readonly mount: (scope: Context, deps: ForgeTypertDeps) => unknown;
}[] = [
  { namespace: "forgeProjects", absentWhen: (d) => d.projects?.() === undefined, mount: (s, d) => new ForgeProjectsRemote(s, d) },
  { namespace: "forgeBugs", absentWhen: (d) => d.bugs?.() === undefined, mount: (s, d) => new ForgeBugsRemote(s, d) },
  { namespace: "forgeFs", mount: (s) => new ForgeFsRemote(s) },
  { namespace: "forgeWorktree", absentWhen: (d) => d.worktrees?.() === undefined, mount: (s, d) => new ForgeWorktreeRemote(s, d) },
  { namespace: "forgeProposals", absentWhen: (d) => d.proposals?.() === undefined, mount: (s, d) => new ForgeProposalsRemote(s, d) },
  { namespace: "forgeFeatures", absentWhen: (d) => d.features?.() === undefined, mount: (s, d) => new ForgeFeaturesRemote(s, d) },
  { namespace: "forgeDirs", absentWhen: (d) => d.dirsWorkspaceRoot?.() === undefined && d.dirFacts?.() === undefined, mount: (s, d) => new ForgeDirsRemote(s, d) },
];

/**
 * 六族 Typert Remote 控制器注册（根 ctx plugin——fiber 生命周期归宿主管辖，dispose
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
  if (typeof host.plugin !== "function") {
    const line = "[project-typert] ctx.plugin 缺席——Typert 控制器不注册（非 cordis 宿主）";
    diag?.(line);
    degraded.push("assembly");
    return { registered, degraded };
  }
  for (const controller of CONTROLLERS) {
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
    `[project-typert] Typert 遥控器注册完成：registered=[${registered.join(", ")}] degraded=[${degraded.join(", ")}]`,
  );
  return { registered, degraded };
}
