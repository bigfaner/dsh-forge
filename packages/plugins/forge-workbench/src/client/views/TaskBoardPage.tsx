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
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Viewport } from '@xyflow/react'
import type { SessionLink, TaskBoardData, TaskSummary, TaskStatus, WorkbenchEvent } from '../ipc-types'
import type { TaskBoardFace, TaskDetailFace } from '../contract'
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
import { qualifyTaskKey } from './tasks/SessionLaunchEntry'
import type { SessionLaunchTaskRef } from '../contract'
import { TaskDetailPanel, DETAIL_DOCK_WIDTH } from './tasks/TaskDetailPanel'
import type { DagLaunchMount } from './tasks/dag/build-graph'

/** The local id of a qualified board key: `feature/5.5` → `5.5`. */
export function localIdOf(key: string): string {
  const slash = key.lastIndexOf('/')
  return slash === -1 ? key : key.slice(slash + 1)
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
  /** The UF5 launch services (5.11): absent members keep the build-stage mocks (the DI switch). */
  launchServices?: Partial<import('../contract').SessionLaunchServices> | undefined
  /** The UF5 success hand-over (5.11): 切会话视图 + session locating fires through both mounts. */
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
    selection.select(task.key)
    props.onSelect?.(task)
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

  const handleEvents = useCallback((events: readonly WorkbenchEvent[]): void => {
    // Foreign projects' events are not this board's concern (the assembly
    // subscribes per active project; undefined projectId accepts all — the
    // build-stage page has no real project binding yet).
    const updates = events.filter((event): event is Extract<typeof event, { type: 'task_updated' }> =>
      event.type === 'task_updated'
      && (projectIdRef.current === undefined || event.projectId === projectIdRef.current))
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

  // The UF5 success leg (5.11): delegate the hand-over (切会话视图 + session
  // locating — the shell's seat), then write the 运行中徽标 into the board
  // session store for the launched task's qualified key (AC3/AC2: back on the
  // board, the badge reads correctly off the store, unmount-surviving).
  const handleLaunched = useCallback((sessionId: string, task: SessionLaunchTaskRef): void => {
    props.onLaunched?.(sessionId, task)
    if (props.session !== undefined && props.projectId !== undefined) {
      props.session.markLinkActive(props.projectId, qualifyTaskKey(task.featureSlug, task.localId), sessionId)
    }
  }, [props.onLaunched, props.session, props.projectId])

  // The dock's authoritative link read (5.11): getTaskDetail.links reconciles
  // the badge map (an ended/absent active link drops it — the end path).
  const handleLinksLoaded = useCallback((taskKey: string, links: readonly SessionLink[]): void => {
    if (props.session !== undefined && props.projectId !== undefined) {
      props.session.reconcileLinks(props.projectId, taskKey, links)
    }
  }, [props.session, props.projectId])

  // The DAG's launch mount (5.11): one memoized object — the graph rebuild
  // keys on its identity, so the entries' props stay referentially stable
  // between renders (a services/onLaunched change is a REAL change).
  const dagLaunchMount = useMemo<DagLaunchMount | undefined>(() => {
    if (props.projectId === undefined || props.codeRoot === undefined) return undefined
    return {
      projectId: props.projectId,
      codeRoot: props.codeRoot,
      ...(props.launchServices === undefined ? {} : { services: props.launchServices }),
      onLaunched: handleLaunched,
    }
  }, [props.projectId, props.codeRoot, props.launchServices, handleLaunched])

  const populated = phase === 'ready' && board !== undefined && allTasks.length > 0
  const noMatch = populated && visibleTasks.length === 0

  // The active view panel (A/B/C — one tabpanel at a time, each labelled back
  // by its toolbar tab; view A is the DAG, default since 5.6).
  const viewPanel = view === 'tree'
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
          {...(dagLaunchMount === undefined ? {} : { launch: dagLaunchMount })}
          activeLinks={activeLinks}
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
          />
        </div>
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
        ...(selected.open ? { paddingRight: DETAIL_DOCK_WIDTH } : {}),
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

          {/* UF3 (task 5.8): the detail dock — the selection store's open arm
              drives it (closed ⇒ null ⇒ not rendered; a key switch swaps the
              detail in place through the panel's aria-busy repaint). The dock
              anchors to this root's right edge; the root's open-state inset
              above made room for it. */}
          <TaskDetailPanel
            t={props.t}
            taskKey={selected.open ? (selected.taskKey ?? null) : null}
            projectId={props.projectId}
            codeRoot={props.codeRoot}
            reloadToken={detailReload}
            face={props.detailFace}
            {...(props.launchServices === undefined ? {} : { services: props.launchServices })}
            onLaunched={handleLaunched}
            {...(selected.taskKey === undefined
              ? {}
              : { activeSessionId: activeLinks.get(selected.taskKey) })}
            {...(props.session === undefined ? {} : { onLinksLoaded: handleLinksLoaded })}
            onClose={handleCloseDock}
            onNavigate={handleNavigate}
          />
        </>
      )}
    </div>
  )
}
