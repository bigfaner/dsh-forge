// @dsh-forge/task-loop —— host 装配入口（fix-1 域装配本体落位）。
// 定位（AC「host/index.ts 只装配零域逻辑」）：本文件只做装配缝合——
//   ① 单装缺省装配：assembleTaskLoopServices（db 缺省路径/服务常驻 provider/任务目录
//      缺省约定三件单源，assembly/default-assembly.ts）；
//   ② 具名服务 provide：forgeTasks/forgeCheckpoints（cordis reflect.provide 官方面）；
//   ③ Typert 通道挂载：CONTROLLERS 注册表 → 根 ctx plugin() 注册（注册三态可观测 +
//      注册后自探针，assembly/typert-remotes.ts）；
//   ④ 启动对账：reconcileInterrupted 全域接线（fail-soft 降级不阻载，诊断留痕）。
// 域逻辑零内联——全部归属 host/{domain,db,tools,loop} 域本体与 assembly/ 组装面。
//   ① loader 装载面：default 导出 Plugin.Function（cordis loader 只认 default 导出函数，
//     组合层 cordis.patch.yml 单行 insert 挂载）；
//   ② bundle 管线验证锚：消费 @dsh-forge/lib-* devDependencies（scripts/bundle-host.mjs
//     构建期内联进 dist——产物自含，dist 零 @dsh-forge/lib-* 裸 import）。
import { errMessage } from "@dsh-forge/lib-util";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { consoleDiagFallback, type DiagLevel } from "@dsh-forge/lib-diag";
// owner Peer 类型侧引入（AGENTS 1.6 配方——bug e4aa1a5f：静态具名导入经宿主解析面落到
// 无 Peer 导出的旧版本时整 entry 拒激活；runtime ctor 由 loadOwnerPeerCtor 惰性动态加载
// + fail-soft 承担，装载期零耦合）。
import type { Peer } from "@deepseek-ai/dsh-client-connection";
import { FORGE_CHECKPOINTS_SERVICE_KEY, FORGE_TASKS_SERVICE_KEY } from "../shared/contract-constants.js";
import { rootCtxOf } from "@dsh-forge/lib-util";
import {
  assembleTaskLoopServices,
  type TaskLoopAssembly,
  type TaskLoopAssemblyConfig,
} from "./assembly/default-assembly.js";
import { assembleTaskLoopToolFamily } from "./assembly/tool-family.js";
import {
  lazyWorktreesFace,
  registerForgeTasksRemote,
  type ForgeProjectsIdentityFace,
  type ForgeTasksRemoteDeps,
  type TypertAssemblyCtxFace,
} from "./assembly/typert-remotes.js";
import { createDiagEmitter, createExpertProfileResolver, emitForgeDiag, FORGE_PACKAGE_NAME, type ExpertProfileResolver, type ExpertsServiceFace } from "./faces.js";
import { withSessionIdentity } from "./tools/faces.js";
import type { TasksService } from "./domain/tasks/service.js";

import { assertInstallMutex } from "./install-mutex.js";

/** host 装配 config（全部可选——缺省面 = DSH_HOME + 缺省 db 落点 + git 查找降级）。 */
export interface TaskLoopHostConfig extends TaskLoopAssemblyConfig {
  /** 诊断缝（缺省 console 按级分流兜底——diag-emit 纪律 console 豁免面同插件先例）。 */
  readonly diag?: (line: string, level?: DiagLevel) => void;
  /** INV-3 组合装载标记（forge patch 成员行下发 comboMark: true——solo patch 行越装缺此键）。 */
  readonly comboMark?: boolean;
}

/** cordis 插件装载形态（loader 只认 default 导出函数）。 */
interface TaskLoopPlugin {
  (ctx: unknown, config?: TaskLoopHostConfig): () => void;
  inject: readonly string[];
}

