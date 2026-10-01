/**
 * The UF1 审批 dock (task 3.7, ui-design UF1 审批面板): the right-side panel
 * the pending approval requests render into — min(440px, 45vw) at z100, the
 * TaskDetailPanel's 同构 twin (slide-in 0.2s, focus-in + Tab trap + Esc/✕/
 * outer-pointerdown close, bg-layer-2 + left border) — MUTUALLY EXCLUSIVE
 * with the detail dock by PRESENTATION ORCHESTRATION ONLY (3.9 owns the
 * swapping; this component exposes the controlled open/locate seam through
 * its controller: open(locateTaskKey?) / close()).
 *
 * Entry form (ui-design 信息层级 — 裁决对象优先): 请求正文 14/22 as the
 * highest text tier (≤3 行截断 + 行内 展开), the task line demoted to 12/18
 * secondary (ID mono + 标题 + 「详情 ↗」), 拒绝 ghost LEFT / 批准 primary
 * RIGHT. Hard Rules: decisions are EXPLICIT clicks only (no default
 * auto-approval anywhere in this file by construction); an approval arriving
 * only ever RAISES a signal (badge/count/announcement) — never a modal.
 *
 * The「详情 ↗」/「◂ 返回审批(N)」round-trip (上下文不断路): the dock stays
 * MOUNTED while closed (renders nothing) so its captured scroll position and
 * the machine's remaining entries survive the detour — on reopen the stale
 * entries render immediately (no flicker) and the scroll restores; the
 * detail-side「◂ 返回审批(N)」button ships here as ApprovalReturnButton
 * (3.9 mounts it in the detail header).
 *
 * Data (Interface 1, tech-design §Interface 3 审批路由): listApprovals
 * (pending 前 created_at 倒序) + decideApproval (explicit decision, decided_by
 * audit; ERR_APPROVAL_DECIDED / ERR_APPROVAL_NOT_FOUND → 刷新 + toast),
 * subscription-driven refresh on approval_received events (≤5s 免手动刷新 —
 * the ≤500ms batched channel plus the immediate handler is well inside).
 *
 * Layer split (the selection-mode.ts / SelectionLayer.tsx precedent): the
 * pure machine + DTO twins + payload text derivation live in the PURE half
 * below (unit-tested in isolation); the controller hook + dock + entries are
 * the React half.
 */
import {
  useEffect, useMemo, useReducer, useRef, useState,
  type KeyboardEvent,
} from 'react'
import type { ApprovalState, WorkbenchEvent } from '../../../ipc-types'
import { normalizeWorkbenchVerbError } from '../../../ipc/workbench'
import { fillTemplate } from '../../overview/format'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import {
  detailDockWidthOf, DETAIL_DOCK_Z, focusablesOf, ghostButtonStyle, LaunchSpinner, primaryButtonStyle,
  type BoardHostForm,
} from '../launch/LaunchStates'
import type { DispatchTranslate } from './DispatchBadge'

// ---------------------------------------------------------------------------
// Interface 1 verb DTO twins (kernel 3.3; camelCase projections)
// ---------------------------------------------------------------------------

/** approval_request 行的 IPC 投影(Interface 1 ApprovalRow;kernel twin verbatim). */
export interface ApprovalRow {
  readonly id: string
  readonly dispatchId: string
  readonly projectId: string
  /** 看板限定地址 `<featureSlug>/<localId>`. */
  readonly taskKey: string
  /** 来源 subagent 会话. */
  readonly sessionId: string
  /** 请求正文 + 类别(payload_json 防御解码值;损坏行 = null). */
  readonly payload: unknown
  /** 3 态(pending/approved/rejected). */
  readonly state: ApprovalState
  readonly createdAt: string
  /** 决策时刻;pending → null. */
  readonly decidedAt: string | null
  /** 审批审计(人;Hard Rule T5:仅显式动词决策). */
  readonly decidedBy: string | null
}

/** decideApproval 入参(Interface 1:显式点击,无自动批准). */
export interface DecideApprovalInput {
  readonly approvalId: string
  readonly approve: boolean
}

/**
 * The two verbs the dock consumes (signatures mirror the preload bridge of
 * task 3.3 one-to-one — decideApproval carries the deciding human's actor
 * string for kernel audit).
 */
export interface ApprovalVerbs {
  listApprovals(projectId: string): Promise<ApprovalRow[]>
  decideApproval(input: DecideApprovalInput, actor: string): Promise<ApprovalRow>
}

