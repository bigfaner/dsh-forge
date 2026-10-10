// 派发任务悬浮面板（定位：业务装配——m3.1 D5/D6：会话头挂接 pill 自 header.actions 槽位
// 退役后的「本会话派发任务」监视面，纠正版原型 #m31-dp/E 区）。
// 数据纪律（4.2 Integration #2 装载面原样搬迁——useSessionTaskPills 自 ForgeSessionTaskPills
// 迁入，语义零变化）：
//   - 唯一通道 = forge:tasks/sessionLinks（links ∪ records.session_id 双源分型卡）；写推送
//     （onForgeTasksChanged → subscribeTasksChanged 同项目）静默重取——≤500ms 归订阅层契约；
//   - 呈现面仅取 link 源（用户裁决 #2：悬浮面板 = 派发视角；执行源归 worker 会话与任务
//     详情时间线——record 卡过滤不入行集）；
//   - 单库解析归 ShellHost 装配（projectId 锚定 + 主视图会话——本组件零跨库假设）。
// 落位（D6 开工内定 + D33 残差①收口）：shell overlay——ShellHost 常驻树挂载（pointer-events/
// 层序沿 TaskDrawer 弹窗先例：fixed + pointer-events:auto + dockkit 浮层层级），几何 = 对话区
// 真盒官方锚（[data-conversation-scroll] 滚动面右缘 + 官方页签行 [data-conversation-tabs] 下沿
// ——dock 展开时对话列收窄，ResizeObserver + 视口 resize 重算即自动左移；不悬浮进 dockkit。
// 锚源退役面：官方 SlotOutlet 洞包裹层 display:contents（ANCHOR_STYLE，pin ⑮-4）→
// 槽宿主 rect 恒零 → 面板钉视口左缘——main.conversation 槽宿主锚零盒断锚退役）。
// 交互（裁决 #1/#12 + D34）：头可拖（拖后停自动锚定——data-dswf-dp-dragged）；▁ 折叠
// ⟡N 角标可拖可再展开（D34 ②：角标 pointer 拖移 + 视口钳制同纪律，拖后停自动锚定；展开
// 面板承接角标拖移位——几何连续；位移斜差判点击——拖移不牺牲展开语义）；行点击 = 任务
// 详情弹窗就地打开（桥 openTaskDrawer——零会话跳转/零 dock 强开）；行尾 ⟞ = 打开 worker
// 执行子会话（taskDetail 挂接面解析 record 源非派发会话 + 官方
// uiWorkspace.openSession 地址形态——树零联动：worker 子会话不进左栏两级树）。
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { TASK_STATUS_LABELS, type SessionLinksQuery, type SessionTaskLinkCard } from '@dsh-forge/contracts'
import { taskStatusTagTone } from '../overview/task-tab/task-tab-model.js'
import {
  Button,
  IconChevronUpOutlineRegular,
  IconRightUpOutlineRegular,
  IconSparkleRegular,
  StateDot,
  Tag,
  Tooltip,
  type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  preloadRpcClientFactory,
  subscribeTasksChanged,
  type ForgeRpcClient,
  type RpcClientFactory,
} from '../../rpc/index.js'
import './dispatch-panel.css'

// ─────────────────── 数据装载（4.2 Integration #2 迁入面——语义零变化） ───────────────────

/**
 * 挂接双源卡 → 行项富化（纯函数）：featureSlug = card.slug（slug ≡ feature slug 不变量
 * ——tech-design Interface 1 身份解析约定 + Cross-Layer Data Map；零额外 RPC）。
 */
export function sessionPillItems(cards: readonly SessionTaskLinkCard[]): readonly SessionTaskPillItem[] {
  return cards.map((card) => ({ ...card, featureSlug: card.slug }))
}

/** 单会话挂接行项（SessionTaskLinkCard + 导航富化——装载层富化零额外 RPC） */
export interface SessionTaskPillItem extends SessionTaskLinkCard {
  /** 所属 feature slug（slug ≡ feature slug 不变量映射） */
  readonly featureSlug: string
}

