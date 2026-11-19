// 调用链（交互四）：agent → tool.execute → 会话上下文解析（cwd→projectId /
// sessionId）→ ctx.forgeTasks 动词（单一写入门，actor 由通道
// 推断恒 'plugin-tool'——core 侧落账）。返回面 = formatOk/formatErr 双友好模板
// （裁决⑨——format.ts 单源；RPC/桥 typed error 信封照旧，双面分治不破）。
// 3.4 事件缝：deps.events（可选——缺席 = 零事件降级；单测桩免配）承载 emit 与
// 会话目录记忆（→ 3.3 总线/监听器）；deps.settings = forgeSettings 服务面（可选——
// 缺席 = dispatchTask 不携带 agentOptions 回退父会话继承）。
import type {
  ForgeSettingsService,
  ForgeTasksService,
} from '@dsh-forge/contracts'
import type { BugCard, BugChainContext, BugErrorTypeAggregate, BugRecurrenceCandidate, GetBugResponse, ListBugsQuery, RegisterBugInput, RegisterBugResult, ResolveBugInput } from '@dsh-forge/lib-api'
import type { ForgeEventSink } from '../events/sink.js'
import type { DispatchJobsFace, ProjectDirServiceFace } from '../faces.js'
import type { ProjectIdResolver } from './session.js'
import { createAddTaskTool } from './add-task.js'
import { createDispatchTaskTool } from './dispatch-task.js'
import type {
  ForgeCheckpointsToolFace,
} from './impl-checkpoint.js'
import { createForgeDirsTool, createForgeResolvePathTool } from './forge-paths.js'
import { createGetBugTool } from './get-bug.js'
import { createListBugsTool } from './list-bugs.js'
import { createListTasksTool } from './list-tasks.js'
import { createPauseTaskTool } from './pause-task.js'
import { createQueryTaskTool } from './query-task.js'
import { createRecordBugTool } from './record-bug.js'
import { createResolveBugTool } from './resolve-bug.js'
import { createSubmitTaskTool } from './submit-task.js'
import { createStopTaskLoopTool } from './stop-task-loop.js'
import { createTaskStatsTool } from './task-stats.js'
import type { LoopToolDeps } from './dispatch-task.js'
import { createAggregateBugsTool } from './aggregate-bugs.js'
import { createUnblockTaskTool } from './unblock-task.js'
import { createUpdateTaskTool } from './update-task.js'
import {
  createListImplCheckpointsTool,
  createQueryImplCheckpointTool,
  createRecordImplCheckpointTool,
} from './impl-checkpoint.js'

/** 机械⑥三工具定义组（键序 = FORGE_TOOL_NAMES 尾三员列序——注册序单源） */
function createImplCheckpointTools(deps: DispatchForgeToolDeps): Pick<
  ForgeTools,
  'recordImplCheckpoint' | 'queryImplCheckpoint' | 'listImplCheckpoints'
> {
  return {
    recordImplCheckpoint: createRecordImplCheckpointTool(deps),
    queryImplCheckpoint: createQueryImplCheckpointTool(deps),
    listImplCheckpoints: createListImplCheckpointsTool(deps),
  }
}

/**
 * bugs 域服务的插件侧结构化消费面（fix-bug 两写径——plugin-project 1.11 归拢：bug 域服务
 * 归拢 plugins/project host/bugs，服务缝契约 = lib/api ports BugsServicePort，输入/应答
 * 类型单源 lib/api dto/bugs（RegisterBugInput/ResolveBugInput/RegisterBugResult——本面与
 * 域服务共用同形，禁手写镜像）；类型出自本面：插件禁 import 域实现，跨面以结构判别。
 */
export interface ForgeBugsToolFace {
  registerBug(input: RegisterBugInput): Promise<RegisterBugResult>
  resolveBug(input: ResolveBugInput): Promise<BugCard>
  /**
   * 台账查询面（bug-recurrence-chain：listBugs tool 六字段 search/状态 chips/sort/
   * offset+limit 分页——core listBugs 结构兼容；bug-mention-prestep 仅传 projectId 子集）。
   */
  listBugs(q: ListBugsQuery): Promise<readonly BugCard[]>
  /** 单条全卡 + 链上下文（getBug tool——主 + worker 面；core getBug 结构兼容） */
  getBug(q: { readonly projectId: string; readonly bugId: string }): Promise<GetBugResponse>
  /**
   * 台账 recurrence 候选只读检索（loop-recurrence-hardening——T2 交叉校验 / T3 同缝计数 /
   * triage 两信号 / add-fix vars 共同消费 face；core createBugsService 结构兼容，链构建
   * 与 scope 口径归 core bugs 域层定义）。
   */
  findRecurrenceCandidates(
    projectId: string,
    scope: {
      readonly slug: string
      readonly localId: string
      /** 派生源任务 id（可选——core 域结构化解析作归属锚，缺席回退 slug） */
      readonly sourceTaskId?: string
      readonly files: readonly string[]
    },
  ): Promise<readonly BugRecurrenceCandidate[]>
  /**
   * errorType 聚合读法（recurrence-signal-tiering 聚合统计——主 agent aggregateBugs 工具 +
   * triage 只读 face 双消费）：按 errorType 分组全史计数 {total, open, fixed, lastSeenAt}；
   * core aggregateByErrorType 结构兼容，分组/计数/排序归 core bugs 域层定义。
   */
  aggregateByErrorType(projectId: string): Promise<readonly BugErrorTypeAggregate[]>
}

