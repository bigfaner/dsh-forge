// createProposal tool 定义（定位：业务——M3 终态六动词之一；写动词 tool 专属
// ——不上 RPC，Interface 4 面 SC7 断言）。参数 snake_case；status 缺省 draft
//（core 侧 DEFAULT 同值）；mode = M3 模式溯源透传（远征/突击——由创建技能写入：
// quick-tasks 建突击、brainstorm 远征经用户裁决；缺省 = NULL 占位，成链门按 NULL
// 边界处理——tech-design Interface 1）。返回 = contracts ProposalRow 透传。
// 返回面双友好（裁决⑨）：成功 formatOk（✓ + 键值行）；typed 服务错误 → 失败 DTO
// formatErr（✗ code + 人话 + 违规清单逐行——format.ts 单源）。
import { MODES, PROPOSAL_STATUSES, type CreateProposalInput, type Mode, type ProposalRow, type ProposalStatus } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, TextContentBlock, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalEnum, optionalString, requireArgsObject, requiredString } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, sessionContextOf } from './session.js'

const TOOL = 'createProposal'

/** agent 面参数 */
export interface CreateProposalToolArgs {
  readonly slug: string
  readonly title: string
  /** proposal.md 相对 forge_dir；缺省 = 未挂文档 */
  readonly rel_path?: string
  readonly status?: ProposalStatus
  /** 模式溯源（expedition = 远征全管线 / blitz = 突击直挂；缺省 = NULL 占位） */
  readonly mode?: Mode
}

/** 参数防御性收窄 */
export function parseCreateProposalArgs(args: unknown): CreateProposalToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: { slug: string; title: string; rel_path?: string; status?: ProposalStatus; mode?: Mode } = {
    slug: requiredString(a, 'slug', TOOL),
    title: requiredString(a, 'title', TOOL),
  }
  const relPath = optionalString(a, 'rel_path', TOOL)
  if (relPath !== undefined) out.rel_path = relPath
  const status = optionalEnum(a, 'status', PROPOSAL_STATUSES, TOOL)
  if (status !== undefined) out.status = status
  const mode = optionalEnum(a, 'mode', MODES, TOOL)
  if (mode !== undefined) out.mode = mode
  return out
}

/** ProposalRow 的注册面输出 schema（身份与名称分离——关联走 id；+ 失败支） */
export const PROPOSAL_ROW_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  additionalProperties: false,
  properties: {
    proposalId: { type: 'string', description: 'uuid (stable anchor — rename-safe)' },
    slug: { type: 'string' },
    title: { type: 'string' },
    proposalStatus: { type: 'string' },
    relPath: { type: 'string' },
    decidedAt: { type: 'string' },
    mode: { type: 'string', description: 'expedition or blitz (absent = NULL placeholder).' },
    supersededBy: { type: 'string', description: 'Superseding proposal id (superseded lineage).' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['proposalId', 'slug', 'title', 'proposalStatus', 'createdAt', 'updatedAt'],
})

/** ProposalRow → 键值行（createProposal/transitionProposal 两 render 共用） */
export function proposalRowEntries(v: ProposalRow): string[] {
  return [
    `- proposalId: ${v.proposalId}`,
    `- title: ${v.title}`,
    ...(v.mode !== undefined ? [`- mode: ${v.mode}`] : []),
    ...(v.relPath !== undefined ? [`- doc: ${v.relPath}`] : []),
    ...(v.decidedAt !== undefined ? [`- decided: ${v.decidedAt}`] : []),
    ...(v.supersededBy !== undefined ? [`- supersededBy: ${v.supersededBy}`] : []),
  ]
}

/** ProposalRow → 模型可见文本（formatOk：✓ 首行 + 键值行——headline 由动词给） */
export function renderProposalRow(headline: string, v: ProposalRow): readonly TextContentBlock[] {
  return formatOk(headline, proposalRowEntries(v))
}

/** tool 定义工厂 */
export function createCreateProposalTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Register a proposal row in the forge pipeline (identity and name are separate: the slug can be renamed later, links use proposalId). rel_path points at the proposal document relative to the workspace docs root. mode records the lineage (expedition = full pipeline via PRD/design/breakdown, blitz = direct-attached tasks once accepted; omit only when genuinely undecided). Verdicts (accept/reject) happen through transitionProposal only when the user decides.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Proposal slug (unique).' },
        title: { type: 'string', description: 'Proposal title.' },
        rel_path: { type: 'string', description: "Proposal document path relative to the workspace docs root, forward slashes (e.g. 'proposals/<slug>/proposal.md')." },
        status: { type: 'string', description: `Initial status, one of: ${PROPOSAL_STATUSES.join(', ')} (default draft).` },
        mode: { type: 'string', description: `Lineage mode, one of: ${MODES.join(', ')} (expedition or blitz; omit = undecided placeholder).` },
      },
      required: ['slug', 'title'],
    },
    output: {
      schema: PROPOSAL_ROW_OUTPUT_SCHEMA,
      render: (_a, value) =>
        isForgeToolFailure(value)
          ? formatFailure(value)
          : renderProposalRow(`Proposal ${(value as ProposalRow).slug} registered [${(value as ProposalRow).proposalStatus}]`, value as ProposalRow),
    },
    async execute(args: unknown, exec: ToolExecFace): Promise<ProposalRow | ForgeToolFailure> {
      return callToolFace(async () => {
        const parsed = parseCreateProposalArgs(args)
        const session = sessionContextOf(exec)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const input: CreateProposalInput = {
          projectId,
          slug: parsed.slug,
          title: parsed.title,
          ...(parsed.rel_path !== undefined ? { relPath: parsed.rel_path } : {}),
          ...(parsed.status !== undefined ? { status: parsed.status } : {}),
          ...(parsed.mode !== undefined ? { mode: parsed.mode } : {}),
        }
        return deps.proposals.createProposal(input)
      })
    },
  }
}