/** 插件 ctx 结构化消费面（真 Context 结构兼容——provide 具名服务 + 可选 emit/防御 get）。 */
interface TaskLoopPluginCtx {
  /** 服务注册官方面（cordis reflect.provide——Service 基类同径） */
  readonly reflect?: {
    provide?(name: string, value?: unknown): unknown;
    get?(name: string): unknown;
  };
  /** cordis 事件混入（diag/log 事件域诊断埋点；缺席 = console 兜底） */
  readonly emit?: (event: string, payload: Record<string, unknown>) => void;
  /** 官方 dsh tools 注册缝（单装工具族注册正门——inject 名单显式声明，缺席 = 零注册降级） */
  readonly tools?: {
    register?(definition: unknown): () => void;
  };
}

/** 官方 tools 缝防御读取（cordis inject 门：属性访问未被 inject 声明即抛「cannot get
 *  property without inject」——try/catch fail-soft 归 undefined，apply 永不因缝读取崩） */
function toolsFaceOf(ctx: unknown): TaskLoopPluginCtx["tools"] | undefined {
  try {
    const face = (ctx as TaskLoopPluginCtx).tools;
    return face !== null && typeof face === "object" ? face : undefined;
  } catch {
    return undefined;
  }
}

/** forgeTasks 域服务惰性现查缝（AGENTS 1.6——检测永不缓存，每个消费点调用期求值）：
 *  reflect.get 具名服务防御读取；缺席/抛错 = undefined（namespace 诚实降级 404 语义）。
 */
function lazyTasksFace(ctx: unknown): () => TasksService | undefined {
  return () => {
    try {
      const face = ctx as { reflect?: { get?(name: string): unknown } };
      const svc = face.reflect?.get?.(FORGE_TASKS_SERVICE_KEY);
      return (svc ?? undefined) as TasksService | undefined;
    } catch {
      return undefined;
    }
  };
}

/**
 * forge.projects 身份解析缝（bug 9407ff29——projectId → project_key 的 host 半解析源）：
 * plugins/project 五缝 forge.projects 结构消费（PROJECT_SEAM_KEYS.projects 同键——seam 为
 * 惰性工厂 provide，工厂调用产出 ProjectsServicePort；本面只取 getProject 行真值窄面）。
 * 现查永不缓存（AGENTS 1.6）；缝缺席/劣形/抛错 = undefined——快照族 fail-soft 降级由
 * remote 面承担（emitDiag 留痕）。
 */
function lazyProjectsFace(ctx: unknown): ForgeTasksRemoteDeps["projects"] {
  return () => {
    try {
      const factory = (ctx as TaskLoopPluginCtx).reflect?.get?.(PROJECT_SEAM_KEY);
      if (typeof factory !== "function") return undefined;
      const face = (factory as () => unknown)();
      if (face === null || face === undefined || typeof face !== "object") return undefined;
      const candidate = face as { getProject?: unknown };
      return typeof candidate.getProject === "function" ? (candidate as ForgeProjectsIdentityFace) : undefined;
    } catch {
      return undefined;
    }
  };
}
/**
 * projectKey → 项目工作区根异步解析缝（bug 9b3c9a9b 生产接线真身）：forge.projects 面
 * 现查（lazyProjectsFace 同配方——惰性现查 + try/catch，检测结果零缓存）→ getProject()
 * .wsPath；项目未注册 / 面缺席 / 抛错 = undefined（fail-soft 不抛）。经装配 config
 * resolveWsPathAsync 下发（worker 锚点节 forgeDir 派生 + 结算回收钩子两链消费）。
 */
function resolveWsPathAsyncOf(ctx: unknown): (projectKey: string) => Promise<string | undefined> {
  return async (projectKey) => {
    const projects = lazyProjectsFace(ctx)?.();
    if (projects === undefined) return undefined;
    try {
      const project = await projects.getProject(projectKey);
      if (project === null) return undefined;
      const ws = project.wsPath;
      return typeof ws === "string" && ws.trim() !== "" ? ws : undefined;
    } catch {
      return undefined;
    }
  };
}


/** Typert 注册后自探针缝（gateway invoke 直探——serve 层认领自证；缺席/失败由注册面诊断）。
 *  bug a99a7293 同族修型：官方 gateway 2.x `invoke` 请求必携 Peer（assertPeerLive 读
 *  `peer.signal`——缺 peer 即 undefined 'signal'），owner Peer 经官方 dsh-client-connection
 *  正门构造（principal kind = owner），探针结算即 dispose（零悬空 Peer）。
 *  bug e4aa1a5f 修型：Peer ctor 改运行期惰性动态加载（官方包源码核销——0.2.2-rc.2 导出
 *  `Peer`，0.2.0-rc.2 仅 `OperatorPeer`；宿主解析面版本不可静态假设），导出缺席 → 探针
 *  如实降级抛错（fail-soft 归注册面），entry 装载不再被导入面炸掉。 */
