// components/SkeletonRows 单测 —— 骨架行容器共享件（fix-36：四域近同构骨架收敛）。
// 断言锚点 = 注入面完整转译（class/行数/域前缀 data 锚/aria-hidden 装饰面）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SkeletonRows } from './SkeletonRows.js'

describe('SkeletonRows 骨架行容器（注入面 = 域 CSS/锚全参数化）', () => {
  it('容器/行 class + 行数 + 域前缀 data 锚 + aria-hidden 装饰面', () => {
    const markup = renderToStaticMarkup(
      <SkeletonRows
        className="dswf-sidebar-skeleton"
        rowClassName="dswf-sidebar-skeleton-row"
        rows={3}
        anchor="data-dswf-sidebar-skeleton"
      />,
    )
    expect(markup).toContain('class="dswf-sidebar-skeleton"')
    expect(markup).toContain('data-dswf-sidebar-skeleton=""')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup.match(/class="dswf-sidebar-skeleton-row"/g)).toHaveLength(3)
  })
  it('锚名随域注入（知识网格 8 卡同型复用——与 className 同域对齐口径）', () => {
    const markup = renderToStaticMarkup(
      <SkeletonRows
        className="dswf-kn-skeleton"
        rowClassName="dswf-kn-skeleton-card"
        rows={8}
        anchor="data-dswf-kn-skeleton"
      />,
    )
    expect(markup).toContain('data-dswf-kn-skeleton=""')
    expect(markup.match(/class="dswf-kn-skeleton-card"/g)).toHaveLength(8)
  })
})
