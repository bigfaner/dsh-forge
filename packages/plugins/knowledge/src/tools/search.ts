// knowledge_search tool 定义（定位：业务——agentic search 编排层）。
// 编排语义（stage④ 1.4 收敛）：agent 可选定域（domain_prefix）+ 自由词面（text）→
// 服务端全域检索（BM25 三因子）→ rerank 取前 limit（默认 3）条 → 粗筛零命中且指定了域
// → 自动弃域重试一次。keywords 调用参数退役（agent 无从预知条目标签词汇，实践恒空）——
// 词面统一走 text（keywords 列仍为 BM25 匹配面元数据，query 词元照常命中）。返回 =
// { hint, hits }（hint = 单条检索说明字符串，承载编排裁决与零命中动作指引，无则 null；
// 命中行已带 summary——检索主流程不经 read_abstract）。retry 参数维持现役：标记换词
// 重试调用，仍零命中时 hint 明示不要再检索。
import type { SearchHit, SearchQuery } from '../service/types.js'
import type { KnowledgeToolDefinition, ToolExecFace } from './faces.js'
import type { KnowledgeToolDeps } from './index.js'
import { sessionContextOf, unboundSessionError } from './session.js'

/** 单次检索的候选池上限（rerank 前的全量粗筛面） */
const POOL_LIMIT = 20

/** agent 面参数（snake_case = dsh tool 惯例；键集 = domain_prefix/text/limit/retry——keywords 退役） */
export interface SearchToolArgs {
  readonly domain_prefix?: string
  readonly text?: string
  readonly limit?: number
  /** 本次调用是换词重试（首查省略/传 false）——影响零命中 hint 的动作指引 */
  readonly retry?: boolean
}

