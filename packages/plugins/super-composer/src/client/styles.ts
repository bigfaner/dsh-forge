// super-composer —— 样式生命周期（dsh-plugin-dev-guide §5 判别）：
// **factory 同步段注入**（本模块在 bundle 顶层被 src/client/index.ts 调用，apply 之外）
// → 官方 modules 在模块 factory 物化同步返回后清点未打标的 <style>（claimStyles，
// modules/system.ts:304-306）打 data-plugin 标，停用时 removeOwnedStyles 随卸载移除。
// 不用「apply 内注入 + ctx.effect 自管」备选——两法取一，不混。
//
// 本体样式（mini-composer 一体卡替身）：chevron 自定义光标（应用风格 svg data-uri，
// cursor 无法消费 CSS 变量——以主题锚 body[data-ds-dark-theme] 覆写双色双套）+
// 预告淡化过渡；其余视觉（材质/令牌间距）由组件内联 --dsw-alias-* 令牌承载。

/** 样式元素标识（幂等重入判据 + 诊断锚；非官方 claim 标——官方只认未打标元素清点） */
export const SUPER_COMPOSER_STYLE_MARKER = 'data-dsh-forge-super-composer'

/** svg data-uri 光标（chevron 箭头，1.6px 描边应用风格；hotspot = 箭头尖端）。 */
function chevronCursor(direction: "up" | "down", stroke: string): string {
  const path = direction === "up" ? "M3.5 10.5 8 6l4.5 4.5" : "M3.5 5.5 8 10l4.5-4.5"
  return (
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'>` +
    `<path d='${path}' fill='none' stroke='${stroke}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/>` +
    `</svg>") 8 4, ns-resize`
  )
}

const LIGHT = "#405c78"
const DARK = "#a8c7e8"

/** 样式规则集（mini-composer 一体卡：光标 + 预告过渡；令牌化随主题）。 */
export const SUPER_COMPOSER_CSS = [
  `.dscf-hotzone.dscf-hotzone-expand { cursor: ${chevronCursor("up", LIGHT)}; }`,
  `.dscf-hotzone.dscf-hotzone-collapse { cursor: ${chevronCursor("down", LIGHT)}; }`,
  `body[data-ds-dark-theme] .dscf-hotzone.dscf-hotzone-expand { cursor: ${chevronCursor("up", DARK)}; }`,
  `body[data-ds-dark-theme] .dscf-hotzone.dscf-hotzone-collapse { cursor: ${chevronCursor("down", DARK)}; }`,
  `[data-testid="dscf-root"] { transition: opacity .2s var(--ds-ease-in-out, ease); }`,
  // placeholder 显式着色（bug 49368004：textarea color 透明化后 placeholder 不得跟随透明）
  `[data-dscf-composer-input]::placeholder { color: var(--dsw-alias-label-tertiary); }`,
  "",
].join("\n")

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
export function installSuperComposerStyles(doc: StyleDocument | undefined): unknown | undefined {
  if (doc === undefined) return undefined
  const existing = doc.querySelectorAll(`[${SUPER_COMPOSER_STYLE_MARKER}]`)
  if (existing.length > 0) return existing[0]
  const style = doc.createElement('style')
  style.setAttribute(SUPER_COMPOSER_STYLE_MARKER, '')
  style.textContent = SUPER_COMPOSER_CSS
  doc.head.appendChild(style)
  return style
}
