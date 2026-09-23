/**
 * The UF3 summary-header status pill (task 5.7): StateDot + status label —
 * the 状态点进度 of the task file's five-section AC. Hard Rule: the label and
 * the dot BOTH route through the ONE shared vocabulary (i18n/task-status.ts,
 * the same constants UF2's cards consume) — no second hardcoded copy exists
 * in this file by construction, so the UF2/UF3 surfaces cannot drift.
 */
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskStatus } from '../../../ipc-types'
import { TASK_STATUS_DOT_STATE, taskStatusLabel, type TaskStatusTranslate } from '../../../i18n/task-status'

/** The header's bordered status capsule (ui-design: 状态 Pill, dot + label redundancy). */
const pillStyle = {
  alignItems: 'center',
  borderRadius: '8px',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  color: 'var(--dsw-alias-label-primary, inherit)',
  display: 'inline-flex',
  flex: '0 0 auto',
  fontSize: '12px',
  gap: '6px',
  lineHeight: '18px',
  padding: '0 8px',
  whiteSpace: 'nowrap',
} as const

/** Inputs of {@link DetailStatusPill}. */
export interface DetailStatusPillProps {
  /** The locale seat (the shell's `t`). */
  t: TaskStatusTranslate
  /** The task status being summarized. */
  status: TaskStatus
}

/**
 * The summary-header status pill: StateDot (the glance channel) + the full
 * shared-vocabulary label (the precision channel — never color-only).
 */
export function DetailStatusPill(props: DetailStatusPillProps) {
  return (
    <span data-dsh-forge-detail-status={props.status} style={pillStyle}>
      <StateDot state={TASK_STATUS_DOT_STATE[props.status]} />
      {taskStatusLabel(props.status, props.t)}
    </span>
  )
}
