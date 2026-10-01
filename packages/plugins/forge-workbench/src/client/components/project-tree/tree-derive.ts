/**
 * The C3 left-rail project tree's PURE derivation layer (task 1.4; ui-design
 * §Component C3 + workbench-layout-v2 §2 — 行语言 spec, data face only):
 * projects → top sessions → subagent lineage, the 分组×排序 trio, the
 * per-group overflow mass, the archived read-only partition and the
 * ungrouped (未分组) group — all computed from the read-only upstream faces
 * (ctx.workspaces / ctx.sessions snapshots + the listProjects registry DTO).
 *
 * Hard Rules honored HERE (the SC7 assertion's home):
 *   - the top level NEVER carries `origin === 'subagent'` entries — subagent
 *     rows attach under their parentSessionId only, and an orphaned subagent
 *     (missing parent) vanishes from display instead of leaking top-level;
 *   - the row language is drawn by the components above — this module never
 *     imports upstream internals, only the shapes the 1.6 seat adapts from
 *     the upstream snapshot faces (`subagentsByParent` semantics preserved:
 *     a subagent row is identified by its origin + parentSessionId pair).
 *
 * Lineage source = the upstream-native parent index projected onto flat
 * session rows (同步快照, no timeout face here — the ≤100ms degrade belongs
 * to the 2.5 lineage join; the component reserves the degraded copy seat).
 */
import type { Project } from '../../ipc-types'

// ---------------------------------------------------------------------------
// Input face — what the 1.6 seat feeds (mock data in the build stage)
// ---------------------------------------------------------------------------

/** Upstream session origin: `top` rows list; `subagent` rows never do (SC7). */
export type TreeSessionOrigin = 'top' | 'subagent'

/** One upstream workspace row (ctx.workspaces projection; path = canonical). */
export interface TreeWorkspace {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
}

/** One upstream session row (ctx.sessions projection, flattened). */
export interface TreeSession {
  readonly sessionId: string
  /** `null` (or unmatched) → the 未分组 group. */
  readonly workspaceId: string | null
  readonly title: string
  /** ISO 8601 — the recency sort + relative time source. */
  readonly updatedAt: string
  readonly origin: TreeSessionOrigin
  /** Lineage parent (subagent rows); `null` on top rows. */
  readonly parentSessionId: string | null
  /** Upstream AgentStatus === running (BIZ-004 时效衰减 applied upstream). */
  readonly running: boolean
  /** 待输入 — the dot priority's top rank. */
  readonly awaitingInput: boolean
  /** 未发首条消息 draft (单例, pinned top of its group, time slot hidden). */
  readonly blank?: boolean
}

// ---------------------------------------------------------------------------
// View options + layout memory faces
// ---------------------------------------------------------------------------

/** 区头 ⚙ popover: 分组方式 × 排序方式 (workbench-layout-v2 §2.2). */
export type TreeGrouping = 'tree' | 'by-project' | 'flat'

export type TreeSorting = 'manual' | 'recent'

export interface TreeViewOptions {
  readonly grouping: TreeGrouping
  readonly sorting: TreeSorting
}

/** 默认 按项目树 + 最近更新 (workbench-layout-v2 §2.2 note). */
export const DEFAULT_TREE_VIEW_OPTIONS: TreeViewOptions = { grouping: 'tree', sorting: 'recent' }

/**
 * Interface 4 `tree` block verbatim (tech-design §Interface 4 — the project
 * -scoped layout memory this component exposes; P4 wires the persistence):
 * which projects stand expanded, which session subtrees stand expanded, and
 * which groups ride past the overflow fold.
 */
export interface TreeLayoutState {
  readonly expandedProjects: readonly string[]
  readonly expandedSessions: readonly string[]
  readonly overflowOpen: readonly string[]
}

export const EMPTY_TREE_LAYOUT: TreeLayoutState = {
  expandedProjects: [],
  expandedSessions: [],
  overflowOpen: [],
}

/** 每组默认 5 条普通会话 (top-level rows; subagent rows never count). */
export const TREE_OVERFLOW_LIMIT = 5

/** The 未分组 group's overflow/layout key (a sentinel, never a projectId). */
export const UNGROUPED_KEY = '__ungrouped__'

// ---------------------------------------------------------------------------
// Derived model
// ---------------------------------------------------------------------------

/** The dot priority ladder's states (待输入 > 运行中 > subagent 运行中 > 空闲). */
export type SessionDotState = 'awaiting-input' | 'running' | 'subagent-running' | 'idle'

