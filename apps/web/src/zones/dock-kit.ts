// zones/dock-kit（定位：基础）——官方 ui-dockkit 基座映射层（fix-10：dock 全面对齐 dsh）。
// 官方件 = @deepseek-ai/dsh-client-ui-dockkit 0.2.0-rc.2（零 cordis 静态库，S2 §2.5 勘面）：
// 布局状态机（DockController + createInitialState）与渲染面（DockLayout——README 对横条形
// Sidebar 形态的推荐件）全部官方面，产品零平行实现（Hard Rule 官方基座唯一）。
// 本模块只承载容器级语义的映射（UF-7 机制语义零变化——view-state 不动）：
//   - 三态：rightDock ↔ 官方 expanded（setExpanded 记录语义；「展开/收起不累积副本」=
//     官方初始 tab 归初始态语义）；知识视图强制隐藏 = 容器外层归零，官方 surface 不感知；
//   - 页签跟随项目：visibleDockTabs 可见集（dock.ts 语义锚）→ 官方 openContent/closeTab
//     intents 同步页签集；焦点口径 = resolveActiveDockTab（回落/恢复，语义不丢）。
// 纯逻辑面（无 React 无 DOM）——官方 controller 真件直测（dock-kit.test.ts）。

import {
  DockController,
  dockPaneCount,
  findContentTab,
  type DockLabels,
  type DockSnapshot,
  type LayoutState,
  type TabRecord,
} from '@deepseek-ai/dsh-client-ui-dockkit'
import {
  globalDockTab,
  resolveActiveDockTab,
  type DockTabRecord,
  type DockTabSet,
} from './dock.js'

/** 「开始」全局页签的 kind（renderTab 按 kind 分发的内容族键；M2+ 域页签扩 kinds） */
export const DOCK_TAB_KIND_START = 'start'

/** 域页签兜底 kind（登记表非 start 页签——M2+ 域内容接入前的占位分发键） */
export const DOCK_TAB_KIND_CONTENT = 'content'

/** 登记表记录 → 官方 tab kind（kind = 官方 opaque 串，产品唯一解释方） */
export function dockTabKind(record: DockTabRecord): string {
  return record.id === 'start' ? DOCK_TAB_KIND_START : DOCK_TAB_KIND_CONTENT
}

/** 官方面文案（全中文化，含可访问名——DockLabels 契约：kit 不持文案，产品供全部） */
export const DOCK_LABELS_ZH: DockLabels = {
  emptyPane: '无打开的页签',
  splitPane: '分栏',
  splitPaneDisabled: '分栏（窗格数已达上限）',
  splitPaneNarrow: '分栏（宽度不足）',
  closeTab: '关闭页签',
  addTab: '添加页签',
  dockFloat: '收回浮动面板',
  closeFloat: '关闭浮动面板',
  dropZone: {
    center: '停靠至此',
    top: '上半区',
    right: '右半区',
    bottom: '下半区',
    left: '左半区',
  },
}

/**
 * 建官方 dock 基座（collapsed 初始态 + 「开始」全局页签——官方 createInitialState 语义：
 * 初始 tab 归初始态而非操作，「展开/收起不累积副本」）。initialTab 缺席 = 空窗格起步
 * （页签集随后经 syncDockTabs 对齐登记表）。initiallyExpanded = rightDock 初始态映射
 * （官方初始 expanded:false；首渲染/SSR 直出即与视图态一致，后续变更经映射 effect）。
 */
export function createWorkbenchDock(
  initialTab: DockTabRecord | undefined,
  initiallyExpanded: boolean,
): DockController {
  const controller = new DockController({
    mode: 'push',
    makeInitialTab:
      initialTab === undefined
        ? undefined
        : (id) => ({
            id,
            kind: dockTabKind(initialTab),
            contentId: initialTab.id,
            title: initialTab.label,
          }),
  })
  controller.setExpanded(initiallyExpanded)
  return controller
}

/** 显式选择锚（可变持有体——WorkbenchZones ref 传入；语义 = dock.ts resolveActiveDockTab 的 selectedId：自动回落不覆写，切回恢复） */
export interface DockTabSelection {
  selectedId: string | null
}

/** 当前激活页签的登记 id（contentId；无激活页签 = undefined） */
export function activeDockContent(state: LayoutState): string | undefined {
  const pane = state.nodes[state.activePaneId]
  if (pane?.kind !== 'pane') return undefined
  const tabId = pane.activeTabId
  return tabId === undefined ? undefined : state.tabs[tabId]?.contentId
}

/**
 * 页签集同步（页签跟随项目的官方驱动路径）：可见集（= 当前项目 + 全局，dock.ts 口径）
 * → 官方 intents——不再可见的页签 closeTab、缺失页签 openContent（恒等去重：已开即聚焦）；
 * 焦点口径 = resolveActiveDockTab（显式选择仍在可见集则恢复，否则回落首个可见）。
 * @returns 同步落定的激活登记 id（want 为空 = null；已落定不重聚焦）——供装配区分
 *   「同步焦点」与「用户显式选择」（快照激活 ≠ 该值 = 用户选择，记入 selection 锚）。
 */
export function syncDockTabs(
  controller: DockController,
  desired: readonly DockTabRecord[],
  selection: DockTabSelection,
): string | null {
  const before = controller.getSnapshot().state
  // 1) 换集关闭：切项目后旧项目页签退出（全局常驻集不受影响）
  const desiredIds = new Set(desired.map((tab) => tab.id))
  for (const record of Object.values(before.tabs)) {
    if (!desiredIds.has(record.contentId)) controller.closeTab(record.id)
  }
  // 2) 缺失补开（注册序；contentId 恒等——已开即聚焦不重开）
  for (const tab of desired) {
    if (findContentTab(controller.getSnapshot().state, tab.id) === undefined) {
      controller.openContent({ contentId: tab.id, kind: dockTabKind(tab), title: tab.label })
    }
  }
  // 3) 焦点落定：resolveActiveDockTab 口径（选择恢复/首见回落）；已落定即不重聚焦
  const want = resolveActiveDockTab(desired, selection.selectedId)
  if (want === null) return null
  if (activeDockContent(controller.getSnapshot().state) === want.id) return want.id
  const tabId = findContentTab(controller.getSnapshot().state, want.id)
  if (tabId !== undefined) controller.focusTab(tabId)
  return want.id
}

/** 全局页签不可关闭（AC 口径：全局常驻——官方 canCloseTab 政策面）；登记外兜底可关（官方默认保持可关） */
export function dockTabClosable(set: DockTabSet, contentId: string): boolean {
  const record = set.find((tab) => tab.id === contentId)
  return record === undefined || record.scope.type !== 'global'
}

/** 分栏预算：官方窗格预算 ∧ 两横栏上限（DockLayout 形态约束——README Sidebar 同口径「enforces two panes」；窄轨内分栏另由官方 room 规则接管） */
export function dockCanSplit(snapshot: DockSnapshot): boolean {
  return snapshot.canSplit && dockPaneCount(snapshot.state) < 2
}

/** 官方 TabRecord → 登记表记录（renderTab 分发 / 槽位渲染面契约；登记缺席兜底合成全局记录） */
export function dockRenderRecord(set: DockTabSet, tab: TabRecord): DockTabRecord {
  return set.find((record) => record.id === tab.contentId) ?? globalDockTab(tab.contentId, tab.title)
}