/** 参数防御性收窄（无 defineTool 包装——注册面不做 schema 前置校验，执行点自证） */
export function parseSearchArgs(args: unknown): SearchToolArgs {
  if (typeof args !== 'object' || args === null) throw new Error('knowledge_search: arguments must be an object')
  const a = args as Record<string, unknown>
  const out: { domain_prefix?: string; text?: string; limit?: number; retry?: boolean } = {}
  if (a.domain_prefix !== undefined) {
    if (typeof a.domain_prefix !== 'string') throw new Error('knowledge_search: domain_prefix must be a string')
    out.domain_prefix = a.domain_prefix
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
  if (a.retry !== undefined) {
    if (typeof a.retry !== 'boolean') throw new Error('knowledge_search: retry must be a boolean')
    out.retry = a.retry
  }
  return out
}

/** 单命中行（摘要先行：标题/域/摘要/得分/rank——id 恒为 slug（frontmatterId），knowledge_read 的钥匙） */
function renderHit(hit: SearchHit): string {
  return `- [${hit.domainPath}] ${hit.title} (${hit.frontmatterId}, score ${hit.score.toFixed(2)}, rank ${hit.effectiveRank.toFixed(1)}) — ${hit.summary}`
}

/** 查询回显行（诚实回执——回显查询词与过滤条件，零兜底：不注入建议） */
function searchEcho(args: unknown): string {
  const parts: string[] = []
  if (typeof args === 'object' && args !== null) {
    const a = args as Record<string, unknown>
    if (a.domain_prefix !== undefined) parts.push(`domain_prefix="${String(a.domain_prefix)}"`)
    if (a.text !== undefined) parts.push(`text="${String(a.text)}"`)
    if (a.limit !== undefined) parts.push(`limit=${String(a.limit)}`)
    if (a.retry !== undefined) parts.push(`retry=${String(a.retry)}`)
  }
  return parts.length > 0 ? parts.join(', ') : 'no filters (all domains)'
}

/** 检索结果整体（hits + hint——单条检索说明，承载编排裁决与零命中动作指引） */
export interface SearchOutcome {
  /** 检索说明（单条；无 = null） */
  readonly hint: string | null
  /** rerank 后的精选命中（score 降序，至多 limit 条） */
  readonly hits: readonly SearchHit[]
}

/** 单次检索尝试（text 词面 + 可选域前缀 + 候选池上限） */
async function searchAttempt(
  search: (q: SearchQuery) => Promise<readonly SearchHit[]>,
  base: Omit<SearchQuery, 'domainPrefix'>,
  domainPrefix: string | undefined,
): Promise<readonly SearchHit[]> {
  return search({
    ...base,
    ...(domainPrefix !== undefined ? { domainPrefix } : {}),
    limit: POOL_LIMIT,
  })
}

/** 去重（同条目取最高分）→ score 降序 rerank → 截前 limit 条。
 * frontmatterId 恒在场（rebuild 拒收无 id 文件——索引供数保证），全工具 slug 身份键。 */
function unionRerank(all: readonly SearchHit[], limit: number): SearchHit[] {
  const best = new Map<number, SearchHit>()
  for (const h of all) {
    const prev = best.get(h.entryId)
    if (prev === undefined || h.score > prev.score) best.set(h.entryId, h)
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

/** 零命中动作指引（retry 语义：首查可重试一次；重试仍零 → 终止检索） */
function zeroHitHint(retry: boolean): string {
  return retry
    ? 'zero hits on retry — do not search again; treat the knowledge base as having no such content and fall back to original files.'
    : 'zero hits. You may reword once and retry with retry=true.'
}

/** tool 定义工厂（deps 注入服务与解析器——纯函数体，无插件级状态） */
export function createSearchTool(deps: KnowledgeToolDeps): KnowledgeToolDefinition {
  return {
    name: 'knowledge_search',
    description:
      'Search the registered knowledge bases (all registered domains are covered). Optionally pick a domain first (domain_prefix from the <knowledge-domains> block, omit if unsure) and pass a free-text query — results are reranked by score and capped to limit (default 3). Every hit already carries the entry summary. On zero hits the hint tells you what to do: reword once with retry=true, or stop searching when told to. Read the hint before the hits.',
    parameters: {
      type: 'object',
      properties: {
        domain_prefix: {
          type: 'string',
          description:
            'Optional domain path prefix (e.g. "backend/api") picked from the <knowledge-domains> block; omit if unsure. Dropped automatically on zero hits (retry without it, noted in the hint).',
        },
        text: {
          type: 'string',
          description:
            'Free-text query — matched against entry titles, summaries and keywords (BM25); short terms or phrases work best, not full question sentences.',
        },
        limit: {
          type: 'integer',
          description: 'Cap on selected hits returned after rerank (default 3).',
        },
        retry: {
          type: 'boolean',
          description:
            'Set true when this call is a reworded retry. On zero hits the hint then instructs you to stop searching instead of retrying again.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          hint: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'single search note: orchestration facts and zero-hit action guidance — read before the hits' },
          hits: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                entryId: { type: 'integer', description: 'index rowid (diagnostic only — not the knowledge_read key)' },
                frontmatterId: { type: 'string', description: 'stable slug id — the unified identity key across knowledge tools (knowledge_read / knowledge_read_abstract)' },
                title: { type: 'string' },
                summary: { type: 'string' },
                domainPath: { type: 'string' },
                score: { type: 'number' },
                effectiveRank: { type: 'number', description: 'admission rank: 1.0 confirmed / 0.6 unconfirmed / 0.4 conflict-isolated / 0.2 superseded-redirect' },
              },
              required: ['entryId', 'frontmatterId', 'title', 'summary', 'domainPath', 'score', 'effectiveRank'],
            },
          },
        },
        required: ['hint', 'hits'],
      },
      render: renderOutcome,
    },
    async execute(args: unknown, exec: ToolExecFace): Promise<SearchOutcome> {
      const parsed = parseSearchArgs(args)
      const session = sessionContextOf(exec)
      if (session.cwd === undefined) throw unboundSessionError(session)
      const projectId = deps.resolveProjectId(session.cwd)
      if (projectId === undefined) throw unboundSessionError(session)
      const base: Omit<SearchQuery, 'domainPrefix'> = {
        projectId,
        sessionId: session.sessionId,
        ...(parsed.text !== undefined ? { text: parsed.text } : {}),
      }
      const limit = parsed.limit ?? 3
      const isRetry = parsed.retry === true
      const parts: string[] = []

      const first = await searchAttempt(deps.knowledge.search.bind(deps.knowledge), base, parsed.domain_prefix)
      let merged = unionRerank(first, limit)
      if (merged.length === 0 && parsed.domain_prefix !== undefined) {
        const second = await searchAttempt(deps.knowledge.search.bind(deps.knowledge), base, undefined)
        const retried = unionRerank(second, limit)
        if (retried.length > 0) {
          parts.push(
            `domain "${parsed.domain_prefix}" was dropped after zero hits; retried across all domains — ${retried.length} hit(s) found.`,
          )
          merged = retried
        } else {
          parts.push(`domain "${parsed.domain_prefix}" was dropped after zero hits; the retry across all domains found nothing.`)
        }
      }
      if (merged.length === 0) parts.push(zeroHitHint(isRetry))
      return { hint: parts.length > 0 ? parts.join(' ') : null, hits: merged }
    },
  }
}

/** 检索结果 → 模型可见文本（hint 行在前；零命中且无 hint = 诚实空回执，零兜底） */
function renderOutcome(args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  const { hint, hits } = value as SearchOutcome
  const lines = hint !== null ? [`hint: ${hint}`] : []
  if (hits.length === 0) {
    if (hint === null) {
      lines.push(
        `No knowledge entries matched (zero hits). Query: ${searchEcho(args)}. Zero hits means zero hits — no fallback was performed.`,
      )
    } else {
      lines.push(`Query: ${searchEcho(args)}.`)
    }
  } else {
    lines.push(...hits.map(renderHit))
  }
  return [{ type: 'text', text: lines.join('\n') }]
}
