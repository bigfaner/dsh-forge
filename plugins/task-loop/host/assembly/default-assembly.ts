// host/assembly · default-assembly.ts —— 单装缺省装配（零组合器 config 自足）：
//   ① db 缺省路径：{home}/forge/db/task-loop/task-loop.db（openDomainDb/domainDbFileName 单源）；
//   ② 服务常驻 provider：db 打开即装配 forgeTasks/forgeCheckpoints 两域服务（无缝门控——
//      常驻形态，宿主集成态同源消费）；
//   ③ 任务目录缺省约定：home 缺省 = env DSH_HOME（project 插件实况同径；显式 config.home 覆写）；
//   ④ forge 事件日志链（bug a93c1277——logs/{slug}.jsonl 派发运营日志落盘）：tasksHome 注入
//      （组合器 patch config 下发 {DSH_HOME}/forge/projects）时装配 bus→sink→监听器三件；
//      缺席（单装缺省形态）= 整链零装配零行为变化（AC4 回归锚）。
// home 缺席 / db 打开失败 = 整体降级缺席（返回 undefined——零 provide，fail-soft 诊断留痕不阻载）。
import { mkdirSync } from "node:fs";
import {
  FORGE_BASE_DIR_ENTRIES,
  dirKeyEntryShapeError,
  forgeDirOfWorkspace,
  resolveForgeDirs,
  resolveProjectKey,
  type ForgeDirDeclaration,
} from "@dsh-forge/lib-path";
import { domainDbFileName, openDomainDb, type DomainDb } from "../db/connection.js";
import { createCheckpointsService, type CheckpointsService } from "../domain/checkpoints/service.js";
import { listDistinctProjectKeys } from "../domain/tasks/query.js";
import { renderWorkerContext } from "../domain/tasks/worker-context.js";
import { taskLogsDirOf } from "../domain/tasks/task-logs-dir.js";
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
   * projectKey → 项目工作区根（异步缝——bug 9b3c9a9b 生产装配接线：host/index.ts 接
   * forge.projects 面 getProject().wsPath，项目未注册/面缺席 = undefined）。在场即优先于
   * 同步 resolveWsPath 消费（worker 锚点节 forgeDir 派生 + 结算回收钩子 getProject）；
   * 缺席 = 同步缝形态兼容不变。
   */
  readonly resolveWsPathAsync?: (projectKey: string) => Promise<string | undefined>;
  /**
   * 任务目录派生根（bug a93c1277——组合器 patch config 下发 {DSH_HOME}/forge/projects，
    * 对齐主提案产物树「以 slug 为单位管理运行产物」）：forge 事件日志链装配门——
    * 在场（非空白）= bus→sink→监听器三件装配 + logs/{slug}.jsonl 落盘启用；
    * 缺席（单装缺省形态）= 整链零装配，行为零变化。容器目录 = forge-dirs-unification §2.6
    * 单源派生：{tasksHome}/{projectKey}——projectKey 由 lib/path resolveProjectKey 按主检出
    * 归拢（与注册表 forge.task_runtime_dir 对同一注入事实解析出同一路径，插件不复制派生算法）。
    */
  readonly tasksHome?: string;
  /**
   * resolveProjectKey 注册表查询缝（cwd → 该项目主工作区行；缺席 = git 现查归拢——
   * lib/path 单源兜底）。生产接线归 project 插件项目注册表，task-loop 零依赖声明不 import。
   */
  readonly registryQuery?: (cwd: string) => string | undefined;
  /**
   * 宿主反射面取用缝（dirKeys.* 目录声明反射拉缝——worker 规格目录经注册表 forge.spec_dir
   * 解析，forge-dirs-unification §2.3；缺席/劣形 = 锚点节规格段降级省略，其余锚不变）。
   */
  readonly reflectOf?: () => unknown;
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

