// SessionTaskPills 单测（3.10）——UF-3 会话头部挂接任务展示（SC6③ 挂接部分）。
// 断言面 = 任务 AC：AC-1（双源分型渲染——SessionTaskLinkCard 字段驱动）/ AC-2（≤2 并排 +
// >2 → +N 溢出菜单[完整列表 + 分型标注]）/ AC-3（点击导航载荷 taskId + featureSlug）/
// AC-4（sessionId 变化即时反映 + 零挂接空态不渲染）。
// 渲染面用 react-dom/server（沿 RecallTab.test 模式）；官方 Menu 门户面（open 弹层经
// createPortal(document.body)）静态渲染不可达（HeroWorkspacePicker.test 头注口径）——
// 菜单行集/选中映射经纯函数直测，开面交互归 4.2 e2e。
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  SessionTaskPills,
  SessionTaskPillsBody,
  initialSessionPillMenuState,
  sessionPillKeyLabel,
  sessionPillMenuActivated,
  sessionPillMenuItems,
  sessionPillMenuOpen,
  sessionPillMenuSelect,
  sessionPillNav,
  sessionPillSourceLabel,
  splitSessionPills,
  type SessionTaskPillItem,
} from './SessionTaskPills.js'

/** 卡片工厂（SessionTaskLinkCard 全字段 + featureSlug 富化——4.2 装配侧单库 enrich 形） */
const pill = (over: Partial<SessionTaskPillItem> = {}): SessionTaskPillItem => ({
  taskId: 't-1',
  slug: '3.10',
  localId: '1',
  title: '会话头挂接 pill 组件',
  taskStatus: 'in_progress',
  sessionId: 'sess-1',
  source: 'link',
  featureSlug: 'dsh-forge-m2-pipeline',
  ...over,
})

const renderPills = (pills: readonly SessionTaskPillItem[], onOpenTask?: (nav: { taskId: string; featureSlug: string }) => void): string =>
  renderToStaticMarkup(<SessionTaskPillsBody pills={pills} menuOpen={false} onMenuOpenChange={() => {}} onOpenTask={onOpenTask} />)

describe('纯模型：分型标签与自然键', () => {
  it('AC-1 双源分型：link = 派发（挂接表）/ record = 执行（records.session_id）', () => {
    expect(sessionPillSourceLabel('link')).toBe('派发')
    expect(sessionPillSourceLabel('record')).toBe('执行')
  })
  it('自然键呈现 = slug/localId（身份双轨口径——界面展示恒自然键）', () => {
    expect(sessionPillKeyLabel(pill())).toBe('3.10/1')
    expect(sessionPillKeyLabel(pill({ slug: '2.4', localId: 'fix-2' }))).toBe('2.4/fix-2')
  })
})

describe('纯模型：splitSessionPills（≤2 并排 / >2 溢出）', () => {
  it('AC-2 空集 = 零并排零溢出（空态判定面）', () => {
    expect(splitSessionPills([])).toEqual({ visible: [], overflow: [] })
  })
  it('AC-2 ≤2 全并排（1 张与 2 张均零溢出）', () => {
    const one = [pill()]
    expect(splitSessionPills(one)).toEqual({ visible: one, overflow: [] })
    const two = [pill(), pill({ taskId: 't-2', source: 'record' })]
    expect(splitSessionPills(two)).toEqual({ visible: two, overflow: [] })
  })
  it('AC-2 >2 = 前 2 并排 + 余量溢出（3 → 2+1；5 → 2+3）', () => {
    const three = [pill(), pill({ taskId: 't-2' }), pill({ taskId: 't-3' })]
    const split3 = splitSessionPills(three)
    expect(split3.visible).toHaveLength(2)
    expect(split3.overflow).toHaveLength(1)
    const five = three.concat([pill({ taskId: 't-4' }), pill({ taskId: 't-5' })])
    const split5 = splitSessionPills(five)
    expect(split5.visible.map((p) => p.taskId)).toEqual(['t-1', 't-2'])
    expect(split5.overflow.map((p) => p.taskId)).toEqual(['t-3', 't-4', 't-5'])
  })
})

