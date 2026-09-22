/**
 * The shared FEATURE-status vocabulary (task 5.9 — the UF4 feature board's
 * status-rendering layer): the manifest 词表 passed through VERBATIM
 * ('in-progress' keeps its hyphen; the set is NOT the 7-态 task vocabulary —
 * that one stays in i18n/task-status.ts). This module follows the
 * task-status.ts API shape deliberately (task 5.5 declared 5.9 a co-consumer
 * of the SHAPE): vocabulary tuple + narrower + label-key record + helper, so
 * the two status families read identically and cannot fork structurally.
 *
 * 词表直通 (task Hard Rule: status 词表直通不改写): the locale halves carry
 * the RAW manifest token as the copy in BOTH en and zh — the vocabulary IS
 * the product's own terminology (prd / design / tasks / in-progress /
 * completed, ui-design 2026-09-22 原型修订: stepper 标签一律全称、不缩写).
 * The keys still ride the upstream locale mechanism (zh/en parity enforced by
 * the typed dictionary) so any future relabeling has exactly one home.
 *
 * The stepper-phase mapping (FEATURE_STATUS_PHASE) is the second export
 * family: ui-design UF4's 状态机 stepper renders the five phases in
 * FEATURE_STATUSES order with 当前/已达态 = 品牌蓝 — the map is the ONE
 * status → progression index authority the list badge and the detail
 * stepper share.
 */
import type { DocKind, FeatureStatus } from '../ipc-types'
import type { WorkbenchKey } from '../locale/en'

/** The translate seat shape every consumer passes through (the shell's `t`). */
export type FeatureStatusTranslate = (key: WorkbenchKey) => string

/**
 * The manifest feature-status vocabulary in CANONICAL lifecycle order
 * (tech-design §Interface 1): the stepper's phase order AND the board's
 * status-rank order both derive from THIS tuple — one order, everywhere.
 */
export const FEATURE_STATUSES = [
  'prd',
  'design',
  'tasks',
  'in-progress',
  'completed',
] as const

/**
 * status → stepper phase index (0-based, into {@link FEATURE_STATUSES}). The
 * phases ≤ the current one count as 已达 (brand blue); the ones after stay
 * 未达 (border-l3). Exported as the single mapping so the list badge and the
 * detail stepper can never disagree about progression.
 */
export const FEATURE_STATUS_PHASE: Record<FeatureStatus, number> = {
  prd: 0,
  design: 1,
  tasks: 2,
  'in-progress': 3,
  completed: 4,
}

/** Narrow an unknown status string onto the vocabulary (defensive DTO reads). */
export function isFeatureStatus(value: unknown): value is FeatureStatus {
  return typeof value === 'string' && (FEATURE_STATUSES as readonly string[]).includes(value)
}

/**
 * status → label locale key. The copy is the raw manifest token in BOTH locale
 * halves (词表直通, the Hard Rule) — the key indirection exists so the parity
 * tests hold and a future relabel has one home.
 */
export const FEATURE_STATUS_LABEL_KEYS: Record<FeatureStatus, WorkbenchKey> = {
  prd: 'features.status.prd',
  design: 'features.status.design',
  tasks: 'features.status.tasks',
  'in-progress': 'features.status.in-progress',
  completed: 'features.status.completed',
}

/** The full (verbatim) label for a feature status, routed through the locale seat. */
export function featureStatusLabel(status: FeatureStatus, t: FeatureStatusTranslate): string {
  return t(FEATURE_STATUS_LABEL_KEYS[status])
}

/**
 * The five document kinds in CANONICAL tab order (ui-design UF4 文档 tab:
 * manifest/prd/design/ui/tasks — fixed order, missing kinds disabled not
 * hidden). One tuple drives the tab strip everywhere.
 */
export const FEATURE_DOC_KINDS = [
  'manifest',
  'prd',
  'design',
  'ui',
  'tasks',
] as const

/** Narrow an unknown kind string onto the doc-kind vocabulary (defensive DTO reads). */
export function isDocKind(value: unknown): value is DocKind {
  return typeof value === 'string' && (FEATURE_DOC_KINDS as readonly string[]).includes(value)
}

/**
 * doc kind → tab-label locale key. Like the status labels, the copy is the
 * raw kind token in both locale halves (the file-family name is the label).
 */
export const DOC_KIND_LABEL_KEYS: Record<DocKind, WorkbenchKey> = {
  manifest: 'features.doc.manifest',
  prd: 'features.doc.prd',
  design: 'features.doc.design',
  ui: 'features.doc.ui',
  tasks: 'features.doc.tasks',
}

/** The tab label for a doc kind, routed through the locale seat. */
export function docKindLabel(kind: DocKind, t: FeatureStatusTranslate): string {
  return t(DOC_KIND_LABEL_KEYS[kind])
}