/** The deciding human's audit string default (same seat as the dispatch actor). */
export const APPROVAL_ACTOR = 'workbench'

/**
 * The request body's text (payload_json 防御解码 → presentable text): strings
 * pass through verbatim, JSON values render as pretty JSON (text nodes only —
 * 防注入 by construction), null/undefined → null (the caller shows the
 * 请求正文不可用 fallback). Numbers/booleans coerce.
 */
export function approvalRequestText(payload: unknown): string | null {
  if (payload === null || payload === undefined) return null
  if (typeof payload === 'string') return payload
  if (typeof payload === 'number' || typeof payload === 'boolean') return String(payload)
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return null
  }
}

/** The local id of a qualified board key (the entry's mono ID line). */
export function localIdOfTaskKey(taskKey: string): string {
  const at = taskKey.lastIndexOf('/')
  return at === -1 ? taskKey : taskKey.slice(at + 1)
}

// ---------------------------------------------------------------------------
// The pure machine
// ---------------------------------------------------------------------------

/** The dock's phases; `closed` keeps the machine's entries (the 返回 restore face). */
export type ApprovalDockPhase = 'closed' | 'loading' | 'ready' | 'error'

/** A decision failure's envelope (the IPC reject's serialized shape). */
export interface ApprovalDecisionError {
  readonly code: string
  readonly message: string
}

/** The aria-live outcomes (structured; copy assembly stays in the locale halves). */
export type ApprovalAnnouncement =
  | { readonly type: 'arrived'; readonly count: number }
  | { readonly type: 'decided'; readonly taskKey: string; readonly approve: boolean }

/** Machine snapshot — a stable reference between transitions. */
export interface ApprovalDockSnapshot {
  readonly phase: ApprovalDockPhase
  /** pending 条目(呈现集). */
  readonly entries: readonly ApprovalRow[]
  /** 滑出中的行(0.2s 动画期仍渲染,pruneLeaving 移除). */
  readonly leaving: readonly ApprovalRow[]
  /** 决策 verb 在飞(该条目按钮禁用 + spinner 面). */
  readonly deciding: { readonly id: string; readonly approve: boolean } | null
  /** 决策失败 envelope(→ 刷新 + toast;null = 无 toast). */
  readonly error: ApprovalDecisionError | null
  /** 打开定位目标(「待审批」角标点击 → 滚动定位对应条目). */
  readonly locateTaskKey: string | null
  readonly announcement: ApprovalAnnouncement | null
}

/** First-boot state. */
export const INITIAL_APPROVAL_DOCK: ApprovalDockSnapshot = Object.freeze({
  phase: 'closed',
  entries: [],
  leaving: [],
  deciding: null,
  error: null,
  locateTaskKey: null,
  announcement: null,
}) as ApprovalDockSnapshot

/** The actions (the controller pre-validates; the reducer phase-guards every leg). */
export type ApprovalDockAction =
  | { readonly type: 'open'; readonly locateTaskKey?: string }
  | { readonly type: 'close' }
  | { readonly type: 'refreshStarted' }
  | { readonly type: 'refreshResolved'; readonly rows: readonly ApprovalRow[] }
  | { readonly type: 'refreshFailed' }
  | { readonly type: 'decideStarted'; readonly approvalId: string; readonly approve: boolean }
  | { readonly type: 'decideResolved'; readonly row: ApprovalRow; readonly approve: boolean }
  | { readonly type: 'decideFailed'; readonly error: ApprovalDecisionError }
  | { readonly type: 'pruneLeaving' }
  | { readonly type: 'clearError' }
  | { readonly type: 'clearLocate' }

/** The pending filter (the dock presents pending only; decided rows are audit). */
export function pendingApprovals(rows: readonly ApprovalRow[]): ApprovalRow[] {
  return rows.filter(row => row.state === 'pending')
}

/** The 滑出 animation dwell (decideResolved → pruneLeaving). */
export const APPROVAL_LEAVE_MS = 200

/**
 * The reducer. Refreshes land from ANY phase (approval_received while the
 * dock is closed still updates entries + counts — the ≤5s 订阅驱动 face);
 * the `arrived` announcement fires only when arrivals INCREASE the pending
 * set (departures are the user's own decisions — those announce separately).
 */