/**
 * 规格目录注册表解析缝（forge-dirs-unification §2.3——task-loop 不再自行拼接规格路径）：
 * dirKeys.* 反射拉缝（枚举宿主 reflect props 约定名现取第三方声明，在场性每消费点现查、
 * 零缓存——AGENTS 1.6）+ lib/path 本体十条合并 → resolveForgeDirs 按 forge.spec_dir 解析。
 * 反射缺席/声明拉取失败/解析报错（缺依赖/撞名等）= undefined——锚点节规格段降级省略，
 * 其余锚不变（fail-soft 不阻载）。逐条形状校验 = lib/path dirKeyEntryShapeError 单源
 *（与 project 侧同一套——bug 32532117）：坏形状跳过 + warn 诊断，forge.* 保留名拒绝。
 * 声明按声明方逐条收集（bug fb3777a4——不并入单一对象静默后到者胜），撞名由注册表报错
 * 点名两方 + warn 诊断降级。
 */
function resolveSpecDirViaRegistry(input: {
  readonly reflectOf?: () => unknown;
  readonly dshHome: string;
  readonly workspaceRoot: string;
  readonly slug: string;
  readonly diag?: AssemblyDiag;
}): string | undefined {
  const declarations: ForgeDirDeclaration[] = [];
  try {
    const reflect = input.reflectOf?.() as
      | { props?: Record<string, unknown>; get?(name: string): unknown }
      | undefined;
    if (reflect?.props !== undefined) {
      for (const name of Object.keys(reflect.props)) {
        if (!name.startsWith("dirKeys.")) continue;
        try {
          const declaration = typeof reflect.get === "function" ? reflect.get(name) : reflect.props[name];
          if (typeof declaration === "object" && declaration !== null) {
            // 形状校验与 project 侧同源单份（lib/path dirKeyEntryShapeError——bug 32532117）：
            // 坏形状跳过 + warn 诊断；forge.* 保留名拒绝（本体权威 = lib-path）
            const entries: Record<string, unknown> = {};
            for (const [key, entry] of Object.entries(declaration as Record<string, unknown>)) {
              const shapeError = dirKeyEntryShapeError(key, entry);
              if (shapeError !== undefined) {
                input.diag?.(`[task-loop] dirKeys 声明降级：${name} 条目 malformed 跳过（${shapeError}）`, "warn");
                continue;
              }
              entries[key] = entry;
            }
            // 按声明方保留来源（对齐 project 侧 anchors.ts——bug fb3777a4）：不并入单一对象
            // 静默后到者胜；撞名由 resolveForgeDirs 注册表报错点名两个声明方（下方 catch warn）
            if (Object.keys(entries).length > 0) declarations.push({ source: name, entries });
            else {
              // 对齐 project 侧 anchors.ts：零产出约定名留痕，不静默跳过（bug 24954442 顺带）
              input.diag?.(`[task-loop] dirKeys 声明零产出：${name} 无一条可用条目（取值非对象/malformed/保留名）`, "warn");
            }
          }
        } catch {
          // 单声明拉取失败 = 跳过该声明方（声明缺席留痕语义，不炸锚点节）
        }
      }
    }
    let resolved: Record<string, string>;
    try {
      resolved = resolveForgeDirs(
        [{ source: "forge.base", entries: FORGE_BASE_DIR_ENTRIES }, ...declarations],
        // forge.spec_dir 依赖链只触及 workspaceRoot；dshHome/projectRoot
        // 为本体条目的依赖完备性补齐（projectRoot 与 workspaceRoot 同源——规格目录不依赖归拢）。
        { dshHome: input.dshHome, projectRoot: input.workspaceRoot, workspaceRoot: input.workspaceRoot },
        { slug: input.slug },
      );
    } catch (cause) {
      // 撞名/成环/缺依赖报错不静默（bug fb3777a4——撞名消息点名两个声明方，Spec §2.2 同口径）
      const message = cause instanceof Error ? cause.message : String(cause);
      input.diag?.(`[task-loop] dirKeys 声明解析降级：${message}`, "warn");
      return undefined;
    }
    return resolved["forge.spec_dir"];
  } catch (cause) {
    // 外层拉取缝异常不静默（对齐 project 侧——诊断留痕后降级）
    const message = cause instanceof Error ? cause.message : String(cause);
    input.diag?.(`[task-loop] dirKeys 声明拉取缝异常降级：${message}`, "warn");
    return undefined;
  }
}

