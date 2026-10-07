// 视图下拉单测 —— AC1：当前视图直出 + ▾ + aria/tooltip（锚钮静态面）；选项 列表|DAG|泳道
// （当前项 ✓ 与外点关闭 = 官方 Menu selection='check'/onClose 内聚——MenuSurface 携
// portal 材质层静态不渲，开合行为归 4.6 接线 + e2e，沿 4.2 官方 Modal 同裁）；M2 三视图
// 语义不变（受控 view/onViewChange——切换保持过滤/排序态归帧侧受控面）。
// asTaskViewMode 菜单 id 守卫 + VIEW_DROPDOWN_ITEMS 选项数据直测。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ViewDropdown, VIEW_DROPDOWN_ITEMS, VIEW_DROPDOWN_TITLE, asTaskViewMode } from './ViewDropdown.js'

const NOOP = (): void => {}

describe('ViewDropdown 锚钮（AC1——当前视图直出 + ▾）', () => {
  it('当前视图直出（视图：列表/DAG/泳道三态）+ ▾ + aria-haspopup/收拢态 + 固定 tooltip + 视图锚', () => {
    const labels = { list: '列表', dag: 'DAG', swim: '泳道' } as const
    for (const view of ['list', 'dag', 'swim'] as const) {
      const markup = renderToStaticMarkup(
        <ViewDropdown view={view} open={false} onViewChange={NOOP} onOpenChange={NOOP} />,
      )
      expect(markup).toContain(`视图：${labels[view]}`)
      expect(markup).toContain('▾')
      expect(markup).toContain('aria-haspopup="menu"')
      expect(markup).toContain('aria-expanded="false"')
      expect(markup).toContain(VIEW_DROPDOWN_TITLE)
      expect(markup).toContain(`data-dswf-tt-viewbtn="${view}"`)
    }
  })
})

describe('选项数据与 id 守卫（AC1——选项 列表|DAG|泳道）', () => {
  it('三选项按 TASK_VIEWS 行序（列表 → DAG → 泳道）——Menu 行 id=视图值', () => {
    expect(VIEW_DROPDOWN_ITEMS).toEqual([
      { id: 'list', label: '列表' },
      { id: 'dag', label: 'DAG' },
      { id: 'swim', label: '泳道' },
    ])
  })

  it('asTaskViewMode：三值命中；未知 = undefined（onSelect 防御——不派发切换）', () => {
    expect(asTaskViewMode('list')).toBe('list')
    expect(asTaskViewMode('dag')).toBe('dag')
    expect(asTaskViewMode('swim')).toBe('swim')
    expect(asTaskViewMode('bogus')).toBeUndefined()
  })
})
