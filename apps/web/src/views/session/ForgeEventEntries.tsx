// ForgeEventEntries —— 消息面 forge 事件折叠条目组（定位：业务——loop-event-delivery
// 1.9；conversation.chat.node keyed 'forge-event-group' 占用者，ForgeProgressNode 同型
// 发布面）。loop-message-consolidation 1.2：组卡呈「循环进度卡」形态——组内
// 'forge/progress' 事件经 forgeProgressRowItems 聚合（每任务键最新态一行、后写覆盖
// 原地更新；循环级事件收敛单行），任务行展示 标题/状态/开始/结束/耗时（事件时戳）；
// 结算/异常消息条目只保留概要一行（明细归其自身 wakeup 卡，不重复展开）。
// 组头（场景徽记 + 条数 + 时间范围 + 展开/收起）。默认展开 = 最新组（isLatest），
// 前组默认收起（人类插话 = 分组锚点——发射判定在节点定义面，组件纯呈现零 RPC）。
import { useEffect, useRef, useState } from 'react'
import { DisclosureRow } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  forgeEventBadgeTone,
  forgeEventClock,
  forgeEventClockSeconds,
  forgeEventGroupCount,
  forgeEventGroupSource,
  forgeProgressRowItems,
  forgeProgressStatusTone,
  FORGE_PROGRESS_STATUS_WORD,
  isForgeEventGroupData,
  type ForgeEventGroupData,
  type ForgeProgressRowData,
} from './forge-event-data.js'
import { dispatchEventDurationLabel } from './DispatchEventsPanel.js'
import './forge-event-entries.css'

/** 官方节点座 props 消费切片（ForgeProgressNode 同型——node.kind/data 窄读） */
export interface ForgeEventEntriesProps {
  readonly node: {
    readonly kind?: unknown
    readonly data?: unknown
  }
}

/** 组头单行摘要（`forge · 任务循环事件 · N 条 · HH:mm–HH:mm`——可测纯函数；计数与卡内
 *  渲染行同口径：progress 行计入——bug 6a3ccc4d 前只计消息条目、纯 progress 组显示（0）） */