export function approvalDockReducer(state: ApprovalDockSnapshot, action: ApprovalDockAction): ApprovalDockSnapshot {
  switch (action.type) {
    case 'open':
      return {
        ...state,
        phase: 'loading',
        error: null,
        leaving: [],
        locateTaskKey: action.locateTaskKey ?? null,
        announcement: null,
      }
    case 'close':
      return { ...state, phase: 'closed', deciding: null, locateTaskKey: null, announcement: null }
    case 'refreshStarted':
      // While closed a refresh stays closed (counts only); an open dock
      // shows the loading face with the STALE entries kept (无闪烁).
      return state.phase === 'closed' ? state : { ...state, phase: 'loading' }
    case 'refreshResolved': {
      const entries = pendingApprovals(action.rows)
      const phase: ApprovalDockPhase = state.phase === 'closed' ? 'closed' : 'ready'
      const arrived = entries.length > state.entries.length
        ? ({ type: 'arrived', count: entries.length } as ApprovalAnnouncement)
        : null
      return { ...state, entries, phase, leaving: [], announcement: arrived ?? state.announcement }
    }
    case 'refreshFailed':
      if (state.phase === 'closed' || state.phase === 'error') return state
      return { ...state, phase: 'error' }
    case 'decideStarted':
      if (state.phase !== 'ready' || state.deciding !== null) return state
      return { ...state, deciding: { id: action.approvalId, approve: action.approve }, error: null }
    case 'decideResolved': {
      if (state.deciding === null || state.deciding.id !== action.row.id) return state
      return {
        ...state,
        entries: state.entries.filter(entry => entry.id !== action.row.id),
        leaving: [...state.leaving, action.row],
        deciding: null,
        announcement: { type: 'decided', taskKey: action.row.taskKey, approve: action.approve },
      }
    }
    case 'decideFailed':
      if (state.deciding === null) return state
      return { ...state, deciding: null, error: action.error }
    case 'pruneLeaving':
      if (state.leaving.length === 0) return state
      return { ...state, leaving: [] }
    case 'clearError':
      return state.error === null ? state : { ...state, error: null }
    case 'clearLocate':
      return state.locateTaskKey === null ? state : { ...state, locateTaskKey: null }
  }
}

// ---------------------------------------------------------------------------
// The controller hook
// ---------------------------------------------------------------------------

/** The hook's inputs. */
export interface ApprovalDockOptions {
  readonly projectId: string
  readonly verbs: ApprovalVerbs
  /**
   * The events subscription seam (the contract's subscribeEvents; absent in
   * build-stage tests that drive refreshes manually). approval_received for
   * THIS project re-fires listApprovals — 订阅驱动,免手动刷新,≤5s.
   */
  readonly subscribeEvents?: ((callback: (events: readonly WorkbenchEvent[]) => void) => () => void) | undefined
  /** The deciding human's audit string (default 'workbench'). */
  readonly actor?: string
  /** Fired once after a decision lands (3.9 refreshes the board's orchestration face). */
  readonly onDecided?: ((row: ApprovalRow, approve: boolean) => void) | undefined
  /** Fired whenever the pending count changes (the toolbar button + tab badge seat). */
  readonly onCountChange?: ((count: number) => void) | undefined
}

/** The controller the page (and the dock) drive. */
export interface ApprovalDockController {
  readonly snapshot: ApprovalDockSnapshot
  /** The live pending count (toolbar button + tab badge). */
  readonly pendingCount: number
  /** Open the dock; the locate key scrolls to that task's entry (badge entry). */
  open(locateTaskKey?: string): void
  /** Close the dock (entries + scroll survive for the 返回审批 restore). */
  close(): void
  /** Re-fire listApprovals (events, retry, post-error refresh). */
  refresh(): void
  /** The explicit decision leg (批准/拒绝 — the ONLY decision path). */
  decide(input: DecideApprovalInput): void
  /** Dismiss the error toast. */
  clearError(): void
  /** Clear the locate target (after the entry was scrolled to + highlighted). */
  clearLocate(): void
}

/**
 * The machine + the async legs. A per-leg token drops stale verb settles
 * (a refresh resolving after a newer one, a decision landing after close);
 * the decideFailed leg immediately re-fires refresh (失效/已决条目 → 刷新
 * + toast — the refreshed list no longer carries the stale entry).
 */
