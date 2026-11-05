// knowledge_supersede tool 定义（fix-评审2：裁决 #1 修订 2026-11-05——merge/revert 开为
// agent tool，自动执行保真；此前 SKILL 指示 agent 调不可达服务面通道；
// followups #1 重命名 2026-11-05：knowledge_merge → knowledge_supersede）。
// 归并四件套仍由服务面 supersedeEntry 单点承载（正本回写/台账/hash 校验/CAS）；
// 本 tool 只做参数面收窄与会话上下文解析（同 write/read 口径）。
import type { KnowledgeMergeOutcome, KnowledgeMergeQuery } from '../service/types.js'
import type { KnowledgeToolDefinition, ToolExecFace } from './faces.js'
import type { KnowledgeToolDeps } from './index.js'
import { sessionContextOf, unboundSessionError } from './session.js'

/** agent 面参数（snake_case——同 write/read 惯例） */
export interface SupersedeToolArgs {
  readonly winner_id: string
  readonly loser_id: string
  readonly reason?: string
  readonly expected_loser_hash?: string
}

/** 参数防御性收窄（执行点自证，同 parseWriteArgs 口径） */
export function parseSupersedeArgs(args: unknown): SupersedeToolArgs {
  if (typeof args !== 'object' || args === null) throw new Error('knowledge_supersede: arguments must be an object')
  const a = args as Record<string, unknown>
  const winnerId = a.winner_id
  if (typeof winnerId !== 'string' || winnerId.trim() === '') {
    throw new Error('knowledge_supersede: winner_id must be a non-empty string')
  }
  const loserId = a.loser_id
  if (typeof loserId !== 'string' || loserId.trim() === '') {
    throw new Error('knowledge_supersede: loser_id must be a non-empty string')
  }
  const out: { winner_id: string; loser_id: string; reason?: string; expected_loser_hash?: string } = {
    winner_id: winnerId,
    loser_id: loserId,
  }
  for (const key of ['reason', 'expected_loser_hash'] as const) {
    const v = a[key]
    if (v !== undefined) {
      if (typeof v !== 'string') throw new Error(`knowledge_supersede: ${key} must be a string`)
      out[key] = v
    }
  }
  return out
}

const SUPERSEDE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outcome: { type: 'string', description: 'merged | aborted | cas-failed' },
    winnerId: { type: 'string' },
    loserId: { type: 'string' },
    demotedFromConfirmed: { type: 'boolean' },
    reason: { type: 'string' },
    detail: { type: 'string' },
  },
  required: ['outcome'],
} as const

/** 回执 → 模型可见文本（merged：双方与降档；aborted/cas-failed：中止/拒因） */
function renderSupersede(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  const v = value as KnowledgeMergeOutcome
  if (v.outcome === 'merged') {
    return [
      {
        type: 'text',
        text: `merged: ${v.loserId} -> ${v.winnerId}${v.demotedFromConfirmed ? ' (loser was confirmed, demoted to superseded in the same step)' : ''} — loser file kept with merged_into redirect, ledger row actor=agent`,
      },
    ]
  }
  if (v.outcome === 'aborted') {
    return [{ type: 'text', text: `aborted (${v.reason}): ${v.detail}` }]
  }
  return [{ type: 'text', text: `cas-failed (${v.reason}): ${v.detail}` }]
}

/** tool 定义工厂（deps 注入服务与解析器——纯函数体） */
export function createSupersedeTool(deps: KnowledgeToolDeps): KnowledgeToolDefinition {
  return {
    name: 'knowledge_supersede',
    description:
      'Supersede one duplicate knowledge entry (loser) by redirecting it into another (winner) in the registered project knowledge base — automatic execution, fully reversible. The loser file is kept and its frontmatter gets a merged_into redirect (search demoted); the supersede ledger records actor=agent. A content_hash snapshot from evaluation time is re-checked before writing (expected_loser_hash) — a mismatch aborts that item; superseding an already-merged or unknown entry fails with cas-failed. The winner keeps its identity; fused content should be written beforehand via knowledge_write with version_of.',
    parameters: {
      type: 'object',
      properties: {
        winner_id: { type: 'string', description: 'The surviving entry id (slug) that absorbs the loser.' },
        loser_id: { type: 'string', description: 'The duplicate entry id (slug) to redirect into the winner; its file is never deleted.' },
        reason: { type: 'string', description: 'Rationale recorded in the supersede ledger.' },
        expected_loser_hash: {
          type: 'string',
          description: 'sha256 hex of the loser authority file as snapshotted during evaluation; re-checked before writing — a mismatch aborts (never supersede from stale content).',
        },
      },
      required: ['winner_id', 'loser_id'],
    },
    output: { schema: SUPERSEDE_OUTPUT_SCHEMA, render: renderSupersede },
    async execute(args: unknown, exec: ToolExecFace): Promise<KnowledgeMergeOutcome> {
      const parsed = parseSupersedeArgs(args)
      const session = sessionContextOf(exec)
      if (session.cwd === undefined) throw unboundSessionError(session)
      const projectId = deps.resolveProjectId(session.cwd)
      if (projectId === undefined) throw unboundSessionError(session)
      const q: KnowledgeMergeQuery = {
        projectId,
        winnerId: parsed.winner_id,
        loserId: parsed.loser_id,
        ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
        ...(parsed.expected_loser_hash !== undefined ? { expectedLoserHash: parsed.expected_loser_hash } : {}),
      }
      return deps.knowledge.supersedeEntry(q)
    },
  }
}
