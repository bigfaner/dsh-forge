// upsertFeatureDoc tool 定义（定位：业务——M3 Interface「forgeFeatures 域动词族」之一；
// feature_documents upsert（登记即推进 §6-28：doc_kind→phase 映射单调只进，技能无
// 显式推相位面）；审计伴随经服务闭包（feature_records(doc-upsert)——2.1 已落，插件
// 零审计代码）。规格技能（write-prd / ui-design / tech-design 等）产出文档经本 tool
// 落状态层——「经 tool 读写」纪律的文档径。参数 snake_case；容器定位 = feature_slug
// 自然键（服务内 slug→id 解析——Interface 1 签名单源，uuid 锚不进 agent 面）；
// 返回 = contracts FeatureDocumentRow 透传 + formatOk 双友好渲染（3.5 统一收口对齐）。
import { DOC_KINDS, type DocKind, type FeatureDocumentRow, type UpsertFeatureDocInput } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, TextContentBlock, ToolExecFace } from '../faces.js'
import type { ForgeSpecToolDeps } from './index.js'
import { optionalString, requireArgsObject, requiredEnum, requiredString } from './args.js'
import { requireProjectId, sessionContextOf } from './session.js'

const TOOL = 'upsertFeatureDoc'

/** agent 面参数 */
export interface UpsertFeatureDocToolArgs {
  /** feature 容器自然键（slug ≡ 容器目录名） */
  readonly feature_slug: string
  readonly doc_kind: DocKind
  /** 相对 forge_dir，正斜杠；可悬空（SC-branch 容错） */
  readonly rel_path: string
  readonly summary?: string
}

/** 参数防御性收窄（doc_kind 词表 = contracts DOC_KINDS 七值单源） */
export function parseUpsertFeatureDocArgs(args: unknown): UpsertFeatureDocToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: { feature_slug: string; doc_kind: DocKind; rel_path: string; summary?: string } = {
    feature_slug: requiredString(a, 'feature_slug', TOOL),
    doc_kind: requiredEnum(a, 'doc_kind', DOC_KINDS, TOOL),
    rel_path: requiredString(a, 'rel_path', TOOL),
  }
  const summary = optionalString(a, 'summary', TOOL)
  if (summary !== undefined) out.summary = summary
  return out
}

/** FeatureDocumentRow 的注册面输出 schema */
const UPSERT_FEATURE_DOC_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    featureId: { type: 'string', description: 'owning feature uuid' },
    docKind: { type: 'string' },
    relPath: { type: 'string' },
    summary: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['featureId', 'docKind', 'relPath', 'createdAt', 'updatedAt'],
} as const

/** FeatureDocumentRow → 模型可见文本（formatOk 双友好：首行 ✓ + 键值行） */
export function renderFeatureDocumentRow(v: FeatureDocumentRow): readonly TextContentBlock[] {
  const lines = [
    `✓ ${v.docKind} doc registered for feature (phase advanced on first registration)`,
    `- relPath: ${v.relPath}`,
    ...(v.summary !== undefined ? [`- summary: ${v.summary}`] : []),
    `- updatedAt: ${v.updatedAt}`,
  ]
  return [{ type: 'text', text: lines.join('\n') }]
}

/** tool 定义工厂 */
export function createUpsertFeatureDocTool(deps: ForgeSpecToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Register or update a feature document row (PRD, user stories, UI functions, tech design, ER diagram, SQL schema, page map). Registering a doc kind advances the feature phase monotonically — the phase never goes back. Use this after a spec skill produces a document so the state layer reflects it; audit records are written by the service.',
    parameters: {
      type: 'object',
      properties: {
        feature_slug: { type: 'string', description: 'Feature slug (the feature container natural key).' },
        doc_kind: { type: 'string', description: `Document kind, one of: ${DOC_KINDS.join(', ')}.` },
        rel_path: { type: 'string', description: "Document path relative to the workspace forge dir, forward slashes (e.g. 'features/<slug>/prd/prd-spec.md'). May dangle; the file may be written after registration." },
        summary: { type: 'string', description: 'One-line summary of the document.' },
      },
      required: ['feature_slug', 'doc_kind', 'rel_path'],
    },
    output: { schema: UPSERT_FEATURE_DOC_OUTPUT_SCHEMA, render: (_a, value) => renderFeatureDocumentRow(value as FeatureDocumentRow) },
    async execute(args: unknown, exec: ToolExecFace): Promise<FeatureDocumentRow> {
      const parsed = parseUpsertFeatureDocArgs(args)
      const session = sessionContextOf(exec)
      const projectId = requireProjectId(deps.resolveProjectId, session)
      const input: UpsertFeatureDocInput = {
        projectId,
        featureSlug: parsed.feature_slug,
        docKind: parsed.doc_kind,
        relPath: parsed.rel_path,
        ...(parsed.summary !== undefined ? { summary: parsed.summary } : {}),
      }
      return deps.features.upsertFeatureDoc(input)
    },
  }
}