/**
 * worker 任务目录锚点节缺省真身（bug 26dff330——供给端收口）：此前 resolveWorkerContext
 * 从未在生产装配注入，worker 简报恒无任务目录锚点段、{forge.task_logs_dir} 占位符无值，
 * worker 自行猜测落点（<ws>/.forge/task-logs/ 等漂移拼写）→ 回收钩子恒 runtime dir absent。
 * 缺省真身 = containerDirOf 单源容器目录 → taskLogsDirOf 派生任务日志目录（与回收钩子
 * taskLogsDir 注入、forgeResolvePath(taskLogs) 同源三口径）+ 开工前 mkdirRecursive（fail-soft
 * warn 留痕——目录在场，worker 不自建）+ renderWorkerContext 锚点节。规格目录 = 注册表
 * forge.spec_dir 解析（resolveSpecDirViaRegistry——§2.3，不再自行拼接）。config.resolveWorkerContext
 * 显式注入时优先（组合器覆写单装缺省）。tasksHome 缺席（containerDirOf 缺席）= undefined，
 * persona 零追加形态兼容不变。
 */
export function createDefaultResolveWorkerContext(deps: {
  readonly containerDirOf: (projectKey: string) => string;
  readonly resolveWsPath: (projectKey: string) => string;
  readonly resolveWsPathAsync?: (projectKey: string) => Promise<string | undefined>;
  readonly reflectOf?: () => unknown;
  readonly dshHome?: string;
  readonly diag?: AssemblyDiag;
}): NonNullable<TasksVerbDeps["resolveWorkerContext"]> {
  return async (projectKey, source, localId) => {
    const containerDir = deps.containerDirOf(projectKey);
    const taskLogsDir = taskLogsDirOf(containerDir, source.slug, localId);
    try {
      mkdirSync(taskLogsDir, { recursive: true });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      deps.diag?.(`[task-loop] 任务日志目录创建失败（fail-soft 不阻载）：${taskLogsDir}——${message}`, "warn");
    }
    // ws 根解析：异步缝在场即优先（生产 forge.projects 接线——bug 9b3c9a9b），缺席退同步缝
    const ws = deps.resolveWsPathAsync !== undefined ? ((await deps.resolveWsPathAsync(projectKey)) ?? "") : deps.resolveWsPath(projectKey);
    const specDir =
      ws === ""
        ? undefined
        : resolveSpecDirViaRegistry({
            reflectOf: deps.reflectOf,
            dshHome: deps.dshHome ?? "",
            workspaceRoot: ws,
            slug: source.slug,
            ...(deps.diag !== undefined ? { diag: deps.diag } : {}),
          });
    return renderWorkerContext({
      forgeDir: ws === "" ? "" : forgeDirOfWorkspace(ws),
      containerDir,
      localId,
      source,
      ...(specDir !== undefined ? { specDir } : {}),
    });
  };
}

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
  /** projectKey → 项目工作区根（异步缝——bug 9b3c9a9b 生产接线；缺席 = 未接线形态）。 */
  readonly resolveWsPathAsync?: (projectKey: string) => Promise<string | undefined>;
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
  /**
   * 会话 cwd → 主检出归拢 projectKey（forge-dirs-unification §2.6——projectKeyOfCwd 单源：
   * 事件链 sink.resolveDir 与结算回收钩子 deriveTaskStoreDir 共消费同一归拢取法——bug
   * 245bacf3：钩子不得绕开归拢直派 worktree 键。会话目录缺席 = fail-loud 拒解析）。
   */
  readonly projectKeyOfCwd: (workspaceDir: string) => string;
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
  // forge 事件日志链（bug a93c1277——AC「组合器 config 下发 tasksHome 即落盘闭环」）：
  // tasksHome 在场（非空白）= bus→sink→监听器三件装配单例；缺席 = 整链零装配零行为变化。
  const tasksHome = typeof config.tasksHome === "string" && config.tasksHome.trim() !== "" ? config.tasksHome : undefined;
  // projectKey = lib/path resolveProjectKey 派生（forge-dirs-unification §2.6 单源）——容器
  // 目录 = {tasksHome}/{projectKey}，与注册表 forge.task_runtime_dir（join(project_runtime_dir,
  // deriveDirName(主检出))）对同一注入事实解析出同一路径；任务行归属键同名制。
  // （bug 26dff330：提前定稿——worker 锚点节缺省真身与事件链同消费。）
  const containerDirDefaultOf =
    tasksHome !== undefined
      ? (projectKey: string): string => {
          const home2 = tasksHome.replace(/[\\/]+$/, "");
          const sep = tasksHome.includes("\\") ? "\\" : "/";
          return `${home2}${sep}${projectKey}`;
        }
      : undefined;
  // 主检出归拢缝（§2.6）：cwd → resolveProjectKey 归拢主检出后派生 projectKey；会话目录
  // 缺席 = fail-loud 拒解析（不静默——错误说明缺少项目主检出）。
  const projectKeyOfCwd = (workspaceDir: string): string => {
    if (workspaceDir.trim() === "") {
      throw new Error("forge.task_runtime_dir 拒绝解析：会话目录缺席——缺少项目主检出，无法派生归属键");
    }
    return resolveProjectKey(workspaceDir, { registryQuery: config.registryQuery ?? (() => undefined) }).key;
  };
  const tasks = createTasksService({
    db: db.db,
    events,
    resolveWsPath,
    ...(config.resolveExpertProfile !== undefined ? { resolveExpertProfile: config.resolveExpertProfile } : {}),
    // worker 任务目录锚点节（bug 26dff330——缺省真身接线；显式注入优先）
    ...(config.resolveWorkerContext !== undefined
      ? { resolveWorkerContext: config.resolveWorkerContext }
      : containerDirDefaultOf !== undefined
        ? {
            resolveWorkerContext: createDefaultResolveWorkerContext({
              containerDirOf: containerDirDefaultOf,
              resolveWsPath,
              ...(config.resolveWsPathAsync !== undefined ? { resolveWsPathAsync: config.resolveWsPathAsync } : {}),
              ...(config.reflectOf !== undefined ? { reflectOf: config.reflectOf } : {}),
              dshHome: home,
              diag,
            }),
          }
        : {}),
  });
  const checkpoints = createCheckpointsService({ db: db.db, events });
  let forgeEvents: ForgeEventSink | undefined;
  let detachLogListener: (() => void) | undefined;
  if (tasksHome !== undefined && containerDirDefaultOf !== undefined) {
    const bus = createForgeEventBus();
    const sink = createForgeEventSink({
      bus,
      // 会话 cwd → 主检出归拢键 → 容器目录（§2.6——与 containerDirOf、注册表
      // forge.task_runtime_dir 同一 projectKey 派生；解析异常 = fail-soft 不记忆，
      // 会话目录缺席的 fail-loud 由 projectKeyOfCwd 上抛、sink.prepare 直通）。
      resolveDir: async (workspaceDir) => containerDirDefaultOf!(projectKeyOfCwd(workspaceDir)),
    });
    detachLogListener = attachForgeLogListener(bus, { resolveContainerDir: (event) => sink.dirOf(event.sessionId) });
    forgeEvents = sink;
    diag?.("[task-loop] forge 事件日志链装配（tasksHome 注入）——logs/{slug}.jsonl 落盘启用", "info");
  }
  return {
    db,
    tasks,
    checkpoints,
    events,
    resolveWsPath,
    ...(config.resolveWsPathAsync !== undefined ? { resolveWsPathAsync: config.resolveWsPathAsync } : {}),
    ...(forgeEvents !== undefined ? { forgeEvents } : {}),
    ...(containerDirDefaultOf !== undefined ? { containerDirOf: containerDirDefaultOf } : {}),
    projectKeyOfCwd,
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
