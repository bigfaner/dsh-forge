// knowledge_write tool 定义（stage② §2.3 严契约写入门）。参数 snake_case（dsh tool
// 惯例）；必要性三问为 agent 自判必答项（stable/non_trivial/value + reason——不过不写）；
// 五类 type 预判 + 查重归并建议随回执返回（不拒收）；version_of 显式声明同概念版本化
//（复用 id 走 supersedes 链，与 candidate_of 互斥）。
import type { KnowledgeWriteOutcome, KnowledgeWriteQuery, NecessityAnswers } from '../service/types.js'
import type { KnowledgeToolDefinition, ToolExecFace, ToolParametersSchema } from './faces.js'
import type { KnowledgeToolDeps } from './index.js'
import { sessionContextOf, unboundSessionError } from './session.js'

/** agent 面参数 */
export interface WriteToolArgs {
  readonly title: string
  readonly summary: string
  readonly keywords: readonly string[]
  readonly body: string
  readonly domain?: string
  readonly type?: string
  readonly procedure?: boolean
  readonly slug_hint?: string
  readonly version_of?: string
  readonly necessity: NecessityAnswers
}

function asString(a: Record<string, unknown>, key: string): string {
  const v = a[key]
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`knowledge_write: ${key} must be a non-empty string`)
  return v
}

/** 参数防御性收窄（执行点自证，同 parseSearchArgs 口径）。必要性三问平铺为
 *  necessity.stable / necessity.non_trivial / necessity.value 三键（enforced JSON schema
 *  subset 无嵌套 object——参数面平铺，服务面聚合为 NecessityAnswers）。 */
export function parseWriteArgs(args: unknown): WriteToolArgs {
  if (typeof args !== 'object' || args === null) throw new Error('knowledge_write: arguments must be an object')
  const a = args as Record<string, unknown>
  const stable = a['necessity.stable']
  const nonTrivial = a['necessity.non_trivial']
  const value = a['necessity.value']
  if (typeof stable !== 'boolean' || typeof nonTrivial !== 'boolean' || typeof value !== 'boolean') {
    throw new Error('knowledge_write: necessity.stable / non_trivial / value must all be answered booleans (three-question gate)')
  }
  const necessity: NecessityAnswers = {
    stable,
    nonTrivial: nonTrivial,
    value,
    ...(typeof a['necessity.reason'] === 'string' ? { reason: a['necessity.reason'] as string } : {}),
  }
  const keywords = a.keywords
  if (!Array.isArray(keywords) || keywords.some((k) => typeof k !== 'string')) {
    throw new Error('knowledge_write: keywords must be an array of strings')
  }
  const out: {
    title: string
    summary: string
    keywords: string[]
    body: string
    domain?: string
    type?: string
    procedure?: boolean
    slug_hint?: string
    version_of?: string
    necessity: NecessityAnswers
  } = {
    title: asString(a, 'title'),
    summary: asString(a, 'summary'),
    keywords: keywords as string[],
    body: asString(a, 'body'),
    necessity,
  }
  for (const key of ['domain', 'type', 'slug_hint', 'version_of'] as const) {
    const v = a[key]
    if (v !== undefined) {
      if (typeof v !== 'string') throw new Error(`knowledge_write: ${key} must be a string`)
      out[key] = v
    }
  }
  if (a.procedure !== undefined && typeof a.procedure !== 'boolean') {
    throw new Error('knowledge_write: procedure must be a boolean')
  }
  if (a.procedure === true) out.procedure = true
  return out as WriteToolArgs
}

const WRITE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outcome: { type: 'string', description: 'written | not-written | rejected' },
    id: { type: 'string', description: 'entry slug id (stable, agent-visible)' },
    versionTs: { type: 'string' },
    filePath: { type: 'string' },
    typeJudged: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    typePending: { type: 'boolean' },
    mergeSuggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          basis: { type: 'string' },
          similarity: { type: 'number' },
        },
        required: ['id', 'title', 'basis'],
      },
    },
    candidateOf: { type: 'string' },
    supersedes: { type: 'string' },
    reason: { type: 'string' },
    field: { type: 'string' },
    detail: { type: 'string' },
  },
  required: ['outcome'],
} as const

