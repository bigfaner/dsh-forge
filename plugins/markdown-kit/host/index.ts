// @dsh-forge/markdown-kit —— 插件入口（Node，cordis loader 装载面）。
// 形态：Cordis Plugin.Function（loader 只认 default 导出，core/index.ts 同型）：
//   inject = ['tools'] —— 唯一消费面为 dsh 官方 tool 注册面（结构化窄类型见 ./faces.ts，
//   零 dsh 运行时依赖——plugin-forge-spec 同法）。装配：validateMermaid + convertDocument
//   + getOutline 三 tool 恰各一注册（tools.register），交出合并 disposer（fiber 卸载即全注销）。
import type { MermaidPluginContextFace } from './faces.js'
import { createValidateMermaidTool, type ValidateMermaidToolDeps } from './tools/validate-mermaid.js'
import { createConvertDocumentTool, type ConvertDocumentToolDeps } from './tools/convert-document.js'
import { createGetOutlineTool, type GetOutlineToolDeps } from './tools/get-outline.js'

export const MD_MERMAID_PLUGIN_NAME = 'markdown-kit' as const

/** 插件配置（读取缝/fs 缝等依赖经工厂注入） */
export interface MdMermaidPluginConfig extends ValidateMermaidToolDeps, ConvertDocumentToolDeps, GetOutlineToolDeps {}

/** 函数插件形状（Plugin.Function + inject 元数据） */
export interface MdMermaidPlugin {
  (ctx: MermaidPluginContextFace, config?: MdMermaidPluginConfig): () => void
  /** 依赖声明：声明服务齐备才加载（Cordis service-availability 语义） */
  readonly inject: readonly string[]
}

const mdMermaidPlugin: MdMermaidPlugin = Object.assign(
  (ctx: MermaidPluginContextFace, config: MdMermaidPluginConfig = {}): (() => void) => {
    // 诊断发射面（埋点经装配期注入——DIAG_EVENT 类型化 emit，host main 进程位；
    // 缺席 = 工具面 console 按级兜底，禁静默）
    const diagEmit =
      typeof ctx.emit === 'function'
        ? (payload: Parameters<NonNullable<MermaidPluginContextFace['emit']>>[1]) => ctx.emit!('diag/log', payload)
        : undefined
    const disposeValidate = ctx.tools.register(createValidateMermaidTool(config))
    const disposeConvert = ctx.tools.register(createConvertDocumentTool({ fs: config.fs, emit: diagEmit }))
    const disposeOutline = ctx.tools.register(createGetOutlineTool({ fs: config.fs, emit: diagEmit }))
    return () => {
      disposeValidate()
      disposeConvert()
      disposeOutline()
    }
  },
  { inject: ['tools'] as const },
)

export default mdMermaidPlugin
export { MERMAID_TOOL_NAME, createValidateMermaidTool, ValidateMermaidError, isValidateMermaidError } from './tools/validate-mermaid.js'
export type { ValidateMermaidToolArgs, ValidateMermaidToolDeps, MermaidToolErrorCode } from './tools/validate-mermaid.js'
export {
  CONVERT_TOOL_NAME,
  createConvertDocumentTool,
  ConvertDocumentError,
  isConvertDocumentError,
  parseConvertDocumentArgs,
  renderConvertSummary,
  sessionCwdOf,
} from './tools/convert-document.js'
export type { ConvertDocumentToolArgs, ConvertDocumentToolDeps, ConvertDocumentToolErrorCode } from './tools/convert-document.js'
export {
  GET_MD_OUTLINE,
  MD_OUTLINE_EVENT,
  MD_OUTLINE_FAIL_EVENT,
  createGetOutlineTool,
  GetOutlineError,
  isGetOutlineError,
  parseGetOutlineArgs,
  renderOutline,
} from './tools/get-outline.js'
export type { GetOutlineToolArgs, GetOutlineToolDeps, GetOutlineToolErrorCode } from './tools/get-outline.js'
export { parseMarkdownOutline, renderOutlineTree } from './outline/index.js'
export type { OutlineNode, OutlineResult } from './outline/index.js'
export { convertDocumentWorkspaceFile, defaultOutRelOf, assertRelUnderRoot, defaultConvertFs } from './convert/index.js'
export type { ConvertDocumentInput, ConvertDocumentSummary, ConvertDocumentDeps, ConvertFsSeam } from './convert/index.js'
export { convertDocxToMarkdown } from './convert/docx.js'
export type { ConvertImageStrategy, DocxConvertOptions, DocxConvertOutcome } from './convert/docx.js'
export { convertPdfToMarkdown } from './convert/pdf.js'
export type { PdfConvertOutcome } from './convert/pdf.js'
export { DOC_CONVERT_EVENT, DOC_CONVERT_FAIL_EVENT, emitConvertDiag } from './convert/diag.js'
export type { ConvertDiagPayload, DiagEmitFace, DiagEmitter } from './convert/diag.js'
export type { MermaidPluginContextFace, MermaidToolDefinition, ToolRegisterFace, ToolExecFace, ToolSessionFace } from './faces.js'
