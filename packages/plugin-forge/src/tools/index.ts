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
import type { ForgeEventSink } from '../events/sink.js'
import type { ProjectIdResolver } from './session.js'
import { createAddTaskTool } from './add-task.js'
import { createCreateProposalTool } from './create-proposal.js'
import { createDispatchTaskTool } from './dispatch-task.js'
import { createQueryTaskTool } from './query-task.js'
import { createSubmitTaskTool } from './submit-task.js'
import { createTransitionProposalTool } from './transition-proposal.js'

/** tool 共享的执行期依赖（index.ts 装配注入） */
export interface ForgeToolDeps {
  /** core 任务域服务（运行期 Cordis inject 解析的 core 依赖之一，类型出自 contracts） */
  tasks: ForgeTasksService
  /** core 提案域服务（写动词 = tool 专属面） */
  proposals: ForgeProposalsService
  /** 会话 cwd → projectId 解析器（session.ts 绑定表/bindingsFile 产物） */
  resolveProjectId: ProjectIdResolver
  /** 事件发射面（3.4——可选：缺席 = 零事件降级；task-submitted/task-error 等发射点共消费） */
  events?: ForgeEventSink
  /** forgeSettings 服务面（3.4——可选：缺席/worker 未配置 = dispatchTask 不携带 agentOptions） */
  settings?: Pick<ForgeSettingsService, 'get'>
}

/** tool 定义组（顺序 = Interface 4 列序；注册面与断言面共消费——终态六员） */
export interface ForgeTools {
  readonly addTask: ReturnType<typeof createAddTaskTool>
  readonly submitTask: ReturnType<typeof createSubmitTaskTool>
  readonly queryTask: ReturnType<typeof createQueryTaskTool>
  readonly createProposal: ReturnType<typeof createCreateProposalTool>
  readonly transitionProposal: ReturnType<typeof createTransitionProposalTool>
  readonly dispatchTask: ReturnType<typeof createDispatchTaskTool>
}

/** 注册面全集（M3 终态六 tool；G1-11 旧「六在场/两缺席」已改写——新面 pin = 5.1 #17/#18） */
export const FORGE_TOOL_NAMES = [
  'addTask',
  'submitTask',
  'queryTask',
  'createProposal',
  'transitionProposal',
  'dispatchTask',
] as const

export type ForgeToolName = (typeof FORGE_TOOL_NAMES)[number]

/** dispatchTask 装配 deps（spawn 必给——createForgeTools 入参的扩展面） */
export type DispatchForgeToolDeps = ForgeToolDeps & { spawn: Parameters<typeof createDispatchTaskTool>[0]['spawn'] }

export function createForgeTools(deps: DispatchForgeToolDeps): ForgeTools {
  return {
    addTask: createAddTaskTool(deps),
    submitTask: createSubmitTaskTool(deps),
    queryTask: createQueryTaskTool(deps),
    createProposal: createCreateProposalTool(deps),
    transitionProposal: createTransitionProposalTool(deps),
    dispatchTask: createDispatchTaskTool(deps),
  }
}

export {
  createProjectResolver,
  isWorkspaceNotRegisteredError,
  requireProjectId,
  requireSessionId,
  sessionContextOf,
  WorkspaceNotRegisteredError,
} from './session.js'
export type { ProjectBinding, ProjectIdResolver, ToolSessionContext, WorkspaceNotRegisteredData } from './session.js'
export type {
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
export {
  classifyPool,
  deriveWorkerToolFilter,
  parseDispatchTaskArgs,
  poolOf,
  workerAgentOptionsOf,
} from './dispatch-task.js'
export type {
  DispatchSpawnedResult,
  DispatchTaskResult,
  DispatchTaskToolArgs,
  DispatchTaskToolDeps,
  PoolSnapshot,
  PoolVerdict,
  SpawnWorker,
  SpawnWorkerHandle,
  SpawnWorkerRequest,
} from './dispatch-task.js'
export {
  callToolFace,
  errorCodeOf,
  forgeToolFailureOf,
  formatFailure,
  formatOk,
  isForgeToolFailure,
} from './format.js'
export type { ForgeToolFailure } from './format.js'
