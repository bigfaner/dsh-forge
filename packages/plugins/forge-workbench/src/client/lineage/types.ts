/**
 * The lineage service's TYPE face (M4 task 2.5, tech-design §Interface 3 —
 * 血缘推导服务, client half, PURE READ-ONLY): the exact SubagentHit /
 * TaskBinding products plus the duck-typed INPUT faces the upstream
 * `ctx.sessions` snapshot narrows onto (the 1.6 guarded-read discipline —
 * this plugin carries none of the api-* types; the shapes below are
 * structural twins of the vendored SessionListState.byId rows and the
 * subagentsByParent native index's `SubagentListEntry` children).
 *
 * 不落库纪律 (PRD 必答⑥): every type here is a derivation product — the
 * service has NO write path, consumes the upstream snapshot and the M3
 * get-task-detail links read-only, and can be recomputed at any time.
 *
 * Granularity limitation (Hard Rule, M5 备注备查): when one top session
 * consecutively executes several tasks, the derivation is SESSION-level —
 * each linked task derives the same session's 「该会话执行中」 tree; the
 * M5 dispatch-protocol rebuild may add task-level write-back.
 */
import type { SessionLink, TaskStatus } from '../ipc-types'

// ---------------------------------------------------------------------------
// Interface 3 products (verbatim fields + the additive AC seats, documented)
// ---------------------------------------------------------------------------

/**
 * The durable open address (upstream SubagentAddress triple verbatim):
 * `parentSessionId` = the DIRECT durable parent (the catalog owner), and
 * `mode` rides the catalog entry's own `SubagentListEntry.mode` — the
 * discriminator the Interface 6 openSessionTarget channel routes on.
 */
export interface LineageSubagentAddress {
  readonly parentSessionId: string
  readonly childSessionId: string
  readonly mode: 'one-shot' | 'continuable'
}

/**
 * One origin='subagent' descendant inside an active link's lineage tree
 * (tech-design §Interface 3 verbatim): `depth` counts from the linked TOP
 * session (a direct child = 1); `running` merges the byId summary row with
 * the catalog's activity sample.
 */
export interface SubagentHit {
  readonly sessionId: string
  readonly parentSessionId: string
  readonly title: string
  readonly running: boolean
  readonly depth: number
  readonly address: LineageSubagentAddress
}

/**
 * One session_links row as the binding presents it (Interface 3 verbatim
 * core `{ sessionId, status, startedAt, endedAt? }`, 新→旧) plus the ONE
 * additive join bit the AC's ended-session matrix demands:
 * `lineageAvailable === false` ⇔ the session is disposed (byId 缺席) — the
 * C5 row stays expandable but its lineage slot reads 「不可用」.
 */
export interface TaskLinkRow {
  readonly sessionId: string
  readonly status: 'active' | 'ended'
  /** ISO 8601 — the link's 发起时间 (repeat registration refreshes it). */
  readonly startedAt: string
  /** Present iff status === 'ended'. */
  readonly endedAt?: string | undefined
  /** Join bit: the session row still lives in the upstream byId snapshot. */
  readonly lineageAvailable: boolean
}

/** One reverse badge: the session-tree row's task ownership (命名辅助). */
export interface SessionTaskBadge {
  readonly sessionId: string
  readonly taskKey: string
  readonly title: string
}

/**
 * The lineage derivation product (tech-design §Interface 3 verbatim core —
 * links / executingSubagents / sessionTaskBadges / degraded — plus the
 * additive seats the ACs pin: the 查看全部 totals and the BIZ-workbench-008
 * judgment bits).
 */
export interface TaskBinding {
  /** 挂接历史, active AND ended, 新→旧 (startedAt descending). */
  readonly links: readonly TaskLinkRow[]
  /**
   * origin='subagent' descendants (recursive) of the ACTIVE links' top
   * sessions, DFS in tree order, capped at
   * {@link LINEAGE_DESCENDANT_LIMIT}; empty when degraded (仅顶层).
   */
  readonly executingSubagents: readonly SubagentHit[]
  /**
   * Additive (AC 超上限 20): the walk's FULL descendant count —
   * `total > executingSubagents.length` is the 「查看全部」 seat.
   */
  readonly executingSubagentTotal: number
  /** Reverse badges for every linked session still present in byId. */
  readonly sessionTaskBadges: readonly SessionTaskBadge[]
  /** true ⇔ budget expired or the upstream snapshot is absent (仅顶层). */
  readonly degraded: boolean
  /** BIZ-workbench-008: status === 'in_progress' ∧ an active link exists. */
  readonly executing: boolean
  /** in_progress WITHOUT an active link — the 未挂接标注位 (常规 + badge). */
  readonly unlinkedInProgress: boolean
}

