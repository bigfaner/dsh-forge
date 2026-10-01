/**
 * The 依赖图 tab's DAG mode (M4 task 2.4, layout §4.6 + 裁决 #18-⑤): the M2
 * tasks.html pane form — SVG 箭头连线 + 绝对定位节点卡, blocker 在左 (the pane
 * twin of the board's top-down ReactFlow view A; the wireframe pins 列宽
 * 200/间距 24 so a three-level chain fits the 720px right column, narrower
 * widths scroll horizontally instead).
 *
 * Edge semantics (AC4 依赖边由任务 deps 结构化解析): the board DTO's
 * `blockers` ARE the structured parse of the deps string (task 2.5 dialect —
 * same-feature LOCAL keys); {@link resolveBlockerKey} re-qualifies them onto
 * the board address (the views/tasks/dag precedent reused, not re-derived).
 * A blocker addressing no task in the feature draws no edge (悬空, the
 * computeDanglingByTask discipline — a view never manufactures edges).
 *
 * Layout (PURE, exported for the unit matrix): longest-path DEPTH columns —
 * roots at column 0, every task one column right of its deepest blocker —
 * with a cycle guard (a back-edge contributes depth 0, keeping the walk
 * finite and deterministic); nodes stack top-down inside a column.
 */
import { useId } from 'react'
import type { ReactNode } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskSummary } from '../../ipc-types'
import { TASK_STATUS_DOT_STATE, taskStatusShortLabel } from '../../i18n/task-status'
import type { WorkbenchKey } from '../../locale/en'
import { resolveBlockerKey } from '../TaskBoardPage'
import { SessionBadge } from '../tasks/SessionBadge'
import type { TabKindTranslate } from './tab-kinds'

/** 列宽 200 (裁决 #18-⑤ — three columns + gaps fit the 720px pane). */
export const DEP_NODE_WIDTH = 200
/** 列间距 24 (裁决 #18-⑤). */
export const DEP_COLUMN_GAP = 24
/** The node card's height (two rows + padding — the prototype's NH). */
export const DEP_NODE_HEIGHT = 58
/** The vertical gap between stacked cards inside one column. */
export const DEP_ROW_GAP = 16
/** The canvas's outer padding. */
const CANVAS_PAD = 16

/** One laid-out node (absolute coordinates inside the canvas). */
export interface DepGraphNode {
  readonly task: TaskSummary
  readonly x: number
  readonly y: number
  /** The longest-path column index (blocker 在左: depth + 1 column right). */
  readonly depth: number
}

/** One arrow: blocker (source) → blocked (target), endpoint centres. */
export interface DepGraphEdge {
  readonly source: string
  readonly target: string
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
}

/** The pure build: nodes + edges + the canvas extents (AC2's matrix target). */
export interface DepGraphLayout {
  readonly nodes: readonly DepGraphNode[]
  readonly edges: readonly DepGraphEdge[]
  readonly width: number
  readonly height: number
}

/**
 * Build the blocker-left DAG layout from one feature's tasks (PURE).
 * @param tasks - the selected feature's task set (edges resolve within it).
 * @returns the positioned nodes in board key order, the resolvable edges,
 *   and the canvas extents (never zero — an empty set keeps the padding box).
 */
export function buildDepGraph(tasks: readonly TaskSummary[]): DepGraphLayout {
  const byKey = new Map(tasks.map(task => [task.key, task] as const))
  const visible = new Set(byKey.keys())

  // Resolvable blocker pairs only (悬空 blockers draw no edge — the node
  // carries them via the board's own 悬空 surface, not this canvas).
  const blockersOf = new Map<string, readonly string[]>()
  const edges: DepGraphEdge[] = []
  const positions = new Map<string, { x: number; y: number }>()
  const depths = new Map<string, number>()

  // Longest-path depth with the cycle guard (a visiting key contributes 0 —
  // the layout.ts discipline; forge deps should be acyclic, the guard keeps
  // the walk finite when they are not).
  const visiting = new Set<string>()
  const depthOf = (key: string): number => {
    const memo = depths.get(key)
    if (memo !== undefined) return memo
    if (visiting.has(key)) return 0
    visiting.add(key)
    let depth = 0
    for (const blocker of blockersOf.get(key) ?? []) {
      depth = Math.max(depth, depthOf(blocker) + 1)
    }
    visiting.delete(key)
    depths.set(key, depth)
    return depth
  }

  for (const task of tasks) {
    const resolved = task.blockers
      .map(blocker => resolveBlockerKey(task.featureSlug, blocker))
      .filter(key => visible.has(key) && key !== task.key)
    blockersOf.set(task.key, resolved)
  }
  for (const task of tasks) depthOf(task.key)

  // Columns: stack by depth, board order inside a column (deterministic).
  const columns = new Map<number, TaskSummary[]>()
  for (const task of tasks) {
    const depth = depths.get(task.key) ?? 0
    const column = columns.get(depth)
    if (column === undefined) columns.set(depth, [task])
    else column.push(task)
  }
  let width = CANVAS_PAD * 2
  let height = CANVAS_PAD * 2
  const nodes: DepGraphNode[] = []
  for (const [depth, column] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    const x = CANVAS_PAD + depth * (DEP_NODE_WIDTH + DEP_COLUMN_GAP)
    column.forEach((task, index) => {
      const y = CANVAS_PAD + index * (DEP_NODE_HEIGHT + DEP_ROW_GAP)
      positions.set(task.key, { x, y })
      nodes.push({ task, x, y, depth })
    })
    width = Math.max(width, x + DEP_NODE_WIDTH + CANVAS_PAD)
    height = Math.max(height, CANVAS_PAD + column.length * (DEP_NODE_HEIGHT + DEP_ROW_GAP))
  }

  for (const task of tasks) {
    for (const blocker of blockersOf.get(task.key) ?? []) {
      const from = positions.get(blocker)
      const to = positions.get(task.key)
      if (from === undefined || to === undefined) continue
      edges.push({
        source: blocker,
        target: task.key,
        x1: from.x + DEP_NODE_WIDTH,
        y1: from.y + DEP_NODE_HEIGHT / 2,
        x2: to.x,
        y2: to.y + DEP_NODE_HEIGHT / 2,
      })
    }
  }
  return { nodes, edges, width, height }
}

