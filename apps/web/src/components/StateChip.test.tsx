// components/StateChip 单测 —— 状态徽章（官方 Tag 复用，不自绘；P1 无阈值配色，M4/M5 扩展）。
// 断言锚点 = 任务 2.6 AC-1/AC-3/AC-4：可渲染 / props 原始形状（status: string）/ 官方件复用。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StateChip } from './StateChip.js'

describe('StateChip 状态徽章', () => {
  it('渲染状态文本（UF-6 卡片状态字段；P1 承载不配色）', () => {
    const markup = renderToStaticMarkup(<StateChip status="draft" />)
    expect(markup).toContain('draft')
    expect(markup).toContain('dswf-state-chip')
  })
  it('className 透传（布局归消费方）', () => {
    const markup = renderToStaticMarkup(<StateChip status="review" className="card-meta" />)
    expect(markup).toContain('card-meta')
    expect(markup).toContain('dswf-state-chip')
  })
})
