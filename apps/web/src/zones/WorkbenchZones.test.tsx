// zones/WorkbenchZones 组件单测 —— 三区骨架机制 pin（UF-5 视图互换 / UF-7 dock 官方基座装载）。
// fix-10：右栏内部 = 官方 ui-dockkit 面（DockController 状态机 + DockLayout 渲染）——断言锚 =
// 官方 DOM 契约（data-dockkit-* 稳定锚 + role=tab/tablist）；UF-7 Validation 三条保持：
// 知识模式右栏不可见（已展开也隐藏）/ 状态保留（官方 keepMounted 常挂载——hidden 切显隐不
// 卸载）/ 可见集口径。页签跟随映射与焦点恢复语义 = dock-kit.test.ts 真件直测；登记表口径
// 语义锚 = dock.test.ts。渲染面用 react-dom/server（SSR 直渲）；点击交互与计算样式面归 e2e。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  createShellViewState,
  dispatchShellView,
  type ShellViewState,
} from '../shell/view-state.js'
import { dockTrackMode, WorkbenchZones, type WorkbenchZonesProps } from './WorkbenchZones.js'
import { globalDockTab, projectDockTab, type DockTabSet } from './dock.js'

const tabs: DockTabSet = [
  globalDockTab('start', '开始'),
  projectDockTab('p1', 'doc-p1', 'P1 文档'),
  projectDockTab('p2', 'doc-p2', 'P2 文档'),
]

const view = (over: Partial<ShellViewState> = {}): ShellViewState => ({
  ...createShellViewState(),
  ...over,
})

const render = (over: Partial<WorkbenchZonesProps> = {}): string =>
  renderToStaticMarkup(
    <WorkbenchZones
      view={view({ rightDock: true, focus: { projectId: 'p1', sessionId: null } })}
      dockTabs={tabs}
      {...over}
    />,
  )

/** 取指定中区面板的起始标签（含属性，供 hidden 断言） */
const sectionTag = (markup: string, zone: 'session' | 'knowledge'): string => {
  const matched = markup.match(new RegExp(`<section[^>]*data-dswf-zone="${zone}"[^>]*>`))
  expect(matched, `中区 ${zone} 面板缺席`).not.toBeNull()
  return matched?.[0] ?? ''
}

/** 取 dock 轨道 aside 起始标签（供相位断言） */
const dockTag = (markup: string): string => {
  const matched = markup.match(/<aside[^>]*class="dswf-zones-dock"[^>]*>/)
  expect(matched, 'dock 轨道缺席').not.toBeNull()
  return matched?.[0] ?? ''
}

describe('dockTrackMode 推导（UF-5/UF-7 联动）', () => {
  it('知识视图强制 hidden（已展开也隐藏）；会话视图随 rightDock 展开/收起', () => {
    expect(dockTrackMode(view({ center: 'knowledge', rightDock: true }))).toBe('hidden')
    expect(dockTrackMode(view({ center: 'knowledge', rightDock: false }))).toBe('hidden')
    expect(dockTrackMode(view({ center: 'session', rightDock: true }))).toBe('expanded')
    expect(dockTrackMode(view({ center: 'session', rightDock: false }))).toBe('collapsed')
  })
})