export function useApprovals(options: ApprovalDockOptions): ApprovalDockController {
  const [snapshot, dispatchAction] = useReducer(approvalDockReducer, INITIAL_APPROVAL_DOCK)
  const stateRef = useRef(snapshot)
  stateRef.current = snapshot
  const legToken = useRef(0)
  const pruneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const runRefresh = (): void => {
    const current = optionsRef.current
    const token = ++legToken.current
    dispatchAction({ type: 'refreshStarted' })
    void current.verbs.listApprovals(current.projectId)
      .then((rows) => {
        if (token !== legToken.current) return
        dispatchAction({ type: 'refreshResolved', rows })
      })
      .catch(() => {
        if (token !== legToken.current) return
        dispatchAction({ type: 'refreshFailed' })
      })
  }

  // The events seam: approval_received for this project → refresh (订阅驱动).
  useEffect(() => {
    const subscribe = options.subscribeEvents
    if (subscribe === undefined) return
    return subscribe((events) => {
      if (events.some(event => event.type === 'approval_received' && event.projectId === optionsRef.current.projectId)) {
        runRefresh()
      }
    })
  }, [options.subscribeEvents])

  // The initial count load: the toolbar/tab count faces live from page mount
  // — the pending count must exist BEFORE anyone opens the dock (the dock
  // hidden ⇒ counts still render; the refresh lands closed, counts only).
  useEffect(() => {
    runRefresh()
  }, [options.projectId])

  // The count seat: every pending-count change notifies (badge + toolbar).
  const prevCountRef = useRef<number | null>(null)
  useEffect(() => {
    const count = snapshot.entries.length
    if (prevCountRef.current === count) return
    prevCountRef.current = count
    optionsRef.current.onCountChange?.(count)
  }, [snapshot.entries.length])

  // The slide-out prune: decideResolved schedules the 0.2s dwell cleanup.
  useEffect(() => {
    if (snapshot.leaving.length === 0) return
    pruneTimer.current = setTimeout(() => { dispatchAction({ type: 'pruneLeaving' }) }, APPROVAL_LEAVE_MS)
    return () => {
      if (pruneTimer.current !== null) clearTimeout(pruneTimer.current)
      pruneTimer.current = null
    }
  }, [snapshot.leaving])

  return useMemo<ApprovalDockController>(() => ({
    snapshot,
    pendingCount: snapshot.entries.length,
    open: (locateTaskKey?: string): void => {
      dispatchAction({ type: 'open', ...(locateTaskKey !== undefined ? { locateTaskKey } : {}) })
      runRefresh()
    },
    close: (): void => { dispatchAction({ type: 'close' }) },
    refresh: runRefresh,
    decide: (input: DecideApprovalInput): void => {
      if (stateRef.current.phase !== 'ready' || stateRef.current.deciding !== null) return
      dispatchAction({ type: 'decideStarted', approvalId: input.approvalId, approve: input.approve })
      const current = optionsRef.current
      const token = ++legToken.current
      void current.verbs.decideApproval(input, current.actor ?? APPROVAL_ACTOR)
        .then((row) => {
          if (token !== legToken.current) return
          dispatchAction({ type: 'decideResolved', row, approve: input.approve })
          current.onDecided?.(row, input.approve)
        })
        .catch((error: unknown) => {
          if (token !== legToken.current) return
          const normalized = normalizeWorkbenchVerbError(error)
          dispatchAction({ type: 'decideFailed', error: { code: normalized.code, message: normalized.message } })
          // 失效/已决条目 → 刷新 (the list drops the stale row) + toast (above).
          runRefresh()
        })
    },
    clearError: (): void => { dispatchAction({ type: 'clearError' }) },
    clearLocate: (): void => { dispatchAction({ type: 'clearLocate' }) },
  }), [snapshot])
}

// ---------------------------------------------------------------------------
// The dock presentation
// ---------------------------------------------------------------------------

/**
 * The dock geometry — the TaskDetailPanel 同构 twin (z100). The WIDTH is
 * host-form-dependent (M4 2.1) and applied at the render site through
 * {@link detailDockWidthOf} (window = `min(440px, 45vw)` verbatim, pane =
 * capped at the board's own box).
 */
const dockStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  borderLeft: '1px solid var(--dsh-border-color, CanvasText)',
  bottom: '0',
  boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.12)',
  color: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  font: 'inherit',
  gap: '12px',
  overflowY: 'auto',
  padding: '16px',
  position: 'absolute',
  right: '0',
  top: '0',
  zIndex: DETAIL_DOCK_Z,
} as const

const titleStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
  minWidth: '0',
} as const

const noteStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** mono 12/18 secondary (the entry's ID line). */
const monoSecondaryStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const secondaryStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const closeButtonStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  flex: '0 0 auto',
  font: 'inherit',
  height: '28px',
  justifyContent: 'center',
  marginLeft: 'auto',
  width: '28px',
} as const

const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '32px',
} as const

const emptyCardStyle = {
  borderRadius: '14px',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  padding: '40px 16px',
  textAlign: 'center',
} as const

