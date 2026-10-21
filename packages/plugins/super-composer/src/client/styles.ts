// super-composer —— 样式生命周期（dsh-plugin-dev-guide §5 判别）：
// **factory 同步段注入**（本模块在 bundle 顶层被 src/client/index.ts 调用，apply 之外）
// → 官方 modules 在模块 factory 物化同步返回后清点未打标的 <style>（claimStyles，
// modules/system.ts:304-306）打 data-plugin 标，停用时 removeOwnedStyles 随卸载移除。
// 不用「apply 内注入 + ctx.effect 自管」备选——两法取一，不混。
//
// 本体样式（底部一体卡替身视觉）由后续任务按 DESIGN.md 令牌表填充；本骨架落
// 注入/幂等/生命周期机械与清点窗口契约，样式规则集占位为零规则注释块。

/** 样式元素标识（幂等重入判据 + 诊断锚；非官方 claim 标——官方只认未打标元素清点） */
export const SUPER_COMPOSER_STYLE_MARKER = 'data-dsh-forge-super-composer'

/** 样式规则集（骨架占位：零规则；后续任务按 DESIGN.md 令牌表填充一体卡替身规则） */
export const SUPER_COMPOSER_CSS = '/* super-composer: rules land with mini-composer task (DESIGN.md tokens) */\n'

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
