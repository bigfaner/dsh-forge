// components/EmptyState 单测 —— 统一空态简版（P1；M8 打磨）。
// 断言锚点 = 任务 2.6 AC-1（引导插槽）/AC-3（props 原始形状：string + ReactNode 插槽）。
// 消费方（page-map Shared Components）：知识库空库引导（UF-6）/ 会话召回 tab 无召回（UF-4）/ 会话列表空态。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EmptyState } from './EmptyState.js'

describe('EmptyState 统一空态', () => {
  it('标题 + 描述 + 引导插槽（action ReactNode）三段呈现', () => {
    const markup = renderToStaticMarkup(
      <EmptyState
        title="尚无知识"
        description="知识目录为空：在项目的 knowledge 目录放入 Markdown 文档"
        action={<button type="button">查看目录位置</button>}
      />,
    )
    expect(markup).toContain('data-dswf-empty')
    expect(markup).toContain('尚无知识')
    expect(markup).toContain('知识目录为空')
    expect(markup).toContain('dswf-empty-action')
    expect(markup).toContain('<button type="button">查看目录位置</button>')
  })
  it('描述与插槽均可选（缺席不渲染空节点）', () => {
    const markup = renderToStaticMarkup(<EmptyState title="本会话暂无召回记录" />)
    expect(markup).toContain('本会话暂无召回记录')
    expect(markup).not.toContain('dswf-empty-description')
    expect(markup).not.toContain('dswf-empty-action')
  })
  it('className 透传（布局归消费方）', () => {
    expect(renderToStaticMarkup(<EmptyState title="t" className="recall-empty" />)).toContain(
      'recall-empty',
    )
  })
})