/** owner Peer 构造面（类型侧引入保形——principal kind = owner）。 */
export type OwnerPeerCtor = new (owner: never, options: { principal: { kind: "owner" } }) => Peer;

/** 官方 dsh-client-connection 导出面现查（每个消费点调用期求值——检测结果不缓存）。
 *  模块解析失败/无 Peer 导出 = undefined（降级语义由调用方承担）。 */
export async function loadOwnerPeerCtor(): Promise<OwnerPeerCtor | undefined> {
  try {
    const mod = (await import("@deepseek-ai/dsh-client-connection")) as { Peer?: OwnerPeerCtor };
    return mod.Peer;
  } catch {
    return undefined;
  }
}

export function selfProbeOf(
  ctx: unknown,
  deps?: { readonly peerLoader?: () => Promise<OwnerPeerCtor | undefined> },
): ForgeTasksRemoteDeps["selfProbe"] {
  // 根 ctx 取法走符号键 rootCtxOf（bug 2801eeeb 同族复发——ctx.root 属性访问触发
  // cordis 1.1.0 inject 门控；非 ctx 形入参退自身）
  const root = (rootCtxOf(ctx) ?? ctx) as {
    get?: (name: string) => unknown;
  };
  const peerLoader = deps?.peerLoader ?? loadOwnerPeerCtor;
  return async (namespace, method, args) => {
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
    const PeerCtor = await peerLoader();
    if (PeerCtor === undefined) {
      throw new Error("官方 dsh-client-connection 导出面无 Peer（宿主解析版本过旧）——owner Peer 不可构造，自探针降级");
    }
    // Peer owner 须为 cordis Context（scope fiber 挂靠——root ctx 即宿主根；跨包类型双源
    // 以结构窄面通过，构造点 as never 收口）
    const peer = new PeerCtor(root as never, { principal: { kind: "owner" } });
    try {
      // receiver 保真调用（gateway Service 方法解绑 this 即崩——invokePrepared undefined 判例）
      return await Reflect.apply(invoke, gateway, [{ namespace, method, args: args ?? {}, peer }]);
    } finally {
      await peer.dispose();
    }
  };
}

/** 具名服务 provide（常驻 provider——装配期一次，零 provide 降级径由装配面承担）。 */
function provideResidentServices(ctx: unknown, services: TaskLoopAssembly, diag: (line: string, level?: DiagLevel) => void): void {
  const reflect = (ctx as TaskLoopPluginCtx).reflect;
  if (typeof reflect?.provide !== "function") {
    diag("[task-loop] ctx.reflect.provide 缺席（非 cordis 宿主）——forgeTasks/forgeCheckpoints 零 provide（降级不阻载）", "warn");
    return;
  }
  try {
    // 方法调用形态（receiver = reflect 官方面——cordis 4 Proxy 方法解绑 this.call 即崩，
    // 'fiber' undefined 判例）
    reflect.provide(FORGE_TASKS_SERVICE_KEY, services.tasks);
    reflect.provide(FORGE_CHECKPOINTS_SERVICE_KEY, services.checkpoints);
    diag("[task-loop] 域服务 provide 完成：forgeTasks/forgeCheckpoints（常驻 provider）", "info");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    diag(`[task-loop] 域服务 provide 失败——降级不阻载：${message}`, "error");
  }
}

/**
 * 单装工具族注册缝（bug a033636f——fix-8 修型）：官方 ctx.tools.register 正门逐枚注册
 * 工具族 14 员（10 任务动词 + batch_add_tasks + impl_checkpoint 三员 + dispatch/stop），
 * 注册 disposer 全量回收（unmount 撤回）；单枚注册抛错不再静默截断（loud 缝——plugin-forge
 * registerToolLoud 先例，失败 error 留痕其余照常）。缝缺席/劣形 = 工具面零注册 + warn 留痕
 * （降级诚实不阻载——单装全链不可达的根因即本缝遗漏）。
 */
