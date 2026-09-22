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
 * Scope of this half (the task split): the toolbar + 视图 B(状态分组) +
 * 视图 C(列表). 视图 A 依赖树 is 5.6's — the switcher renders its tab as a
 * disabled 5.6 placeholder, so the switcher contract (A/B/C) is already the
 * final one.
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
 * Read-only discipline (BIZ-task-ops-001 Hard Rule): the page renders no
 * write affordance of any kind — interactions are navigation (the onSelect
 * seam 5.7's dock claims) and view control (toolbar) only. A sync error is
 * a TOOLBAR light with a retry, never a view error: the board keeps its
 * data beside it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TaskBoardData, TaskSummary, TaskStatus, WorkbenchEvent } from '../ipc-types'
import type { TaskBoardFace } from '../contract'
import type { WorkbenchKey } from '../locale/en'
import { TASK_STATUSES } from '../i18n/task-status'
import { ChromeButton } from '../components/chrome/ChromeButton'
import { createMockTaskBoardFace } from '../mocks/workbench'
import { fillTemplate } from './overview/format'
import {
  DEFAULT_BOARD_FILTER, TaskToolbar, type BoardFilterState, type BoardSortKey, type BoardViewKey,
} from './tasks/TaskToolbar'
import { StatusBoard } from './tasks/StatusBoard'
import { TaskList } from './tasks/TaskList'

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
  /** The 5.7 detail-dock selection seam — a row/card activation hands the task over. */
  onSelect?: ((task: TaskSummary) => void) | undefined
  /** The page face — absent members fall back to the build-stage mock (5.15 injects the IPC face). */
  face?: Partial<TaskBoardFace> | undefined
}

const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: '0',
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
  const [view, setView] = useState<BoardViewKey>('grouped')
  const [filter, setFilter] = useState<BoardFilterState>(DEFAULT_BOARD_FILTER)
  const [sort, setSort] = useState<BoardSortKey>('status')
  const [collapsedStatuses, setCollapsedStatuses] = useState<ReadonlySet<TaskStatus>>(new Set())
  const [updatingKeys, setUpdatingKeys] = useState<ReadonlySet<string>>(new Set())
  const [announcement, setAnnouncement] = useState<string | undefined>(undefined)
  const hasLoaded = useRef(false)
  const clearTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const statusBoardScrollLeft = useRef(0)
  const pageRef = useRef<HTMLDivElement>(null)
  const updatingKeysRef = useRef<ReadonlySet<string>>(new Set())

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
      return next
    } catch {
      // A failed FIRST load has nothing to render — the retry card. A failed
      // refresh (the sync-retry path) keeps the last good board.
      if (!hasLoaded.current) setPhase('load-error')
      return undefined
    }
  }

  // Mount-once initial load (the face identity is fixed for the page's life,
  // like the overview page's).
  useEffect(() => {
    void load()
  }, [])

  const handleEvents = useCallback((events: readonly WorkbenchEvent[]): void => {
    // Foreign projects' events are not this board's concern (the assembly
    // subscribes per active project; undefined projectId accepts all — the
    // build-stage page has no real project binding yet).
    const updates = events.filter((event): event is Extract<typeof event, { type: 'task_updated' }> =>
      event.type === 'task_updated'
      && (projectIdRef.current === undefined || event.projectId === projectIdRef.current))
    if (updates.length === 0) return
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
  // reset by a switch.
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

  const populated = phase === 'ready' && board !== undefined && allTasks.length > 0
  const noMatch = populated && visibleTasks.length === 0

  return (
    <div ref={pageRef} data-dsh-forge-task-board="" aria-busy={phase === 'loading' ? 'true' : 'false'} style={pageStyle}>
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
            : view === 'grouped'
              ? (
                <div
                  role="tabpanel"
                  aria-labelledby="dsh-forge-board-view-tab-grouped"
                  data-dsh-forge-board-panel="grouped"
                >
                  <StatusBoard
                    t={props.t}
                    tasks={visibleTasks}
                    collapsedStatuses={collapsedStatuses}
                    onCollapsedStatusesChange={setCollapsedStatuses}
                    danglingByTask={danglingByTask}
                    updatingKeys={updatingKeys}
                    onSelect={props.onSelect}
                  />
                </div>
              )
              : (
                <div
                  role="tabpanel"
                  aria-labelledby="dsh-forge-board-view-tab-list"
                  data-dsh-forge-board-panel="list"
                >
                  <TaskList
                    t={props.t}
                    tasks={visibleTasks}
                    danglingByTask={danglingByTask}
                    updatingKeys={updatingKeys}
                    onSelect={props.onSelect}
                  />
                </div>
              )}

          {/* The 回流 announcement (aria-live polite, visually hidden). */}
          <p role="status" aria-live="polite" data-dsh-forge-board-announce="" style={srOnlyStyle}>
            {announcement ?? ''}
          </p>
        </>
      )}
    </div>
  )
}
