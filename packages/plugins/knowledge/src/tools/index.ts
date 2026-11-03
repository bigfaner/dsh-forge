// tools/ barrel（定位：业务）。两 tool 的定义工厂与执行期依赖形状。
// 调用链（交互二）：agent → tool.execute → 会话上下文解析（projectId/sessionId）
// → ctx.forgeKnowledge.search / readAbstract → SearchHit[] / EntryAbstract
// （执行点落 recall_logs——core 侧行为，插件不另记账）。
import type { KnowledgeService } from '@dsh-forge/contracts'
import type { ProjectIdResolver } from './session.js'
import { createSearchTool } from './search.js'
import { createReadAbstractTool } from './read-abstract.js'

/** 两 tool 共享的执行期依赖（index.ts 装配注入） */
export interface KnowledgeToolDeps {
  /** core 知识域服务（运行期 Cordis inject 解析的唯一 core 依赖） */
  knowledge: KnowledgeService
  /** 会话 cwd → projectId 解析器（session.ts 绑定表产物） */
  resolveProjectId: ProjectIdResolver
}

/** 两 tool 定义组（prompt 段渲染同源消费——单一内容源，AC5） */
export interface KnowledgeTools {
  readonly search: ReturnType<typeof createSearchTool>
  readonly readAbstract: ReturnType<typeof createReadAbstractTool>
}

export function createKnowledgeTools(deps: KnowledgeToolDeps): KnowledgeTools {
  return { search: createSearchTool(deps), readAbstract: createReadAbstractTool(deps) }
}

export { createProjectResolver, sessionContextOf, unboundSessionError } from './session.js'
export type { ProjectBinding, ProjectIdResolver, ToolSessionContext } from './session.js'
export type {
  KnowledgeContextFace,
  KnowledgePromptSection,
  KnowledgeToolDefinition,
  SystemPromptSectionFace,
  TextContentBlock,
  ToolAgentFace,
  ToolExecFace,
  ToolParametersSchema,
  ToolParameterProperty,
  ToolRegisterFace,
  ToolSessionFace,
  ToolSessionHeaderFace,
} from './faces.js'
export { parseSearchArgs } from './search.js'
export type { SearchToolArgs } from './search.js'
export { parseReadAbstractArgs } from './read-abstract.js'
export type { ReadAbstractToolArgs } from './read-abstract.js'
