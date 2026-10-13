// @dsh-forge/md-mermaid/web —— 渲染面（React peer；引擎懒加载唯一径 + 主题 + 组件 + DOM 渐进增强）。
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
export {
  MD_MERMAID_BLOCK_FLAG,
  MD_MERMAID_FIGURE_FLAG,
  createMermaidEnhancer,
  isMermaidCandidate,
  type EnhancerDocument,
  type EnhancerElement,
  type MermaidEngineLike,
  type MermaidEnhancer,
  type MermaidEnhancerOptions,
} from './enhancer.js'

export const MD_MERMAID_WEB_VERSION = '0.1.0' as const
