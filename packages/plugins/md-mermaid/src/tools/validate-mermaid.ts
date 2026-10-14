// validateMermaid tool 壳（定位：装配——schema（source?/docRel?/format? 双模互斥）+
// 路由到 ./validate 裁决 + typed error 归一（tool-error 语义）。壳零业务逻辑：
// fence 提取/头词探测/引擎裁决全在 ./validate 单源——本文件只做入参形状收窄、
// docRel 文件读取缝（注入缺省 node:fs）与裁决值透传。typed error 统一
// ValidateMermaidError（code 承载，plugin-forge format.ts errorCodeOf 同径——
// code ∈ 本包错误码闭集；dsh tool 面捕获 typed 错误即 tool-error 语义）。
import { readFileSync } from 'node:fs'
import type { MermaidToolDefinition, TextContentBlock } from '../faces.js'
import { validateDocFences, validateSource, type DocVerdict, type SourceVerdict } from '../validate/index.js'

/** 工具名（字面量单源导出——后续 deny 名单/技能文案引用点同源） */
export const MERMAID_TOOL_NAME = 'validateMermaid' as const

/** 本包 tool 面 typed 错误码闭集 */
export type MermaidToolErrorCode = 'ERR_INVALID_ARGS' | 'ERR_MERMAID_ENGINE'

/** typed error（code 承载——tool-error 语义的判别锚） */
export class ValidateMermaidError extends Error {
  readonly code: MermaidToolErrorCode

  constructor(code: MermaidToolErrorCode, message: string) {
    super(message)
    this.name = 'ValidateMermaidError'
    this.code = code
  }
}

/** typed error 判别（结构面宽松自证——跨序列化附载后仍可识别） */
export function isValidateMermaidError(e: unknown): e is ValidateMermaidError {
  return (
    e instanceof ValidateMermaidError ||
    (typeof e === 'object' &&
      e !== null &&
      (e as { name?: unknown }).name === 'ValidateMermaidError' &&
      typeof (e as { code?: unknown }).code === 'string')
  )
}

/** format 受控词表（auto = 首行头词机械探测不经 LLM） */
const FORMAT_VOCABULARY = ['auto', 'mermaid'] as const

/** agent 面参数（source/docRel 双模互斥——恰一在场） */
export interface ValidateMermaidToolArgs {
  readonly source?: string
  readonly docRel?: string
  readonly format?: (typeof FORMAT_VOCABULARY)[number]
}

/** 参数防御性收窄（形状 + 双模互斥全在此一步——plugin-forge-spec args.ts 同法） */
export function parseValidateMermaidArgs(args: unknown): ValidateMermaidToolArgs {
  if (typeof args !== 'object' || args === null) {
    throw new ValidateMermaidError('ERR_INVALID_ARGS', `${MERMAID_TOOL_NAME}: arguments must be an object`)
  }
  const a = args as Record<string, unknown>
  const optionalString = (key: string): string | undefined => {
    const v = a[key]
    if (v === undefined || v === '') return undefined
    if (typeof v !== 'string') {
      throw new ValidateMermaidError('ERR_INVALID_ARGS', `${MERMAID_TOOL_NAME}: ${key} must be a string`)
    }
    return v
  }
  const source = optionalString('source')
  const docRel = optionalString('docRel')
  if (source !== undefined && docRel !== undefined) {
    throw new ValidateMermaidError(
      'ERR_INVALID_ARGS',
      `${MERMAID_TOOL_NAME}: source and docRel are mutually exclusive — provide exactly one`,
    )
  }
  if (source === undefined && docRel === undefined) {
    throw new ValidateMermaidError(
      'ERR_INVALID_ARGS',
      `${MERMAID_TOOL_NAME}: provide exactly one of source (diagram text) or docRel (document relative path)`,
    )
  }
  const format = optionalString('format')
  if (format !== undefined && !(FORMAT_VOCABULARY as readonly string[]).includes(format)) {
    throw new ValidateMermaidError(
      'ERR_INVALID_ARGS',
      `${MERMAID_TOOL_NAME}: format must be one of [${FORMAT_VOCABULARY.join(', ')}]`,
    )
  }
  return { source, docRel, format: format as ValidateMermaidToolArgs['format'] }
}

