/**
 * The lineage derivation itself (M4 task 2.5, tech-design §Interface 3 —
 * T2 裁决: client half, pure read-only): the upstream `ctx.sessions`
 * snapshot (byId rows ⊕ the subagentsByParent native index) JOINED against
 * the kernel's session_links (the M3 get-task-detail verb's rows) into a
 * {@link TaskBinding}. 点击时计算 — no standing index, no persistence, no
 * write path anywhere (PRD 必答⑥: 血缘推断不落库,可随时重算).
 *
 * The join's two sources UNION per parent: the native catalog entries are
 * the ADDRESS authority (`SubagentListEntry.mode` rides the hit's address
 * triple verbatim), while byId enriches title/running and backfills rows a
 * catalog miss has not yet served (fallback address mode 'one-shot' — the
 * SAFER mislabel: a continuable child opened read-only still opens; the
 * reverse would prompt a terminal one). Cycles surrender at the visited
 * set (the 1.4 tree-derive defense); the ≤100ms budget checkpoints the
 * walk cooperatively (budget.ts) and a degrade answers 仅顶层 — links stay,
 * descendants drop, the next call auto-recovers (pure recompute).
 */
import type { SessionLink, TaskStatus } from '../ipc-types'
import {
  createLineageDeadline, LINEAGE_CHECK_INTERVAL, logLineageDegraded, type LineageDeadline,
  type LineageLog,
} from './budget'
import type {
  LineageCatalogChild, LineageCatalogEntry, LineageSessionRow, LineageSessionsSnapshot,
  LineageTaskRef, SessionTaskBadge, SubagentHit, TaskBinding, TaskLinkRow,
} from './types'

/** The per-derivation descendant display cap — the 「查看全部」 fold (必答⑥). */
export const LINEAGE_DESCENDANT_LIMIT = 20

/**
 * Narrow a catalog entry onto the address-carrying child arm (the `other`
 * arm's `kind: string` blocks discriminant narrowing — validate through
 * the child view instead; a malformed child degrades to skipped, never a
 * throw).
 */
const isCatalogChild = (entry: LineageCatalogEntry): entry is LineageCatalogChild => {
  if (entry.kind !== 'child') return false
  const child = entry as LineageCatalogChild
  return typeof child.id === 'string' && (child.mode === 'one-shot' || child.mode === 'continuable')
}

// ---------------------------------------------------------------------------
// BIZ-workbench-008: 执行中判定 (状态 × 挂接正交)
// ---------------------------------------------------------------------------

/** The judgment bits the matrix produces (see {@link judgeExecuting}). */
export interface ExecutionJudgment {
  /** in_progress ∧ an active link exists → 执行中 (突出呈现). */
  readonly executing: boolean
  /** in_progress WITHOUT an active link → 常规 + 未挂接标注位. */
  readonly unlinkedInProgress: boolean
}

const hasActiveLink = (links: readonly SessionLink[]): boolean =>
  links.some(link => link.status === 'active')

/**
 * The 执行中判定 matrix (BIZ-workbench-008, exact): status and linkage are
 * ORTHOGONAL facts — only their conjunction counts as executing; an
 * in_progress task with no active link stays 常规 and carries the 未挂接
 * marker; every non-in_progress status answers 常规 (both bits false).
 */
export function judgeExecuting(taskStatus: TaskStatus, links: readonly SessionLink[]): ExecutionJudgment {
  if (taskStatus !== 'in_progress') return { executing: false, unlinkedInProgress: false }
  return hasActiveLink(links)
    ? { executing: true, unlinkedInProgress: false }
    : { executing: false, unlinkedInProgress: true }
}

// ---------------------------------------------------------------------------
// The recursive lineage walk (catalog ⊕ byId union, DFS in tree order)
// ---------------------------------------------------------------------------

/** One per-derivation walk accumulator (shared across every active root). */
interface WalkState {
  readonly hits: SubagentHit[]
  /** Cycle defense + cross-root dedupe (a session joins its first tree). */
  readonly visited: Set<string>
  nodeCount: number
  timedOut: boolean
}

/** byId-origin rows keyed by their direct durable parent (one pass). */
type ChildrenByParent = ReadonlyMap<string, readonly LineageSessionRow[]>

function indexByParent(snapshot: LineageSessionsSnapshot): ChildrenByParent {
  const map = new Map<string, LineageSessionRow[]>()
  for (const row of Object.values(snapshot.byId)) {
    if (row === undefined || row.origin !== 'subagent') continue
    if (typeof row.parentId !== 'string' || row.parentId === '') continue
    const bucket = map.get(row.parentId)
    if (bucket === undefined) map.set(row.parentId, [row])
    else bucket.push(row)
  }
  return map
}