// ---------------------------------------------------------------------------
// The shared node card (两模式复用 — AC4)
// ---------------------------------------------------------------------------

/** The read the card consumes per task (the dock seam + the live badge). */
export interface DepNodeCardProps {
  /** The locale seat (the plugin's bound `t`). */
  readonly t: TabKindTranslate
  readonly task: TaskSummary
  /** The task's ACTIVE session link id (undefined = no 「会话中」 pill). */
  readonly activeSessionId: string | undefined
  /** The 节点点击 → 任务详情 dock seam (C6 select + ensureBoardActive). */
  readonly onOpenTask: (taskKey: string) => void
  /** Extra positioning/style (the DAG form's absolute slot; lanes pass none). */
  readonly style?: Record<string, string | number>
}

/** The card geometry shared by both stylesheets (the DAG canvas's contract). */
const cardStyle = {
  alignItems: 'flex-start',
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, rgba(128, 128, 128, 0.35))',
  borderRadius: '10px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  font: 'inherit',
  gap: '2px',
  padding: '6px 10px',
  textAlign: 'left',
  width: `${DEP_NODE_WIDTH}px`,
} as const

const cardTitleRowStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '6px',
  minWidth: 0,
} as const

const cardTitleStyle = {
  flex: '1 1 auto',
  fontSize: '13px',
  lineHeight: '20px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const cardMetaStyle = {
  alignItems: 'center',
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  display: 'flex',
  fontSize: '12px',
  gap: '6px',
  lineHeight: '18px',
  minWidth: 0,
} as const

const cardKeyStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/**
 * The node card BOTH modes render (AC4: 状态点/标题/ID/「会话中」pill, 点击开
 * 任务抽屉): the upstream StateDot through the ONE 7-态 dot mapping, the
 * board's mono key, the shared SessionBadge, and the dock seam on the card's
 * whole surface (a real button — the badge is inert, no nesting).
 */
export function DepNodeCard(props: DepNodeCardProps): ReactNode {
  const t = props.t
  const task = props.task
  return (
    <button
      type="button"
      data-dsh-forge-depgraph-node={task.key}
      aria-label={`${task.key} · ${task.title}, ${taskStatusShortLabel(task.status, t)}`}
      style={{ ...cardStyle, ...props.style }}
      onClick={() => { props.onOpenTask(task.key) }}
    >
      <span style={cardTitleRowStyle}>
        <StateDot state={TASK_STATUS_DOT_STATE[task.status]} />
        <span title={task.title} style={cardTitleStyle}>{task.title}</span>
      </span>
      <span style={cardMetaStyle}>
        <span style={cardKeyStyle} title={task.key}>{task.key}</span>
        <span>{taskStatusShortLabel(task.status, t)}</span>
        <SessionBadge t={t} sessionId={props.activeSessionId} />
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// The DAG canvas
// ---------------------------------------------------------------------------

/** The scroller wrapping the canvas (三级链 fits 720px; narrower scrolls). */
const wrapStyle = {
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'auto',
  padding: '8px 12px',
} as const

/** What the DAG canvas consumes (the tab pre-derives the shared inputs). */
export interface DagViewProps {
  /** The locale seat (the plugin's bound `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** The selected feature's tasks (the pure build runs per render). */
  readonly tasks: readonly TaskSummary[]
  /** taskKey → its ACTIVE session link id (the 会话中 pill source). */
  readonly activeLinks: ReadonlyMap<string, string>
  /** The 节点点击 → 任务详情 dock seam. */
  readonly onOpenTask: (taskKey: string) => void
}

/**
 * The DAG canvas: the SVG arrow layer under the absolutely positioned node
 * cards. The layout is a pure function of the task set — deterministic, no
 * measurement, no dependencies.
 */
export function DagView(props: DagViewProps): ReactNode {
  const layout = buildDepGraph(props.tasks)
  // A per-mount marker id (useId) — two panes may hold a depgraph each.
  const markerId = `dsh-forge-dep-arrow-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  return (
    <div data-dsh-forge-depgraph-dag="" style={wrapStyle}>
      <div style={{ position: 'relative', width: `${layout.width}px`, height: `${layout.height}px` }}>
        <svg
          aria-hidden="true"
          data-dsh-forge-depgraph-edges=""
          width={layout.width}
          height={layout.height}
          style={{ position: 'absolute', inset: '0', overflow: 'visible', pointerEvents: 'none' }}
        >
          <defs>
            <marker
              id={markerId}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="var(--dsh-border-color, rgba(128, 128, 128, 0.55))" />
            </marker>
          </defs>
          {layout.edges.map(edge => (
            <line
              key={`${edge.source}->${edge.target}`}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke="var(--dsh-border-color, rgba(128, 128, 128, 0.55))"
              strokeWidth={1.5}
              markerEnd={`url(#${markerId})`}
            />
          ))}
        </svg>
        {layout.nodes.map(node => (
          <DepNodeCard
            key={node.task.key}
            t={props.t}
            task={node.task}
            activeSessionId={props.activeLinks.get(node.task.key)}
            onOpenTask={props.onOpenTask}
            style={{ position: 'absolute', left: `${node.x}px`, top: `${node.y}px` }}
          />
        ))}
      </div>
    </div>
  )
}
