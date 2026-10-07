// registerFeature tool 定义（定位：业务——M3 Interface「forgeFeatures 域动词族」之一；
// 成链补链两用：远征提案 accepted 成链由 transitionProposal 服务内聚（2.2）自动调用；
// 本 tool = 显式补链正门——NULL 边界提案（先 setProposalMode 定模式后补链）与
// 升级远征已 accepted 提案（不重走成链门）两条边界径（tech-design §边界注记）。
// 参数 snake_case；返回 = contracts FeatureRow 透传 + formatOk 双友好渲染
// （成功首行 ✓ + 键值行——M3 裁决⑨；本插件局部实现，3.5 统一收口对齐）。
import type { FeatureRow, RegisterFeatureInput } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, TextContentBlock, ToolExecFace } from '../faces.js'
import type { ForgeSpecToolDeps } from './index.js'
import { optionalString, requireArgsObject, requiredString } from './args.js'
import { requireProjectId, sessionContextOf } from './session.js'

const TOOL = 'registerFeature'

/** agent 面参数 */
export interface RegisterFeatureToolArgs {
  readonly slug: string
  readonly title: string
  /** 一句话摘要（未来注入 agent 上下文） */
  readonly summary?: string
  /** 来源谱系提案 uuid（成链补链时关联；缺省 = 无提案来源） */
  readonly proposal_id?: string
}

/** 参数防御性收窄 */
export function parseRegisterFeatureArgs(args: unknown): RegisterFeatureToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: { slug: string; title: string; summary?: string; proposal_id?: string } = {
    slug: requiredString(a, 'slug', TOOL),
    title: requiredString(a, 'title', TOOL),
  }
  const summary = optionalString(a, 'summary', TOOL)
  if (summary !== undefined) out.summary = summary
  const proposalId = optionalString(a, 'proposal_id', TOOL)
  if (proposalId !== undefined) out.proposal_id = proposalId
  return out
}

/** FeatureRow 的注册面输出 schema（身份与名称分离——关联走 featureId） */
const REGISTER_FEATURE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    featureId: { type: 'string', description: 'uuid (stable anchor — rename-safe)' },
    slug: { type: 'string' },
    title: { type: 'string' },
    featureStatus: { type: 'string' },
    summary: { type: 'string' },
    proposalId: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['featureId', 'slug', 'title', 'featureStatus', 'createdAt', 'updatedAt'],
} as const

/** FeatureRow → 模型可见文本（formatOk 双友好：首行 ✓ + 键值行） */
export function renderFeatureRow(v: FeatureRow): readonly TextContentBlock[] {
  const lines = [
    `✓ Feature ${v.slug} registered [${v.featureStatus}]`,
    `- featureId: ${v.featureId}`,
    `- title: ${v.title}`,
    ...(v.summary !== undefined ? [`- summary: ${v.summary}`] : []),
    ...(v.proposalId !== undefined ? [`- proposalId: ${v.proposalId}`] : []),
  ]
  return [{ type: 'text', text: lines.join('\n') }]
}

/** tool 定义工厂 */
export function createRegisterFeatureTool(deps: ForgeSpecToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Register a feature row explicitly (spec-chain linking). Used for the NULL-mode boundary (set the proposal mode first, then link) and for upgrading an already-accepted proposal; the accepted+expedition chain registers automatically and must not call this again. Identity and name are separate: links use featureId, the slug matches the feature directory name.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Feature slug (unique; matches the feature directory name).' },
        title: { type: 'string', description: 'Feature title.' },
        summary: { type: 'string', description: 'One-line summary (injected into agent context later).' },
        proposal_id: { type: 'string', description: 'Source proposal uuid for lineage linking (omit when the feature has no proposal origin).' },
      },
      required: ['slug', 'title'],
    },
    output: { schema: REGISTER_FEATURE_OUTPUT_SCHEMA, render: (_a, value) => renderFeatureRow(value as FeatureRow) },
    async execute(args: unknown, exec: ToolExecFace): Promise<FeatureRow> {
      const parsed = parseRegisterFeatureArgs(args)
      const session = sessionContextOf(exec)
      const projectId = requireProjectId(deps.resolveProjectId, session)
      const input: RegisterFeatureInput = {
        projectId,
        slug: parsed.slug,
        title: parsed.title,
        ...(parsed.summary !== undefined ? { summary: parsed.summary } : {}),
        ...(parsed.proposal_id !== undefined ? { proposalId: parsed.proposal_id } : {}),
      }
      return deps.features.registerFeature(input)
    },
  }
}
