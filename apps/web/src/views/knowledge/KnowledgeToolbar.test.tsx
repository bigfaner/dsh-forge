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

import { statusFilterChips, statusChipIsActive, selectCountLabel } from './KnowledgeToolbar.js'

describe('SC-E 状态 chips（官方 Pill——服务端 statusFilter）', () => {
  it('chip 行集：全部/待审核/已确认（EntryStatusFilter 封闭值域）', () => {
    expect(statusFilterChips().map((chip) => chip.value)).toEqual(['all', 'unconfirmed', 'confirmed'])
    expect(statusFilterChips().map((chip) => chip.label)).toEqual(['全部', '待审核', '已确认'])
  })

  it('激活判据：当前片激活（Pill active）；all 零态 = 「全部」激活', () => {
    expect(statusChipIsActive('all', 'all')).toBe(true)
    expect(statusChipIsActive('unconfirmed', 'unconfirmed')).toBe(true)
    expect(statusChipIsActive('all', 'unconfirmed')).toBe(false)
    expect(statusChipIsActive('unconfirmed', undefined)).toBe(false)
  })

  it('状态 chips 在场：三枚 chip 锚（data-dswf-kn-statuschip）+ 当前片激活态', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeToolbar keyword="" onKeywordChange={() => {}} statusFilter="unconfirmed" onStatusFilterChange={() => {}} />,
    )
    expect(markup.match(/data-dswf-kn-statuschip/g)?.length).toBe(3)
    expect(markup).toContain('data-dswf-kn-statuschip="unconfirmed"')
    expect(markup).toContain('aria-pressed="true"')
  })

  it('回调缺席 = 状态 chips 不在场（装配缝合前的纯读形态）', () => {
    const markup = renderToStaticMarkup(<KnowledgeToolbar keyword="" onKeywordChange={() => {}} />)
    expect(markup).not.toContain('data-dswf-kn-statuschip')
  })
})

describe('SC-F 多选功能组（工具栏右端五钮）', () => {
  it('F1 非多选模式：仅「多选」切换钮在场（data-dswf-kn-multiselect），功能组不在场', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeToolbar
        keyword=""
        onKeywordChange={() => {}}
        multiSelectActive={false}
        selectedCount={0}
        totalCount={4}
        onToggleMultiSelect={() => {}}
      />,
    )
    expect(markup).toContain('data-dswf-kn-multiselect')
    expect(markup).toContain('aria-pressed="false"')
    expect(markup).not.toContain('data-dswf-kn-selcount')
    expect(markup).not.toContain('data-dswf-kn-act-confirm')
    expect(markup).not.toContain('data-dswf-kn-act-reject')
    expect(markup).not.toContain('data-dswf-kn-act-selectall')
  })

  it('F1 多选模式：钮变「取消」（aria-pressed=true）+ 功能组三钮与计数在场（语义色 class）', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeToolbar
        keyword=""
        onKeywordChange={() => {}}
        multiSelectActive={true}
        selectedCount={2}
        totalCount={5}
        onToggleMultiSelect={() => {}}
        onSelectAll={() => {}}
        onConfirmSelected={() => {}}
        onRejectSelected={() => {}}
      />,
    )
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('data-dswf-kn-selcount')
    expect(markup).toContain('已选 2 / 共 5')
    expect(markup).toContain('data-dswf-kn-act-confirm')
    expect(markup).toContain('data-dswf-kn-act-reject')
    expect(markup).toContain('data-dswf-kn-act-selectall')
    // 语义色：通过 accent / 驳回 error / 全选中性
    expect(markup).toMatch(/dswf-kn-act[^"]*is-accent/)
    expect(markup).toMatch(/dswf-kn-act[^"]*is-error/)
    expect(markup).toMatch(/dswf-kn-act-selectall[^"]*"/)
  })

  it('F5 零勾选：通过/驳回禁用（disabled）；驳回确认框闭态不在静态标记', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeToolbar
        keyword=""
        onKeywordChange={() => {}}
        multiSelectActive={true}
        selectedCount={0}
        totalCount={3}
        onToggleMultiSelect={() => {}}
        onSelectAll={() => {}}
        onConfirmSelected={() => {}}
        onRejectSelected={() => {}}
      />,
    )
    expect(markup).toMatch(/data-dswf-kn-act-confirm[^>]*disabled/)
    expect(markup).toMatch(/data-dswf-kn-act-reject[^>]*disabled/)
    expect(markup).not.toContain('role="dialog"')
  })

  it('selectCountLabel：计数文案 = 已选 N / 共 M（M = 过滤结果集计数）', () => {
    expect(selectCountLabel(0, 4)).toBe('已选 0 / 共 4')
    expect(selectCountLabel(3, 7)).toBe('已选 3 / 共 7')
  })
})
