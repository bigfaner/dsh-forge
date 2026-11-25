// host/assembly · tool-family.ts —— 单装工具族装配（bug a033636f——fix-8）：
// 任务域 14 员工具定义组装 + 循环内核（driver/registry/narrator/spawn/triage）单装接线。
// 定位 = 装配缝合零域逻辑：工具薄封装消费本插件两域服务（tasks/checkpoints）；循环内核
// 依赖按 AGENTS 1.6 可选消费现查（agents 注册表缺席 = 叙述通道 no-op 降级，循环正确性
// 只依赖宿主事件）。返回注册清单 + 循环卸载收口（driver.dispose——活循环同步终态注销）。
import { deriveProjectKeyRolledUpGit } from "./worktree-rollup.js";

/**
 * worktree 归拢主根推导（2026-11-24 用户裁决：git 命令现查，禁自造路径剥取规则——
 * f5 键族缝回退主根单键时任务 tab 空数据真因修口，诊断留痕 .forge/task-logs/）：
 * marker 段仅作触发条件，主根 = `git worktree list --porcelain` 现查首条目（worktree-rollup
 * 单源）。git 缺席/命令失败/cwd 不属清单 = fail-soft 回退 cwd 键 + 回退原因留痕（不静默）。
 * G-F3 收口门口径限定留痕：43f92e1b 收口门「porcelain spawn/parse 复本全仓 grep 零命中」
 * **限于归拢/清单面**（本模块与 spec/project 的归拢消费点，均走 lib-path/project-root
 * 单源）；plugins/project bugs service resolveFixEvidence 的内联 porcelain 解析为先在面、
 * 用途不同（fixed 证据 HEAD==hash 锚定反查，非键归拢/清单判定），不在该口径内、不收敛。
 */