describe('三区结构与槽位注入（zones 无域内容——视图内容经槽位注入）', () => {
  it('rail / 中区会话 / 中区知识 三槽位内容渲染进对应区（槽位契约自证）', () => {
    const markup = renderToStaticMarkup(
      <WorkbenchZones
        view={view()}
        dockTabs={tabs}
        slots={{
          rail: <b data-t="rail" />,
          session: <b data-t="session" />,
          knowledge: <b data-t="knowledge" />,
        }}
      />,
    )
    expect(markup).toContain('class="dswf-zones-rail"')
    expect(markup).toContain('data-t="rail"')
    expect(markup).toContain('data-t="session"')
    expect(markup).toContain('data-t="knowledge"')
  })
  it('槽位缺省 = 机制占位（M0 知识面板空态占位入槽；会话/dock 同律）', () => {
    const markup = render()
    expect(markup).toContain('data-dswf-placeholder="session"')
    expect(markup).toContain('data-dswf-placeholder="knowledge"')
    expect(markup).toContain('data-dswf-placeholder="dock-tab"')
  })
  it('renderDockTab 槽位渲染域内容进官方页签体；缺席 = 内容占位', () => {
    expect(render({ slots: { renderDockTab: (tab) => <b data-t={tab.id} /> } })).toContain('data-t="start"')
    expect(render()).toContain('内容占位')
  })
  it('rail 槽缺省渲染空轨；空登记表 = 官方空窗格面（emptyPane 中文化）', () => {
    const markup = renderToStaticMarkup(<WorkbenchZones view={view()} dockTabs={[]} />)
    expect(markup).toContain('class="dswf-zones-rail"')
    expect(markup).toContain('data-dockkit-empty')
    expect(markup).toContain('无打开的页签')
  })
})

describe('官方 dockkit 基座装载（fix-10 官方面 pin——零自绘 strip/手柄退役）', () => {
  it('官方面在场：surface（横条形 dropZones）+ chips 页签条（role=tablist/tab）+ 页签体 + 初始「开始」页签', () => {
    const markup = render()
    expect(markup).toContain('data-dockkit-surface')
    expect(markup).toContain('data-dockkit-drop-zones="horizontal"')
    expect(markup).toContain('role="tablist"')
    expect(markup).toMatch(/role="tab"[^>]*data-dockkit-tab=/)
    expect(markup).toContain('data-dockkit-content')
    expect(markup).toContain('开始')
  })
  it('自研轨道退役：无自绘 strip/手柄/页签条痕迹（fix-4 路线退役面）', () => {
    const markup = render({ onToggleDock: () => {} })
    expect(markup).not.toContain('dswf-zones-dock-strip')
    expect(markup).not.toContain('dswf-zones-dock-resize')
    expect(markup).not.toContain('SegmentedTabs')
  })
  it('官方控件在场：分栏钮（窄轨由官方 room 规则裁决禁用态）', () => {
    const markup = render()
    expect(markup).toContain('data-dockkit-split-button')
    expect(markup).toContain('aria-label="分栏"')
  })
  it('添加钮 = 产品口径缺席（canAddTab 政策面——P1 无可添内容）', () => {
    expect(render()).not.toContain('data-dockkit-add-tab')
  })
  it('全局页签不可关闭（canCloseTab 口径）：关闭控件缺席 + 单页签静默 chips（官方 quiet 形态）', () => {
    const markup = render()
    expect(markup).not.toContain('data-dockkit-tab-close')
    expect(markup).toContain('data-dockkit-tab-quiet')
  })
  it('chrome 角位 = 右栏收展钮（官方置位于右上窗格条尾；语义与现有 toggle 同径）', () => {
    const withToggle = render({ onToggleDock: () => {} })
    expect(withToggle).toContain('data-dockkit-strip-chrome')
    expect(withToggle).toContain('aria-label="收起 dock"')
    expect(render()).not.toContain('data-dockkit-strip-chrome')
  })
  it('文案全中文化（官方 DockLabels 契约由产品供文案，含可访问名）', () => {
    const markup = render()
    expect(markup).toContain('aria-label="分栏"') // 可访问名随 labels 面（splitPane；关闭/浮动同源 labels）
    expect(renderToStaticMarkup(<WorkbenchZones view={view()} dockTabs={[]} />)).toContain('无打开的页签')
  })
})

