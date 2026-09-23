/**
 * The UF2 task-board toolbar (task 5.5, ui-design UF2 工具栏 h48 sticky): the
 * three-view segmented switcher (视图 A 依赖树 — live since task 5.6 — /
 * 视图 B 状态分组 / 视图 C 列表), the filter family (feature ▾ / 状态 ▾
 * multi-select / worktree toggle / search over 标题+任务号), the sort control
 * (状态 / 更新时间), the 任务计数, and the sync 状态指示
 * (idle/scanning/error + lastScanAt; error carries the 重试 CTA — a sync
 * error is a TOOLBAR light, never a view error: the board keeps its data).
 *
 * Read-only discipline (BIZ-task-ops-001): every control here is 视图控制 —
 * view switching, filtering, sorting, sync retry. None of them writes task
 * state; the toolbar owns no per-task affordance at all.
 *
 * Hard Rule (视图 A/B/C 切换不重置筛选): the toolbar is CONTROLLED — the
 * page owns the filter/sort/view state above the views, so a switch (or any
 * control change) never remounts the state that filters derive from.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SyncStatus, TaskStatus } from '../../ipc-types'
import { TASK_STATUSES, taskStatusLabel } from '../../i18n/task-status'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { fillTemplate, formatTimestamp } from '../overview/format'

/** The three board views: A 依赖树 (5.6) / B 状态分组 / C 列表. */
export type BoardViewKey = 'tree' | 'grouped' | 'list'

/** The view tuple in switcher order (A 依赖树 first — the board default since 5.6). */
export const BOARD_VIEWS = ['tree', 'grouped', 'list'] as const

/** The C list's sort keys (ui-design UF2 排序 ▾: 状态 / 更新时间). */
export type BoardSortKey = 'status' | 'updatedAt'

/**
 * The filter family's state. `statuses` is the multi-select: an EMPTY set
 * means NO RESTRICTION (all 7 态); a non-empty set is the visible subset.
 */
export interface BoardFilterState {
  readonly search: string
  readonly statuses: ReadonlySet<TaskStatus>
  readonly featureSlug: string | null
  readonly worktreeOnly: boolean
}

/** The unrestricted filter (the page's initial state). */
export const DEFAULT_BOARD_FILTER: BoardFilterState = {
  search: '',
  statuses: new Set(),
  featureSlug: null,
  worktreeOnly: false,
}

/** The locale seat shape. */
export type BoardTranslate = (key: WorkbenchKey) => string

/** Inputs of {@link TaskToolbar}. */
export interface TaskToolbarProps {
  /** The locale seat (the shell's `t`). */
  t: BoardTranslate
  /** The active board view (A/B/C). */
  view: BoardViewKey
  /** Switch the board view (the page keeps filter/scroll context — Hard Rule). */
  onViewChange: (view: BoardViewKey) => void
  /** The current filter family state. */
  filter: BoardFilterState
  /** Replace the filter family state (immutable next value). */
  onFilterChange: (next: BoardFilterState) => void
  /** The active sort key. */
  sort: BoardSortKey
  /** Switch the sort key. */
  onSortChange: (sort: BoardSortKey) => void
  /** The feature slugs present in the board data (the feature ▾ options). */
  featureSlugs: readonly string[]
  /** The post-filter task count (the 计数's numerator). */
  visibleCount: number
  /** The pre-filter task count (the 计数's denominator). */
  totalCount: number
  /** The board data's sync projection (the 状态指示 light). */
  sync: SyncStatus
  /** The sync-error 重试 CTA's action (the page reloads the board). */
  onRetrySync: () => void
  /**
   * The toolbar's right-edge action slot (task 3.9, ui-design UF1 工具栏追加):
   * the UF1 「派发」/「审批 N」 entries render AFTER the M2 controls (M2
   * 既有控件不动). Additive presentation slot only — the toolbar's own
   * controls and their state stay exactly as they were.
   */
  actions?: ReactNode | undefined
}

// ---------------------------------------------------------------------------
// Styles (inline, scoped — no stylesheet pipeline; host vars carry the theme)
// ---------------------------------------------------------------------------

const toolbarStyle = {
  alignItems: 'center',
  background: 'var(--dsh-bg, Canvas)',
  borderBottom: '1px solid var(--dsh-border-color, transparent)',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  minHeight: '48px',
  padding: '8px 0',
  position: 'sticky',
  top: '0',
  zIndex: 40,
} as const