/** One approval entry (prototype .appr-item): pad 14px 2px + bottom divider. */
const itemStyle = {
  borderBottom: '1px solid var(--dsw-alias-border-l1, var(--dsh-border-color, CanvasText))',
  padding: '14px 2px',
  transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
} as const

/** The 滑出 face (is-leaving): opacity 0 + 16px right drift, held by pruneLeaving. */
const leavingStyle = {
  opacity: '0',
  transform: 'translateX(16px)',
} as const

/** The located flash (定位滚动到的条目): a 回流高亮-alike emphasis. */
const locatedStyle = {
  background: 'var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.1))',
  borderRadius: '8px',
} as const

/** 请求正文 14/22 — the panel's HIGHEST text tier (裁决对象优先). */
const bodyTextStyle = {
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap',
} as const

/** ≤3 行截断 (prototype .clamp-3). */
const clampedBodyStyle = {
  ...bodyTextStyle,
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 3,
  display: '-webkit-box',
  overflow: 'hidden',
} as Record<string, string | number>

/** The link-button (详情 ↗ / 展开 — prototype .link-btn). */
const linkButtonStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  cursor: 'pointer',
  flex: '0 0 auto',
  font: 'inherit',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0',
  whiteSpace: 'nowrap',
} as const

/** 批准 sm 主 (h28 r14 brand fill — the prototype's .btn.sm.primary). */
const approveButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '14px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  height: '28px',
  padding: '0 12px',
} as const

const actionRowStyle = {
  display: 'flex',
  gap: '8px',
  justifyContent: 'flex-end',
  marginTop: '10px',
} as const