export function registerToolFamily(
  ctx: unknown,
  services: TaskLoopAssembly,
  diag: (line: string, level?: DiagLevel) => void,
): { dispose: () => void } {
  const toolsFace = toolsFaceOf(ctx);
  const register = typeof toolsFace?.register === "function" ? toolsFace.register.bind(toolsFace) : undefined;
  if (register === undefined) {
    diag("[task-loop] ctx.tools.register 缺席（官方 tools 缝缺失）——单装工具面零注册（任务/派发工具族对本宿主不可达，降级不阻载）", "warn");
    return { dispose: () => {} };
  }
  const family = assembleTaskLoopToolFamily({ services, ctx, diag });
  const disposers: (() => void)[] = [];
  for (const definition of family.tools) {
    try {
      // 会话身份注入（bug e7e6a3bc——官方 ToolRunContext 只携 agent.session.id，注册缝
      // withSessionIdentity 填 exec.sessionId 顶层子面；dispatch/stop 两环同缝覆盖）
      disposers.push(register(withSessionIdentity(definition)));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      diag(`[task-loop] tool register failed (${definition.name}): ${message}`, "error");
    }
  }
  diag(`[task-loop] 单装工具族注册完成：${String(family.tools.length)} 员经官方 ctx.tools.register（unmount 全撤回）`, "info");
  return {
    dispose: () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          // 宿主注销面异常隔离——卸载收口不外抛
        }
      }
      family.disposeLoop();
    },
  };
}

/** 随包 experts/ 目录解析（源 host/index.ts 深包根 1 级、dist bundle dist/host/index.js 深
 * 2 级——双候选取在场目录；均缺席 = undefined 由注册面 warn 留痕）。 */
function bundledExpertsRoot(moduleUrl: string = import.meta.url): string | undefined {
  for (const rel of ["../../experts/", "../experts/"] as const) {
    const dir = fileURLToPath(new URL(rel, moduleUrl));
    if (existsSync(dir)) return dir;
  }
  return undefined;
}

/**
 * 随包内置专家档案注册（experts.registerRoot 装配行——AGENTS 1.6 配方）：惰性
 * reflect.get('experts') + try/catch 现查、检测结果零缓存；expert-squad 缺席 =
 * fail-soft + warn 留痕（不阻载本插件）。registerRoot 侧已主动触发全部已建 registry
 * 换代（plugins/expert-squad host/index.ts registerRoot 注记）——本面零 refresh 调用。
 * pluginName = 本包包名（实例 ID 前缀 `@dsh-forge/task-loop#键`，faces.FORGE_PACKAGE_NAME 单源）。
 * 承重假设：expert-squad 装载序先于本插件（builtin-redistribution 裁决②显式声明）：
 * 本注册只在 apply 期一次性求值，无迟到补偿（消费期补注册/服务上场事件监听均未建
 * ——AGENTS 1.6 禁 memoize + 最小改动纪律）；expert-squad 晚装载即永久零注册
 * （仅本 warn 留痕，不静默失联）。当前两形态装载序已核实：dev 形态 expert-squad
 * 经 dsh.profile.bundles bundle 层装载（一切用户层 patch 之前）；打包形态经用户层
 * insert 行 + 本包行经预设组合/装载表后置（一切均在 expert-squad 行之后）。
 */
export function registerBuiltinExpertsRoot(
  ctx: unknown,
  diag: (line: string, level?: DiagLevel) => void,
): void {
  let experts: unknown;
  try {
    experts = (ctx as TaskLoopPluginCtx).reflect?.get?.("experts");
  } catch {
    experts = undefined; // 反射异常视同缺席（fail-soft）
  }
  const register = (experts as { registerRoot?: unknown } | undefined)?.registerRoot;
  if (typeof register !== "function") {
    diag("[task-loop] experts 服务缺席（expert-squad 未装/未供）——随包专家档案零注册（fail-soft 不阻载）", "warn");
    return;
  }
  const dir = bundledExpertsRoot();
  if (dir === undefined) {
    diag("[task-loop] 随包 experts/ 目录解析缺席——内置专家档案零注册（fail-soft 不阻载）", "warn");
    return;
  }
  try {
    register.call(experts, ctx, dir, FORGE_PACKAGE_NAME);
    diag(`[task-loop] 随包内置专家档案注册完成：${dir}（experts.registerRoot——换代由 expert-squad 侧承担）`, "info");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    diag(`[task-loop] experts.registerRoot 调用失败——随包专家档案零注册（fail-soft 不阻载）：${message}`, "warn");
  }
}

