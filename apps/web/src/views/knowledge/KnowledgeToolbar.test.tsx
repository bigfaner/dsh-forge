// KnowledgeToolbar 单测 —— UF-6 工具栏（AC2 关键词搜索 + 范围显示 P1 项目级）。
// Hard Rule 官方件复用断言面：输入 = 官方 Input（受控件——value 原样承载）。
// 事件胶水（onChange/onKeyDown/onClick 转发闭包）不在静态渲染测面——语义纯函数
// （scopeLabel / isEscapeKey）直测 + 转发事件形状经 browseActions 单测（use-knowledge-browse）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KnowledgeToolbar, isEscapeKey, scopeLabel } from './KnowledgeToolbar.js'

describe('KnowledgeToolbar 工具栏', () => {
  it('检索输入在场：官方 Input 受控件（value 原样）+ 检索语义 aria-label + 占位文案', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeToolbar keyword="安全" onKeywordChange={() => {}} projectName="demo" />,
    )
    expect(markup).toContain('data-dswf-kn-toolbar')
    expect(markup).toContain('value="安全"')
    expect(markup).toContain('aria-label="知识关键词搜索"')
    expect(markup).toContain('placeholder="搜索关键词…"')
  })

  it('范围显示 P1 项目级：Pill 呈现项目名；空名回退「当前项目」', () => {
    expect(renderToStaticMarkup(<KnowledgeToolbar keyword="" onKeywordChange={() => {}} projectName="网关" />)).toContain(
      '项目 · 网关',
    )
    expect(renderToStaticMarkup(<KnowledgeToolbar keyword="" onKeywordChange={() => {}} projectName="" />)).toContain(
      '项目 · 当前项目',
    )
  })

  it('清除钮条件呈现：空关键词缺席；非空在场（aria-label 清除搜索）', () => {
    const empty = renderToStaticMarkup(<KnowledgeToolbar keyword="" onKeywordChange={() => {}} />)
    expect(empty).not.toContain('aria-label="清除搜索"')
    const filled = renderToStaticMarkup(<KnowledgeToolbar keyword="css" onKeywordChange={() => {}} />)
    expect(filled).toContain('aria-label="清除搜索"')
  })

  it('scopeLabel：项目名呈现；undefined/空串回退「当前项目」', () => {
    expect(scopeLabel('网关')).toBe('项目 · 网关')
    expect(scopeLabel('')).toBe('项目 · 当前项目')
    expect(scopeLabel(undefined)).toBe('项目 · 当前项目')
  })

  it('isEscapeKey：Esc 判据（原型 kb-clear 交互语义）', () => {
    expect(isEscapeKey('Escape')).toBe(true)
    expect(isEscapeKey('Enter')).toBe(false)
  })
})
