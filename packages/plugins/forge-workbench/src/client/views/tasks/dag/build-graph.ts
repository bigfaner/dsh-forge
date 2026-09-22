/**
 * The UF2 视图 A graph builder, PURE (task 5.6): TaskSummary[] → the
 * ReactFlow node/edge sets + the keyboard-traversal index. Every AC-1 leg
 * lives here so the consistency assertions run without React:
 *
 *   edges      one edge per RESOLVABLE blocker pair — edge.source = the
 *              blocker task, edge.target = the blocked task, id
 *              `e:<blocker>-><blocked>`. Each edge traces back to the
 *              target task's `blockers` entry (the 2.5 dialect: same-feature
 *              LOCAL keys, re-qualified via resolveBlockerKey), and BOTH
 *              endpoints must be in the visible set — a filter never
 *              manufactures edges, it only narrows them.
 *   dangling   a blocker resolving against NO task in the FULL set renders
 *              no edge (there is no node to draw to) and the NODE carries
 *              the 悬空标记 instead (the page's computeDanglingByTask, full
 *              set semantics — a filter must not manufacture dangling marks
 *              either). Never silently dropped: `data.danglingBlockers`
 *              rides every node.
 *   nodes      id = the qualified board key (feature-unique), ariaLabel =
 *              `<key> · <title>` (view B card parity).
 */
import type { Edge, Node } from '@xyflow/react'
import type { TaskSummary } from '../../../ipc-types'
import type { WorkbenchKey } from '../../../locale/en'
import { resolveBlockerKey } from '../../TaskBoardPage'
import { NODE_CARD_HEIGHT, NODE_CARD_WIDTH, layoutGraph, type DagEdgeRef, type DagPosition } from './layout'

/** The edge stroke/marker colour: ui-design 视图 A 边 1.5px border-l2. */
const EDGE_COLOR = 'var(--dsh-border-color, rgba(128, 128, 128, 0.55))'

/** The locale seat shape carried inside node data (the card renders through it). */
export type DagTranslate = (key: WorkbenchKey) => string

/** The custom-node data payload: everything the card renders, nothing else. */
export interface TaskCardNodeData extends Record<string, unknown> {
  readonly task: TaskSummary
  /** Same-feature LOCAL blocker keys resolving to no task in the FULL set (the 悬空标记 input). */
  readonly danglingBlockers: readonly string[]
  /** The 回流 highlight flag (attribute-level changes light the card). */
  readonly updating: boolean
  /**
   * The single-source selection mark (5.8): TRUE on the selected-store key —
   * the ui-design 焦点任务 border (`--dsw-alias-link` 1.5px) renders from it.
   */
  readonly selected: boolean
  /** The locale seat (the shell's `t`). */
  readonly t: DagTranslate
}

/** The view-A node: a task card (`nodeTypes.taskCard`). */
export type TaskDagNode = Node<TaskCardNodeData, 'taskCard'>

/** The view-A edge: blocker → blocked, arrow at the blocked end. */
export type TaskDagEdge = Edge

/** The built graph: renderable nodes (already laid out) + edges. */
export interface TaskDagGraph {
  readonly nodes: TaskDagNode[]
  readonly edges: TaskDagEdge[]
}

/**
 * Build the render graph from the visible tasks.
 * @param tasks - the post-filter task set (the page owns filtering — Hard Rule).
 * @param danglingByTask - key → dangling LOCAL blockers, computed against the FULL set.
 * @param updatingKeys - task keys currently carrying the 回流 highlight.
 * @param t - the locale seat.
 * @param selectedKey - the single-source selection key (5.8), or undefined
 *   with no selection — the matching node carries the 焦点任务 mark.
 * @returns nodes in layout reading order (layer top-down, then left→right —
 *   the Tab order ui-design specifies) with positions from the layered layout.
 */