const taskLoopPlugin: TaskLoopPlugin = (ctx: unknown, config: TaskLoopHostConfig = {}): (() => void) => {
  // INV-3 安装互斥 loud-fail 守卫（bug ef3e92ea）——任何装配副作用之前首查。
  assertInstallMutex(ctx, config, "@dsh-forge/task-loop");
  const diag = config.diag ?? consoleDiagFallback;
  // forge 诊断发射面（payload 面——createExpertProfileResolver / typert 桥接共用；ctx.emit
  // 在场即 typed emit，缺席 console 兜底）。纯构造无副作用，前移到装配之前供 persona 接线消费。
  const diagEmit = createDiagEmitter((ctx as TaskLoopPluginCtx).emit);
  // 随包内置专家档案注册（experts.registerRoot 装配行——experts 缺席 fail-soft 不阻载）
  registerBuiltinExpertsRoot(ctx, diag);
  // worker persona 专家人格段取用面（bug 044a310c 判例——同一 resolver 两链消费）：
  // tool-family.ts 的 resolveWorkerProfile（工具白名单链）早已接 createExpertProfileResolver，
  // claim 链的 resolveExpertProfile（persona 人格段）此前从未注入 → worker persona 恒仅
  // 程序段、无「你是<title>」。experts 每次消费现查不缓存（AGENTS 1.6）——experts 缺席
  // （单装无 expert-squad）= 不注入，claim 侧「仅程序段」形态兼容不变。
  const expertsFaceOf = (): ExpertsServiceFace | undefined => {
    try {
      const viaInject = (ctx as { experts?: unknown }).experts as ExpertsServiceFace | undefined;
      if (viaInject !== undefined && typeof viaInject.get === "function") return viaInject;
    } catch {
      // 注入服务未就绪 = 降级 reflect 通道
    }
    try {
      const viaReflect = (ctx as { reflect?: { get?(name: string): unknown } }).reflect?.get?.("experts") as ExpertsServiceFace | undefined;
      if (viaReflect !== undefined && typeof viaReflect.get === "function") return viaReflect;
    } catch {
      // reflect 通道异常 = 缺席
    }
    return undefined;
  };
  const resolveExpertProfile = (): ExpertProfileResolver | undefined => {
    const experts = expertsFaceOf();
    if (experts === undefined) return undefined;
    return createExpertProfileResolver({ experts, diag: diagEmit });
  };
  const profileResolver = resolveExpertProfile();
  // 单装缺省装配（三件单源——home 缺席/db 打开失败 = 整体降级零 provide）
  const services = assembleTaskLoopServices(
    {
      ...config,
      // bug 9b3c9a9b——resolveWsPath 生产真身接线（forge.projects 缝异步解析；显式 config
      // 注入优先，缺省即接缝——生产不再恒空串，回收钩子/worker 锚点节恢复可解析）
      resolveWsPathAsync: config.resolveWsPathAsync ?? resolveWsPathAsyncOf(ctx),
      // dirKeys.* 目录声明反射拉缝（forge-dirs-unification §2.3——worker 规格目录经注册表
      // forge.spec_dir 解析；显式 config 注入优先，缺省即接宿主 reflect 面，每次消费点现查）
      reflectOf: config.reflectOf ?? (() => (ctx as { reflect?: unknown }).reflect),
      ...(profileResolver !== undefined ? { resolveExpertProfile: profileResolver } : {}),
    },
    diag,
  );
  // 单装工具族注册（官方 tools 缝——apply 期注册、unmount 撤回；域服务缺席 = 零注册降级）
  let disposeToolFamily: (() => void) | undefined;
  if (services !== undefined) {
    disposeToolFamily = registerToolFamily(ctx, services, diag).dispose;
    provideResidentServices(ctx, services, diag);
    // 启动对账接线（reconcile 降级——fire-and-forget，失败 warn 留痕不阻载）
    void services.reconcile().catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      emitForgeDiag(createDiagEmitter((ctx as TaskLoopPluginCtx).emit), {
        level: "warn",
        event: "task-loop-reconcile",
        message: `启动对账降级（fail-soft 不阻载）：${message}`,
      });
    });
  }
  // forgeTasks Typert 通道挂载（CONTROLLERS 注册表 → 根 ctx plugin 注册——注册三态可观测
  // + 自探针；诊断 emit 桥接：diagEmit 已在装配前创建，此处直接消费）。
  const remoteDeps: ForgeTasksRemoteDeps = {
    tasks: lazyTasksFace(ctx),
    projects: lazyProjectsFace(ctx),
    worktrees: lazyWorktreesFace(ctx),
    diag: (line) => {
      diag(line, "info");
      emitForgeDiag(diagEmit, { event: "task-loop-typert", level: "info", message: line });
    },
    selfProbe: selfProbeOf(ctx),
  };
  registerForgeTasksRemote(ctx as TypertAssemblyCtxFace, remoteDeps);
  return () => {
    // 工具族注销（官方 tools 缝 disposer 全量回收 + 循环内核活循环终态注销）
    disposeToolFamily?.();
    // 库句柄关闭（cordis provide 注销面由宿主管辖——本插件自持资源仅 db 句柄）
    services?.dispose();
  };
};

