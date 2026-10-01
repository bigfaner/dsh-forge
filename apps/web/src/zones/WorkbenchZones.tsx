// 三区容器（定位：基础）——左 rail 常驻 / 中区一等公民视图互换（UF-5）/ 右 dock 轨道（UF-7 机制）。
// 结构基准 = 第一版原型：三区 flex 骨架、中区双面板 keep-alive（hidden 切显隐不卸载——切换零状态
// 丢失）、dock 宽度轨道（收起归零 ↔ 页签条+内容区，内容常挂载）。视觉一律官方语言（Hard Rule）：
// 页签条 = 官方 SegmentedTabs、控制钮 = 官方 Button；dockkit DockSurface 拆分/浮动引擎 2.6+ 消费
// （S2 清单 §2.5），本件只承载轨道收展 + 页签跟随机制。
// 状态唯一源 = shell 视图态机（props 注入，经 useShellView 对接）；激活页签为本件机制内态
// （推导回落/恢复语义见 dock.ts resolveActiveDockTab）。
import { useState, type ReactNode } from 'react'
import { Button, SegmentedTabs, type SegmentedTab } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShellViewState } from '../shell/view-state.js'
import {
  resolveActiveDockTab,
  visibleDockTabs,
  type DockTabSet,
} from './dock.js'
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
function PanePlaceholder({ kind }: { kind: 'session' | 'knowledge' | 'dock-tab' | 'dock-empty' }): ReactNode {
  const text =
    kind === 'knowledge'
      ? '知识库 · M0 空态占位（浏览最小面 M1 填入）'
      : kind === 'session'
        ? '会话视图 · 占位（UF-4 填入）'
        : kind === 'dock-tab'
          ? '内容占位'
          : '无可见页签（当前项目 + 全局）'
  return (
    <div className="dswf-zone-placeholder" data-dswf-placeholder={kind}>
      {text}
    </div>
  )
}

/**
 * 三区容器（布局机制，无域内容）：渲染 rail 槽 + 中区互换视图槽 + dock 轨道。
 * 中区两面板常挂载（hidden 属性切显隐）；dock 内容常挂载（宽度轨道切可见）——
 * 互换往返零卸载，状态保留（UF-5 Validation 第 2 条的机制保证）。
 */
export function WorkbenchZones({ view, dockTabs, slots, onToggleDock }: WorkbenchZonesProps): ReactNode {
  const dockMode = dockTrackMode(view)
  const visibleTabs = visibleDockTabs(dockTabs, view.focus.projectId)
  // 激活页签 = 机制内态（用户显式选择）+ 推导回落（切项目自动落到新集首个，切回恢复原选择）
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null)
  const activeTab = resolveActiveDockTab(visibleTabs, selectedTabId)

  const tabItems = visibleTabs.map(
    (tab): SegmentedTab<string> => ({
      value: tab.id,
      label: tab.label,
      id: `dswf-dock-tab-${tab.id}`,
      panelId: `dswf-dock-panel-${tab.id}`,
    }),
  )

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
        <aside className="dswf-zones-dock" data-dswf-dock={dockMode} aria-label="dock 面板">
          <div className="dswf-zones-dock-strip">
            {activeTab !== null ? (
              <SegmentedTabs
                label="dock 页签"
                items={tabItems as [SegmentedTab<string>, ...SegmentedTab<string>[]]}
                value={activeTab.id}
                onChange={setSelectedTabId}
              />
            ) : null}
            {onToggleDock !== undefined ? (
              <Button
                variant="toolbar"
                size="sm"
                className="dswf-zones-dock-toggle"
                aria-label={dockMode === 'expanded' ? '收起 dock' : '展开 dock'}
                onClick={onToggleDock}
              >
                {dockMode === 'expanded' ? '»' : '«'}
              </Button>
            ) : null}
          </div>
          <div
            className="dswf-zones-dock-body"
            role="tabpanel"
            id={activeTab === null ? undefined : `dswf-dock-panel-${activeTab.id}`}
            aria-labelledby={activeTab === null ? undefined : `dswf-dock-tab-${activeTab.id}`}
          >
            {activeTab === null ? (
              <PanePlaceholder kind="dock-empty" />
            ) : (
              (slots?.renderDockTab?.(activeTab) ?? <PanePlaceholder kind="dock-tab" />)
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}
