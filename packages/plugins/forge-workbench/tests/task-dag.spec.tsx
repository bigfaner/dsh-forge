// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The lib boundary double (see helpers/xyflow-standin.tsx): the REAL ReactFlow
// needs d3-zoom + ResizeObserver (absent in jsdom) and the library itself is
// not under test — the view's contracts are.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

import { lastCanvasProps, nodeMountCount, resetStandin } from './helpers/xyflow-standin'
import {
  buildTaskGraph, buildTraversalIndex, nextFocusKey,
} from '../src/client/views/tasks/dag/build-graph.ts'
import { LAYER_GAP_Y, layoutGraph } from '../src/client/views/tasks/dag/layout.ts'
import { computeDanglingByTask } from '../src/client/views/TaskBoardPage.tsx'
import { TaskBoardPage } from '../src/client/views/TaskBoardPage.tsx'
import type { TaskBoardPageProps } from '../src/client/views/TaskBoardPage.tsx'
import { DepTreeView } from '../src/client/views/tasks/DepTreeView.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import { createMockTaskBoardFace, MOCK_TASK_BOARD } from '../src/client/mocks/workbench.ts'
import type { TaskBoardData, TaskSummary } from '../src/client/ipc-types.ts'

// Task 5.6 — the UF2 视图 A BUILD units. AC map:
//   AC1 graph consistency (edge ↔ blockers traceability, 悬空标记 never
//      dropped) · AC2 fit-view first-load / read-only canvas flags / 500-node
//      budget · AC3 keyboard traversal along edges + Enter/Space selection ·
//   AC4 structural incrementality (mount-count diff — 整图重建 = defect) ·
//   AC5 node-card field parity with view C · AC6 this suite.
// Hard Rules: @xyflow only through the plugin bundle (nothing here touches
// shell/preload); pure-JS layout (no layout lib); scoped styles (every rule
// under .dsh-forge-dag); 人侧只读 (no write affordance).

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const TOTAL = MOCK_TASK_BOARD.tasks.length

/** The full-set dangling map the page computes (悬空 never manufactured by filters). */
const dangling = computeDanglingByTask(MOCK_TASK_BOARD.tasks)

/** Every edge of the mock board, as `source->target` pairs (AC1 oracle). */
const EXPECTED_EDGES = new Set([
  'dsh-forge-m2/5.5->dsh-forge-m2/5.6',
  'dsh-forge-m2/5.5->dsh-forge-m2/5.7',
  'dsh-forge-m2/5.5->dsh-forge-m2/5.15',
  'dsh-forge-m2/5.6->dsh-forge-m2/5.15',
  'dsh-forge-m2/5.3->dsh-forge-m2/5.4',
  'dsh-forge-m2/5.15->dsh-forge-m2/6.1',
  'dsh-forge-m1/4.3->dsh-forge-m1/4.4',
])

const graphOf = (tasks: readonly TaskSummary[] = MOCK_TASK_BOARD.tasks, updating: ReadonlySet<string> = new Set()) =>
  buildTaskGraph(tasks, computeDanglingByTask(tasks), updating, t.en)

/**
 * The traversal fixture — layered geometry (card w240, gap x36 ⇒ stride 276;
 * centered layers: n nodes span n·276−36 starting at −(n·276−36)/2):
 *
 *   layer 0:  A(-258)                 B(18)
 *   layer 1:  C(-396)    E(-120)    D(174)
 *   layer 2:  G(-396)    H(-120)    F(156)
 *
 * E joins the middle layer so some moves have a GENUINE nearest (H is nearer
 * C than D: Δ276 < Δ294) while equidistant pairs pin the leftmost-tie rule.
 */
function traversalFixtureTasks(): TaskSummary[] {
  const base = MOCK_TASK_BOARD.tasks[0]!
  const make = (localId: string, blockers: string[]): TaskSummary =>
    ({ ...base, key: `t/${localId}`, featureSlug: 't', blockers, branch: null, worktree: false, source: null })
  return [
    make('A', []), make('B', []),
    make('C', ['A']), make('E', ['A', 'B']), make('D', ['B']),
    make('G', ['C']), make('H', ['C', 'D']), make('F', ['D']),
  ]
}

beforeEach(() => { resetStandin() })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// AC1 — graph consistency: every edge traces to a blockers entry; dangling
// blockers are marked on the node, never silently dropped
// ---------------------------------------------------------------------------

