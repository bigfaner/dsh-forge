// ForgeEventEntries —— 消息面 forge 事件折叠条目组（定位：业务——loop-event-delivery
// 1.9；conversation.chat.node keyed 'forge-event-group' 占用者，ForgeProgressNode 同型
// 发布面）。渲染 = prototype.html 左栏形态：组头（场景徽记 + 条数 + 时间范围 + 展开/
// 收起）+ 展开逐条（时间 + 场景章 + 任务标题 + 摘要）。默认展开 = 最新组（isLatest），
// 前组默认收起（人类插话 = 分组锚点——发射判定在节点定义面，组件纯呈现零 RPC）。
import { useState } from 'react'
import { DisclosureRow } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  forgeEventBadgeTone,
  forgeEventClock,
  forgeEventClockSeconds,
  isForgeEventGroupData,
  type ForgeEventGroupData,
} from './forge-event-data.js'
import './forge-event-entries.css'

/** 官方节点座 props 消费切片（ForgeProgressNode 同型——node.kind/data 窄读） */
export interface ForgeEventEntriesProps {
  readonly node: {
    readonly kind?: unknown
    readonly data?: unknown
  }
}

/** 组头单行摘要（`forge · 任务循环事件 · N 条 · HH:mm–HH:mm`——可测纯函数） */
export function forgeEventGroupSummary(data: ForgeEventGroupData): string {
  const count = data.entries.length
  const first = data.entries[0]
  const last = data.entries.at(-1)
  const range =
    first !== undefined && last !== undefined && first.id !== last.id
      ? `· ${forgeEventClock(first.time)}–${forgeEventClock(last.time)}`
      : first !== undefined
        ? `· ${forgeEventClock(first.time)}`
        : ''
  return `forge · 任务循环事件（${count}）${range}`
}

/** 'forge-event-group' 折叠条目组节点（形状漂移/他形 = null——官方流零残留） */
export function ForgeEventEntries({ node }: ForgeEventEntriesProps) {
  if (node?.kind !== 'forge-event-group' || !isForgeEventGroupData(node.data)) return null
  return <ForgeEventGroupBlock data={node.data} />
}

function ForgeEventGroupBlock({ data }: { data: ForgeEventGroupData }) {
  // 默认态 = 位置语义（最新组展开 / 前组收起）；用户切换后为本地微观态
  const [open, setOpen] = useState(data.isLatest)
  return (
    <div className="dswf-event-entries" data-dswf-event-entries="" data-latest={data.isLatest || undefined}>
      <DisclosureRow
        icon={<span className="dswf-event-entries-dot" aria-hidden="true" />}
        title={forgeEventGroupSummary(data)}
        open={open}
        expandable
        onToggle={() => setOpen((v) => !v)}
        expandOnRowClick
        rowClassName="dswf-event-entries-row"
        contentClassName="dswf-event-entries-content"
      >
        <ul className="dswf-event-entries-list">
          {data.entries.map((entry) => (
            <li className="dswf-event-entries-item" key={entry.id}>
              <span className="dswf-event-entries-time">{forgeEventClockSeconds(entry.time)}</span>
              {entry.badge !== '' ? (
                <span className="dswf-event-entries-badge" data-tone={forgeEventBadgeTone(entry.badge)}>
                  {entry.badge}
                </span>
              ) : null}
              <span className="dswf-event-entries-text">
                {entry.title !== '' ? <b>{entry.title}</b> : null}
                {entry.title !== '' && entry.summary !== '' ? ' — ' : null}
                {entry.summary}
              </span>
            </li>
          ))}
        </ul>
      </DisclosureRow>
    </div>
  )
}
