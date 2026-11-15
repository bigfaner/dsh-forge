// host/assembly · default-assembly.ts —— 单装缺省装配（零组合器 config 自足）：
//   ① db 缺省路径：{home}/forge/db/task-loop/task-loop.db（openDomainDb/domainDbFileName 单源）；
//   ② 服务常驻 provider：db 打开即装配 forgeTasks/forgeCheckpoints 两域服务（无缝门控——
//      常驻形态，宿主集成态同源消费）；
//   ③ 任务目录缺省约定：home 缺省 = env DSH_HOME（project 插件实况同径；显式 config.home 覆写）。
// home 缺席 / db 打开失败 = 整体降级缺席（返回 undefined——零 provide，fail-soft 诊断留痕不阻载）。
import { domainDbFileName, openDomainDb, type DomainDb } from "../db/connection.js";
import { createCheckpointsService, type CheckpointsService } from "../domain/checkpoints/service.js";
import { listDistinctProjectKeys } from "../domain/tasks/query.js";
import { createTasksService, type TasksService } from "../domain/tasks/service.js";
import type { DiagLevel } from "@dsh-forge/lib-diag";
import type { TaskEvents } from "../domain/tasks/types.js";

export { domainDbFileName };

/** 单装装配 config（全可选——缺省面 = DSH_HOME + 缺省 db 落点 + git 查找降级）。 */
export interface TaskLoopAssemblyConfig {
  /** DSH home（db 缺省落点根；缺席 = env DSH_HOME，双缺 = 降级缺席） */
  readonly home?: string;
  /** 库文件覆盖（':memory:' 供测试；缺省 = {home}/forge/db/task-loop/task-loop.db） */
  readonly dbFile?: string;
  /** projectKey → 项目检出根（taskDetail git 只读查找 cwd；缺席 = 空串降级——actualFiles 走 payload files 面） */
  readonly resolveWsPath?: (projectKey: string) => string;
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
  const tasks = createTasksService({
    db: db.db,
    events,
    resolveWsPath: config.resolveWsPath ?? ((): string => ""),
  });
  const checkpoints = createCheckpointsService({ db: db.db, events });
  return {
    db,
    tasks,
    checkpoints,
    events,
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
      db.db.close();
    },
  };
}

/** 任务目录缺省约定单源：显式 config.home > env DSH_HOME（project 实况同径；双缺 = undefined）。 */
export function resolveTaskLoopHome(config: Pick<TaskLoopAssemblyConfig, "home">): string | undefined {
  return config.home ?? process.env.DSH_HOME;
}
