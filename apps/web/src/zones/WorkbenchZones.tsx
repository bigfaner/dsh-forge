// 三区容器（定位：基础）——左 rail 常驻 / 中区一等公民视图互换（UF-5）/ 右 dock（UF-7 机制）。
// fix-10 全面对齐 dsh：右栏内部 = 官方 ui-dockkit 基座（DockController 布局状态机 +
// DockLayout 横条形渲染——README 对 Sidebar 形态的推荐件；chips 页签条/分栏/拖放停靠/
// 浮动面板/收展 chrome 全部官方面，fix-4 自研轨道退役——零自绘 strip/手柄/宽度态）。
// 产品保留容器级语义（映射层 dock-kit.ts，view-state 零改动）：
//   - UF-7 三态联动：rightDock ↔ 官方 expanded（setExpanded）；知识视图强制隐藏 =
//     容器外层归零（官方 surface 不感知）；切回恢复 = 视图态机既有语义；
//   - 页签跟随项目：visibleDockTabs 可见集 → 官方 openContent/closeTab intents 同步
//     （dock.ts 纯函数保留为语义锚）。
// 状态唯一源 = shell 视图态机（props 注入，经 useShellView 对接）；dock 布局内态 =
// 官方 DockController（useSyncExternalStore 订阅，单实例随本容器存续）。
// 结构基准 = 第一版原型：三区 flex 骨架、中区双面板 keep-alive（hidden 切显隐不卸载）；
// dock 内容常挂载 = 官方 TabRetention（keepMounted 恒真——收起/强制隐藏不卸载，零状态丢失）。
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  DockLayout,
  type TabRecord as DockKitTab,
  type TabId,
} from '@deepseek-ai/dsh-client-ui-dockkit'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShellViewState } from '../shell/view-state.js'
import { visibleDockTabs, type DockTabSet } from './dock.js'
import {
  activeDockContent,
  createWorkbenchDock,
  DOCK_LABELS_ZH,
  dockCanSplit,
  dockRenderRecord,
  dockTabClosable,
  syncDockTabs,
  type DockTabSelection,
} from './dock-kit.js'
import type { WorkbenchZoneSlots } from './slots.js'
import './zones.css'

/** dock 轨道相位（UF-7 States）：collapsed 收起轨道归零 / expanded 页签条+内容区 / hidden 知识模式强制隐藏 */
export type DockTrackMode = 'collapsed' | 'expanded' | 'hidden'

/** 轨道相位推导（UF-5 联动）：知识视图态强制 hidden（已展开也隐藏）；会话视图随 rightDock。 */
export function dockTrackMode(view: ShellViewState): DockTrackMode {
  if (view.center === 'knowledge') return 'hidden'
  return view.rightDock ? 'expanded' : 'collapsed'
}

export interface WorkbenchZonesProps {
  /** 壳视图态（唯一状态源：视图互换 / 右栏联动 / 项目锚） */
  readonly view: ShellViewState
  /** dock 页签登记表（机制持有；域页签经装配登记，见 dock.ts） */
  readonly dockTabs: DockTabSet
  /** 三区槽位（缺省 = 机制占位 / 空轨） */
  readonly slots?: WorkbenchZoneSlots
  /** dock 收展回调（装配接 dispatch('toggle-right-dock')；缺席 = 无收展控制面） */
  readonly onToggleDock?: () => void
}

/** 槽位缺省占位（M0 空态；2.6 EmptyState 组件就位后由装配替换） */
function PanePlaceholder({ kind }: { kind: 'session' | 'knowledge' | 'dock-tab' }): ReactNode {
  const text =
    kind === 'knowledge'
      ? '知识库 · M0 空态占位（浏览最小面 M1 填入）'
      : kind === 'session'
        ? '会话视图 · 占位（UF-4 填入）'
        : '内容占位'
  return (
    <div className="dswf-zone-placeholder" data-dswf-placeholder={kind}>
      {text}
    </div>
  )
}

/**
 * 三区容器（布局机制，无域内容）：渲染 rail 槽 + 中区互换视图槽 + dock 轨道。
 * 中区两面板常挂载（hidden 属性切显隐）；dock = 官方 dockkit 面（常挂载经官方
 * keepMounted 保留策略）——互换往返零卸载，状态保留（UF-5 Validation 第 2 条）。
 */
