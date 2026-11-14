// knowledge_read tool 定义（stage② §2.3 读全文——用户裁决 2026-11-04 增补）。
// 三层召回链终点：search（FTS 命中）→ read-abstract（frontmatter summary 原文）→
// knowledge_read（md 全文）。准入（§2.4）：confirmed 全开 / unconfirmed 拒正文且不露
// 存在性（denied 回执与未知 id 同形——CT-WG-14 O2）/ superseded 曾审可读。
// 参数面 = 条目 id（slug——agent 可见稳定标识，随 search 结果返回）。
import type { KnowledgeReadOutcome, KnowledgeReadQuery } from '../service/types.js'
import type { KnowledgeToolDefinition, ToolExecFace } from './faces.js'
import type { KnowledgeToolDeps } from './index.js'
import { sessionContextOf, unboundSessionError } from './session.js'

/** agent 面参数 */
export interface ReadToolArgs {
  readonly id: string
}

/** 参数防御性收窄（执行点自证，同 parseReadAbstractArgs 口径） */
export function parseReadArgs(args: unknown): ReadToolArgs {
  if (typeof args !== 'object' || args === null) throw new Error('knowledge_read: arguments must be an object')
  const a = args as Record<string, unknown>
  if (typeof a.id !== 'string' || a.id.trim() === '') {
    throw new Error('knowledge_read: id must be a non-empty string (the entry id from knowledge_search hits)')
  }
  return { id: a.id }
}

const READ_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outcome: { type: 'string', description: 'read | denied' },
    id: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'string' },
    versionTs: { type: 'string' },
    body: { type: 'string', description: 'Full markdown document (byte-equal with the on-disk file).' },
    message: { type: 'string' },
  },
  required: ['outcome'],
} as const

/** 回执 → 模型可见文本（read：全文；denied：通用拒读文案——不露存在性） */
function renderRead(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  const v = value as KnowledgeReadOutcome
  if (v.outcome === 'read') {
    return [{ type: `text`, text: `# ${v.title} (${v.id}, ${v.status}, version ${v.versionTs})\n\n${v.body}` }]
  }
  return [{ type: 'text', text: v.message }]
}

/** tool 定义工厂（deps 注入服务与解析器——纯函数体） */
export function createReadTool(deps: KnowledgeToolDeps): KnowledgeToolDefinition {
  return {
    name: 'knowledge_read',
    description:
      'Read the full markdown body of one knowledge entry by its id (the stable slug id returned by knowledge_search). Admission: confirmed entries are fully readable; superseded versions that were once confirmed remain readable; unconfirmed drafts are denied full-text access without revealing whether they exist.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The entry id (slug) from a knowledge_search hit (frontmatterId).',
        },
      },
      required: ['id'],
    },
    output: { schema: READ_OUTPUT_SCHEMA, render: renderRead },
    async execute(args: unknown, exec: ToolExecFace): Promise<KnowledgeReadOutcome> {
      const parsed = parseReadArgs(args)
      // 会话归因派生（stage④ 1.5——sessionContextOf 唯一派生点）
      const session = sessionContextOf(exec, deps.emit)
      if (session.cwd === undefined) throw unboundSessionError(session)
      const projectId = deps.resolveProjectId(session.cwd)
      if (projectId === undefined) throw unboundSessionError(session)
      const q: KnowledgeReadQuery = {
        projectId,
        sessionId: session.sessionId,
        id: parsed.id,
        ...(session.turnSeq !== undefined ? { turnSeq: session.turnSeq } : {}),
        ...(session.triggerText !== undefined ? { triggerText: session.triggerText } : {}),
      }
      return deps.knowledge.read(q)
    },
  }
}
