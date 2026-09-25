/**
 * The UF2 view B 状态分组 (task 5.5, ui-design): the 7-态 horizontal kanban —
 * one fixed column per vocabulary status (i18n/task-status.ts's canonical
 * TASK_STATUSES order), 列宽 min 280 with horizontal scroll; the column head
 * = StateDot + 状态名 + 计数 Pill and doubles as the collapse toggle (组可折
 * 叠); the body stacks the shared TaskCard. Empty statuses keep their column
 * (count 0) — the 7-column shape is the view's identity, not a filter.
 *
 * Scale discipline (task Implementation Note): the board side of the 500-task
 * budget rides GROUP COLLAPSE — a collapsed column renders its header only,
 * so the visible card population is user-controlled.
 */
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import type { TaskStatus, TaskSummary } from '../../ipc-types'
import { TASK_STATUSES, TASK_STATUS_DOT_STATE, taskStatusLabel } from '../../i18n/task-status'
import type { WorkbenchKey } from '../../locale/en'
import { fillTemplate } from '../overview/format'
import { TaskCard } from './TaskRow'

/** Inputs of {@link StatusBoard}. */
export interface StatusBoardProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The post-filter, post-sort tasks (the page owns filtering — Hard Rule). */
  tasks: readonly TaskSummary[]
  /** The collapsed columns (page-held: collapse survives view switches). */
  collapsedStatuses: ReadonlySet<TaskStatus>
  /** Replace the collapsed-column set. */
  onCollapsedStatusesChange: (next: ReadonlySet<TaskStatus>) => void
  /** key → dangling LOCAL blockers, computed against the FULL task set (not the filtered one). */
  danglingByTask: ReadonlyMap<string, readonly string[]>
  /** The task keys currently carrying the 回流 updating highlight. */
  updatingKeys: ReadonlySet<string>
  /**
   * The single-source selection key (5.8): the card whose key matches carries
   * the selected mark — controlled from the selection store, never card-local.
   */
  selectedKey?: string | undefined
  /** The 5.7 selection seam — a card activation hands the task over (navigation only). */
  onSelect?: ((task: TaskSummary) => void) | undefined
  /** taskKey → ACTIVE session link id (5.11 AC3 — the 会话运行中 badge). */
  activeLinks?: ReadonlyMap<string, string> | undefined
  /**
   * The UF1 编排态角标 composer (task 3.9, 角标以 props 传入): called per
   * card; the returned node rides the card's badge cluster verbatim.
   * Absent renders no badge (the M2 form exactly).
   */
  orchBadgeOf?: ((taskKey: string) => ReactNode | undefined) | undefined
  /**
   * The UF1 selection-mode decoration composer (task 3.9): called per card;
   * the returned cluster (checkbox overlay + ⤢) self-hides outside selection
   * mode. Absent renders nothing (the M2 form exactly).
   */
  selectionDecorOf?: ((taskKey: string) => ReactNode | undefined) | undefined
}

/** The horizontal kanban scroller (列宽 min 280, 横向滚动). */
const boardStyle = {
  alignItems: 'flex-start',
  display: 'flex',
  gap: '12px',
  overflowX: 'auto',
  paddingBottom: '8px',
} as const

const columnStyle = {
  display: 'flex',
  flex: '0 0 auto',
  flexDirection: 'column',
  gap: '8px',
  minWidth: '280px',
  width: '280px',
} as const

/** The column head: StateDot + 状态名 + 计数 Pill, the collapse toggle itself. */
const columnHeaderStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  font: 'inherit',
  gap: '8px',
  padding: '6px 4px',
  textAlign: 'left',
  width: '100%',
} as const

const columnTitleStyle = {
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '22px',
} as const

/** The 计数 Pill. */
const countPillStyle = {
  borderRadius: '8px',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  marginLeft: 'auto',
  padding: '0 6px',
} as const

const columnBodyStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
} as const

/** The collapsed-column body hint (one secondary line, no cards rendered). */
const collapsedHintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0 4px',
} as const

/**
 * The 7-column board. `data-dsh-forge-status-board` (the horizontal scroll
 * container the page restores on view re-entry) and
 * `data-dsh-forge-status-column={status}` are the observation hooks.
 */
export function StatusBoard(props: StatusBoardProps) {
  const { t, tasks, collapsedStatuses, onCollapsedStatusesChange } = props

  const toggleColumn = (status: TaskStatus): void => {
    const next = new Set(collapsedStatuses)
    if (next.has(status)) next.delete(status)
    else next.add(status)
    onCollapsedStatusesChange(next)
  }

  return (
    <div data-dsh-forge-status-board="" style={boardStyle}>
      {TASK_STATUSES.map((status) => {
        const groupTasks = tasks.filter(task => task.status === status)
        const collapsed = collapsedStatuses.has(status)
        return (
          <section
            key={status}
            data-dsh-forge-status-column={status}
            aria-label={fillTemplate(t('tasks.group.ariaLabel'), {
              status: taskStatusLabel(status, t),
              count: String(groupTasks.length),
            })}
            style={columnStyle}
          >
            <button
              type="button"
              aria-expanded={collapsed ? 'false' : 'true'}
              data-dsh-forge-status-column-toggle={status}
              style={columnHeaderStyle}
              onClick={() => { toggleColumn(status) }}
            >
              <StateDot state={TASK_STATUS_DOT_STATE[status]} />
              <span style={columnTitleStyle}>{taskStatusLabel(status, t)}</span>
              <span data-dsh-forge-status-count={status} style={countPillStyle}>{groupTasks.length}</span>
              <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
            </button>
            {collapsed
              ? <div style={collapsedHintStyle}>—</div>
              : (
                <div data-dsh-forge-status-column-body={status} style={columnBodyStyle}>
                  {groupTasks.map(task => (
                    <TaskCard
                      key={task.key}
                      t={t}
                      task={task}
                      danglingBlockers={props.danglingByTask.get(task.key) ?? []}
                      updating={props.updatingKeys.has(task.key)}
                      selected={props.selectedKey === task.key}
                      {...(props.activeLinks?.get(task.key) === undefined ? {} : { activeSessionId: props.activeLinks.get(task.key) })}
                      onSelect={props.onSelect}
                      {...(props.orchBadgeOf === undefined ? {} : { orchBadge: props.orchBadgeOf(task.key) })}
                      {...(props.selectionDecorOf === undefined ? {} : { selectionDecor: props.selectionDecorOf(task.key) })}
                    />
                  ))}
                </div>
              )}
          </section>
        )
      })}
    </div>
  )
}
