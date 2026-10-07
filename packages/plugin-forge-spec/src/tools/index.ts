// tools/ barrel（定位：业务；plugin-forge tools/index.ts 同型）。三 tool 的定义工厂
// 与执行期依赖形状（M3 Interface：spec 三 tool = registerFeature / upsertFeatureDoc /
// validateFeatureTasks——5.1 pin #18「两包 tool 面分置」的 spec 侧集合；transitionFeature
// 不注册——人类纠偏面（tech-design 裁决②收窄），plugin-forge 侧 G1-11 pin 同锚）。
// 调用链：agent → tool.execute → 会话上下文解析（cwd→projectId）→ ctx.forgeFeatures /
// ctx.forgeTasks 动词（单一写入门，actor 由通道推断恒 'plugin-tool'——core 侧落账）。
import type { ForgeFeaturesService, ForgeTasksService } from '@dsh-forge/contracts'
import type { ProjectIdResolver } from './session.js'
import { createRegisterFeatureTool } from './register-feature.js'
import { createUpsertFeatureDocTool } from './upsert-feature-doc.js'
import { createValidateFeatureTasksTool } from './validate-feature-tasks.js'

/** 三 tool 共享的执行期依赖（index.ts 装配注入） */
export interface ForgeSpecToolDeps {
  /** core feature 域服务（运行期 Cordis inject 解析的 core 依赖之一，类型出自 contracts） */
  features: ForgeFeaturesService
  /** core 任务域服务（validateFeatureTasks 只读校验面——Interface 1 钉在任务域） */
  tasks: ForgeTasksService
  /** 会话 cwd → projectId 解析器（session.ts 绑定表/bindingsFile 产物） */
  resolveProjectId: ProjectIdResolver
}

/** 三 tool 定义组（顺序 = 注册面列序；注册面与断言面共消费） */
export interface ForgeSpecTools {
  readonly registerFeature: ReturnType<typeof createRegisterFeatureTool>
  readonly upsertFeatureDoc: ReturnType<typeof createUpsertFeatureDocTool>
  readonly validateFeatureTasks: ReturnType<typeof createValidateFeatureTasksTool>
}

/** spec 侧注册面全集（5.1 pin #18「两包 tool 面分置」锚：三在场） */
export const FORGE_SPEC_TOOL_NAMES = [
  'registerFeature',
  'upsertFeatureDoc',
  'validateFeatureTasks',
] as const

export type ForgeSpecToolName = (typeof FORGE_SPEC_TOOL_NAMES)[number]

export function createForgeSpecTools(deps: ForgeSpecToolDeps): ForgeSpecTools {
  return {
    registerFeature: createRegisterFeatureTool(deps),
    upsertFeatureDoc: createUpsertFeatureDocTool(deps),
    validateFeatureTasks: createValidateFeatureTasksTool(deps),
  }
}

export {
  createProjectResolver,
  isWorkspaceNotRegisteredError,
  requireProjectId,
  sessionContextOf,
  WorkspaceNotRegisteredError,
} from './session.js'
export type { ProjectBinding, ProjectIdResolver, ToolSessionContext, WorkspaceNotRegisteredData } from './session.js'
export type {
  ForgeSpecContextFace,
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
export { parseRegisterFeatureArgs } from './register-feature.js'
export type { RegisterFeatureToolArgs } from './register-feature.js'
export { parseUpsertFeatureDocArgs } from './upsert-feature-doc.js'
export type { UpsertFeatureDocToolArgs } from './upsert-feature-doc.js'
export { parseValidateFeatureTasksArgs } from './validate-feature-tasks.js'
export type { ValidateFeatureTasksToolArgs } from './validate-feature-tasks.js'
