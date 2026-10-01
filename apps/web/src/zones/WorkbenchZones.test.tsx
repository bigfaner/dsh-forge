// zones/WorkbenchZones 组件单测 —— 三区骨架机制 pin（UF-5 视图互换 / UF-7 dock 轨道与页签跟随）。
// 断言锚点 = UF-5/UF-7 Validation Rules 全部三条：知识模式右栏不可见（已展开也隐藏）/ 状态保留
// （keep-alive：双面板与 dock 内容常挂载，hidden/宽度切显隐不卸载）/ 可见集口径。
// 渲染面用 react-dom/server（SSR 直渲）；点击交互与计算样式面归 e2e（2.12/2.14）。
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
  it('rail / 中区会话 / 中区知识 / dock 四槽位内容渲染进对应区（槽位契约自证）', () => {
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
  it('renderDockTab 槽位渲染域内容进 tabpanel；缺席 = 内容占位', () => {
    expect(render({ slots: { renderDockTab: (tab) => <b data-t={tab.id} /> } })).toContain('data-t="start"')
    expect(render()).toContain('内容占位')
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
  it('dock 内容在强制隐藏期仍挂载（页签条与内容不卸载——右栏展开态/内容保留）', () => {
    const markup = render({ view: view({ center: 'knowledge', rightDock: true }) })
    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('role="tabpanel"')
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

describe('UF-7 dock 轨道（默认收起归零 ↔ 页签条 + 内容区）', () => {
  it('默认态 = 收起（data-dswf-dock=collapsed；轨道归零样式由 zones.css/结构 pin 另证）', () => {
    expect(dockTag(render({ view: view() }))).toContain('data-dswf-dock="collapsed"')
  })
  it('展开 = 页签条（官方 SegmentedTabs → role=tablist）+ 内容区（role=tabpanel）+ 默认激活首个可见页签', () => {
    const markup = render()
    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('aria-label="dock 页签"')
    expect(markup).toContain('role="tabpanel"')
    expect(markup).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>开始<\/button>/)
  })
  it('onToggleDock 在场 → 收展控制钮（官方 Button）；缺席 → 无控制面', () => {
    expect(render({ onToggleDock: () => {} })).toContain('aria-label="收起 dock"')
    expect(render()).not.toContain('aria-label="收起 dock"')
  })
})

describe('UF-7 页签跟随（可见集口径 + 不打断中区）', () => {
  it('可见集 = 当前项目页签 + 全局页签（p1 不见 p2 页签；p2 不见 p1；无锚仅全局）', () => {
    const atP1 = render({ view: view({ rightDock: true, focus: { projectId: 'p1', sessionId: null } }) })
    expect(atP1).toContain('P1 文档')
    expect(atP1).not.toContain('P2 文档')
    const atP2 = render({ view: view({ rightDock: true, focus: { projectId: 'p2', sessionId: null } }) })
    expect(atP2).toContain('P2 文档')
    expect(atP2).not.toContain('P1 文档')
    const atNone = render({ view: view({ rightDock: true, focus: { projectId: null, sessionId: null } }) })
    expect(atNone).toContain('开始')
    expect(atNone).not.toContain('P1 文档')
    expect(atNone).not.toContain('P2 文档')
  })
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
  it('renderDockTab 收到激活页签记录（域渲染面契约）', () => {
    const seen: string[] = []
    render({ slots: { renderDockTab: (tab) => { seen.push(tab.id); return <b>{tab.label}</b> } } })
    expect(seen).toEqual(['start'])
  })
  it('rail 槽缺省渲染空轨（rail 常驻归 rail 内容自管理）', () => {
    const markup = renderToStaticMarkup(<WorkbenchZones view={view()} dockTabs={[]} />)
    expect(markup).toContain('class="dswf-zones-rail"')
    expect(markup).toContain('data-dswf-placeholder="dock-empty"')
  })
})