export function buildTaskGraph(
  tasks: readonly TaskSummary[],
  danglingByTask: ReadonlyMap<string, readonly string[]>,
  updatingKeys: ReadonlySet<string>,
  t: DagTranslate,
  selectedKey?: string | undefined,
): TaskDagGraph {
  const visibleKeys = new Set(tasks.map(task => task.key))
  const edges: TaskDagEdge[] = []
  const edgeIds = new Set<string>()
  for (const task of tasks) {
    for (const blocker of task.blockers) {
      const source = resolveBlockerKey(task.featureSlug, blocker)
      if (!visibleKeys.has(source)) continue
      const id = `e:${source}->${task.key}`
      if (edgeIds.has(id)) continue
      edgeIds.add(id)
      edges.push({
        id,
        source,
        target: task.key,
        // ui-design: 边 = blocker → blocked, 1.5px, arrowhead on the blocked end.
        style: { stroke: EDGE_COLOR, strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed', color: EDGE_COLOR, width: 14, height: 14 },
      })
    }
  }

  const positions = layoutGraph(
    tasks.map(task => task.key),
    edges,
  )
  const nodes: TaskDagNode[] = tasks.map(task => ({
    id: task.key,
    type: 'taskCard' as const,
    // layoutGraph's contract: every input key comes back with a position.
    position: positions.get(task.key)!,
    data: {
      task,
      danglingBlockers: danglingByTask.get(task.key) ?? [],
      updating: updatingKeys.has(task.key),
      selected: selectedKey === task.key,
      t,
    },
    width: NODE_CARD_WIDTH,
    height: NODE_CARD_HEIGHT,
    ariaLabel: `${task.key} · ${task.title}`,
  }))
  // Layout reading order = DOM order = Tab order: 自上而下, 同行左→右.
  nodes.sort((a, b) =>
    a.position.y - b.position.y
    || a.position.x - b.position.x
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// Keyboard traversal (AC3: 方向键沿依赖边移动焦点; 同行左→右)
// ---------------------------------------------------------------------------

/** The four arrow directions the traversal answers. */
export type FocusDirection = 'up' | 'down' | 'left' | 'right'

/** The per-node neighbour sets the traversal moves along. */
export interface TraversalEntry {
  /** Blocker (upstream) candidates, leftmost first. */
  readonly blockers: readonly string[]
  /** Blocked (downstream) candidates, leftmost first. */
  readonly blocked: readonly string[]
  /** The node's own row (same-layer keys, layout left→right order). */
  readonly row: readonly string[]
}

/** key → its traversal neighbours. */
export type TraversalIndex = ReadonlyMap<string, TraversalEntry>

/**
 * Index the laid-out graph for focus movement.
 * @param positions - key → laid-out position (layer pitch is the row key).
 * @param edges - the resolvable blocker→blocked relations.
 * @returns the traversal index over every positioned key.
 */
export function buildTraversalIndex(
  positions: ReadonlyMap<string, DagPosition>,
  edges: readonly DagEdgeRef[],
): TraversalIndex {
  // Rows: same y (same layer) in left→right order.
  const rows = new Map<number, string[]>()
  for (const [key, position] of positions) {
    const row = rows.get(position.y)
    if (row === undefined) rows.set(position.y, [key])
    else row.push(key)
  }
  const rowOrdered = new Map<number, string[]>()
  for (const [y, keys] of rows) {
    rowOrdered.set(y, [...keys].sort((a, b) =>
      positions.get(a)!.x - positions.get(b)!.x || (a < b ? -1 : a > b ? 1 : 0)))
  }

  const blockersOf = new Map<string, string[]>()
  const blockedOf = new Map<string, string[]>()
  const known = new Set(positions.keys())
  for (const edge of edges) {
    if (!known.has(edge.source) || !known.has(edge.target)) continue
    let blockers = blockersOf.get(edge.target)
    if (blockers === undefined) blockersOf.set(edge.target, blockers = [])
    blockers.push(edge.source)
    let blocked = blockedOf.get(edge.source)
    if (blocked === undefined) blockedOf.set(edge.source, blocked = [])
    blocked.push(edge.target)
  }

  const index = new Map<string, TraversalEntry>()
  for (const [key, position] of positions) {
    // Every positioned key's y owns a row (rows are keyed by those very ys).
    const row = rowOrdered.get(position.y)!
    const byRowOrder = (a: string, b: string): number =>
      positions.get(a)!.x - positions.get(b)!.x || (a < b ? -1 : a > b ? 1 : 0)
    index.set(key, {
      blockers: [...blockersOf.get(key) ?? []].sort(byRowOrder),
      blocked: [...blockedOf.get(key) ?? []].sort(byRowOrder),
      row,
    })
  }
  return index
}

/** The horizontal distance between two keys' positions (Infinity when a key is unknown). */
function horizontalDistance(positions: ReadonlyMap<string, DagPosition>, a: string, b: string): number {
  const pa = positions.get(a)
  const pb = positions.get(b)
  if (pa === undefined || pb === undefined) return Number.POSITIVE_INFINITY
  return Math.abs(pa.x - pb.x)
}

/** The candidate closest to `current` horizontally (ties: leftmost). */
function nearestByX(
  positions: ReadonlyMap<string, DagPosition>,
  current: string,
  candidates: readonly string[],
): string | undefined {
  let best: string | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const distance = horizontalDistance(positions, current, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

/**
 * The next focus target from `current` along a direction:
 * up → the nearest (by x) blocker, down → the nearest blocked task,
 * left/right → the adjacent node in the same layer (layout 左→右 order).
 * @param index - the traversal index.
 * @param positions - the laid-out positions (nearest-by-x tie-breaking).
 * @param current - the focused node key.
 * @param direction - the arrow direction.
 * @returns the next key, or undefined at a boundary (focus stays).
 */
export function nextFocusKey(
  index: TraversalIndex,
  positions: ReadonlyMap<string, DagPosition>,
  current: string,
  direction: FocusDirection,
): string | undefined {
  const entry = index.get(current)
  if (entry === undefined) return undefined
  if (direction === 'up') {
    return nearestByX(positions, current, entry.blockers)
  }
  if (direction === 'down') {
    return nearestByX(positions, current, entry.blocked)
  }
  const row = entry.row
  // The index builds `row` from the positioned keys themselves, so a key
  // present in the index is present in its row.
  const at = row.indexOf(current)
  const next = direction === 'left' ? at - 1 : at + 1
  return row[next]
}
