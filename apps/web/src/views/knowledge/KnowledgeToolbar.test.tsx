// KnowledgeToolbar 单测 —— UF-6 工具栏（AC2 关键词搜索 + 范围显示 P1 项目级）。
// Hard Rule 官方件复用断言面：输入 = 官方 Input（受控件——value 原样承载）。
// 事件胶水（onChange/onKeyDown/onClick 转发闭包）不在静态渲染测面——语义纯函数
// （scopeLabel / isEscapeKey）直测 + 转发事件形状经 browseActions 单测（use-knowledge-browse）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  KnowledgeToolbar,
  isEscapeKey,
  isScopeSwitchable,
  scopeLabel,
  scopeMenuEntries,
} from './KnowledgeToolbar.js'

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

  it('bug: 范围 Pill 在项目集 + 拾取回调在场 = 项目切换控件（对话面板 composer 同款）：button 化 + aria-haspopup/menu + 展开态 + 下拉指示', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeToolbar
        keyword=""
        onKeywordChange={() => {}}
        projectName="alpha"
        currentProjectId="p-1"
        scopeProjects={[
          { id: 'p-1', name: 'alpha' },
          { id: 'p-2', name: 'beta' },
        ]}
        onScopePick={() => {}}
      />,
    )
    // 触发器锚（e2e）+ 菜单语义（Pill onClick 形态 = 官方 button 渲染）
    expect(markup).toContain('data-dswf-kn-scope-trigger')
    expect(markup).toContain('aria-haspopup="menu"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toMatch(/<button[^>]*dswf-kn-scope/)
    // 下拉指示图标（chevron svg 在场）
    expect(markup).toContain('svg')
    // 范围文案保持（升格不改标签语言）
    expect(markup).toContain('项目 · alpha')
  })

  it('bug 回归：无拾取回调/无项目集 = 纯文本 Pill（非切换面不升格——span 形态保持）', () => {
    const noCb = renderToStaticMarkup(
      <KnowledgeToolbar
        keyword=""
        onKeywordChange={() => {}}
        projectName="alpha"
        scopeProjects={[{ id: 'p-1', name: 'alpha' }]}
      />,
    )
    expect(noCb).not.toContain('data-dswf-kn-scope-trigger')
    expect(noCb).not.toContain('aria-haspopup')
    const noRows = renderToStaticMarkup(
      <KnowledgeToolbar keyword="" onKeywordChange={() => {}} onScopePick={() => {}} />,
    )
    expect(noRows).not.toContain('data-dswf-kn-scope-trigger')
  })

  it('isScopeSwitchable：行集非空 + 回调在场 = true（单项目亦可开菜单——切换一致性）；任一缺席 = false', () => {
    expect(isScopeSwitchable([{ id: 'p-1', name: 'a' }], () => {})).toBe(true)
    expect(isScopeSwitchable(undefined, () => {})).toBe(false)
    expect(isScopeSwitchable([], () => {})).toBe(false)
    expect(isScopeSwitchable([{ id: 'p-1', name: 'a' }], undefined)).toBe(false)
  })

  it('bug: 切换菜单行集 = 项目行且仅项目行（无「添加项目…」入口——添加径归 hero 弹层/左栏「＋」既有入口）', () => {
    const rows = [
      { id: 'p-1', name: 'alpha' },
      { id: 'p-2', name: 'beta' },
    ]
    const entries = scopeMenuEntries(rows)
    expect(entries.map((entry) => entry.id)).toEqual(['p-1', 'p-2'])
    expect(entries.map((entry) => entry.label)).toEqual(['alpha', 'beta'])
    // 无添加行/保留字行——纯项目行集
    expect(entries.some((entry) => String(entry.label).includes('添加项目'))).toBe(false)
    expect(entries.some((entry) => entry.id.includes('dswf-'))).toBe(false)
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
