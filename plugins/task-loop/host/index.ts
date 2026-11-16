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
import { consoleDiagFallback, type DiagLevel } from "@dsh-forge/lib-diag";
import { FORGE_CHECKPOINTS_SERVICE_KEY, FORGE_TASKS_SERVICE_KEY } from "../shared/contract-constants.js";
import {
  assembleTaskLoopServices,
  type TaskLoopAssembly,
  type TaskLoopAssemblyConfig,
} from "./assembly/default-assembly.js";
import { assembleTaskLoopToolFamily } from "./assembly/tool-family.js";
import {
  registerForgeTasksRemote,
  type ForgeProjectsIdentityFace,
  type ForgeTasksRemoteDeps,
  type TypertAssemblyCtxFace,
} from "./assembly/typert-remotes.js";
import { createDiagEmitter, emitForgeDiag } from "./faces.js";
import { withSessionIdentity } from "./tools/faces.js";
import type { TasksService } from "./domain/tasks/service.js";

/** host 装配 config（全部可选——缺省面 = DSH_HOME + 缺省 db 落点 + git 查找降级）。 */
export interface TaskLoopHostConfig extends TaskLoopAssemblyConfig {
  /** 诊断缝（缺省 console 按级分流兜底——diag-emit 纪律 console 豁免面同插件先例）。 */
  readonly diag?: (line: string, level?: DiagLevel) => void;
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

/** Typert 注册后自探针缝（gateway invoke 直探——serve 层认领自证；缺席/失败由注册面诊断）。 */
function selfProbeOf(ctx: unknown): ForgeTasksRemoteDeps["selfProbe"] {
  const root = ((ctx as { root?: unknown }).root ?? ctx) as {
    get?: (name: string) => unknown;
  };
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
    return await invoke({ namespace, method, args: args ?? {} });
  };
}

/** 具名服务 provide（常驻 provider——装配期一次，零 provide 降级径由装配面承担）。 */function provideResidentServices(ctx: unknown, services: TaskLoopAssembly, diag: (line: string, level?: DiagLevel) => void): void {
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

const taskLoopPlugin: TaskLoopPlugin = (ctx: unknown, config: TaskLoopHostConfig = {}): (() => void) => {
  const diag = config.diag ?? consoleDiagFallback;
  // 单装缺省装配（三件单源——home 缺席/db 打开失败 = 整体降级零 provide）
  const services = assembleTaskLoopServices(config, diag);
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
  // + 自探针；诊断 emit 桥接：ctx.emit 在场即 typed emit，缺席 console 兜底）。
  const diagEmit = createDiagEmitter((ctx as TaskLoopPluginCtx).emit);
  const remoteDeps: ForgeTasksRemoteDeps = {
    tasks: lazyTasksFace(ctx),
    projects: lazyProjectsFace(ctx),
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