// ---------------------------------------------------------------------------
// Duck-typed input faces (upstream ctx.sessions snapshot, read-only)
// ---------------------------------------------------------------------------

/**
 * One upstream byId session row (the SessionSummary fields the join reads;
 * every field but `id` is optional so a partial catalog-era row still joins).
 */
export interface LineageSessionRow {
  readonly id: string
  readonly title?: string | undefined
  readonly displayTitle?: string | undefined
  /** The DIRECT durable parent (subagent rows); absent on top rows. */
  readonly parentId?: string | undefined
  /** Coarse durable origin — only 'subagent' rows join the lineage walk. */
  readonly origin?: 'subagent' | undefined
  readonly running?: boolean | undefined
}

/**
 * One native-index catalog child (SubagentListEntry 'child' projection):
 * the ADDRESS carrier — `mode` is the discriminator the hit's address
 * copies verbatim.
 */
export interface LineageCatalogChild {
  readonly kind: 'child'
  readonly id: string
  readonly mode: 'one-shot' | 'continuable'
  readonly activity?: 'running' | 'inactive' | undefined
  readonly label?: string | undefined
}

/**
 * One native-index catalog entry: the child arm above, or anything else
 * (diagnostics / forward-compatible kinds) — the walk skips the other arm.
 */
export type LineageCatalogEntry =
  | LineageCatalogChild
  | { readonly kind: string; readonly id?: string | undefined }

/** One parent-addressed catalog (the subagentsByParent bucket). */
export interface LineageCatalog {
  readonly entries?: readonly LineageCatalogEntry[] | undefined
}

/**
 * The upstream snapshot slice the join consumes: `byId` (session rows) +
 * `subagentsByParent` (the native address index). Both sources UNION into
 * the walk — catalogs carry the authoritative addresses, byId enriches
 * title/running and backfills catalog-absent rows (fallback address mode
 * 'one-shot', the safer open semantic; documented degrade, never a throw).
 */
export interface LineageSessionsSnapshot {
  readonly byId: Readonly<Record<string, LineageSessionRow | undefined>>
  readonly subagentsByParent?: Readonly<Record<string, LineageCatalog | undefined>>
}

/**
 * The guarded `ctx.sessions` service face (the 1.6 narrowing discipline):
 * `list.getSnapshot()` answered synchronously; availability is
 * RUNTIME-CONDITIONAL — {@link lineageSnapshotOf} reads it guarded and
 * answers undefined on any absence (degrade, never throw to callers).
 */
export interface LineageSessionsSource {
  readonly list: {
    getSnapshot(): unknown
  }
}

// ---------------------------------------------------------------------------
// Task reference + guarded source adapters
// ---------------------------------------------------------------------------

/** The task fields the derivation reads (a TaskSummary projection). */
export interface LineageTaskRef {
  /** Qualified `<featureSlug>/<localId>` — the badge's taskKey. */
  readonly key: string
  readonly title: string
  readonly status: TaskStatus
}

const isObject = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === 'object' && candidate !== null

const isFunction = (candidate: unknown): candidate is (...args: never[]) => unknown =>
  typeof candidate === 'function'

/**
 * Narrow the `ctx.sessions` service candidate onto the lineage read face
 * (the 1.6 `toSessionsFace` discipline: shape-validated once, absent or
 * partial services answer undefined — the derivation then degrades).
 */
export function toLineageSessionsSource(candidate: unknown): LineageSessionsSource | undefined {
  if (!isObject(candidate) || !isObject(candidate.list)) return undefined
  if (!isFunction(candidate.list.getSnapshot)) return undefined
  return candidate as unknown as LineageSessionsSource
}

/**
 * Read one snapshot off the source, GUARDED: a throwing or malformed read
 * (no object, no `byId` record) answers undefined — the runtime-conditional
 * availability contract (degrade to 仅顶层, auto-recover on the next good
 * read; BIZ-resilience-001: silent, structured-logged, never a throw).
 */
export function lineageSnapshotOf(source: LineageSessionsSource | undefined): LineageSessionsSnapshot | undefined {
  if (source === undefined) return undefined
  let raw: unknown
  try {
    raw = source.list.getSnapshot()
  } catch {
    return undefined
  }
  if (!isObject(raw) || !isObject(raw.byId)) return undefined
  const snapshot: LineageSessionsSnapshot = { byId: raw.byId as Record<string, LineageSessionRow | undefined> }
  if (isObject(raw.subagentsByParent)) {
    return { ...snapshot, subagentsByParent: raw.subagentsByParent as Record<string, LineageCatalog | undefined> }
  }
  return snapshot
}

/** Re-export the link input type (the derive entry consumes it verbatim). */
export type { SessionLink }
