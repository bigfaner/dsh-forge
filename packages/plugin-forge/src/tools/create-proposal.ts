// createProposal tool 定义（定位：业务——M3 终态六动词之一；写动词 tool 专属
// ——不上 RPC，Interface 4 面 SC7 断言）。参数 snake_case；status 缺省 draft
//（core 侧 DEFAULT 同值）；mode = M3 模式溯源（远征/突击——显式参优先；
// 缺省时按会话**当前**预设自动填充：'agent-preset/selected' 事件回放 > 出生头
//（sessionContextOf 投影同径——出生头在切换后过期），命中 MODES 词表即取
//（brainstorm/quick-tasks 技能不再手工透传——所处容器即溯源）；预设缺席或
// 词表外值 = 不填充，NULL 占位，成链门按 NULL 边界处理——tech-design Interface 1）。
// 返回 = contracts ProposalRow 透传。
// 返回面双友好（裁决⑨）：成功 formatOk（✓ + 键值行）；typed 服务错误 → 失败 DTO
// formatErr（✗ code + 人话 + 违规清单逐行——format.ts 单源）。
import { MODES, PROPOSAL_STATUSES, type CreateProposalInput, type Mode, type ProposalRow, type ProposalStatus } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, TextContentBlock, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalEnum, optionalString, requireArgsObject, requiredString } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'

const TOOL = 'createProposal'

/** agent 面参数 */
export interface CreateProposalToolArgs {
  readonly slug: string
  readonly title: string
  /** proposal.md 相对 forge_dir；缺省 = 未挂文档 */
  readonly rel_path?: string
  readonly status?: ProposalStatus
  /** 模式溯源（expedition = 远征全管线 / blitz = 突击直挂；显式参优先，缺省按会话预设填充） */
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

/**
 * 会话当前预设 → mode 溯源（mode 缺省时的自动填充源）。
 * 当前预设（selected 事件回放 > 出生头——sessionContextOf 投影同径）命中 MODES
 * 词表（expedition/blitz）即原值取用；预设缺席或词表外值（自定义预设等）=
 * undefined → 不填充，NULL 占位。
 */
export function presetModeOf(agentPreset: string | undefined): Mode | undefined {
  return agentPreset !== undefined && (MODES as readonly string[]).includes(agentPreset)
    ? (agentPreset as Mode)
    : undefined
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
      'Register a proposal row in the forge pipeline (identity and name are separate: the slug can be renamed later, links use proposalId). rel_path points at the proposal document relative to the workspace docs root. mode records the lineage (expedition = full pipeline via PRD/design/breakdown, blitz = direct-attached tasks once accepted). When omitted, mode is auto-filled from the session\'s current agent preset (expedition/blitz session container; selected-event replay over the birth header); pass it explicitly only to override the session context. Verdicts (accept/reject) happen through transitionProposal only when the user decides.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Proposal slug (unique).' },
        title: { type: 'string', description: 'Proposal title.' },
        rel_path: { type: 'string', description: "Proposal document path relative to the workspace docs root, forward slashes (e.g. 'proposals/<slug>/proposal.md')." },
        status: { type: 'string', description: `Initial status, one of: ${PROPOSAL_STATUSES.join(', ')} (default draft).` },
        mode: { type: 'string', description: `Lineage mode, one of: ${MODES.join(', ')} (omit to inherit the session's current agent preset; no preset context = undecided placeholder).` },
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
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseCreateProposalArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        // mode 溯源优先级：显式参 > 会话当前预设（selected 事件回放 > 出生头，命中 MODES 词表）> NULL 占位
        const mode = parsed.mode ?? presetModeOf(session.agentPreset)
        const input: CreateProposalInput = {
          projectId,
          slug: parsed.slug,
          title: parsed.title,
          ...(parsed.rel_path !== undefined ? { relPath: parsed.rel_path } : {}),
          ...(parsed.status !== undefined ? { status: parsed.status } : {}),
          ...(mode !== undefined ? { mode } : {}),
        }
        return deps.proposals.createProposal(input)
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