/** One subagent lineage node (recursive; depth 1 = direct child of a top row). */
export interface SubagentNode {
  readonly session: TreeSession
  readonly depth: number
  readonly children: readonly SubagentNode[]
}

/** One top-level session with its lineage subtree and the dot derivations. */
export interface TopSessionNode {
  readonly session: TreeSession
  readonly dot: SessionDotState
  readonly children: readonly SubagentNode[]
  /** Running descendants at any depth (hover card 「N 个子代理运行中」). */
  readonly runningDescendantCount: number
  readonly descendantCount: number
}

/** One active project group (the archived partition carries no sessions). */
export interface ProjectGroupNode {
  readonly project: Project
  readonly sessions: readonly TopSessionNode[]
}

/** One row of the 单列表 (flat) grouping — subagent rows inline (↳ 紧随其父). */
export interface FlatRowNode {
  readonly session: TreeSession
  readonly isSubagent: boolean
  /** The session's project; `null` for the ungrouped rows. */
  readonly project: Project | null
  readonly dot: SessionDotState
}

export interface DerivedTree {
  /** Active projects in grouping order (archived projects never here). */
  readonly projects: readonly ProjectGroupNode[]
  /** The 未分组 group (empty array when no ungrouped session exists). */
  readonly ungrouped: readonly TopSessionNode[]
  /** The archived read-only partition (project rows only — 不挂会话). */
  readonly archived: readonly Project[]
  /** The 单列表 rows; populated for grouping === 'flat' only. */
  readonly flat: readonly FlatRowNode[]
}

// ---------------------------------------------------------------------------
// Path matching (workspace → project assignment)
// ---------------------------------------------------------------------------

/**
 * Fold a path for comparison: lowercase + forward slashes + no trailing
 * separator — the D11 client-side echo (mock-grade; the kernel's
 * pathKey stays the authority for registration identity).
 */
export function treePathKey(path: string): string {
  return path.trim().toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')
}

// ---------------------------------------------------------------------------
// Lineage
// ---------------------------------------------------------------------------

const childListOf = (
  parentSessionId: string,
  childrenByParent: ReadonlyMap<string, readonly TreeSession[]>,
): readonly TreeSession[] => childrenByParent.get(parentSessionId) ?? []

function buildSubagentTree(
  rows: readonly TreeSession[],
  depth: number,
  childrenByParent: ReadonlyMap<string, readonly TreeSession[]>,
  visited: ReadonlySet<string>,
): readonly SubagentNode[] {
  const nodes: SubagentNode[] = []
  for (const session of rows) {
    if (visited.has(session.sessionId)) continue // cycle defense
    const children = buildSubagentTree(
      childListOf(session.sessionId, childrenByParent),
      depth + 1,
      childrenByParent,
      new Set([...visited, session.sessionId]),
    )
    nodes.push({ session, depth, children })
  }
  return nodes
}

const countRunning = (nodes: readonly SubagentNode[]): number =>
  nodes.reduce((sum, node) =>
    sum + (node.session.running ? 1 : 0) + countRunning(node.children), 0)

const countAll = (nodes: readonly SubagentNode[]): number =>
  nodes.reduce((sum, node) => sum + 1 + countAll(node.children), 0)

/** The dot ladder: 待输入 > 运行中 > subagent 运行中 > (空闲 = no dot). */
export function sessionDotOf(
  session: TreeSession,
  runningDescendantCount: number,
): SessionDotState {
  if (session.awaitingInput) return 'awaiting-input'
  if (session.running) return 'running'
  if (runningDescendantCount > 0) return 'subagent-running'
  return 'idle'
}

/**
 * The lineage top list: `origin !== 'subagent'` ONLY (SC7 — a subagent row
 * never surfaces at top level, orphaned ones drop out of display entirely).
 */
export function topSessionsOf(sessions: readonly TreeSession[]): readonly TopSessionNode[] {
  const childrenByParent = new Map<string, TreeSession[]>()
  for (const session of sessions) {
    if (session.origin !== 'subagent' || session.parentSessionId === null) continue
    const bucket = childrenByParent.get(session.parentSessionId)
    if (bucket === undefined) childrenByParent.set(session.parentSessionId, [session])
    else bucket.push(session)
  }
  const nodes: TopSessionNode[] = []
  for (const session of sessions) {
    if (session.origin === 'subagent') continue
    const children = buildSubagentTree(
      childListOf(session.sessionId, childrenByParent), 1, childrenByParent,
      new Set([session.sessionId]),
    )
    const runningDescendantCount = countRunning(children)
    nodes.push({
      session,
      children,
      runningDescendantCount,
      descendantCount: countAll(children),
      dot: sessionDotOf(session, runningDescendantCount),
    })
  }
  return nodes
}

