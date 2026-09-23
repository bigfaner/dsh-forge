/**
 * The UF2 视图 A 依赖树 (task 5.6, D4): the @xyflow/react canvas rendering
 * the task_snapshot dependency graph — blocker nodes above the tasks they
 * block (dag/layout.ts's layered layout), edges = the resolvable blocker
 * relations (dag/build-graph.ts), 悬空 blockers marked on the card, never
 * silently dropped.
 *
 * Mount context (3.2/D4): the shell already wraps the board area in
 * ReactFlowProvider — this view consumes that context and never mounts its
 * own provider. The engine enters ONLY through this plugin's bundle (Hard
 * Rule); nothing here reaches the shell or preload.
 *
 * Canvas behaviour (ui-design 视图 A + 全局规则): fit-view at first load ONLY
 * (the `fitView` prop fits once at init; structural updates relayout
 * incrementally and PRESERVE pan/zoom — a re-entry restores the stashed
 * viewport instead of re-fitting), pan/zoom defaults, the canvas carries
 * role=application + an aria-label, nodes are keyboard focusable and the
 * focus ring is visible (scoped stylesheet).
 *
 * Keyboard traversal (AC3): ↑/↓ move focus along dependency edges (nearest
 * card by x among the blockers / the blocked), ←/→ move within the layer
 * (layout 左→右 order), Tab follows the DOM order = layout reading order
 * (自上而下、同行左→右). Enter / Space / click navigate to the selection seam
 * (5.7's dock) — the board stays 人侧只读 (BIZ-task-ops-001): no write
 * affordance exists here. The key handling rides ONE delegated listener on
 * the view container (the lib keys node wrappers by `data-id`) — the node
 * objects stay the pure builder's output, untouched per render.
 *
 * Styling (Hard Rule 作用域样式, 防污染上游界面): the lib's own stylesheet is
 * NOT imported — a side CSS artifact would ride outside the closure-factory
 * bundle contract and inject unscoped global rules. Instead ONE scoped
 * `<style>` mounts with this view: every rule is namespaced under the
 * plugin-owned `.dsh-forge-dag` container class, so nothing can leak into
 * the upstream SPA, and unmounting the view removes the sheet. The plugin's
 * own card/chrome styling stays inline (the established discipline).
 */
import { useMemo, useRef, type KeyboardEvent } from 'react'
import { ReactFlow, type FitViewOptions, type KeyCode, type Viewport } from '@xyflow/react'
import type { TaskSummary } from '../../ipc-types'
import type { WorkbenchKey } from '../../locale/en'
import {
  buildTaskGraph, buildTraversalIndex, nextFocusKey,
  type DagDecorMount, type DagLaunchMount, type FocusDirection, type TaskDagNode, type TraversalIndex,
} from './dag/build-graph'
import type { DagPosition } from './dag/layout'
import { TaskCardNode } from './dag/NodeCard'

/** Inputs of {@link DepTreeView}. */
export interface DepTreeViewProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The post-filter, layout-ordered tasks (the page owns filtering — Hard Rule). */
  tasks: readonly TaskSummary[]
  /** key → dangling LOCAL blockers, computed against the FULL task set (悬空标记, not dropped). */
  danglingByTask: ReadonlyMap<string, readonly string[]>
  /** The task keys currently carrying the 回流 updating highlight. */
  updatingKeys: ReadonlySet<string>
  /**
   * The single-source selection key (5.8): the matching node carries the
   * ui-design 焦点任务 border — controlled from the selection store, never
   * node-local state.
   */
  selectedKey?: string | undefined
  /** The 5.7 selection seam — a node activation (click / Enter / Space) hands the task over. */
  onSelect?: ((task: TaskSummary) => void) | undefined
  /**
   * The stashed pan/zoom from this view's previous stint (the page holds it —
   * the Hard Rule's 切换不重置滚动位置, tree edition). Absent = first mount ⇒
   * fit-view; present = re-entry ⇒ the viewport restores instead of re-fitting.
   */
  initialViewport?: Viewport | undefined
  /** The settled-viewport stash hook (fires when a pan/zoom gesture ends). */
  onViewportSettled?: ((viewport: Viewport) => void) | undefined
  /**
   * The UF5 hover-trigger mount (5.11): present mounts the node-hover entry in
   * every node card's reserved 28×28 slot; absent keeps the slots empty.
   */
  launch?: DagLaunchMount | undefined
  /** taskKey → ACTIVE session link id (5.11 AC3 — the 会话运行中 badge). */
  activeLinks?: ReadonlyMap<string, string> | undefined
  /**
   * The UF1 decoration composers (task 3.9, 角标以 props 传入): the 编排态
   * 角标 + the selection-mode cluster, composed per node by the page and
   * carried through the node data. Absent renders the pure M2 card.
   */
  decor?: DagDecorMount | undefined
}

