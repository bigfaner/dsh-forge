// 悬浮进度流面板（定位：业务——loop-event-delivery 1.8：派发任务悬浮面板[DispatchPanel]
// 的继任面，替代不并存）。提案 §悬浮进度流面板 + 验收总纲：UI 对照 prototype.html（同目录）
// 信息结构、令牌对齐 DESIGN.md，官方组件组合（Button/Tag/Tooltip/图标件——零自绘控件）。
// 数据纪律（零新增读取 API）：
//   - 唯一通道 = 账本行 projectionValues['forge-dispatch-events'] 窄读（1.6 投影键 fold
//     'forge/progress' 事件——官方 session-projection registry 产物，wire view =
//     {entries 最近 200 条窗口, total}）；官方 sessions.list store subscribe = onChanged
//     实时刷新（useSyncExternalStore 直连——SC2 零缓存零副本，sidebar 同缝）。
//   - 行状态章 = 载荷 status 四值派生（running=执行中/completed=已完成/blocked=阻塞/
//     interrupted=已中断——⑰ stopped 事件载 inFlightTaskKey 即中断态行，语义与原任务面板
//     中断章对齐）；条目按场景码 major 分组渲染、minor 为组内细分行（scenario 缺席旧载荷
//     = verb 回退映射）。
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
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  Button,
  IconChevronUpOutlineRegular,
  IconSparkleRegular,
  Tag,
  Tooltip,
  type TagTone,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { timeLabelZh } from '../../components/index.js'
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

