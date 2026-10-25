// 悬浮进度流面板（定位：业务——loop-event-delivery 1.8：派发任务悬浮面板[DispatchPanel]
// 的继任面，替代不并存）。提案 §悬浮进度流面板 + 验收总纲：UI 对照 prototype.html（同目录）
// 信息结构、令牌对齐 DESIGN.md，官方组件组合（Button/Tag/Tooltip/图标件——零自绘控件）。
// 数据纪律（零新增读取 API）：
//   - 唯一通道 = 账本行 projectionValues['forge-dispatch-events'] 窄读（1.6 投影键 fold
//     'forge/progress' 事件——官方 session-projection registry 产物，wire view =
//     {entries 最近 200 条窗口, total}）；官方 sessions.list store subscribe = onChanged
//     实时刷新（useSyncExternalStore 直连——SC2 零缓存零副本，sidebar 同缝）。
//   - 行聚合口径 = 任务键时间线（1.16 用户裁决：每任务最新态一行，组内时序；循环级事件
//     各占一行；分组/章语义并入次行 title 补充文案）；行形态 = 双行任务轨（rail 竖线 +
//     状态点：执行中 accent 带光晕 / 完成 success / 阻塞 warn / 中断 caption + 首行
//     taskKey/状态徽标 + 次行 taskTitle + 右侧绝对启动时间 + 耗时徽标）；
//     可跳转行带 jump 徽标（↗——「可点开子会话」可见 affordance）。
//   - 行点击 = 打开 worker 执行子会话（1.16 用户裁决①：除未开始执行外全部任务行可交互
//     ——载荷 workerSessionId 直跳；缺席行经 resolveWorkerSession 父反查兜底，落空记 ''
//     行保持非交互不空跳）。
// 落位/交互（DispatchPanel 既有缝原样承袭——fix bug 570fa4e2 判例同径）：
//   - shell overlay 常驻树挂载（fixed + pointer-events:auto + dockkit 浮层层级）；几何 =
//     对话真盒官方锚（[data-conversation-scroll] + [data-conversation-tabs]），dock 展开
//     自动左移；头可拖（拖后停自动锚定）；▁ 折叠 = 半透明悬浮球（⟡N 计数），可拖可再展开
//     （位移斜差判点击；展开承接角标拖移位）；行点击 = 打开 worker 执行子会话（载荷
//     workerSessionId——缺省回退父反查兜底 resolveWorkerSession），树零联动。
//   - 可见性随所属会话：装载条件（会话视图 + 主视图会话锚，ShellHost）+ 投影条目判读双门
//     ——非循环会话（投影键缺席/零条目）一律隐藏；切到 worker 子会话（主视图锚切换，其账本
//     行无本投影键）= 隐藏。
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  Button,
  IconChevronUpOutlineRegular,
  IconRightUpOutlineRegular,
  IconSparkleRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { SESSION_PROJECTION_KEYS } from '@dsh-forge/contracts'
import type { SnapshotSource, LedgerSessionRow, LedgerSessionsSnapshot } from '../sidebar/sidebar-model.js'
import './dispatch-events-panel.css'

// ─────────────────── 投影窄读（模型层） ───────────────────

/** 窗口内单条进度事件条目（投影载荷切片——forge-dispatch-events wire view entries 成员） */
export interface DispatchEventEntry {
  readonly sourceSlug: string
  readonly verb: string
  readonly status: 'running' | 'completed' | 'blocked' | 'interrupted'
  readonly taskKey?: string
  readonly taskTitle?: string
  readonly workerSessionId?: string
  readonly scenario?: string
  readonly note?: string
  readonly at: number
}

/** 投影整值窄形状（wire view {entries 窗口, total, pending?} 消费切片） */
export interface DispatchEventsView {
  readonly entries: readonly DispatchEventEntry[]
  readonly total: number
  /** 池级待执行计数（1.16——fold pending 字段透传；缺席 = 旧缓存不呈现该项） */
  readonly pending?: number
}

/** 条目守卫（渲染面防御——必填面收紧校验，可选面类型错即弃行；不猜不炸） */
export function isDispatchEventEntry(value: unknown): value is DispatchEventEntry {
  if (typeof value !== 'object' || value === null) return false
  const raw = value as Record<string, unknown>
  if (typeof raw['sourceSlug'] !== 'string' || raw['sourceSlug'] === '') return false
  if (typeof raw['verb'] !== 'string' || raw['verb'] === '') return false
  if (raw['status'] !== 'running' && raw['status'] !== 'completed' && raw['status'] !== 'blocked' && raw['status'] !== 'interrupted') {
    return false
  }
  if (typeof raw['at'] !== 'number' || !Number.isFinite(raw['at'])) return false
  for (const key of ['taskKey', 'taskTitle', 'workerSessionId', 'scenario', 'note'] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') return false
  }
  return true
}