/**
 * The ONLY stylesheet the plugin ever mounts: ReactFlow's structural
 * internals (viewport transform-origin, edge svg positioning, node wrapper
 * absolute placement) — each rule scoped under `.dsh-forge-dag` (the
 * ReactFlow root's className, below), so the sheet is inert outside this
 * view's own subtree. Mount-scoped: it leaves the document with the view.
 * The node rule re-enables `pointer-events` (the viewport layer disables
 * them for the pan surface; the lib's own sheet does the same for nodes) —
 * without it the card's selection click AND the UF5 hover trigger are dead
 * in the real browser (events never reach the wrapper).
 */
const DAG_CANVAS_CSS = `
.dsh-forge-dag .react-flow__viewport { pointer-events: none; transform-origin: 0 0; }
.dsh-forge-dag .react-flow__edges { position: absolute; pointer-events: none; }
.dsh-forge-dag .react-flow__edges svg { left: 0; overflow: visible; position: absolute; pointer-events: none; top: 0; }
.dsh-forge-dag .react-flow__edge { pointer-events: none; }
.dsh-forge-dag .react-flow__edge-path { fill: none; }
.dsh-forge-dag .react-flow__node { cursor: pointer; pointer-events: all; position: absolute; user-select: none; }
.dsh-forge-dag .react-flow__node:focus, .dsh-forge-dag .react-flow__node:focus-visible { outline: none; }
.dsh-forge-dag .react-flow__node:focus-visible .dsh-forge-node-card { border: 1.5px solid var(--dsw-alias-link, rgb(65, 118, 230)); }
.dsh-forge-dag .react-flow__handle { background: transparent; border: none; height: 1px; min-height: 0; min-width: 0; opacity: 0; width: 1px; }
.dsh-forge-dag .react-flow__pane { touch-action: none; }
.dsh-forge-dag .dsh-forge-node-launch { opacity: 0; transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
.dsh-forge-dag .react-flow__node:hover .dsh-forge-node-launch,
.dsh-forge-dag .react-flow__node:focus-within .dsh-forge-node-launch { opacity: 1; }
`

/** The canvas container: fills the tab content area with a viewport-relative height. */
const wrapStyle = {
  borderRadius: '14px',
  height: 'calc(100vh - 260px)',
  minHeight: '420px',
  minWidth: '0',
} as const

/** First-load fit: whole graph in view, zoom capped so cards stay legible (fit-view 仅首载). */
const FIT_VIEW_OPTIONS: FitViewOptions = { padding: 0.12, maxZoom: 1 }

/** The custom-node registry: one card type, stable for the view's life. */
const NODE_TYPES = { taskCard: TaskCardNode }

/** Arrow key → traversal direction. */
const ARROW_DIRECTIONS: Readonly<Record<string, FocusDirection>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/** Keyboard interaction OFF (read-only board): an empty key set matches nothing. */
const NO_KEY: KeyCode = []

/**
 * The dependency-tree view. One memo builds the render graph (pure build +
 * layout + traversal index); attribute updates (status / 回流) change only
 * node data — ids, positions and edges stay identical, so React's keyed
 * reconciliation updates the card styles without rebuilding the graph.
 */
