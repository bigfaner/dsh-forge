// components/HeatBadge 单测 —— 热度徽章（热度 = 事件计数展示，UF-6 Data Requirements）。
// 断言锚点 = 任务 2.6 AC-1/AC-3/AC-4：数值展示 / props 原始形状（count: number）/ 官方 Tag 复用。
// 口径：count 原样呈现（UF-6 Validation「热度数字必须等于使用事件计数」——是否展示由消费方决定）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeatBadge } from './HeatBadge.js'

describe('HeatBadge 热度徽章', () => {
  it('渲染热度计数（数值展示）', () => {
    const markup = renderToStaticMarkup(<HeatBadge count={7} />)
    expect(markup).toContain('dswf-heat-badge')
    expect(markup).toContain('热度')
    expect(markup).toContain('7')
  })
  it('count=0 原样呈现 0（可见性策略归消费方——不做数值语义判断，零业务逻辑）', () => {
    expect(renderToStaticMarkup(<HeatBadge count={0} />)).toContain('0')
  })
  it('className 透传（布局归消费方）', () => {
    const markup = renderToStaticMarkup(<HeatBadge count={3} className="card-heat" />)
    expect(markup).toContain('card-heat')
    expect(markup).toContain('dswf-heat-badge')
  })
})