/** 裁决值 → 模型可见文本（纯投影——两态逐行） */
export function renderVerdict(value: SourceVerdict | DocVerdict): readonly TextContentBlock[] {
  const lines: string[] = []
  if ('fences' in value) {
    if (value.fences.length === 0) {
      lines.push('✓ doc scanned — no ```mermaid fence found')
    }
    for (const f of value.fences) {
      lines.push(f.ok ? `✓ line ${f.line} ${f.format}: ok` : `✗ line ${f.line} ${f.format}: ${f.message ?? 'invalid'}`)
    }
  } else {
    lines.push(
      value.ok
        ? `✓ source ok (format: ${value.format})`
        : `✗ source invalid (format: ${value.format}${value.line !== undefined ? `, line ${value.line}` : ''}): ${value.message ?? 'invalid'}`,
    )
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

/** 注册面输出 schema（source 裁决 | doc 裁决两支 oneOf——零 fence doc = fences 空数组命中第二支） */
const VALIDATE_MERMAID_OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        format: { type: 'string' },
        line: { type: 'integer' },
        message: { type: 'string' },
        unsupported: { type: 'boolean' },
      },
      required: ['ok', 'format'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        fences: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              line: { type: 'integer' },
              format: { type: 'string' },
              ok: { type: 'boolean' },
              message: { type: 'string' },
              unsupported: { type: 'boolean' },
            },
            required: ['line', 'format', 'ok'],
          },
        },
      },
      required: ['fences'],
    },
  ],
} as const

/** docRel 文件读取缝（注入点——单测替身；缺省 = node:fs 同步读） */
export interface ValidateMermaidToolDeps {
  readonly readDocFile?: (docRel: string) => string
}

/** tool 定义工厂 */
export function createValidateMermaidTool(deps: ValidateMermaidToolDeps = {}): MermaidToolDefinition {
  const readDocFile = deps.readDocFile ?? ((docRel: string) => readFileSync(docRel, 'utf8'))
  return {
    name: MERMAID_TOOL_NAME,
    description:
      'Validate a mermaid diagram source or every ```mermaid fence in a markdown document. Pass source with the raw diagram text (single diagram), or docRel with a document path relative to the workspace to check all fences at once (line numbers reference the fence start). Returns ok/format per verdict, or line + message for invalid sources; unknown diagram heads are reported as unsupported instead of silently failing.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Raw mermaid diagram text to validate (single diagram). Mutually exclusive with docRel.' },
        docRel: {
          type: 'string',
          description: 'Document path relative to the workspace root; every ```mermaid fence in it is verdicted. Mutually exclusive with source.',
        },
        format: { type: 'string', description: `Engine override; omit for auto head-word detection. One of [${FORMAT_VOCABULARY.join(', ')}].` },
      },
    },
    output: { schema: VALIDATE_MERMAID_OUTPUT_SCHEMA, render: (_args, value) => renderVerdict(value as SourceVerdict | DocVerdict) },
    async execute(args: unknown): Promise<SourceVerdict | DocVerdict> {
      const parsed = parseValidateMermaidArgs(args)
      try {
        if (parsed.source !== undefined) {
          return await validateSource(parsed.source, { format: parsed.format })
        }
        const doc = readDocFile(parsed.docRel as string)
        return await validateDocFences(doc)
      } catch (e) {
        if (isValidateMermaidError(e)) throw e
        // typed error 归一：引擎/读取层意外错误不裸抛（tool-error 语义单点承载）
        throw new ValidateMermaidError('ERR_MERMAID_ENGINE', `${MERMAID_TOOL_NAME}: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
  }
}