const visuallyHiddenStyle = {
  clipPath: 'inset(50%)',
  height: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const

const toastCardStyle = {
  alignItems: 'flex-start',
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  bottom: '16px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  maxWidth: '360px',
  padding: '12px 14px',
  position: 'fixed',
  right: '16px',
  zIndex: 1100,
} as const

/** Inputs of {@link ApprovalPanel}. */
export interface ApprovalPanelProps {
  /** The controller (the page's `useApprovals` machine). */
  readonly controller: ApprovalDockController
  /** The locale seat (the host's `t`). */
  readonly t: DispatchTranslate
  /**
   * The host's width breakpoint (M4 2.1 双宿主, threaded by TaskBoardPage):
   * 'window' (default) = the dock + the toast anchor to the window viewport
   * (the M2/M3 geometry verbatim); 'pane' = both contract to the board's own
   * box (`min(440px, 100%)` dock, board-anchored toast). See
   * {@link detailDockWidthOf}.
   */
  readonly host?: BoardHostForm | undefined
  /**
   * Task-title resolution (the entry's 次文字); absent → the task key's
   * local id (the dock never blocks on board data it does not own).
   */
  readonly titleOf?: ((taskKey: string) => string | undefined) | undefined
  /** 「详情 ↗」 — switch to the task's detail dock (the 同层互斥 detour). */
  readonly onOpenDetail?: ((taskKey: string) => void) | undefined
  /** Close notification (after the panel ran controller.close — mutex bookkeeping). */
  readonly onClose?: (() => void) | undefined
}

/** The structured announcement → locale copy (the aria-live leg). */
function announcementTextOf(announcement: ApprovalAnnouncement | null, t: DispatchTranslate): string {
  if (announcement === null) return ''
  if (announcement.type === 'arrived') {
    return fillTemplate(t('tasks.approval.announce.arrived'), { count: String(announcement.count) })
  }
  return fillTemplate(
    t(announcement.approve ? 'tasks.approval.announce.approved' : 'tasks.approval.announce.rejected'),
    { key: announcement.taskKey },
  )
}

/**
 * The 审批 dock. STAYS MOUNTED while closed (renders nothing) so the 返回
 * restore keeps its scroll position and remaining entries — the 3.9 mutex
 * swaps the DETAIL dock in over this one's closed face.
 */
export function ApprovalPanel(props: ApprovalPanelProps) {
  const { controller, t } = props
  const { snapshot } = controller
  const open = snapshot.phase !== 'closed'
  const [entered, setEntered] = useState(false)
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set())
  const rootRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const scrollTopRef = useRef(0)

  // Focus-in on open (capturing the trigger) + the slide-in flip + the
  // scroll RESTORE; the cleanup returns focus to the trigger. The scroll
  // CAPTURE rides the live onScroll handler below — external closes (the
  // 3.9 mutex swaps the detail dock in via controller.close(), never through
  // this file's own close paths) must keep the position too, and the effect
  // cleanup cannot read the DOM (React nulls the ref during the unmount
  // commit before passive cleanups run).
  useEffect(() => {
    if (!open) return
    const active = document.activeElement
    returnFocusRef.current = active instanceof HTMLElement ? active : null
    rootRef.current?.focus()
    if (rootRef.current !== null) rootRef.current.scrollTop = scrollTopRef.current
    const frame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => { setEntered(true) })
      : undefined
    return () => {
      if (frame !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
      setEntered(false)
      returnFocusRef.current?.focus()
    }
  }, [open])

  /** The close paths' shared leg (Esc / ✕ / 外点). */
  const closeDock = (): void => {
    controller.close()
    props.onClose?.()
  }

  // 外点关闭 (the detail dock's 同构 contract; the toast keeps its own clicks).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      const root = rootRef.current
      if (root !== null && event.target instanceof Node && !root.contains(event.target)
        && !(event.target instanceof Element && event.target.closest('[data-dsh-forge-approval-toast]') !== null)) {
        closeDock()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => { document.removeEventListener('pointerdown', onPointerDown, true) }
  }, [open, controller, props.onClose])

  // The locate leg: entries ready + a locate key → scroll the entry into
  // view (block:center) + the located highlight; the key clears after the
  // 0.3s emphasis dwell (the locate target never lingers into a reopen).
  useEffect(() => {
    if (snapshot.phase !== 'ready' || snapshot.locateTaskKey === null) return
    const wanted = snapshot.entries.find(entry => entry.taskKey === snapshot.locateTaskKey)
    if (wanted === undefined) return
    rootRef.current
      ?.querySelector(`[data-dsh-forge-approval-item="${wanted.id}"]`)
      ?.scrollIntoView({ block: 'center' })
    const timer = setTimeout(() => { controller.clearLocate() }, 300)
    return () => { clearTimeout(timer) }
  }, [snapshot.phase, snapshot.locateTaskKey, snapshot.entries, controller])

  // The non-modal trap: Esc closes; Tab/Shift+Tab cycle the dock's focusables.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDock()
      return
    }
    if (event.key !== 'Tab' || rootRef.current === null) return
    const focusables = focusablesOf(rootRef.current)
    if (focusables.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusables[0] as HTMLElement
    const last = focusables[focusables.length - 1] as HTMLElement
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const close = closeDock

  /**
   * Live scroll capture — the 返回审批 restore keeps the LAST position,
   * whichever way the dock closed (own close paths OR the 3.9 mutex's
   * controller.close()).
   */
  const onScroll = (): void => {
    if (rootRef.current !== null) scrollTopRef.current = rootRef.current.scrollTop
  }

  const renderEntry = (row: ApprovalRow, leaving: boolean) => (
    <ApprovalEntryView
      key={row.id}
      t={t}
      row={row}
      title={props.titleOf?.(row.taskKey) ?? localIdOfTaskKey(row.taskKey)}
      deciding={snapshot.deciding !== null && snapshot.deciding.id === row.id}
      decidingApprove={snapshot.deciding !== null && snapshot.deciding.id === row.id ? snapshot.deciding.approve : false}
      leaving={leaving}
      located={!leaving && snapshot.locateTaskKey === row.taskKey}
      expanded={expandedIds.has(row.id)}
      onToggleExpand={() => {
        setExpandedIds((previous) => {
          const next = new Set(previous)
          if (next.has(row.id)) next.delete(row.id)
          else next.add(row.id)
          return next
        })
      }}
      onDetail={() => { props.onOpenDetail?.(row.taskKey) }}
      onDecide={(approve) => { controller.decide({ approvalId: row.id, approve }) }}
    />
  )

  return (
    <>
      {open && (
        <div
          ref={rootRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dsh-forge-approval-title"
          data-dsh-forge-approval-panel=""
          tabIndex={-1}
          style={{
            ...dockStyle,
            width: detailDockWidthOf(props.host ?? 'window'),
            transform: entered ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onKeyDown={onKeyDown}
          onScroll={onScroll}
        >
          <header data-dsh-forge-approval-header="" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ alignItems: 'center', display: 'flex', gap: '8px', minWidth: 0 }}>
              <h2 id="dsh-forge-approval-title" style={titleStyle}>
                {fillTemplate(t('tasks.approval.title'), { count: String(snapshot.entries.length) })}
              </h2>
              <ChromeButton
                type="button"
                aria-label={t('tasks.approval.close')}
                data-dsh-forge-approval-close=""
                style={closeButtonStyle}
                onClick={close}
              >
                <span aria-hidden="true">✕</span>
              </ChromeButton>
            </div>
            <p style={noteStyle}>{t('tasks.approval.note')}</p>
          </header>

          {snapshot.phase === 'loading' && snapshot.entries.length === 0 && (
            <div
              role="status"
              aria-label={t('tasks.approval.loading')}
              data-dsh-forge-approval-skeleton=""
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              {[0, 1, 2, 3].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
            </div>
          )}

          {snapshot.phase === 'error' && (
            <div data-dsh-forge-approval-loaderror="" role="alert" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 500, lineHeight: '24px', margin: '0' }}>
                {t('tasks.approval.loadError.title')}
              </h3>
              <div>
                <ChromeButton
                  type="button"
                  data-dsh-forge-approval-retry=""
                  style={primaryButtonStyle}
                  onClick={() => { controller.refresh() }}
                >
                  {t('tasks.approval.loadError.retry')}
                </ChromeButton>
              </div>
            </div>
          )}

          {snapshot.phase === 'ready' && snapshot.entries.length === 0 && snapshot.leaving.length === 0 && (
            <div data-dsh-forge-approval-empty="" style={emptyCardStyle}>
              <div style={{ fontSize: '14px', lineHeight: '22px' }}>{t('tasks.approval.empty')}</div>
              <p style={noteStyle}>{t('tasks.approval.empty.hint')}</p>
            </div>
          )}

          {snapshot.entries.map(entry => renderEntry(entry, false))}
          {snapshot.leaving.map(entry => renderEntry(entry, true))}
        </div>
      )}
      {snapshot.error !== null && (
        <div
          role="status"
          aria-live="polite"
          data-dsh-forge-approval-toast=""
          // M4 2.1 双宿主: the window form pins the toast to the window's
          // bottom-right (M2/M3 verbatim); the pane form anchors it to the
          // board's own box (the dock strip's absolute twin — a fixed toast
          // would land outside the rightbar pane, over the conversation).
          style={{ ...toastCardStyle, position: props.host === 'pane' ? 'absolute' : 'fixed' }}
        >
          <div style={{ alignItems: 'center', display: 'flex', gap: '8px', width: '100%' }}>
            <strong style={{ fontSize: '14px', lineHeight: '22px' }}>{t('tasks.approval.error.title')}</strong>
            <ChromeButton
              type="button"
              aria-label={t('tasks.approval.close')}
              data-dsh-forge-approval-toast-dismiss=""
              style={{ ...ghostButtonStyle, height: '24px', marginLeft: 'auto', padding: '0 8px' }}
              onClick={() => { controller.clearError() }}
            >
              <span aria-hidden="true">✕</span>
            </ChromeButton>
          </div>
          <p style={noteStyle}>{`${snapshot.error.message} (${snapshot.error.code})`}</p>
          <p style={noteStyle}>{t('tasks.approval.error.refreshed')}</p>
        </div>
      )}
      <span role="status" aria-live="polite" data-dsh-forge-approval-announce="" style={visuallyHiddenStyle}>
        {announcementTextOf(snapshot.announcement, t)}
      </span>
    </>
  )
}

