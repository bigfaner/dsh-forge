// quote-reference —— 样式生命周期（dsh-plugin-dev-guide §5 判别）：
// **factory 同步段注入**（本模块在 bundle 顶层被 src/client/index.ts 调用，apply 之外）
// → 官方 modules 在模块 factory 物化同步返回后清点未打标的 <style>（claimStyles，
// modules/system.ts:304-306）打 data-plugin 标，停用时 removeOwnedStyles 随卸载移除。
// 不用「apply 内注入 + ctx.effect 自管」备选——两法取一，不混。
//
/** 样式元素标识（幂等重入判据 + 诊断锚；非官方 claim 标——官方只认未打标元素清点） */
export const QUOTE_REFERENCE_STYLE_MARKER = 'data-dsh-forge-quote-reference'

// 本体样式（1.45 选段浮出菜单紧凑化）：官方 Menu `.list` 带 `min-width: 144px`
//（设计外卡宽度下界——含内边距），单行「添加到对话」短标签撑不满下界 → 右侧大片
// 空白。紧凑化 = 收缩至内容+内边距（`min-width: 0` + `width: max-content`）：
// Menu 锚定/翻上/视口钳制均按 offsetWidth 实测读数（官方 place()），卡宽变化不破
// 锚定；行元素 `.item` width:100% 随卡收缩，可点区同缩（零空白可点带）。
export const QUOTE_REFERENCE_CSS = [
  '.dshf-quote-selection-menu {',
  '  min-width: 0;',
  '  width: max-content;',
  '}\n',
].join('\n')

/** 最小文档窄面（真实 DOM 与测试注入同型——不锁 Document 全量形状） */
export interface StyleDocument {
  createElement(tagName: string): { setAttribute(name: string, value: string): void; appendChild(node: unknown): unknown; textContent: string }
  querySelectorAll(selectors: string): ArrayLike<unknown>
  head: { appendChild(node: unknown): unknown }
}

/**
 * factory 同步段样式注入（幂等：已存在同标记元素 = 原样返回，不重插）。
 * document 缺席（Node/无 DOM 环境，如 bundle 守卫测试的求值环境）= 静默跳过——
 * classic script 求值环境无 head 可挂，注入面只在真浏览器生效。
 */
export function installQuoteReferenceStyles(doc: StyleDocument | undefined): unknown | undefined {
  if (doc === undefined) return undefined
  const existing = doc.querySelectorAll(`[${QUOTE_REFERENCE_STYLE_MARKER}]`)
  if (existing.length > 0) return existing[0]
  const style = doc.createElement('style')
  style.setAttribute(QUOTE_REFERENCE_STYLE_MARKER, '')
  style.textContent = QUOTE_REFERENCE_CSS
  doc.head.appendChild(style)
  return style
}