/** 回执 → 模型可见文本（written：id/版本/建议；not-written/rejected：拒因与弃置依据） */
function renderWrite(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  const v = value as KnowledgeWriteOutcome
  if (v.outcome === 'written') {
    const lines = [
      `written: id=${v.id} version=${v.versionTs}`,
      `file: ${v.filePath}`,
      `type=${String(v.typeJudged ?? '(none)')}${v.typePending ? ' (pending — low-confidence judgement, procedure default applied)' : ''}`,
      ...(v.supersedes !== undefined ? [`supersedes: ${v.supersedes} (same-id versioning)`] : []),
      ...(v.candidateOf !== undefined ? [`candidate_of: ${v.candidateOf} (suspected duplicate — merge suggestion)`] : []),
      ...(v.mergeSuggestions.length > 0
        ? [`merge suggestions:`, ...v.mergeSuggestions.map((s) => `  - ${s.id} (${s.basis}, ${String(s.similarity ?? '')}) — consider versioning (version_of=${s.id}) or merging instead`)]
        : []),
    ]
    return [{ type: 'text', text: lines.join('\n') }]
  }
  if (v.outcome === 'not-written') {
    return [{ type: 'text', text: `not-written: necessity gate failed — ${v.detail}` }]
  }
  return [{ type: 'text', text: `rejected (${v.reason}${v.field !== undefined ? `: ${v.field}` : ''}): ${v.detail}` }]
}

const WRITE_PARAMETERS: ToolParametersSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Entry title (display name; the slug id is generated once from it or from slug_hint).' },
    summary: { type: 'string', description: 'Frontmatter summary (original abstract — the read-abstract layer returns it verbatim).' },
    keywords: {
      type: 'array',
      items: { type: 'string' },
      description: 'Keyword tags (lowercase normalized controlled vocabulary).',
    },
    body: { type: 'string', description: 'Markdown body (the full document content).' },
    domain: { type: 'string', description: 'Optional domain directory path within the knowledge dir (at most 3 levels); omit for the root domain.' },
    type: { type: 'string', description: 'One of conventions | pitfalls | decisions | lessons | facts (five-type machine pre-check applies).' },
    procedure: { type: 'boolean', description: 'Optional procedure form tag (independent dimension — never rewrites the type judgement).' },
    slug_hint: { type: 'string', description: 'English translation hint for a non-ASCII title (slug id generation chain fallback).' },
    version_of: { type: 'string', description: 'Existing entry id when this write is a same-concept update (same-id versioning via supersedes; mutually exclusive with candidate_of).' },
    'necessity.stable': { type: 'boolean', description: 'Mandatory three-question gate ①: long-term stable (not one-off session context).' },
    'necessity.non_trivial': { type: 'boolean', description: 'Mandatory three-question gate ②: non-commonsense (generic engineering common sense does not belong here).' },
    'necessity.value': { type: 'boolean', description: 'Mandatory three-question gate ③: estimated value for this project domain.' },
    'necessity.reason': { type: 'string', description: 'Optional rationale (visible in the discard trace when the gate fails).' },
  },
  required: ['title', 'summary', 'keywords', 'body', 'necessity.stable', 'necessity.non_trivial', 'necessity.value'],
}

/** tool 定义工厂（deps 注入服务与解析器——纯函数体） */
export function createWriteTool(deps: KnowledgeToolDeps): KnowledgeToolDefinition {
  return {
    name: 'knowledge_write',
    description:
      'Write one knowledge entry to the registered project knowledge base (strict contract). A mandatory self-judged necessity gate applies: the write is skipped unless the knowledge is long-term stable, non-commonsense, and valuable for this project. The slug id is generated once (title normalization / slug_hint / keywords / hash fallback) and never changes; pass version_of to version an existing entry (same id, supersedes chain) instead of creating a duplicate. Duplicate-detection returns merge suggestions (never rejects). Strict rejections: illegal domain path, YAML round-trip loss, missing required fields.',
    parameters: WRITE_PARAMETERS,
    output: { schema: WRITE_OUTPUT_SCHEMA, render: renderWrite },
    async execute(args: unknown, exec: ToolExecFace): Promise<KnowledgeWriteOutcome> {
      const parsed = parseWriteArgs(args)
      const session = sessionContextOf(exec)
      if (session.cwd === undefined) throw unboundSessionError(session)
      const projectId = deps.resolveProjectId(session.cwd)
      if (projectId === undefined) throw unboundSessionError(session)
      const q: KnowledgeWriteQuery = {
        projectId,
        sessionId: session.sessionId,
        title: parsed.title,
        summary: parsed.summary,
        keywords: [...parsed.keywords],
        body: parsed.body,
        ...(parsed.domain !== undefined ? { domain: parsed.domain } : {}),
        ...(parsed.type !== undefined ? { type: parsed.type } : {}),
        ...(parsed.procedure !== undefined ? { procedure: parsed.procedure } : {}),
        ...(parsed.slug_hint !== undefined ? { slugHint: parsed.slug_hint } : {}),
        ...(parsed.version_of !== undefined ? { versionOf: parsed.version_of } : {}),
        necessity: parsed.necessity,
      }
      return deps.knowledge.write(q)
    },
  }
}
