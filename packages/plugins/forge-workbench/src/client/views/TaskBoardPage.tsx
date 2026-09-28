/**
 * The UF2 任务看板 page, BUILD half (task 5.5): the page the shell mounts
 * into its reserved `workbench/tasks` seat — the four-state machine the
 * tech-design test plan demands (loading 骨架 / empty 空态卡 / error 重试卡 /
 * populated) over the Interface 1 DTOs through the TaskBoardFace seam. The
 * build stage defaults to the shared mock twin
 * (mocks/workbench.createMockTaskBoardFace); the 5.15 assembly task injects
 * the IPC verbs + the real event push. No IPC runtime is touched here (the
 * 5.x BUILD layering rule).
 *
 * Scope of this half (the task split): the toolbar + the three views —
 * 视图 A 依赖树 (5.6, the DEFAULT per ui-design) / 视图 B 状态分组 / 视图 C
 * 列表. All three share the filter/sort state owned here.
 *
 * State ownership (Hard Rule: 视图 A/B/C 切换不重置筛选与滚动位置): the
 * filter/sort/collapse state lives HERE, above the views — a view switch
 * only swaps the panel. The vertical scroller is the shell's content area
 * (never remounted by a switch); view B's own horizontal scroll is stashed
 * on leave and restored on re-entry.
 *
 * 回流 updating 态 (ui-design): a `task_updated` event lands as a ROW-LEVEL
 * highlight (0.3s fade-out fill) + an aria-live polite announcement — never
 * a full-page reset. The data merge behind events is the 5.15 assembly's
 * (the mock channel only proves the presentation).
 *
 * Task 5.8 mounts the UF3 detail dock (tech-design §Integration UF3): the
 * SELECTION STORE below is the linkage's single source (Hard Rule: one
 * store, the three views never keep copies) — 视图 B 行 / 视图 C 行 / 视图 A
 * 节点 activations all write it, the dock + every view's selected highlight
 * read it. The dock overlays the page root's right edge (z100, no mask) and
 * the root insets its flow layout by the dock's exact width while open, so
 * the views shrink and bounce back instead of sliding under the overlay.
 * Selection survives close (页内会话期: reopening restores the last task) and
 * is KEYED, not visibility-coupled: a filter hiding the selected task keeps
 * the dock open (the task exists; the 回流 structural deletion → dock error
 * path is 5.15's event merge). An outside press on a board SELECTABLE is
 * mid-selection, not an outside click — its activation switches the dock in
 * place (the aria-busy repaint, 无闪烁) instead of close-then-reopen.
 *
 * Read-only discipline (BIZ-task-ops-001 Hard Rule): the page renders no
 * write affordance of any kind — interactions are navigation (the onSelect
 * seam the dock claims) and view control (toolbar) only. A sync error is
 * a TOOLBAR light with a retry, never a view error: the board keeps its
 * data beside it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Viewport } from '@xyflow/react'
import type { DispatchRow, DispatchState, SessionLink, TaskBoardData, TaskSummary, TaskStatus, WorkbenchEvent } from '../ipc-types'
import type { DispatchFace, TaskBoardFace, TaskDetailFace } from '../contract'
import type { WorkbenchKey } from '../locale/en'
import { TASK_STATUSES } from '../i18n/task-status'
import { ChromeButton } from '../components/chrome/ChromeButton'
import { createMockTaskBoardFace } from '../mocks/workbench'
import { createSelectedTaskStore } from '../store/selected-task'
import type { BoardSessionStore } from '../store/board-session'
import { fillTemplate } from './overview/format'
import {
  DEFAULT_BOARD_FILTER, TaskToolbar, type BoardFilterState, type BoardSortKey, type BoardViewKey,
} from './tasks/TaskToolbar'
import { DepTreeView } from './tasks/DepTreeView'
import { StatusBoard } from './tasks/StatusBoard'
import { TaskList } from './tasks/TaskList'
import { TaskDetailPanel, DETAIL_DOCK_WIDTH, type TaskDetailDispatchMount } from './tasks/TaskDetailPanel'
import type { DagDecorMount } from './tasks/dag/build-graph'
import { hasDispatchableEntry, type DispatchVerbs } from './tasks/dispatch/selection-mode'
import { DetailJumpButton, SelectionCheckbox, SelectionLayer, useDispatchSelection } from './tasks/dispatch/SelectionLayer'
import { DispatchToolbarButton } from './tasks/dispatch/DispatchToolbarButton'
import { ApprovalToolbarButton } from './tasks/dispatch/ApprovalCountBadge'
import { ApprovalPanel, useApprovals, type ApprovalVerbs } from './tasks/dispatch/ApprovalPanel'
import {
  createDispatchAnnouncer, DispatchBadge, orchAnnounceText, ORCH_ANNOUNCE_WINDOW_MS,
} from './tasks/dispatch/DispatchBadge'

/** The local id of a qualified board key: `feature/5.5` → `5.5`. */
export function localIdOf(key: string): string {
  const slash = key.lastIndexOf('/')
  return slash === -1 ? key : key.slice(slash + 1)
}

/** The workbench dialect task address (task 2.5): `<featureSlug>/<localId>`. */
export function qualifyTaskKey(featureSlug: string, localId: string): string {
  return `${featureSlug}/${localId}`
}

/**
 * Resolve a same-feature LOCAL blocker onto its board address (task 2.5
 * dialect: blockers stay local keys within the blocker's feature namespace).
 */
export function resolveBlockerKey(featureSlug: string, blocker: string): string {
  return `${featureSlug}/${blocker}`
}

/**
 * The filter family (标题/任务号 search + 状态 multi-select + feature +
 * worktree). An empty `statuses` set means NO restriction; the search
 * matches title, qualified key, and local id, case-insensitively.
 */
