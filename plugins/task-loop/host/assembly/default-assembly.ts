// host/assembly · default-assembly.ts —— 单装缺省装配（零组合器 config 自足）：
//   ① db 缺省路径：{home}/forge/db/task-loop/task-loop.db（openDomainDb/domainDbFileName 单源）；
//   ② 服务常驻 provider：db 打开即装配 forgeTasks/forgeCheckpoints 两域服务（无缝门控——
//      常驻形态，宿主集成态同源消费）；
//   ③ 任务目录缺省约定：home 缺省 = env DSH_HOME（project 插件实况同径；显式 config.home 覆写）；
//   ④ forge 事件日志链（bug a93c1277——logs/{slug}.jsonl 派发运营日志落盘）：tasksHome 注入
//      （组合器 patch config 下发 {DSH_HOME}/forge/projects）时装配 bus→sink→监听器三件；
//      缺席（单装缺省形态）= 整链零装配零行为变化（AC4 回归锚）。
// home 缺席 / db 打开失败 = 整体降级缺席（返回 undefined——零 provide，fail-soft 诊断留痕不阻载）。
import { deriveTaskStoreDir } from "@dsh-forge/lib-path";
import { domainDbFileName, openDomainDb, type DomainDb } from "../db/connection.js";
import { createCheckpointsService, type CheckpointsService } from "../domain/checkpoints/service.js";
import { listDistinctProjectKeys } from "../domain/tasks/query.js";
import { createTasksService, type TasksService } from "../domain/tasks/service.js";
import { createForgeEventBus } from "../events/bus.js";
import { attachForgeLogListener } from "../events/log-listener.js";
import { createForgeEventSink, type ForgeEventSink } from "../events/sink.js";
import type { DiagLevel } from "@dsh-forge/lib-diag";
import type { TaskEvents, TasksVerbDeps } from "../domain/tasks/types.js";

export { domainDbFileName };

/** 单装装配 config（全可选——缺省面 = DSH_HOME + 缺省 db 落点 + git 查找降级）。 */
export interface TaskLoopAssemblyConfig {
  /** DSH home（db 缺省落点根；缺席 = env DSH_HOME，双缺 = 降级缺席） */
  readonly home?: string;
  /** 库文件覆盖（':memory:' 供测试；缺省 = {home}/forge/db/task-loop/task-loop.db） */
  readonly dbFile?: string;
  /** projectKey → 项目检出根（taskDetail git 只读查找 cwd；缺席 = 空串降级——actualFiles 走 payload files 面） */
  readonly resolveWsPath?: (projectKey: string) => string;
  /**
   * 任务目录派生根（bug a93c1277——组合器 patch config 下发 {DSH_HOME}/forge/projects，
   * 对齐主提案产物树「以 slug 为单位管理运行产物」）：forge 事件日志链装配门——
   * 在场（非空白）= bus→sink→监听器三件装配 + logs/{slug}.jsonl 落盘启用；
   * 缺席（单装缺省形态）= 整链零装配，行为零变化。容器目录 = lib-path
   * deriveTaskStoreDir 单源派生（{tasksHome}/{flatten}@{hash8}——插件不复制派生算法）。
   */
  readonly tasksHome?: string;
  /**
   * 专家档案取用面（bug 044a310c——worker persona 专家人格段缺席判例）：claim 期经
   * resolveExpertProfile(taskType, expertKey) 取档案合成人格段「你是<title>」；缺席 =
   * persona 仅程序段形态兼容（service.ts 同语义注记）。装配单源 = faces.createExpertProfileResolver
   * （tool-family.ts resolveWorkerProfile 同源——同一 resolver 两链消费：工具白名单链
   * 早已接线，persona 链此前漏接）。experts 服务缺席（单装无 expert-squad）= 不注入。
   */
  readonly resolveExpertProfile?: TasksVerbDeps["resolveExpertProfile"];
  /**
   * worker 任务目录锚点节渲染（claim 期 persona 尾部追加——spec/docs 路径锚，S2a）。
   * 缺席 = persona 零追加。单源 = lib-path deriveTaskStoreDir + taskDocRelPath。
   */
  readonly resolveWorkerContext?: TasksVerbDeps["resolveWorkerContext"];
}

type AssemblyDiag = (line: string, level?: DiagLevel) => void;

