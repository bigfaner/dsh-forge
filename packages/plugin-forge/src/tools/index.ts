// tools/ barrel（定位：业务；knowledge tools/index.ts 同型）。tool 的定义工厂与
// 执行期依赖形状（M3 终态六 tool = addTask / submitTask / queryTask / createProposal /
// transitionProposal / dispatchTask——tech-design Interface 4；claimTask tool 已退役
// （3.5·drift #1：并入 dispatchTask 复合动词，core 服务 API 保留供 dispatchTask/桥/回放
// 消费）；transitionTask/transitionFeature/setProposalMode 不注册（人类通道专属/模式改写
// 唯一正门——SC6/SC7 断言面；新面 pin = 5.1 #17/#18）。dispatchTask 注册面收口 = 3.4
// （本集合终态六员）。
// 调用链（交互四）：agent → tool.execute → 会话上下文解析（cwd→projectId /
// sessionId）→ ctx.forgeTasks / ctx.forgeProposals 动词（单一写入门，actor 由通道
// 推断恒 'plugin-tool'——core 侧落账）。返回面 = formatOk/formatErr 双友好模板
// （裁决⑨——format.ts 单源；RPC/桥 typed error 信封照旧，双面分治不破）。
// 3.4 事件缝：deps.events（可选——缺席 = 零事件降级；单测桩免配）承载 emit 与
// 会话目录记忆（→ 3.3 总线/监听器）；deps.settings = forgeSettings 服务面（可选——
// 缺席 = dispatchTask 不携带 agentOptions 回退父会话继承）。
import type { ForgeProposalsService, ForgeSettingsService, ForgeTasksService } from '@dsh-forge/contracts'
import type { BugCard, BugChainContext, GetBugResponse, ListBugsQuery } from '@dsh-forge/contracts'
import type { ForgeEventSink } from '../events/sink.js'
import type { DispatchJobsFace } from '../faces.js'
import type { ProjectIdResolver } from './session.js'
import { createAddTaskTool } from './add-task.js'
import { createCreateProposalTool } from './create-proposal.js'
import { createDispatchTaskTool } from './dispatch-task.js'
import type {
  ForgeCheckpointsToolFace,
} from './impl-checkpoint.js'
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
import { createTransitionProposalTool } from './transition-proposal.js'
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
 * core bug 域服务的插件侧结构化消费面（fix-bug 两写径——core createBugsService 结构兼容，
 * 类型出自本面：插件禁 import core，跨面以结构判别；两写径语义 = core RegisterBugInput/
 * ResolveBugInput 同形）。
 */
export interface ForgeBugsToolFace {
  registerBug(input: {
    readonly projectId: string
    readonly summary: string
    readonly bugDesc: string
    readonly triggerDesc: string
    readonly expected: string
    readonly actual: string
    readonly suspected?: string
    readonly errorType?: string
    /** 复发链前驱指针（bug-recurrence-chain——登记时一次写入；悬空引用拒写） */
    readonly recurrenceOf?: string
    readonly sourceTaskId?: string
    readonly reportSessionId?: string
  }): Promise<BugCard>
  resolveBug(input: {
    readonly projectId: string
    readonly bugId: string
    readonly outcome: 'fixed' | 'unresolved'
    readonly commitHash?: string
    readonly unresolvedReason?: string
    readonly fixApproach?: string
    readonly fixSessionId?: string
  }): Promise<BugCard>
  /**
   * 台账查询面（bug-recurrence-chain：listBugs tool 六字段 search/状态 chips/sort/
   * offset+limit 分页——core listBugs 结构兼容；bug-mention-prestep 仅传 projectId 子集）。
   */
  listBugs(q: ListBugsQuery): Promise<readonly BugCard[]>
  /** 单条全卡 + 链上下文（getBug tool——主 + worker 面；core getBug 结构兼容） */
  getBug(q: { readonly projectId: string; readonly bugId: string }): Promise<GetBugResponse>
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
  /** core 提案域服务（写动词 = tool 专属面） */
  proposals: ForgeProposalsService
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
}

