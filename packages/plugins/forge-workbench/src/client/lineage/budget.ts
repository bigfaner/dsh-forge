/**
 * The lineage service's BUDGET + degrade plumbing (M4 task 2.5): the ≤100ms
 * computation budget (PRD §技术约束: 点击时只读计算,超时降级为仅顶层会话) and
 * the BIZ-resilience-001 degrade channel — SILENT to the user (no error
 * surface, no throw) with ONE structured log line per degrade, mirroring the
 * upstream renderer convention (`console.warn('[ns] …', detail)` — the
 * structured detail object rides as the second argument).
 *
 * The deadline is COOPERATIVE: the derivation's recursive walk checkpoints
 * every {@link LINEAGE_CHECK_INTERVAL} nodes, so a pathological snapshot
 * (deep/cyclic lineage, huge catalogs) surrenders mid-walk instead of
 * running unbounded. Recovery is automatic — the derivation is a pure
 * recompute, so the next call under budget answers the full binding.
 */
import type { LineageTaskRef } from './types'

/** The computation budget: 血缘推断 ≤100ms (tech-design §Interface 3). */
export const LINEAGE_BUDGET_MS = 100

/** Checkpoint cadence — nodes walked between deadline reads. */
export const LINEAGE_CHECK_INTERVAL = 64

/**
 * A structured-log sink: one line per degrade event (message + detail).
 * The default answers `console.warn` (the renderer's structured channel);
 * tests inject a spy, the shell may route it anywhere later.
 */
export type LineageLog = (message: string, detail: Record<string, unknown>) => void

/** The default structured sink (upstream `[ns]` prefix convention). */
export const defaultLineageLog: LineageLog = (message, detail) => {
  // BIZ-resilience-001: non-fatal failure = structured log, never a UI error.
  console.warn(message, detail)
}

/** Why a derivation degraded (the log line's `reason` discriminator). */
export type LineageDegradedReason =
  /** The upstream ctx.sessions snapshot is absent/malformed (仅顶层). */
  | 'snapshot-absent'
  /** The cooperative deadline expired mid-walk (仅顶层). */
  | 'budget-expired'

/** The structured log's namespace prefix. */
export const LINEAGE_LOG_PREFIX = '[forge-lineage]'

/**
 * Emit ONE structured degrade line (silent to the user — the log is the
 * whole observable footprint). `elapsedMs` rides the budget leg; the task
 * key rides every line for cross-referencing against the click that fired.
 */
export function logLineageDegraded(
  reason: LineageDegradedReason,
  task: Pick<LineageTaskRef, 'key'>,
  log: LineageLog = defaultLineageLog,
  elapsedMs?: number,
): void {
  log(`${LINEAGE_LOG_PREFIX} degraded`, {
    reason,
    taskKey: task.key,
    ...(elapsedMs === undefined ? {} : { elapsedMs }),
  })
}

/** A cooperative deadline over an injected clock (tests seam the clock). */
export interface LineageDeadline {
  readonly budgetMs: number
  readonly startedAt: number
  /** true ⇔ the wall clock has passed `startedAt + budgetMs`. */
  expired(now: number): boolean
}

/**
 * Create the deadline from the SAME clock the walk checkpoints on — one
 * `now()` seam drives both (the fake-timer tests advance it between reads).
 */
export function createLineageDeadline(now: () => number, budgetMs: number = LINEAGE_BUDGET_MS): LineageDeadline {
  const startedAt = now()
  return {
    budgetMs,
    startedAt,
    expired: (current: number): boolean => current - startedAt > budgetMs,
  }
}
