// OverviewHead 单测 —— AC1：默认折叠（项目名 + 状态摘要一行）；▾ 展开 4 行
// （工作区/文档位置/知识目录/任务清单@hash8）；▴ 收起。
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

describe('OverviewHead（AC1 ov-head 折叠头）', () => {
  it('默认折叠：项目名 + 一行状态摘要在场；4 行路径详情缺席；▾ 展开钮', () => {
    const markup = renderToStaticMarkup(<OverviewHead {...base} open={false} />)
    expect(markup).toContain('data-dswf-ov-head')
    expect(markup).toContain('demo')
    expect(markup).toContain('m2-pipeline · 2 完成')
    expect(markup).not.toContain('dswf-ov-info') // 信息块整体缺席（折叠态零信息行）
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('▾')
  })

  it('展开：4 行路径详情在场（工作区/文档位置/知识目录/任务清单@hash8）+ ▴ 收起', () => {
    const markup = renderToStaticMarkup(<OverviewHead {...base} open={true} />)
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain('▴ 收起')
    expect(markup).toContain('工作区')
    expect(markup).toContain('Z:/ws/demo')
    expect(markup).toContain('文档位置')
    expect(markup).toContain('.forge')
    expect(markup).toContain('知识目录')
    expect(markup).toContain('.knowledge')
    expect(markup).toContain('任务清单')
    expect(markup).toContain('demo@a1b2c3d4')
  })

  it('折叠/展开共享行集（受控组件——open 只切换信息块与钮形态）', () => {
    const collapsed = renderToStaticMarkup(<OverviewHead {...base} open={false} />)
    const expanded = renderToStaticMarkup(<OverviewHead {...base} open={true} />)
    expect(collapsed).toContain('展开位置详情')
    expect(expanded).toContain('收起位置详情')
    // 项目名与摘要行两种形态恒在场（折叠行 = 常驻子树）
    for (const markup of [collapsed, expanded]) {
      expect(markup).toContain('dswf-ov-head-line')
      expect(markup).toContain('demo')
    }
  })
})