/** Inputs of {@link ApprovalEntryView}. */
export interface ApprovalEntryViewProps {
  readonly t: DispatchTranslate
  readonly row: ApprovalRow
  /** The resolved task title (12/18 次文字 next to the mono ID). */
  readonly title: string
  /** This entry's decision verb is in flight (buttons disabled + spinner). */
  readonly deciding: boolean
  /** Which side is spinning (批准 vs 拒绝) while deciding. */
  readonly decidingApprove: boolean
  /** The 滑出 face (decided — held for the 0.2s dwell). */
  readonly leaving: boolean
  /** The locate highlight (该条目被「待审批」角标定位). */
  readonly located: boolean
  readonly expanded: boolean
  readonly onToggleExpand: () => void
  readonly onDetail: (taskKey: string) => void
  readonly onDecide: (approve: boolean) => void
}

/**
 * One 审批条目 (`data-dsh-forge-approval-item="<approvalId>"`): the task line
 * (ID mono + 标题 次 + 详情 ↗), the request body (14/22, ≤3 行截断 + 行内
 * 展开), and the action row — 拒绝 ghost LEFT / 批准 primary RIGHT, both
 * EXPLICIT clicks only (the Hard Rule: nothing in this tree decides on its
 * own; Enter/Space ride the native button semantics).
 */
