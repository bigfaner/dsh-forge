// super-composer —— 样式生命周期（dsh-plugin-dev-guide §5 判别）：
// **factory 同步段注入**（本模块在 bundle 顶层被 src/client/index.ts 调用，apply 之外）
// → 官方 modules 在模块 factory 物化同步返回后清点未打标的 <style>（claimStyles，
// modules/system.ts:304-306）打 data-plugin 标，停用时 removeOwnedStyles 随卸载移除。
// 不用「apply 内注入 + ctx.effect 自管」备选——两法取一，不混。
//
// 本体样式（mini-composer 一体卡替身）：chevron 自定义光标（应用风格 svg data-uri，
// cursor 无法消费 CSS 变量——以主题锚 body[data-ds-dark-theme] 覆写双色双套；色值
// %23 转义 + 单向系统回落，bug 64817807）+
// 预告淡化过渡；其余视觉（材质/令牌间距）由组件内联 --dsw-alias-* 令牌承载。

/** 样式元素标识（幂等重入判据 + 诊断锚；非官方 claim 标——官方只认未打标元素清点） */
export const SUPER_COMPOSER_STYLE_MARKER = 'data-dsh-forge-super-composer'

/**
 * svg data-uri 光标（chevron 箭头，1.6px 描边应用风格；hotspot = 箭头尖端）。
 * bug 64817807：色值 `#` 必须转义为 %23——裸 `#` 在 data-uri 中起始 URL fragment，
 * svg 被截断解析失败，浏览器回落 fallback 光标（曾为 ns-resize 双向 ↕，即用户所见
 * 双向箭头）。回落亦取单向系统箭头（up=n-resize / down=s-resize），保证光标与
 * 点击语义一致（可展开单向上 / 可折叠单向下）。
 */
function chevronCursor(direction: "up" | "down", stroke: string): string {
  const path = direction === "up" ? "M3.5 10.5 8 6l4.5 4.5" : "M3.5 5.5 8 10l4.5-4.5"
  const fill = direction === "up" ? "n-resize" : "s-resize"
  return (
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'>` +
    `<path d='${path}' fill='none' stroke='${stroke.replace("#", "%23")}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/>` +
    `</svg>") 8 4, ${fill}`
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

/** official-input 复制件样式收集器（bundle 期 css-module 插件按文件推入——见 bundle-client.mjs） */
export interface OfficialCssCarrier {
  __DSCF_OFFICIAL_CSS__?: string[]
}

/** 样式元素标识（复制件 CSS 注入幂等判据） */
export const OFFICIAL_INPUT_STYLE_MARKER = 'data-dsh-forge-super-composer-official-input'

/**
 * official-input 复制件样式注入（factory 同步段，同上判别）：bundle 顶层 import 的
 * .module.css 经 esbuild 插件转译为「类名恒等映射 + 原文推入全局收集器」，本函数把
 * 收集到的官方 CSS 逐字落一个 <style>（选择器已在转译期作用域化
 * [data-dscf-official-input]——官方 .card/.root 等通用类名不碰撞宿主）。幂等同上。
 */
export function installOfficialInputStyles(doc: StyleDocument | undefined): unknown | undefined {
  if (doc === undefined) return undefined
  const existing = doc.querySelectorAll(`[${OFFICIAL_INPUT_STYLE_MARKER}]`)
  if (existing.length > 0) return existing[0]
  const sheets = (globalThis as unknown as OfficialCssCarrier).__DSCF_OFFICIAL_CSS__
  if (sheets === undefined || sheets.length === 0) return undefined
  const style = doc.createElement('style')
  style.setAttribute(OFFICIAL_INPUT_STYLE_MARKER, '')
  style.textContent = sheets.join('\n')
  doc.head.appendChild(style)
  return style
}
