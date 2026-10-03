// zones/dock-kit 单测 —— 官方 dockkit 基座映射层 pin（fix-10）。真件 DockController 直测
// （官方引擎纯逻辑无 DOM）：collapsed+「开始」初始态 / rightDock↔expanded 映射 / 页签跟随
// 项目（换集关闭-缺失补开-焦点回落与恢复 = resolveActiveDockTab 语义锚）/ 全局页签不可
// 关闭 / 两横栏分栏预算（DockLayout 形态约束）/ kind 与登记记录映射。渲染装载面归
// WorkbenchZones.test.tsx（SSR），交互与计算样式面归 e2e（fix-10 官方基座回归组）。
import { describe, expect, it } from 'vitest'
import { dockPaneCount, type DockController, type TabRecord } from '@deepseek-ai/dsh-client-ui-dockkit'
import {
  activeDockContent,
  createWorkbenchDock,
  dockCanSplit,
  dockRenderRecord,
  dockTabClosable,
  dockTabKind,
  syncDockTabs,
} from './dock-kit.js'
import { globalDockTab, projectDockTab, visibleDockTabs, type DockTabSet } from './dock.js'

const set: DockTabSet = [
  globalDockTab('start', '开始'),
  projectDockTab('p1', 'doc-p1', 'P1 文档'),
  projectDockTab('p2', 'doc-p2', 'P2 文档'),
]

/** 官方 TabRecord 测试构造（id 为 branded 串——测试面只需 contentId/kind/title） */
const kitTab = (over: Partial<TabRecord> & { readonly contentId: string }): TabRecord =>
  ({ id: 'tab-x', kind: 'start', title: 't', ...over }) as TabRecord

/** 快照页签集（登记 id 排序——官方 TabId 生成序无关的稳定口径） */
const contentIds = (controller: DockController): string[] =>
  Object.values(controller.getSnapshot().state.tabs)
    .map((tab) => tab.contentId)
    .sort()

describe('createWorkbenchDock（官方初始态 + rightDock 映射）', () => {
  it('collapsed 初始态 + 单 docked pane + 「开始」全局页签（kind=start；官方「展开/收起不累积副本」初始 tab 语义）', () => {
    const controller = createWorkbenchDock(set[0], false)
    const state = controller.getSnapshot().state
    expect(state.expanded).toBe(false)
    expect(dockPaneCount(state)).toBe(1)
    expect(contentIds(controller)).toEqual(['start'])
    const tab = Object.values(state.tabs)[0]!
    expect(tab.kind).toBe('start')
    expect(tab.title).toBe('开始')
  })
  it('initiallyExpanded=true → 官方 expanded 同步（首渲染即与视图态一致）', () => {
    expect(createWorkbenchDock(set[0], true).getSnapshot().state.expanded).toBe(true)
  })
  it('initialTab 缺席 = 空窗格起步（页签集随后经 syncDockTabs 对齐登记表）', () => {
    const controller = createWorkbenchDock(undefined, false)
    expect(contentIds(controller)).toEqual([])
    syncDockTabs(controller, visibleDockTabs(set, 'p1'), { selectedId: null })
    expect(contentIds(controller)).toEqual(['doc-p1', 'start'])
  })
})

