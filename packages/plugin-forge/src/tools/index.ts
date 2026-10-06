// tools/ barrel（定位：业务；knowledge tools/index.ts 同型）。六 tool 的定义工厂与
// 执行期依赖形状（Interface 8：名 = 动词透传——addTask/claimTask/submitTask/
// queryTask/createProposal/transitionProposal；transitionTask/transitionFeature
// 不注册——人类通道专属，SC7 断言面）。调用链（交互四）：agent → tool.execute →
// 会话上下文解析（cwd→projectId / sessionId）→ ctx.forgeTasks / ctx.forgeProposals
// 动词（单一写入门，actor 由通道推断恒 'plugin-tool'——core 侧落账）。
import type { ForgeProposalsService, ForgeTasksService } from '@dsh-forge/contracts'
import type { ProjectIdResolver } from './session.js'
import { createAddTaskTool } from './add-task.js'
import { createClaimTaskTool } from './claim-task.js'
import { createCreateProposalTool } from './create-proposal.js'
import { createQueryTaskTool } from './query-task.js'
import { createSubmitTaskTool } from './submit-task.js'
import { createTransitionProposalTool } from './transition-proposal.js'

/** 六 tool 共享的执行期依赖（index.ts 装配注入） */
export interface ForgeToolDeps {
  /** core 任务域服务（运行期 Cordis inject 解析的 core 依赖之一，类型出自 contracts） */
  tasks: ForgeTasksService
  /** core 提案域服务（写动词 = tool 专属面） */
  proposals: ForgeProposalsService
  /** 会话 cwd → projectId 解析器（session.ts 绑定表/bindingsFile 产物） */
  resolveProjectId: ProjectIdResolver
}

/** 六 tool 定义组（顺序 = Interface 8 列序；注册面与断言面共消费） */
export interface ForgeTools {
  readonly addTask: ReturnType<typeof createAddTaskTool>
  readonly claimTask: ReturnType<typeof createClaimTaskTool>
  readonly submitTask: ReturnType<typeof createSubmitTaskTool>
  readonly queryTask: ReturnType<typeof createQueryTaskTool>
  readonly createProposal: ReturnType<typeof createCreateProposalTool>
  readonly transitionProposal: ReturnType<typeof createTransitionProposalTool>
}

/** Interface 8 注册面全集（SC7/G1-11 pin 锚：六在场） */
export const FORGE_TOOL_NAMES = [
  'addTask',
  'claimTask',
  'submitTask',
  'queryTask',
  'createProposal',
  'transitionProposal',
] as const

export type ForgeToolName = (typeof FORGE_TOOL_NAMES)[number]

export function createForgeTools(deps: ForgeToolDeps): ForgeTools {
  return {
    addTask: createAddTaskTool(deps),
    claimTask: createClaimTaskTool(deps),
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
export { parseClaimTaskArgs } from './claim-task.js'
export type { ClaimTaskToolArgs } from './claim-task.js'
export { gateOf, parseSubmitTaskArgs } from './submit-task.js'
export type { SubmitTaskToolArgs } from './submit-task.js'
export { parseQueryTaskArgs } from './query-task.js'
export type { QueryTaskToolArgs } from './query-task.js'
export { parseCreateProposalArgs } from './create-proposal.js'
export type { CreateProposalToolArgs } from './create-proposal.js'
export { parseTransitionProposalArgs } from './transition-proposal.js'
export type { TransitionProposalToolArgs } from './transition-proposal.js'