/** tool 定义组（顺序 = Interface 4 列序扩展——十七员；注册面与断言面共消费） */
export interface ForgeTools {
  readonly addTask: ReturnType<typeof createAddTaskTool>
  readonly submitTask: ReturnType<typeof createSubmitTaskTool>
  readonly queryTask: ReturnType<typeof createQueryTaskTool>
  readonly createProposal: ReturnType<typeof createCreateProposalTool>
  readonly transitionProposal: ReturnType<typeof createTransitionProposalTool>
  readonly dispatchTask: ReturnType<typeof createDispatchTaskTool>
  readonly stopTaskLoop: ReturnType<typeof createStopTaskLoopTool>
  readonly updateTask: ReturnType<typeof createUpdateTaskTool>
  readonly taskStats: ReturnType<typeof createTaskStatsTool>
  readonly listTasks: ReturnType<typeof createListTasksTool>
  readonly recordBug: ReturnType<typeof createRecordBugTool>
  readonly resolveBug: ReturnType<typeof createResolveBugTool>
  readonly listBugs: ReturnType<typeof createListBugsTool>
  readonly getBug: ReturnType<typeof createGetBugTool>
  readonly recordImplCheckpoint: ReturnType<typeof createRecordImplCheckpointTool>
  readonly queryImplCheckpoint: ReturnType<typeof createQueryImplCheckpointTool>
  readonly listImplCheckpoints: ReturnType<typeof createListImplCheckpointsTool>
  readonly pauseTask: ReturnType<typeof createPauseTaskTool>
}

/** 注册面全集（十八 tool——M3 九员 + recordBug/resolveBug 两 bug 写径 + listBugs/getBug
 *  两 bug 读径 + stopTaskLoop 停止入口（3b——dispatch-loop-hardening 改进 3b③）+ pauseTask
 *  单任务暂停入口（task-pause-primitive）；面分治：listBugs 仅主 agent，getBug 主 + worker，
 *  pauseTask 仅主 agent——WORKER_FORGE_TOOLS 五动词，其余 worker deny） */
export const FORGE_TOOL_NAMES = [
  'addTask',
  'submitTask',
  'queryTask',
  'createProposal',
  'transitionProposal',
  'dispatchTask',
  'stopTaskLoop',
  'updateTask',
  'taskStats',
  'listTasks',
  'recordBug',
  'resolveBug',
  'listBugs',
  'getBug',
  'recordImplCheckpoint',
  'queryImplCheckpoint',
  'listImplCheckpoints',
  'pauseTask',
] as const

export type ForgeToolName = (typeof FORGE_TOOL_NAMES)[number]

/** dispatchTask/stopTaskLoop 装配 deps（loop 驱动器 + 登记表单例必给——createForgeTools 入参扩展面） */
export type DispatchForgeToolDeps = ForgeToolDeps & { loop: LoopToolDeps }
export function createForgeTools(deps: DispatchForgeToolDeps): ForgeTools {
  return {
    addTask: createAddTaskTool(deps),
    submitTask: createSubmitTaskTool(deps),
    queryTask: createQueryTaskTool(deps),
    createProposal: createCreateProposalTool(deps),
    transitionProposal: createTransitionProposalTool(deps),
    dispatchTask: createDispatchTaskTool(deps),
    stopTaskLoop: createStopTaskLoopTool(deps),
    updateTask: createUpdateTaskTool(deps),
    taskStats: createTaskStatsTool(deps),
    listTasks: createListTasksTool(deps),
    recordBug: createRecordBugTool(deps),
    resolveBug: createResolveBugTool(deps),
    listBugs: createListBugsTool(deps),
    getBug: createGetBugTool(deps),
    ...createImplCheckpointTools(deps),
    pauseTask: createPauseTaskTool(deps),
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
export { parseCreateProposalArgs } from './create-proposal.js'
export type { CreateProposalToolArgs } from './create-proposal.js'
export { parseTransitionProposalArgs } from './transition-proposal.js'
export type { TransitionProposalToolArgs } from './transition-proposal.js'
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
export {
  callToolFace,
  errorCodeOf,
  forgeToolFailureOf,
  formatFailure,
  formatOk,
  isForgeToolFailure,
} from './format.js'
export type { ForgeToolFailure } from './format.js'
