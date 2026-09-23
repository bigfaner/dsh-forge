/**
 * The UF2 视图 A auto-layout, PURE JS (task 5.6; the recorded 布局定形 the
 * task Description demands): a **layered top-down DAG** — blocker layers sit
 * above the tasks they block, exactly the ui-design 视图 A sketch
 * ("自上而下分层 DAG,blocker 在上,被阻塞在下").
 *
 * Algorithm (deterministic, zero dependencies — Hard Rule: 布局算法用 JS
 * 实现,不得引入原生依赖; no dagre/elk, nothing enters the bundle but this
 * file):
 *   1. canonical order — nodes are keyed and processed in lexicographic key
 *      order, so the output is a pure function of the SET (input order never
 *      leaks into geometry);
 *   2. layering — longest-path depth: layer(t) = max(layer(blocker)) + 1 over
 *      resolvable blockers; roots sit at layer 0. A cycle guard treats a
 *      back-edge as a depth-0 contributor (forge blockers should be acyclic;
 *      the guard keeps the layout finite and deterministic when they are not);
 *   3. ordering — two barycenter sweeps down + two up order each layer by the
 *      mean position of its cross-layer neighbours (ties break on the key),
 *      reducing edge crossings;
 *   4. geometry — x centers each layer on 0 (half the layer width to the
 *      left), y = layer × row pitch. Same input ⇒ same output, byte for byte.
 *
 * The 500-node budget (SC1 分摊): step 2/3/4 are linear-ish (fixed 4 sweeps);
 * the perf leg in tests/task-dag.spec.tsx records the measured build+layout
 * time against a generous CI threshold.
 */

/** Node card width (ui-design 视图 A 节点卡 w240). */
export const NODE_CARD_WIDTH = 240

/** Node card height: the fixed three-row card (title 22 + meta 18 + badges 18 + pad 20 + gaps 8). */
export const NODE_CARD_HEIGHT = 88

/** Horizontal gap between sibling cards inside a layer. */
export const NODE_GAP_X = 36

/** Vertical pitch between layers (card height + breathing room for the edge). */
export const LAYER_GAP_Y = NODE_CARD_HEIGHT + 56

/** A placed node position on the canvas (unzoomed flow coordinates). */
export interface DagPosition {
  readonly x: number
  readonly y: number
}

/** The minimal edge shape the layout consumes: source = blocker, target = blocked. */
export interface DagEdgeRef {
  readonly source: string
  readonly target: string
}

/** The layer + within-layer order the sweeps converge on (also the traversal input). */
interface LayerOrder {
  layers: string[][]
}

/**
 * Assign each node its longest-path layer (roots = 0, blockers above).
 * @param ids - every node key, in canonical (sorted) order.
 * @param edges - the resolvable blocker→blocked relations.
 * @returns key → layer index.
 */
function assignLayers(ids: readonly string[], edges: readonly DagEdgeRef[]): Map<string, number> {
  const blockersOf = new Map<string, string[]>()
  for (const edge of edges) {
    const list = blockersOf.get(edge.target)
    if (list === undefined) blockersOf.set(edge.target, [edge.source])
    else list.push(edge.source)
  }
  const layers = new Map<string, number>()
  const visiting = new Set<string>()
  const depth = (id: string): number => {
    const memo = layers.get(id)
    if (memo !== undefined) return memo
    if (visiting.has(id)) return 0 // cycle guard: back-edges contribute depth 0
    visiting.add(id)
    let layer = 0
    for (const blocker of blockersOf.get(id) ?? []) {
      layer = Math.max(layer, depth(blocker) + 1)
    }
    visiting.delete(id)
    layers.set(id, layer)
    return layer
  }
  for (const id of ids) depth(id)
  return layers
}

/** Mean of the given indices, or `fallback` when the node has no cross-layer neighbour on that side. */
function barycenter(indices: readonly number[], fallback: number): number {
  if (indices.length === 0) return fallback
  let sum = 0
  for (const index of indices) sum += index
  return sum / indices.length
}

