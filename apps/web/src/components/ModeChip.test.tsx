// ModeChip 单测 —— 4.2 AC1 三态：远征（蓝点+「远征」）/ 突击（琥珀点+「突击」）/
// 未标记（中性不可点 + 悬停「扫描吸收的旧提案无溯源」）；有溯源且回调在场 = 可点快捷入口
// （同 ⋯ 菜单唯一正门不分叉）。渲染面 = renderToStaticMarkup（仓库形制）；点击接线归 4.6 装配 + e2e。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MODE_CHIP_LABELS, MODE_CHIP_UNMARKED_TITLE, ModeChip } from './ModeChip.js'

describe('ModeChip 三态（AC1）', () => {
  it('远征：蓝点 + 「远征」标签（data-mode 承载点色语义）', () => {
    const markup = renderToStaticMarkup(<ModeChip mode="expedition" onOpenChangeMode={() => {}} />)
    expect(markup).toContain('data-dswf-mode-chip="expedition"')
    expect(markup).toContain('data-mode="expedition"')
    expect(markup).toContain(`>${MODE_CHIP_LABELS.expedition}</span>`)
  })

  it('突击：琥珀点 + 「突击」标签', () => {
    const markup = renderToStaticMarkup(<ModeChip mode="blitz" onOpenChangeMode={() => {}} />)
    expect(markup).toContain('data-dswf-mode-chip="blitz"')
    expect(markup).toContain('data-mode="blitz"')
    expect(markup).toContain(`>${MODE_CHIP_LABELS.blitz}</span>`)
  })

  it('未标记：中性不可点（disabled）+ 悬停「扫描吸收的旧提案无溯源」+ 无点', () => {
    const markup = renderToStaticMarkup(<ModeChip mode={undefined} onOpenChangeMode={() => {}} />)
    expect(markup).toContain('data-dswf-mode-chip="unmarked"')
    expect(markup).toContain('disabled')
    expect(markup).toContain(`title="${MODE_CHIP_UNMARKED_TITLE}"`)
    expect(markup).toContain('未标记')
    expect(markup).not.toContain('data-mode=') // 无点（中性纯文案占位）
  })

  it('有溯源可点 = 模式更改快捷入口（title 指明唯一正门；无回调 = 只读 disabled）', () => {
    const clickable = renderToStaticMarkup(<ModeChip mode="expedition" onOpenChangeMode={() => {}} />)
    expect(clickable).not.toContain('disabled')
    expect(clickable).toContain('唯一正门')

    const readonly = renderToStaticMarkup(<ModeChip mode="expedition" />)
    expect(readonly).toContain('disabled') // 只读呈现（UF-4 feature 行恒远征消费面）
    expect(readonly).not.toContain('唯一正门')
  })

  it('className 透传（布局类名附加）', () => {
    const markup = renderToStaticMarkup(<ModeChip mode="blitz" className="dswf-ov-parent-mode" />)
    expect(markup).toContain('dswf-ov-parent-mode')
  })
})
