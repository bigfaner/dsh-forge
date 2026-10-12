// 收起/展开单源组件单测（task-ui-visual-copy-blitz S2）——多行默认收起显首行 / 点击面
// （受控 props 夹取双态——SSR renderToStaticMarkup 仓库形制）/ 展开全文保留换行 / 单行直显。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CollapsibleText, Fold, firstLineOf, isMultiline } from './collapsible-text.js'

const MULTILINE = '第一行摘要\n第二行细节\n第三行收尾'

describe('纯函数面', () => {
  it('isMultiline：含 \\n 判多行；单行/空串 = 否', () => {
    expect(isMultiline('单行')).toBe(false)
    expect(isMultiline('')).toBe(false)
    expect(isMultiline('a\nb')).toBe(true)
    expect(isMultiline('a\r\nb')).toBe(true)
  })

  it('firstLineOf：取首行，CRLF 尾随 \\r 剥除', () => {
    expect(firstLineOf(MULTILINE)).toBe('第一行摘要')
    expect(firstLineOf('x\r\ny')).toBe('x')
    expect(firstLineOf('only')).toBe('only')
  })
})

describe('CollapsibleText（单源面）', () => {
  it('多行默认收起：只显首行，全文不在静态标记中，折叠锚 + aria-expanded=false 在场', () => {
    const html = renderToStaticMarkup(<CollapsibleText text={MULTILINE} />)
    expect(html).toContain('data-dswf-td-fold="collapsed"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('第一行摘要')
    expect(html).not.toContain('第二行细节')
    expect(html).toContain('展开')
  })

  it('受控展开：全文渲染且 pre-wrap 保留换行（\\n 字面在源文本节点中）', () => {
    const html = renderToStaticMarkup(<CollapsibleText text={MULTILINE} expanded={true} />)
    expect(html).toContain('data-dswf-td-fold="expanded"')
    expect(html).toContain('第一行摘要\n第二行细节\n第三行收尾')
    expect(html).toContain('dswf-td-fold-text')
    expect(html).toContain('收起')
  })

  it('单行直显：零折叠锚（span 直通）', () => {
    const html = renderToStaticMarkup(<CollapsibleText text="单行文本" />)
    expect(html).not.toContain('data-dswf-td-fold')
    expect(html).toContain('单行文本')
  })
})

describe('Fold（泛化折叠——submit 结构化块载体）', () => {
  it('collapsed = 摘要节点 + 展开 caret；children 不渲染', () => {
    const html = renderToStaticMarkup(
      <Fold summary={<span>AC 2/3 ✓</span>}>
        <div>逐项徽标</div>
      </Fold>,
    )
    expect(html).toContain('AC 2/3 ✓')
    expect(html).not.toContain('逐项徽标')
    expect(html).toContain('aria-expanded="false"')
  })

  it('expanded = children 全量 + 收起钮', () => {
    const html = renderToStaticMarkup(
      <Fold summary={<span>AC 2/3 ✓</span>} expanded={true}>
        <div>逐项徽标</div>
      </Fold>,
    )
    expect(html).toContain('逐项徽标')
    expect(html).toContain('data-dswf-td-fold-collapse=""')
  })
})