export function filterTasks(
  tasks: readonly TaskSummary[],
  filter: BoardFilterState,
): TaskSummary[] {
  const query = filter.search.trim().toLowerCase()
  return tasks.filter((task) => {
    if (query !== '') {
      const haystacks = [task.title.toLowerCase(), task.key.toLowerCase(), localIdOf(task.key).toLowerCase()]
      if (!haystacks.some(field => field.includes(query))) return false
    }
    if (filter.statuses.size > 0 && !filter.statuses.has(task.status)) return false
    if (filter.featureSlug !== null && task.featureSlug !== filter.featureSlug) return false
    if (filter.worktreeOnly && !task.worktree) return false
    return true
  })
}

/**
 * The C list's sort: `status` = the canonical TASK_STATUSES rank ascending
 * (the same order view B's columns use); `updatedAt` = newest first. Ties
 * break on the key, deterministically.
 */
export function sortTasks(tasks: readonly TaskSummary[], sort: BoardSortKey): TaskSummary[] {
  const sorted = [...tasks]
  if (sort === 'status') {
    sorted.sort((a, b) =>
      TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status)
      || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  } else {
    sorted.sort((a, b) =>
      (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)
      || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  }
  return sorted
}

/**
 * key → dangling LOCAL blockers, resolved against the FULL task set (never
 * the filtered subset — a filter must not manufacture 悬空 marks). 6.2's
 * consistency expectation: a blocker addressing no task in the set renders
 * the 悬空标记.
 */
export function computeDanglingByTask(
  tasks: readonly TaskSummary[],
): Map<string, readonly string[]> {
  const keys = new Set(tasks.map(task => task.key))
  const dangling = new Map<string, readonly string[]>()
  for (const task of tasks) {
    const missing = task.blockers.filter(
      blocker => !keys.has(resolveBlockerKey(task.featureSlug, blocker)),
    )
    if (missing.length > 0) dangling.set(task.key, missing)
  }
  return dangling
}

/** The distinct feature slugs present in the board data, sorted (the ▾ options). */
export function featureSlugsOf(tasks: readonly TaskSummary[]): string[] {
  return [...new Set(tasks.map(task => task.featureSlug))].sort()
}

/** Inputs of {@link TaskBoardPage}. */
export interface TaskBoardPageProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The active project the board reads (the Interface 1 verb argument). */
  projectId?: string | undefined
  /**
   * The active project's codeRoot — present mounts the dock's UF5
   * panel-primary launch entry AND the DAG node cards' hover triggers (5.11).
   */
  codeRoot?: string | undefined
  /** The 5.7 detail-dock selection seam — a row/card activation hands the task over. */
  onSelect?: ((task: TaskSummary) => void) | undefined
  /** The page face — absent members fall back to the build-stage mock (5.15 injects the IPC face). */
  face?: Partial<TaskBoardFace> | undefined
  /** The detail dock's face — absent members fall back to the build-stage mock (5.15 injects the IPC face). */
  detailFace?: Partial<TaskDetailFace> | undefined
  /** The session jump hand-over (5.11; M3 6.1: the dispatch chain's 「进入会话」 seam). */
  onLaunched?: import('../contract').SessionLaunchHandover | undefined
  /**
   * The board session store (5.11 AC3/AC4): present = the plugin-lifetime
   * selection/scroll/badge memory (survives the launch round-trip's shell
   * unmount); absent = per-mount stores (the 5.8 behavior, unit tests).
   */
  session?: BoardSessionStore | undefined
  /**
   * The assembly's re-feed token (5.15, the OverviewPage reloadToken
   * precedent): a change re-fires load() WITHOUT a remount — the
   * event-driven refresh path (store publish → view token) feeds the new
   * snapshot through the same face, so rows update in place (the Hard Rule:
   * 回流 never rebuilds the page). Absent/stable = the build-stage
   * mount-once behavior.
   */
  reloadToken?: number | undefined
  /**
   * The UF1 orchestration face (task 3.9): present + complete = the UF1
   * wiring goes live (toolbar 派发/审批 N, selection mode over the three
   * views, the 编排角标谱, the approval dock, the detail-side dispatch form);
   * absent = the UF1 toolbar entry stays disabled and the M2 board is
   * EXACTLY its former self (no silent mock — mock 全撤 discipline; tests
   * inject the mock twin through this prop).
   */
  dispatchFace?: Partial<DispatchFace> | undefined
}

/**
 * The board selectable family — the elements whose activation SELECTS (and
 * so must not count as the dock's 点击侧板外 close trigger): a view B card, a
 * view C row, a view A DAG node wrapper (the lib keys them `data-id`).
 */
const SELECTABLE_SELECTOR = '[data-dsh-forge-task-card], [data-dsh-forge-task-row], [data-dsh-forge-dep-tree] [data-id]'

const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: '0',
  // The dock anchors here (absolute, right edge) while the flow layout
  // yields to it through the open-state right inset — 见 the 5.8 wiring.
  position: 'relative',
} as const

/** Shared card face for the non-data states (empty / no-match / error). */
const cardStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  padding: '14px',
} as const

const errorCardStyle = {
  ...cardStyle,
  border: '1.5px solid var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
} as const

const emptyCardStyle = {
  ...cardStyle,
  alignItems: 'center',
  border: '1px dashed var(--dsh-border-color, CanvasText)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '48px 14px',
  textAlign: 'center',
} as const

const cardTitleStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
} as const

const cardBodyStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  maxWidth: '420px',
} as const

/** md primary pill (the retry / clear CTAs). */
const primaryButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '18px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  height: '36px',
  padding: '0 16px',
} as const

