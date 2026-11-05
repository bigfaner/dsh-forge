// knowledge_search tool 定义（定位：业务）。参数 schema 与 KnowledgeService.search
// 同构（Interface 3）：projectId/sessionId 由会话上下文解析（session.ts），agent 面
// 仅见 domain_prefix（可选，省略 = 全域，agent 自主选域）/ keywords / text / limit；
// 返回 = SearchHit[]（摘要先行），不自定形状（DTO 复用，AC1）。
import type { SearchHit, SearchQuery } from '../service/types.js'
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
  if (typeof args !== 'object' || args === null) throw new Error('knowledge_search: arguments must be an object')
  const a = args as Record<string, unknown>
  const out: { domain_prefix?: string; keywords?: string[]; text?: string; limit?: number } = {}
  if (a.domain_prefix !== undefined) {
    if (typeof a.domain_prefix !== 'string') throw new Error('knowledge_search: domain_prefix must be a string')
    out.domain_prefix = a.domain_prefix
  }
  if (a.keywords !== undefined) {
    if (!Array.isArray(a.keywords) || a.keywords.some((k) => typeof k !== 'string')) {
      throw new Error('knowledge_search: keywords must be an array of strings')
    }
    out.keywords = a.keywords as string[]
  }
  if (a.text !== undefined) {
    if (typeof a.text !== 'string') throw new Error('knowledge_search: text must be a string')
    out.text = a.text
  }
  if (a.limit !== undefined) {
    if (typeof a.limit !== 'number' || !Number.isInteger(a.limit) || a.limit <= 0) {
      throw new Error('knowledge_search: limit must be a positive integer')
    }
    out.limit = a.limit
  }
  return out
}

/** 单命中行（摘要先行：标题/域/摘要/得分/rank/id——read-abstract/read 的钥匙） */
function renderHit(hit: SearchHit): string {
  const id = hit.frontmatterId ?? `#${hit.entryId}`
  return `- [${hit.domainPath}] ${hit.title} (${id}, score ${hit.score.toFixed(2)}, rank ${hit.effectiveRank.toFixed(1)}) — ${hit.summary}`
}

/** 查询回显行（诚实回执——回显查询词与过滤条件，零兜底：不注入建议，后续动作 agent 自行判断） */
function searchEcho(args: unknown): string {
  const parts: string[] = []
  if (typeof args === 'object' && args !== null) {
    const a = args as Record<string, unknown>
    if (a.domain_prefix !== undefined) parts.push(`domain_prefix="${String(a.domain_prefix)}"`)
    if (a.keywords !== undefined) parts.push(`keywords=${JSON.stringify(a.keywords)}`)
    if (a.text !== undefined) parts.push(`text="${String(a.text)}"`)
    if (a.limit !== undefined) parts.push(`limit=${String(a.limit)}`)
  }
  return parts.length > 0 ? parts.join(', ') : 'no filters (all domains)'
}

/** SearchHit 数组 → 模型可见文本（零命中诚实回执：空结果 + 查询回显 + 未命中明示，零兜底） */
function renderHits(args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  const hits = value as readonly SearchHit[]
  const body =
    hits.length === 0
      ? `No knowledge entries matched (zero hits). Query: ${searchEcho(args)}. Zero hits means zero hits — no fallback was performed.`
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
      effectiveRank: { type: 'number', description: 'admission rank: 1.0 confirmed / 0.6 unconfirmed / 0.4 conflict-isolated / 0.2 superseded-redirect' },
    },
    required: ['entryId', 'frontmatterId', 'title', 'summary', 'domainPath', 'score', 'effectiveRank'],
  },
} as const

/** tool 定义工厂（deps 注入服务与解析器——纯函数体，无插件级状态） */
export function createSearchTool(deps: KnowledgeToolDeps): KnowledgeToolDefinition {
  return {
    name: 'knowledge_search',
    description:
      'Search the registered project knowledge base (summary-first, ranked by BM25 relevance over title/keywords/summary metadata). Omit domain_prefix to search all domains; combine with keywords or free text to narrow. Matching is strict — keyword tags must match an entry keyword exactly (AND) and text terms must all appear — so keep queries short: start with one high-signal keyword or a short text term, then refine. Returns matching entries with title, summary, domain path, and score. Zero hits returns an honest empty receipt.',
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
          description:
            'Optional keyword tags to narrow matches — every tag must match an entry keyword exactly (AND narrowing), so pass only high-confidence tags (one or two).',
        },
        text: {
          type: 'string',
          description:
            'Optional free-text query, matched as a case-insensitive substring against entry titles and summaries — use a short term or phrase, not a full question sentence.',
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