/**
 * core checkpoints 域服务的插件侧结构化消费面（机械⑥——core createCheckpointsService 结构兼容；
 * 类型定义于 impl-checkpoint.ts，工具面注释引用）。
 */
export type { CheckpointListEntry, CheckpointMark, CheckpointMetrics, CheckpointRow, CheckpointSnapshots, ForgeCheckpointsToolFace } from './impl-checkpoint.js'

/** 链上下文投影重导出（getBug 响应载荷形状——工具面注释引用） */
export type { BugChainContext }

/** tool 共享的执行期依赖（index.ts 装配注入） */
export interface ForgeToolDeps {
  /** core 任务域服务（运行期 Cordis inject 解析的 core 依赖之一，类型出自 contracts） */
  tasks: ForgeTasksService
  /** core bug 域服务（fix-bug 两写径 recordBug/resolveBug 的服务面——装配注入） */
  bugs: ForgeBugsToolFace
  /** core checkpoints 域服务（机械⑥实现检查点三工具的服务面——装配注入） */
  checkpoints: ForgeCheckpointsToolFace
  /** 会话 cwd → projectId 解析器（session.ts 绑定表/bindingsFile 产物） */
  resolveProjectId: ProjectIdResolver
  /** 事件发射面（3.4——可选：缺席 = 零事件降级；task-submitted/task-error 等发射点共消费） */
  events?: ForgeEventSink
  /** forgeSettings 服务面（3.4——可选：缺席/worker 未配置 = dispatchTask 不携带 agentOptions） */
  settings?: Pick<ForgeSettingsService, 'get'>
  /**
   * 模型推理档位目录解析（可选——llm 服务 resolveModelInfo 惰性反射装配）：
   * (provider, model) → 该路由支持的 effort id 集；undefined = 目录不可知（不判）。
   * dispatchTask 组装面消费——配置档位不被支持时剥离 effort（无法兼容就不设置）。
   */
  resolveModelReasoning?: (provider: string, model: string) => Promise<readonly string[] | undefined>
  /**
   * dsh jobs 注册表收窄面（可选——async-dispatch §7：真实现经 ctx.reflect.get('jobs')
   * 防御读取 + adaptDispatchJobs 收窄适配注入）。缺席 = dispatchTask 拒绝 run_in_background
   * 调用并提示（events/settings 同型可选降级模式——后台派发降级关闭，前台路径零变化）。
   */
  jobs?: DispatchJobsFace
  /**
   * 项目域服务收窄面（可选——loop-recurrence-hardening T4 resolveBug 锚有效性预检的
   * 项目根解析缝，1.4 resolveDir 同源注入；缺席 = 预检机制惰性跳过，core presence 门仍在）。
   */
  projects?: ProjectDirServiceFace
  /**
   * dirKey 数据源消费面（forge-dirs-query-tool——可选：缺席 = forgeDirs/forgeResolvePath
   * 两 tool 执行期 fail-loud 拒绝（同 features 可选降级模式），其余 tool 零影响。
   * 装配径 = faces.createForgePathsAnchors 锚解析缝 + forge-paths.createDirKeyRegistry
   * 合并注册表（declare merge 面同实例），见 src/index.ts。
   */
  paths?: import('./forge-paths.js').ForgePathsToolFace
  /**
   * 越径结算显示同步面（可选——submitTask 落账后终态事件补发：任务源无活循环时向最新
   * claim 会话补发 settle 进度事件，两消费面翻旧 claim「执行中」行）。缺席 = 机制关闭
   * （纯显示同步——池态真源在 core submitTask，缺面仅损失显示翻行）。
   */
  submitSettleDisplay?: (input: { projectId: string; slug: string; localId: string; result: 'completed' | 'blocked' }) => Promise<void>
}

