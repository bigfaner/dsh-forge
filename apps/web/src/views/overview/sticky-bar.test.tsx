// StickyBar 单测 —— AC2：三子 tab（用户定向顺序）+ 搜索行（清除钮条件呈现）+
// 排序 pill（⇅ 活跃优先 ↔ 最新创建）+ IME 安全结构不变式（输入值变更仅回流 value
// 属性与清除钮——搜索行子树不重建；静态渲染面 = 键树前缀等价断言）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StickyBar } from './sticky-bar.js'

const base = {
  onSubtabChange: () => {},
  onSearchChange: () => {},
  onSortToggle: () => {},
}

function inputPrefix(markup: string): string {
  // input 元素起始前的键树前缀（含 value 属性前的一切结构——IME 安全不变式断言面）
  const at = markup.indexOf('<input')
  expect(at).toBeGreaterThanOrEqual(0)
  return markup.slice(0, at)
}

/** 文档序断言（noUncheckedIndexedAccess 安全形态）：各锚位全在场且升序 */
function assertAscending(haystack: string, needles: readonly string[]): void {
  const positions = needles.map((needle) => haystack.indexOf(needle))
  expect(positions.every((p) => p >= 0)).toBe(true)
  expect([...positions].sort((a, b) => a - b)).toEqual(positions)
}

describe('StickyBar 子 tab 行（AC2 三子 tab 用户定向顺序）', () => {
  it('顺序 = 提案 → feature → 任务；aria-selected 标注当前态', () => {
    const markup = renderToStaticMarkup(<StickyBar {...base} subtab="proposals" search="" sort="active" />)
    expect(markup).toContain('role="tablist"')
    assertAscending(
      markup,
      ['proposals', 'features', 'tasks'].map((v) => `data-dswf-ov-subtab="${v}"`),
    )
    expect(markup).toContain('aria-selected="true"')
    expect(markup).toContain('aria-selected="false"')
  })

  it('子 tab 按钮标签中文口径（提案/feature/任务）', () => {
    const markup = renderToStaticMarkup(<StickyBar {...base} subtab="tasks" search="" sort="active" />)
    expect(markup).toContain('>提案</button>')
    expect(markup).toContain('>feature</button>')
    expect(markup).toContain('>任务</button>')
  })
})

describe('StickyBar 搜索行（AC2 搜索 + 清除按钮 + IME 安全）', () => {
  it('官方 Input 受控件：value 原样承载 + 概览搜索 aria-label + 逐子 tab 占位文案', () => {
    const markup = renderToStaticMarkup(<StickyBar {...base} subtab="features" search="管线" sort="active" />)
    expect(markup).toContain('value="管线"')
    expect(markup).toContain('aria-label="概览搜索"')
    expect(markup).toContain('placeholder="搜索 feature/文档…"')
  })

  it('清除按钮条件呈现：空关键词缺席；非空在场（aria-label 清除搜索）', () => {
    const empty = renderToStaticMarkup(<StickyBar {...base} subtab="proposals" search="" sort="active" />)
    expect(empty).not.toContain('aria-label="清除搜索"')
    const filled = renderToStaticMarkup(<StickyBar {...base} subtab="proposals" search="网关" sort="active" />)
    expect(filled).toContain('aria-label="清除搜索"')
  })

  it('IME 安全结构不变式：关键词变更不重建搜索行——input 前键树前缀逐字等价 + 唯一 input', () => {
    const a = renderToStaticMarkup(<StickyBar {...base} subtab="proposals" search="" sort="active" />)
    const b = renderToStaticMarkup(<StickyBar {...base} subtab="proposals" search="网" sort="active" />)
    const c = renderToStaticMarkup(<StickyBar {...base} subtab="proposals" search="网关限" sort="active" />)
    // input 前的结构（子 tab 行 + 搜索行容器 + 图标 + input 开标签）不随输入值变化
    expect(inputPrefix(b)).toBe(inputPrefix(c))
    expect(inputPrefix(a)).toBe(inputPrefix(b))
    // 唯一 input 元素（不随值增减——受控更新而非重建）
    for (const markup of [a, b, c]) {
      expect(markup.match(/<input/g)?.length).toBe(1)
    }
    // 清除钮 = input 之后的兄弟位插入（React 条件渲染占位——input 位次不变）
    expect(b.indexOf('<input')).toBeLessThan(b.indexOf('aria-label="清除搜索"'))
  })
})

describe('StickyBar 排序 pill（AC2 ⇅ 活跃优先 ↔ 最新创建）', () => {
  it('排序 pill 右固定呈现当前模式标签', () => {
    const active = renderToStaticMarkup(<StickyBar {...base} subtab="proposals" search="" sort="active" />)
    expect(active).toContain('data-dswf-ov-sort')
    expect(active).toContain('⇅ 活跃优先')
    const created = renderToStaticMarkup(<StickyBar {...base} subtab="proposals" search="" sort="created" />)
    expect(created).toContain('⇅ 最新创建')
  })

  it('排序 pill 在搜索行之后（spacer 推至右缘——v8 形态）', () => {
    const markup = renderToStaticMarkup(<StickyBar {...base} subtab="proposals" search="" sort="active" />)
    expect(markup.indexOf('data-dswf-ov-searchrow')).toBeLessThan(markup.indexOf('data-dswf-ov-sort'))
    expect(markup.indexOf('dswf-ov-spacer')).toBeGreaterThan(0)
  })
})