describe('UF-5 视图互换（整体切换 + 零状态丢失）', () => {
  it('默认会话态：session 面板可见、knowledge 面板 hidden', () => {
    const markup = render({ view: view() })
    expect(sectionTag(markup, 'session')).not.toContain('hidden')
    expect(sectionTag(markup, 'knowledge')).toContain('hidden')
  })
  it('知识视图整体切换：knowledge 可见、session hidden 但仍挂载（keep-alive——槽位内容不卸载，状态保留）', () => {
    const markup = render({
      view: view({ center: 'knowledge' }),
      slots: { session: <b data-t="session-draft" /> },
    })
    expect(markup).toContain('data-dswf-view="knowledge"')
    expect(sectionTag(markup, 'knowledge')).not.toContain('hidden')
    const sessionTag = sectionTag(markup, 'session')
    expect(sessionTag).toContain('hidden')
    expect(markup).toContain('data-t="session-draft"')
  })
  it('知识模式右栏不可见（已展开也隐藏）：dock 轨道 data-dswf-dock=hidden', () => {
    const markup = render({ view: view({ center: 'knowledge', rightDock: true }) })
    expect(dockTag(markup)).toContain('data-dswf-dock="hidden"')
  })
  it('dock 官方面在强制隐藏期仍挂载（chips 条与页签体不卸载——官方 keepMounted 保留，右栏展开态/内容保留）', () => {
    const markup = render({ view: view({ center: 'knowledge', rightDock: true }) })
    expect(markup).toContain('data-dockkit-strip')
    expect(markup).toContain('data-dockkit-content')
    expect(markup).toContain('开始')
  })
  it('切回按记忆恢复原展开态（视图态机链：展开 → 知识 → 回会话 = expanded）', () => {
    let s = dispatchShellView(createShellViewState(), { type: 'toggle-right-dock' })
    s = dispatchShellView(s, { type: 'show-knowledge' })
    s = dispatchShellView(s, { type: 'show-session' })
    const markup = render({ view: s, slots: undefined })
    expect(dockTag(markup)).toContain('data-dswf-dock="expanded"')
  })
  it('无显式偏好往返：恢复默认收起（UF-7 默认）', () => {
    let s = dispatchShellView(createShellViewState(), { type: 'show-knowledge' })
    s = dispatchShellView(s, { type: 'show-session' })
    expect(dockTag(render({ view: s }))).toContain('data-dswf-dock="collapsed"')
  })
})

describe('UF-7 dock 轨道（默认收起归零 ↔ 官方页签条 + 内容区）', () => {
  it('默认态 = 收起（data-dswf-dock=collapsed；轨道归零样式由 zones.css/结构 pin 另证）', () => {
    expect(dockTag(render({ view: view() }))).toContain('data-dswf-dock="collapsed"')
  })
  it('展开 = 官方 chips 页签条 + 页签体（rightDock↔官方 expanded 映射——首渲染即一致）', () => {
    const markup = render()
    expect(dockTag(markup)).toContain('data-dswf-dock="expanded"')
    expect(markup).toContain('data-dockkit-strip')
    expect(markup).toContain('data-dockkit-content')
  })
})

describe('UF-7 页签跟随（不打断中区；可见集口径锚归 dock-kit/dock 单测）', () => {
  it('项目切换不打断中区面板：会话视图在项目切换渲染间保持可见（选择 ≠ 导航）', () => {
    const atP1 = render({ view: view({ focus: { projectId: 'p1', sessionId: null } }) })
    const atP2 = render({ view: view({ focus: { projectId: 'p2', sessionId: null } }) })
    for (const markup of [atP1, atP2]) {
      expect(markup).toContain('data-dswf-view="session"')
      expect(sectionTag(markup, 'session')).not.toContain('hidden')
    }
  })
})

describe('占位内容域（ReactNode 槽位注入不局限于文本）', () => {
  it('renderDockTab 收到激活页签记录（域渲染面契约——初始「开始」页签）', () => {
    const seen: string[] = []
    render({ slots: { renderDockTab: (tab) => { seen.push(tab.id); return <b>{tab.label}</b> } } })
    expect(seen).toEqual(['start'])
  })
})