export function DepTreeView(props: DepTreeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onSelect = props.onSelect
  const onViewportSettled = props.onViewportSettled

  const graph = useMemo(() => {
    const built = buildTaskGraph(
      props.tasks, props.danglingByTask, props.updatingKeys, props.t, props.selectedKey,
      props.launch, props.activeLinks, props.decor,
    )
    const positions = new Map<string, DagPosition>(built.nodes.map(node => [node.id, node.position]))
    const traversal: TraversalIndex = buildTraversalIndex(positions, built.edges)
    const taskByKey = new Map(props.tasks.map(task => [task.key, task] as const))
    return { built, positions, traversal, taskByKey }
  }, [props.tasks, props.danglingByTask, props.updatingKeys, props.t, props.selectedKey, props.launch, props.activeLinks, props.decor])

  /** Move DOM focus onto a node wrapper (the lib keys wrappers by `data-id`). */
  const focusNode = (key: string): void => {
    containerRef.current?.querySelector<HTMLElement>(`[data-id="${key}"]`)?.focus()
  }

  /** A node's key contract: arrows traverse, Enter / Space navigate (AC3). */
  const handleNodeKeyDown = (event: KeyboardEvent<HTMLDivElement>, key: string): void => {
    const direction = ARROW_DIRECTIONS[event.key]
    if (direction !== undefined) {
      // Always swallow arrows over the canvas — focus moves or stays, never scrolls.
      event.preventDefault()
      const next = nextFocusKey(graph.traversal, graph.positions, key, direction)
      if (next !== undefined) focusNode(next)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const task = graph.taskByKey.get(key)
      if (task !== undefined) onSelect?.(task)
    }
  }

  /** The delegated canvas keydown: resolve the focused node wrapper, run its contract. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement | null
    // Interactive descendants own their keys: the UF5 launch trigger and the
    // confirm dialog's controls mount INSIDE the node card (DOM-descendants
    // of the wrapper), and the node contract must not swallow their Enter /
    // Space activation with preventDefault (SC2-1 确认默认焦点 — Enter alone
    // confirms the launch). Same for arrows over a text control.
    if (target?.closest('button, input, textarea, select, a[href], [contenteditable], [data-dsh-forge-dialog]') != null) return
    const wrapper = target?.closest<HTMLElement>('[data-id]') ?? null
    // Keys outside a node wrapper (the pane itself) are not this view's.
    if (wrapper === null) return
    // Only wrappers INSIDE this canvas count (the guard is free).
    const container = containerRef.current
    if (container === null || !container.contains(wrapper)) return
    handleNodeKeyDown(event, wrapper.getAttribute('data-id') ?? '')
  }

  return (
    <div
      ref={containerRef}
      data-dsh-forge-dep-tree=""
      style={wrapStyle}
      onKeyDown={onKeyDown}
    >
      {/* Scoped mount-lifetime stylesheet — see the file docblock (作用域样式 Hard Rule). */}
      <style data-dsh-forge-dag-style="">{DAG_CANVAS_CSS}</style>
      <ReactFlow
        className="dsh-forge-dag"
        nodes={graph.built.nodes}
        edges={graph.built.edges}
        nodeTypes={NODE_TYPES}
        // First mount fits the whole graph (fit-view 仅首载); a re-entry with a
        // stashed viewport restores it instead (switches never reset pan/zoom).
        fitView={props.initialViewport === undefined}
        fitViewOptions={FIT_VIEW_OPTIONS}
        {...(props.initialViewport === undefined ? {} : { defaultViewport: props.initialViewport })}
        minZoom={0.05}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        deleteKeyCode={NO_KEY}
        selectionKeyCode={NO_KEY}
        proOptions={{ hideAttribution: true }}
        aria-label={props.t('tasks.tree.canvasLabel')}
        onNodeClick={(_, node) => { onSelect?.((node as TaskDagNode).data.task) }}
        onMoveEnd={(_, viewport) => { onViewportSettled?.(viewport) }}
      />
    </div>
  )
}