/** Reorder one layer by neighbour barycenters (ties + neighbourless nodes keep their current relative order, then key). */
function orderByBarycenter(
  layer: string[],
  neighbourIndex: (id: string) => readonly number[],
): string[] {
  const currentRank = new Map(layer.map((id, index) => [id, index] as const))
  return [...layer].sort((a, b) =>
    barycenter(neighbourIndex(a), currentRank.get(a) ?? 0)
      - barycenter(neighbourIndex(b), currentRank.get(b) ?? 0)
      || (a < b ? -1 : a > b ? 1 : 0))
}

/** Build the layer buckets in canonical key order (the sweep starting point). */
function bucketByLayer(ids: readonly string[], layers: ReadonlyMap<string, number>): string[][] {
  const buckets: string[][] = []
  for (const id of ids) {
    const layer = layers.get(id) ?? 0
    while (buckets.length <= layer) buckets.push([])
    buckets[layer]!.push(id)
  }
  return buckets
}

/**
 * The barycenter sweeps: down twice (order by blockers above), up twice
 * (order by blocked below). Mutates `order.layers` in place.
 */
function sweep(order: LayerOrder, edges: readonly DagEdgeRef[]): void {
  const blockersOf = new Map<string, string[]>()
  const blockedOf = new Map<string, string[]>()
  for (const edge of edges) {
    let blockers = blockersOf.get(edge.target)
    if (blockers === undefined) blockersOf.set(edge.target, blockers = [])
    blockers.push(edge.source)
    let blocked = blockedOf.get(edge.source)
    if (blocked === undefined) blockedOf.set(edge.source, blocked = [])
    blocked.push(edge.target)
  }
  const indexIn = (layer: readonly string[]): ReadonlyMap<string, number> =>
    new Map(layer.map((id, index) => [id, index] as const))

  for (let pass = 0; pass < 2; pass += 1) {
    // Downward: each layer orders by the mean index of its blockers above.
    for (let l = 1; l < order.layers.length; l += 1) {
      const above = indexIn(order.layers[l - 1]!)
      order.layers[l] = orderByBarycenter(order.layers[l]!, id =>
        (blockersOf.get(id) ?? []).map(blocker => above.get(blocker)).filter((i): i is number => i !== undefined))
    }
    // Upward: each layer orders by the mean index of the tasks it blocks below.
    for (let l = order.layers.length - 2; l >= 0; l -= 1) {
      const below = indexIn(order.layers[l + 1]!)
      order.layers[l] = orderByBarycenter(order.layers[l]!, id =>
        (blockedOf.get(id) ?? []).map(blocked => below.get(blocked)).filter((i): i is number => i !== undefined))
    }
  }
}

/**
 * Lay the DAG out top-down.
 * @param nodeIds - the visible node keys (order-insensitive; canonicalized here).
 * @param edges - the resolvable blocker→blocked relations among those keys.
 * @returns key → canvas position; every input key is present (unknown edge
 *   endpoints are ignored by construction — callers pass matching sets).
 */
export function layoutGraph(
  nodeIds: readonly string[],
  edges: readonly DagEdgeRef[],
): Map<string, DagPosition> {
  const ids = [...nodeIds].sort()
  const known = new Set(ids)
  const inGraph = edges.filter(edge => known.has(edge.source) && known.has(edge.target))
  const layers = assignLayers(ids, inGraph)
  const order: LayerOrder = { layers: bucketByLayer(ids, layers) }
  sweep(order, inGraph)

  const positions = new Map<string, DagPosition>()
  order.layers.forEach((layer, layerIndex) => {
    if (layer.length === 0) return
    const stride = NODE_CARD_WIDTH + NODE_GAP_X
    const rowWidth = layer.length * NODE_CARD_WIDTH + (layer.length - 1) * NODE_GAP_X
    const x0 = -rowWidth / 2
    layer.forEach((id, index) => {
      positions.set(id, { x: x0 + index * stride, y: layerIndex * LAYER_GAP_Y })
    })
  })
  for (const id of ids) {
    if (!positions.has(id)) positions.set(id, { x: 0, y: 0 })
  }
  return positions
}
