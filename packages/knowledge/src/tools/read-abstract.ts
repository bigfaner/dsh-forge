// knowledge_read_abstract tool 定义（定位：业务）。参数 schema 与
// KnowledgeService.readAbstract 同构（Interface 3）：projectId/sessionId 由会话
// 上下文解析，agent 面仅见 entry_id（search 命中的钥匙）；返回 = contracts
// EntryAbstract（摘要先行，不含正文——场景⑤口径），不自定形状（AC1）。
import type { EntryAbstract, ReadAbstractQuery } from '@dsh-forge/contracts'
import type { KnowledgeToolDefinition, ToolExecFace } from './faces.js'
import type { KnowledgeToolDeps } from './index.js'
import { sessionContextOf, unboundSessionError } from './session.js'

/** agent 面参数（映射 ReadAbstractQuery 去会话解析双键后的全集：仅 entry_id） */
export interface ReadAbstractToolArgs {
  readonly entry_id: number
}

/** 参数防御性收窄（执行点自证，同 parseSearchArgs 口径） */
export function parseReadAbstractArgs(args: unknown): ReadAbstractToolArgs {
  if (typeof args !== 'object' || args === null) throw new Error('knowledge_read_abstract: arguments must be an object')
  const a = args as Record<string, unknown>
  if (typeof a.entry_id !== 'number' || !Number.isInteger(a.entry_id)) {
    throw new Error('knowledge_read_abstract: entry_id must be an integer (from knowledge_search hits)')
  }
  return { entry_id: a.entry_id }
}

/** EntryAbstract → 模型可见文本（摘要块 + 元数据；正文永不出现） */
function renderAbstract(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  const v = value as EntryAbstract
  const lines = [
    `# ${v.title}`,
    '',
    v.summary,
    '',
    `- domain: ${v.domainPath}`,
    `- keywords: ${v.keywords.join(', ')}`,
    `- status: ${v.status}`,
  ]
  return [{ type: 'text', text: lines.join('\n') }]
}

/** EntryAbstract 的注册面输出 schema（contracts DTO 字段镜像） */
const READ_ABSTRACT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    entryId: { type: 'integer' },
    title: { type: 'string' },
    summary: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    status: { type: 'string' },
    domainPath: { type: 'string' },
  },
  required: ['entryId', 'title', 'summary', 'keywords', 'status', 'domainPath'],
} as const

/** tool 定义工厂（同 createSearchTool：deps 注入，纯函数体） */
export function createReadAbstractTool(deps: KnowledgeToolDeps): KnowledgeToolDefinition {
  return {
    name: 'knowledge_read_abstract',
    description:
      'Read the abstract (summary, keywords, status, domain) of one knowledge entry by its entry_id from knowledge_search hits. Abstract-first: the full document body is never returned.',
    parameters: {
      type: 'object',
      properties: {
        entry_id: {
          type: 'integer',
          description: 'The entryId from a knowledge_search hit.',
        },
      },
      required: ['entry_id'],
    },
    output: { schema: READ_ABSTRACT_OUTPUT_SCHEMA, render: renderAbstract },
    async execute(args: unknown, exec: ToolExecFace): Promise<EntryAbstract> {
      const parsed = parseReadAbstractArgs(args)
      const session = sessionContextOf(exec)
      if (session.cwd === undefined) throw unboundSessionError(session)
      const projectId = deps.resolveProjectId(session.cwd)
      if (projectId === undefined) throw unboundSessionError(session)
      const q: ReadAbstractQuery = {
        projectId,
        sessionId: session.sessionId,
        entryId: parsed.entry_id,
      }
      return deps.knowledge.readAbstract(q)
    },
  }
}
