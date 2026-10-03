// 会话面板（定位：业务——UF-4 中区会话面板：官方同构头部单元（fix-13：SessionToolbar
// titleRow 行 + 三页签行融合为 .dswf-session-header 一体头部，官方 ConversationRoot
// .header 刻度——SessionToolbar 经装配注入）+ 三 tab keep-alive 容器）。
// Hard Rule 官方件复用优先：对话面 = 注入面（chatSurface——官方 ui-chat/ui-conversation 会话面
// 经装配（2.12）产出，S2 嵌入配方 = conversation.content 工厂（含转录与输入）+ conversation.session
// owner view='chat'；草稿/滚动位置状态由官方面自持，本面板零自绘会话 UI）。
// 页签行语言（fix-13 决策变更）：原「官方 SegmentedTabs 分段控件」（2.11/fix-9 形态）按走查人
// 原生对齐指令退役，改为官方 ConversationRoot .tabs/.tab/.tabActive 行语言复刻（扁平文字钮：
// 透明底/无边框/13px 500/16 + 激活变色 + 2px ::after 底指示线——刻度实值 dsw-raw 注记，
// session.css 逐处说明；SegmentedTabs 于会话面板退役，dock 面官方 dockkit 基座不受影响）。
// aria/键盘语义零褪色：role=tablist/tab、aria-selected、tab→pane aria-controls 接线与
// 箭头/Home/End 轮焦（原 SegmentedTabs 同语义保持）——e2e [role=tab] 计数/label 锚不动。
// 轨迹 tab = 自有最简台账（TrajectoryLedger，转录数据源切片见 transcript.ts）；
// 召回 tab = P1 占位空态「本会话暂无召回」（3.8 接线 forge:knowledge/sessionRecall → recall 注入位）。
// AC-4 机制：三 pane 常挂载（hidden 切显隐不卸载）——tab 切换零状态丢失。
// 挂载位：zones slots.session（2.12 装配注入）；UF-4 States 空会话/加载恢复中由官方会话面
// 自承载（hero 相位/骨架），本面板不重复建模。
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { EmptyState } from '../../components/index.js'
import { TrajectoryLedger } from './TrajectoryLedger.js'
import type { TranscriptEntry } from './transcript.js'
import './session.css'

/** 会话面板 tab id（对话/轨迹对齐官方视图 id 'chat'/'trajectory'——S2 §2.2；召回 = 产品自有） */
export type SessionTabId = 'chat' | 'trajectory' | 'recall'

/** 三页签（UF-4 顶部三页签；label = PRD/原型文案） */
export const SESSION_TABS: readonly { readonly id: SessionTabId; readonly label: string }[] = [
  { id: 'chat', label: '对话' },
  { id: 'trajectory', label: '轨迹' },
  { id: 'recall', label: '知识召回' },
]

/** 键盘轮焦索引推导（纯函数——原 SegmentedTabs 轮焦语义：Left/Right 循环 + Home/End 首末；
 * 非轮焦键 = null 不拦截） */
export function nextTabIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowLeft':
      return (index + count - 1) % count
    case 'ArrowRight':
      return (index + 1) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

export interface SessionPanelProps {
  /** 对话 tab 内容：官方会话面（转录 + 输入）经装配注入——2.12 按 S2 嵌入配方接线 */
  readonly chatSurface: ReactNode
  /** 头部单元 titleRow 行（fix-9 装配注入 / fix-13 融合为 .dswf-session-header 一体头部：
   * 标题/hero 相位/面板钮经 SessionToolbar 组装；缺省 = 仅页签行头部，非壳载体最简面） */
  readonly toolbar?: ReactNode
  /** 转录条目切片（轨迹 tab 台账数据源；装配自官方 ChatSnapshot 映射，映射表见 README） */
  readonly transcript?: readonly TranscriptEntry[]
  /** 召回 tab 内容（缺省 = 占位空态「本会话暂无召回」；3.8 接线分组行列表） */
  readonly recall?: ReactNode
  /** 初始激活 tab（缺省对话） */
  readonly defaultTab?: SessionTabId
  /** tab 切换回调（装配消费；激活态面板自持——内容态不经受切换） */
  readonly onTabChange?: (tab: SessionTabId) => void
}

/**
 * 会话面板（官方同构头部单元：titleRow 注入位 + 官方 .tabs 行语言页签 + 三 tab keep-alive
 * 容器；状态保留 = 切换仅动 hidden，pane 常挂载不卸载）。页签 = 官方 ConversationRoot
 * .tab/.tabActive 复刻（fix-13）；键盘轮焦 = 原 SegmentedTabs 同语义保持（箭头/Home/End
 * 移焦并选中——仅激活 tab 为 tab stop）。
 */
export function SessionPanel({
  chatSurface,
  toolbar,
  transcript = [],
  recall,
  defaultTab = 'chat',
  onTabChange,
}: SessionPanelProps): ReactNode {
  const [activeTab, setActiveTab] = useState<SessionTabId>(defaultTab)
  const select = (tab: SessionTabId): void => {
    setActiveTab(tab)
    onTabChange?.(tab)
  }
  // 键盘轮焦（原 SegmentedTabs 同语义：Left/Right 循环 + Home/End 首末——移焦并选中；
  // 索引推导 = nextTabIndex 纯函数）
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = nextTabIndex(event.key, index, SESSION_TABS.length)
    if (next === null) return
    event.preventDefault()
    event.stopPropagation()
    const tablist = event.currentTarget.parentElement
    const nextTab = SESSION_TABS[next]
    if (tablist === null || nextTab === undefined) return
    tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]').item(next)?.focus()
    select(nextTab.id)
  }
  return (
    <section className="dswf-session-panel" aria-label="会话面板">
      {/* 头部单元（fix-13：官方 .header 刻度一体容器——titleRow 注入 + 页签行；发线/76px 语义归容器） */}
      <header className="dswf-session-header">
        {toolbar}
        <div className="dswf-session-tabs" role="tablist" aria-label="会话视图">
          {SESSION_TABS.map((tab, index) => (
            <button
              type="button"
              key={tab.id}
              role="tab"
              id={`dswf-session-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`dswf-session-pane-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={
                activeTab === tab.id ? 'dswf-session-tab dswf-session-tab-active' : 'dswf-session-tab'
              }
              onClick={() => {
                select(tab.id)
              }}
              onKeyDown={(event) => {
                onTabKeyDown(event, index)
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>
      <div className="dswf-session-body">
        <div
          className="dswf-session-pane"
          id="dswf-session-pane-chat"
          role="tabpanel"
          aria-labelledby="dswf-session-tab-chat"
          data-dswf-pane="chat"
          hidden={activeTab !== 'chat'}
        >
          {chatSurface}
        </div>
        <div
          className="dswf-session-pane"
          id="dswf-session-pane-trajectory"
          role="tabpanel"
          aria-labelledby="dswf-session-tab-trajectory"
          data-dswf-pane="trajectory"
          hidden={activeTab !== 'trajectory'}
        >
          <TrajectoryLedger entries={transcript} />
        </div>
        <div
          className="dswf-session-pane"
          id="dswf-session-pane-recall"
          role="tabpanel"
          aria-labelledby="dswf-session-tab-recall"
          data-dswf-pane="recall"
          hidden={activeTab !== 'recall'}
        >
          {recall ?? <EmptyState title="本会话暂无召回" />}
        </div>
      </div>
    </section>
  )
}