/** 拉取结果（ok/error 归一——永不 reject；错误 = 装饰面静默降级不炸对话区） */
export type SessionPillsFetch =
  | { readonly ok: true; readonly cards: readonly SessionTaskLinkCard[] }
  | { readonly ok: false; readonly error: string }

/** 单次拉取（纯异步面）：唯一通道 = forge:tasks/sessionLinks（单库查询） */
export async function fetchSessionTaskPills(
  client: ForgeRpcClient,
  q: SessionLinksQuery,
): Promise<SessionPillsFetch> {
  try {
    return { ok: true, cards: await client.tasks.sessionLinks(q) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** 装载相位（idle = 查询键缺席不拉取——静态空态；error 仅首错在场，重取失败保旧） */
export type SessionPillsPhase = 'idle' | 'loading' | 'ready' | 'error'

/** 装载状态（hook 输出——面板行集直喂形状） */
export interface SessionPillsLoadState {
  readonly phase: SessionPillsPhase
  readonly pills: readonly SessionTaskPillItem[]
}

/** 初始态 */
export function initialSessionPillsState(): SessionPillsLoadState {
  return { phase: 'idle', pills: [] }
}

/**
 * 装载判定（纯函数）：单库解析键齐备（projectId + sessionId）→ 拉取；键缺席（无项目锚/
 * 无会话——SSR 首帧、账本快照未达）→ idle 静态空态不拉取。
 */
export function sessionPillsLoadPlan(input: {
  readonly projectId: string | null
  readonly sessionId: string | null
}): 'fetch' | 'idle' {
  if (input.projectId === null || input.sessionId === null) return 'idle'
  return 'fetch'
}

/** 装载步进产物（effect 仅落点，逻辑归纯/异步面） */
export type SessionPillsOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly pills: readonly SessionTaskPillItem[] }
  | { readonly kind: 'error'; readonly error: string }

/**
 * 落点应用（纯函数）：idle 复位；loading 保旧（重取不清场——装饰面不闪烁）；ready 更新；
 * error 首错清空（空呈现）/有旧保旧（缓存先行——重取失败不掏空）。
 */
export function applySessionPillsOutcome(prev: SessionPillsLoadState, outcome: SessionPillsOutcome): SessionPillsLoadState {
  switch (outcome.kind) {
    case 'idle':
      return initialSessionPillsState()
    case 'loading':
      return { ...prev, phase: 'loading' }
    case 'ready':
      return { phase: 'ready', pills: outcome.pills }
    case 'error':
      return prev.pills.length > 0 ? { ...prev, phase: 'ready' } : { phase: 'error', pills: [] }
  }
}

/** 装载任务（纯异步面）：plan 判定 + fetch + 富化——永不 reject */
export async function runSessionPillsLoad(
  input: { readonly projectId: string | null; readonly sessionId: string | null },
  makeClient: RpcClientFactory,
): Promise<readonly SessionPillsOutcome[]> {
  const plan = sessionPillsLoadPlan(input)
  if (plan === 'idle') return [{ kind: 'idle' }]
  const out = await fetchSessionTaskPills(makeClient(), {
    projectId: input.projectId as string,
    sessionId: input.sessionId as string,
  })
  return [
    { kind: 'loading' },
    out.ok ? { kind: 'ready', pills: sessionPillItems(out.cards) } : { kind: 'error', error: out.error },
  ]
}

/**
 * 挂接行数据装载 hook（迁入面——键变重拉 + 序号守卫（快速会话切换不串台）+
 * subscribeTasksChanged 同项目事件 → 静默重取（写后单次重取见新值；50ms 合并/≤500ms
 * 延迟归订阅层契约，events 断言面）。
 */
export function useSessionTaskPills(
  input: { readonly projectId: string | null; readonly sessionId: string | null },
  makeClient: RpcClientFactory = preloadRpcClientFactory,
): readonly [SessionPillsLoadState] {
  const [state, setState] = useState<SessionPillsLoadState>(initialSessionPillsState)
  const [nonce, setNonce] = useState(0)
  const seqRef = useRef(0)

  useEffect(() => {
    const seq = ++seqRef.current
    let alive = true
    void runSessionPillsLoad(input, makeClient).then((steps) => {
      if (!alive) return
      for (const step of steps) {
        if (seq !== seqRef.current) return // 键已变更：本批步进作废（防串台）
        setState((prev) => applySessionPillsOutcome(prev, step))
      }
    })
    return () => {
      alive = false
    }
  }, [input.projectId, input.sessionId, nonce, makeClient])

  // 写推送事件（forge:events/tasks-changed）→ 同项目静默重取（刷新锚）
  useEffect(() => {
    if (input.projectId === null) return () => {}
    const projectId = input.projectId
    return subscribeTasksChanged((payload) => {
      if (payload.projectId === projectId) setNonce((n) => n + 1)
    })
  }, [input.projectId, input.sessionId])

  return [state] as const
}

// ─────────────────── 纯模型（行集 / 几何 / worker 解析） ───────────────────

/** 七态 → 官方 StateDot 语义（overview STATUS_DOT_STATE 同口径——铁律③ 本域副本，口径互指） */
export const SESSION_PILL_STATUS_DOT: Readonly<Record<SessionTaskLinkCard['taskStatus'], StateDotState>> = {
  pending: 'idle',
  in_progress: 'ongoing',
  completed: 'done',
  blocked: 'error',
  suspended: 'warning',
  skipped: 'idle',
  rejected: 'error',
}

/** 面板宽（dsw-raw D34 裁决刻度 400——原型 #m31-dp 324 加宽；介于原型与任务详情简要档
 *  440 之间。锚定 left/拖移钳制 maxLeft 均吃本常量——新刻度单源自适应） */
export const DP_WIDTH = 400
/** 对话列右缘间距（dsw-raw 原型 right 16 刻度） */
export const DP_RIGHT_GAP = 16
/** 工具栏下间距（dsw-raw 原型 tabs 下 8 刻度） */
export const DP_TOP_GAP = 8
/** 拖移视口边距（dsw-raw 原型拖移钳制刻度） */
export const DP_DRAG_MARGIN = 4
/** 拖移纵向钳制预留高（dsw-raw 原型头行高刻度——顶出视口后头仍可再拖回） */
export const DP_DRAG_KEEP_HEIGHT = 34

/** 面板几何（fixed 定位 left/top——锚定与拖移同一坐标系） */
export interface DispatchPanelGeometry {
  readonly left: number
  readonly top: number
}

/**
 * 行序比较（D34 ③ 纯函数）：in_progress 置顶；组内按领取时间倒序（ISO TEXT 字典序 ≡ 时序
 * ——最新领取在上、最早领取在最下方）；claimedAt 缺席（旧数据/record 源混入）组内沉底并
 * 回退自然键稳定序（slug/localId——与 SQL 基序同口径，不炸不跳；同键稳定排序保序）。
 */
function compareDispatchRows(a: SessionTaskPillItem, b: SessionTaskPillItem): number {
  const active = (item: SessionTaskPillItem): number => (item.taskStatus === 'in_progress' ? 0 : 1)
  if (active(a) !== active(b)) return active(a) - active(b)
  if (a.claimedAt !== b.claimedAt) {
    if (a.claimedAt === undefined) return 1 // 缺席 = 最旧沉底
    if (b.claimedAt === undefined) return -1
    return a.claimedAt < b.claimedAt ? 1 : -1 // 倒序
  }
  if (a.slug !== b.slug) return a.slug < b.slug ? -1 : 1
  if (a.localId !== b.localId) return a.localId < b.localId ? -1 : 1
  return 0
}

/**
 * 行集过滤 + 行序（D6 裁决 #2 + D34 ③）：仅 link 源（派发挂接表；record 源过滤不入行集）；
 * 排序 = compareDispatchRows（in_progress 置顶 + 领取时间倒序）。同会话 link 卡经
 * UNIQUE(task_id, session_id) 恒不重复。写推送刷新（subscribeTasksChanged）重取后同一
 * 纯函数重排——状态翻转即实时重排。
 */
export function dispatchPanelRows(pills: readonly SessionTaskPillItem[]): readonly SessionTaskPillItem[] {
  return pills.filter((item) => item.source === 'link').sort(compareDispatchRows)
}

/** 锚定输入（对话真盒锚 + 官方页签行几何——DOM 读取面窄形状）
 *  convRight/convTop 读数源 = [data-conversation-scroll]（真盒——dock 展开随列收窄实时联动） */
export interface DispatchAnchorRects {
  /** 对话列右缘（viewport px——dock 展开即左移） */
  readonly convRight: number
  /** 对话列顶缘（页签行缺席[blank 会话]的 top 兜底） */
  readonly convTop: number
  /** 官方页签行下沿（null = 页签行不在场） */
  readonly tabsBottom: number | null
  readonly viewportWidth: number
}

/**
 * 默认锚定（纯几何）：top = 页签行下沿 + 8（缺席回退对话列顶 + 8）；右缘 = 对话列右缘
 * 内收 16（dock 展开 → convRight 左移 → 面板随之左移，不悬浮进 dockkit）。
 */
export function dispatchPanelAnchor(input: DispatchAnchorRects): DispatchPanelGeometry {
  const top = Math.max(DP_TOP_GAP, Math.round((input.tabsBottom ?? input.convTop) + DP_TOP_GAP))
  const rightGap = Math.max(DP_RIGHT_GAP, Math.round(input.viewportWidth - input.convRight + DP_RIGHT_GAP))
  const left = Math.max(DP_DRAG_MARGIN, Math.round(input.viewportWidth - rightGap - DP_WIDTH))
  return { left, top }
}

/**
 * 拖移几何（纯函数）：起点几何 + 指针位移 → 视口内钳制（四向 margin 4；纵向顶出后保
 * 头行高可拖回）。拖移后面板停自动锚定（装载壳 dragged 态承载）。
 */
export function dispatchPanelDragPosition(
  start: DispatchPanelGeometry,
  startPoint: { readonly x: number; readonly y: number },
  point: { readonly x: number; readonly y: number },
  viewport: { readonly width: number; readonly height: number },
): DispatchPanelGeometry {
  const maxLeft = Math.max(DP_DRAG_MARGIN, viewport.width - DP_DRAG_MARGIN - DP_WIDTH)
  const maxTop = Math.max(DP_DRAG_MARGIN, viewport.height - DP_DRAG_MARGIN - DP_DRAG_KEEP_HEIGHT)
  const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
  return {
    left: clamp(start.left + (point.x - startPoint.x), DP_DRAG_MARGIN, maxLeft),
    top: clamp(start.top + (point.y - startPoint.y), DP_DRAG_MARGIN, maxTop),
  }
}

/** 角标点击斜差（D34 ②——按下→抬起位移 ≤ 3px 判点击保留展开语义，超出判拖移） */
export const DP_BADGE_CLICK_SLOP = 3

/** 角标 pointer 位移判点击（纯函数）：位移在斜差内 = 点击（展开）；超出 = 拖移（click 抑制） */
export function dispatchBadgePointerIsClick(
  start: { readonly x: number; readonly y: number },
  point: { readonly x: number; readonly y: number },
): boolean {
  return (
    Math.abs(point.x - start.x) <= DP_BADGE_CLICK_SLOP && Math.abs(point.y - start.y) <= DP_BADGE_CLICK_SLOP
  )
}

/**
 * 折叠角标几何（纯函数——D34 ②）：角标拖移位优先（拖后停自动锚定——钳制纪律同
 * dispatchPanelDragPosition）；角标未被拖过 = 默认锚定位。
 */
export function dispatchPanelBadgeGeometry(
  badgeDrag: DispatchPanelGeometry | null,
  anchor: DispatchPanelGeometry,
): DispatchPanelGeometry {
  return badgeDrag ?? anchor
}

/**
 * 展开承接（纯函数——D34 ②）：面板展开几何解析。优先级 = 角标拖移位（面板承接角标位
 * ——几何连续不跳回锚定，承接即 dragged 停自动锚定）> 面板既有拖移位（既有 persistence
 * 不回跳）> 默认锚定位（角标/面板均未拖过 = 展开回默认锚）。
 */
export function dispatchPanelExpandGeometry(
  badgeDrag: DispatchPanelGeometry | null,
  panelUserPos: DispatchPanelGeometry | null,
  anchor: DispatchPanelGeometry,
): { readonly dragged: boolean; readonly geometry: DispatchPanelGeometry } {
  if (badgeDrag !== null) return { dragged: true, geometry: badgeDrag }
  if (panelUserPos !== null) return { dragged: true, geometry: panelUserPos }
  return { dragged: false, geometry: anchor }
}

/**
 * worker 执行会话解析（纯函数——D6 ⟞）：任务挂接双源卡中 record 源且不在 link 派发集的
 * 会话（claim 审计行 session = 派发会话本身 → 排除；submit/transition 审计行 = 执行会话）。
 * 无执行会话（未派发执行/纯派发）= null（⟞ 调用面 no-op）。
 */
export function workerSessionOf(sessions: readonly SessionTaskLinkCard[]): string | null {
  const dispatchSessions = new Set(
    sessions.filter((session) => session.source === 'link').map((session) => session.sessionId),
  )
  const worker = sessions.find((session) => session.source === 'record' && !dispatchSessions.has(session.sessionId))
  return worker?.sessionId ?? null
}

/**
 * worker 的 durable 父会话解析（纯函数——D6 修复面）：link 派发源 = 派发会话 = worker 的
 * 父（dispatchTask 自本会话 spawn——parent = 派发 agent）。库侧权威：进行中 worker 的
 * 账本行/盘上日志均未落的场景也恒可得（打开链显式父优先径的输入）。无 link 源 =
 * undefined（调用面走账本判读径）。
 */
export function parentSessionOf(sessions: readonly SessionTaskLinkCard[]): string | undefined {
  return sessions.find((session) => session.source === 'link')?.sessionId
}

/** worker 会话解析结果（⟞ 打开链输入——worker id + 库侧权威父） */
export interface WorkerSessionRef {
  readonly worker: string | null
  readonly parent: string | undefined
}

/** worker 会话解析（纯异步面）：taskDetail 挂接面 → workerSessionOf + parentSessionOf；
 * 错误 fail-soft（worker=null/parent=undefined） */
export async function fetchWorkerSession(
  client: ForgeRpcClient,
  q: { readonly projectId: string; readonly taskId: string },
): Promise<WorkerSessionRef> {
  try {
    const detail = await client.tasks.detail(q)
    return { worker: workerSessionOf(detail.sessions), parent: parentSessionOf(detail.sessions) }
  } catch {
    return { worker: null, parent: undefined }
  }
}

/** 锚定 DOM 窄面（生产 = document + window 适配；测试 = 假 dom 直喂） */
export interface DispatchAnchorDom {
  querySelector(selector: string): { getBoundingClientRect(): { readonly right: number; readonly top: number; readonly bottom: number } } | null
  readonly innerWidth: number
}

/** 对话区真盒锚（官方 chat 台账滚动面——brand.css/fix-38 既有官方锚，e2e 同锚 CONVERSATION_SCROLL）。
 *  D33 残差①：槽宿主锚退役——官方 SlotOutlet 洞包裹层 display:contents（renderer
 *  ANCHOR_STYLE，pin ⑮-4）→ 槽宿主 rect 恒零 → convRight=0 → 面板钉视口左缘。 */
export const DP_CONV_SELECTOR = '[data-conversation-scroll]'
/** 官方页签行选择器（ConversationSessionHeader tabs——blank 会话不渲染） */
export const DP_TABS_SELECTOR = '[data-conversation-tabs]'

/** 锚定几何读取（DOM → 窄形状；真盒锚缺席[知识/hero 面板态] = null——面板不出场） */
export function dispatchAnchorRectsOf(dom: DispatchAnchorDom): DispatchAnchorRects | null {
  const conv = dom.querySelector(DP_CONV_SELECTOR)
  if (conv === null) return null
  const convRect = conv.getBoundingClientRect()
  const tabs = dom.querySelector(DP_TABS_SELECTOR)
  const tabsRect = tabs === null ? null : tabs.getBoundingClientRect()
  return {
    convRight: convRect.right,
    convTop: convRect.top,
    tabsBottom: tabsRect === null ? null : tabsRect.bottom,
    viewportWidth: dom.innerWidth,
  }
}

// ─────────────────── 纯渲染体（全相位静态可测） ───────────────────

/** 行键呈现（身份双轨口径：界面展示恒 'slug/localId'） */
export function dispatchRowKeyLabel(item: Pick<SessionTaskLinkCard, 'slug' | 'localId'>): string {
  return `${item.slug}/${item.localId}`
}

export interface DispatchPanelRowProps {
  readonly row: SessionTaskPillItem
  /** 行点击 = 任务详情弹窗就地打开（装配接线；缺席 = 非交互呈现） */
  readonly onOpenTask: ((taskId: string) => void) | undefined
  /** 行尾 ⟞ = 打开 worker 执行子会话（装配接线；缺席 = 非交互呈现） */
  readonly onOpenWorkerSession: ((taskId: string) => void) | undefined
}

/** 单行（状态点 + 键 + 标题 + 状态标签 + ⟞）——行语言对齐原型 .m31-dp-row */
export function DispatchPanelRow({ row, onOpenTask, onOpenWorkerSession }: DispatchPanelRowProps): ReactNode {
  const key = dispatchRowKeyLabel(row)
  const open =
    onOpenTask === undefined
      ? undefined
      : (): void => {
          onOpenTask(row.taskId)
        }
  return (
    // D30：行/键悬停说明走官方 Tooltip（portal 逃逸拖移浮层的 transform/层叠上下文）
    <Tooltip label={`查看任务：${key} · ${row.title}`} portal>
      <div
        className="dswf-dp-row"
        data-dswf-dp-row={row.taskId}
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
        <StateDot state={SESSION_PILL_STATUS_DOT[row.taskStatus]} size={8} />
        <span className="dswf-dp-key">{key}</span>
        <Tooltip label={row.title} portal>
          <span className="dswf-dp-title">{row.title}</span>
        </Tooltip>
        <Tag tone={taskStatusTagTone(row.taskStatus)} className="dswf-dp-status">
          {TASK_STATUS_LABELS[row.taskStatus].zh}
        </Tag>
        <Tooltip label="打开执行子会话（worker）" portal>
          <span className="dswf-tipwrap">
            <button
              type="button"
              className="dswf-dp-open"
              data-dswf-dp-session={row.taskId}
              aria-label={`打开执行子会话：${key}`}
              {...(onOpenWorkerSession === undefined
                ? { disabled: true }
                : {
                    onClick: (event) => {
                      event.stopPropagation() // 行点击（弹窗）与 ⟞（子会话）互斥
                      onOpenWorkerSession(row.taskId)
                    },
                  })}
            >
              <IconRightUpOutlineRegular size={11} />
            </button>
          </span>
        </Tooltip>
      </div>
    </Tooltip>
  )
}

export interface DispatchPanelBodyProps {
  /** link 源行集（装载壳过滤后喂入——零派发 = 面板不出场） */
  readonly rows: readonly SessionTaskPillItem[]
  /** 面板几何（锚定或拖移位——装载壳注入） */
  readonly geometry: DispatchPanelGeometry
  /** 折叠态（装载壳持有） */
  readonly collapsed: boolean
  /** 拖移后停自动锚定标记（装载壳持有） */
  readonly dragged: boolean
  readonly onCollapse: () => void
  readonly onExpand: () => void
  readonly onOpenTask: ((taskId: string) => void) | undefined
  readonly onOpenWorkerSession: ((taskId: string) => void) | undefined
}

/** 悬浮面板纯渲染（面板 ↔ ⟡N 角标双形态；dragged 标记 = 停自动锚定的 e2e 锚） */
export function DispatchPanelBody({
  rows,
  geometry,
  collapsed,
  dragged,
  onCollapse,
  onExpand,
  onOpenTask,
  onOpenWorkerSession,
}: DispatchPanelBodyProps): ReactNode {
  if (collapsed) {
    return (
      <Tooltip label={`展开派发任务面板（${rows.length}）`} portal>
        <button
          type="button"
          className="dswf-dp-badge"
          data-dswf-dp-badge=""
          style={{ left: geometry.left, top: geometry.top }}
          aria-label="展开派发任务面板"
          onClick={onExpand}
        >
          <IconSparkleRegular size={11} />
          <span data-dswf-dp-badge-count="">{rows.length}</span>
        </button>
      </Tooltip>
    )
  }
  return (
    <div
      className="dswf-dp"
      data-dswf-dp=""
      {...(dragged ? { 'data-dswf-dp-dragged': '' } : {})}
      style={{ left: geometry.left, top: geometry.top }}
      role="complementary"
      aria-label="派发任务"
    >
      <div className="dswf-dp-head" data-dswf-dp-head="">
        <IconSparkleRegular size={11} className="dswf-dp-ic" />
        <span className="dswf-dp-title">派发任务</span>
        <span className="dswf-dp-count" data-dswf-dp-count="">
          {rows.length}
        </span>
        <Tooltip label="折叠" portal>
          <Button
            variant="ghost"
            size="sm"
            className="dswf-dp-btn"
            data-dswf-dp-collapse=""
            aria-label="折叠派发任务面板"
            onClick={onCollapse}
          >
            <IconChevronUpOutlineRegular size={12} />
          </Button>
        </Tooltip>
      </div>
      <div className="dswf-dp-list" data-dswf-dp-list="">
        {rows.map((row) => (
          <DispatchPanelRow
            key={row.taskId}
            row={row}
            onOpenTask={onOpenTask}
            onOpenWorkerSession={onOpenWorkerSession}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────── 装载壳（DOM 锚定 + 拖移 + 折叠本地态） ───────────────────

/** 悬浮面板 props（ShellHost 装配递达——单库锚 + 两动作面） */
export interface DispatchPanelProps {
  /** 当前主视图会话（ShellHost 主视图会话锚——派发会话身份） */
  readonly sessionId: string
  /** 单库锚（ShellHost 锚定项目上下文——sessionLinks 查询参） */
  readonly projectId: string
  /** 行点击 = 任务详情弹窗就地打开（桥 openTaskDrawer——零跳转/零 dock 强开；缺席 = 非交互） */
  readonly onOpenTask?: (taskId: string) => void
  /** 行尾 ⟞ = 打开 worker 执行子会话（插件 inject face；缺席 = 非交互）——可选第二参 =
   * 库侧权威父会话（link 派发源——进行中 worker 账本缺行场景的显式地址径输入） */
  readonly onOpenWorkerSession?: (childSessionId: string, parentSessionId?: string) => void
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

/**
 * 锚定效应（装载壳私有）：真盒锚在场即算锚定几何；ResizeObserver（dock 展开 → 对话列
 * 收窄）+ 视口 resize 重算 = 自动左移；挂载竞态（对话真盒锚晚于本树挂载）= rAF 有限重试
 * （纯事件驱动——SC2 无轮询守护：rAF 循环随容器到场即停）。锚缺席（知识/hero 面板态
 * ——本组件同帧已卸载）= null 不出场。
 */
function useDispatchAnchor(active: boolean): DispatchPanelGeometry | null {
  const [anchor, setAnchor] = useState<DispatchPanelGeometry | null>(null)
  useEffect(() => {
    if (!active) return
    let disposed = false
    let observer: ResizeObserver | null = null
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
        const next = dispatchPanelAnchor(rects)
        return prev !== null && prev.left === next.left && prev.top === next.top ? prev : next
      })
      if (observer === null) {
        const conv = document.querySelector(DP_CONV_SELECTOR)
        if (conv !== null) {
          observer = new ResizeObserver(() => {
            recompute()
          })
          observer.observe(conv)
        }
      }
    }
    const retry = (): void => {
      if (disposed) return
      recompute()
      // 挂载竞态兜底：容器未到场（与 main 槽树同帧交替挂载）→ rAF 有限重试（到场即停）
      if (observer === null && attempts < 120) {
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
      observer?.disconnect()
    }
  }, [active])
  return anchor
}

/** 拖移会话快照（起点指针 + 起点几何 + 拖移对象——装载壳 move 计算输入） */
interface DispatchPanelDragSession {
  readonly x: number
  readonly y: number
  readonly start: DispatchPanelGeometry
  /** 拖移对象：head = 面板头（面板位）/ badge = ⟡N 角标（角标位——D34 ②） */
  readonly kind: 'head' | 'badge'
}

/**
 * 悬浮面板装载壳：useSessionTaskPills（sessionLinks + 写推送刷新）→ link 行集（D34 ③
 * 行序：in_progress 置顶 + 领取时间倒序）→ 纯渲染体；几何 = 锚定（自动左移）或拖移位
 * （面板头/⟡N 角标双拖移对象——拖后停自动锚定；展开承接角标拖移位，全未拖过回默认锚
 * ——D34 ②）；折叠/拖移 = 会话内本地态（装载点 key=sessionId——切会话整体重置）。
 */
export function DispatchPanel(props: DispatchPanelProps): ReactNode {
  const makeClient = props.makeClient ?? preloadRpcClientFactory
  const [state] = useSessionTaskPills({ projectId: props.projectId, sessionId: props.sessionId }, makeClient)
  const rows = dispatchPanelRows(state.pills)
  const active = rows.length > 0
  const anchor = useDispatchAnchor(active)
  const [collapsed, setCollapsed] = useState(false)
  const [dragged, setDragged] = useState(false)
  const [dragPos, setDragPos] = useState<DispatchPanelGeometry | null>(null)
  const [badgePos, setBadgePos] = useState<DispatchPanelGeometry | null>(null)
  const dragRef = useRef<DispatchPanelDragSession | null>(null)
  const badgeMovedRef = useRef(false)
  if (!active || anchor === null) return null
  const geometry = dragged && dragPos !== null ? dragPos : anchor

  const handleWorkerOpen =
    props.onOpenWorkerSession === undefined
      ? undefined
      : (taskId: string): void => {
          void fetchWorkerSession(makeClient(), { projectId: props.projectId, taskId }).then(({ worker, parent }) => {
            if (worker !== null) props.onOpenWorkerSession?.(worker, parent)
          })
        }

  // 拖移手柄（taskDrawerHeadDragProps 同形制——经包装层捕获面板面冒泡）：面板头或 ⟡N 角标
  // 可拖（D34 ② 同纪律）。折叠钮命中不劫持；行/⟞ 命中不劫持。角标捕获角标本体（click 归
  // 角标——拖移不破坏展开语义）；头捕获包装层（行点击归行）。
  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement
    const badgeHit = target.closest('[data-dswf-dp-badge]')
    if (badgeHit !== null) {
      ;(badgeHit as HTMLElement).setPointerCapture(event.pointerId)
      badgeMovedRef.current = false
      dragRef.current = {
        x: event.clientX,
        y: event.clientY,
        start: dispatchPanelBadgeGeometry(badgePos, anchor),
        kind: 'badge',
      }
      return
    }
    if (target.closest('button') !== null) return // 折叠钮命中不劫持
    if (target.closest('[data-dswf-dp-head]') === null) return // 仅头可拖（行点击归行）
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, start: geometry, kind: 'head' }
  }
  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const drag = dragRef.current
    if (drag === null || (event.buttons & 1) === 0) return // 仅主键按住拖拽
    const point = { x: event.clientX, y: event.clientY }
    const next = dispatchPanelDragPosition(
      drag.start,
      drag,
      point,
      { width: window.innerWidth, height: window.innerHeight },
    )
    if (drag.kind === 'badge') {
      if (!dispatchBadgePointerIsClick(drag, point)) {
        badgeMovedRef.current = true // 超出斜差 = 拖移——click 抑制 + 角标位更新
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
  // 展开（角标 onClick——位移斜差判点击）：拖移收尾的 click 抑制；展开几何 = 角标拖移位
  //（面板承接——几何连续）> 面板既有拖移位 > 默认锚定位（dispatchPanelExpandGeometry）。
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
      className="dswf-dp-dragwrap"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <DispatchPanelBody
        rows={rows}
        geometry={collapsed ? dispatchPanelBadgeGeometry(badgePos, anchor) : geometry}
        collapsed={collapsed}
        dragged={dragged}
        onCollapse={() => setCollapsed(true)}
        onExpand={handleExpand}
        onOpenTask={props.onOpenTask}
        onOpenWorkerSession={handleWorkerOpen}
      />
    </div>
  )
}
