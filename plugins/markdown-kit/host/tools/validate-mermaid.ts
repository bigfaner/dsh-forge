// validate_mermaid tool 壳（定位：装配——schema（source?/docRel?/format? 双模互斥）+
// 路由到 ./validate 裁决 + typed error 归一（tool-error 语义）。壳零业务逻辑：
// fence 提取/头词探测/引擎裁决全在 ./validate 单源——本文件只做入参形状收窄、
// docRel 文件读取缝（注入缺省 node:fs）与裁决值透传。typed error 统一
// ValidateMermaidError（code 承载，plugin-forge format.ts errorCodeOf 同径——
// code ∈ 本包错误码闭集；dsh tool 面捕获 typed 错误即 tool-error 语义）。
// bug e6787e6e 收口：docRel 读取锚 = session.cwd（exec.agent.session.header.cwd，
// convert_document/get_outline 同构取数位，缺席即 ERR_IO 拒绝）+ 路径穿越守卫
// （workspace.ts 单源 assertRelUnderRoot——F-2 DRY 收口），四面反例拒绝先于任何 IO。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { MermaidToolDefinition, TextContentBlock, ToolExecFace } from '../faces.js'
import { validateDocFences, validateSource, type DocVerdict, type SourceVerdict } from '../validate/index.js'
import { assertRelUnderRoot, isRelPathError, sessionCwdOf } from './workspace.js'

/** 工具名（字面量单源导出——后续 deny 名单/技能文案引用点同源） */
export const MERMAID_TOOL_NAME = 'validate_mermaid' as const

/** 本包 tool 面 typed 错误码闭集（错误码统一口径：读盘/锚位失败 = ERR_IO；ERR_INVALID_ARGS 保留给参数形状） */
export type MermaidToolErrorCode = 'ERR_INVALID_ARGS' | 'ERR_MERMAID_ENGINE' | 'ERR_IO'

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

/** docRel 文件读取缝（注入点——单测替身；缺省 = node:fs 同步读；入参 = 守卫解析后的 workspace 根下绝对路径） */
export interface ValidateMermaidToolDeps {
  readonly readDocFile?: (docAbs: string) => string
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
    async execute(args: unknown, exec?: ToolExecFace): Promise<SourceVerdict | DocVerdict> {
      const parsed = parseValidateMermaidArgs(args)
      try {
        if (parsed.source !== undefined) {
          return await validateSource(parsed.source, { format: parsed.format })
        }
        const docRel = parsed.docRel as string
        // bug e6787e6e：docRel 读取锚 = session.cwd（convert_document/get_outline 同构取数位）
        const cwd = sessionCwdOf(exec)
        if (cwd === undefined || cwd.trim() === '') {
          throw new ValidateMermaidError(
            'ERR_IO',
            `${MERMAID_TOOL_NAME}: no session workspace in this call context — the document path cannot be anchored to a workspace root`,
          )
        }
        // 路径穿越守卫（workspace.ts 单源——拒绝先于任何 IO；RelPathError → 自家 typed 转译）
        let abs: string
        try {
          abs = assertRelUnderRoot(resolve(cwd), docRel, { tool: MERMAID_TOOL_NAME, field: 'docRel' })
        } catch (e) {
          if (isRelPathError(e)) throw new ValidateMermaidError('ERR_IO', e.message)
          throw e
        }
        let doc: string
        try {
          doc = readDocFile(abs)
        } catch (e) {
          if (isRelPathError(e)) throw new ValidateMermaidError('ERR_IO', e.message)
          // Root cause: 读取失败（文件缺席/权限拒绝——macOS 700 目录现场 errno 形态不定，
          // ENOENT 不必然意味着不存在）此前与引擎错同兜底裸抛或断言「文件不存在」；
          // 不按 errno 猜在性，统一如实报不可读并附 errno，由调用方核对路径与目录权限。
          const errno = (e as NodeJS.ErrnoException).code
          if (errno === 'ENOENT' || errno === 'EACCES' || errno === 'EPERM') {
            throw new ValidateMermaidError(
              'ERR_IO',
              `${MERMAID_TOOL_NAME}: cannot read document: ${docRel} — not found or not readable (check the path relative to the workspace root and directory permissions; errno ${errno})`,
            )
          }
          throw e
        }
        return await validateDocFences(doc)
      } catch (e) {
        if (isValidateMermaidError(e)) throw e
        // typed error 归一：引擎/读取层意外错误不裸抛（tool-error 语义单点承载）
        throw new ValidateMermaidError('ERR_MERMAID_ENGINE', `${MERMAID_TOOL_NAME}: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
  }
}
