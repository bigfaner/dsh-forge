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

/**
 * 版本常量（单一事实源 = package.json version）：源中为占位字面量，构建期由
 * scripts/sync-version.mjs 以 package.json version 回填 dist/ui 运行期面（F3/N6
 * ——禁手改本字面量，双源漂移在源头消除；tests/client-bundle-dom pin 在场守卫）。
 */
export const MD_MERMAID_WEB_VERSION: string = '__MD_MERMAID_WEB_VERSION__'