describe('buildTaskGraph: edges ↔ blockers consistency (AC1)', () => {
  it('derives one edge per resolvable blocker pair, source = blocker, target = blocked', () => {
    const { edges } = graphOf()
    expect(new Set(edges.map(edge => `${edge.source}->${edge.target}`))).toEqual(EXPECTED_EDGES)
    expect(edges).toHaveLength(7)
    // The arrowhead rides the blocked end (ui-design: 箭头指向被阻塞方).
    for (const edge of edges) {
      expect(edge.markerEnd).toMatchObject({ type: 'arrowclosed' })
      expect(edge.style).toMatchObject({ strokeWidth: 1.5 })
    }
  })

  it('dedupes a blocker listed twice (one edge per pair, id-stable)', () => {
    const doubled: TaskSummary[] = [
      { ...MOCK_TASK_BOARD.tasks[0]!, key: 'd/2', featureSlug: 'd', blockers: ['1', '1'] },
      { ...MOCK_TASK_BOARD.tasks[0]!, key: 'd/1', featureSlug: 'd', blockers: [] },
    ]
    const { edges } = buildTaskGraph(doubled, computeDanglingByTask(doubled), new Set(), t.en)
    expect(edges.map(edge => edge.id)).toEqual(['e:d/1->d/2'])
  })

  it('every edge traces back to the target task\'s blockers field (Story1 AC1 逐边一致)', () => {
    const { edges } = graphOf()
    const byKey = new Map(MOCK_TASK_BOARD.tasks.map(task => [task.key, task]))
    for (const edge of edges) {
      const target = byKey.get(edge.target)
      expect(target, `edge target ${edge.target} must be a task`).toBeDefined()
      const localId = edge.source.slice(edge.source.lastIndexOf('/') + 1)
      expect(target!.blockers, `edge ${edge.id} must originate in ${edge.target}.blockers`).toContain(localId)
      expect(edge.id).toBe(`e:${edge.source}->${edge.target}`)
    }
  })

  it('nodes are the task set, keyed by the qualified board key, with card geometry', () => {
    const { nodes } = graphOf()
    expect(nodes.map(node => node.id).sort()).toEqual([...MOCK_TASK_BOARD.tasks.map(task => task.key)].sort())
    const sample = nodes.find(node => node.id === 'dsh-forge-m2/5.5')!
    expect(sample.type).toBe('taskCard')
    expect(sample.width).toBe(240)
    expect(sample.height).toBe(88)
    expect(sample.ariaLabel).toBe('dsh-forge-m2/5.5 · UF2 task board build: toolbar + status-grouped and list views')
    expect(sample.data.task.key).toBe('dsh-forge-m2/5.5')
  })

  it('a dangling blocker renders NO edge but rides the node as the 悬空标记 (not silently dropped)', () => {
    const { edges, nodes } = graphOf()
    // 5.9's blocker '5.8' resolves to nothing: no edge touches 5.9…
    expect(edges.some(edge => edge.target === 'dsh-forge-m2/5.9' || edge.source === 'dsh-forge-m2/5.9')).toBe(false)
    // …and the node carries the missing local key.
    const node = nodes.find(candidate => candidate.id === 'dsh-forge-m2/5.9')!
    expect(node.data.danglingBlockers).toEqual(['5.8'])
    // Resolvable-blocker nodes carry no dangling payload.
    expect(nodes.find(candidate => candidate.id === 'dsh-forge-m2/6.1')!.data.danglingBlockers).toEqual([])
  })

  it('a filter narrows edges to the visible set without manufacturing dangling marks', () => {
    // Feature filter: only dsh-forge-m1 tasks remain — the single intra-feature edge survives.
    const m1 = MOCK_TASK_BOARD.tasks.filter(task => task.featureSlug === 'dsh-forge-m1')
    const graph = buildTaskGraph(m1, dangling, new Set(), t.en)
    expect(graph.nodes).toHaveLength(3)
    expect(graph.edges.map(edge => `${edge.source}->${edge.target}`))
      .toEqual(['dsh-forge-m1/4.3->dsh-forge-m1/4.4'])
    // A status filter hiding a BLOCKER (5.5 is in_progress) drops the edges
    // into 5.6/5.7 but never marks those tasks dangling — dangling semantics
    // stay computed against the FULL set, so a filter can't manufacture them.
    const noInProgress = MOCK_TASK_BOARD.tasks.filter(task => task.status !== 'in_progress')
    const filtered = buildTaskGraph(noInProgress, dangling, new Set(), t.en)
    expect(filtered.edges.some(edge => edge.target === 'dsh-forge-m2/5.6')).toBe(false) // 5.5 hidden
    expect(filtered.nodes.find(node => node.id === 'dsh-forge-m2/5.6')!.data.danglingBlockers).toEqual([])
    // The visible 5.9 keeps its FULL-SET dangling mark under any filter.
    expect(filtered.nodes.find(node => node.id === 'dsh-forge-m2/5.9')!.data.danglingBlockers).toEqual(['5.8'])
  })
})

// ---------------------------------------------------------------------------
// Layout — layered, deterministic, top-down (AC2 + the recorded 布局定形)
// ---------------------------------------------------------------------------