const catalogChildrenOf = (snapshot: LineageSessionsSnapshot, parentId: string): readonly LineageCatalogChild[] => {
  const entries = snapshot.subagentsByParent?.[parentId]?.entries
  if (entries === undefined) return []
  return entries.filter(isCatalogChild)
}

const hitOf = (
  sessionId: string,
  parentId: string,
  depth: number,
  mode: 'one-shot' | 'continuable',
  row: LineageSessionRow | undefined,
  catalog: LineageCatalogChild | undefined,
): SubagentHit => ({
  sessionId,
  parentSessionId: parentId,
  title: row?.title ?? row?.displayTitle ?? catalog?.label ?? sessionId,
  running: row?.running ?? catalog?.activity === 'running',
  depth,
  address: { parentSessionId: parentId, childSessionId: sessionId, mode },
})

/**
 * Walk ONE parent's children (catalog order first — the address authority —
 * then byId-only backfills) recursing depth-first. The shared state's
 * `visited` set makes the walk idempotent across parents and roots; the
 * deadline checkpoints every {@link LINEAGE_CHECK_INTERVAL} nodes and
 * surrenders the WHOLE walk (`timedOut` — 仅顶层, never a partial tree).
 */
function walkChildren(
  parentId: string,
  depth: number,
  snapshot: LineageSessionsSnapshot,
  childrenByParent: ChildrenByParent,
  state: WalkState,
  deadline: LineageDeadline,
  now: () => number,
): void {
  if (state.timedOut) return
  const catalogChildren = catalogChildrenOf(snapshot, parentId)
  const catalogIds = new Set(catalogChildren.map(child => child.id))
  // Catalog children first (addresses verbatim), then byId rows the catalog
  // has not served (fallback address, one-shot — the safer open semantic).
  const extras = (childrenByParent.get(parentId) ?? []).filter(row => !catalogIds.has(row.id))
  for (const child of catalogChildren) {
    if (state.timedOut) return
    if (state.visited.has(child.id)) continue // cycle / already joined
    state.visited.add(child.id)
    state.nodeCount += 1
    if (state.nodeCount % LINEAGE_CHECK_INTERVAL === 0 && deadline.expired(now())) {
      state.timedOut = true
      return
    }
    state.hits.push(hitOf(child.id, parentId, depth, child.mode, snapshot.byId[child.id], child))
    walkChildren(child.id, depth + 1, snapshot, childrenByParent, state, deadline, now)
  }
  for (const row of extras) {
    if (state.timedOut) return
    if (state.visited.has(row.id)) continue
    state.visited.add(row.id)
    state.nodeCount += 1
    if (state.nodeCount % LINEAGE_CHECK_INTERVAL === 0 && deadline.expired(now())) {
      state.timedOut = true
      return
    }
    state.hits.push(hitOf(row.id, parentId, depth, 'one-shot', row, undefined))
    walkChildren(row.id, depth + 1, snapshot, childrenByParent, state, deadline, now)
  }
}

/** The per-session derivation's product (the C5 row-expand face). */
export interface SessionLineageResult {
  /** DFS-ordered hits, capped at {@link LINEAGE_DESCENDANT_LIMIT}. */
  readonly hits: readonly SubagentHit[]
  /** The FULL recursive count (查看全部 fold: total > hits.length). */
  readonly total: number
  /** true ⇔ the budget expired — callers degrade to 仅顶层 (hits drop). */
  readonly timedOut: boolean
}

/**
 * Derive ONE top session's subagent lineage tree (the row-expand face C5
 * consumes for ANY link row whose session still lives; the task binding
 * reuses the same walk for its active links). Pure — freeze-safe inputs,
 * no mutation, no writes.
 */
export function deriveSessionLineage(
  topSessionId: string,
  snapshot: LineageSessionsSnapshot | undefined,
  options?: {
    readonly budgetMs?: number
    readonly now?: () => number
    readonly deadline?: LineageDeadline
  },
): SessionLineageResult {
  if (snapshot === undefined) return { hits: [], total: 0, timedOut: false }
  const now = options?.now ?? Date.now
  const deadline = options?.deadline ?? createLineageDeadline(now, options?.budgetMs)
  const state: WalkState = { hits: [], visited: new Set([topSessionId]), nodeCount: 0, timedOut: false }
  walkChildren(topSessionId, 1, snapshot, indexByParent(snapshot), state, deadline, now)
  if (state.timedOut) return { hits: [], total: 0, timedOut: true }
  return {
    hits: state.hits.slice(0, LINEAGE_DESCENDANT_LIMIT),
    total: state.hits.length,
    timedOut: false,
  }
}

