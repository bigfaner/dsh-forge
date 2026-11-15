// @dsh-forge/task-loop —— host 装配入口（包骨架阶段——域代码随迁移任务逐批落位）。
// 定位（骨架期）：本文件只做装载面与 bundle 管线验证锚——
//   ① loader 装载面：default 导出 Plugin.Function（cordis loader 只认 default 导出函数，
//     组合层 cordis.patch.yml 单行 insert 挂载）；
//   ② bundle 管线验证锚：消费 @dsh-forge/lib-* devDependencies（scripts/bundle-host.mjs
//     构建期内联进 dist——产物自含，dist 零 @dsh-forge/lib-* 裸 import），
//     self-containment 断言据此外置/内联两侧验证。
//   域装配（forgeTasks/forgeCheckpoints provider、工具族/skill/loop 调度注册）随迁移批
//   落位——骨架期零服务属性消费，inject 名单先行落位 webServer（proposal 硬判据）。
import { errMessage } from "@dsh-forge/lib-util";
import { consoleDiagFallback, type DiagLevel } from "@dsh-forge/lib-diag";
import { FORGE_CHECKPOINTS_SERVICE_KEY, FORGE_TASKS_SERVICE_KEY } from "../shared/contract-constants.js";
import {
  registerForgeTasksRemote,
  type ForgeTasksRemoteDeps,
  type TypertAssemblyCtxFace,
} from "./assembly/typert-remotes.js";
import type { TasksService } from "./domain/tasks/service.js";

/** host 装配 config（全部可选——域面随迁移批逐批扩）。 */
export interface TaskLoopHostConfig {
  /** 诊断缝（缺省 console 按级分流兜底——diag-emit 纪律 console 豁免面同插件先例）。 */
  readonly diag?: (line: string, level?: DiagLevel) => void;
}

/** cordis 插件装载形态（loader 只认 default 导出函数）。 */
interface TaskLoopPlugin {
  (ctx: unknown, config?: TaskLoopHostConfig): () => void;
  inject: readonly string[];
}

/**
 * forgeTasks 域服务惰性现查缝（AGENTS 1.6——检测永不缓存，每个消费点调用期求值）：
 * reflect.get 具名服务防退役读取；缺席/抛错 = undefined（namespace 诚实降级 404 语义）。
 */
function lazyTasksFace(ctx: unknown): () => TasksService | undefined {
  return () => {
    try {
      const face = ctx as { reflect?: { get(name: string): unknown } };
      const svc = face.reflect?.get(FORGE_TASKS_SERVICE_KEY);
      return (svc ?? undefined) as TasksService | undefined;
    } catch {
      return undefined;
    }
  };
}

const taskLoopPlugin: TaskLoopPlugin = (ctx: unknown, config: TaskLoopHostConfig = {}): (() => void) => {
  const diag = config.diag ?? consoleDiagFallback;
  diag(
    `[task-loop] host 装配（骨架）：服务键 pin [${FORGE_TASKS_SERVICE_KEY}, ${FORGE_CHECKPOINTS_SERVICE_KEY}]——域 provider 随迁移批落位`,
    "info",
  );
  // forgeTasks Typert Remote 正典通路（官方 Typert Remote namespace——根 ctx plugin 注册，
  // gateway SRC 发现面；装配/降级留痕走 config.diag 注入面，禁直落 console 新增站点）。
  const remoteDeps: ForgeTasksRemoteDeps = {
    tasks: lazyTasksFace(ctx),
    diag: (line) => diag(line, "info"),
  };
  registerForgeTasksRemote(ctx as TypertAssemblyCtxFace, remoteDeps);
  // 骨架期零自持资源——dispose 面空实现（域面落位后随批扩）。
  return () => {};
};

/** 装配失败诊断投影（bundle 管线验证锚——lib-util errMessage 消费点）。 */
export function describeSetupFailure(error: unknown): string {
  return errMessage(error);
}

// inject 名单（proposal 硬判据：装配行 inject 名单显式含 webServer——目标宿主必带；
// 名单缺席 = ctx 属性访问被 cordis inject 门拒恒 undefined，fix-8 判例。骨架期零属性
// 消费，名单先行落位——域装配随迁移批消费该 face）。
taskLoopPlugin.inject = ["webServer"] as const;

export default taskLoopPlugin;