/** ui-design segmented switcher: pill tabs (r14), selected = fill + primary. */
const viewTabStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'var(--dsw-alias-label-secondary, inherit)',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 400,
  height: '28px',
  padding: '0 12px',
  whiteSpace: 'nowrap',
} as const

const viewTabActiveStyle = {
  ...viewTabStyle,
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  color: 'var(--dsw-alias-label-primary, inherit)',
  fontWeight: 500,
} as const

/** sm ghost trigger (h28 r14) — the dropdown/toggle family's shared face. */
const controlStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  font: 'inherit',
  fontWeight: 400,
  gap: '4px',
  height: '28px',
  padding: '0 10px',
  whiteSpace: 'nowrap',
} as const

const controlActiveStyle = {
  ...controlStyle,
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  color: 'var(--dsw-alias-label-primary, inherit)',
} as const

/** The search input (标题/任务号), the toolbar's only text field. */
const searchStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'inherit',
  font: 'inherit',
  height: '28px',
  padding: '0 10px',
  width: '200px',
} as const

/** ui-design Menu 卡: r20, pad 4, min-w 218, above the view content. */
const menuStyle = {
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '20px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  left: '0',
  minWidth: '218px',
  padding: '4px',
  position: 'absolute',
  top: 'calc(100% + 6px)',
  zIndex: 150,
} as const

const menuItemStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  font: 'inherit',
  gap: '8px',
  padding: '7px 10px',
  textAlign: 'left',
  width: '100%',
} as const

const itemLabelStyle = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const wrapStyle = { display: 'inline-flex', position: 'relative' } as const

const spacerStyle = { flex: '1' } as const

const secondaryTextStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  whiteSpace: 'nowrap',
} as const

const syncStyle = {
  alignItems: 'center',
  display: 'inline-flex',
  gap: '6px',
  whiteSpace: 'nowrap',
} as const

// ---------------------------------------------------------------------------
// The dropdown shell (the ProjectSwitcher interaction pattern)
// ---------------------------------------------------------------------------

/** Inputs of the internal dropdown shell. */
interface ToolbarMenuProps {
  /** The trigger's rendered label (already locale-resolved). */
  triggerLabel: ReactNode
  /** The menu card's accessible name. */
  menuLabel: string
  /** The trigger's observation hook (test/e2e selector). */
  hook: string
  /** The item rows (buttons carrying their own roles/checked states). */
  children: ReactNode
}

/**
 * One dropdown: trigger + (while open) the Menu card. Keyboard follows the
 * WAI-ARIA menu pattern the ProjectSwitcher set (arrows cycle item buttons
 * in DOM order, Escape closes and returns focus, Tab closes, outside
 * pointer-down closes; the trigger's ArrowDown/ArrowUp opens).
 */
function ToolbarMenu(props: ToolbarMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onDocumentMouseDown = (event: MouseEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    return () => { document.removeEventListener('mousedown', onDocumentMouseDown) }
  }, [open])

  const closeMenu = (returnFocus: boolean): void => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
    event.preventDefault()
    setOpen(true)
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      const current = items.findIndex(element => element === document.activeElement)
      const next = current === -1 ? 0 : (current + step + items.length) % items.length
      items[next]?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} style={wrapStyle}>
      <ChromeButton
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={`dsh-forge-board-menu-${generatedId}`}
        data-dsh-forge-menu-trigger={props.hook}
        style={controlStyle}
        onKeyDown={onTriggerKeyDown}
        onClick={() => { open ? closeMenu(false) : setOpen(true) }}
      >
        {props.triggerLabel}
        <span aria-hidden="true">▾</span>
      </ChromeButton>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          id={`dsh-forge-board-menu-${generatedId}`}
          aria-label={props.menuLabel}
          style={menuStyle}
          onKeyDown={onMenuKeyDown}
        >
          {props.children}
        </div>
      )}
    </div>
  )
}

