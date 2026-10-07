// tools/ barrel（定位：业务；knowledge tools/index.ts 同型）。tool 的定义工厂与
// 执行期依赖形状（M3 终态六 tool = addTask / submitTask / queryTask /
// createProposal / transitionProposal / dispatchTask——tech-design Interface 4；
// claimTask tool 已退役（3.5·drift #1：并入 dispatchTask 复合动词，core 服务 API
// 保留供 dispatchTask/桥/回放消费）；transitionTask/transitionFeature/setProposalMode
// 不注册（人类通道专属/模式改写唯一正门——SC6/SC7 断言面；新面 pin = 5.1 #17/#18）。
// dispatchTask 注册面收口归 3.4（src/tools/dispatch-task.ts——本集合先持五员）。
// 调用链（交互四）：agent → tool.execute → 会话上下文解析（cwd→projectId /
// sessionId）→ ctx.forgeTasks / ctx.forgeProposals 动词（单一写入门，actor 由通道
// 推断恒 'plugin-tool'——core 侧落账）。返回面 = formatOk/formatErr 双友好模板
// （裁决⑨——format.ts 单源；RPC/桥 typed error 信封照旧，双面分治不破）。
import type { ForgeProposalsService, ForgeTasksService } from '@dsh-forge/contracts'
import type { ProjectIdResolver } from './session.js'
import { createAddTaskTool } from './add-task.js'
import { createCreateProposalTool } from './create-proposal.js'
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
}

/** tool 定义组（顺序 = Interface 4 列序；注册面与断言面共消费；dispatchTask 归 3.4） */
export interface ForgeTools {
  readonly addTask: ReturnType<typeof createAddTaskTool>
  readonly submitTask: ReturnType<typeof createSubmitTaskTool>
  readonly queryTask: ReturnType<typeof createQueryTaskTool>
  readonly createProposal: ReturnType<typeof createCreateProposalTool>
  readonly transitionProposal: ReturnType<typeof createTransitionProposalTool>
}

/** 注册面全集（M3 终态六 tool 的 3.5 切片：五在场 + dispatchTask（3.4）＝六；
 *  G1-11 旧「六在场/两缺席」随之改写——新面 pin = 5.1 #17/#18） */
export const FORGE_TOOL_NAMES = [
  'addTask',
  'submitTask',
  'queryTask',
  'createProposal',
  'transitionProposal',
] as const

export type ForgeToolName = (typeof FORGE_TOOL_NAMES)[number]

export function createForgeTools(deps: ForgeToolDeps): ForgeTools {
  return {
    addTask: createAddTaskTool(deps),
    submitTask: createSubmitTaskTool(deps),
    queryTask: createQueryTaskTool(deps),
    createProposal: createCreateProposalTool(deps),
    transitionProposal: createTransitionProposalTool(deps),
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
  callToolFace,
  errorCodeOf,
  forgeToolFailureOf,
  formatFailure,
  formatOk,
  isForgeToolFailure,
} from './format.js'
export type { ForgeToolFailure } from './format.js'
