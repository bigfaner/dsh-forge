// tools/ barrel（定位：业务）。两 tool 的定义工厂与执行期依赖形状。
// 调用链（交互二）：agent → tool.execute → 会话上下文解析（projectId/sessionId）
// → knowledge 服务 search / readAbstract / write / read / supersedeEntry / reinstateEntry
// → 各回执面（执行点落 recall_logs——服务面行为，插件不另记账）。
// 六 tool 面（裁决 #1 修订 2026-11-05）：search/readAbstract/write/read + supersede/reinstate
//（fix-评审2——merge/revert 开为 agent tool，自动执行保真；followups #1 重命名 2026-11-05）。
import type { KnowledgeService } from '../service/types.js'
import type { ProjectIdResolver } from './session.js'
import { createSearchTool } from './search.js'
import { createReadAbstractTool } from './read-abstract.js'
import { createWriteTool } from './write.js'
import { createReadTool } from './read.js'
import { createSupersedeTool } from './supersede.js'
import { createReinstateTool } from './reinstate.js'

/** 六 tool 共享的执行期依赖（index.ts 装配注入） */
export interface KnowledgeToolDeps {
  /** knowledge 服务面（插件自有 'knowledge' 服务——自持库供数） */
  knowledge: KnowledgeService
  /** 会话 cwd → projectId 解析器（session.ts 静态绑定表产物） */
  resolveProjectId: ProjectIdResolver
}

/** 六 tool 定义组（prompt 段渲染同源消费——单一内容源，AC5） */
export interface KnowledgeTools {
  readonly search: ReturnType<typeof createSearchTool>
  readonly readAbstract: ReturnType<typeof createReadAbstractTool>
  readonly write: ReturnType<typeof createWriteTool>
  readonly read: ReturnType<typeof createReadTool>
  readonly supersede: ReturnType<typeof createSupersedeTool>
  readonly reinstate: ReturnType<typeof createReinstateTool>
}

export function createKnowledgeTools(deps: KnowledgeToolDeps): KnowledgeTools {
  return {
    search: createSearchTool(deps),
    readAbstract: createReadAbstractTool(deps),
    write: createWriteTool(deps),
    read: createReadTool(deps),
    supersede: createSupersedeTool(deps),
    reinstate: createReinstateTool(deps),
  }
}

export { createProjectResolver, createWsPathResolver, sessionContextOf, unboundSessionError } from './session.js'
export type { ProjectBinding, ProjectIdResolver, ToolSessionContext, WsPathResolver } from './session.js'
export type {
  AgentCreatedSubscribeFace,
  KnowledgeContextFace,
  KnowledgePromptSection,
  KnowledgeToolDefinition,
  ScopedAgentFace,
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
export { parseWriteArgs } from './write.js'
export type { WriteToolArgs } from './write.js'
export { parseReadArgs } from './read.js'
export type { ReadToolArgs } from './read.js'
export { parseSupersedeArgs } from './supersede.js'
export type { SupersedeToolArgs } from './supersede.js'
export { parseReinstateArgs } from './reinstate.js'
export type { ReinstateToolArgs } from './reinstate.js'