/** 任务域写后事件发射器（装配单例——写动词闭包尾部 emitTasksChanged；订阅面留给 events sink/UI follow）。 */
export function createTaskEvents(): TaskEvents & { onTasksChanged(listener: (projectKey: string) => void): () => void } {
  const listeners = new Set<(projectKey: string) => void>();
  return {
    emitTasksChanged(projectKey: string): void {
      for (const listener of listeners) {
        try {
          listener(projectKey);
        } catch {
          // 订阅方异常隔离（events/bus.ts 同纪律）——发射永不拖垮写动词闭包
        }
      }
    },
    onTasksChanged(listener: (projectKey: string) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** 单装缺省装配产物（两域服务常驻 + 库句柄生命周期）。 */
export interface TaskLoopAssembly {
  readonly db: DomainDb;
  readonly tasks: TasksService;
  readonly checkpoints: CheckpointsService;
  readonly events: ReturnType<typeof createTaskEvents>;
  /**
   * projectKey → 项目工作区根（装配期定稿的 resolveWsPath——config 注入或空串缺省）。
   * 暴露给装配面：recurrence faces 的卷宗探测（T3 建模报告在场判定）需要项目根解析，
   * 与 git 查找同源同值。
   */
  readonly resolveWsPath: (projectKey: string) => string;
  /**
   * forge 事件发射器（bug a93c1277——tasksHome 注入时装配，emit 直通 bus；监听器唯一写者
   * 落盘 logs/{slug}.jsonl）。缺席 = 事件链零装配（单装缺省形态，行为零变化）。
   */
  readonly forgeEvents?: ForgeEventSink;
  /**
   * projectKey → 容器库目录（bug a93c1277——循环启动时点直记 sink 记忆的解析缝：
   * 循环径不经 tool 执行点，prepare 的 cwd 缝不可达）。与 forgeEvents 同门装配/缺席。
   */
  readonly containerDirOf?: (projectKey: string) => string;
  /** 启动对账（reconcileInterrupted 全域——fail-soft 降级不阻载，诊断留痕）。 */
  readonly reconcile: () => Promise<void>;
  /** 库句柄关闭（插件 disposer 透传）。 */
  readonly dispose: () => void;
}

/**
 * 单装缺省装配（index.ts 装配本体单点）：db 打开 + 两域服务常驻构建 + 启动对账接线。
 * home 缺席（DSH_HOME 未设且无 config.home）或 db 打开失败 → undefined（零 provide 降级）。
 */
export function assembleTaskLoopServices(config: TaskLoopAssemblyConfig = {}, diag?: AssemblyDiag): TaskLoopAssembly | undefined {
  const home = resolveTaskLoopHome(config);
  if (home === undefined) {
    diag?.("[task-loop] 缺省装配缺席：home 未注入（config.home / env DSH_HOME 双缺）——域服务零 provide（降级不阻载）", "warn");
    return undefined;
  }
  let db: DomainDb;
  try {
    db = openDomainDb(home, config.dbFile !== undefined ? { file: config.dbFile } : {});
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    diag?.(`[task-loop] task-loop.db 打开失败——域服务降级缺席（fail-soft 不阻载）：${message}`, "error");
    return undefined;
  }
  const events = createTaskEvents();
  const resolveWsPath = config.resolveWsPath ?? ((): string => "");
  const tasks = createTasksService({
    db: db.db,
    events,
    resolveWsPath,
    ...(config.resolveExpertProfile !== undefined ? { resolveExpertProfile: config.resolveExpertProfile } : {}),
    ...(config.resolveWorkerContext !== undefined ? { resolveWorkerContext: config.resolveWorkerContext } : {}),
  });
  const checkpoints = createCheckpointsService({ db: db.db, events });
  // forge 事件日志链（bug a93c1277——AC「组合器 config 下发 tasksHome 即落盘闭环」）：
  // tasksHome 在场（非空白）= bus→sink→监听器三件装配单例；缺席 = 整链零装配零行为变化。
  const tasksHome = typeof config.tasksHome === "string" && config.tasksHome.trim() !== "" ? config.tasksHome : undefined;
  let forgeEvents: ForgeEventSink | undefined;
  let containerDirOf: ((projectKey: string) => string) | undefined;
  let detachLogListener: (() => void) | undefined;
  if (tasksHome !== undefined) {
    const bus = createForgeEventBus();
    const sink = createForgeEventSink({
      bus,
      resolveDir: async (workspaceDir) => deriveTaskStoreDir(tasksHome, workspaceDir),
    });
    detachLogListener = attachForgeLogListener(bus, { resolveContainerDir: (event) => sink.dirOf(event.sessionId) });
    forgeEvents = sink;
    // projectKey = deriveDirName(ws) 同名制（db/repositories/project-key 单源）——容器目录
    // = {tasksHome}/{projectKey}（lib-path joinHome 同口径：连接符随 home 拼写）。
    containerDirOf = (projectKey) => {
      const home2 = tasksHome.replace(/[\\/]+$/, "");
      const sep = tasksHome.includes("\\") ? "\\" : "/";
      return `${home2}${sep}${projectKey}`;
    };
    diag?.("[task-loop] forge 事件日志链装配（tasksHome 注入）——logs/{slug}.jsonl 落盘启用", "info");
  }
  return {
    db,
    tasks,
    checkpoints,
    events,
    resolveWsPath,
    ...(forgeEvents !== undefined ? { forgeEvents } : {}),
    ...(containerDirOf !== undefined ? { containerDirOf } : {}),
    async reconcile(): Promise<void> {
      // 启动对账（装配时点进程内循环登记表恒空 = registryEmpty true）——全域键逐容器收敛
      // in_progress ∧ loop_sourced 中断态；失败 = 降级 warn 留痕（AGENTS §7 不静默）。
      for (const projectKey of listDistinctProjectKeys(db.db)) {
        const result = await tasks.reconcileInterrupted({ projectKey, registryEmpty: true });
        if (result.reconciled.length > 0) {
          diag?.(`[task-loop] 启动对账：project ${projectKey} 收敛 ${result.reconciled.length} 条中断任务`, "info");
        }
      }
    },
    dispose(): void {
      detachLogListener?.();
      db.db.close();
    },
  };
}

/** 任务目录缺省约定单源：显式 config.home > env DSH_HOME（project 实况同径；双缺 = undefined）。 */
export function resolveTaskLoopHome(config: Pick<TaskLoopAssemblyConfig, "home">): string | undefined {
  return config.home ?? process.env.DSH_HOME;
}