describe('纯模型：溢出菜单行集（完整列表 + 分型标注）', () => {
  it('AC-2 菜单 = 全量挂接（含并排两席——完整列表，非仅溢出余量）+ 每行分型标注 + 状态点', () => {
    const pills = [
      pill({ taskId: 't-1', source: 'link' }),
      pill({ taskId: 't-2', source: 'record' }),
      pill({ taskId: 't-3', source: 'link', localId: '2', slug: '3.11' }),
    ]
    const items = sessionPillMenuItems(pills)
    expect(items).toHaveLength(3)
    // 完整列表：并排两席（t-1/t-2）与溢出席（t-3）全部在场（MenuEntry 三变体恒含 id）
    expect(items.map((entry) => entry.id)).toEqual(['t-1:link', 't-2:record', 't-3:link'])
  })
  it('AC-2 同任务双源两卡并存 → 行 id 不碰撞（taskId+source 复合键）', () => {
    const both = [pill({ taskId: 't-1', source: 'link' }), pill({ taskId: 't-1', source: 'record' })]
    const items = sessionPillMenuItems(both)
    expect(items).toHaveLength(2)
    expect(new Set(items.map((entry) => entry.id)).size).toBe(2)
  })
})

describe('纯模型：导航载荷与菜单选中回映射', () => {
  it('AC-3 载荷 = taskId + featureSlug 双字段（开概览 + 任务子 tab + feature 选中 + 抽屉打开——4.2 接线）', () => {
    expect(sessionPillNav(pill())).toEqual({ taskId: 't-1', featureSlug: 'dsh-forge-m2-pipeline' })
    expect(sessionPillNav(pill({ taskId: 't-9', featureSlug: 'another-feature' }))).toEqual({ taskId: 't-9', featureSlug: 'another-feature' })
  })
  it('菜单行选中 → 载荷（id 回映射；未知 id = undefined 不派发）', () => {
    const pills = [pill(), pill({ taskId: 't-2', source: 'record', featureSlug: 'f2' })]
    expect(sessionPillMenuSelect(pills, 't-2:record')).toEqual({ taskId: 't-2', featureSlug: 'f2' })
    expect(sessionPillMenuSelect(pills, 'nope:link')).toBeUndefined()
  })
  it('菜单选中动作：闭菜单 + 载荷派发；未知 id 仅闭菜单；onOpenTask 缺席容忍', () => {
    const pills = [pill()]
    const close = vi.fn()
    const open1 = vi.fn()
    sessionPillMenuActivated({ pills, id: 't-1:link' }, open1, close)
    expect(close).toHaveBeenCalledWith(false)
    expect(open1).toHaveBeenCalledWith({ taskId: 't-1', featureSlug: 'dsh-forge-m2-pipeline' })
    const close2 = vi.fn()
    const open2 = vi.fn()
    sessionPillMenuActivated({ pills, id: 'nope:link' }, open2, close2)
    expect(close2).toHaveBeenCalledWith(false)
    expect(open2).not.toHaveBeenCalled()
    const close3 = vi.fn()
    expect(() => {
      sessionPillMenuActivated({ pills, id: 't-1:link' }, undefined, close3)
    }).not.toThrow()
    expect(close3).toHaveBeenCalledWith(false)
  })
})

describe('纯模型：菜单开合会话作用域派生（AC-4 无残留判据）', () => {
  it('初始态 = 闭（本会话）', () => {
    expect(initialSessionPillMenuState('sess-1')).toEqual({ session: 'sess-1', open: false })
    expect(sessionPillMenuOpen(initialSessionPillMenuState('sess-1'), 'sess-1')).toBe(false)
  })
  it('同会话开态 = true；跨会话开态派生即 false（菜单开合不跨会话残留）', () => {
    expect(sessionPillMenuOpen({ session: 'sess-1', open: true }, 'sess-1')).toBe(true)
    expect(sessionPillMenuOpen({ session: 'sess-1', open: true }, 'sess-2')).toBe(false)
  })
})

