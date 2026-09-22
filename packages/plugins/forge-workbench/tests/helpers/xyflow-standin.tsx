/**
 * The @xyflow/react jsdom stand-in (task 5.6) — NOT a spec file (no
 * `.spec.` in the name, so the runner never collects it). Specs mock the
 * library at the lib boundary with it:
 *
 *   vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))
 *
 * The REAL ReactFlow needs d3-zoom measurements and an unguarded
 * ResizeObserver — neither exists in jsdom, and testing the library is not
 * this plugin's job anyway (the StateDot stub precedent: the real engine
 * rides the e2e lane). The stand-in renders just enough surface for the
 * VIEW's contracts:
 *
 *   - nodes as focusable wrapper divs keyed by the lib's `data-id` contract,
 *     applying the node's `domAttributes` (the keydown seam the traversal
 *     rides) and mounting the custom node component through `nodeTypes`;
 *   - edges as observable placeholder elements;
 *   - `lastCanvasProps` records the latest canvas props (fitView /
 *     defaultViewport / read-only flags / nodes / edges) for assertions;
 *   - `nodeMountCount` counts per-id wrapper MOUNTS — the structural-
 *     incrementality assertions diff against it (整图重建 = every count
 *     doubling).
 */
import { useEffect } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react'

/** The lib-boundary node shape the stand-in consumes (structural subset of xyflow's Node). */
interface StandinNode {
  id: string
  type?: string | undefined
  position: { x: number; y: number }
  data?: unknown
  ariaLabel?: string | undefined
  width?: number | undefined
  height?: number | undefined
  domAttributes?: { onKeyDown?: ((event: ReactKeyboardEvent<HTMLDivElement>) => void) | undefined } | undefined
}

/** The lib-boundary edge shape (structural subset of xyflow's Edge). */
interface StandinEdge {
  id: string
  source: string
  target: string
}

/** A custom-node component as the standin mounts it (through `nodeTypes`). */
type StandinNodeComponent = (props: { id: string; data: unknown }) => ReactNode

/** The canvas-props subset the stand-in reads + the specs assert over. */
interface StandinCanvasProps {
  nodes?: readonly StandinNode[] | undefined
  edges?: readonly StandinEdge[] | undefined
  nodeTypes?: Readonly<Record<string, StandinNodeComponent>> | undefined
  className?: string | undefined
  fitView?: boolean | undefined
  defaultViewport?: unknown
  minZoom?: number | undefined
  maxZoom?: number | undefined
  nodesDraggable?: boolean | undefined
  nodesConnectable?: boolean | undefined
  elementsSelectable?: boolean | undefined
  zoomOnDoubleClick?: boolean | undefined
  proOptions?: { hideAttribution?: boolean } | undefined
  'aria-label'?: string | undefined
  onNodeClick?: ((event: ReactMouseEvent<HTMLDivElement>, node: StandinNode) => void) | undefined
  onMoveEnd?: ((event: unknown, viewport: { x: number; y: number; zoom: number }) => void) | undefined
}

/** Latest canvas props (per-test reset; the specs read it after render). */
export const lastCanvasProps: { current: StandinCanvasProps } = { current: {} }

/** Per-node-id wrapper mount counts (incrementality assertions). */
export const nodeMountCount: { current: Map<string, number> } = { current: new Map() }

/** Reset the observation channels (call in beforeEach). */
export function resetStandin(): void {
  lastCanvasProps.current = {}
  nodeMountCount.current = new Map()
}

/** One node wrapper: counts its MOUNTS (effect-scoped, not render-scoped) and renders the card. */
function StandinNodeWrapper(props: {
  node: StandinNode
  Card?: StandinNodeComponent | undefined
  onNodeClick?: ((event: ReactMouseEvent<HTMLDivElement>, node: StandinNode) => void) | undefined
}) {
  const { node } = props
  useEffect(() => {
    nodeMountCount.current.set(node.id, (nodeMountCount.current.get(node.id) ?? 0) + 1)
  }, [node.id])
  return (
    <div
      data-id={node.id}
      data-testid={`rf__node-${node.id}`}
      tabIndex={0}
      role="group"
      aria-label={node.ariaLabel}
      style={{
        position: 'absolute',
        transform: `translate(${node.position.x}px, ${node.position.y}px)`,
        ...(node.width !== undefined ? { width: `${node.width}px` } : {}),
        ...(node.height !== undefined ? { height: `${node.height}px` } : {}),
      }}
      onClick={(event: ReactMouseEvent<HTMLDivElement>) => { props.onNodeClick?.(event, node) }}
      {...(node.domAttributes ?? {})}
    >
      {props.Card !== undefined ? <props.Card id={node.id} data={node.data} /> : null}
    </div>
  )
}

/** The canvas: node wrappers (data-id + domAttributes + custom node) + edge placeholders. */
export function ReactFlow(props: StandinCanvasProps) {
  lastCanvasProps.current = props
  const nodes = props.nodes ?? []
  const edges = props.edges ?? []
  return (
    <div
      data-xyflow-standin=""
      role="application"
      aria-label={props['aria-label']}
      data-standin-fit-view={props.fitView === undefined ? 'unset' : props.fitView ? 'true' : 'false'}
      data-standin-viewport={props.defaultViewport === undefined ? 'unset' : JSON.stringify(props.defaultViewport)}
    >
      {nodes.map(node => (
        <StandinNodeWrapper
          key={node.id}
          node={node}
          Card={props.nodeTypes?.[node.type ?? '']}
          onNodeClick={props.onNodeClick}
        />
      ))}
      {edges.map(edge => (
        <div
          key={edge.id}
          data-xyflow-standin-edge={edge.id}
          data-source={edge.source}
          data-target={edge.target}
        />
      ))}
    </div>
  )
}

/** The provider pass-through (the shell's context mount — a no-op here). */
export function ReactFlowProvider(props: { children?: ReactNode | undefined }) {
  return <>{props.children}</>
}

/** The handle pass-through (an invisible anchor in the real lib; nothing here). */
export function Handle(): null {
  return null
}

/** The Position enum the node card anchors read (value parity with the lib). */
export const Position = {
  Left: 'left',
  Top: 'top',
  Right: 'right',
  Bottom: 'bottom',
} as const
