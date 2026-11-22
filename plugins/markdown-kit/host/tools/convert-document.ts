// convertDocument tool 壳（定位：装配——schema 收窄 + 路由到 ./convert 分派单源 +
// typed error 归一 + 成功/失败 emitDiag（doc-convert 前缀，零静默）。壳零业务逻辑：
// 分派/引擎/图片策略/落盘边界全在 ./convert 单源。落盘锚 = session.cwd（exec.agent
// .session.header.cwd，knowledge resolveProjectId(session.cwd) 同构取数位——缺席即
// ERR_IO 拒绝，不落盘任何相对路径猜测根）。可选返回键 undefined 剔除后整值返回
// （lossless JSON 整值边界——判例 223ba5b3 径）。
import type { MermaidToolDefinition, TextContentBlock, ToolExecFace } from '../faces.js'
import {
  convertDocumentWorkspaceFile,
  defaultConvertFs,
  type ConvertDocumentSummary,
  type ConvertFsSeam,
} from '../convert/index.js'
import { ConvertDocumentError, isConvertDocumentError, type ConvertToolErrorCode } from '../convert/errors.js'
import { DOC_CONVERT_EVENT, DOC_CONVERT_FAIL_EVENT, emitConvertDiag, type DiagEmitter } from '../convert/diag.js'

/** 工具名（字面量单源导出） */
export const CONVERT_TOOL_NAME = 'convertDocument' as const

/** 本 tool typed 错误码闭集（re-export convert/errors 闭集——壳层命名同源） */
export type ConvertDocumentToolErrorCode = ConvertToolErrorCode

export { ConvertDocumentError, isConvertDocumentError }

/** images 受控词表（assets 缺省抽取改写 / discard 零落盘） */
const IMAGES_VOCABULARY = ['assets', 'discard'] as const

/** format 受控词表（auto = 按扩展名机械分派不经 LLM） */
const FORMAT_VOCABULARY = ['auto', 'docx', 'pdf'] as const

/** agent 面参数 */
export interface ConvertDocumentToolArgs {
  readonly docRel: string
  readonly outRel?: string
  readonly images?: (typeof IMAGES_VOCABULARY)[number]
  readonly format?: (typeof FORMAT_VOCABULARY)[number]
}

/** 参数防御性收窄（形状全在此一步——plugin-forge-spec args.ts 同法） */
export function parseConvertDocumentArgs(args: unknown): ConvertDocumentToolArgs {
  const tool = CONVERT_TOOL_NAME
  if (typeof args !== 'object' || args === null) {
    throw new ConvertDocumentError('ERR_INVALID_ARGS', `${tool}: arguments must be an object`)
  }
  const a = args as Record<string, unknown>
  const docRel = a.docRel
  if (typeof docRel !== 'string' || docRel.trim() === '') {
    throw new ConvertDocumentError('ERR_INVALID_ARGS', `${tool}: docRel must be a non-empty string (path relative to the workspace root)`)
  }
  const optionalString = (key: string): string | undefined => {
    const v = a[key]
    if (v === undefined || v === '') return undefined
    if (typeof v !== 'string') {
      throw new ConvertDocumentError('ERR_INVALID_ARGS', `${tool}: ${key} must be a string`)
    }
    return v
  }
  const outRel = optionalString('outRel')
  const imagesRaw = optionalString('images')
  if (imagesRaw !== undefined && !(IMAGES_VOCABULARY as readonly string[]).includes(imagesRaw)) {
    throw new ConvertDocumentError('ERR_INVALID_ARGS', `${tool}: images must be one of [${IMAGES_VOCABULARY.join(', ')}]`)
  }
  const formatRaw = optionalString('format')
  if (formatRaw !== undefined && !(FORMAT_VOCABULARY as readonly string[]).includes(formatRaw)) {
    throw new ConvertDocumentError('ERR_INVALID_ARGS', `${tool}: format must be one of [${FORMAT_VOCABULARY.join(', ')}]`)
  }
  return {
    docRel,
    ...(outRel !== undefined ? { outRel } : {}),
    ...(imagesRaw !== undefined ? { images: imagesRaw as (typeof IMAGES_VOCABULARY)[number] } : {}),
    ...(formatRaw !== undefined ? { format: formatRaw as (typeof FORMAT_VOCABULARY)[number] } : {}),
  }
}

/** 摘要 → 模型可见文本（纯投影——可选键按在场呈现） */
export function renderConvertSummary(value: ConvertDocumentSummary): readonly TextContentBlock[] {
  const lines = [`✓ converted → ${value.outRel} (engine: ${value.engine}`]
  const extras: string[] = []
  if (value.extractedImages !== undefined) extras.push(`images extracted: ${value.extractedImages}`)
  if (value.discardedImages !== undefined) extras.push(`images discarded: ${value.discardedImages}`)
  if (value.pages !== undefined) extras.push(`pages: ${value.pages}`)
  lines[0] = `${lines[0]}${extras.length > 0 ? `, ${extras.join(', ')}` : ''})`
  return [{ type: 'text', text: lines.join('\n') }]
}

