// OverviewHead 单测 —— M3.1 D20（原型十一轮）：展开/收起 = 同一枚按钮同位翻转
// （官方 ChevronDown 旋转标记 + 展开↔收起文案 + aria-expanded）；行内 ghost ▾/▴
// 字符形态退役（否定断言）。默认折叠（项目名 + 状态摘要一行）；展开 4 行
// （工作区/文档位置/知识目录/任务清单@hash8）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OverviewHead } from './ov-head.js'

const ROWS = [
  { label: '工作区', value: 'Z:/ws/demo' },
  { label: '文档位置', value: 'Z:/ws/demo/.forge' },
  { label: '知识目录', value: 'Z:/ws/demo/.knowledge' },
  { label: '任务清单', value: 'C:/forge-home/demo@a1b2c3d4' },
]

const base = {
  projectName: 'demo',
  summary: 'm2-pipeline · 2 完成',
  rows: ROWS,
  onToggle: () => {},
}

describe('OverviewHead（M3.1 D20 同位翻转钮）', () => {
  it('默认折叠：项目名 + 一行状态摘要在场；4 行路径详情缺席；单钮 = chevron + 「展开」文案', () => {
    const markup = renderToStaticMarkup(<OverviewHead {...base} open={false} />)
    expect(markup).toContain('data-dswf-ov-head')
    expect(markup).toContain('demo')
    expect(markup).toContain('m2-pipeline · 2 完成')
    expect(markup).not.toContain('dswf-ov-info') // 信息块整体缺席（折叠态零信息行）
    expect(markup).toContain('aria-expanded="false"')
    // 单一开关钮（名称行内）：官方 ChevronDown（svg 载体）+ 展开文案
    expect((markup.match(/data-dswf-ov-head-toggle=""/g) ?? []).length).toBe(1)
    expect(markup).toContain('dswf-ov-head-caret')
    expect(markup).toContain('<svg')
    expect(markup).toContain('展开')
    expect(markup).not.toContain('收起')
  })

  it('展开：4 行路径详情在场 + 同一钮翻转（chevron 旋转标记 + 「收起」文案 + aria-expanded）', () => {
    const markup = renderToStaticMarkup(<OverviewHead {...base} open={true} />)
    expect(markup).toContain('aria-expanded="true"')
    expect((markup.match(/data-dswf-ov-head-toggle=""/g) ?? []).length).toBe(1)
    expect(markup).toContain('dswf-ov-head-caret is-open') // 展开态旋转标记（几何翻转锚）
    expect(markup).toContain('收起')
    expect(markup).not.toContain('展开') // 文案互斥（aria-label/title 的「展开位置详情」亦翻转）
    expect(markup).toContain('工作区')
    expect(markup).toContain('Z:/ws/demo')
    expect(markup).toContain('文档位置')
    expect(markup).toContain('.forge')
    expect(markup).toContain('知识目录')
    expect(markup).toContain('.knowledge')
    expect(markup).toContain('任务清单')
    expect(markup).toContain('demo@a1b2c3d4')
  })

  it('折叠/展开共享行集（受控组件——open 只翻转 chevron 旋转标记与钮文案，行子树恒在场）', () => {
    const collapsed = renderToStaticMarkup(<OverviewHead {...base} open={false} />)
    const expanded = renderToStaticMarkup(<OverviewHead {...base} open={true} />)
    expect(collapsed).toContain('展开位置详情')
    expect(expanded).toContain('收起位置详情')
    // 项目名与摘要行两种形态恒在场（折叠行 = 常驻子树——同位钮所在行不重建）
    for (const markup of [collapsed, expanded]) {
      expect(markup).toContain('dswf-ov-head-line')
      expect(markup).toContain('demo')
      expect(markup).toContain('m2-pipeline · 2 完成')
    }
    // 翻转钮行内常驻同位（名称行内序列恒定：name → summary → toggle）
    const order = (markup: string): number =>
      markup.indexOf('dswf-ov-name') < markup.indexOf('dswf-ov-summary') &&
      markup.indexOf('dswf-ov-summary') < markup.indexOf('data-dswf-ov-head-toggle')
        ? 1
        : 0
    expect(order(collapsed)).toBe(1)
    expect(order(expanded)).toBe(1)
  })

  it('行内 ghost ▾/▴ 字符形态退役（否定断言——M3.1 D20 裁决）', () => {
    const collapsed = renderToStaticMarkup(<OverviewHead {...base} open={false} />)
    const expanded = renderToStaticMarkup(<OverviewHead {...base} open={true} />)
    for (const markup of [collapsed, expanded]) {
      expect(markup).not.toContain('▾')
      expect(markup).not.toContain('▴')
    }
  })
})