describe('layoutGraph: layered top-down, deterministic (blocker 在上)', () => {
  it('places blockers strictly above the tasks they block', () => {
    const { nodes, edges } = graphOf()
    const byId = new Map(nodes.map(node => [node.id, node]))
    for (const edge of edges) {
      const source = byId.get(edge.source)!
      const target = byId.get(edge.target)!
      expect(target.position.y, `${edge.target} must sit below ${edge.source}`)
        .toBeGreaterThan(source.position.y)
    }
  })

  it('layer pitch and card geometry follow the layout constants', () => {
    const positions = layoutGraph(
      ['dsh-forge-m2/5.5', 'dsh-forge-m2/5.6'],
      [{ source: 'dsh-forge-m2/5.5', target: 'dsh-forge-m2/5.6' }],
    )
    expect(positions.get('dsh-forge-m2/5.5')!.y).toBe(0)
    expect(positions.get('dsh-forge-m2/5.6')!.y).toBe(LAYER_GAP_Y)
  })

  it('is deterministic: identical input ⇒ identical output; input order never leaks', () => {
    const first = layoutGraph(MOCK_TASK_BOARD.tasks.map(task => task.key), [...graphOf().edges])
    const second = layoutGraph([...MOCK_TASK_BOARD.tasks.map(task => task.key)].reverse(), [...graphOf().edges])
    expect([...first.entries()]).toEqual([...second.entries()])
    const graphA = graphOf()
    const graphB = graphOf()
    expect(graphB.nodes.map(node => [node.id, node.position] as const))
      .toEqual(graphA.nodes.map(node => [node.id, node.position] as const))
  })

  it('emits nodes in layout reading order (自上而下, 同行左→右 — the Tab order)', () => {
    const { nodes } = graphOf()
    const rows = new Map<number, string[]>()
    for (const node of nodes) {
      const row = rows.get(node.position.y) ?? []
      row.push(node.id)
      rows.set(node.position.y, row)
    }
    // DOM order: strictly non-decreasing y; within a row, strictly increasing x.
    for (let index = 1; index < nodes.length; index += 1) {
      const prev = nodes[index - 1]!
      const node = nodes[index]!
      if (node.position.y === prev.position.y) expect(node.position.x).toBeGreaterThan(prev.position.x)
      else expect(node.position.y).toBeGreaterThan(prev.position.y)
    }
    // The deepest chain ends at 6.1, three layers below its root 5.5.
    const byId = new Map(nodes.map(node => [node.id, node]))
    expect(byId.get('dsh-forge-m2/6.1')!.position.y / LAYER_GAP_Y).toBe(3)
  })

  it('keeps a cyclic blocker graph finite and deterministic (defensive guard)', () => {
    const cyc: TaskSummary[] = [
      { ...MOCK_TASK_BOARD.tasks[0]!, key: 'c/1', featureSlug: 'c', blockers: ['2'] },
      { ...MOCK_TASK_BOARD.tasks[0]!, key: 'c/2', featureSlug: 'c', blockers: ['1'] },
    ]
    const first = layoutGraph(cyc.map(task => task.key), [
      { source: 'c/1', target: 'c/2' }, { source: 'c/2', target: 'c/1' },
    ])
    const second = layoutGraph(cyc.map(task => task.key), [
      { source: 'c/1', target: 'c/2' }, { source: 'c/2', target: 'c/1' },
    ])
    expect([...first.entries()]).toEqual([...second.entries()])
    expect(first.size).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// AC2 — the 500-node budget (SC1 分摊)
// ---------------------------------------------------------------------------

describe('500-node budget: build + layout stays fast (AC2)', () => {
  it('handles a 500-task board (50 chains × 10) under the recorded threshold', () => {
    const tasks: TaskSummary[] = []
    for (let chain = 0; chain < 50; chain += 1) {
      const slug = `perf-${chain}`
      for (let step = 1; step <= 10; step += 1) {
        tasks.push({
          ...MOCK_TASK_BOARD.tasks[0]!,
          key: `${slug}/${step}`,
          featureSlug: slug,
          blockers: step > 1 ? [String(step - 1)] : [],
        })
      }
    }
    expect(tasks).toHaveLength(500)
    const startedAt = performance.now()
    const graph = buildTaskGraph(tasks, computeDanglingByTask(tasks), new Set(), t.en)
    const layoutMs = performance.now() - startedAt
    expect(graph.nodes).toHaveLength(500)
    expect(graph.edges).toHaveLength(450)
    // Threshold recorded per the 5.2 perf-budget precedent (generous for CI
    // jitter; local runs land in the tens of milliseconds).
    expect(layoutMs).toBeLessThan(2000)
  })
})

// ---------------------------------------------------------------------------
// AC3 — keyboard traversal (pure index + the DOM path)
// ---------------------------------------------------------------------------

describe('keyboard traversal: 方向键沿依赖边移动 (AC3)', () => {
  /** The fixture laid out once; assertions read the pure index. */
  function fixture() {
    const tasks = traversalFixtureTasks()
    const graph = buildTaskGraph(tasks, computeDanglingByTask(tasks), new Set(), t.en)
    const positions = new Map(graph.nodes.map(node => [node.id, node.position] as const))
    const index = buildTraversalIndex(positions, graph.edges)
    return { graph, positions, index }
  }

  it('up moves to the horizontally-nearest blocker; down to the nearest blocked task', () => {
    const { positions, index } = fixture()
    // H(-120) blocks on C(-396, Δ276) and D(174, Δ294) → C wins genuinely.
    expect(nextFocusKey(index, positions, 't/H', 'up')).toBe('t/C')
    // A(-258) blocks C(-396, Δ138) and E(-120, Δ138) — a tie → leftmost C.
    expect(nextFocusKey(index, positions, 't/A', 'down')).toBe('t/C')
    // B(18) blocks E(-120, Δ138) and D(174, Δ156) → E wins genuinely.
    expect(nextFocusKey(index, positions, 't/B', 'down')).toBe('t/E')
    // Unique relations resolve directly; E(-120) sits exactly between its
    // parents A(-258) and B(18) (both Δ138) → leftmost A.
    expect(nextFocusKey(index, positions, 't/F', 'up')).toBe('t/D')
    expect(nextFocusKey(index, positions, 't/E', 'up')).toBe('t/A')
  })

  it('left/right move within the layer in layout order; row boundaries resolve undefined', () => {
    const { positions, index } = fixture()
    expect(nextFocusKey(index, positions, 't/A', 'right')).toBe('t/B')
    expect(nextFocusKey(index, positions, 't/B', 'left')).toBe('t/A')
    expect(nextFocusKey(index, positions, 't/A', 'left')).toBeUndefined()
    expect(nextFocusKey(index, positions, 't/B', 'right')).toBeUndefined()
    // The bottom row walks G ↔ H ↔ F in x order.
    expect(nextFocusKey(index, positions, 't/H', 'left')).toBe('t/G')
    expect(nextFocusKey(index, positions, 't/H', 'right')).toBe('t/F')
    expect(nextFocusKey(index, positions, 't/G', 'left')).toBeUndefined()
    expect(nextFocusKey(index, positions, 't/F', 'right')).toBeUndefined()
  })

  it('an unknown key resolves undefined (defensive)', () => {
    const { positions, index } = fixture()
    expect(nextFocusKey(index, positions, 't/ZZZ', 'up')).toBeUndefined()
  })

  it('the traversal index ignores edges whose endpoints left the layout (stale-edge guard)', () => {
    const tasks = traversalFixtureTasks()
    const graph = buildTaskGraph(tasks, computeDanglingByTask(tasks), new Set(), t.en)
    const positions = new Map(graph.nodes.map(node => [node.id, node.position] as const))
    const stale = buildTraversalIndex(positions, [
      ...graph.edges,
      { source: 't/D', target: 't/GONE' },
      { source: 't/GONE', target: 't/G' },
    ])
    // Edges naming an unpositioned endpoint contribute nothing: D keeps only
    // its real blocked neighbours, G gains no phantom blocker.
    expect(stale.get('t/D')!.blocked).toEqual(['t/H', 't/F'])
    expect(stale.get('t/G')!.blockers).toEqual(['t/C'])
    // An empty dangling map is a valid input — every node's list is [].
    const bare = buildTaskGraph(tasks, new Map(), new Set(), t.en)
    expect(bare.nodes.every(node => node.data.danglingBlockers.length === 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The component: canvas contract, cards, DOM traversal, incrementality
// ---------------------------------------------------------------------------

/** Render the page and settle into the populated board (default view = tree). */
async function renderBoard(props: Partial<TaskBoardPageProps> = {}) {
  const face = createMockTaskBoardFace()
  render(<TaskBoardPage t={t.en} face={face} {...props} />)
  await waitFor(() => {
    expect(document.querySelector('[data-dsh-forge-board-panel="tree"]')).not.toBeNull()
  })
  return face
}

/** Render the view directly (incrementality rerenders drive this helper). */
function renderView(tasks: readonly TaskSummary[], props: Partial<Parameters<typeof DepTreeView>[0]> = {}) {
  const view = render(
    <DepTreeView
      t={t.en}
      tasks={tasks}
      danglingByTask={computeDanglingByTask(tasks)}
      updatingKeys={new Set()}
      {...props}
    />,
  )
  return view
}

describe('DepTreeView: the canvas contract (AC2 + aria)', () => {
  it('is the board\'s DEFAULT view: the tree tab selected, its panel mounted', async () => {
    await renderBoard()
    const treeTab = document.querySelector('[data-dsh-forge-board-view="tree"]') as HTMLElement
    expect(treeTab.getAttribute('aria-selected')).toBe('true')
    expect(treeTab.getAttribute('aria-disabled')).toBeNull()
    const panel = document.querySelector('[data-dsh-forge-board-panel="tree"]') as HTMLElement
    expect(panel.getAttribute('role')).toBe('tabpanel')
    expect(panel.getAttribute('aria-labelledby')).toBe('dsh-forge-board-view-tab-tree')
    expect(document.querySelector('[data-dsh-forge-dep-tree]')).not.toBeNull()
  })

  it('labels the canvas and every node (aria per ui-design)', async () => {
    await renderBoard()
    const canvas = document.querySelector('[data-xyflow-standin]') as HTMLElement
    expect(canvas.getAttribute('role')).toBe('application')
    expect(canvas.getAttribute('aria-label')).toBe(en['tasks.tree.canvasLabel'])
    const node = document.querySelector('[data-id="dsh-forge-m2/5.5"]') as HTMLElement
    expect(node.getAttribute('tabIndex')).toBe('0')
    expect(node.getAttribute('aria-label')).toBe('dsh-forge-m2/5.5 · UF2 task board build: toolbar + status-grouped and list views')
  })

  it('fit-views the FIRST load only; a re-entry restores the stashed viewport (fit-view 仅首载)', async () => {
    await renderBoard()
    expect((document.querySelector('[data-xyflow-standin]') as HTMLElement).getAttribute('data-standin-fit-view'))
      .toBe('true')
    // A settled pan/zoom stashes through onMoveEnd.
    act(() => { lastCanvasProps.current.onMoveEnd?.(null, { x: 40, y: -12, zoom: 0.75 }) })
    // Switch away and back — the re-entry restores instead of re-fitting.
    fireEvent.click(document.querySelector('[data-dsh-forge-board-view="list"]') as HTMLElement)
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-task-list]')).not.toBeNull() })
    fireEvent.click(document.querySelector('[data-dsh-forge-board-view="tree"]') as HTMLElement)
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-dep-tree]')).not.toBeNull() })
    const canvas = document.querySelector('[data-xyflow-standin]') as HTMLElement
    expect(canvas.getAttribute('data-standin-fit-view')).toBe('false')
    expect(JSON.parse(canvas.getAttribute('data-standin-viewport')!)).toEqual({ x: 40, y: -12, zoom: 0.75 })
  })

  it('runs the canvas read-only: no drag, no connect, no selection, no delete key', async () => {
    await renderBoard()
    expect(lastCanvasProps.current.nodesDraggable).toBe(false)
    expect(lastCanvasProps.current.nodesConnectable).toBe(false)
    expect(lastCanvasProps.current.elementsSelectable).toBe(false)
    expect(lastCanvasProps.current.zoomOnDoubleClick).toBe(false)
    expect(lastCanvasProps.current.minZoom).toBeLessThanOrEqual(0.05)
    expect(lastCanvasProps.current.maxZoom).toBeGreaterThanOrEqual(1.5)
    expect(lastCanvasProps.current.proOptions).toEqual({ hideAttribution: true })
  })

  it('renders one wrapper per task and one placeholder per edge (15 nodes / 7 edges)', async () => {
    await renderBoard()
    expect(document.querySelectorAll('[data-dsh-forge-dep-tree] [data-id]')).toHaveLength(TOTAL)
    const edges = Array.from(document.querySelectorAll('[data-xyflow-standin-edge]'))
    expect(edges.map(edge => `${edge.getAttribute('data-source')}->${edge.getAttribute('data-target')}`).sort())
      .toEqual([...EXPECTED_EDGES].sort())
  })
})

describe('DepTreeView: node cards (AC5 — 字段与视图 C 行一致)', () => {
  it('renders title / key / short status / dot / branch / worktree / 来源 — the C-row field set', async () => {
    await renderBoard()
    const card = document.querySelector('[data-dsh-forge-node-card="dsh-forge-m2/5.5"]') as HTMLElement
    expect(card.textContent).toContain('UF2 task board build')
    expect(card.textContent).toContain('dsh-forge-m2/5.5')
    expect(card.textContent).toContain(en['tasks.status.short.in_progress'])
    expect(card.textContent).toContain('dsh-forge-m2') // branch
    expect(card.querySelector('[data-dsh-forge-badge="worktree"]')?.textContent).toBe(en['tasks.badge.worktree'])
    expect(card.querySelector('[data-dsh-forge-badge="source:session"]')?.textContent).toBe(en['tasks.source.session'])
    expect(card.querySelector('[data-mock-state-dot]')?.getAttribute('data-mock-state-dot')).toBe('ongoing')
    // A bare card (no branch/worktree/source) renders none of the optional bits.
    const bare = document.querySelector('[data-dsh-forge-node-card="dsh-forge-m2/5.6"]') as HTMLElement
    expect(bare.querySelector('[data-dsh-forge-badge^="source:"]')).toBeNull()
    expect(bare.querySelector('[data-dsh-forge-badge="worktree"]')).toBeNull()
  })

  it('marks the dangling blocker on the card (悬空标记, with the missing key in the title)', async () => {
    await renderBoard()
    const card = document.querySelector('[data-dsh-forge-node-card="dsh-forge-m2/5.9"]') as HTMLElement
    const badge = card.querySelector('[data-dsh-forge-badge="dangling"]') as HTMLElement
    expect(badge.textContent).toBe(en['tasks.dangling'])
    expect(badge.getAttribute('title')).toContain('5.8')
    expect(
      (document.querySelector('[data-dsh-forge-node-card="dsh-forge-m2/6.1"]') as HTMLElement)
        .querySelector('[data-dsh-forge-badge="dangling"]'),
    ).toBeNull()
  })

  it('lights the 回流 updating highlight on the addressed card only', async () => {
    const face = createMockTaskBoardFace()
    render(<TaskBoardPage t={t.en} face={face} />)
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-dep-tree]')).not.toBeNull() })
    act(() => {
      face.emit([
        { type: 'task_updated', projectId: 'p1', taskKey: 'dsh-forge-m2/5.6', source: 'session', changeKind: 'attribute' },
      ])
    })
    expect((document.querySelector('[data-dsh-forge-node-card="dsh-forge-m2/5.6"]') as HTMLElement)
      .getAttribute('data-dsh-forge-updating')).toBe('')
    expect((document.querySelector('[data-dsh-forge-node-card="dsh-forge-m2/5.5"]') as HTMLElement)
      .getAttribute('data-dsh-forge-updating')).toBeNull()
  })

  it('renders through the zh seat as balanced (canvas label + card status)', () => {
    renderView(MOCK_TASK_BOARD.tasks, { t: t.zh })
    expect((document.querySelector('[data-xyflow-standin]') as HTMLElement).getAttribute('aria-label'))
      .toBe(zh['tasks.tree.canvasLabel'])
    expect((document.querySelector('[data-dsh-forge-node-card="dsh-forge-m2/3.9"]') as HTMLElement).textContent)
      .toContain(zh['tasks.status.short.suspended'])
  })
})

describe('DepTreeView: keyboard + selection seam (AC3)', () => {
  it('arrow keys move DOM focus along dependency edges; Enter / Space / click select (the 5.7 seam)', async () => {
    const onSelect = vi.fn()
    await renderBoard({ onSelect })
    const start = document.querySelector('[data-id="dsh-forge-m2/5.5"]') as HTMLElement
    start.focus()
    expect(document.activeElement).toBe(start)
    // Down: into the blocked set {5.6, 5.7, 5.15} — whichever is nearest, it
    // must be one of them and must BE the new focus (焦点节点即选中态).
    fireEvent.keyDown(start, { key: 'ArrowDown' })
    const moved = document.activeElement as HTMLElement
    expect(['dsh-forge-m2/5.6', 'dsh-forge-m2/5.7', 'dsh-forge-m2/5.15']).toContain(moved.getAttribute('data-id'))
    expect(moved).not.toBe(start)
    // Enter on the moved node opens the seam for THAT task.
    fireEvent.keyDown(moved, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect((onSelect.mock.calls[0]![0] as TaskSummary).key).toBe(moved.getAttribute('data-id'))
    // Space and the wrapper click do the same.
    fireEvent.keyDown(moved, { key: ' ' })
    fireEvent.click(moved)
    expect(onSelect).toHaveBeenCalledTimes(3)
  })

  it('ignores keys that land outside a node (the pane) and fall-through keys on nodes', async () => {
    const onSelect = vi.fn()
    await renderBoard({ onSelect })
    const canvas = document.querySelector('[data-xyflow-standin]') as HTMLElement
    const node = document.querySelector('[data-id="dsh-forge-m2/5.5"]') as HTMLElement
    node.focus()
    // A key the contract does not own changes nothing and selects nothing.
    fireEvent.keyDown(node, { key: 'x', ctrlKey: true })
    expect(document.activeElement).toBe(node)
    expect(onSelect).not.toHaveBeenCalled()
    // Keys landing on the pane itself (no node wrapper) are not node business.
    fireEvent.keyDown(canvas, { key: 'ArrowDown' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('interactive descendants own their keys — Enter inside a button is never swallowed (SC2-1 确认默认焦点)', async () => {
    // The UF5 confirm dialog mounts INSIDE the node card (a DOM-descendant of
    // the wrapper): its confirm button's native Enter activation must survive
    // the canvas's delegated node contract (no preventDefault, no re-select).
    const onSelect = vi.fn()
    await renderBoard({ onSelect })
    const node = document.querySelector('[data-id="dsh-forge-m2/5.5"]') as HTMLElement
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('data-dsh-forge-launch-confirm-ok', '')
    node.appendChild(button)
    button.focus()
    expect(document.activeElement).toBe(button)
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    button.dispatchEvent(event)
    expect(event.defaultPrevented, 'the delegated handler must not preventDefault').toBe(false)
    expect(onSelect, 'the node contract must not treat the dialog key as node navigation').not.toHaveBeenCalled()
  })

  it('keeps focus put at a traversal boundary (no scroll-away, no crash)', async () => {
    await renderBoard()
    const root = document.querySelector('[data-id="dsh-forge-m2/3.9"]') as HTMLElement // no blockers
    root.focus()
    fireEvent.keyDown(root, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(root)
    // Lateral boundary: the TOP row's leftmost wrapper (x/y parsed from the
    // standin's translate transform) has nothing to its left.
    const wrappers = Array.from(document.querySelectorAll<HTMLElement>('[data-dsh-forge-dep-tree] [data-id]'))
    const coordinates = wrappers.map((element) => {
      const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(element.style.transform)
      return { element, x: Number(match?.[1] ?? 0), y: Number(match?.[2] ?? 0) }
    })
    const topY = Math.min(...coordinates.map(point => point.y))
    const leftmost = coordinates.filter(point => point.y === topY)
      .reduce((left, point) => (point.x < left.x ? point : left)).element
    leftmost.focus()
    fireEvent.keyDown(leftmost, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(leftmost)
  })
})

describe('DepTreeView: structural incrementality (AC4 — 整图重建 = 缺陷)', () => {
  /** The board with one task's status flipped (an attribute-level change). */
  const withStatus = (tasks: readonly TaskSummary[], key: string, status: TaskSummary['status']): TaskSummary[] =>
    tasks.map(task => (task.key === key ? { ...task, status } : task))

  it('an attribute change updates node DATA only — same ids, positions, edges; no remount', () => {
    const tasks = MOCK_TASK_BOARD.tasks
    const view = renderView(tasks)
    const before = lastCanvasProps.current
    const beforeNode = document.querySelector('[data-dsh-forge-node-card="dsh-forge-m2/5.6"]') as HTMLElement

    view.rerender(
      <DepTreeView
        t={t.en}
        tasks={withStatus(tasks, 'dsh-forge-m2/5.6', 'in_progress')}
        danglingByTask={computeDanglingByTask(tasks)}
        updatingKeys={new Set()}
      />,
    )
    const after = lastCanvasProps.current
    expect(after.nodes!.map(node => [node.id, node.position.x, node.position.y])).toEqual(
      before.nodes!.map(node => [node.id, node.position.x, node.position.y]),
    )
    expect(after.edges).toEqual(before.edges)
    // Same DOM node — the card was updated in place, not rebuilt.
    expect(document.querySelector('[data-dsh-forge-node-card="dsh-forge-m2/5.6"]')).toBe(beforeNode)
    // Mount counts unchanged: no wrapper remounted.
    expect([...nodeMountCount.current.values()].every(count => count === 1)).toBe(true)
    // The changed card shows the new status.
    expect((document.querySelector('[data-dsh-forge-node-card="dsh-forge-m2/5.6"]') as HTMLElement).textContent)
      .toContain(en['tasks.status.short.in_progress'])
  })

  it('a task add/remove touches only its own node and edges (增量重排, no rebuild)', () => {
    const tasks = MOCK_TASK_BOARD.tasks
    const view = renderView(tasks)
    const idsBefore = new Set(lastCanvasProps.current.nodes!.map(node => node.id))

    // Add an isolated task (no blockers, blocked by nothing): its node joins,
    // the edge set is untouched, and NO existing wrapper remounts (the
    // centered relayout may shift x — that is 增量重排, not a rebuild).
    const added: TaskSummary = {
      ...tasks[0]!, key: 'dsh-forge-m2/9.9', featureSlug: 'dsh-forge-m2', blockers: [], title: 'Isolated newcomer',
    }
    view.rerender(
      <DepTreeView t={t.en} tasks={[...tasks, added]} danglingByTask={computeDanglingByTask([...tasks, added])} updatingKeys={new Set()} />,
    )
    expect(nodeMountCount.current.get('dsh-forge-m2/9.9')).toBe(1)
    expect([...nodeMountCount.current.values()].every(count => count === 1)).toBe(true)
    expect(lastCanvasProps.current.edges).toHaveLength(7)
    expect(new Set(lastCanvasProps.current.nodes!.map(node => node.id))).toEqual(
      new Set([...idsBefore, 'dsh-forge-m2/9.9']),
    )

    // Remove an isolated task — gone with no edges; the retained ids keep
    // their single-mount identity.
    view.rerender(
      <DepTreeView t={t.en} tasks={tasks.filter(task => task.key !== 'dsh-forge-m2/3.11')} danglingByTask={dangling} updatingKeys={new Set()} />,
    )
    expect(document.querySelector('[data-dsh-forge-node-card="dsh-forge-m2/3.11"]')).toBeNull()
    expect(nodeMountCount.current.get('dsh-forge-m2/3.11')).toBe(1)
    expect(nodeMountCount.current.get('dsh-forge-m2/5.5')).toBe(1)
    expect(lastCanvasProps.current.edges).toHaveLength(7)
    expect(new Set(lastCanvasProps.current.nodes!.map(node => node.id)))
      .toEqual(new Set([...idsBefore].filter(id => id !== 'dsh-forge-m2/3.11')))
  })

  it('a blocker wiring change adds exactly the new edges (structural 增量重排)', () => {
    const tasks = MOCK_TASK_BOARD.tasks
    const view = renderView(tasks)
    // Wire 9.9's dangling blocker INTO existence: adding 5.8 resolves 5.9's edge.
    const with58: TaskSummary[] = [
      ...tasks,
      { ...tasks[0]!, key: 'dsh-forge-m2/5.8', featureSlug: 'dsh-forge-m2', blockers: [], title: 'UF3 detail panel build' },
    ]
    const danglingWith58 = computeDanglingByTask(with58)
    view.rerender(
      <DepTreeView t={t.en} tasks={with58} danglingByTask={danglingWith58} updatingKeys={new Set()} />,
    )
    expect(lastCanvasProps.current.edges).toHaveLength(8)
    expect(
      lastCanvasProps.current.edges!.some(edge => edge.id === 'e:dsh-forge-m2/5.8->dsh-forge-m2/5.9'),
    ).toBe(true)
    // The former dangling mark cleared on 5.9's card.
    expect((document.querySelector('[data-dsh-forge-node-card="dsh-forge-m2/5.9"]') as HTMLElement)
      .querySelector('[data-dsh-forge-badge="dangling"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Filters + scoped styles + read-only discipline
// ---------------------------------------------------------------------------

describe('DepTreeView: filters and discipline', () => {
  it('honors the page filters (search narrows nodes AND edges)', async () => {
    await renderBoard()
    fireEvent.change(document.querySelector('[data-dsh-forge-tasks-search]') as HTMLElement, {
      target: { value: 'signing' },
    })
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-dep-tree] [data-id]')).toHaveLength(1)
    })
    expect(document.querySelectorAll('[data-xyflow-standin-edge]')).toHaveLength(0)
    // The feature filter keeps the intra-feature subgraph intact.
    fireEvent.change(document.querySelector('[data-dsh-forge-tasks-search]') as HTMLElement, {
      target: { value: '' },
    })
    fireEvent.click(document.querySelector('[data-dsh-forge-menu-trigger="feature"]') as HTMLElement)
    fireEvent.click(Array.from(document.querySelectorAll('[role="menuitemradio"]'))
      .find(item => item.textContent?.includes('dsh-forge-m1')) as HTMLElement)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dsh-forge-dep-tree] [data-id]')).toHaveLength(3)
    })
    expect(document.querySelectorAll('[data-xyflow-standin-edge]')).toHaveLength(1)
  })

  it('mounts ONE stylesheet, every rule scoped under .dsh-forge-dag; unmount removes it', async () => {
    const face = createMockTaskBoardFace()
    const page = render(<TaskBoardPage t={t.en} face={face} />)
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-dep-tree]')).not.toBeNull() })
    const style = document.querySelector('style[data-dsh-forge-dag-style]') as HTMLStyleElement
    expect(style).not.toBeNull()
    for (const line of style.textContent!.split('\n')) {
      const rule = line.trim()
      if (rule === '' || rule.startsWith('/*')) continue
      expect(rule.startsWith('.dsh-forge-dag'), `unscoped rule leaked: ${rule}`).toBe(true)
    }
    page.unmount()
    expect(document.querySelector('style[data-dsh-forge-dag-style]')).toBeNull()
    // The rail/overview zero-stylesheet discipline holds wherever the DAG is
    // not mounted — the sheet's lifetime IS the view's.
  })

  it('carries no write affordance: the canvas holds no button/input/select/textarea', async () => {
    await renderBoard()
    const canvas = document.querySelector('[data-dsh-forge-dep-tree]') as HTMLElement
    expect(canvas.querySelectorAll('button, input, select, textarea')).toHaveLength(0)
  })
})