/** 注册面输出 schema（成功摘要单支——失败走 tool-error，不进 schema 值域） */
const CONVERT_DOCUMENT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', description: 'Always true on success (failures are tool errors).' },
    outRel: { type: 'string', description: 'Workspace-relative path of the written markdown file.' },
    engine: { type: 'string', description: 'docx | pdf' },
    extractedImages: { type: 'integer', description: 'assets strategy: number of images extracted next to the output.' },
    discardedImages: { type: 'integer', description: 'discard strategy: number of images dropped.' },
    pages: { type: 'integer', description: 'pdf: number of pages extracted.' },
  },
  required: ['ok', 'outRel', 'engine'],
} as const

/** 注册面依赖（注入点——fs 缝与诊断发射面；缺省 node:fs + console 按级兜底） */
export interface ConvertDocumentToolDeps {
  readonly fs?: ConvertFsSeam
  readonly emit?: DiagEmitter
}

/** 可选键 undefined 剔除（lossless JSON 整值边界——判例 223ba5b3 同径） */
function stripUndefined(value: ConvertDocumentSummary): ConvertDocumentSummary {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as unknown as ConvertDocumentSummary
}

/** session.cwd 锚解析（knowledge sessionContextOf 同构裁剪——cwd 兼容位双读） */
export function sessionCwdOf(exec: ToolExecFace | undefined): string | undefined {
  const session = exec?.agent?.session
  if (session === undefined) return undefined
  return session.header?.cwd ?? session.cwd
}

/** tool 定义工厂 */
export function createConvertDocumentTool(deps: ConvertDocumentToolDeps = {}): MermaidToolDefinition {
  const emit = deps.emit
  const failDiag = (message: string, extra: { docRel?: string; outRel?: string; stack?: string }): void => {
    emitConvertDiag(emit, { level: 'error', event: DOC_CONVERT_FAIL_EVENT, message, process: 'main', ...extra })
  }
  return {
    name: CONVERT_TOOL_NAME,
    description:
      'Convert a Word (.docx) or PDF document in the workspace to markdown and write the .md file next to it (or to outRel). Legacy .doc files and scanned PDFs (no extractable text) are explicitly rejected. Images: assets (default) extracts embedded images next to the output under assets/ and rewrites references; discard drops them. Returns a summary (output path, engine, image/page counts); failures are typed tool errors with no partial output.',
    parameters: {
      type: 'object',
      properties: {
        docRel: { type: 'string', description: 'Document path relative to the workspace root (.docx or .pdf; required).' },
        outRel: { type: 'string', description: 'Output markdown path relative to the workspace root; defaults to the same directory with a .md extension.' },
        images: { type: 'string', description: `Image strategy: [${IMAGES_VOCABULARY.join(', ')}]; defaults to assets.` },
        format: { type: 'string', description: `Engine override: [${FORMAT_VOCABULARY.join(', ')}]; auto dispatches mechanically by file extension.` },
      },
      required: ['docRel'],
    },
    output: { schema: CONVERT_DOCUMENT_OUTPUT_SCHEMA, render: (_args, value) => renderConvertSummary(value as ConvertDocumentSummary) },
    async execute(args: unknown, exec?: ToolExecFace): Promise<ConvertDocumentSummary> {
      const parsed = parseConvertDocumentArgs(args)
      const cwd = sessionCwdOf(exec)
      if (cwd === undefined || cwd.trim() === '') {
        failDiag(`${CONVERT_TOOL_NAME}: no session workspace in this call context — the conversion target cannot be anchored`, { docRel: parsed.docRel })
        throw new ConvertDocumentError(
          'ERR_IO',
          `${CONVERT_TOOL_NAME}: no session workspace in this call context — the conversion target cannot be anchored to a workspace root`,
        )
      }
      try {
        const summary = await convertDocumentWorkspaceFile(parsed, { cwd, fs: deps.fs ?? defaultConvertFs })
        emitConvertDiag(emit, {
          level: 'info',
          event: DOC_CONVERT_EVENT,
          message: `converted ${parsed.docRel} → ${summary.outRel} (engine: ${summary.engine})`,
          process: 'main',
          cwd,
          docRel: parsed.docRel,
          outRel: summary.outRel,
        })
        return stripUndefined(summary)
      } catch (e) {
        if (!isConvertDocumentError(e)) {
          // typed error 归一：分派/引擎层意外错误不裸抛（tool-error 语义单点承载）
          throw new ConvertDocumentError(
            'ERR_CONVERT_ENGINE',
            `${CONVERT_TOOL_NAME}: ${e instanceof Error ? e.message : String(e)}`,
          )
        }
        failDiag(`${CONVERT_TOOL_NAME}: ${e.code} — ${e.message}`, {
          docRel: parsed.docRel,
          outRel: parsed.outRel,
          stack: e instanceof Error ? e.stack : undefined,
        })
        throw e
      }
    },
  }
}
