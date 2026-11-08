// knowledge_browse tool 定义（knowledge-browse-tool 1.3 重构——定位：业务）。域内条目
// 清单模式（browseEntries 服务读法）：浏览域内文档的 title/keywords/摘要/状态（身份键
// = slug）。排序默认 confirmed 优先、同状态按创建序（order='created' 切纯创建序）；
// offset（默认 0）/limit（默认 5）分页。域目录树不再入工具面——动态域索引段每 turn
// 实时注入系统提示词（session-prompt 闭包求值），树查询是冗余形态。只读导航动词：
// 零 recall_logs 写入（不进召回/热度口径）。
import type { KnowledgeToolDefinition, ToolExecFace } from './faces.js'
import type { KnowledgeToolDeps } from './index.js'
import type { BrowseEntryItem } from '../service/types.js'
import { sessionContextOf, unboundSessionError } from './session.js'

/** 单页条数上限（防编排面失控——超出截断，不拒收） */
const MAX_LIMIT = 50

/** agent 面参数（snake_case = dsh tool 惯例；domain 必填） */
export interface BrowseToolArgs {
  readonly domain: string
  readonly offset?: number
  readonly limit?: number
  readonly order?: 'status' | 'created'
}

/** 参数防御性收窄（执行点自证——无 schema 前置校验，search 同款纪律） */
export function parseBrowseArgs(args: unknown): BrowseToolArgs {
  if (typeof args !== 'object' || args === null) throw new Error('knowledge_browse: arguments must be an object')
  const a = args as Record<string, unknown>
  if (typeof a.domain !== 'string' || a.domain.trim() === '') {
    throw new Error('knowledge_browse: domain must be a non-empty string (pick one from the <knowledge-domains> block)')
  }
  const out: { domain: string; offset?: number; limit?: number; order?: 'status' | 'created' } = { domain: a.domain }
  if (a.offset !== undefined) {
    if (typeof a.offset !== 'number' || !Number.isInteger(a.offset) || a.offset < 0) {
      throw new Error('knowledge_browse: offset must be a non-negative integer')
    }
    out.offset = a.offset
  }
  if (a.limit !== undefined) {
    if (typeof a.limit !== 'number' || !Number.isInteger(a.limit) || a.limit < 1 || a.limit > MAX_LIMIT) {
      throw new Error(`knowledge_browse: limit must be an integer in 1..${MAX_LIMIT}`)
    }
    out.limit = a.limit
  }
  if (a.order !== undefined) {
    if (a.order !== 'status' && a.order !== 'created') {
      throw new Error('knowledge_browse: order must be "status" or "created"')
    }
    out.order = a.order
  }
  return out
}

/** 条目清单单行渲染（「(slug) 标题 [状态] — 摘要｜keywords: …」；身份键 = slug） */
function renderEntryRow(row: BrowseEntryItem): string {
  const kw = row.keywords.length > 0 ? `｜keywords: ${row.keywords.join(', ')}` : ''
  return `- (${row.frontmatterId}) ${row.title} [${row.status}] — ${row.summary}${kw}`
}

/** 查询回显行（诚实回执——回显过滤条件，零兜底） */
function browseEcho(args: BrowseToolArgs): string {
  const parts: string[] = [`domain="${args.domain}"`]
  if (args.offset !== undefined) parts.push(`offset=${String(args.offset)}`)
  if (args.limit !== undefined) parts.push(`limit=${String(args.limit)}`)
  if (args.order !== undefined) parts.push(`order="${args.order}"`)
  return parts.join(', ')
}

/** BrowseEntryItem[] → 模型可见文本（零命中诚实回执：空结果 + 查询回显，零兜底） */
function renderEntries(args: BrowseToolArgs, rows: readonly BrowseEntryItem[]): readonly { type: 'text'; text: string }[] {
  const body =
    rows.length === 0
      ? `No entries matched (zero hits). Query: ${browseEcho(args)}. Zero hits means zero hits — no fallback was performed.`
      : rows.map(renderEntryRow).join('\n')
  return [{ type: 'text', text: body }]
}

/** 注册面输出 schema（BrowseEntryItem 字段镜像，enforced subset 形状） */
const ENTRIES_OUTPUT_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      frontmatterId: { type: 'string', description: 'stable slug id — the unified identity key (knowledge_read / knowledge_read_abstract)' },
      title: { type: 'string' },
      summary: { type: 'string' },
      keywords: { type: 'array', items: { type: 'string' } },
      status: { type: 'string', description: 'confirmed | unconfirmed | superseded' },
      domainPath: { type: 'string' },
    },
    required: ['frontmatterId', 'title', 'summary', 'keywords', 'status', 'domainPath'],
  },
} as const

/** tool 定义工厂（deps 注入服务与解析器——纯函数体，无插件级状态） */
export function createBrowseTool(deps: KnowledgeToolDeps): KnowledgeToolDefinition {
  return {
    name: 'knowledge_browse',
    description:
      'Browse entries in one knowledge domain (read-only navigation — never recorded as recall/heat). Pass a domain path from the <knowledge-domains> block (exact domain or subtree prefix): returns entries with title, keywords, summary and status, confirmed entries first by default (same status by creation order; order="created" for pure creation order), paged by offset (default 0) and limit (default 5). Every row carries the slug id (frontmatterId) usable by knowledge_read. The domain tree itself is already injected into the system prompt every turn.',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Domain path to list entries from (exact domain or subtree prefix, e.g. "lessons" or "lessons/windows") — pick one from the <knowledge-domains> block.',
        },
        offset: {
          type: 'integer',
          description: 'Pagination offset (default 0).',
        },
        limit: {
          type: 'integer',
          description: 'Page size (default 5, cap 50).',
        },
        order: {
          type: 'string',
          description: '"status" (default — confirmed first, same status by creation order) or "created" (pure creation order).',
        },
      },
      required: ['domain'],
    },
    output: { schema: ENTRIES_OUTPUT_SCHEMA, render: (args, value) => renderEntries(parseBrowseArgs(args), value as readonly BrowseEntryItem[]) },
    async execute(args: unknown, exec: ToolExecFace): Promise<readonly BrowseEntryItem[]> {
      const parsed = parseBrowseArgs(args)
      // 会话归因派生（stage④ 1.5——sessionContextOf 唯一派生点；browse 召回行落账归因）
      const session = sessionContextOf(exec, deps.emit)
      if (session.cwd === undefined) throw unboundSessionError(session)
      const projectId = deps.resolveProjectId(session.cwd)
      if (projectId === undefined) throw unboundSessionError(session)
      return deps.knowledge.browseEntries({
        projectId,
        sessionId: session.sessionId,
        domain: parsed.domain,
        ...(parsed.offset !== undefined ? { offset: parsed.offset } : {}),
        ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
        ...(parsed.order !== undefined ? { order: parsed.order } : {}),
        ...(session.turnSeq !== undefined ? { turnSeq: session.turnSeq } : {}),
        ...(session.triggerText !== undefined ? { triggerText: session.triggerText } : {}),
      })
    },
  }
}
