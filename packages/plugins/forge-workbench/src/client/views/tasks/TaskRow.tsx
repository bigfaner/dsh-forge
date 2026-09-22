/**
 * The UF2 B/C shared row rendering (task 5.5): the pieces view B's status
 * cards and view C's table rows BOTH render — the badge cluster
 * (worktree / 来源 [会话]|[终端] / 悬空 blocker), the StateDot + status-label
 * pairing, the mono key/branch cells, and the 回流 updating highlight. One
 * renderer, two shells: the card (<button>, whole-card navigation) and the
 * list row (<tr>, keyboard-activatable) — every interactive element here is
 * NAVIGATION (the selection seam), never a write: the board is 人侧只读
 * (BIZ-task-ops-001 Hard Rule — no status control, no checkbox, no inline
 * edit exists in this file by construction).
 *
 * The dot is the UPSTREAM StateDot (TECH-ui-reuse-001 — reused via the
 * module-table external, stubbed in unit renders like every other
 * ui-primitives consumer); i18n/task-status.ts owns the 7-态 → visual/label
 * routing this file consumes.
 */
import type { KeyboardEvent } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskSummary } from '../../ipc-types'
import { TASK_STATUS_DOT_STATE, taskStatusLabel, taskStatusShortLabel } from '../../i18n/task-status'
import type { WorkbenchKey } from '../../locale/en'
import { fillTemplate, formatTimestamp } from '../overview/format'

/** Inputs shared by every row/card variant. */
export interface TaskRowBaseProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The task row being rendered. */
  task: TaskSummary
  /**
   * The task's dangling blockers — same-feature LOCAL keys that resolve to
   * no task in the board's set (6.2's consistency expectation: the 悬空标记).
   */
  danglingBlockers: readonly string[]
  /** The 回流 updating highlight (a task_updated event landed on this row). */
  updating?: boolean
  /** The 5.7 selection seam — the ONLY interaction a row carries (navigation). */
  onSelect?: ((task: TaskSummary) => void) | undefined
}

/** The em-dash placeholder for absent optional cells (branch/worktree/source). */
const NONE_CELL = '—'

/** The updating highlight: interactive-bg-hover fill fading out over 0.3s (ui-design 回流·属性级). */
const updatingBackground = 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))'
const updatingTransition = 'background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1)'

/** Pill-adjacent badge (ui-design: 徽标用 Pill): 12/18 capsule, nowrap. */
const badgeStyle = {
  borderRadius: '8px',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0 6px',
  whiteSpace: 'nowrap',
} as const

/** The source badge variant: the per-change 来源 marker ([会话]/[终端]). */
const sourceBadgeStyle = {
  ...badgeStyle,
  color: 'var(--dsw-alias-label-primary, inherit)',
} as const

/** The dangling-blocker variant: warn-tinted — the resolvable-later signal. */
const danglingBadgeStyle = {
  ...badgeStyle,
  border: '1px solid var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
} as const

/** 12/18 mono secondary (task ids, branches — the ui-design 代码栈 cells). */
const monoSecondaryStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/**
 * The shared badge cluster: worktree ⌥w badge, 来源 badge ([会话]/[终端]),
 * and the 悬空 blocker badge (title carries the missing keys). Absent
 * dimensions render nothing here — the C row's CELLS hold the `—`
 * placeholders instead.
 */
export function TaskBadges(props: TaskRowBaseProps) {
  const { task, t, danglingBlockers } = props
  return (
    <>
      {task.worktree && <span data-dsh-forge-badge="worktree" style={badgeStyle}>{t('tasks.badge.worktree')}</span>}
      {task.source !== null && (
        <span data-dsh-forge-badge={`source:${task.source}`} style={sourceBadgeStyle}>
          {t(task.source === 'session' ? 'tasks.source.session' : 'tasks.source.terminal')}
        </span>
      )}
      {danglingBlockers.length > 0 && (
        <span
          data-dsh-forge-badge="dangling"
          style={danglingBadgeStyle}
          title={fillTemplate(t('tasks.dangling.title'), { keys: danglingBlockers.join(', ') })}
        >
          {t('tasks.dangling')}
        </span>
      )}
    </>
  )
}

/** ui-design 节点卡: w240 · r14 · bg-layer-2 · pad 10 12, progressive-render hint. */
const cardStyle = {
  alignItems: 'flex-start',
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'inherit',
  containIntrinsicSize: 'auto 96px',
  contentVisibility: 'auto',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  font: 'inherit',
  gap: '4px',
  padding: '10px 12px',
  textAlign: 'left',
  width: '100%',
} as const

const cardTitleRowStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '6px',
  minWidth: '0',
  width: '100%',
} as const

/** 14/22 single-line truncated title (ui-design node card). */
const cardTitleStyle = {
  fontSize: '14px',
  lineHeight: '22px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const cardSecondRowStyle = {
  alignItems: 'baseline',
  display: 'flex',
  gap: '8px',
  minWidth: 0,
} as const

/** The 状态短名: the StateDot's non-color redundancy (12/18 secondary). */
const shortLabelStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const cardBadgesRowStyle = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  minWidth: 0,
} as const

/**
 * The view B card (one task inside a status column). The whole card is the
 * selection trigger — click / Enter / Space navigate to the detail seam;
 * nothing inside edits anything.
 */
export function TaskCard(props: TaskRowBaseProps) {
  const { task, t, updating = false, onSelect } = props
  return (
    <button
      type="button"
      data-dsh-forge-task-card={task.key}
      data-dsh-forge-updating={updating ? '' : undefined}
      aria-label={`${task.key} · ${task.title}`}
      style={{
        ...cardStyle,
        transition: updatingTransition,
        ...(updating ? { backgroundColor: updatingBackground } : {}),
      }}
      onClick={() => { onSelect?.(task) }}
    >
      <span style={cardTitleRowStyle}>
        <StateDot state={TASK_STATUS_DOT_STATE[task.status]} />
        <span title={task.title} style={cardTitleStyle}>{task.title}</span>
      </span>
      <span style={cardSecondRowStyle}>
        <span title={task.key} style={{ ...monoSecondaryStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.key}
        </span>
        <span style={shortLabelStyle}>{taskStatusShortLabel(task.status, t)}</span>
      </span>
      <span style={cardBadgesRowStyle}>
        {task.branch !== null && (
          <span title={task.branch} style={{ ...monoSecondaryStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.branch}
          </span>
        )}
        <TaskBadges {...props} />
      </span>
    </button>
  )
}

/** The C table row: hover fill + keyboard activation, cells per ui-design 列表. */
const rowStyle = {
  cursor: 'pointer',
} as const

const rowCellStyle = {
  overflow: 'hidden',
  padding: '6px 10px',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const rowMonoCellStyle = { ...rowCellStyle, ...monoSecondaryStyle } as const

const statusCellStyle = {
  ...rowCellStyle,
  alignItems: 'center',
  display: 'flex',
  gap: '6px',
} as const

/**
 * The view C row: 任务号(mono) | 标题 | 状态 | feature | 分支(mono) |
 * worktree | 来源 | 更新时间 (ui-design UF2 视图 C — 2026-09-22 修订含分支列).
 * Enter / Space / click navigate to the selection seam; that is the row's
 * entire interaction surface.
 */
export function TaskListRow(props: TaskRowBaseProps) {
  const { task, t, updating = false, onSelect } = props
  const activate = (): void => { onSelect?.(task) }
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate()
    }
  }
  return (
    <tr
      data-dsh-forge-task-row={task.key}
      data-dsh-forge-updating={updating ? '' : undefined}
      tabIndex={0}
      aria-label={`${task.key} · ${task.title}`}
      style={{
        ...rowStyle,
        transition: updatingTransition,
        ...(updating ? { backgroundColor: updatingBackground } : {}),
      }}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      <td style={rowMonoCellStyle}>{task.key}</td>
      <td title={task.title} style={rowCellStyle}>{task.title}</td>
      <td style={statusCellStyle}>
        <StateDot state={TASK_STATUS_DOT_STATE[task.status]} />
        {taskStatusLabel(task.status, t)}
      </td>
      <td style={rowCellStyle}>{task.featureSlug}</td>
      <td title={task.branch ?? undefined} style={rowMonoCellStyle}>{task.branch ?? NONE_CELL}</td>
      <td style={rowCellStyle}>
        {task.worktree
          ? <span data-dsh-forge-badge="worktree" style={badgeStyle}>{t('tasks.badge.worktree')}</span>
          : NONE_CELL}
      </td>
      <td style={rowCellStyle}>
        {task.source !== null
          ? (
            <span data-dsh-forge-badge={`source:${task.source}`} style={sourceBadgeStyle}>
              {t(task.source === 'session' ? 'tasks.source.session' : 'tasks.source.terminal')}
            </span>
          )
          : NONE_CELL}
      </td>
      <td title={task.updatedAt} style={rowCellStyle}>{formatTimestamp(task.updatedAt)}</td>
    </tr>
  )
}
