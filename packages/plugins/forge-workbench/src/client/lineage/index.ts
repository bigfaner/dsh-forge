/**
 * The lineage derivation service, client half (M4 task 2.5; tech-design
 * §Interface 3 + §Architecture·Layer Placement): the READ-ONLY join of the
 * upstream `ctx.sessions` snapshot (byId ⊕ the subagentsByParent native
 * index, consumed through the guarded duck-typed adapters in types.ts — the
 * 1.6 discipline, no api-* imports) with the kernel's session_links (the M3
 * get-task-detail verb's rows) into a TaskBinding.
 *
 * Consumers: C3's lineageDegraded copy seat stays 1.4's (untouched); C5
 * (2.6) reads links/executingSubagents/badges and row-expands via
 * deriveSessionLineage; C6 (2.7) reads the badges/judgment bits. The
 * service owns NO UI, no store, no IPC verb of its own — 零新读侧, 零迁移,
 * and no write path anywhere (血缘不落库, PRD 必答⑥ Hard Rule).
 */
export {
  deriveSessionLineage, deriveTaskBinding, judgeExecuting, LINEAGE_DESCENDANT_LIMIT,
} from './derive'
export type {
  DeriveTaskBindingInput, ExecutionJudgment, SessionLineageResult,
} from './derive'
export {
  createLineageDeadline, defaultLineageLog, LINEAGE_BUDGET_MS, LINEAGE_CHECK_INTERVAL,
  LINEAGE_LOG_PREFIX, logLineageDegraded,
} from './budget'
export type { LineageDeadline, LineageDegradedReason, LineageLog } from './budget'
export {
  lineageSnapshotOf, toLineageSessionsSource,
} from './types'
export type {
  LineageCatalog, LineageCatalogChild, LineageCatalogEntry, LineageSessionRow,
  LineageSessionsSnapshot, LineageSessionsSource, LineageSubagentAddress, LineageTaskRef,
  SessionTaskBadge, SessionLink, SubagentHit, TaskBinding, TaskLinkRow,
} from './types'
