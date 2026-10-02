// knowledge.search tool 定义（定位：业务）。参数 schema 与 KnowledgeService.search
// 同构（Interface 3）：projectId/sessionId 由会话上下文解析（session.ts），agent 面
// 仅见 domain_prefix（可选，省略 = 全域，agent 自主选域）/ keywords / text / limit；
// 返回 = contracts SearchHit[]（摘要先行），不自定形状（DTO 复用，AC1）。
import type { SearchHit, SearchQuery } from '@dsh-forge/contracts'
import type { KnowledgeToolDefinition, ToolExecFace } from './faces.js'
import type { KnowledgeToolDeps } from './index.js'
import { sessionContextOf, unboundSessionError } from './session.js'

/** agent 面参数（snake_case = dsh tool 惯例；映射 SearchQuery 去会话解析双键） */
export interface SearchToolArgs {
  readonly domain_prefix?: string
  readonly keywords?: readonly string[]
  readonly text?: string
  readonly limit?: number
}

/** 参数防御性收窄（无 defineTool 包装——注册面不做 schema 前置校验，执行点自证） */
export function parseSearchArgs(args: unknown): SearchToolArgs {
  if (typeof args !== 'object' || args === null) throw new Error('knowledge.search: arguments must be an object')
  const a = args as Record<string, unknown>
  const out: { domain_prefix?: string; keywords?: string[]; text?: string; limit?: number } = {}
  if (a.domain_prefix !== undefined) {
    if (typeof a.domain_prefix !== 'string') throw new Error('knowledge.search: domain_prefix must be a string')
    out.domain_prefix = a.domain_prefix
  }
  if (a.keywords !== undefined) {
    if (!Array.isArray(a.keywords) || a.keywords.some((k) => typeof k !== 'string')) {
      throw new Error('knowledge.search: keywords must be an array of strings')
    }
    out.keywords = a.keywords as string[]
  }
  if (a.text !== undefined) {
    if (typeof a.text !== 'string') throw new Error('knowledge.search: text must be a string')
    out.text = a.text
  }
  if (a.limit !== undefined) {
    if (typeof a.limit !== 'number' || !Number.isInteger(a.limit) || a.limit <= 0) {
      throw new Error('knowledge.search: limit must be a positive integer')
    }
    out.limit = a.limit
  }
  return out
}

/** 单命中行（摘要先行：标题/域/摘要/得分/entryId——read-abstract 的钥匙） */
function renderHit(hit: SearchHit): string {
  const id = hit.frontmatterId ?? `#${hit.entryId}`
  return `- [${hit.domainPath}] ${hit.title} (${id}, score ${hit.score.toFixed(2)}) — ${hit.summary}`
}

/** SearchHit 数组 → 模型可见文本（零命中显式声明，供 agent 决策回落检索原语） */
function renderHits(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  const hits = value as readonly SearchHit[]
  const body =
    hits.length === 0
      ? '(no knowledge entries matched — fall back to regular retrieval such as grep/glob)'
      : hits.map(renderHit).join('\n')
  return [{ type: 'text', text: body }]
}

/** SearchHit 的注册面输出 schema（contracts DTO 字段镜像，enforced subset 形状） */
const SEARCH_OUTPUT_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      entryId: { type: 'integer', description: 'index-stable entry id (read-abstract key)' },
      frontmatterId: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'stable frontmatter id when present' },
      title: { type: 'string' },
      summary: { type: 'string' },
      domainPath: { type: 'string' },
      score: { type: 'number' },
    },
    required: ['entryId', 'frontmatterId', 'title', 'summary', 'domainPath', 'score'],
  },
} as const

/** tool 定义工厂（deps 注入服务与解析器——纯函数体，无插件级状态） */
export function createSearchTool(deps: KnowledgeToolDeps): KnowledgeToolDefinition {
  return {
    name: 'knowledge.search',
    description:
      'Search the registered project knowledge base (summary-first). Omit domain_prefix to search all domains; combine with keywords or free text to narrow. Returns matching entries with title, summary, domain path, and score.',
    parameters: {
      type: 'object',
      properties: {
        domain_prefix: {
          type: 'string',
          description: 'Optional domain path prefix to restrict the search (e.g. "backend/api"); omit to search all domains.',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional keyword tags to narrow matches within the knowledge base.',
        },
        text: {
          type: 'string',
          description: 'Optional free-text query matched against entry titles and summaries.',
        },
        limit: {
          type: 'integer',
          description: 'Optional cap on the number of hits returned.',
        },
      },
    },
    output: { schema: SEARCH_OUTPUT_SCHEMA, render: renderHits },
    async execute(args: unknown, exec: ToolExecFace): Promise<readonly SearchHit[]> {
      const parsed = parseSearchArgs(args)
      const session = sessionContextOf(exec)
      if (session.cwd === undefined) throw unboundSessionError(session)
      const projectId = deps.resolveProjectId(session.cwd)
      if (projectId === undefined) throw unboundSessionError(session)
      const q: SearchQuery = {
        projectId,
        sessionId: session.sessionId,
        ...(parsed.domain_prefix !== undefined ? { domainPrefix: parsed.domain_prefix } : {}),
        ...(parsed.keywords !== undefined ? { keywords: [...parsed.keywords] } : {}),
        ...(parsed.text !== undefined ? { text: parsed.text } : {}),
        ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
      }
      return deps.knowledge.search(q)
    },
  }
}