/** 装配失败诊断投影（bundle 管线验证锚——lib-util errMessage 消费点）。 */
export function describeSetupFailure(error: unknown): string {
  return errMessage(error);
}

// ── 类型出口（host 类型锚单源——宿主桥白名单/通道族/remote 只读切片 satisfies 锚定本面，
//    1.14 host 改指批：宿主禁再引 contracts 旧 ForgeTasksService face）──
export type { TasksService } from "./domain/tasks/service.js";
export type { TaskCard, TaskSnapshot } from "./domain/tasks/types.js";
export type {
  ListTasksQuery,
  TaskStats,
  TaskStatsQuery,
  TaskGraph,
  TaskGraphQuery,
  TaskSettlementRow,
  TaskSettlementsQuery,
} from "./domain/tasks/list.js";
export type { TaskDetail, TaskDetailQuery } from "./domain/tasks/detail.js";
export type { SessionTaskLinkCard } from "./domain/tasks/types.js";
export type { SessionLinksQuery } from "./domain/tasks/session-links.js";
export type { TransitionTaskInput } from "./domain/tasks/transition.js";
export type { ValidateContainerTasksInput, ValidateReport } from "./domain/tasks/validate.js";
export type { QueryTaskResult } from "./domain/tasks/query.js";

// inject 名单（proposal 硬判据：装配行 inject 名单显式含 webServer——目标宿主必带；
// 名单缺席 = ctx 属性访问被 cordis inject 门拒恒 undefined，fix-8 判例。experts = 可选
// 消费面（bug dc0f9de3 修型——worker 路由档案取用源）：照 plugin-forge 0b83e3aa 跨 realm
// 正门声明入名单 + 调用期防御读取（assembly/tool-family expertsFaceOf fail-soft，缺席 =
// generic 兜底档不阻载）；forge.projects = 身份解析缝显式入名单（bug 9407ff29
// 修型——解析缝生命周期绑 inject 名单显式；缺席 fail-soft 降级「无任务数据」+ 诊断留痕，
// 253b8265 判例同族）。tools = 单装工具族注册缝显式入名单（bug a033636f 修型——官方
// ctx.tools.register 正门；缺席 fail-soft 零注册 + warn 留痕）。
/** forge.projects 缝键（plugins/project host/assembly/seams.ts PROJECT_SEAM_KEYS.projects
 *  同值——跨包结构消费，本包零依赖声明只持同值常量，漂移由 identity 解析面诊断兜底） */
const PROJECT_SEAM_KEY = "forge.projects";

taskLoopPlugin.inject = ["webServer", PROJECT_SEAM_KEY, "tools", "experts"] as const;

export default taskLoopPlugin;