/** tool 定义组（顺序 = Interface 4 列序扩展——二十员；注册面与断言面共消费） */
export interface ForgeTools {
  readonly addTask: ReturnType<typeof createAddTaskTool>
  readonly submitTask: ReturnType<typeof createSubmitTaskTool>
  readonly queryTask: ReturnType<typeof createQueryTaskTool>
  readonly dispatchTask: ReturnType<typeof createDispatchTaskTool>
  readonly stopTaskLoop: ReturnType<typeof createStopTaskLoopTool>
  readonly updateTask: ReturnType<typeof createUpdateTaskTool>
  readonly taskStats: ReturnType<typeof createTaskStatsTool>
  readonly listTasks: ReturnType<typeof createListTasksTool>
  readonly recordBug: ReturnType<typeof createRecordBugTool>
  readonly resolveBug: ReturnType<typeof createResolveBugTool>
  readonly listBugs: ReturnType<typeof createListBugsTool>
  readonly getBug: ReturnType<typeof createGetBugTool>
  readonly aggregateBugs: ReturnType<typeof createAggregateBugsTool>
  readonly recordImplCheckpoint: ReturnType<typeof createRecordImplCheckpointTool>
  readonly queryImplCheckpoint: ReturnType<typeof createQueryImplCheckpointTool>
  readonly listImplCheckpoints: ReturnType<typeof createListImplCheckpointsTool>
  readonly pauseTask: ReturnType<typeof createPauseTaskTool>
  readonly unblockTask: ReturnType<typeof createUnblockTaskTool>
  readonly forgeDirs: ReturnType<typeof createForgeDirsTool>
  readonly forgeResolvePath: ReturnType<typeof createForgeResolvePathTool>
}

/** 注册面全集（二十 tool——M3 六员 + recordBug/resolveBug 两 bug 写径 + listBugs/getBug
 *  两 bug 读径 + aggregateBugs 聚合读径（recurrence-signal-tiering）+ stopTaskLoop 停止入口
 *  （3b——dispatch-loop-hardening 改进 3b③）+ pauseTask
 *  单任务暂停入口（task-pause-primitive）+ unblockTask blocked→pending 出口
 *  （blocked-verdict-restore-primitive）+ forgeDirs/forgeResolvePath 目录查询双只读径
 *  （forge-dirs-query-tool §2.3——主 + worker 双面）；面分治：listBugs
 *  仅主 agent，getBug 主 + worker，aggregateBugs 主 + triage（聚合只读，worker 面 deny
 *  ——assemble.ts FORGE_DENY_IN_WORKER），addTask 仅主 agent（worker 面不注入——
 *  execute 面 ERR_WORKER_ADDTASK_DENIED 双保险），pauseTask/unblockTask 仅主 agent——WORKER_FORGE_TOOLS
 *  六员，其余 worker deny） */
export const FORGE_TOOL_NAMES = [
  'addTask',
  'submitTask',
  'queryTask',
  'dispatchTask',
  'stopTaskLoop',
  'updateTask',
  'taskStats',
  'listTasks',
  'recordBug',
  'resolveBug',
  'listBugs',
  'getBug',
  'aggregateBugs',
  'recordImplCheckpoint',
  'queryImplCheckpoint',
  'listImplCheckpoints',
  'pauseTask',
  'unblockTask',
  'forgeDirs',
  'forgeResolvePath',
] as const

export type ForgeToolName = (typeof FORGE_TOOL_NAMES)[number]

/** dispatchTask/stopTaskLoop 装配 deps（loop 驱动器 + 登记表单例必给——createForgeTools 入参扩展面） */
export type DispatchForgeToolDeps = ForgeToolDeps & { loop: LoopToolDeps }
export function createForgeTools(deps: DispatchForgeToolDeps): ForgeTools {
  return {
    addTask: createAddTaskTool(deps),
    submitTask: createSubmitTaskTool(deps),
    queryTask: createQueryTaskTool(deps),
    dispatchTask: createDispatchTaskTool(deps),
    stopTaskLoop: createStopTaskLoopTool(deps),
    updateTask: createUpdateTaskTool(deps),
    taskStats: createTaskStatsTool(deps),
    listTasks: createListTasksTool(deps),
    recordBug: createRecordBugTool(deps),
    resolveBug: createResolveBugTool(deps),
    listBugs: createListBugsTool(deps),
    getBug: createGetBugTool(deps),
    aggregateBugs: createAggregateBugsTool(deps),
    ...createImplCheckpointTools(deps),
    pauseTask: createPauseTaskTool(deps),
    unblockTask: createUnblockTaskTool(deps),
    forgeDirs: createForgeDirsTool(deps),
    forgeResolvePath: createForgeResolvePathTool(deps),
  }
}

