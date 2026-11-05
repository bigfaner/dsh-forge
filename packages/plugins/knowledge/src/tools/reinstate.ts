// knowledge_reinstate tool 定义（fix-评审2：裁决 #1 修订 2026-11-05——merge/revert 开为
// agent tool；followups #1 重命名 2026-11-05：knowledge_revert → knowledge_reinstate）。
// 驳回逆向仍由服务面 reinstateEntry 单点承载（解除 redirect / 台账 actor=human /
// 不可凭空回滚）；本 tool 只做参数面收窄与会话上下文解析（同 supersede tool 口径）。
import type { KnowledgeRevertOutcome, KnowledgeRevertQuery } from '../service/types.js'
import type { KnowledgeToolDefinition, ToolExecFace } from './faces.js'
import type { KnowledgeToolDeps } from './index.js'
import { sessionContextOf, unboundSessionError } from './session.js'

/** agent 面参数（snake_case） */
export interface ReinstateToolArgs {
  readonly loser_id: string
  readonly winner_id?: string
  readonly reason?: string
  readonly expected_loser_hash?: string
}

/** 参数防御性收窄（执行点自证，同 parseSupersedeArgs 口径） */
export function parseReinstateArgs(args: unknown): ReinstateToolArgs {
  if (typeof args !== 'object' || args === null) throw new Error('knowledge_reinstate: arguments must be an object')
  const a = args as Record<string, unknown>
  const loserId = a.loser_id
  if (typeof loserId !== 'string' || loserId.trim() === '') {
    throw new Error('knowledge_reinstate: loser_id must be a non-empty string')
  }
  const out: { loser_id: string; winner_id?: string; reason?: string; expected_loser_hash?: string } = { loser_id: loserId }
  for (const key of ['winner_id', 'reason', 'expected_loser_hash'] as const) {
    const v = a[key]
    if (v !== undefined) {
      if (typeof v !== 'string') throw new Error(`knowledge_reinstate: ${key} must be a string`)
      out[key] = v
    }
  }
  return out
}

const REINSTATE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outcome: { type: 'string', description: 'reverted | aborted | rejected' },
    loserId: { type: 'string' },
    winnerId: { type: 'string' },
    restoredStatus: { type: 'string' },
    reason: { type: 'string' },
    detail: { type: 'string' },
  },
  required: ['outcome'],
} as const

/** 回执 → 模型可见文本（reverted：恢复档位；aborted/rejected：中止/拒因） */
function renderReinstate(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  const v = value as KnowledgeRevertOutcome
  if (v.outcome === 'reverted') {
    return [
      {
        type: 'text',
        text: `reverted: ${v.loserId} redirect released (restored status ${v.restoredStatus}, rank re-derived); winner ${v.winnerId} fused body kept — ledger row actor=human`,
      },
    ]
  }
  if (v.outcome === 'aborted') {
    return [{ type: 'text', text: `aborted (${v.reason}): ${v.detail}` }]
  }
  return [{ type: 'text', text: `rejected (${v.reason}): ${v.detail}` }]
}

/** tool 定义工厂（deps 注入服务与解析器——纯函数体） */
export function createReinstateTool(deps: KnowledgeToolDeps): KnowledgeToolDefinition {
  return {
    name: 'knowledge_reinstate',
    description:
      'Reinstate one superseded knowledge entry (undo the merged_into redirect on a loser entry) in the registered project knowledge base — recorded in the supersede ledger with actor=human. The loser regains independent retrieval status (rank re-derived; once-confirmed entries restore the confirmed tier); the winner keeps its fused body untouched. Rejected when the entry is not in a merged state or no agent supersede ledger row exists (no reinstating out of thin air); a content_hash mismatch between the loser file and the evaluation-time snapshot aborts (expected_loser_hash).',
    parameters: {
      type: 'object',
      properties: {
        loser_id: { type: 'string', description: 'The merged entry id (slug) whose redirect should be released.' },
        winner_id: { type: 'string', description: 'Expected merge target (defaults to the current merged_into value; a mismatch rejects).' },
        reason: { type: 'string', description: 'Rationale for the human-side rejection, recorded in the supersede ledger.' },
        expected_loser_hash: {
          type: 'string',
          description: 'sha256 hex snapshot of the loser authority file; re-checked before writing — a mismatch aborts.',
        },
      },
      required: ['loser_id'],
    },
    output: { schema: REINSTATE_OUTPUT_SCHEMA, render: renderReinstate },
    async execute(args: unknown, exec: ToolExecFace): Promise<KnowledgeRevertOutcome> {
      const parsed = parseReinstateArgs(args)
      const session = sessionContextOf(exec)
      if (session.cwd === undefined) throw unboundSessionError(session)
      const projectId = deps.resolveProjectId(session.cwd)
      if (projectId === undefined) throw unboundSessionError(session)
      const q: KnowledgeRevertQuery = {
        projectId,
        loserId: parsed.loser_id,
        ...(parsed.winner_id !== undefined ? { winnerId: parsed.winner_id } : {}),
        ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
        ...(parsed.expected_loser_hash !== undefined ? { expectedLoserHash: parsed.expected_loser_hash } : {}),
      }
      return deps.knowledge.reinstateEntry(q)
    },
  }
}
