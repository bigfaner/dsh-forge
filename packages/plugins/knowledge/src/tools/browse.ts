// knowledge_browse tool 定义（knowledge-browse-tool 1.1——定位：业务）。只读导航动词：
// depth/关键词查询域目录（browseDomains 服务读法——browse 通道同底表 + KNOWLEDGE_DOMAINS
// 简介联查），零 recall_logs 写入（不进召回/热度口径）。入参 depth?: 1|2|3（缺省 3，
// 封顶目录层级）+ keyword?: string（域路径段 + 域简介子串不区分大小写——命中域保留，
// 其子域随路径前缀连带保留）；输出行「域路径（N 条）— 简介」（NULL → 无简介）按域路径字典序。
import type { KnowledgeToolDefinition, ToolExecFace } from './faces.js'
import type { KnowledgeToolDeps } from './index.js'
import type { DomainBrowseRow } from '../service/types.js'
import { sessionContextOf, unboundSessionError } from './session.js'

/** 目录层级上限（contracts 常量同源——写入面域层级上限一致） */
import { FRONTMATTER_DOMAIN_MAX_DEPTH } from '@dsh-forge/contracts'

/** agent 面参数（snake_case = dsh tool 惯例；全可选——缺省 = depth 3 全目录） */
export interface BrowseToolArgs {
  readonly depth?: number
  readonly keyword?: string
}

/** 参数防御性收窄（执行点自证——无 schema 前置校验，search 同款纪律） */
export function parseBrowseArgs(args: unknown): BrowseToolArgs {
  if (typeof args !== 'object' || args === null) throw new Error('knowledge_browse: arguments must be an object')
  const a = args as Record<string, unknown>
  const out: { depth?: number; keyword?: string } = {}
  if (a.depth !== undefined) {
    if (typeof a.depth !== 'number' || !Number.isInteger(a.depth) || a.depth < 1 || a.depth > FRONTMATTER_DOMAIN_MAX_DEPTH) {
      throw new Error(`knowledge_browse: depth must be an integer in 1..${FRONTMATTER_DOMAIN_MAX_DEPTH}`)
    }
    out.depth = a.depth
  }
  if (a.keyword !== undefined) {
    if (typeof a.keyword !== 'string') throw new Error('knowledge_browse: keyword must be a string')
    out.keyword = a.keyword
  }
  return out
}

/** 域路径祖先前缀集（含自身——`a/b/c` → a、a/b、a/b/c） */
function ancestorsOf(domainPath: string): readonly string[] {
  const segments = domainPath.split('/')
  return segments.map((_, i) => segments.slice(0, i + 1).join('/'))
}

/**
 * depth 封顶 + keyword 过滤（纯函数）：depth ≤ 封顶值；keyword 小写子串命中域路径段或
 * 域简介 → 命中集；行保留当且仅当其任一祖先前缀（含自身）在命中集——子域随前缀连带保留。
 */
export function filterDomainRows(
  rows: readonly DomainBrowseRow[],
  depth: number | undefined,
  keyword: string | undefined,
): readonly DomainBrowseRow[] {
  const capped = rows.filter((row) => row.depth <= (depth ?? FRONTMATTER_DOMAIN_MAX_DEPTH))
  const kw = keyword?.trim().toLowerCase() ?? ''
  if (kw === '') return capped
  const hits = new Set(
    capped
      .filter(
        (row) => row.domainPath.toLowerCase().includes(kw) || (row.description?.toLowerCase().includes(kw) ?? false),
      )
      .map((row) => row.domainPath),
  )
  return capped.filter((row) => ancestorsOf(row.domainPath).some((p) => hits.has(p)))
}

/** 单行渲染（「域路径（N 条）— 简介」；简介 NULL → 无简介） */
function renderRow(row: DomainBrowseRow): string {
  return `${row.domainPath}（${row.entryCount} 条）— ${row.description ?? '无简介'}`
}

/** 查询回显行（诚实回执——回显过滤条件，零兜底） */
function browseEcho(args: BrowseToolArgs): string {
  const parts: string[] = []
  if (args.depth !== undefined) parts.push(`depth=${String(args.depth)}`)
  if (args.keyword !== undefined) parts.push(`keyword="${args.keyword}"`)
  return parts.length > 0 ? parts.join(', ') : 'no filters (all domains)'
}

/** DomainBrowseRow[] → 模型可见文本（零命中诚实回执：空结果 + 查询回显，零兜底） */
function renderRows(args: BrowseToolArgs, value: unknown): readonly { type: 'text'; text: string }[] {
  const rows = value as readonly DomainBrowseRow[]
  const body =
    rows.length === 0
      ? `No domains matched (zero hits). Query: ${browseEcho(args)}. Zero hits means zero hits — no fallback was performed.`
      : rows.map(renderRow).join('\n')
  return [{ type: 'text', text: body }]
}

/** 注册面输出 schema（DomainBrowseRow 字段镜像，enforced subset 形状） */
const BROWSE_OUTPUT_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      domainPath: { type: 'string', description: 'full domain path (e.g. "lessons/windows")' },
      depth: { type: 'integer', description: 'tree depth (top-level domain = 1)' },
      entryCount: { type: 'number', description: 'entry count (confirmed + unconfirmed, includes subdomains)' },
      description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'domain description from knowledge_domains (null = unset)' },
    },
    required: ['domainPath', 'depth', 'entryCount', 'description'],
  },
} as const

/** tool 定义工厂（deps 注入服务与解析器——纯函数体，无插件级状态） */
export function createBrowseTool(deps: KnowledgeToolDeps): KnowledgeToolDefinition {
  return {
    name: 'knowledge_browse',
    description:
      'Browse the registered project knowledge-base domain tree (read-only navigation — never recorded as recall/heat). Returns domain rows sorted by path: "path (N entries) — description". Use depth (1..3, default 3) to cap tree levels and keyword (case-insensitive substring over domain paths and descriptions) to filter — a matched domain keeps its subdomains (descendants travel with the path prefix). Use it to pick a domain_prefix for knowledge_search when the prompt domain index is truncated.',
    parameters: {
      type: 'object',
      properties: {
        depth: {
          type: 'integer',
          description: 'Optional cap on tree levels (1 = top-level domains only; default 3).',
        },
        keyword: {
          type: 'string',
          description:
            'Optional case-insensitive substring filter matched against domain paths and descriptions; matching domains keep their subdomains.',
        },
      },
    },
    output: { schema: BROWSE_OUTPUT_SCHEMA, render: renderRows },
    async execute(args: unknown, exec: ToolExecFace): Promise<readonly DomainBrowseRow[]> {
      const parsed = parseBrowseArgs(args)
      const session = sessionContextOf(exec)
      if (session.cwd === undefined) throw unboundSessionError(session)
      const projectId = deps.resolveProjectId(session.cwd)
      if (projectId === undefined) throw unboundSessionError(session)
      const rows = await deps.knowledge.browseDomains({ projectId })
      const filtered = filterDomainRows(rows, parsed.depth, parsed.keyword)
      // 输出序 = 域路径字典序（服务面已按字典序返回；此处排序兜底工具契约不依赖服务实现序）
      return filtered.toSorted((a, b) => (a.domainPath < b.domainPath ? -1 : 1))
    },
  }
}
