// knowledge_search tool 定义（定位：业务——agentic search 编排层）。
// 编排语义（用户裁决 2026-11-11 定稿）：agent 先定域再拆同义词组作为检索 keywords
// → 服务端逐词检索取并集 → rerank 取前 limit（默认 3）条 → 粗筛零命中且指定了域
// → 自动弃域重试一次。返回 = { hint, hits }（hint = 单条检索说明字符串，承载编排
// 裁决与零命中动作指引，无则 null；命中行已带 summary——检索主流程不经
// read_abstract）。retry 参数标记换词重试调用：仍零命中时 hint 明示不要再检索。
import type { SearchHit, SearchQuery } from '../service/types.js'
import type { KnowledgeToolDefinition, ToolExecFace } from './faces.js'
import type { KnowledgeToolDeps } from './index.js'
import { sessionContextOf, unboundSessionError } from './session.js'

/** 单次子检索的候选池上限（并集原料——rerank 前的全量粗筛面） */
const POOL_LIMIT = 20

/** 同义词组词数上限（防编排面失控——超出截断，不拒收） */
const MAX_TERMS = 8

/** agent 面参数（snake_case = dsh tool 惯例；keywords = 同义词组，服务端并集） */
export interface SearchToolArgs {
  readonly domain_prefix?: string
  readonly keywords?: readonly string[]
  readonly text?: string
  readonly limit?: number
  /** 本次调用是换词重试（首查省略/传 false）——影响零命中 hint 的动作指引 */
  readonly retry?: boolean
}

/** 参数防御性收窄（无 defineTool 包装——注册面不做 schema 前置校验，执行点自证） */
export function parseSearchArgs(args: unknown): SearchToolArgs {
  if (typeof args !== 'object' || args === null) throw new Error('knowledge_search: arguments must be an object')
  const a = args as Record<string, unknown>
  const out: { domain_prefix?: string; keywords?: string[]; text?: string; limit?: number; retry?: boolean } = {}
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
    if (a.keywords !== undefined) parts.push(`keywords=${JSON.stringify(a.keywords)}`)
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
  /** 并集 rerank 后的精选命中（score 降序，至多 limit 条） */
  readonly hits: readonly SearchHit[]
}

/** 子检索组：一次尝试 = 同义词组逐词检索（并集原料） */
async function searchAttempt(
  search: (q: SearchQuery) => Promise<readonly SearchHit[]>,
  base: Omit<SearchQuery, 'keywords' | 'domainPrefix'>,
  terms: readonly string[],
  domainPrefix: string | undefined,
): Promise<SearchHit[]> {
  const queries: SearchQuery[] = terms.map((kw) => ({
    ...base,
    keywords: [kw],
    ...(domainPrefix !== undefined ? { domainPrefix } : {}),
    limit: POOL_LIMIT,
  }))
  if (queries.length === 0) {
    queries.push({ ...base, ...(domainPrefix !== undefined ? { domainPrefix } : {}), limit: POOL_LIMIT })
  }
  const batches = await Promise.all(queries.map((q) => search(q)))
  return batches.flat()
}

/** 并集去重（同条目取最高分）→ score 降序 rerank → 截前 limit 条。
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
      'Search the registered project knowledge base (agentic orchestration). Pick a domain first (domain_prefix from the <knowledge-domains> block, omit if unsure) and pass a keywords array of synonym terms — results are unioned, reranked by score, and capped to limit (default 3). Every hit already carries the entry summary. On zero hits the hint tells you what to do: reword once with retry=true, or stop searching when told to. Read the hint before the hits.',
    parameters: {
      type: 'object',
      properties: {
        domain_prefix: {
          type: 'string',
          description:
            'Optional domain path prefix (e.g. "backend/api") picked from the <knowledge-domains> block; omit if unsure. Dropped automatically on zero hits (retry without it, noted in the hint).',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Synonym / near-synonym term group as search keywords (up to 8): each term is searched separately and results are unioned — expansion compensates for wording mismatch.',
        },
        text: {
          type: 'string',
          description:
            'Optional free-text query, matched as a case-insensitive substring against entry titles and summaries — use a short term or phrase, not a full question sentence.',
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
          hint: { type: ['string', 'null'], description: 'single search note: orchestration facts and zero-hit action guidance — read before the hits' },
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
      const base: Omit<SearchQuery, 'keywords' | 'domainPrefix'> = {
        projectId,
        sessionId: session.sessionId,
        ...(parsed.text !== undefined ? { text: parsed.text } : {}),
      }
      const terms = [...new Set((parsed.keywords ?? []).map((k) => k.trim()).filter((k) => k !== ''))].slice(0, MAX_TERMS)
      const limit = parsed.limit ?? 3
      const isRetry = parsed.retry === true
      const parts: string[] = []

      const first = await searchAttempt(deps.knowledge.search.bind(deps.knowledge), base, terms, parsed.domain_prefix)
      let merged = unionRerank(first, limit)
      if (merged.length === 0 && parsed.domain_prefix !== undefined) {
        const second = await searchAttempt(deps.knowledge.search.bind(deps.knowledge), base, terms, undefined)
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
