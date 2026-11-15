// host/assembly · tool-family.ts —— 单装工具族装配（bug a033636f——fix-8）：
// 任务域 14 员工具定义组装 + 循环内核（driver/registry/narrator/spawn/triage）单装接线。
// 定位 = 装配缝合零域逻辑：工具薄封装消费本插件两域服务（tasks/checkpoints）；循环内核
// 依赖按 AGENTS 1.6 可选消费现查（agents 注册表缺席 = 叙述通道 no-op 降级，循环正确性
// 只依赖宿主事件）。返回注册清单 + 循环卸载收口（driver.dispose——活循环同步终态注销）。
import { deriveProjectKey } from "../db/repositories/project-key.js";
import type { TaskLoopAssembly } from "./default-assembly.js";
import { createLoopDriver } from "../loop/driver.js";
import type { LoopDriver } from "../loop/driver-face.js";
import { createLoopRegistry, type LoopRegistry } from "../loop/registry.js";
import { createNarrator } from "../notify/narrator.js";
import { createInProcessDriverSpawn } from "../spawn/in-process-driver.js";
import { defaultWorkerTreeGuard } from "../spawn/job-tree.js";
import { createTriageHook } from "../triage/triage.js";
import {
  adaptAgentNarrationChannel,
  createDiagEmitter,
  emitForgeDiag,
  type AgentLookupFace,
  type ForgeDiagEmitFace,
  type ToolExecFace,
} from "../faces.js";
import { WorkspaceNotRegisteredError, sessionContextOf } from "../tools/session.js";
import type { TaskToolDefinition, TaskToolExecFace } from "../tools/faces.js";
import { createAddTaskTool } from "../tools/add-task.js";
import { createBatchAddTasksTool } from "../tools/batch-add-tasks.js";
import { createDispatchTaskTool } from "../tools/dispatch-task.js";
import { createListTasksTool } from "../tools/list-tasks.js";
import { createPauseTaskTool } from "../tools/pause-task.js";
import { createQueryTaskTool } from "../tools/query-task.js";
import { createStopTaskLoopTool } from "../tools/stop-task-loop.js";
import { createSubmitTaskTool } from "../tools/submit-task.js";
import { createTaskStatsTool } from "../tools/task-stats.js";
import { createUnblockTaskTool } from "../tools/unblock-task.js";
import { createUpdateTaskTool } from "../tools/update-task.js";
import {
  createListImplCheckpointsTool,
  createQueryImplCheckpointTool,
  createRecordImplCheckpointTool,
} from "../tools/impl-checkpoint.js";

/** 装配入参（域服务装配产物 + 插件 ctx 结构化消费面 + 诊断线） */
export interface ToolFamilyAssemblyInput {
  readonly services: TaskLoopAssembly;
  readonly ctx: unknown;
  readonly diag: (line: string, level?: "info" | "warn" | "error") => void;
}

/** 装配产物：注册清单（官方 tools 缝逐枚注册）+ 循环内核卸载收口 */
export interface ToolFamilyAssembly {
  readonly tools: readonly TaskToolDefinition[];
  /** 循环内核卸载收口（driver.dispose——活循环同步终态注销；插件 disposer 组成员） */
  readonly disposeLoop: () => void;
}

/** agents 注册表现查（AGENTS 1.6——调用期求值不缓存；缺席/劣形/抛错 = undefined） */
function agentsRegistryOf(ctx: unknown): AgentLookupFace | undefined {
  try {
    const viaReflect = (ctx as { reflect?: { get?(name: string): unknown } }).reflect?.get?.("agents") as
      | AgentLookupFace
      | undefined;
    return viaReflect !== undefined && typeof viaReflect.get === "function" ? viaReflect : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 单装工具族装配：14 员工具定义 + 循环内核（driver/registry/narrator/spawn/triage）单装接线。
 * projectKey 路由 = exec 会话 cwd → deriveProjectKey 本地派生（db 单源——cwd 缺席 =
 * WorkspaceNotRegisteredError typed 拒绝）。
 */
export function assembleTaskLoopToolFamily(input: ToolFamilyAssemblyInput): ToolFamilyAssembly {
  const { services } = input;
  const diagEmit: ForgeDiagEmitFace | undefined = createDiagEmitter(
    (input.ctx as { emit?: (event: string, payload: Record<string, unknown>) => void }).emit,
  );

  // ── projectKey 路由缝（cwd → 本地派生；缺席 = typed 拒绝自解释）──
  const resolveProjectKey = (exec: TaskToolExecFace): string => {
    const session = sessionContextOf(exec as ToolExecFace);
    if (session.cwd === undefined) throw new WorkspaceNotRegisteredError({});
    return deriveProjectKey(session.cwd);
  };

  const verbDeps = { db: services.db.db, events: services.events };

  // ── 循环内核单装接线（registry 单例 + in-process spawn 真绑定 + 叙述通道降级形）──
  const registry: LoopRegistry = createLoopRegistry();
  const agents = agentsRegistryOf(input.ctx);
  const narrationChannel = agents !== undefined ? adaptAgentNarrationChannel(agents, undefined, diagEmit) : { send: async () => {} };
  const spawn = createInProcessDriverSpawn({
    treeGuard: () => defaultWorkerTreeGuard(),
    ...(diagEmit !== undefined ? { diag: diagEmit } : {}),
  });
  const narrator = createNarrator({ channel: narrationChannel });
  const triage = createTriageHook({ tasks: services.tasks, spawn, ...(diagEmit !== undefined ? { diag: diagEmit } : {}) });
  const driver: LoopDriver = createLoopDriver({
    registry,
    tasks: services.tasks,
    spawn,
    narrator,
    checkpoints: services.checkpoints,
    triage,
    ...(diagEmit !== undefined ? { diag: diagEmit } : {}),
  });

  // ── 工具族 14 员（10 任务动词 + batch_add_tasks + impl_checkpoint 三员 + dispatch/stop）──
  const loop = { driver, registry };
  const tools: readonly TaskToolDefinition[] = [
    createAddTaskTool({ verbDeps, resolveProjectKey }),
    createBatchAddTasksTool({ tasks: services.tasks, resolveProjectKey }),
    createSubmitTaskTool({ verbDeps, resolveProjectKey }),
    createQueryTaskTool({ verbDeps, resolveProjectKey }),
    createUpdateTaskTool({ verbDeps, resolveProjectKey }),
    createListTasksTool({ verbDeps, resolveProjectKey }),
    createTaskStatsTool({ verbDeps, resolveProjectKey }),
    createPauseTaskTool({ verbDeps, resolveProjectKey }),
    createUnblockTaskTool({ verbDeps, resolveProjectKey }),
    createDispatchTaskTool({ verbDeps, resolveProjectKey, loop }),
    createStopTaskLoopTool({ loop }),
    createRecordImplCheckpointTool({ checkpoints: services.checkpoints, tasks: services.tasks, resolveProjectKey }),
    createQueryImplCheckpointTool({ checkpoints: services.checkpoints, tasks: services.tasks, resolveProjectKey }),
    createListImplCheckpointsTool({ checkpoints: services.checkpoints, tasks: services.tasks, resolveProjectKey }),
  ];
  emitForgeDiag(diagEmit, {
    level: "info",
    event: "task-loop-tools",
    message: `单装工具族装配完成：${String(tools.length)} 员（10 任务动词 + batch_add_tasks + impl_checkpoint 三员 + dispatch/stop）`,
  });
  return { tools, disposeLoop: () => driver.dispose() };
}