export function ApprovalEntryView(props: ApprovalEntryViewProps) {
  const { t, row } = props
  const text = approvalRequestText(row.payload)
  const decidingLabel = t('tasks.approval.deciding')
  return (
    <div
      data-dsh-forge-approval-item={row.id}
      data-dsh-forge-approval-leaving={props.leaving ? 'true' : 'false'}
      data-dsh-forge-approval-located={props.located ? 'true' : 'false'}
      data-dsh-forge-approval-task={row.taskKey}
      style={{
        ...itemStyle,
        ...(props.leaving ? leavingStyle : {}),
        ...(props.located ? locatedStyle : {}),
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', gap: '8px', marginBottom: '6px', minWidth: 0 }}>
        <span style={secondaryStyle}>
          <span style={monoSecondaryStyle}>{localIdOfTaskKey(row.taskKey)}</span>
          {' '}
          {props.title}
        </span>
        <ChromeButton
          type="button"
          aria-label={t('tasks.dispatch.detail')}
          data-dsh-forge-approval-detail={row.taskKey}
          style={{ ...linkButtonStyle, marginLeft: 'auto' }}
          onClick={() => { props.onDetail(row.taskKey) }}
        >
          {t('tasks.approval.detail')}
        </ChromeButton>
      </div>
      {text === null
        ? <p data-dsh-forge-approval-body="" style={{ ...secondaryStyle, margin: '0' }}>{t('tasks.approval.payload.unavailable')}</p>
        : (
          <>
            <p
              data-dsh-forge-approval-body=""
              data-dsh-forge-approval-clamped={props.expanded ? 'false' : 'true'}
              style={props.expanded ? bodyTextStyle : clampedBodyStyle}
            >
              {text}
            </p>
            <ChromeButton
              type="button"
              data-dsh-forge-approval-expand={row.id}
              style={linkButtonStyle}
              onClick={props.onToggleExpand}
            >
              {props.expanded ? t('tasks.approval.collapse') : t('tasks.approval.expand')}
            </ChromeButton>
          </>
        )}
      <div style={actionRowStyle}>
        <ChromeButton
          type="button"
          disabled={props.deciding}
          data-dsh-forge-approval-reject={row.id}
          style={ghostButtonStyle}
          onClick={() => { props.onDecide(false) }}
        >
          {props.deciding && !props.decidingApprove
            ? (
              <span style={{ alignItems: 'center', display: 'inline-flex', gap: '6px' }}>
                <LaunchSpinner label={decidingLabel} />
                {t('tasks.approval.reject')}
              </span>
            )
            : t('tasks.approval.reject')}
        </ChromeButton>
        <ChromeButton
          type="button"
          disabled={props.deciding}
          data-dsh-forge-approval-approve={row.id}
          style={approveButtonStyle}
          onClick={() => { props.onDecide(true) }}
        >
          {props.deciding && props.decidingApprove
            ? (
              <span style={{ alignItems: 'center', display: 'inline-flex', gap: '6px' }}>
                <LaunchSpinner label={decidingLabel} />
                {t('tasks.approval.approve')}
              </span>
            )
            : t('tasks.approval.approve')}
        </ChromeButton>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The 返回审批 entry (the detail-side head of the round-trip)
// ---------------------------------------------------------------------------

/** Inputs of {@link ApprovalReturnButton}. */
export interface ApprovalReturnButtonProps {
  /** The locale seat (the shell's `t`). */
  readonly t: DispatchTranslate
  /** The live pending count (N rides in the label — 返回审批(N)). */
  readonly count: number
  /** 返回 — reopen the approval dock (restoring entries + scroll). */
  readonly onReturn: () => void
}

/**
 * The「◂ 返回审批(N)」button (`data-dsh-forge-approval-return`): the sm ghost
 * 3.9 mounts at the DETAIL dock's head when the detail was entered from the
 * approval dock (「详情 ↗」) — the round-trip's return leg. The count comes
 * from the approval controller (entries refresh even while the dock hides).
 */
export function ApprovalReturnButton(props: ApprovalReturnButtonProps) {
  return (
    <ChromeButton
      type="button"
      data-dsh-forge-approval-return=""
      data-dsh-forge-approval-return-count={String(props.count)}
      style={{ ...ghostButtonStyle, marginBottom: '6px' }}
      onClick={props.onReturn}
    >
      {fillTemplate(props.t('tasks.approval.back'), { count: String(props.count) })}
    </ChromeButton>
  )
}
