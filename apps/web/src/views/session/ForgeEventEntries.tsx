// ForgeEventEntries —— 消息面 forge 事件折叠条目组（定位：业务——loop-event-delivery
// 1.9；conversation.chat.node keyed 'forge-event-group' 占用者，ForgeProgressNode 同型
// 发布面）。loop-message-consolidation 1.2：组卡呈「循环进度卡」形态——组内
// 'forge/progress' 事件经 forgeProgressRowItems 聚合（每任务键最新态一行、后写覆盖
// 原地更新；循环级事件收敛单行），任务行展示 标题/状态/开始/结束/耗时（事件时戳）；
// 结算/异常消息条目只保留概要一行（明细归其自身 wakeup 卡，不重复展开）。
// 组头（场景徽记 + 条数 + 时间范围 + 展开/收起）。默认展开 = 最新组；任务进度卡
// （progress 在场）默认展开——打开会话即见任务轨；纯消息组前组默认收起（人类插话 =
// 分组锚点——发射判定在节点定义面，组件纯呈现零 RPC）。
import { useEffect, useRef, useState } from 'react'
import { DisclosureRow } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  forgeEventBadgeTone,
  forgeEventClock,
  forgeEventClockSeconds,
  forgeEventGroupCount,
  forgeEventGroupSource,
  forgeEventVisibleEntries,
  forgeProgressRowItems,
  forgeProgressStatusTone,
  forgeProgressStatusWord,
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

/** 进度行耗时标签（终态 = 结束−开始；执行中 = 过程未定不呈现——实时计时器面接管，面板同口径） */
export function forgeProgressDurationLabel(row: ForgeProgressRowData): string | undefined {
  if (row.entry.status === 'running') return undefined
  return row.endAt - row.startAt >= 1000 ? dispatchEventDurationLabel(row.startAt, row.endAt) : undefined
}

/** running 行实时计时器（loop-card-task-context 1.4：自 startAt 起算已耗时，同
 *  dispatchEventDurationLabel 口径格式；组件内 interval 逐秒刷新——纯呈现层零 RPC，
 *  卸载/重渲染终态切换即清理。仅 running 行挂载，多行各自独立计时） */
