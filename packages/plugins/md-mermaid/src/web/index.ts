// @dsh-forge/md-mermaid/web —— 渲染面（React peer；引擎懒加载唯一径 + 主题 + 组件）。
// MutationObserver 渐进增强模块归后续任务。
export { MERMAID_THEME_VARIABLES } from './theme.js'
export {
  type MermaidEngine,
  type MermaidDiagramProps,
  type MermaidRenderOutcome,
  loadMermaidEngine,
  MermaidDiagram,
  MermaidFallbackCard,
  MermaidFigure,
  nextMermaidId,
  renderMermaidDiagram,
} from './mermaid-diagram.js'

export const MD_MERMAID_WEB_VERSION = '0.1.0' as const