describe('SessionTaskPillsBody 纯渲染（renderToStaticMarkup）', () => {
  it('AC-4 零挂接 = 空态不渲染（输出空——槽零组件呈现）', () => {
    expect(renderPills([])).toBe('')
  })
  it('AC-1 单卡分型呈现：派发⟞ + 自然键 + 状态（SessionTaskLinkCard 字段驱动）', () => {
    const markup = renderPills([pill()])
    expect(markup).toContain('data-dswf-stp=""')
    expect(markup).toContain('派发⟞')
    expect(markup).toContain('3.10/1')
    expect(markup).toContain('进行中')
    expect(markup).toContain('data-dswf-stp-source="link"')
    // 悬停全文 = 分型 + 键 + 任务标题（标题不在 pill 本体占宽——title 承载）
    expect(markup).toContain('title="派发⟞ 3.10/1 · 会话头挂接 pill 组件"')
  })
  it('AC-1 双源相异呈现：同席 link=派发⟞ 与 record=执行⟞ 并存（SC6③ 双源相异断言面）', () => {
    const markup = renderPills([pill({ source: 'link' }), pill({ taskId: 't-2', source: 'record', slug: '3.11' })])
    expect(markup).toContain('派发⟞')
    expect(markup).toContain('执行⟞')
    expect(markup).toContain('data-dswf-stp-source="record"')
    expect(markup).toContain('3.11/1')
    expect(markup.match(/data-dswf-stp-pill=/g)).toHaveLength(2)
  })
  it('AC-3 回调在场 = 可点按钮载体（taskId 锚）；缺席 = 静态 span（非交互呈现）', () => {
    const interactive = renderPills([pill()], () => {})
    expect(interactive).toContain('data-dswf-stp-pill="t-1"')
    expect(interactive).toContain('dswf-stp-pill is-link')
    expect(interactive).toContain('title="查看任务：3.10/1 · 会话头挂接 pill 组件"')
    const statics = renderPills([pill()])
    expect(statics).toContain('data-dswf-stp-pill="t-1"')
    expect(statics).not.toContain('is-link')
    expect(statics).not.toContain('<button')
    expect(statics).toContain('title="派发⟞ 3.10/1 · 会话头挂接 pill 组件"')
  })
  it('AC-2 ≤2 并排：两卡零溢出（+N 触发器缺席）', () => {
    const markup = renderPills([pill(), pill({ taskId: 't-2' })])
    expect(markup.match(/data-dswf-stp-pill=/g)).toHaveLength(2)
    expect(markup).not.toContain('data-dswf-stp-more')
  })
  it('AC-2 >2 = 2 并排 + "+N" 溢出触发（N = 隐藏余量；闭态菜单不呈现）', () => {
    const markup = renderPills([pill(), pill({ taskId: 't-2' }), pill({ taskId: 't-3' }), pill({ taskId: 't-4' })])
    expect(markup.match(/data-dswf-stp-pill=/g)).toHaveLength(2)
    expect(markup).toContain('data-dswf-stp-more')
    expect(markup).toContain('+2')
    expect(markup).toContain('aria-haspopup="menu"')
    // 官方 Menu 门户面闭态：列表不在场（open 弹层 createPortal 静态不可达——对照锚）
    expect(markup).not.toContain('role="menu"')
  })
})

describe('SessionTaskPills 装载壳（props 契约）', () => {
  it('AC-4 sessionId 变化即时反映：props 驱动重渲染——新会话卡呈现、旧会话卡零残留', () => {
    const sessionA = [pill({ taskId: 't-a', slug: '3.10', featureSlug: 'feat-a' })]
    const sessionB = [pill({ taskId: 't-b', slug: '4.1', sessionId: 'sess-2', source: 'record' })]
    const markupA = renderToStaticMarkup(<SessionTaskPills sessionId="sess-1" pills={sessionA} />)
    expect(markupA).toContain('data-dswf-stp-pill="t-a"')
    expect(markupA).toContain('3.10/1')
    const markupB = renderToStaticMarkup(<SessionTaskPills sessionId="sess-2" pills={sessionB} />)
    expect(markupB).toContain('data-dswf-stp-pill="t-b"')
    expect(markupB).toContain('4.1/1')
    expect(markupB).toContain('执行⟞')
    // 无残留：会话 B 渲染面零会话 A 锚（props 单一来源——无本地 pills 副本）
    expect(markupB).not.toContain('t-a')
    expect(markupB).not.toContain('3.10/1')
  })
  it('AC-4 零挂接 = 装载壳同样空输出（含 sessionId 在场）', () => {
    expect(renderToStaticMarkup(<SessionTaskPills sessionId="sess-1" pills={[]} />)).toBe('')
  })
})
