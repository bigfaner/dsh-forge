// @dsh-forge/md-mermaid —— 插件入口（Node，cordis loader 装载面）。
// 形态：Cordis Plugin.Function（loader 只认 default 导出，core/index.ts 同型）：
//   inject = ['tools'] —— 唯一消费面为 dsh 官方 tool 注册面（结构化窄类型见 ./faces.ts，
//   零 dsh 运行时依赖——plugin-forge-spec 同法）。装配：validateMermaid tool 恰一注册
//   （tools.register），交出合并 disposer（fiber 卸载即全注销）。
import type { MermaidPluginContextFace } from './faces.js'
import { createValidateMermaidTool, type ValidateMermaidToolDeps } from './tools/validate-mermaid.js'

export const MD_MERMAID_PLUGIN_NAME = 'md-mermaid' as const

/** 插件配置（本期无配置项——读取缝等依赖经工厂注入，预留 config 位） */
export interface MdMermaidPluginConfig extends ValidateMermaidToolDeps {}

/** 函数插件形状（Plugin.Function + inject 元数据） */
export interface MdMermaidPlugin {
  (ctx: MermaidPluginContextFace, config?: MdMermaidPluginConfig): () => void
  /** 依赖声明：声明服务齐备才加载（Cordis service-availability 语义） */
  readonly inject: readonly string[]
}

const mdMermaidPlugin: MdMermaidPlugin = Object.assign(
  (ctx: MermaidPluginContextFace, config: MdMermaidPluginConfig = {}): (() => void) => {
    const disposeTool = ctx.tools.register(createValidateMermaidTool(config))
    return () => {
      disposeTool()
    }
  },
  { inject: ['tools'] as const },
)

export default mdMermaidPlugin
export { MERMAID_TOOL_NAME, createValidateMermaidTool, ValidateMermaidError, isValidateMermaidError } from './tools/validate-mermaid.js'
export type { ValidateMermaidToolArgs, ValidateMermaidToolDeps, MermaidToolErrorCode } from './tools/validate-mermaid.js'
export type { MermaidPluginContextFace, MermaidToolDefinition, ToolRegisterFace } from './faces.js'