/** 投影整值窄形状（wire view {entries 窗口, total} 消费切片） */
export interface DispatchEventsView {
  readonly entries: readonly DispatchEventEntry[]
  readonly total: number
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

/** 账本行 projectionValues['forge-dispatch-events'] 窄读（键缺席/形状漂移 = undefined） */
export function dispatchEventsOf(values: unknown): DispatchEventsView | undefined {
  if (typeof values !== 'object' || values === null) return undefined
  const raw = values as Record<string, unknown>
  if (!Array.isArray(raw['entries']) || typeof raw['total'] !== 'number') return undefined
  const entries = raw['entries'].filter(isDispatchEventEntry)
  return { entries, total: raw['total'] }
}

/** 场景码 major → 面板组中文章（事件清单场景族——值域封闭七族） */
export const DISPATCH_EVENT_MAJOR_LABELS: Readonly<Record<string, string>> = {
  startup: '启动',
  claim: '领取',
  task: '任务',
  blocked: '阻塞',
  retry: '重试',
  loop: '循环',
  suspend: '挂起',
}

/** scenario 缺席（旧载荷兼容）的 verb → major 回退映射 */
const VERB_MAJOR_FALLBACK: Readonly<Record<string, string>> = {
  startup: 'startup',
  claim: 'claim',
  'claim-resume': 'claim',
  settle: 'task',
  stop: 'loop',
  suspend: 'suspend',
  retry: 'retry',
  halt: 'loop',
  timeout: 'loop',
  'finish-all': 'loop',
  loop: 'loop',
}

/** 场景码 major 解析（scenario 前缀单源；缺席 = verb 回退；未知 = loop 兜底不炸） */
export function dispatchEventMajorOf(entry: DispatchEventEntry): string {
  const scenario = entry.scenario
  if (scenario !== undefined && scenario.includes('/')) return scenario.slice(0, scenario.indexOf('/'))
  return VERB_MAJOR_FALLBACK[entry.verb] ?? 'loop'
}

/** 行标题（taskTitle 优先 → taskKey → sourceSlug 三级兜底） */
export function dispatchEventTitleOf(entry: DispatchEventEntry): string {
  return entry.taskTitle ?? entry.taskKey ?? entry.sourceSlug
}

/** 行副行（note 优先 → scenario minor → 无） */
function dispatchEventNoteOf(entry: DispatchEventEntry): string | undefined {
  if (entry.note !== undefined) return entry.note
  if (entry.scenario !== undefined && entry.scenario.includes('/')) {
    return entry.scenario.slice(entry.scenario.indexOf('/') + 1)
  }
  return undefined
}

/** 场景分组（major 首次出现序保序——组内条目时序；未知 major 落 loop 兜底） */
export interface DispatchEventGroup {
  readonly major: string
  readonly label: string
  readonly entries: readonly DispatchEventEntry[]
}

export function groupDispatchEvents(entries: readonly DispatchEventEntry[]): readonly DispatchEventGroup[] {
  const groups: DispatchEventGroup[] = []
  const index = new Map<string, DispatchEventEntry[]>()
  for (const entry of entries) {
    const major = DISPATCH_EVENT_MAJOR_LABELS[dispatchEventMajorOf(entry)] !== undefined ? dispatchEventMajorOf(entry) : 'loop'
    let bucket = index.get(major)
    if (bucket === undefined) {
      bucket = []
      index.set(major, bucket)
      groups.push({ major, label: DISPATCH_EVENT_MAJOR_LABELS[major] ?? major, entries: bucket })
    }
    bucket.push(entry)
  }
  return groups
}

/** 状态章（载荷 status 四值单源——官方 Tag tone + 语义中文） */
export const DISPATCH_EVENT_STATUS_BADGE: Readonly<
  Record<DispatchEventEntry['status'], { readonly label: string; readonly tone: TagTone }>
> = {
  running: { label: '执行中', tone: 'info' },
  completed: { label: '已完成', tone: 'success' },
  blocked: { label: '阻塞', tone: 'warning' },
  interrupted: { label: '已中断', tone: 'danger' },
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
  /** 面板标题 slug（事件源任务链 slug——载荷 sourceSlug 单值判读归壳） */
  readonly sourceSlug: string
  /** 面板几何（锚定或拖移位——壳注入） */
  readonly geometry: DispatchPanelGeometry
  /** 折叠态（壳持有） */
  readonly collapsed: boolean
  /** 拖移后停自动锚定标记（e2e 锚） */
  readonly dragged: boolean
  /** 相对时间基准（注入——纯渲染可测） */
  readonly now: number
  readonly onCollapse: () => void
  readonly onExpand: () => void
  /** 行点击 = 打开 worker 执行子会话（装配接线；缺席 = 非交互呈现） */
  readonly onOpenWorker?: (childSessionId: string, taskKey?: string) => void
}

/** 单行：rail 状态点 + 标题/副行 + 相对时间 + 状态章（workerSessionId 在场 = 可点击行） */
function DispatchEventRowView({
  entry,
  now,
  onOpenWorker,
}: {
  entry: DispatchEventEntry
  now: number
  onOpenWorker?: (childSessionId: string, taskKey?: string) => void
}): ReactNode {
  const badge = DISPATCH_EVENT_STATUS_BADGE[entry.status]
  const note = dispatchEventNoteOf(entry)
  const open =
    onOpenWorker === undefined || entry.workerSessionId === undefined
      ? undefined
      : (): void => {
          onOpenWorker(entry.workerSessionId as string, entry.taskKey)
        }
  return (
    <Tooltip label={open !== undefined ? `打开 worker 子会话：${dispatchEventTitleOf(entry)}` : dispatchEventTitleOf(entry)} portal>
      <div
        className="dswf-dep-row"
        data-dswf-dep-row={entry.workerSessionId}
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
        <span className="dswf-dep-row-main">
          <span className="dswf-dep-row-title">{dispatchEventTitleOf(entry)}</span>
          {note !== undefined ? <span className="dswf-dep-row-note">{note}</span> : null}
        </span>
        <span className="dswf-dep-row-time">{timeLabelZh(entry.at, now)}</span>
        <Tag tone={badge.tone} className="dswf-dep-row-tag">
          {badge.label}
        </Tag>
      </div>
    </Tooltip>
  )
}

/** 悬浮进度流纯渲染（展开面板 ↔ 半透明悬浮球双形态） */
export function DispatchEventsPanelBody({
  entries,
  total,
  sourceSlug,
  geometry,
  collapsed,
  dragged,
  now,
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
  const groups = groupDispatchEvents(entries)
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
        <span className="dswf-dep-title">任务进度 · {sourceSlug}</span>
        <span className="dswf-dep-live">live · {total} 条</span>
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
        {groups.map((group) => (
          <section key={group.major} className="dswf-dep-group" data-dswf-dep-group={group.major}>
            <div className="dswf-dep-group-head">
              <span className="dswf-dep-group-label">{group.label}</span>
              <span className="dswf-dep-group-count">{group.entries.length}</span>
            </div>
            {group.entries.map((entry, i) => (
              <DispatchEventRowView key={`${entry.at}-${entry.taskKey ?? entry.verb}-${i}`} entry={entry} now={now} onOpenWorker={onOpenWorker} />
            ))}
          </section>
        ))}
      </div>
      <div className="dswf-dep-stat" data-dswf-dep-stat="">
        <span>完成 <b>{stats.completed}</b></span>
        <span>执行中 <b>{stats.running}</b></span>
        <span>阻塞 <b>{stats.blocked}</b></span>
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
  const view = dispatchEventsOf(row?.projectionValues)
  const entries = view?.entries ?? []
  const active = entries.length > 0
  const sourceSlug = entries[0]?.sourceSlug ?? ''
  const anchor = useDepAnchor(active)
  const [collapsed, setCollapsed] = useState(DEP_DEFAULT_COLLAPSED)
  const [dragged, setDragged] = useState(false)
  const [dragPos, setDragPos] = useState<DispatchPanelGeometry | null>(null)
  const [badgePos, setBadgePos] = useState<DispatchPanelGeometry | null>(null)
  const dragRef = useRef<DragSession | null>(null)
  const badgeMovedRef = useRef(false)
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
        sourceSlug={sourceSlug}
        geometry={collapsed ? dispatchPanelBadgeGeometry(badgePos, dispatchPanelBadgeAnchor(anchor)) : geometry}
        collapsed={collapsed}
        dragged={dragged}
        now={Date.now()}
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