/** Skeleton gray rows (ui-design loading 态: 列表灰行). */
const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '32px',
} as const

/** Visually hidden (the aria-live announcement lives here, out of the layout). */
const srOnlyStyle = {
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const

/** How long a 回流 highlight stays lit before fading out (0.3s fade + read time). */
const UPDATING_HIGHLIGHT_MS = 1500

/**
 * The inert verb twins the UF1 controllers idle against while no dispatch
 * face is wired (task 3.9): every member rejects — and none is ever
 * INVOKED, because the toolbar's 派发 entry renders disabled without a face
 * and the approval dock never opens. Presence, not behavior, is the point.
 */
const IDLE_CHAIN_VERBS: DispatchVerbs = {
  checkStageArtifacts: async () => { throw new Error('dispatch verbs unavailable') },
  dispatchTasks: async () => { throw new Error('dispatch verbs unavailable') },
}

/** The approval family's idle twin (same discipline as {@link IDLE_CHAIN_VERBS}). */
const IDLE_APPROVAL_VERBS: ApprovalVerbs = {
  listApprovals: async () => { throw new Error('dispatch verbs unavailable') },
  decideApproval: async () => { throw new Error('dispatch verbs unavailable') },
}

/**
 * The board page. Renders nothing but the skeleton until the first loadBoard
 * settles; a failed REFRESH keeps the last good board (only a failed FIRST
 * load shows the error card), exactly like the overview page's load.
 */
export function TaskBoardPage(props: TaskBoardPageProps) {
  // Build-stage default face: one isolated mock twin per mount (the 5.15
  // assembly spreads the IPC-backed members over it).
  const [defaultFace] = useState(() => createMockTaskBoardFace())
  const face: TaskBoardFace = { ...defaultFace, ...props.face }

  const [phase, setPhase] = useState<'loading' | 'ready' | 'load-error'>('loading')
  const [board, setBoard] = useState<TaskBoardData | undefined>(undefined)
  // ui-design UF2: 视图 A 依赖树 is the board's default view (since 5.6).
  const [view, setView] = useState<BoardViewKey>('tree')
  const [filter, setFilter] = useState<BoardFilterState>(DEFAULT_BOARD_FILTER)
  const [sort, setSort] = useState<BoardSortKey>('status')
  const [collapsedStatuses, setCollapsedStatuses] = useState<ReadonlySet<TaskStatus>>(new Set())
  const [updatingKeys, setUpdatingKeys] = useState<ReadonlySet<string>>(new Set())
  const [announcement, setAnnouncement] = useState<string | undefined>(undefined)
  const hasLoaded = useRef(false)
  const clearTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const pageRef = useRef<HTMLDivElement>(null)
  const updatingKeysRef = useRef<ReadonlySet<string>>(new Set())
  // The 5.15 event-merge coupling (ui-design UF2 回流·结构性): task_updated
  // events with changeKind 'structural' land their keys here; a load that
  // settles WITHOUT one of those keys in the board means the task was
  // DELETED — if the dock is open on it, the dock must flip to its error
  // state (焦点任务被删且侧板开启 → 侧板转错误态). Keys proven alive by a
  // settled board retire their marker (structural ≠ deleted); markers for
  // absent keys persist so a mid-flight event can't be lost to a settle
  // that raced the snapshot upsert.
  const structuralKeysRef = useRef<Set<string>>(new Set())
  const [detailReload, setDetailReload] = useState(0)

  // The UF3 selection store (task 5.8, Hard Rule: the linkage's ONE source).
  // One instance per page mount = the AC's 页内会话期 scope — UNLESS the
  // assembly handed the plugin-lifetime board session store (5.11 AC4: the
  // launch round-trip unmounts the shell in the slot path; the injected
  // selection survives it); every activation writes here, the dock and the
  // views' selected marks read from here.
  const [localSelection] = useState(() => createSelectedTaskStore())
  const selection = props.session?.selection ?? localSelection
  const selected = useSyncExternalStore(selection.subscribe, selection.getSnapshot)
  // Latest-value mirror for the load path (the structural-deletion check
  // reads the selection at SETTLE time, not at effect-arming time).
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  // The 运行中徽标 data (5.11 AC3): the board session store's active-link map
  // (launch success writes it; the dock's authoritative link reads reconcile
  // it). Without a session store the board keeps no badge (per-mount scope).
  const NO_ACTIVE_LINKS = useMemo(() => new Map<string, string>(), [])
  const activeLinks = useSyncExternalStore(
    props.session?.subscribeLinks ?? (() => () => {}),
    props.session?.getActiveLinks ?? (() => NO_ACTIVE_LINKS),
  )

  // Outside-close arbitration (5.8): the dock closes on outside pointerdowns
  // EXCEPT presses on a board SELECTABLE — ui-design UF2 makes 点击节点/行 the
  // dock's OPEN/switch trigger, so such a press is mid-selection, not an
  // outside click; its activation then switches the dock in place (无闪烁).
  // This capture listener registers at PAGE mount — before the dock's own
  // listener can exist (the dock only mounts on a later commit) — so the
  // sentinel is set before the dock's handler asks. It lives exactly the
  // press: pointerup/pointercancel (and the completing click) clear it, so an
  // Esc / ✕ close never consults a stale press.
  const selectablePressRef = useRef(false)
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      selectablePressRef.current = target instanceof Element
        && target.closest(SELECTABLE_SELECTOR) !== null
    }
    const release = (): void => { selectablePressRef.current = false }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerup', release, true)
    document.addEventListener('pointercancel', release, true)
    document.addEventListener('click', release, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerup', release, true)
      document.removeEventListener('pointercancel', release, true)
      document.removeEventListener('click', release, true)
    }
  }, [])

  /** Every source's one write path: select + open, then the shell seat observes. */
  const handleSelect = useCallback((task: TaskSummary): void => {
    // Selection mode's 命中区域划分 (task 3.9): the card's whole surface is
    // the CHECKBOX toggle (the SelectionLayer already toggled it); the M2
    // open-detail semantics stay suppressed until the mode exits.
    if (selectionActiveRef.current) return
    // The 同层互斥: a detail activation closes the approval dock and drops
    // the 返回审批 round-trip context (this entry is NOT from the dock).
    closeApprovalDockRef.current()
    setDetailFromApproval(false)
    selection.select(task.key)
    props.onSelect?.(task)
    // The two refs above are the UF1 controllers' late-bound seams (assigned
    // in the controllers block below, once the machines exist).
  }, [selection, props.onSelect])

  /**
   * The dock's close (Esc / ✕ / true outside click): drop only the open arm —
   * the key stays as the reopen-restore memory (页内会话期).
   */
  const handleCloseDock = useCallback((): void => {
    if (selectablePressRef.current) return
    selection.close()
  }, [selection])

  /** The dep-chain jump: retarget the SAME selection (dock repaints in place). */
  const handleNavigate = useCallback((taskKey: string): void => {
    selection.select(taskKey)
  }, [selection])

  // Latest-value refs for the mount-once effects (load / event subscription).
  const tRef = useRef(props.t)
  tRef.current = props.t
  const projectIdRef = useRef(props.projectId)
  projectIdRef.current = props.projectId

  // -------------------------------------------------------------------------
  // UF1 wiring, task 3.9 (tech-design §Integration #1). The dispatch face is
  // the whole UF1 switch: present + complete = the orchestration surface goes
  // live; absent = the board is EXACTLY its M2 self (the 派发 entry disabled,
  // no badges, no dock — never a silent mock twin).
  // -------------------------------------------------------------------------
  const dispatch: DispatchFace | undefined = useMemo(() => {
    const face = props.dispatchFace
    if (face === undefined) return undefined
    if (face.checkStageArtifacts === undefined || face.dispatchTasks === undefined
      || face.redispatch === undefined || face.getDispatches === undefined
      || face.listApprovals === undefined || face.decideApproval === undefined) return undefined
    return face as DispatchFace
  }, [props.dispatchFace])
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch

  /** The project's dispatch rows — the 编排角标谱 + the detail section's data. */
  const [dispatchRows, setDispatchRows] = useState<readonly DispatchRow[]>([])
  const refreshDispatches = useCallback((): void => {
    const face = dispatchRef.current
    if (face === undefined) return
    void face.getDispatches(projectIdRef.current ?? '')
      .then((rows) => { setDispatchRows(rows) })
      .catch(() => {
        // A failed rows read keeps the last good spectrum (the same
        // last-good-board discipline as load); the next reflux re-fires it.
      })
  }, [])
  useEffect(() => {
    if (dispatch === undefined) return
    refreshDispatches()
  }, [dispatch, props.projectId, refreshDispatches])

  // The aria-live 播报节流 (ui-design 全局规则): every orchestration reflux
  // announcement goes through ONE announcer — per-task 2s windows (终态 wins),
  // ≥2 ready tasks aggregate into one batch line, the approval count rides as
  // its own single line. The drain timer fires once per quiet window.
  const announcer = useMemo(() => createDispatchAnnouncer(), [])
  const [orchAnnounce, setOrchAnnounce] = useState<string | undefined>(undefined)
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleAnnounceDrain = useCallback((): void => {
    announcer.drain(Date.now()) // anchor the pending windows (emits nothing yet)
    if (announceTimerRef.current !== null) return
    announceTimerRef.current = setTimeout(() => {
      announceTimerRef.current = null
      const lines = announcer.drain(Date.now())
      if (lines.length === 0) return
      setOrchAnnounce(lines.map(line => orchAnnounceText(line, tRef.current)).join(' '))
      setTimeout(() => { setOrchAnnounce(undefined) }, UPDATING_HIGHLIGHT_MS)
    }, ORCH_ANNOUNCE_WINDOW_MS)
  }, [announcer])
  useEffect(() => () => {
    if (announceTimerRef.current !== null) clearTimeout(announceTimerRef.current)
  }, [])

  // The pending-approval count (the toolbar 「审批 N」 face; the dock's
  // controller owns the number, this mirror feeds the button + the announcer).
  const [approvalCount, setApprovalCount] = useState(0)
  // The 审批 round-trip flag: the detail dock was entered FROM the approval
  // dock (详情 ↗) → the detail head carries 「◂ 返回审批(N)」.
  const [detailFromApproval, setDetailFromApproval] = useState(false)
  // Late-bound seams the early handlers (handleSelect) close over — assigned
  // in the UF1 controllers block below (the same render-time mirror style as
  // selectedRef/projectIdRef above).
  const selectionActiveRef = useRef(false)
  const closeApprovalDockRef = useRef<() => void>(() => {})

  const load = async (): Promise<TaskBoardData | undefined> => {
    try {
      const next = await face.loadBoard(projectIdRef.current ?? '')
      hasLoaded.current = true
      setBoard(next)
      setPhase('ready')
      // The structural-deletion coupling (5.15, see structuralKeysRef): a
      // structurally-flagged key absent from the settled board while the
      // dock is open on it → force the dock to re-read (the verb rejects on
      // a deleted task → the dock's error card — the spec's 侧板转错误态).
      const selectionNow = selectedRef.current
      const openKey = selectionNow.open ? selectionNow.taskKey : undefined
      if (openKey !== undefined && structuralKeysRef.current.has(openKey)
        && !next.tasks.some(task => task.key === openKey)) {
        setDetailReload(nonce => nonce + 1)
      }
      // Markers proven alive by this snapshot retire (structural ≠ deleted);
      // markers of absent keys persist for the next settle (the race note
      // on structuralKeysRef).
      for (const key of structuralKeysRef.current) {
        if (next.tasks.some(task => task.key === key)) structuralKeysRef.current.delete(key)
      }
      return next
    } catch {
      // A failed FIRST load has nothing to render — the retry card. A failed
      // refresh (the sync-retry path) keeps the last good board.
      if (!hasLoaded.current) setPhase('load-error')
      return undefined
    }
  }

  // Mount-time initial load + the assembly's re-feed leg (5.15): the effect
  // re-arms on reloadToken changes — the view bumps the token when the
  // store published data the page didn't fetch itself (the OverviewPage
  // reloadToken precedent). The face identity stays fixed for the page's
  // life, like the overview page's.
  useEffect(() => {
    void load()
  }, [props.reloadToken])

  // 6.4 (SC5-2 无跨项目残留): bind the plugin-lifetime session to THIS page's
  // project on mount — a project switch re-keys the shell's TasksView, and the
  // rebind closes a selection the previous project opened (same-project
  // remounts — the 5.11 UF5 round trip — keep it, store/ board-session.ts).
  useEffect(() => {
    if (props.session === undefined || props.projectId === undefined) return
    props.session.bindProject(props.projectId)
  }, [props.session, props.projectId])

  const handleEvents = useCallback((events: readonly WorkbenchEvent[]): void => {
    // Foreign projects' events are not this board's concern (the assembly
    // subscribes per active project; undefined projectId accepts all — the
    // build-stage page has no real project binding yet).
    const mine = (event: WorkbenchEvent): boolean =>
      projectIdRef.current === undefined
      || ('projectId' in event && event.projectId === projectIdRef.current)
    // The UF1 orchestration reflux (task 3.9, ≤5s 免手动刷新): dispatch_updated
    // drives the 编排角标谱 — rows re-read in place (attribute-level: the
    // views keep their filter/scroll/focus state), the announcement rides
    // the ONE throttled announcer. approval_received lands the same way
    // through the approval dock's own subscription (the shared channel).
    const dispatchUpdates = events.filter((event): event is Extract<typeof event, { type: 'dispatch_updated' }> =>
      event.type === 'dispatch_updated' && mine(event))
    if (dispatchUpdates.length > 0) {
      for (const event of dispatchUpdates) announcer.pushState(event.taskKey, event.state)
      scheduleAnnounceDrain()
      refreshDispatches()
    }
    const updates = events.filter((event): event is Extract<typeof event, { type: 'task_updated' }> =>
      event.type === 'task_updated' && mine(event))
    if (updates.length === 0) return
    // The structural markers ride the same filtered stream (5.15's
    // event-merge coupling — see structuralKeysRef).
    for (const event of updates) {
      if (event.changeKind === 'structural') structuralKeysRef.current.add(event.taskKey)
    }
    const keys = new Set([...updatingKeysRef.current, ...updates.map(event => event.taskKey)])
    updatingKeysRef.current = keys
    setUpdatingKeys(keys)
    setAnnouncement(updates
      .map(event => fillTemplate(tRef.current('tasks.updated.announce'), { key: event.taskKey }))
      .join(' '))
    // Row-level light only: light it, fade it, never touch the view state
    // (filters/scroll stay put — the Hard Rule covers the 回流 path too).
    for (const timer of clearTimers.current) clearTimeout(timer)
    clearTimers.current = [setTimeout(() => {
      updatingKeysRef.current = new Set()
      setUpdatingKeys(new Set())
      setAnnouncement(undefined)
    }, UPDATING_HIGHLIGHT_MS)]
  }, [])

  // The 回流 channel: Interface 1 onEvents, single subscription for the
  // page's life; the unsubscribe rides the unmount.
  useEffect(() => {
    const unsubscribe = face.subscribeEvents(handleEvents)
    return () => {
      unsubscribe()
      for (const timer of clearTimers.current) clearTimeout(timer)
    }
  }, [])

  // View-switch scroll preservation (Hard Rule): stash view B's horizontal
  // offset at SWITCH TIME (while the grouped DOM is still mounted — an effect
  // cleanup would already see the next view's DOM), restore on re-entry. The
  // vertical scroller is the shell's content area — never remounted, never
  // reset by a switch. The tree's pan/zoom rides the same rule through the
  // settled-viewport stash (updated on every move end while view A is open,
  // re-applied as its defaultViewport on re-entry — fit-view stays first-load
  // only). With a session store (5.11 AC4) the same memory ALSO survives a
  // page unmount (the launch round-trip): hydrate at mount, save on unmount.
  const [sessionScroll] = useState(() => props.session?.getScroll())
  const treeViewport = useRef<Viewport | undefined>(sessionScroll?.treeViewport)
  const statusBoardScrollLeft = useRef(sessionScroll?.statusBoardScrollLeft ?? 0)
  useEffect(() => () => {
    props.session?.saveScroll({
      treeViewport: treeViewport.current,
      statusBoardScrollLeft: statusBoardScrollLeft.current,
    })
    // The session store identity is fixed for the app's life; the save reads
    // the refs at unmount time (the 5.11 AC4 memory's write leg).
  }, [])
  const handleViewChange = (next: BoardViewKey): void => {
    if (view === 'grouped' && next !== 'grouped') {
      const container = pageRef.current?.querySelector<HTMLElement>('[data-dsh-forge-status-board]')
      if (container !== null && container !== undefined) {
        statusBoardScrollLeft.current = container.scrollLeft
      }
    }
    setView(next)
  }
  useEffect(() => {
    if (view !== 'grouped') return
    const container = pageRef.current?.querySelector<HTMLElement>('[data-dsh-forge-status-board]')
    if (container !== null && container !== undefined) container.scrollLeft = statusBoardScrollLeft.current
  }, [view, phase])

  const allTasks = useMemo(() => board?.tasks ?? [], [board])
  const danglingByTask = useMemo(() => computeDanglingByTask(allTasks), [allTasks])
  const featureSlugs = useMemo(() => featureSlugsOf(allTasks), [allTasks])
  const visibleTasks = useMemo(
    () => sortTasks(filterTasks(allTasks, filter), sort),
    [allTasks, filter, sort],
  )

  // -------------------------------------------------------------------------
  // UF1 controllers + the dock mutex (task 3.9). The selection chain and the
  // approval dock run on EVERY mount (unconditional hooks); without a
  // dispatch face they idle — nothing reaches a verb.
  // -------------------------------------------------------------------------
  const selectionController = useDispatchSelection({
    entries: allTasks,
    projectId: props.projectId ?? '',
    verbs: dispatch ?? IDLE_CHAIN_VERBS,
    ...(dispatch === undefined ? {} : { onDispatched: () => { refreshDispatches() } }),
  })
  const approvals = useApprovals({
    projectId: props.projectId ?? '',
    verbs: dispatch ?? IDLE_APPROVAL_VERBS,
    subscribeEvents: face.subscribeEvents,
    ...(dispatch === undefined ? {} : { onDecided: () => { refreshDispatches() } }),
    onCountChange: (count) => {
      setApprovalCount(count)
      // The approval-count announcement line rides ONLY on a POSITIVE count
      // (a count dropping to 0 is the user's own decision — the dock's own
      // decided announcement covers it; a mount-time 0 never arms the
      // announcer's drain timer).
      if (count > 0) {
        announcer.pushApprovalCount(count)
        scheduleAnnounceDrain()
      }
    },
  })
  const selectionActive = selectionController.snapshot.phase !== 'idle'
  const approvalDockOpen = approvals.snapshot.phase !== 'closed'

  // Latest-value mirrors keep the M2 handlers stable (the DAG launch mount's
  // memo keys on its handler identities — an approval snapshot change must
  // not rebuild the graph). The two EARLY refs (selectionActiveRef /
  // closeApprovalDockRef) are the pre-controller seams handleSelect closes over.
  selectionActiveRef.current = selectionActive
  const approvalsRef = useRef(approvals)
  approvalsRef.current = approvals
  closeApprovalDockRef.current = () => { approvals.close() }

  /**
   * The 同层互斥 core (ui-design 层叠与共存): the approval dock and the detail
   * dock are presentation-exclusive — opening one closes the other; the
   * 「详情 ↗」/「◂ 返回审批」round-trip keeps each side's state (the approval
   * machine survives its closed face; the selection store keeps the key).
   */
  const openApprovalDock = useCallback((locateTaskKey?: string): void => {
    if (selectedRef.current.open) selection.close()
    approvalsRef.current.open(locateTaskKey)
  }, [selection])
  const openDetailFromApproval = useCallback((taskKey: string): void => {
    approvalsRef.current.close()
    setDetailFromApproval(true)
    selection.select(taskKey)
  }, [selection])
  const returnToApproval = useCallback((): void => {
    selection.close()
    setDetailFromApproval(false)
    approvalsRef.current.open()
  }, [selection])

  /**
   * The ⤢ / Enter detail entry INSIDE selection mode (ui-design 命中区域划
   * 分): opens the dock WITHOUT leaving the mode; the mutex closes the
   * approval dock (this entry is not from it).
   */
  const handleOpenDetailFromSelection = useCallback((taskKey: string): void => {
    approvalsRef.current.close()
    setDetailFromApproval(false)
    selection.select(taskKey)
  }, [selection])

  // 「进入会话」(the orchestration section's subagent jump): the M1 view-switch
  // contract rides the hand-over seat (切会话视图 + session locating), and the
  // 运行中徽标 write rides along (AC3/AC2: back on the board, the badge reads
  // correctly off the store, unmount-surviving).
  const handleEnterSession = useCallback((sessionId: string): void => {
    if (props.projectId === undefined || props.codeRoot === undefined) return
    const taskKey = selectedRef.current.taskKey
    if (taskKey === undefined) return
    const task = allTasks.find(candidate => candidate.key === taskKey)
    if (task === undefined) return
    props.onLaunched?.(sessionId, {
      projectId: props.projectId,
      codeRoot: props.codeRoot,
      featureSlug: task.featureSlug,
      localId: localIdOf(task.key),
      title: task.title,
    })
    if (props.session !== undefined) {
      props.session.markLinkActive(props.projectId, taskKey, sessionId)
    }
  }, [props.projectId, props.codeRoot, props.onLaunched, props.session, allTasks])

  // The 编排角标谱's per-task state: the LATEST row per task (redispatch
  // mints a new row — latest-by-dispatchedAt is the live orchestration).
  const orchStates = useMemo(() => {
    const latest = new Map<string, { state: DispatchState; dispatchedAt: string }>()
    for (const row of dispatchRows) {
      const prev = latest.get(row.taskKey)
      if (prev === undefined || row.dispatchedAt >= prev.dispatchedAt) {
        latest.set(row.taskKey, { state: row.state, dispatchedAt: row.dispatchedAt })
      }
    }
    const states = new Map<string, DispatchState>()
    for (const [key, entry] of latest) states.set(key, entry.state)
    return states
  }, [dispatchRows])

  // The card-level decoration composers (角标以包装/props 传入 — the M2 views
  // render them verbatim, they never derive orchestration semantics). The
  // badge wrapper swallows the click: the awaiting pill is the card-side
  // approval ENTRY (its own action), and the card's own click handler must
  // not also run (it would close the dock the pill just opened).
  const orchBadgeOf = useCallback((taskKey: string): ReactNode => {
    const state = orchStates.get(taskKey)
    if (state === undefined) return null
    return (
      <span
        key={state}
        data-dsh-forge-orch-badge-wrap=""
        onClick={(event) => { event.stopPropagation() }}
      >
        <DispatchBadge t={props.t} taskKey={taskKey} state={state} onOpenApproval={openApprovalDock} />
      </span>
    )
  }, [orchStates, props.t, openApprovalDock])
  const selectionTitleOf = useCallback((taskKey: string): string =>
    allTasks.find(task => task.key === taskKey)?.title ?? taskKey, [allTasks])
  const selectionDecorOf = useCallback((taskKey: string): ReactNode => (
    <>
      <SelectionCheckbox taskKey={taskKey} title={selectionTitleOf(taskKey)} />
      <DetailJumpButton taskKey={taskKey} />
    </>
  ), [selectionTitleOf])
  /** The view C 行首内嵌 cell (ui-design: checkbox inline at the row's left edge). */
  const selectionCellOf = useCallback((taskKey: string): ReactNode => (
    <td style={{ padding: '6px 10px', width: '44px' }}>
      <SelectionCheckbox taskKey={taskKey} title={selectionTitleOf(taskKey)} variant="inline" />
    </td>
  ), [selectionTitleOf])
  const dagDecor = useMemo<DagDecorMount>(() => ({
    orchBadgeOf,
    selectionDecorOf,
  }), [orchBadgeOf, selectionDecorOf])

  // The detail dock's UF1 mount (task 3.9): the 3.8 chain + rows + the mutex
  // seams; present only when the dispatch face is live.
  const detailDispatchMount: TaskDetailDispatchMount | undefined = dispatch === undefined ? undefined : {
    verbs: dispatch,
    rows: dispatchRows,
    entries: allTasks,
    onDispatched: () => { refreshDispatches() },
    onOpenApproval: openApprovalDock,
    onEnterSession: handleEnterSession,
    approvalReturn: selected.open && detailFromApproval ? { count: approvalCount } : undefined,
    onReturnToApproval: returnToApproval,
  }

  // The dock's authoritative link read (5.11): getTaskDetail.links reconciles
  // the badge map (an ended/absent active link drops it — the end path).
  const handleLinksLoaded = useCallback((taskKey: string, links: readonly SessionLink[]): void => {
    if (props.session !== undefined && props.projectId !== undefined) {
      props.session.reconcileLinks(props.projectId, taskKey, links)
    }
  }, [props.session, props.projectId])

  const populated = phase === 'ready' && board !== undefined && allTasks.length > 0
  const noMatch = populated && visibleTasks.length === 0

  // The active view panel (A/B/C — one tabpanel at a time, each labelled back
  // by its toolbar tab; view A is the DAG, default since 5.6). Since 3.9 the
  // panel rides INSIDE the UF1 SelectionLayer (选择模式整面勾选 + ⤢ 详情 + Esc
  // 分层 over all three views; the layer mounts nothing while idle) and each
  // view receives the UF1 decoration composers (角标谱 + selection cluster —
  // rendered by the M2 components verbatim, never derived inside them).
  const viewPanel = (
    <SelectionLayer
      controller={selectionController}
      t={props.t}
      onOpenDetail={handleOpenDetailFromSelection}
    >
      {view === 'tree'
        ? (
          <div role="tabpanel" aria-labelledby="dsh-forge-board-view-tab-tree" data-dsh-forge-board-panel="tree">
            <DepTreeView
              t={props.t}
              tasks={visibleTasks}
              danglingByTask={danglingByTask}
              updatingKeys={updatingKeys}
              selectedKey={selected.taskKey}
              onSelect={handleSelect}
              initialViewport={treeViewport.current}
              onViewportSettled={(viewport) => { treeViewport.current = viewport }}
              activeLinks={activeLinks}
              decor={dagDecor}
            />
          </div>
        )
        : view === 'grouped'
          ? (
            <div role="tabpanel" aria-labelledby="dsh-forge-board-view-tab-grouped" data-dsh-forge-board-panel="grouped">
              <StatusBoard
                t={props.t}
                tasks={visibleTasks}
                collapsedStatuses={collapsedStatuses}
                onCollapsedStatusesChange={setCollapsedStatuses}
                danglingByTask={danglingByTask}
                updatingKeys={updatingKeys}
                selectedKey={selected.taskKey}
                onSelect={handleSelect}
                activeLinks={activeLinks}
                orchBadgeOf={orchBadgeOf}
                selectionDecorOf={selectionDecorOf}
              />
            </div>
          )
          : (
            <div role="tabpanel" aria-labelledby="dsh-forge-board-view-tab-list" data-dsh-forge-board-panel="list">
              <TaskList
                t={props.t}
                tasks={visibleTasks}
                danglingByTask={danglingByTask}
                updatingKeys={updatingKeys}
                selectedKey={selected.taskKey}
                onSelect={handleSelect}
                activeLinks={activeLinks}
                orchBadgeOf={orchBadgeOf}
                selectionCellOf={selectionCellOf}
              />
            </div>
          )}
    </SelectionLayer>
  )

  return (
    <div
      ref={pageRef}
      data-dsh-forge-task-board=""
      aria-busy={phase === 'loading' ? 'true' : 'false'}
      style={{
        ...pageStyle,
        // The dock-open right inset (AC3): exactly the dock's width, so the
        // flow layout (toolbar + views) yields the strip and bounces back on
        // close — the views shrink, they never slide under the overlay (the
        // minWidth 0 chain + B's own overflowX keep horizontal scrolling sane).
        // Since 3.9 EITHER dock (detail OR approval — 同层互斥) claims the strip.
        ...(selected.open || approvalDockOpen ? { paddingRight: DETAIL_DOCK_WIDTH } : {}),
      }}
    >
      {phase === 'loading' && (
        <div
          role="status"
          aria-label={props.t('tasks.loading')}
          data-dsh-forge-task-board-skeleton=""
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          {[0, 1, 2, 3, 4].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
        </div>
      )}

      {phase === 'load-error' && (
        <div data-dsh-forge-task-board-error="" role="alert" style={errorCardStyle}>
          <h3 style={cardTitleStyle}>{props.t('tasks.loadError.title')}</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ChromeButton
              type="button"
              data-dsh-forge-task-board-retry=""
              style={primaryButtonStyle}
              onClick={() => {
                setPhase('loading')
                void load()
              }}
            >
              {props.t('tasks.loadError.retry')}
            </ChromeButton>
          </div>
        </div>
      )}

      {phase === 'ready' && board !== undefined && allTasks.length === 0 && (
        <div data-dsh-forge-task-board-empty="" style={emptyCardStyle}>
          <h3 style={cardTitleStyle}>{props.t('tasks.empty.title')}</h3>
          <p style={cardBodyStyle}>{props.t('tasks.empty.body')}</p>
        </div>
      )}

      {populated && (
        <>
          <TaskToolbar
            t={props.t}
            view={view}
            onViewChange={handleViewChange}
            filter={filter}
            onFilterChange={setFilter}
            sort={sort}
            onSortChange={setSort}
            featureSlugs={featureSlugs}
            visibleCount={visibleTasks.length}
            totalCount={allTasks.length}
            sync={board.sync}
            onRetrySync={() => { void load() }}
            actions={(
              // UF1 工具栏追加 (task 3.9, ui-design: M2 既有控件不动,右侧追
              // 加):「派发」md 主 (disabled + tooltip 无可派发/无动词面) and
              // 「审批 N」warn Pill (N = 0 hidden, never disabled).
              <>
                <DispatchToolbarButton
                  t={props.t}
                  disabled={dispatch === undefined || !hasDispatchableEntry(allTasks)}
                  tooltip={props.t('tasks.dispatch.entry.disabledTooltip')}
                  active={selectionActive}
                  onEnter={() => { selectionController.enter() }}
                />
                <ApprovalToolbarButton
                  t={props.t}
                  count={approvalCount}
                  onOpen={() => { openApprovalDock() }}
                />
              </>
            )}
          />

          {noMatch
            ? (
              <div data-dsh-forge-task-board-nomatch="" style={emptyCardStyle}>
                <h3 style={cardTitleStyle}>{props.t('tasks.noMatch.title')}</h3>
                <p style={cardBodyStyle}>{props.t('tasks.noMatch.body')}</p>
                <ChromeButton
                  type="button"
                  data-dsh-forge-task-board-clear-filters=""
                  style={primaryButtonStyle}
                  onClick={() => { setFilter(DEFAULT_BOARD_FILTER) }}
                >
                  {props.t('tasks.noMatch.clear')}
                </ChromeButton>
              </div>
            )
            : viewPanel}

          {/* The 回流 announcement (aria-live polite, visually hidden). */}
          <p role="status" aria-live="polite" data-dsh-forge-board-announce="" style={srOnlyStyle}>
            {announcement ?? ''}
          </p>

          {/* The UF1 orchestration reflux announcements (task 3.9) — the ONE
              throttled live region every dispatch/approval-state change goes
              through (2s per-task windows, batch aggregation, approval count
              as its own line). */}
          <p role="status" aria-live="polite" data-dsh-forge-board-orch-announce="" style={srOnlyStyle}>
            {orchAnnounce ?? ''}
          </p>

          {/* UF3 (task 5.8): the detail dock — the selection store's open arm
              drives it (closed ⇒ null ⇒ not rendered; a key switch swaps the
              detail in place through the panel's aria-busy repaint). The dock
              anchors to this root's right edge; the root's open-state inset
              above made room for it. Since 3.9 the dock carries the UF1
              dispatch mount (派发执行 + 编排分区) whenever the face is live. */}
          <TaskDetailPanel
            t={props.t}
            taskKey={selected.open ? (selected.taskKey ?? null) : null}
            projectId={props.projectId}
            codeRoot={props.codeRoot}
            reloadToken={detailReload}
            face={props.detailFace}
            {...(selected.taskKey === undefined
              ? {}
              : { activeSessionId: activeLinks.get(selected.taskKey) })}
            {...(props.session === undefined ? {} : { onLinksLoaded: handleLinksLoaded })}
            onClose={handleCloseDock}
            onNavigate={handleNavigate}
            {...(detailDispatchMount === undefined ? {} : { dispatch: detailDispatchMount })}
          />

          {/* The UF1 审批 dock (task 3.9): the approval panel — 同层互斥 with
              the detail dock by the handlers above (openApprovalDock closes
              the detail; the 详情 ↗ detour reopens it with the return
              context). STAYS MOUNTED while closed (renders nothing) so the
              返回审批 restore keeps its entries + scroll. */}
          <ApprovalPanel
            controller={approvals}
            t={props.t}
            titleOf={taskKey => allTasks.find(task => task.key === taskKey)?.title}
            onOpenDetail={openDetailFromApproval}
          />
        </>
      )}
    </div>
  )
}
