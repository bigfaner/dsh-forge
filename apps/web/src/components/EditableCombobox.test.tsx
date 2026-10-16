// EditableCombobox 单测 —— SSR 静态面（闭态）；交互语义（键盘/回填/失焦）在 combobox-model
// 纯函数面直测（无 jsdom——仓内惯例同 apps/web AddProjectFlow.test 头注口径）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EditableCombobox } from './EditableCombobox.js'

const OPTIONS = [
  { id: 'wt-a', label: 'wt-a' },
  { id: 'wt-b', label: 'wt-b' },
]

const render = (over: Record<string, unknown> = {}): string =>
  renderToStaticMarkup(
    <EditableCombobox
      value="wt-a"
      onChange={() => {}}
      options={OPTIONS}
      {...over}
    />,
  )

describe('EditableCombobox 官方 Input + Menu 装配面', () => {
  it('闭态 = 单一输入面（官方 Input 壳 + value/placeholder；无浮层清单）', () => {
    const markup = render({ placeholder: 'feat/my-branch' })
    expect(markup).toContain('value="wt-a"')
    expect(markup).toContain('placeholder="feat/my-branch"')
    expect(markup).toContain('role="combobox"')
    expect(markup).not.toContain('role="menuitem"')
  })
  it('data 锚透传（消费方走查锚落输入面）', () => {
    expect(render({ inputData: { 'data-dswt-branch-input': '' } })).toContain('data-dswt-branch-input')
  })
  it('disabled 透传官方 Input', () => {
    expect(render({ disabled: true })).toContain('disabled')
  })
  it('inputStyle 落输入面（等宽基准归消费方）', () => {
    expect(render({ inputStyle: { height: 34 } })).toContain('height:34px')
  })
})