describe('syncDockTabs（页签跟随项目——官方 intents 驱动）', () => {
  it('换集：切项目关闭旧项目页签、补开新项目页签（可见集 = 当前项目 + 全局，注册序）', () => {
    const controller = createWorkbenchDock(set[0], false)
    syncDockTabs(controller, visibleDockTabs(set, 'p1'), { selectedId: null })
    expect(contentIds(controller)).toEqual(['doc-p1', 'start'])
    syncDockTabs(controller, visibleDockTabs(set, 'p2'), { selectedId: null })
    expect(contentIds(controller)).toEqual(['doc-p2', 'start'])
    expect(contentIds(controller)).not.toContain('doc-p1')
    // 切回恢复（页签集层面）：p1 页签重开
    syncDockTabs(controller, visibleDockTabs(set, 'p1'), { selectedId: null })
    expect(contentIds(controller)).toEqual(['doc-p1', 'start'])
  })
  it('幂等：同集重同步零变更（openContent 恒等去重，不产副本）', () => {
    const controller = createWorkbenchDock(set[0], false)
    syncDockTabs(controller, visibleDockTabs(set, 'p1'), { selectedId: null })
    const before = controller.getSnapshot()
    syncDockTabs(controller, visibleDockTabs(set, 'p1'), { selectedId: null })
    expect(controller.getSnapshot()).toBe(before) // 快照引用不变 = 官方零记录零通知
  })
  it('焦点回落：无显式选择 → 切项目落到新集首个可见页签（start）', () => {
    const controller = createWorkbenchDock(set[0], false)
    syncDockTabs(controller, visibleDockTabs(set, 'p1'), { selectedId: null })
    expect(activeDockContent(controller.getSnapshot().state)).toBe('start')
    syncDockTabs(controller, visibleDockTabs(set, 'p2'), { selectedId: null })
    expect(activeDockContent(controller.getSnapshot().state)).toBe('start')
  })
  it('焦点恢复（resolveActiveDockTab 语义锚）：显式选择切出后回落不覆写锚、切回恢复原选择', () => {
    const controller = createWorkbenchDock(set[0], false)
    const selection = { selectedId: 'doc-p1' }
    // p1：显式选择在集内 → 恢复 doc-p1（返回落定值供装配区分用户选择）
    expect(syncDockTabs(controller, visibleDockTabs(set, 'p1'), selection)).toBe('doc-p1')
    expect(activeDockContent(controller.getSnapshot().state)).toBe('doc-p1')
    // p2：doc-p1 不在新集 → 自动回落 start，锚不被覆写
    expect(syncDockTabs(controller, visibleDockTabs(set, 'p2'), selection)).toBe('start')
    expect(selection.selectedId).toBe('doc-p1')
    // 切回 p1：doc-p1 重开并恢复为激活页签
    expect(syncDockTabs(controller, visibleDockTabs(set, 'p1'), selection)).toBe('doc-p1')
    expect(activeDockContent(controller.getSnapshot().state)).toBe('doc-p1')
  })
  it('空可见集：全部关闭（空窗格归官方 emptyPane 面）', () => {
    const controller = createWorkbenchDock(set[0], false)
    expect(syncDockTabs(controller, [], { selectedId: null })).toBeNull()
    expect(contentIds(controller)).toEqual([])
  })
})

describe('产品口径政策面（官方 policy props 供源）', () => {
  it('全局页签不可关闭 / 项目页签可关 / 登记外兜底可关', () => {
    expect(dockTabClosable(set, 'start')).toBe(false)
    expect(dockTabClosable(set, 'doc-p1')).toBe(true)
    expect(dockTabClosable(set, 'unknown')).toBe(true)
  })
  it('分栏预算：官方预算 ∧ 两横栏上限（DockLayout 形态约束，Sidebar 同口径）', () => {
    const controller = createWorkbenchDock(set[0], false)
    expect(dockCanSplit(controller.getSnapshot())).toBe(true)
    controller.splitPane()
    expect(dockPaneCount(controller.getSnapshot().state)).toBe(2)
    expect(dockCanSplit(controller.getSnapshot())).toBe(false) // 官方面最多两横栏
  })
  it('kind 映射与登记记录往返（官方 TabRecord ↔ 登记表记录）', () => {
    expect(dockTabKind(set[0]!)).toBe('start')
    expect(dockTabKind(set[1]!)).toBe('content')
    expect(dockRenderRecord(set, kitTab({ contentId: 'doc-p1', title: 'x' }))).toBe(set[1])
    const fallback = dockRenderRecord(set, kitTab({ contentId: 'zzz', title: '兜底' }))
    expect(fallback.id).toBe('zzz')
    expect(fallback.label).toBe('兜底')
    expect(fallback.scope.type).toBe('global')
  })
})
