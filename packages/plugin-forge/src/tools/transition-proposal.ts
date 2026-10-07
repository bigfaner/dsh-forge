// transitionProposal tool 定义（定位：业务——M3 终态六动词之一；M3 双面动词
// ——tool + RPC（UF-1 人工裁决；Interface 4 drift 修订 #2）。裁决转移：→ accepted/
// rejected 写 decided_at（覆盖式最新裁决时刻）；from≠to 校验同源
//（ERR_INVALID_TRANSITION——core 侧拒绝面）。to_status='superseded' 必带
// superseded_by（目标提案 id 在场校验 → 写 proposals.superseded_by——UF-1 取代链
// 数据面；缺带校验经服务 2.2，tool 面纯透传零业务逻辑）。返回 = contracts
// TransitionProposalResult（accepted ∧ expedition 成链时携带 chained FeatureRow
// ——render 单独一行回报）。注意与 transitionTask 的面分治：transitionTask 仅人类
// RPC 通道可达，本插件不注册。
// 返回面双友好（裁决⑨）：成功 formatOk；typed 服务错误 → 失败 DTO formatErr。
import {
  PROPOSAL_STATUSES,
  type FeatureRow,
  type ProposalStatus,
  type TransitionProposalInput,
  type TransitionProposalResult,
} from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalString, requireArgsObject, requiredEnum, requiredString } from './args.js'
import {
  callToolFace,
  formatFailure,
  formatOk,
  isForgeToolFailure,
  withFailureVariant,
  type ForgeToolFailure,
} from './format.js'
import { proposalRowEntries } from './create-proposal.js'
import { requireProjectId, sessionContextOf } from './session.js'

const TOOL = 'transitionProposal'

/** TransitionProposalResult 的注册面输出 schema（ProposalRow 镜像 + chained 成链支 + 失败支） */
const TRANSITION_PROPOSAL_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  additionalProperties: false,
  properties: {
    proposalId: { type: 'string' },
    slug: { type: 'string' },
    title: { type: 'string' },
    proposalStatus: { type: 'string', description: 'Status after the transition.' },
    relPath: { type: 'string' },
    decidedAt: { type: 'string', description: 'Set when the transition is a verdict (accepted/rejected).' },
    mode: { type: 'string' },
    supersededBy: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    chained: {
      type: 'object',
      description: 'Feature row registered in the same transaction (accepted on an expedition-mode proposal).',
      properties: {
        featureId: { type: 'string' },
        slug: { type: 'string' },
        title: { type: 'string' },
        featureStatus: { type: 'string' },
        summary: { type: 'string' },
        proposalId: { type: 'string' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      required: ['featureId', 'slug', 'title', 'featureStatus', 'createdAt', 'updatedAt'],
    },
  },
  required: ['proposalId', 'slug', 'title', 'proposalStatus', 'createdAt', 'updatedAt'],
})

/** agent 面参数 */
export interface TransitionProposalToolArgs {
  /** 目标提案（uuid——createProposal 返回锚） */
  readonly proposal_id: string
  readonly to_status: ProposalStatus
  /** superseded 必带（取代链目标提案 uuid——在场校验经服务 2.2） */
  readonly superseded_by?: string
}

/** 参数防御性收窄 */
export function parseTransitionProposalArgs(args: unknown): TransitionProposalToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: { proposal_id: string; to_status: ProposalStatus; superseded_by?: string } = {
    proposal_id: requiredString(a, 'proposal_id', TOOL),
    to_status: requiredEnum(a, 'to_status', PROPOSAL_STATUSES, TOOL),
  }
  const supersededBy = optionalString(a, 'superseded_by', TOOL)
  if (supersededBy !== undefined) out.superseded_by = supersededBy
  return out
}

/** 成链行（accepted ∧ expedition 时 chained FeatureRow——服务内聚 2.2） */
function chainedEntry(f: FeatureRow): string {
  return `- chained feature: ${f.slug} [${f.featureStatus}] (${f.featureId}) — registered in the same transaction`
}

/** TransitionProposalResult → 模型可见文本（formatOk：✓ 转移行 + 行键值 + 成链行） */
function renderTransitionResult(value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as TransitionProposalResult
  const entries = [...proposalRowEntries(v)]
  if (v.chained !== undefined) entries.push(chainedEntry(v.chained))
  return formatOk(`Proposal ${v.slug} → ${v.proposalStatus}`, entries)
}

/** tool 定义工厂 */
export function createTransitionProposalTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Transition a proposal to a new status by proposalId. Verdict transitions (accepted/rejected) stamp the decision time; use them only once the user has decided. accepted on an expedition-mode proposal chains a feature row automatically in the same transaction. superseded requires superseded_by (the proposal that replaces this one). Non-verdict moves (draft/under-review) do not stamp a decision time.',
    parameters: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string', description: 'Target proposal id (from createProposal or a listing).' },
        to_status: { type: 'string', description: `One of: ${PROPOSAL_STATUSES.join(', ')}.` },
        superseded_by: { type: 'string', description: 'Replacing proposal id (required when to_status is superseded; validated against existing proposals).' },
      },
      required: ['proposal_id', 'to_status'],
    },
    output: { schema: TRANSITION_PROPOSAL_OUTPUT_SCHEMA, render: (_a, value) => renderTransitionResult(value) },
    async execute(args: unknown, exec: ToolExecFace): Promise<TransitionProposalResult | ForgeToolFailure> {
      return callToolFace(async () => {
        const parsed = parseTransitionProposalArgs(args)
        const session = sessionContextOf(exec)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const input: TransitionProposalInput = {
          projectId,
          proposalId: parsed.proposal_id,
          toStatus: parsed.to_status,
          ...(parsed.superseded_by !== undefined ? { supersededBy: parsed.superseded_by } : {}),
        }
        return deps.proposals.transitionProposal(input)
      })
    },
  }
}