/** 投影键（contracts SESSION_PROJECTION_KEYS 单源——mobile progress.ts 同源消费） */
export const DISPATCH_EVENTS_PROJECTION_KEY = SESSION_PROJECTION_KEYS.dispatchEvents

/** 账本行 projectionValues 按键窄读 forge-dispatch-events 视图（键缺席/形状漂移 = undefined；bug e56d8351——调用点传映射本体，函数内按键取值） */
export function dispatchEventsOf(values: unknown): DispatchEventsView | undefined {
  if (typeof values !== 'object' || values === null) return undefined
  const raw = values as Record<string, unknown>
  const view = raw[DISPATCH_EVENTS_PROJECTION_KEY]
  if (typeof view !== 'object' || view === null) return undefined
  const shape = view as Record<string, unknown>
  if (!Array.isArray(shape['entries']) || typeof shape['total'] !== 'number') return undefined
  if (shape['pending'] !== undefined && (typeof shape['pending'] !== 'number' || !Number.isFinite(shape['pending']))) return undefined
  const entries = shape['entries'].filter(isDispatchEventEntry)
  return {
    entries,
    total: shape['total'],
    ...(shape['pending'] !== undefined ? { pending: shape['pending'] as number } : {}),
  }
}

/** 池级快照场景码（pool/pending 事件只承载统计条 pending 计数——不进任务时间线） */
export const DISPATCH_POOL_PENDING_SCENARIO = 'pool/pending'

/** 场景 minor 中文章（分组/章语义并入备注行文案——1.16 行聚合口径；键 = minor 段） */
export const DISPATCH_EVENT_MINOR_LABELS: Readonly<Record<string, string>> = {
  'from-scratch': '从头执行',
  'resume-stopped': '接续执行',
  'resume-inflight': '接续在飞',
  new: '领取',
  spawned: '已启动执行',
  interrupted: '恢复中断',
  complete: '完成',
  'with-fix': '已带修复',
  'auto-fixed': '已自动处理',
  split: '已分割',
  'wait-external': '等待外部',
  'ask-user': '待你裁决',
  'spawn-failed': '启动失败',
  'worker-aborted': '执行中断',
  halt: '连续失败',
  'blocked-pool': '池阻塞',
  timeout: '超时',
  'finish-all': '全部完成',
  stopped: '已停止',
  'spawn-rate-limited': '启动限流',
  'worker-rate-limited': '执行限流',
  'abort-over-limit': '中止超限',
  'landing-rejected': '结算被拒',
}

/** 行标题（taskTitle 优先 → taskKey → sourceSlug 三级兜底） */
export function dispatchEventTitleOf(entry: DispatchEventEntry): string {
  return entry.taskTitle ?? entry.taskKey ?? entry.sourceSlug
}

/** 备注行文案（「状态 · 摘要」——状态词 + 场景章语义 + 叙述注记；全缺 = undefined 不渲染） */
export function dispatchEventNoteOf(entry: DispatchEventEntry): string | undefined {
  const parts: string[] = [DISPATCH_EVENT_STATUS_WORD[entry.status]]
  if (entry.scenario !== undefined && entry.scenario.includes('/')) {
    const minor = entry.scenario.slice(entry.scenario.indexOf('/') + 1)
    const label = DISPATCH_EVENT_MINOR_LABELS[minor]
    if (label !== undefined && label !== parts[0]) parts.push(label)
  }
  if (entry.note !== undefined) parts.push(entry.note)
  return parts.length > 1 ? parts.join(' · ') : undefined
}

/**
 * 标题次行的补充语义（场景章语义 + 叙述注记——状态词由状态徽标承载，不再并入本行；
 * 全缺 = undefined 不渲染）。
 */
