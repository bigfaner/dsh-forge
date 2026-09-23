/**
 * The shared task-status vocabulary (task 5.5 — the FIRST status-rendering
 * task of the 5.x build): the ONE mapping layer every task-status surface
 * goes through. Task 5.7 (UF3 detail dock) consumes it as-is; task 5.9 (UF4
 * feature board) follows the same API shape for its own FEATURE vocabulary
 * in the sibling i18n/feature-status.ts (the manifest 词表, NOT the 7-态) —
 * the exported API below is contract-stable for both.
 *
 * Split of concerns (the i18n/errors.ts precedent, ui-design 全局规则: 文案
 * 一律经上游 locale 机制 zh/en,不自建文案通道):
 *   - HERE: the runtime vocabulary (canonical 7-态 order), the status →
 *     label / short-label ROUTING into the plugin's `workbench` namespace,
 *     the status → upstream StateDot visual mapping, and the narrowers;
 *   - locale halves (locale/en.ts + locale/zh.ts): the COPY — the typed
 *     dictionary registration enforces the en/zh balance, so a status added
 *     without its keys fails the parity tests instead of rendering blank.
 */
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskStatus } from '../ipc-types'
import type { WorkbenchKey } from '../locale/en'

/** The translate seat shape every consumer passes through (the shell's `t`). */
export type TaskStatusTranslate = (key: WorkbenchKey) => string

/**
 * The 7-态 vocabulary in canonical board order (tech-design §Interface 1):
 * view B's column order AND the status sort's rank order both derive from
 * THIS tuple — one order, everywhere (ui-design 视图 B 按 7 态分组列).
 */
export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'suspended',
  'skipped',
  'rejected',
] as const

/** Narrow an unknown status string onto the vocabulary (defensive DTO reads). */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value)
}

/**
 * status → full-label locale key. Full labels ride the places ui-design
 * demands the 状态全称: StateDot pairings, the filter menu, view C's status
 * column, aria-labels.
 */
export const TASK_STATUS_LABEL_KEYS: Record<TaskStatus, WorkbenchKey> = {
  pending: 'tasks.status.pending',
  in_progress: 'tasks.status.in_progress',
  completed: 'tasks.status.completed',
  blocked: 'tasks.status.blocked',
  suspended: 'tasks.status.suspended',
  skipped: 'tasks.status.skipped',
  rejected: 'tasks.status.rejected',
}

/**
 * status → short-label locale key — the dense second line of a view B card
 * (12/18 secondary text, the StateDot's non-color redundancy, ui-design UF2
 * node card).
 */
export const TASK_STATUS_SHORT_LABEL_KEYS: Record<TaskStatus, WorkbenchKey> = {
  pending: 'tasks.status.short.pending',
  in_progress: 'tasks.status.short.in_progress',
  completed: 'tasks.status.short.completed',
  blocked: 'tasks.status.short.blocked',
  suspended: 'tasks.status.short.suspended',
  skipped: 'tasks.status.short.skipped',
  rejected: 'tasks.status.short.rejected',
}

/**
 * status → upstream StateDot visual. The 7-态 reduce onto the upstream
 * component's five visuals (TECH-ui-reuse-001 — reused, not re-invented):
 * the dot is the glance channel, the LABEL carries the precision (ui-design
 * 全局规则: StateDot 携带文字冗余, never color-only).
 */
export const TASK_STATUS_DOT_STATE: Record<TaskStatus, StateDotState> = {
  pending: 'idle',
  in_progress: 'ongoing',
  completed: 'done',
  blocked: 'warning',
  suspended: 'idle',
  skipped: 'idle',
  rejected: 'error',
}

/** The full label for a status (routed through the locale seat). */
export function taskStatusLabel(status: TaskStatus, t: TaskStatusTranslate): string {
  return t(TASK_STATUS_LABEL_KEYS[status])
}

/** The short label for a status (dense view B cards). */
export function taskStatusShortLabel(status: TaskStatus, t: TaskStatusTranslate): string {
  return t(TASK_STATUS_SHORT_LABEL_KEYS[status])
}
