// HeroEmpty 单测 —— UF-2 首用 hero 空态（价值一句话 + CTA + 「鲸游书海」插画）渲染面。
// SSR 直渲（react-dom/server——渲染面；点击交互归 e2e）。断言锚 = data-dswf-hero /
// data-dswf-cta（e2e/走查锚）、CTA 官方 Button（Hard Rule 官方件复用）与插画装饰
// 性口径（alt 空 + aria-hidden）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeroEmpty } from './HeroEmpty.js'

describe('HeroEmpty（UF-2 首用 hero 空态）', () => {
  it('价值一句话 + 「添加项目」CTA 呈现（data-dswf-hero 相位锚）', () => {
    const markup = renderToStaticMarkup(<HeroEmpty />)
    expect(markup).toContain('data-dswf-hero')
    expect(markup).toContain('以知识资产为核心的研发工作台')
    expect(markup).toContain('添加项目')
    // fix-17：CTA 官方 icon 位 = IconProjectAddOutlineRegular（文件夹+加号官方件——
    // 官方件 artwork 路径前缀钉形；文本前缀 ％＋ 退役）
    expect(markup).toContain('M5.54492 2.06738')
    expect(markup).not.toContain('＋')
    expect(markup).toContain('data-dswf-cta="add-project"')
  })
  it('CTA = button 元素（官方 Button——回调绑定面在；缺席也可渲染）', () => {
    const withCb = renderToStaticMarkup(<HeroEmpty onAddProject={() => {}} />)
    expect(withCb).toMatch(/<button[^>]*data-dswf-cta="add-project"/)
    expect(renderToStaticMarkup(<HeroEmpty />)).toMatch(/<button[^>]*data-dswf-cta="add-project"/)
  })
  it('「鲸游书海」插画沉底（装饰性——alt 空 + aria-hidden 不进无障碍树）', () => {
    const markup = renderToStaticMarkup(<HeroEmpty />)
    expect(markup).toContain('class="dswf-hero-bg"')
    expect(markup).toContain('src="/brand/whale-hero-bg.svg"')
    expect(markup).toContain('alt=""')
    expect(markup).toContain('aria-hidden="true"')
  })
})