export function dispatchEventDetailOf(entry: DispatchEventEntry): string | undefined {
  const parts: string[] = []
  if (entry.scenario !== undefined && entry.scenario.includes('/')) {
    const minor = entry.scenario.slice(entry.scenario.indexOf('/') + 1)
    const label = DISPATCH_EVENT_MINOR_LABELS[minor]
    if (label !== undefined) parts.push(label)
  }
  if (entry.note !== undefined) parts.push(entry.note)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

/** 绝对启动时间标签（LocalDatetime——本地时区 YYYY-MM-DD HH:mm；tabular 对齐由 CSS 承担） */
export function dispatchEventClockLabel(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 耗时标签（start→end 毫秒段——zh 紧凑两段档：秒/分/时/天） */
export function dispatchEventDurationLabel(startMs: number, endMs: number): string {
  const total = Math.max(0, Math.floor((endMs - startMs) / 1000))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${minutes}分`
  if (minutes > 0) return `${minutes}分${seconds}秒`
  return `${seconds}秒`
}

/** 聚合行（条目 + 启动时间——该任务键窗口内首事件时戳；循环级单行 = 自身时戳） */
export interface DispatchAggregatedRow {
  readonly entry: DispatchEventEntry
  readonly startAt: number
}

/**
 * 行聚合（1.16 用户裁决——任务键时间线口径）：每任务最新态一行（后写覆盖 = 最新态，
 * 组内时序排序），无任务键的循环级事件各占一行；池级 pending 快照（pool/pending）不进
 * 时间线——只承载统计条「待执行」计数。排序 = 执行中行置顶（组内最新优先——打开面板
 * 首屏即见在跑任务），其余行保持时序。同任务键首事件时戳随行携带（启动时间面）。
 */
export function aggregateDispatchRowItems(entries: readonly DispatchEventEntry[]): readonly DispatchAggregatedRow[] {
  const latest = new Map<string, { entry: DispatchEventEntry; startAt: number }>()
  const singles: DispatchAggregatedRow[] = []
  for (const entry of entries) {
    if (entry.scenario === DISPATCH_POOL_PENDING_SCENARIO) continue
    if (entry.taskKey === undefined) {
      singles.push({ entry, startAt: entry.at })
      continue
    }
    const held = latest.get(entry.taskKey)
    latest.set(entry.taskKey, { entry, startAt: held === undefined ? entry.at : Math.min(held.startAt, entry.at) })
  }
  return [...latest.values(), ...singles].sort((a, b) => {
    const rankA = a.entry.status === 'running' ? 0 : 1
    const rankB = b.entry.status === 'running' ? 0 : 1
    return rankA !== rankB ? rankA - rankB : a.entry.at - b.entry.at
  })
}

/** 行聚合（条目视图——detail 渲染面走 aggregateDispatchRowItems 携启动时间） */
export function aggregateDispatchRows(entries: readonly DispatchEventEntry[]): readonly DispatchEventEntry[] {
  return aggregateDispatchRowItems(entries).map((row) => row.entry)
}

/** 状态词（备注行首段 + 统计条口径——prototype「状态 · 摘要」同语） */
export const DISPATCH_EVENT_STATUS_WORD: Readonly<Record<DispatchEventEntry['status'], string>> = {
  running: '执行中',
  completed: '完成',
  blocked: '阻塞',
  interrupted: '已中断',
}

/** 轨状态点色档（prototype .frow 同款：执行中 accent 带光晕 / 完成 success / 阻塞 warn / 中断与待定 caption） */
export type DispatchEventDotTone = 'run' | 'done' | 'blk' | 'stop'

export function dispatchEventDotToneOf(status: DispatchEventEntry['status']): DispatchEventDotTone {
  switch (status) {
    case 'running':
      return 'run'
    case 'completed':
      return 'done'
    case 'blocked':
      return 'blk'
    case 'interrupted':
      return 'stop'
  }
}

/** 底部统计（任务键最新态归桶——循环级事件不计；返回 = [完成, 执行中, 阻塞, 已中断]） */
export interface DispatchEventStats {
  completed: number
  running: number
  blocked: number
  interrupted: number
}

export function dispatchEventStats(entries: readonly DispatchEventEntry[]): DispatchEventStats {
  const latest = new Map<string, DispatchEventEntry['status']>()
  for (const entry of entries) {
    if (entry.taskKey === undefined) continue
    latest.set(entry.taskKey, entry.status) // 时序追加——后写覆盖 = 最新态
  }
  const stats = { completed: 0, running: 0, blocked: 0, interrupted: 0 }
  for (const status of latest.values()) stats[status] += 1
  return stats
}

// ─────────────────── 几何（锚定/拖移/两态——DispatchPanel 判例同径） ───────────────────

/** 面板宽（fix bug 570fa4e2 刻度 480 承袭——长 title/摘要不换行挤压的宽度保障） */
export const DEP_WIDTH = 480
/** 折叠悬浮球定宽（CSS 同值单源——右上锚右对齐不随计数漂移） */
export const DEP_BADGE_WIDTH = 52
/** 默认折叠（悬浮球态不遮挡对话内容——fix bug 570fa4e2 判例承袭） */
export const DEP_DEFAULT_COLLAPSED = true
/** 对话列右缘间距 */
export const DEP_RIGHT_GAP = 16
/** 页签行下间距 */
export const DEP_TOP_GAP = 8
/** 拖移视口边距 */
export const DEP_DRAG_MARGIN = 4
/** 拖移纵向钳制预留高（顶出视口后头仍可再拖回） */
export const DEP_DRAG_KEEP_HEIGHT = 34
/** 悬浮球点击斜差（按下→抬起位移 ≤ 3px 判点击，超出判拖移） */
export const DEP_BADGE_CLICK_SLOP = 3

/** 面板几何（fixed 定位 left/top——锚定与拖移同一坐标系） */
export interface DispatchPanelGeometry {
  readonly left: number
  readonly top: number
}

/** 锚定输入（对话真盒锚 + 官方页签行几何——DOM 读取面窄形状） */
export interface DispatchAnchorRects {
  readonly convRight: number
  readonly convTop: number
  readonly tabsBottom: number | null
  readonly viewportWidth: number
}

/** 对话区真盒锚（官方 chat 台账滚动面——DispatchPanel 同锚） */
export const DEP_CONV_SELECTOR = '[data-conversation-scroll]'
/** 官方页签行选择器（blank 会话不渲染） */
export const DEP_TABS_SELECTOR = '[data-conversation-tabs]'

/** 锚定 DOM 窄面（生产 = document + window 适配；测试 = 假 dom 直喂） */
export interface DispatchAnchorDom {
  querySelector(selector: string): { getBoundingClientRect(): { readonly right: number; readonly top: number; readonly bottom: number } } | null
  readonly innerWidth: number
}

/** 锚定几何读取（DOM → 窄形状；真盒锚缺席 = null——面板不出场） */
export function dispatchAnchorRectsOf(dom: DispatchAnchorDom): DispatchAnchorRects | null {
  const conv = dom.querySelector(DEP_CONV_SELECTOR)
  if (conv === null) return null
  const convRect = conv.getBoundingClientRect()
  const tabs = dom.querySelector(DEP_TABS_SELECTOR)
  const tabsRect = tabs === null ? null : tabs.getBoundingClientRect()
  return {
    convRight: convRect.right,
    convTop: convRect.top,
    tabsBottom: tabsRect === null ? null : tabsRect.bottom,
    viewportWidth: dom.innerWidth,
  }
}

/** 默认锚定（纯几何）：top = 页签行下沿 + 8（缺席回退对话列顶 + 8）；右缘内收 16 */
export function dispatchEventsAnchor(input: DispatchAnchorRects): DispatchPanelGeometry {
  const top = Math.max(DEP_TOP_GAP, Math.round((input.tabsBottom ?? input.convTop) + DEP_TOP_GAP))
  const rightGap = Math.max(DEP_RIGHT_GAP, Math.round(input.viewportWidth - input.convRight + DEP_RIGHT_GAP))
  const left = Math.max(DEP_DRAG_MARGIN, Math.round(input.viewportWidth - rightGap - DEP_WIDTH))
  return { left, top }
}

/** 拖移几何（纯函数）：起点几何 + 指针位移 → 视口内钳制（拖后停自动锚定由壳承载） */
export function dispatchEventsDragPosition(
  start: DispatchPanelGeometry,
  startPoint: { readonly x: number; readonly y: number },
  point: { readonly x: number; readonly y: number },
  viewport: { readonly width: number; readonly height: number },
): DispatchPanelGeometry {
  const maxLeft = Math.max(DEP_DRAG_MARGIN, viewport.width - DEP_DRAG_MARGIN - DEP_WIDTH)
  const maxTop = Math.max(DEP_DRAG_MARGIN, viewport.height - DEP_DRAG_MARGIN - DEP_DRAG_KEEP_HEIGHT)
  const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
  return {
    left: clamp(start.left + (point.x - startPoint.x), DEP_DRAG_MARGIN, maxLeft),
    top: clamp(start.top + (point.y - startPoint.y), DEP_DRAG_MARGIN, maxTop),
  }
}

/** 悬浮球默认锚（纯函数）：面板右上角——初始位不遮挡消息内容 */
export function dispatchPanelBadgeAnchor(panelAnchor: DispatchPanelGeometry): DispatchPanelGeometry {
  return { left: panelAnchor.left + DEP_WIDTH - DEP_BADGE_WIDTH, top: panelAnchor.top }
}

/** 悬浮球几何（拖移位优先；未拖过 = 默认锚定位） */
export function dispatchPanelBadgeGeometry(
  badgeDrag: DispatchPanelGeometry | null,
  anchor: DispatchPanelGeometry,
): DispatchPanelGeometry {
  return badgeDrag ?? anchor
}

/** 展开承接：角标拖移位 > 面板既有拖移位 > 默认锚定位（几何连续不跳回） */
export function dispatchPanelExpandGeometry(
  badgeDrag: DispatchPanelGeometry | null,
  panelUserPos: DispatchPanelGeometry | null,
  anchor: DispatchPanelGeometry,
): { readonly dragged: boolean; readonly geometry: DispatchPanelGeometry } {
  if (badgeDrag !== null) return { dragged: true, geometry: badgeDrag }
  if (panelUserPos !== null) return { dragged: true, geometry: panelUserPos }
  return { dragged: false, geometry: anchor }
}

/** 悬浮球 pointer 位移判点击（斜差内 = 点击展开，超出 = 拖移抑制 click） */
export function dispatchBadgePointerIsClick(
  start: { readonly x: number; readonly y: number },
  point: { readonly x: number; readonly y: number },
): boolean {
  return (
    Math.abs(point.x - start.x) <= DEP_BADGE_CLICK_SLOP && Math.abs(point.y - start.y) <= DEP_BADGE_CLICK_SLOP
  )
}

// ─────────────────── 纯渲染体（全相位静态可测） ───────────────────

export interface DispatchEventsPanelBodyProps {
  /** 事件窗口条目（时序追加——尾部最新） */
  readonly entries: readonly DispatchEventEntry[]
  /** 本会话事件总数（窗口外历史仍计数——「窗口 + 总数」承载） */
  readonly total: number
  /** 池级待执行计数（1.16 用户裁决②——缺席 = 统计条不呈现「待执行」项） */
  readonly pending?: number
  /** 面板几何（锚定或拖移位——壳注入） */
  readonly geometry: DispatchPanelGeometry
  /** 折叠态（壳持有） */
  readonly collapsed: boolean
  /** 拖移后停自动锚定标记（e2e 锚） */
  readonly dragged: boolean
  /** 相对时间基准（注入——纯渲染可测） */
  readonly now: number
  /** 父反查兜底已解析表（taskKey → worker 子会话 id；'' = 已反查落空——行保持非交互；壳注入） */
  readonly resolvedWorker?: ReadonlyMap<string, string>
  readonly onCollapse: () => void
  readonly onExpand: () => void
  /** 行点击 = 打开 worker 执行子会话（装配接线；缺席 = 非交互呈现） */
  readonly onOpenWorker?: (childSessionId: string, taskKey?: string) => void
}

/** 行跳转锚解析（纯函数）：载荷 workerSessionId 直跳 → 父反查已解析表命中 → 落空 = undefined（非交互不空跳） */
export function dispatchRowSessionOf(
  entry: DispatchEventEntry,
  resolvedWorker: ReadonlyMap<string, string> | undefined,
): string | undefined {
  if (entry.workerSessionId !== undefined) return entry.workerSessionId
  if (entry.taskKey === undefined) return undefined
  const resolved = resolvedWorker?.get(entry.taskKey)
  return resolved === '' || resolved === undefined ? undefined : resolved
}

/**
 * 单行：双行任务轨形态（rail 竖线 + 状态点 + 首行 key/状态徽标 + 次行 title + 右侧绝对
 * 启动时间/耗时徽标；可跳转行带 jump 徽标）。耗时徽标：执行中 = now 起算的实时耗时；
 * 终态行 = startAt→最新事件时戳（单事件行时长不可辨 = 不呈现）。
 */
function DispatchEventRowView({
  row,
  now,
  resolvedWorker,
  onOpenWorker,
}: {
  row: DispatchAggregatedRow
  now: number
  resolvedWorker?: ReadonlyMap<string, string>
  onOpenWorker?: (childSessionId: string, taskKey?: string) => void
}): ReactNode {
  const { entry } = row
  const tone = dispatchEventDotToneOf(entry.status)
  const keyLabel = entry.taskKey ?? dispatchEventTitleOf(entry)
  const title = entry.taskTitle
  const detail = dispatchEventDetailOf(entry)
  // 耗时徽标只属任务行（循环级事件 = 瞬时进度无过程——一律不呈现）：执行中 = now 起算
  // 的实时耗时；终态行 = startAt→最新事件时戳（单事件行时长不可辨 = 不呈现）。
  const duration =
    entry.taskKey === undefined
      ? undefined
      : entry.status === 'running'
        ? dispatchEventDurationLabel(row.startAt, now)
        : entry.at - row.startAt >= 1000
          ? dispatchEventDurationLabel(row.startAt, entry.at)
          : undefined
  const session = dispatchRowSessionOf(entry, resolvedWorker)
  const open =
    onOpenWorker === undefined || session === undefined
      ? undefined
      : (): void => {
          onOpenWorker(session, entry.taskKey)
        }
  return (
    <Tooltip label={open !== undefined ? `打开 worker 子会话：${dispatchEventTitleOf(entry)}` : dispatchEventTitleOf(entry)} portal>
      <div
        className={`dswf-dep-row dswf-dep-${tone}`}
        data-dswf-dep-row={session}
        data-dswf-dep-status={entry.status}
        {...(open !== undefined ? { role: 'button', tabIndex: 0, onClick: open } : {})}
        onKeyDown={
          open === undefined
            ? undefined
            : (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  open()
                }
              }
        }
      >
        <span className="dswf-dep-rail" aria-hidden="true">
          <i />
        </span>
        <span className="dswf-dep-row-t">
          <span className="dswf-dep-row-head">
            <span className="dswf-dep-row-key">{keyLabel}</span>
            <span className={`dswf-dep-status dswf-dep-status-${tone}`}>{DISPATCH_EVENT_STATUS_WORD[entry.status]}</span>
          </span>
          {title !== undefined ? (
            <span className="dswf-dep-row-title">
              {title}
              {detail !== undefined ? ` · ${detail}` : ''}
            </span>
          ) : null}
        </span>
        <span className="dswf-dep-row-side">
          <span className="dswf-dep-row-time">{dispatchEventClockLabel(row.startAt)}</span>
          {duration !== undefined ? <span className="dswf-dep-row-dur">{duration}</span> : null}
          {open !== undefined ? (
            <span className="dswf-dep-row-jump" data-dswf-dep-jump="" aria-hidden="true">
              <IconRightUpOutlineRegular size={11} />
            </span>
          ) : null}
        </span>
      </div>
    </Tooltip>
  )
}

/** 悬浮进度流纯渲染（展开面板 ↔ 半透明悬浮球双形态） */
export function DispatchEventsPanelBody({
  entries,
  pending,
  geometry,
  collapsed,
  dragged,
  now,
  resolvedWorker,
  onCollapse,
  onExpand,
  onOpenWorker,
}: DispatchEventsPanelBodyProps): ReactNode {
  if (collapsed) {
    return (
      <Tooltip label={`展开任务进度面板（${entries.length}）`} portal>
        <button
          type="button"
          className="dswf-dep-badge"
          data-dswf-dep-badge=""
          style={{ left: geometry.left, top: geometry.top }}
          aria-label="展开任务进度面板"
          onClick={onExpand}
        >
          <IconSparkleRegular size={11} />
          <span data-dswf-dep-badge-count="">{entries.length}</span>
        </button>
      </Tooltip>
    )
  }
  const rows = useMemo(() => aggregateDispatchRowItems(entries), [entries])
  const stats = dispatchEventStats(entries)
  return (
    <div
      className="dswf-dep"
      data-dswf-dep=""
      {...(dragged ? { 'data-dswf-dep-dragged': '' } : {})}
      style={{ left: geometry.left, top: geometry.top }}
      role="complementary"
      aria-label="任务进度"
    >
      <div className="dswf-dep-head" data-dswf-dep-head="">
        <span className="dswf-dep-dot" aria-hidden="true" />
        <span className="dswf-dep-title">任务进度</span>
        <span className="dswf-dep-live">live · 不经模型</span>
        <Tooltip label="折叠" portal>
          <Button
            variant="ghost"
            size="sm"
            className="dswf-dep-btn"
            data-dswf-dep-collapse=""
            aria-label="折叠任务进度面板"
            onClick={onCollapse}
          >
            <IconChevronUpOutlineRegular size={12} />
          </Button>
        </Tooltip>
      </div>
      <div className="dswf-dep-list" data-dswf-dep-list="">
        {rows.map((row, i) => (
          <DispatchEventRowView
            key={`${row.entry.at}-${row.entry.taskKey ?? row.entry.verb}-${i}`}
            row={row}
            now={now}
            resolvedWorker={resolvedWorker}
            onOpenWorker={onOpenWorker}
          />
        ))}
      </div>
      <div className="dswf-dep-stat" data-dswf-dep-stat="">
        <span>完成 <b>{stats.completed}</b></span>
        <span>执行中 <b>{stats.running}</b></span>
        <span>阻塞 <b>{stats.blocked}</b></span>
        {pending !== undefined ? (
          <span>待执行 <b>{pending}</b></span>
        ) : null}
        <span>已中断 <b>{stats.interrupted}</b></span>
      </div>
    </div>
  )
}

// ─────────────────── 装载壳（账本窄读 + 锚定 + 拖移 + 两态） ───────────────────

/** 悬浮面板 props（ShellHost 装配递达——账本快照源 + 两动作面） */
export interface DispatchEventsPanelProps {
  /** 当前主视图会话（ShellHost 主视图会话锚——可见性随所属会话的会话身份） */
  readonly sessionId: string
  /** dsh 会话账本快照源（ctx.sessions.list——projectionValues 窄读 + subscribe 实时刷新；缺席 = 不出场） */
  readonly sessions?: SnapshotSource<LedgerSessionsSnapshot>
  /** 行点击 = 打开 worker 执行子会话（插件 inject face；缺席 = 非交互） */
  readonly onOpenWorkerSession?: (childSessionId: string, parentSessionId?: string) => void
  /**
   * worker 父反查兜底（1.16 用户裁决①——载荷 workerSessionId 缺席行：账本子行 parentId +
   * taskKey 反查定位子会话；resolve 落空 = 行保持非交互不空跳；缺席 = 仅直跳径）
   */
  readonly resolveWorkerSession?: (parentSessionId: string, taskKey?: string) => Promise<string | undefined>
}

/** 账本缺席快照（undefined 源的稳定 SSR 参照——useSyncExternalStore 快照稳定性纪律） */
const EMPTY_SNAPSHOT: LedgerSessionsSnapshot = { ids: [], byId: {}, phase: 'pending' }

/** 拖移会话快照（起点指针 + 起点几何 + 拖移对象） */
interface DragSession {
  readonly x: number
  readonly y: number
  readonly start: DispatchPanelGeometry
  readonly kind: 'head' | 'badge'
}

/**
 * 锚定效应：真盒锚在场即算锚定几何；ResizeObserver + 视口 resize + DOM 变更重算 =
 * 自动左移（DispatchPanel 判例同径）；挂载竞态 = rAF 有限重试。锚缺席 = null 不出场。
 */
function useDepAnchor(active: boolean): DispatchPanelGeometry | null {
  const [anchor, setAnchor] = useState<DispatchPanelGeometry | null>(null)
  useEffect(() => {
    if (!active) return
    let disposed = false
    let observer: ResizeObserver | null = null
    let observed: Element | null = null
    let mo: MutationObserver | null = null
    let raf = 0
    let attempts = 0
    const dom = (): DispatchAnchorDom => ({
      querySelector: (selector) => document.querySelector(selector),
      innerWidth: window.innerWidth,
    })
    const recompute = (): void => {
      if (disposed) return
      const rects = dispatchAnchorRectsOf(dom())
      if (rects === null) return
      setAnchor((prev) => {
        const next = dispatchEventsAnchor(rects)
        return prev !== null && prev.left === next.left && prev.top === next.top ? prev : next
      })
      const conv = document.querySelector(DEP_CONV_SELECTOR)
      if (conv !== null) {
        if (observer === null) observer = new ResizeObserver(() => recompute())
        if (observed !== conv) {
          observer.disconnect()
          observer.observe(conv)
          observed = conv
        }
      }
    }
    mo = new MutationObserver(() => {
      recompute()
    })
    mo.observe(document.documentElement, { childList: true, subtree: true })
    const retry = (): void => {
      if (disposed) return
      recompute()
      if (observed === null && attempts < 120) {
        attempts += 1
        raf = window.requestAnimationFrame(retry)
      }
    }
    retry()
    window.addEventListener('resize', recompute)
    return () => {
      disposed = true
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', recompute)
      mo?.disconnect()
      observer?.disconnect()
    }
  }, [active])
  return anchor
}

/**
 * 悬浮进度流装载壳：账本行 projectionValues['forge-dispatch-events'] 窄读（store subscribe
 * = onChanged 实时刷新）→ 条目判读（零条目 = 非循环会话隐藏——可见性随所属会话）→ 纯渲染
 * 体；几何/拖移/两态 = DispatchPanel 判例同径（默认折叠 = 半透明悬浮球；折叠/拖移为会话内
 * 本地态——装载点 key=sessionId 切会话整体重置）。
 */
export function DispatchEventsPanel(props: DispatchEventsPanelProps): ReactNode {
  const sessions = props.sessions
  // 账本窄读缝（useSyncExternalStore 直连——SC2 零缓存零副本）：subscribe = onChanged 实时
  // 刷新（官方投影变更驱动快照更新）；源缺席（单测/SSR 面）= 稳定空快照（不出场）。
  const subscribe = useCallback(
    (onChange: () => void): (() => void) => (sessions === undefined ? () => {} : sessions.subscribe(onChange)),
    [sessions],
  )
  const read = useCallback(
    (): LedgerSessionsSnapshot => (sessions === undefined ? EMPTY_SNAPSHOT : sessions.getSnapshot()),
    [sessions],
  )
  const snap = useSyncExternalStore(subscribe, read, read)
  const row: LedgerSessionRow | undefined = snap.byId[props.sessionId]
  // 窄读记忆化（projectionValues 引用恒定 = view/entries 身份稳定——反查效应依赖不抖动）
  const view = useMemo(() => dispatchEventsOf(row?.projectionValues), [row?.projectionValues])
  const entries = useMemo(() => view?.entries ?? [], [view])
  const active = entries.length > 0
  const anchor = useDepAnchor(active)
  const [collapsed, setCollapsed] = useState(DEP_DEFAULT_COLLAPSED)
  const [dragged, setDragged] = useState(false)
  const [dragPos, setDragPos] = useState<DispatchPanelGeometry | null>(null)
  const [badgePos, setBadgePos] = useState<DispatchPanelGeometry | null>(null)
  // 父反查兜底已解析表（taskKey → 子会话 id；'' = 已反查落空——不再重查，行保持非交互）
  const [resolvedWorker, setResolvedWorker] = useState<ReadonlyMap<string, string>>(new Map())
  const dragRef = useRef<DragSession | null>(null)
  const badgeMovedRef = useRef(false)
  // 反查效应（1.16 用户裁决①）：载荷 workerSessionId 缺席且带 taskKey 的行逐个父反查；
  // resolver 缺席 / 反查落空（undefined）= 记 '' 不重查——行保持非交互不空跳。
  const resolver = props.resolveWorkerSession
  useEffect(() => {
    if (resolver === undefined) return
    let cancelled = false
    for (const entry of entries) {
      if (entry.workerSessionId !== undefined || entry.taskKey === undefined) continue
      if (resolvedWorker.has(entry.taskKey)) continue
      void resolver(props.sessionId, entry.taskKey)
        .then((childId) => {
          if (cancelled) return
          setResolvedWorker((prev) => (prev.has(entry.taskKey as string) ? prev : new Map(prev).set(entry.taskKey as string, childId ?? '')))
        })
        .catch(() => {
          if (cancelled) return
          setResolvedWorker((prev) => (prev.has(entry.taskKey as string) ? prev : new Map(prev).set(entry.taskKey as string, '')))
        })
    }
    return () => {
      cancelled = true
    }
  }, [entries, resolver, props.sessionId, resolvedWorker])
  if (!active || anchor === null || sessions === undefined) return null
  const geometry = dragged && dragPos !== null ? dragPos : anchor

  // 行点击 = 打开 worker 执行子会话（载荷 workerSessionId 直达；面板会话即派发父——
  // 显式父地址径，树零联动）
  const handleOpenWorker =
    props.onOpenWorkerSession === undefined
      ? undefined
      : (childSessionId: string, _taskKey?: string): void => {
          props.onOpenWorkerSession?.(childSessionId, props.sessionId)
        }

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement
    const badgeHit = target.closest('[data-dswf-dep-badge]')
    if (badgeHit !== null) {
      ;(badgeHit as HTMLElement).setPointerCapture(event.pointerId)
      badgeMovedRef.current = false
      dragRef.current = {
        x: event.clientX,
        y: event.clientY,
        start: dispatchPanelBadgeGeometry(badgePos, dispatchPanelBadgeAnchor(anchor)),
        kind: 'badge',
      }
      return
    }
    if (target.closest('button') !== null) return // 折叠钮命中不劫持
    if (target.closest('[data-dswf-dep-head]') === null) return // 仅头可拖（行点击归行）
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, start: geometry, kind: 'head' }
  }
  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const drag = dragRef.current
    if (drag === null || (event.buttons & 1) === 0) return
    const point = { x: event.clientX, y: event.clientY }
    const next = dispatchEventsDragPosition(drag.start, drag, point, { width: window.innerWidth, height: window.innerHeight })
    if (drag.kind === 'badge') {
      if (!dispatchBadgePointerIsClick(drag, point)) {
        badgeMovedRef.current = true
        setBadgePos(next)
      }
      return
    }
    setDragged(true)
    setDragPos(next)
  }
  const handlePointerEnd = (): void => {
    dragRef.current = null
  }
  const handleExpand = (): void => {
    if (badgeMovedRef.current) {
      badgeMovedRef.current = false
      return
    }
    const expand = dispatchPanelExpandGeometry(badgePos, dragged && dragPos !== null ? dragPos : null, anchor)
    setDragged(expand.dragged)
    setDragPos(expand.dragged ? expand.geometry : null)
    setCollapsed(false)
  }

  return (
    <div
      className="dswf-dep-dragwrap"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <DispatchEventsPanelBody
        entries={entries}
        total={view?.total ?? entries.length}
        pending={view?.pending}
        geometry={collapsed ? dispatchPanelBadgeGeometry(badgePos, dispatchPanelBadgeAnchor(anchor)) : geometry}
        collapsed={collapsed}
        dragged={dragged}
        now={Date.now()}
        resolvedWorker={resolvedWorker}
        onCollapse={() => {
          // 收起 = 悬浮球回对话框右上角初始位（丢弃角标拖移位——fix bug 570fa4e2 承袭）
          setCollapsed(true)
          setBadgePos(null)
        }}
        onExpand={handleExpand}
        onOpenWorker={handleOpenWorker}
      />
    </div>
  )
}
