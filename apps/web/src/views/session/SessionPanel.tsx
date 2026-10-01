// 会话面板（定位：业务——UF-4 中区会话面板：顶部三页签 + 三 tab keep-alive 容器）。
// Hard Rule 官方件复用优先：对话面 = 注入面（chatSurface——官方 ui-chat/ui-conversation 会话面
// 经装配（2.12）产出，S2 嵌入配方 = conversation.content 工厂（含转录与输入）+ conversation.session
// owner view='chat'；草稿/滚动位置状态由官方面自持，本面板零自绘会话 UI）；页签条 = 官方
// SegmentedTabs。S2 §2.3 选型 (a)：自有三 tab 组装（PRD UF-4 既定形态，官方会话壳 tab 栏不采用）。
// 轨迹 tab = 自有最简台账（TrajectoryLedger，转录数据源切片见 transcript.ts）；
// 召回 tab = P1 占位空态「本会话暂无召回」（3.8 接线 forge:knowledge/sessionRecall → recall 注入位）。
// AC-4 机制：三 pane 常挂载（hidden 切显隐不卸载）——tab 切换零状态丢失。
// 挂载位：zones slots.session（2.12 装配注入）；UF-4 States 空会话/加载恢复中由官方会话面
// 自承载（hero 相位/骨架），本面板不重复建模。
import { useState, type ReactNode } from 'react'
import { SegmentedTabs, type SegmentedTab } from '@deepseek-ai/dsh-client-ui-primitives'
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

export interface SessionPanelProps {
  /** 对话 tab 内容：官方会话面（转录 + 输入）经装配注入——2.12 按 S2 嵌入配方接线 */
  readonly chatSurface: ReactNode
  /** 转录条目切片（轨迹 tab 台账数据源；装配自官方 ChatSnapshot 映射，映射表见 README） */
  readonly transcript?: readonly TranscriptEntry[]
  /** 召回 tab 内容（缺省 = 占位空态「本会话暂无召回」；3.8 接线分组行列表） */
  readonly recall?: ReactNode
  /** 初始激活 tab（缺省对话） */
  readonly defaultTab?: SessionTabId
  /** tab 切换回调（装配消费；激活态面板自持——内容态不经受切换） */
  readonly onTabChange?: (tab: SessionTabId) => void
}

/** 会话面板（三 tab keep-alive 容器；状态保留 = 切换仅动 hidden，pane 常挂载不卸载） */
export function SessionPanel({
  chatSurface,
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
  const tabItems = SESSION_TABS.map(
    (tab): SegmentedTab<SessionTabId> => ({
      value: tab.id,
      label: tab.label,
      id: `dswf-session-tab-${tab.id}`,
      panelId: `dswf-session-pane-${tab.id}`,
    }),
  )
  return (
    <section className="dswf-session-panel" aria-label="会话面板">
      <div className="dswf-session-tabs">
        <SegmentedTabs
          label="会话视图"
          items={tabItems as [SegmentedTab<SessionTabId>, ...SegmentedTab<SessionTabId>[]]}
          value={activeTab}
          onChange={select}
        />
      </div>
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