// ---------------------------------------------------------------------------
// The task binding entry (links ⊕ snapshot → TaskBinding)
// ---------------------------------------------------------------------------

/** Links 新→旧 (startedAt descending; stable on ties — the kernel order). */
function sortLinksNewestFirst(links: readonly SessionLink[]): readonly SessionLink[] {
  return [...links].sort((a, b) => (a.startedAt > b.startedAt ? -1 : a.startedAt < b.startedAt ? 1 : 0))
}

/** The derive entry's input (every member but task/links optional). */
export interface DeriveTaskBindingInput {
  /** The task being looked up (a TaskSummary projection; badges carry it). */
  readonly task: LineageTaskRef
  /** session_links rows as get-task-detail answers them (any order). */
  readonly links: readonly SessionLink[]
  /** The upstream snapshot; undefined (or malformed-adapter-absent) → degraded. */
  readonly sessions?: LineageSessionsSnapshot | undefined
  /** Budget override; default {@link LINEAGE_BUDGET_MS} = 100. */
  readonly budgetMs?: number
  /** Clock seam (tests); default Date.now. */
  readonly now?: () => number
  /** Structured log sink; default console.warn (budget.ts). */
  readonly log?: LineageLog
}

/**
 * Derive the whole {@link TaskBinding}: links (active/ended, 新→旧, with the
 * byId join bit), the ACTIVE links' recursive executingSubagents (capped,
 * totaled), the reverse badges, the BIZ-workbench-008 judgment — degrading
 * to 仅顶层 (links stay, descendants drop, degraded=true, ONE structured
 * log line) when the snapshot is absent or the budget expires. Pure and
 * re-runnable: the 恢复自动回完整 mode is simply the next call.
 */
export function deriveTaskBinding(input: DeriveTaskBindingInput): TaskBinding {
  const { task, links } = input
  const judgment = judgeExecuting(task.status, links)
  const ordered = sortLinksNewestFirst(links)

  const linkRows: readonly TaskLinkRow[] = ordered.map(link => ({
    sessionId: link.sessionId,
    status: link.status,
    startedAt: link.startedAt,
    ...(link.endedAt === null || link.endedAt === undefined ? {} : { endedAt: link.endedAt }),
    lineageAvailable: input.sessions?.byId[link.sessionId] !== undefined,
  }))

  // 上游快照缺席 → 降级仅顶层 (BIZ-resilience-001: silent + structured log).
  if (input.sessions === undefined) {
    logLineageDegraded('snapshot-absent', task, input.log)
    return {
      links: linkRows,
      executingSubagents: [],
      executingSubagentTotal: 0,
      sessionTaskBadges: [],
      degraded: true,
      ...judgment,
    }
  }

  const snapshot = input.sessions
  const now = input.now ?? Date.now
  const deadline = createLineageDeadline(now, input.budgetMs)
  const state: WalkState = { hits: [], visited: new Set<string>(), nodeCount: 0, timedOut: false }
  const childrenByParent = indexByParent(snapshot)
  const walkedRoots = new Set<string>()
  for (const link of ordered) {
    if (link.status !== 'active' || walkedRoots.has(link.sessionId)) continue
    walkedRoots.add(link.sessionId)
    state.visited.add(link.sessionId)
    walkChildren(link.sessionId, 1, snapshot, childrenByParent, state, deadline, now)
    if (state.timedOut) break
  }

  // 预算超限 → 降级仅顶层 (partials would mislead the badge counts — drop all).
  if (state.timedOut) {
    logLineageDegraded('budget-expired', task, input.log, now() - deadline.startedAt)
    return {
      links: linkRows,
      executingSubagents: [],
      executingSubagentTotal: 0,
      sessionTaskBadges: sessionTaskBadgesOf(task, ordered, snapshot),
      degraded: true,
      ...judgment,
    }
  }

  return {
    links: linkRows,
    executingSubagents: state.hits.slice(0, LINEAGE_DESCENDANT_LIMIT),
    executingSubagentTotal: state.hits.length,
    sessionTaskBadges: sessionTaskBadgesOf(task, ordered, snapshot),
    degraded: false,
    ...judgment,
  }
}

/** Reverse badges: every linked session still present in byId (命名辅助). */
function sessionTaskBadgesOf(
  task: LineageTaskRef,
  orderedLinks: readonly SessionLink[],
  snapshot: LineageSessionsSnapshot,
): readonly SessionTaskBadge[] {
  const badges: SessionTaskBadge[] = []
  for (const link of orderedLinks) {
    if (snapshot.byId[link.sessionId] === undefined) continue // disposed → no row to badge
    badges.push({ sessionId: link.sessionId, taskKey: task.key, title: task.title })
  }
  return badges
}