/** A menu row's shared button scaffolding (role/checked come from the caller). */
function MenuRow(props: {
  role?: string
  checked?: boolean
  'aria-checked'?: 'true' | 'false'
  onClick: () => void
  children: ReactNode
}) {
  return (
    <ChromeButton type="button" role={props.role} aria-checked={props['aria-checked']} style={menuItemStyle} onClick={props.onClick}>
      {/* The ✓ mark is decorative — aria-checked carries the state. */}
      <span aria-hidden="true" style={{ visibility: props.checked ? 'visible' : 'hidden' }}>✓</span>
      <span style={itemLabelStyle}>{props.children}</span>
    </ChromeButton>
  )
}

// ---------------------------------------------------------------------------
// The toolbar
// ---------------------------------------------------------------------------

/** The selectable-view tuple — all three views are live since 5.6 built the DAG. */
const SELECTABLE_VIEWS = BOARD_VIEWS

/**
 * The h48 sticky toolbar. The view switcher is a role=tablist whose tabs
 * address the page's view panels (id scheme `dsh-forge-board-view-tab-<view>`
 * — the panels label themselves back).
 */
export function TaskToolbar(props: TaskToolbarProps) {
  const { t, filter, onFilterChange } = props
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  /** Rotate focus/selection among the views (WAI-ARIA tabs, 5.1 TabBar parity). */
  const onViewKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = SELECTABLE_VIEWS.indexOf(props.view as (typeof SELECTABLE_VIEWS)[number])
    let next: number | undefined
    if (event.key === 'ArrowRight') next = (current + 1) % SELECTABLE_VIEWS.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + SELECTABLE_VIEWS.length) % SELECTABLE_VIEWS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = SELECTABLE_VIEWS.length - 1
    if (next === undefined) return
    event.preventDefault()
    const view = SELECTABLE_VIEWS[next]
    props.onViewChange(view)
    const index = BOARD_VIEWS.indexOf(view)
    tabRefs.current[index]?.focus()
  }

  /** The displayed checkbox state: an empty filter set means ALL selected. */
  const statusChecked = (status: TaskStatus): boolean =>
    filter.statuses.size === 0 || filter.statuses.has(status)

  /** Toggle one status: from ALL, the first uncheck selects the other six. */
  const toggleStatus = (status: TaskStatus): void => {
    let next: ReadonlySet<TaskStatus>
    if (filter.statuses.size === 0) {
      next = new Set(TASK_STATUSES.filter(candidate => candidate !== status))
    } else {
      const toggled = new Set(filter.statuses)
      if (toggled.has(status)) toggled.delete(status)
      else toggled.add(status)
      // A fully re-selected set collapses back to the unrestricted form.
      next = toggled.size === TASK_STATUSES.length ? new Set() : toggled
    }
    onFilterChange({ ...filter, statuses: next })
  }

  const lastScanText = props.sync.lastScanAt === null
    ? t('tasks.sync.neverScanned')
    : fillTemplate(t('tasks.sync.lastScan'), { time: formatTimestamp(props.sync.lastScanAt) })
  const syncDotState = props.sync.state === 'idle' ? 'idle' : props.sync.state === 'scanning' ? 'ongoing' : 'error'

  return (
    <div data-dsh-forge-task-toolbar="" style={toolbarStyle}>
      <div
        role="tablist"
        aria-label={t('tasks.views.label')}
        data-dsh-forge-board-views=""
        style={{ display: 'flex', gap: '2px' }}
        onKeyDown={onViewKeyDown}
      >
        {BOARD_VIEWS.map((view, index) => (
          <ChromeButton
            key={view}
            ref={(element) => { tabRefs.current[index] = element }}
            type="button"
            role="tab"
            id={`dsh-forge-board-view-tab-${view}`}
            aria-selected={props.view === view ? 'true' : 'false'}
            tabIndex={props.view === view ? 0 : -1}
            data-dsh-forge-board-view={view}
            style={props.view === view ? viewTabActiveStyle : viewTabStyle}
            onClick={() => { props.onViewChange(view) }}
          >
            {t(view === 'tree' ? 'tasks.view.tree' : view === 'grouped' ? 'tasks.view.grouped' : 'tasks.view.list')}
          </ChromeButton>
        ))}
      </div>

      <div role="group" aria-label={t('tasks.filters.label')} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <input
          type="search"
          value={filter.search}
          aria-label={t('tasks.search.label')}
          placeholder={t('tasks.search.placeholder')}
          data-dsh-forge-tasks-search=""
          style={searchStyle}
          onChange={(event) => { onFilterChange({ ...filter, search: event.target.value }) }}
        />
        <ToolbarMenu
          hook="feature"
          triggerLabel={filter.featureSlug ?? t('tasks.filter.featureAll')}
          menuLabel={t('tasks.filter.feature')}
        >
          <MenuRow
            role="menuitemradio"
            checked={filter.featureSlug === null}
            aria-checked={filter.featureSlug === null ? 'true' : 'false'}
            onClick={() => { onFilterChange({ ...filter, featureSlug: null }) }}
          >
            {t('tasks.filter.featureAll')}
          </MenuRow>
          {props.featureSlugs.map(slug => (
            <MenuRow
              key={slug}
              role="menuitemradio"
              checked={filter.featureSlug === slug}
              aria-checked={filter.featureSlug === slug ? 'true' : 'false'}
              onClick={() => { onFilterChange({ ...filter, featureSlug: slug }) }}
            >
              {slug}
            </MenuRow>
          ))}
        </ToolbarMenu>
        <ToolbarMenu hook="status" triggerLabel={t('tasks.filter.status')} menuLabel={t('tasks.filter.status')}>
          <MenuRow
            role="menuitem"
            checked={filter.statuses.size === 0}
            onClick={() => { onFilterChange({ ...filter, statuses: new Set() }) }}
          >
            {t('tasks.filter.statusAll')}
          </MenuRow>
          {TASK_STATUSES.map(status => (
            <MenuRow
              key={status}
              role="menuitemcheckbox"
              checked={statusChecked(status)}
              aria-checked={statusChecked(status) ? 'true' : 'false'}
              onClick={() => { toggleStatus(status) }}
            >
              {taskStatusLabel(status, t)}
            </MenuRow>
          ))}
        </ToolbarMenu>
        <ChromeButton
          type="button"
          aria-pressed={filter.worktreeOnly ? 'true' : 'false'}
          data-dsh-forge-tasks-worktree=""
          style={filter.worktreeOnly ? controlActiveStyle : controlStyle}
          onClick={() => { onFilterChange({ ...filter, worktreeOnly: !filter.worktreeOnly }) }}
        >
          {t('tasks.filter.worktree')}
        </ChromeButton>
      </div>

      <div style={spacerStyle} />

      <span data-dsh-forge-tasks-count="" style={secondaryTextStyle}>
        {fillTemplate(t('tasks.count'), { visible: String(props.visibleCount), total: String(props.totalCount) })}
      </span>

      <ToolbarMenu
        hook="sort"
        triggerLabel={t(props.sort === 'status' ? 'tasks.sort.status' : 'tasks.sort.updatedAt')}
        menuLabel={t('tasks.sort.label')}
      >
        <MenuRow
          role="menuitemradio"
          checked={props.sort === 'status'}
          aria-checked={props.sort === 'status' ? 'true' : 'false'}
          onClick={() => { props.onSortChange('status') }}
        >
          {t('tasks.sort.status')}
        </MenuRow>
        <MenuRow
          role="menuitemradio"
          checked={props.sort === 'updatedAt'}
          aria-checked={props.sort === 'updatedAt' ? 'true' : 'false'}
          onClick={() => { props.onSortChange('updatedAt') }}
        >
          {t('tasks.sort.updatedAt')}
        </MenuRow>
      </ToolbarMenu>

      <span role="status" data-dsh-forge-tasks-sync={props.sync.state} style={syncStyle}>
        <StateDot state={syncDotState} />
        <span title={props.sync.error ?? undefined}>
          {props.sync.state === 'scanning' ? t('tasks.sync.scanning') : props.sync.state === 'error' ? t('tasks.sync.error') : t('tasks.sync.idle')}
        </span>
        {props.sync.state !== 'error' && <span style={secondaryTextStyle}>{lastScanText}</span>}
        {props.sync.state === 'error' && (
          <ChromeButton
            type="button"
            data-dsh-forge-tasks-sync-retry=""
            style={controlStyle}
            onClick={() => { props.onRetrySync() }}
          >
            {t('tasks.sync.retry')}
          </ChromeButton>
        )}
      </span>

      {/* The UF1 action slot (task 3.9): 派发 / 审批 N, right of the M2 controls. */}
      {props.actions}
    </div>
  )
}