import type { TaskLoopAssembly } from "./default-assembly.js";
import { createLoopDriver } from "../loop/driver.js";
import type { LoopDriver } from "../loop/driver-face.js";
import { createLoopRegistry, type LoopRegistry } from "../loop/registry.js";
import { createNarrator } from "../notify/narrator.js";
import { createInProcessDriverSpawn } from "../spawn/in-process-driver.js";
import { defaultWorkerTreeGuard } from "../spawn/job-tree.js";
import { createTriageHook } from "../triage/triage.js";
import { createRecurrenceFaces, type RecurrenceBugsFace } from "../dispatch-core/recurrence-faces.js";
import { forgeDirOfWorkspace, workspaceDocsRoot } from "@dsh-forge/lib-path";
import { join } from "node:path";
import { createSettleReportRecovery, type SettleReportRecoveryDeps } from "../dispatch-core/settle.js";
import { createUnionToolNamesProbe, type AgentPresetsFace, type ToolsSchemasReader } from "@dsh-forge/contracts";
import {
  adaptAgentNarrationChannel,
  createDiagEmitter,
  createExpertProfileResolver,
  emitForgeDiag,
  resolveWorkerProfile as resolveWorkerRouteProfile,
  type AgentLookupFace,
  type ExpertsServiceFace,
  type ForgeDiagEmitFace,
  type ToolExecFace,
  type WorkerRouteProfile,
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
  /**
   * AC7 结算报告回收钩子（bug a31b96a2 回归锚观测面）：tasksHome 注入形态下的生产回收缝
   * （specsIssuesDir/taskLogsDir 注入单源）。装配回归锚经真实结算核消费它断言落点；
   * tasksHome 缺席（单装缺省形态）= undefined。
   */
  readonly reportRecovery?: SettleReportRecoveryDeps;
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
 * experts 服务面现查缝（bug dc0f9de3——worker 路由档案取用源）：双通道防御读取——
 * ① ctx.experts 具名属性面（inject: ['experts'] 声明后的正门，plugin-forge 0b83e3aa 判例：
 * 跨 realm 顶层服务仅此通道可达）；② reflect.get('experts') 先例面（同 scope 拓扑命中）。
 * 注入名单未声明 / 服务晚到 / 劣形 / 抛错 = undefined（fail-soft——generic 兜底档，不阻载）。
 * AGENTS 1.6：检测永不缓存，每个派发消费点调用期求值。
 */
export function expertsFaceOf(ctx: unknown): ExpertsServiceFace | undefined {
  try {
    const viaInject = (ctx as { experts?: ExpertsServiceFace }).experts;
    if (viaInject !== undefined && typeof viaInject.get === "function") return viaInject;
  } catch {
    // inject 门拒（名单未声明环境）= 降级 reflect 通道
  }
  try {
    const viaReflect = (ctx as { reflect?: { get?(name: string): unknown } }).reflect?.get?.("experts") as
      | ExpertsServiceFace
      | undefined;
    if (viaReflect !== undefined && typeof viaReflect.get === "function") return viaReflect;
  } catch {
    // 反射通道异常 = 缺席
  }
  return undefined;
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

  // ── projectKey 路由缝（cwd → 本地派生；缺席 = typed 拒绝自解释）。
  //    worktree 归拢 git 现查版（2026-11-24 用户裁决：主根由 git worktree list --porcelain
  //    推导，注册缝与 git 推导双通道并集——缝缺席 ≠ 归拢失效）。归拢发生 = 诊断留痕
  //    （event: task-cwd-rollup）；fail-soft 回退 = warn 留痕（event: task-cwd-rollup-fallback）。
  const resolveProjectKey = (exec: TaskToolExecFace): string => {
    const session = sessionContextOf(exec as ToolExecFace);
    if (session.cwd === undefined) throw new WorkspaceNotRegisteredError({});
    const rollup = deriveProjectKeyRolledUpGit(session.cwd);
    if (rollup.rolledUp) {
      emitForgeDiag(diagEmit, {
        level: "info",
        event: "task-cwd-rollup",
        message: `worktree cwd 归拢主根键（git porcelain 现查）：cwd=${session.cwd} mainRoot=${rollup.mainRoot ?? ""}`,
      });
    } else if (rollup.fallbackReason !== undefined) {
      emitForgeDiag(diagEmit, {
        level: "warn",
        event: "task-cwd-rollup-fallback",
        message: `worktree 归拢 fail-soft 回退 cwd 键：cwd=${session.cwd}：${rollup.fallbackReason}`,
      });
    }
    return rollup.key;
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
  // 全局工具注册名探针（plugin-task-loop/1.18-a 判例）：官方 harness 的 parent/agent 形状
  // 无 ctx.tools 投影，parent 探针恒 undefined → toolFilter 未知名直落 restrict 拆一切
  // spawn。正典配方 = plugin-forge index 同径（bug a5b12254）：无参 schemas() 只是 global
  // 单层视图（官方工具全随 preset 装 preset scope 层）——必须接 contracts
  // createUnionToolNamesProbe（global ∪ 逐 preset acquireScope 租约内 scope 视图并集，
  // 含 read 金丝雀 → 可信求交）；agentPresets 经 ctx 具名属性 + reflect 双通道现查
  // （AGENTS 1.6 不缓存），缺席 fail-soft 降级 global 单层。worker/triage 两面共用。
  const hostCtx = input.ctx as {
    tools?: unknown;
    agentPresets?: AgentPresetsFace;
    reflect?: { get?(name: string): unknown };
  };
  const toolsSchemasReaderOf = (): ToolsSchemasReader => (scope?: object) => {
    const tools = hostCtx.tools as
      | { schemas?: (this: unknown, scope?: object) => readonly { name: string }[] | undefined }
      | undefined;
    return tools?.schemas?.call(hostCtx.tools, scope);
  };
  const agentPresetsOf = (): AgentPresetsFace | undefined => {
    try {
      const viaInject = hostCtx.agentPresets;
      if (viaInject !== undefined && typeof viaInject.list === "function" && typeof viaInject.acquireScope === "function") {
        return viaInject;
      }
    } catch {
      // 注入服务未就绪 = 降级到 reflect 通道
    }
    try {
      const viaReflect = hostCtx.reflect?.get?.("agentPresets") as AgentPresetsFace | undefined;
      if (viaReflect !== undefined && typeof viaReflect.list === "function" && typeof viaReflect.acquireScope === "function") {
        return viaReflect;
      }
    } catch {
      // reflect 通道异常 = 缺席
    }
    return undefined;
  };
  const globalToolNames = createUnionToolNamesProbe(toolsSchemasReaderOf(), agentPresetsOf);
  // worker 路由档案解析缝（bug dc0f9de3——装配分支对齐：生产装配此前零 resolveWorkerProfile
  // 注入，循环驱动器恒走 generic 兜底档 = allow keep-only 管线必备两员，worker 无档案 tools
  // （写/执行族全滤除，真机判例 fix-12 010-final-web a1）。现按 faces.resolveWorkerProfile
  // 单源配方接线：experts 面每次派发现查（AGENTS 1.6 不缓存）——在场 = expert 档（档案 tools
  // → allow 并集面）；缺席/劣形 = undefined（core 侧 generic 兜底档，行为零变化）。
  // settings/expert-squad refresh 屏障缺省不接（本插件零 settings 面——预设映射单源）。
  const resolveWorkerProfile = (taskType: string, expertKey?: string): Promise<WorkerRouteProfile | undefined> => {
    const experts = expertsFaceOf(input.ctx);
    if (experts === undefined) return Promise.resolve(undefined);
    const resolver = createExpertProfileResolver({
      experts,
      ...(diagEmit !== undefined ? { diag: diagEmit } : {}),
    });
    return resolveWorkerRouteProfile(
      { expertsOf: () => resolver, parentAgentOptions: () => undefined },
      taskType,
      expertKey,
    );
  };
  // bugs 域服务面现查（seams 键 'forge.bugs'——project 插件提供；本插件不依赖该包）。
  // 两个消费位同源：bugsPresent（四动词入 allow 的在场裁定）+ recurrenceFaces（T2/T3 两
  // face 的台账读面）。每次调用现查不缓存（AGENTS 1.6）；缺席/劣形 = undefined。
  const bugsFaceOf = (): RecurrenceBugsFace | undefined => {
    try {
      const hostCtx2 = input.ctx as { forgeBugs?: unknown; reflect?: { get?(name: string): unknown } };
      const bugs = (hostCtx2.forgeBugs ?? hostCtx2.reflect?.get?.("forge.bugs")) as RecurrenceBugsFace | undefined;
      return typeof bugs?.findRecurrenceCandidates === "function" ? bugs : undefined;
    } catch {
      return undefined;
    }
  };
  // bug 四动词在场现查缝（bug 044a310c 同族——装配漏接判例）：deriveWorkerToolFilter 的
  // bugsPresent 此前从未注入 → 四动词恒被剔除 + warn。缺席 = false（既有降级语义不变）。
  const bugsPresent = (): boolean => bugsFaceOf() !== undefined;
  // recurrence 两 face 生产接线（loop-recurrence-hardening §2.2 T2/T3——bug 0db72bcb 同族：
  // plugin-forge→task-loop 迁移时 createRecurrenceFaces 未迁，两 face 恒缺席 → T2 警示 /
  // T3 同缝拦截静默关停。建模报告探测 = probes 单轨（proposal 域已退役），docs 根派生 =
  // lib-path workspaceDocsRoot（算法单源）；projectKey → ws 根 = services.resolveWsPath
  //（装配期定稿，与 git 查找同源——空串 = 探测 false，机制惰性不拦）。
  const recurrenceFaces = createRecurrenceFaces({
    bugs: {
      findRecurrenceCandidates: (projectId, scope) =>
        bugsFaceOf()?.findRecurrenceCandidates(projectId, scope) ?? Promise.resolve([]),
    },
    resolveProjectDir: (projectId) => {
      const dir = services.resolveWsPath(projectId);
      return dir === "" ? undefined : dir;
    },
    workspaceDocsRoot: (ws) => workspaceDocsRoot(ws),
  });
  // AC7 结算报告回收钩子生产接线（bug 8dcbe845——哑钩子收口）：运行时目录 = 容器库目录
  //（containerDirOf ≡ deriveTaskStoreDir 单源，dual-memory-seam 同目录性锚）+ logs/<slug>/
  //<localId>；specs 卷宗落点 = forgeDirOfWorkspace(wsPath)/specs/<slug>/issues/<localId>
  //（= <ws>/.forge/specs/<slug>/issues/<localId>——@dsh-forge/lib-path forgeDirOfWorkspace
  //.forge 根单源派生，与 Spec 文档 .forge/specs/{slug}/spec.md 同根；specs 替代 proposals，
  //用户裁定 2026-11-25。不碰 <slug>/ 下既有 spec.md——回收只写 issues/<localId>/ 子目录）。
  //tasksHome 未注入（单装缺省
  // 形态，containerDirOf 缺席）= 钩子不装配（机制惰性不判，行为零变化）。
  const reportRecovery =
    services.containerDirOf !== undefined
      ? createSettleReportRecovery({
          projects: {
            getProject: async (projectId) => {
              const ws = services.resolveWsPath(projectId);
              return ws === "" ? null : { wsPath: ws };
            },
            deriveTaskStoreDir: async ({ workspaceDir }) => ({
              dir: services.containerDirOf!(services.db.projectKeyOf(workspaceDir)),
            }),
          },
          ...(diagEmit !== undefined ? { diag: diagEmit } : {}),
          taskLogsDir: (containerDir, slug, localId) => join(containerDir, "logs", slug, localId),
          specsIssuesDir: (ws, slug, localId) => join(forgeDirOfWorkspace(ws), "specs", slug, "issues", localId),
        })
      : undefined;
  const narrator = createNarrator({ channel: narrationChannel });
  const triage = createTriageHook({
    tasks: services.tasks,
    spawn,
    globalToolNames,
    // triage 两信号同源 recurrence face（T2 疑似同族——triage.ts 消费位；T3 建模在场归 claim 守卫）
    ...(diagEmit !== undefined ? { diag: diagEmit } : {}),
    findRecurrenceCandidates: recurrenceFaces.findRecurrenceCandidates,
  });
  const driver: LoopDriver = createLoopDriver({
    registry,
    tasks: services.tasks,
    spawn,
    narrator,
    checkpoints: services.checkpoints,
    triage,
    globalToolNames,
    resolveWorkerProfile,
    bugsPresent,
    // T2/T3 复发拦截两 face（生产路径的装配前提——缺席即机制静默关停）
    findRecurrenceCandidates: recurrenceFaces.findRecurrenceCandidates,
    modelingReportPresent: recurrenceFaces.modelingReportPresent,
    // AC7 结算旁挂回收缝（specs 卷宗落点生产接线——缺席 = 机制惰性不判）
    ...(reportRecovery !== undefined ? { reportRecovery } : {}),
    // 事件日志链透传（bug a93c1277）：tasksHome 注入时 forgeEvents（sink）+ containerDirOf
    // 同注——循环里程碑/台账经 bus→监听器落盘 logs/{slug}.jsonl；缺席 = 零透传零行为变化。
    ...(services.forgeEvents !== undefined ? { events: services.forgeEvents } : {}),
    ...(services.forgeEvents !== undefined && services.containerDirOf !== undefined ? { containerDirOf: services.containerDirOf } : {}),
    ...(diagEmit !== undefined ? { diag: diagEmit } : {}),
  });

  // ── 工具族 14 员（10 任务动词 + batch_add_tasks + impl_checkpoint 三员 + dispatch/stop）──
  const loop = { driver, registry };
  const unprepared: readonly TaskToolDefinition[] = [
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
  // 会话 → 容器目录记忆缝（bug a93c1277）：forgeEvents 在场时逐员包 execute——执行前
  // prepare（exec 会话 cwd → deriveTaskStoreDir 派生容器目录记忆）。worker 会话继承父
  // cwd，同链命中同一容器目录（logs/{slug}.jsonl 归属不断流）；缺席 = 零包装零行为变化。
  const forgeEvents = services.forgeEvents;
  const tools: readonly TaskToolDefinition[] =
    forgeEvents === undefined
      ? unprepared
      : unprepared.map((definition) => ({
          ...definition,
          execute: async (args: unknown, exec: TaskToolExecFace) => {
            await forgeEvents.prepare(sessionContextOf(exec as ToolExecFace));
            return definition.execute(args, exec);
          },
        }));
  emitForgeDiag(diagEmit, {
    level: "info",
    event: "task-loop-tools",
    message: `单装工具族装配完成：${String(tools.length)} 员（10 任务动词 + batch_add_tasks + impl_checkpoint 三员 + dispatch/stop）`,
  });
  return { tools, disposeLoop: () => driver.dispose(), reportRecovery };
}