export function WorkbenchZones({ view, dockTabs, slots, onToggleDock }: WorkbenchZonesProps): ReactNode {
  const dockMode = dockTrackMode(view)

  // 官方基座单实例（collapsed + 首个全局页签起步；rightDock 初始态映射入官方 expanded）
  const [controller] = useState(() =>
    createWorkbenchDock(
      dockTabs.find((tab) => tab.scope.type === 'global') ?? dockTabs[0],
      view.rightDock,
    ),
  )
  // getServerSnapshot 同源（SSR 直渲面——初始快照随 rightDock 已同步，见 createWorkbenchDock）
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )

  // 页签跟随项目（映射层）：可见集 = 当前项目 + 全局（dock.ts 口径）→ 官方 intents 同步；
  // 显式选择锚（切项目自动回落不覆写、切回恢复 = resolveActiveDockTab 语义锚）。
  const visibleTabs = useMemo(
    () => visibleDockTabs(dockTabs, view.focus.projectId),
    [dockTabs, view.focus.projectId],
  )
  const selectionRef = useRef<DockTabSelection>({ selectedId: null })
  const syncFocusRef = useRef<string | null>(null)
  useEffect(() => {
    syncFocusRef.current = syncDockTabs(controller, visibleTabs, selectionRef.current)
  }, [controller, visibleTabs])

  // 三态映射：rightDock → 官方 expanded（等值时官方零记录；收展经 chrome 角位/角位钮同径）
  useEffect(() => {
    controller.setExpanded(view.rightDock)
  }, [controller, view.rightDock])

  // 用户显式选择观测：快照激活 ≠ 同步落定值 = 用户经官方面选择（chips 点击/键选）→ 记锚
  const activeContent = activeDockContent(snapshot.state)
  useEffect(() => {
    if (activeContent !== undefined && activeContent !== syncFocusRef.current) {
      selectionRef.current.selectedId = activeContent
    }
  }, [activeContent])

  // renderTab 按 kind 分发（官方 TabRenderer 契约——kind 唯一解释方在产品）：
  // P1 = 'start' 全局页签（槽位 renderDockTab 渲染域内容）；M2+ 域 kinds 随装配扩展。
  const renderDockBody = (tab: DockKitTab): ReactNode => {
    if (tab.kind !== 'start') return <PanePlaceholder kind="dock-tab" />
    return slots?.renderDockTab?.(dockRenderRecord(dockTabs, tab)) ?? <PanePlaceholder kind="dock-tab" />
  }
  // 全局页签不可关闭（canCloseTab 政策面——官方按 tabId 逐 chip 调用，产品按登记表裁决）
  const canCloseTab = (tabId: TabId): boolean => {
    const record = snapshot.state.tabs[tabId]
    return record === undefined || dockTabClosable(dockTabs, record.contentId)
  }

  return (
    <div className="dswf-zones" data-dswf-view={view.center}>
      <aside className="dswf-zones-rail" aria-label="左侧导航 rail">
        {slots?.rail}
      </aside>
      <main className="dswf-zones-main">
        <div className="dswf-zones-center">
          <section
            className="dswf-zone dswf-zone-session"
            data-dswf-zone="session"
            aria-label="会话视图"
            hidden={view.center !== 'session'}
          >
            {slots?.session ?? <PanePlaceholder kind="session" />}
          </section>
          <section
            className="dswf-zone dswf-zone-knowledge"
            data-dswf-zone="knowledge"
            aria-label="知识库视图"
            hidden={view.center !== 'knowledge'}
          >
            {slots?.knowledge ?? <PanePlaceholder kind="knowledge" />}
          </section>
        </div>
        {/* 右 dock 轨道：内部 = 官方 dockkit 面（DockLayout 横条形 + 浮动随渲染树）；收起/
            强制隐藏 = 容器归零（官方 surface 不感知）。chrome 角位 = 官方置位于右上窗格条尾。 */}
        <aside className="dswf-zones-dock" data-dswf-dock={dockMode} aria-label="dock 面板">
          <DockLayout
            state={snapshot.state}
            canSplit={dockCanSplit(snapshot)}
            dropZones="horizontal"
            minPaneFraction={0.2}
            intents={controller}
            labels={DOCK_LABELS_ZH}
            renderTab={renderDockBody}
            keepMounted={() => true}
            active={dockMode === 'expanded'}
            canAddTab={() => false}
            canCloseTab={canCloseTab}
            chrome={
              onToggleDock !== undefined ? (
                <Button
                  variant="toolbar"
                  size="sm"
                  className="dswf-zones-dock-toggle"
                  aria-label="收起 dock"
                  onClick={onToggleDock}
                >
                  »
                </Button>
              ) : undefined
            }
          />
        </aside>
      </main>
    </div>
  )
}