export {
  bindingProjectIds,
  createProjectResolver,
  isWorkspaceNotRegisteredError,
  requireProjectId,
  requireSessionId,
  sessionContextOf,
  WorkspaceNotRegisteredError,
} from './session.js'
export type { ProjectBinding, ProjectIdResolver, ToolSessionContext, WorkspaceNotRegisteredData } from './session.js'
export type {
  DispatchJobHooks,
  DispatchJobOutcome,
  DispatchJobRunHandle,
  DispatchJobSpec,
  DispatchJobsFace,
  DispatchJobsRegistryFace,
  ForgeContextFace,
  ForgePromptSection,
  ForgeToolDefinition,
  SystemPromptSectionFace,
  TextContentBlock,
  ToolAgentFace,
  ToolExecFace,
  ToolParameterProperty,
  ToolParametersSchema,
  ToolRegisterFace,
  ToolSessionFace,
  ToolSessionHeaderFace,
} from '../faces.js'
export { adaptDispatchJobs } from '../faces.js'
export { parseAddTaskArgs, varsEntriesToRecord } from './add-task.js'
export type { AddTaskToolArgs } from './add-task.js'
export { gateOf, parseSubmitTaskArgs } from './submit-task.js'
export type { SubmitTaskToolArgs } from './submit-task.js'
export { parseQueryTaskArgs } from './query-task.js'
export type { QueryTaskToolArgs } from './query-task.js'
export { parseUpdateTaskArgs } from './update-task.js'
export type { UpdateTaskToolArgs } from './update-task.js'
export { parseTaskStatsArgs } from './task-stats.js'
export type { TaskStatsToolArgs } from './task-stats.js'
export { parseRecordBugArgs } from './record-bug.js'
export type { RecordBugToolArgs } from './record-bug.js'
export { parseResolveBugArgs } from './resolve-bug.js'
export type { ResolveBugToolArgs } from './resolve-bug.js'
export { parseListBugsArgs, LIST_BUGS_OUTPUT_SCHEMA } from './list-bugs.js'
export type { ListBugsToolArgs } from './list-bugs.js'
export { parseGetBugArgs, GET_BUG_OUTPUT_SCHEMA } from './get-bug.js'
export type { GetBugToolArgs } from './get-bug.js'
export { AGGREGATE_BUGS_OUTPUT_SCHEMA, parseAggregateBugsArgs } from './aggregate-bugs.js'
export type { AggregateBugsToolArgs } from './aggregate-bugs.js'
export {
  FORGE_DIRS_OUTPUT_SCHEMA,
  FORGE_RESOLVE_PATH_OUTPUT_SCHEMA,
  parseForgeDirsArgs,
  parseForgeResolvePathArgs,
} from './forge-paths.js'
export type {
  ForgeDirsResult,
  ForgeDirsToolArgs,
  ForgePathsToolFace,
  ForgeResolvePathResult,
  ForgeResolvePathToolArgs,
} from './forge-paths.js'
export {
  CHECKPOINT_MARKS,
  computeCheckpointMetrics,
  parseListImplCheckpointsArgs,
  parseQueryImplCheckpointArgs,
  parseRecordImplCheckpointArgs,
} from './impl-checkpoint.js'
export type {
  ListImplCheckpointsToolArgs,
  QueryImplCheckpointToolArgs,
  RecordImplCheckpointToolArgs,
} from './impl-checkpoint.js'
export { parseListTasksArgs } from './list-tasks.js'
export type { ListTasksToolArgs } from './list-tasks.js'
export {
  classifyPool,
  deriveWorkerToolFilter,
  parseDispatchTaskArgs,
  poolOf,
  reconcileWorkerReasoning,
  workerAgentOptionsOf,
} from './dispatch-task.js'
export type {
  DispatchLoopResult,
  DispatchSpawnedResult,
  DispatchTaskResult,
  DispatchTaskToolArgs,
  DispatchTaskToolDeps,
  LoopToolDeps,
  PoolSnapshot,
  PoolVerdict,
  SpawnWorker,
  SpawnWorkerHandle,
  SpawnWorkerRequest,
} from './dispatch-task.js'
export { parseStopTaskLoopArgs } from './stop-task-loop.js'
export type { StopTaskLoopResult, StopTaskLoopToolArgs, StopTaskLoopToolDeps } from './stop-task-loop.js'
export { parsePauseTaskArgs } from './pause-task.js'
export type { PauseTaskResult, PauseTaskToolArgs, PauseTaskToolDeps } from './pause-task.js'
export { parseUnblockTaskArgs } from './unblock-task.js'
export type { UnblockTaskToolArgs } from './unblock-task.js'
export {
  callToolFace,
  errorCodeOf,
  forgeToolFailureOf,
  formatFailure,
  formatOk,
  isForgeToolFailure,
} from './format.js'
export type { ForgeToolFailure } from './format.js'
