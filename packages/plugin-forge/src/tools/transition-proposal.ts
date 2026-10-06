// transitionProposal tool 定义（定位：业务——Interface 8 六动词之一；写动词 tool
// 专属——不上 RPC）。裁决转移：→ accepted/rejected 写 decided_at（覆盖式最新裁决
// 时刻）；from≠to 校验同源（ERR_INVALID_TRANSITION——core 侧拒绝面）。
// 注意与 transitionTask 的面分治（Interface 8/交互四）：transitionTask 仅人类 RPC 通道
// 可达，本插件不注册；transitionProposal 为 tool 面在册动词（提案裁决属 agent 可承载动作
// ——run-tasks/brainstorm 流程闭合在 agent 侧）。
import { PROPOSAL_STATUSES, type ProposalRow, type ProposalStatus, type TransitionProposalInput } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { requireArgsObject, requiredEnum, requiredString } from './args.js'
import { renderProposalRow } from './create-proposal.js'
import { requireProjectId, sessionContextOf } from './session.js'

const TOOL = 'transitionProposal'

/** agent 面参数 */
export interface TransitionProposalToolArgs {
  /** 目标提案（uuid——createProposal 返回锚） */
  readonly proposal_id: string
  readonly to_status: ProposalStatus
}

/** 参数防御性收窄 */
export function parseTransitionProposalArgs(args: unknown): TransitionProposalToolArgs {
  const a = requireArgsObject(args, TOOL)
  return {
    proposal_id: requiredString(a, 'proposal_id', TOOL),
    to_status: requiredEnum(a, 'to_status', PROPOSAL_STATUSES, TOOL),
  }
}

/** TransitionProposalInput/ProposalRow 的注册面输出 schema（createProposal 同形） */
const TRANSITION_PROPOSAL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    proposalId: { type: 'string' },
    slug: { type: 'string' },
    title: { type: 'string' },
    proposalStatus: { type: 'string', description: 'Status after the transition.' },
    relPath: { type: 'string' },
    decidedAt: { type: 'string', description: 'Set when the transition is a verdict (accepted/rejected).' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['proposalId', 'slug', 'title', 'proposalStatus', 'createdAt', 'updatedAt'],
} as const

/** tool 定义工厂 */
export function createTransitionProposalTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Transition a proposal to a new status by proposalId. Verdict transitions (accepted/rejected) stamp the decision time; use them only once the user has decided. Non-verdict moves (draft/under-review/superseded) do not stamp a decision time.',
    parameters: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string', description: 'Target proposal id (from createProposal or a listing).' },
        to_status: { type: 'string', description: `One of: ${PROPOSAL_STATUSES.join(', ')}.` },
      },
      required: ['proposal_id', 'to_status'],
    },
    output: { schema: TRANSITION_PROPOSAL_OUTPUT_SCHEMA, render: (_a, value) => renderProposalRow(value as ProposalRow) },
    async execute(args: unknown, exec: ToolExecFace): Promise<ProposalRow> {
      const parsed = parseTransitionProposalArgs(args)
      const session = sessionContextOf(exec)
      const projectId = requireProjectId(deps.resolveProjectId, session)
      const input: TransitionProposalInput = {
        projectId,
        proposalId: parsed.proposal_id,
        toStatus: parsed.to_status,
      }
      return deps.proposals.transitionProposal(input)
    },
  }
}