export function forgeEventGroupSummary(data: ForgeEventGroupData): string {
  const count = data.entries.length + forgeProgressRowItems(data.progress ?? []).length
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

/** 进度行耗时标签（终态 = 结束−开始；执行中 = 过程未定不呈现——面板同口径） */
export function forgeProgressDurationLabel(row: ForgeProgressRowData): string | undefined {
  if (row.entry.status === 'running') return undefined
  return row.endAt - row.startAt >= 1000 ? dispatchEventDurationLabel(row.startAt, row.endAt) : undefined
}

/** 'forge-event-group' 折叠条目组节点（形状漂移/他形 = null——官方流零残留） */
export function ForgeEventEntries({ node }: ForgeEventEntriesProps) {
  if (node?.kind !== 'forge-event-group' || !isForgeEventGroupData(node.data)) return null
  return <ForgeEventGroupBlock data={node.data} />
}

/** 进度行（任务轨单行——标题/状态/开始/结束/耗时） */
function ForgeProgressRowView({ row }: { row: ForgeProgressRowData }) {
  const statusWord = FORGE_PROGRESS_STATUS_WORD[row.entry.status] ?? row.entry.status
  const duration = forgeProgressDurationLabel(row)
  return (
    <li className="dswf-event-entries-item dswf-event-entries-progress" data-dswf-progress-status={row.entry.status}>
      <span className="dswf-event-entries-text">
        <b>{row.entry.taskTitle ?? row.entry.taskKey}</b>
        {/* 重试计数等 note 随进度事件持久（bug 33728995③——组卡从投影/会话日志重建后仍可见） */}
        {row.entry.note !== undefined ? ` · ${row.entry.note}` : ''}
      </span>
      <span className="dswf-event-entries-badge" data-tone={forgeProgressStatusTone(row.entry.status)}>
        {statusWord}
      </span>
      <span className="dswf-event-entries-side">
        <span className="dswf-event-entries-time">{forgeEventClockSeconds(row.startAt)}</span>
        <span className="dswf-event-entries-time">
          {row.entry.status === 'running' ? '—' : forgeEventClockSeconds(row.endAt)}
        </span>
        {duration !== undefined ? <span className="dswf-event-entries-duration">{duration}</span> : null}
      </span>
    </li>
  )
}

/** 条目行 detail（§2.5 渲染层去重——summary 段命中 title 字面时剥掉该段，数据面不动） */
export function forgeEventEntryDetail(entry: { readonly title: string; readonly summary: string }): string {
  if (entry.title === '' || entry.summary === '') return entry.summary
  return entry.summary
    .split(' · ')
    .filter((seg) => seg !== entry.title)
    .join(' · ')
}

/** 循环级单行（无 taskKey 事件收敛最新态——状态词 + 备注，零耗时） */
function ForgeLoopRowView({ row }: { row: ForgeProgressRowData }) {
  const statusWord = FORGE_PROGRESS_STATUS_WORD[row.entry.status] ?? row.entry.status
  return (
    <li className="dswf-event-entries-item dswf-event-entries-loop">
      <span className="dswf-event-entries-badge dswf-event-entries-loop-badge">循环</span>
      <span className="dswf-event-entries-text">
        {statusWord}
        {row.entry.note !== undefined ? ` · ${row.entry.note}` : ''}
      </span>
      <span className="dswf-event-entries-side">
        <span className="dswf-event-entries-time">{forgeEventClockSeconds(row.entry.at)}</span>
      </span>
    </li>
  )
}

/** 官方贴底容差（dsh-client-ui-chat useScrollFollow(state.followingTail, 25)——nearBottom 同源判据） */
export const FORGE_TAIL_TOLERANCE_PX = 25

/**
 * 贴底跟随保持缝（§2.6 D3 单轨——组卡增高后补一发落底）。
 * CDP 定谳（1.4/001，见 proposal walkthrough 归因档）：组卡增高阶跃（+36~+154px > 25px
 * 容差）直接落在官方 scrollport 外层（活跃期不在 turn 过程体内——次假设排除）；官方追底
 * 在贴底态走 instant jump 可吸收阶跃，但阶跃落进 smooth 追底动画在飞窗口时 settle 落点
 * 超容差 → followingTail 释放（dsh-client-ui-chat client.js ScrollFollow.settle）→ 运行期
 * 脱底。消费侧补缝：组卡增高后若增高前仍在官方容差内（贴底态）则补一发 instant 落底——
 * 对齐官方 returnToBottom 同缝（纯呈现层体验优化，不涉会话写入）；用户已上滚阅读
 * （增高前偏离 > 容差）不拉拽。
 * @param root 组卡根元素（ResizeObserver 观察面；缺席/无 RO 环境 = 零操作）
 * @returns 解绑器（组件卸载断开观察）
 */
export function forgeEventTailKeepEffect(root: Element | null): () => void {
  if (root === null || typeof ResizeObserver === 'undefined') return () => {}
  let lastHeight = root.getBoundingClientRect().height
  const observer = new ResizeObserver(() => {
    const height = root.getBoundingClientRect().height
    const grew = height - lastHeight
    lastHeight = height
    if (grew <= 0) return
    const scrollport = root.closest('[data-conversation-scroll]')
    if (scrollport === null) return
    const preGrowDistance = scrollport.scrollHeight - scrollport.scrollTop - scrollport.clientHeight - grew
    if (preGrowDistance > FORGE_TAIL_TOLERANCE_PX) return
    scrollport.scrollTop = scrollport.scrollHeight - scrollport.clientHeight
  })
  observer.observe(root)
  return () => observer.disconnect()
}

function ForgeEventGroupBlock({ data }: { data: ForgeEventGroupData }) {
  // §2.6 贴底保持缝挂载（组卡根观察——增高阶跃补落底；卸载断开）
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => forgeEventTailKeepEffect(rootRef.current), [])
  // 默认态 = 位置语义（最新组展开 / 前组收起）；用户切换后为本地微观态
  const [open, setOpen] = useState(data.isLatest)
  // 组头信息结构（prototype evt-head 同位）：`[forge·调度] {source}` + 右贴计数
  // `N 条 · 今日 HH:mm–HH:mm`（计数经自包裹层绝对定位——官方 DisclosureRow 无尾部
  // 插槽，零 fork）；来源缺席回落旧摘要串（计数并入标题，不叠贴）
  const source = forgeEventGroupSource(data.entries)
  const title = source !== '' ? `[forge·调度] ${source}` : forgeEventGroupSummary(data)
  const rows = forgeProgressRowItems(data.progress ?? [])
  const loopRow = rows.find((row) => row.entry.taskKey === undefined)
  const taskRows = rows.filter((row) => row.entry.taskKey !== undefined)
  // 头计数（进度卡口径）：任务行数 + 进度起止范围（首 startAt–末 endAt）；无 progress 回落条目窗口
  const count =
    taskRows.length > 0
      ? `${taskRows.length} 任务 · 今日 ${forgeEventClock(Math.min(...rows.map((row) => row.startAt)))}–${forgeEventClock(Math.max(...rows.map((row) => row.endAt)))}`
      : `${data.entries.length} 条 · ${forgeEventGroupCount(data.entries)}`
  return (
    <div ref={rootRef} className="dswf-event-entries" data-dswf-event-entries="" data-latest={data.isLatest || undefined}>
      {source !== '' ? (
        <span className="dswf-event-entries-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
      <DisclosureRow
        icon={<span className="dswf-event-entries-dot" aria-hidden="true" />}
        title={title}
        open={open}
        expandable
        onToggle={() => setOpen((v) => !v)}
        expandOnRowClick
        rowClassName="dswf-event-entries-row"
        contentClassName="dswf-event-entries-content"
      >
        <ul className="dswf-event-entries-list">
          {loopRow !== undefined ? <ForgeLoopRowView row={loopRow} /> : null}
          {taskRows.map((row) => (
            <ForgeProgressRowView key={row.entry.taskKey} row={row} />
          ))}
          {data.entries.map((entry) => {
            // §2.5（D 裁决 去重并换行）：title 与 detail 分行展示；summary 命中 title
            // 字面（taskTitle/taskKey/slug）时渲染层剥掉标题前缀，仅留徽记词+差异信息
            // bug 35571877：条目行与任务行同构（文本在前→徽标右置→右侧时间簇），
            // 归一类 dswf-event-entries-entry 承担对齐；徽记词保留（语义区分不靠双套样式）
            const detail = forgeEventEntryDetail(entry)
            return (
              <li className="dswf-event-entries-item dswf-event-entries-entry" key={entry.id}>
                <span className="dswf-event-entries-text dswf-event-entries-msg-text">
                  {entry.title !== '' ? <b>{entry.title}</b> : null}
                  {detail !== '' ? <span className="dswf-event-entries-msg-detail">{detail}</span> : null}
                </span>
                {entry.badge !== '' ? (
                  <span className="dswf-event-entries-badge" data-tone={forgeEventBadgeTone(entry.badge)}>
                    {entry.badge}
                  </span>
                ) : null}
                <span className="dswf-event-entries-side">
                  <span className="dswf-event-entries-time">{forgeEventClockSeconds(entry.time)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </DisclosureRow>
    </div>
  )
}