/**
 * The ancestor id chain of a session, NEAREST first, self excluded — the
 * 「激活会话祖先链默认展开」 source (AC3). Missing parents / cycles stop
 * the walk; `null` answers the empty chain.
 */
export function ancestorChainOf(
  sessionId: string | null | undefined,
  sessions: readonly TreeSession[],
): readonly string[] {
  if (sessionId === null || sessionId === undefined) return []
  const byId = new Map(sessions.map(session => [session.sessionId, session]))
  const chain: string[] = []
  const visited = new Set<string>([sessionId])
  let current = byId.get(sessionId)
  while (current !== undefined && current.parentSessionId !== null && !visited.has(current.parentSessionId)) {
    const parent = byId.get(current.parentSessionId)
    if (parent === undefined) break
    chain.push(parent.sessionId)
    visited.add(parent.sessionId)
    current = parent
  }
  return chain
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const blankFirst = (a: TreeSession, b: TreeSession): number =>
  (a.blank === true ? 0 : 1) - (b.blank === true ? 0 : 1)

/**
 * Group-internal session order: `recent` = updatedAt new→old (ISO strings
 * compare lexicographically); `manual` = the input order (the upstream
 * hand-dragged order the seat passes through). Blank drafts pin top in
 * BOTH modes (the 新会话单例置顶 ruling).
 */
export function sortSessionRows<T extends { session: TreeSession }>(rows: readonly T[], sorting: TreeSorting): readonly T[] {
  const copy = [...rows]
  copy.sort((a, b) => {
    const pinned = blankFirst(a.session, b.session)
    if (pinned !== 0) return pinned
    if (sorting === 'recent') {
      if (a.session.updatedAt > b.session.updatedAt) return -1
      if (a.session.updatedAt < b.session.updatedAt) return 1
    }
    return 0 // manual (or recency tie) = stable input order
  })
  return copy
}

const groupRecency = (group: ProjectGroupNode): string =>
  group.sessions.reduce((latest, node) =>
    node.session.updatedAt > latest ? node.session.updatedAt : latest, '')

/** Projects: manual = sortOrder (registration order); recent = newest session first. */
export function sortProjectGroups(
  groups: readonly ProjectGroupNode[],
  sorting: TreeSorting,
): readonly ProjectGroupNode[] {
  const copy = [...groups]
  copy.sort((a, b) => {
    if (sorting === 'recent') {
      const recencyA = groupRecency(a)
      const recencyB = groupRecency(b)
      // Session-bearing projects first (newest wins); empty projects keep
      // the registration order among themselves.
      if (recencyA !== '' || recencyB !== '') {
        if (recencyA > recencyB) return -1
        if (recencyA < recencyB) return 1
      }
    }
    return a.project.sortOrder - b.project.sortOrder
  })
  return copy
}

// ---------------------------------------------------------------------------
// The derivation entry
// ---------------------------------------------------------------------------

/**
 * Derive the whole tree model. Session → project assignment = the workspace
 * path folded against `project.codeRoot` (the projection's canonical
 * pairing); null / unmatched workspaces land in the 未分组 group, and
 * sessions of ARCHIVED projects drop from display entirely (归档分区不挂
 * 会话 — the dsh side keeps them, C8/设置恢复 per the upstream face).
 */
export function deriveTree(
  projects: readonly Project[],
  workspaces: readonly TreeWorkspace[],
  sessions: readonly TreeSession[],
  options: TreeViewOptions,
): DerivedTree {
  const projectByWorkspaceId = new Map<string, Project>()
  for (const workspace of workspaces) {
    const hit = projects.find(project => treePathKey(project.codeRoot) === treePathKey(workspace.path))
    if (hit !== undefined) projectByWorkspaceId.set(workspace.workspaceId, hit)
  }

  const active = projects.filter(project => !project.archived)
  const archived = projects.filter(project => project.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // Top nodes per project + the ungrouped bucket, in input order.
  const buckets = new Map<string, TopSessionNode[]>(active.map(project => [project.id, []]))
  const ungroupedInput: TopSessionNode[] = []
  for (const node of topSessionsOf(sessions)) {
    const workspaceId = node.session.workspaceId
    const project = workspaceId === null ? undefined : projectByWorkspaceId.get(workspaceId)
    if (project === undefined) {
      ungroupedInput.push(node)
      continue
    }
    if (project.archived) continue // 已归档会话行消失 (不挂会话)
    buckets.get(project.id)?.push(node)
  }

  const groups: ProjectGroupNode[] = active.map(project => ({
    project,
    sessions: sortSessionRows(buckets.get(project.id) ?? [], options.sorting),
  }))

  // The flat list merges every group + the ungrouped rows.
  const flat: FlatRowNode[] = []
  if (options.grouping === 'flat') {
    // Descendants flatten depth-first, then ONE global recency pass over the
    // flattened list (the prototype flatSessions semantics: descendants
    // cluster after their parent, newest first among themselves).
    const flattenDescendants = (nodes: readonly SubagentNode[], sorted: boolean): FlatRowNode[] => {
      const rows: FlatRowNode[] = []
      const walk = (list: readonly SubagentNode[]): void => {
        for (const node of list) {
          const dot = sessionDotOf(node.session, countRunning(node.children))
          rows.push({ session: node.session, isSubagent: true, project: null, dot })
          walk(node.children)
        }
      }
      walk(nodes)
      if (sorted) {
        rows.sort((a, b) => (a.session.updatedAt > b.session.updatedAt ? -1 : a.session.updatedAt < b.session.updatedAt ? 1 : 0))
      }
      return rows
    }
    // Global merge: every top node (all projects + ungrouped) in ONE recency
    // ladder — `recent` re-sorts globally (blank drafts pinned), `manual`
    // keeps the per-group input order merged group by group.
    const pairs: Array<{ node: TopSessionNode; project: Project | null }> = []
    for (const group of groups) {
      for (const node of group.sessions) pairs.push({ node, project: group.project })
    }
    for (const node of sortSessionRows(ungroupedInput, options.sorting)) pairs.push({ node, project: null })
    if (options.sorting === 'recent') {
      pairs.sort((a, b) => {
        const pinned = (a.node.session.blank === true ? 0 : 1) - (b.node.session.blank === true ? 0 : 1)
        if (pinned !== 0) return pinned
        if (a.node.session.updatedAt > b.node.session.updatedAt) return -1
        if (a.node.session.updatedAt < b.node.session.updatedAt) return 1
        return 0
      })
    }
    for (const { node, project } of pairs) {
      flat.push({ session: node.session, isSubagent: false, project, dot: node.dot })
      const descendants = flattenDescendants(node.children, options.sorting === 'recent')
      // The flat row's project tag rides on the descendants too (search).
      for (const row of descendants) flat.push({ ...row, project })
    }
  }

  return {
    projects: sortProjectGroups(groups, options.sorting),
    ungrouped: sortSessionRows(ungroupedInput, options.sorting),
    archived,
    flat,
  }
}

// ---------------------------------------------------------------------------
// Search (区头 🔍 — 项目名 + 会话标题, per-group row-level predicates)
// ---------------------------------------------------------------------------

export function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}

export function sessionMatches(session: TreeSession, query: string): boolean {
  return session.title.toLowerCase().includes(query)
}

export function projectMatches(project: Project, query: string): boolean {
  return project.displayName.toLowerCase().includes(query)
}

/** A top node matches when its own title OR any descendant title matches. */
export function topNodeMatches(node: TopSessionNode, query: string): boolean {
  if (sessionMatches(node.session, query)) return true
  const stack = [...node.children]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (sessionMatches(current.session, query)) return true
    stack.push(...current.children)
  }
  return false
}

// ---------------------------------------------------------------------------
// Relative time (刚刚 / N分钟 / N小时 / N天 — the spec ladder, hours gap filled)
// ---------------------------------------------------------------------------

export type RelativeTimePart =
  | { readonly kind: 'just-now' }
  | { readonly kind: 'minutes'; readonly value: number }
  | { readonly kind: 'hours'; readonly value: number }
  | { readonly kind: 'days'; readonly value: number }

/** Pure clock math (C3 Data Binding 时间格式化); the copy lives in locale. */
export function relativeTimePart(updatedAt: string, now: number): RelativeTimePart {
  const parsed = Date.parse(updatedAt)
  const elapsedSeconds = Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : Math.max(0, (now - parsed) / 1000)
  if (elapsedSeconds < 60) return { kind: 'just-now' }
  if (elapsedSeconds < 3600) return { kind: 'minutes', value: Math.floor(elapsedSeconds / 60) }
  if (elapsedSeconds < 86_400) return { kind: 'hours', value: Math.floor(elapsedSeconds / 3600) }
  return { kind: 'days', value: Math.floor(elapsedSeconds / 86_400) }
}
