// createProposal tool 定义（定位：业务——Interface 8 六动词之一；写动词 tool 专属
// ——不上 RPC，Interface 7 面 SC7 断言）。参数 snake_case；status 缺省 draft
//（core 侧 DEFAULT 同值）；返回 = contracts ProposalRow 透传。
import { PROPOSAL_STATUSES, type CreateProposalInput, type ProposalRow, type ProposalStatus } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalEnum, optionalString, requireArgsObject, requiredString } from './args.js'
import { requireProjectId, sessionContextOf } from './session.js'

const TOOL = 'createProposal'

/** agent 面参数 */
export interface CreateProposalToolArgs {
  readonly slug: string
  readonly title: string
  /** proposal.md 相对 forge_dir；缺省 = 未挂文档 */
  readonly rel_path?: string
  readonly status?: ProposalStatus
}

/** 参数防御性收窄 */
export function parseCreateProposalArgs(args: unknown): CreateProposalToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: { slug: string; title: string; rel_path?: string; status?: ProposalStatus } = {
    slug: requiredString(a, 'slug', TOOL),
    title: requiredString(a, 'title', TOOL),
  }
  const relPath = optionalString(a, 'rel_path', TOOL)
  if (relPath !== undefined) out.rel_path = relPath
  const status = optionalEnum(a, 'status', PROPOSAL_STATUSES, TOOL)
  if (status !== undefined) out.status = status
  return out
}

/** ProposalRow 的注册面输出 schema（身份与名称分离——关联走 id） */
const CREATE_PROPOSAL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    proposalId: { type: 'string', description: 'uuid (stable anchor — rename-safe)' },
    slug: { type: 'string' },
    title: { type: 'string' },
    proposalStatus: { type: 'string' },
    relPath: { type: 'string' },
    decidedAt: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['proposalId', 'slug', 'title', 'proposalStatus', 'createdAt', 'updatedAt'],
} as const

/** ProposalRow → 模型可见文本 */
export function renderProposalRow(v: ProposalRow): readonly { type: 'text'; text: string }[] {
  const lines = [
    `Proposal ${v.slug} [${v.proposalStatus}] ${v.title}`,
    `- proposalId: ${v.proposalId}`,
    ...(v.relPath !== undefined ? [`- doc: ${v.relPath}`] : []),
    ...(v.decidedAt !== undefined ? [`- decided: ${v.decidedAt}`] : []),
  ]
  return [{ type: 'text', text: lines.join('\n') }]
}

/** tool 定义工厂 */
export function createCreateProposalTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Register a proposal row in the forge pipeline (identity and name are separate: the slug can be renamed later, links use proposalId). rel_path points at the proposal document relative to the workspace docs root. Verdicts (accept/reject) happen through transitionProposal only when the user decides.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Proposal slug (unique).' },
        title: { type: 'string', description: 'Proposal title.' },
        rel_path: { type: 'string', description: "Proposal document path relative to the workspace docs root, forward slashes (e.g. 'proposals/<slug>/proposal.md')." },
        status: { type: 'string', description: `Initial status, one of: ${PROPOSAL_STATUSES.join(', ')} (default draft).` },
      },
      required: ['slug', 'title'],
    },
    output: { schema: CREATE_PROPOSAL_OUTPUT_SCHEMA, render: (_a, value) => renderProposalRow(value as ProposalRow) },
    async execute(args: unknown, exec: ToolExecFace): Promise<ProposalRow> {
      const parsed = parseCreateProposalArgs(args)
      const session = sessionContextOf(exec)
      const projectId = requireProjectId(deps.resolveProjectId, session)
      const input: CreateProposalInput = {
        projectId,
        slug: parsed.slug,
        title: parsed.title,
        ...(parsed.rel_path !== undefined ? { relPath: parsed.rel_path } : {}),
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      }
      return deps.proposals.createProposal(input)
    },
  }
}