function ForgeRunningDuration({ startAt }: { startAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <span className="dswf-event-entries-duration">{dispatchEventDurationLabel(startAt, now)}</span>
}

/** 'forge-event-group' 折叠条目组节点（形状漂移/他形 = null——官方流零残留） */
export function ForgeEventEntries({ node }: ForgeEventEntriesProps) {
  if (node?.kind !== 'forge-event-group' || !isForgeEventGroupData(node.data)) return null
  return <ForgeEventGroupBlock data={node.data} />
}

/** 进度行（任务轨单行——标题/状态/开始/结束/耗时；triage 处置行加「处置」徽记胶囊） */
function ForgeProgressRowView({ row }: { row: ForgeProgressRowData }) {
  const statusWord = forgeProgressStatusWord(row.entry)
  const duration = forgeProgressDurationLabel(row)
  // loop-card-task-context：任务行 #N 弱化前缀（N = taskKey 尾段）；循环级行（taskKey 缺席）不渲染
  const localId = row.entry.taskKey !== undefined ? (row.entry.taskKey.split('/').at(-1) ?? '') : undefined
  // triage 处置行（triage-progress-row §2.2——verb 限定，同 taskKey 与任务行不撞）：`#N [处置]`
  // 紧凑徽标区分处置轨（语义归徽记不进文本流——bug 35571877 行语言同裁决）
  const isTriage = row.entry.verb === 'triage'
  return (
    <li className="dswf-event-entries-item dswf-event-entries-progress" data-dswf-progress-status={row.entry.status}>
      <span className="dswf-event-entries-text">
        {localId !== undefined && localId !== '' ? <span className="dswf-event-entries-num">#{localId}</span> : null}
        {isTriage ? <span className="dswf-event-entries-triage-flag">处置</span> : null}
        <b>{row.entry.taskTitle ?? row.entry.taskKey}</b>
        {/* 重试计数等 note 随进度事件持久（bug 33728995③——组卡从投影/会话日志重建后仍可见） */}
        {row.entry.note !== undefined ? ` · ${row.entry.note}` : ''}
      </span>
      {/* 执行专家键（标题与状态徽标之间；旧事件无字段 = 不显示） */}
      {row.entry.expertKey !== undefined && row.entry.expertKey !== '' ? (
        <span className="dswf-event-entries-time">{row.entry.expertKey}</span>
      ) : null}
      <span className="dswf-event-entries-badge" data-tone={forgeProgressStatusTone(row.entry.status)}>
        {statusWord}
      </span>
      <span className="dswf-event-entries-side">
        <span className="dswf-event-entries-time">{forgeEventClockSeconds(row.startAt)}</span>
        <span className="dswf-event-entries-time">
          {row.entry.status === 'running' ? '—' : forgeEventClockSeconds(row.endAt)}
        </span>
        {row.entry.status === 'running' ? (
          <ForgeRunningDuration startAt={row.startAt} />
        ) : duration !== undefined ? (
          <span className="dswf-event-entries-duration">{duration}</span>
        ) : null}
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

/** 循环级单行（无 taskKey 事件收敛最新态——循环级状态词 + 备注，零耗时） */
function ForgeLoopRowView({ row }: { row: ForgeProgressRowData }) {
  const statusWord = forgeProgressStatusWord(row.entry)
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
  // 默认态 = 最新组展开；任务进度卡（progress 在场）打开会话即默认展开（用户裁决
  // 2026-11-01——进度卡收起让用户错过任务轨，纯消息组维持前组收起）；用户切换后为本地微观态
  const [open, setOpen] = useState(data.isLatest || (data.progress?.length ?? 0) > 0)
  const rows = forgeProgressRowItems(data.progress ?? [])
  const loopRow = rows.find((row) => row.entry.taskKey === undefined)
  const taskRows = rows.filter((row) => row.entry.taskKey !== undefined)
  // 循环重开防误导：循环级最新态 running 时，上一轮终态/受阻消息条目不呈现（含组头来源
  // 提取——居首的上一轮「循环结束」任务源行不再把终态尾饰带进组头）
  const loopRunning = loopRow !== undefined && loopRow.entry.status === 'running'
  const visibleEntries = forgeEventVisibleEntries(data.entries, loopRunning)
  // 组头信息结构（prototype evt-head 同位）：`[forge·调度] {source}` + 右贴计数
  // `N 条 · 今日 HH:mm–HH:mm`（计数经自包裹层绝对定位——官方 DisclosureRow 无尾部
  // 插槽，零 fork）；来源缺席回落旧摘要串（计数并入标题，不叠贴）
  const source = forgeEventGroupSource(visibleEntries, data.progress)
  const title = source !== '' ? `[forge·调度] ${source}` : forgeEventGroupSummary(data)
  // 头计数（进度卡口径）：任务行数 + 进度起止范围（首 startAt–末 endAt）；无 progress 回落条目窗口
  const count =
    taskRows.length > 0
      ? `${taskRows.length} 任务 · 今日 ${forgeEventClock(Math.min(...rows.map((row) => row.startAt)))}–${forgeEventClock(Math.max(...rows.map((row) => row.endAt)))}`
      : `${visibleEntries.length} 条 · ${forgeEventGroupCount(visibleEntries)}`
  return (
    <div ref={rootRef} className="dswf-event-entries" data-dswf-event-entries="" data-latest={data.isLatest || undefined}>
      {source !== '' ? (
        <span className="dswf-event-entries-head-meta" aria-hidden="true">
          {/* 折叠态运行提示：循环进行中且组收起时，计数左侧补运行胶囊（展开态循环行已示，不重复） */}
          {loopRunning && !open ? <span className="dswf-event-entries-running-flag">循环进行中</span> : null}
          <span className="dswf-event-entries-count">{count}</span>
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
            // 键 = verb 限定（triage:{taskKey} 独立聚合行与任务行同 taskKey 不撞键）
            <ForgeProgressRowView key={`${row.entry.verb}:${row.entry.taskKey}`} row={row} />
          ))}
          {visibleEntries.map((entry) => {
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
