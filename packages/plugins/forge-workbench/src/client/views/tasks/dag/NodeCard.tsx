/**
 * The UF2 视图 A node card (task 5.6, ui-design 节点卡): w240 · r14 ·
 * bg-layer-2 · pad 10 12 — the SAME field set as the view B card / view C row
 * (AC5: 任务号/标题/状态/分支/worktree/来源), rendered through the SAME shared
 * pieces (upstream StateDot, i18n/task-status routing, the TaskBadges cluster)
 * so the three views cannot drift.
 *
 * The wrapper div (the lib's `.react-flow__node`) carries the interaction —
 * click / Enter / Space navigate to the selection seam; the card itself is
 * pure presentation plus the RESERVED mount point for the UF5 hover trigger
 * (tech-design Integration: 节点卡右上角 hover/:focus-within 显现按钮 28×28 —
 * 5.10's SessionLaunchEntry node-hover variant mounts here with 5.11; the
 * slot is an empty positioned container until then, revealed by the scoped
 * `.dsh-forge-dag` stylesheet on wrapper hover/:focus-within).
 *
 * The 28×28 budget is the slot's reserved box; the focus ring rides the
 * scoped stylesheet (`.react-flow__node:focus-within .dsh-forge-node-card`,
 * `--dsw-alias-link` 1.5px per ui-design 焦点任务) — keyboard focus stays
 * visible on nodes without per-render state.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { TASK_STATUS_DOT_STATE, taskStatusShortLabel } from '../../../i18n/task-status'
import { TaskBadges } from '../TaskRow'
import type { TaskDagNode } from './build-graph'

/** The card face: w240 fixed, the B-card geometry frozen to the layout constants. */
const cardStyle = {
  alignItems: 'flex-start',
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  font: 'inherit',
  gap: '4px',
  height: '100%',
  overflow: 'hidden',
  padding: '10px 12px',
  position: 'relative',
  transition: 'background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  width: '100%',
} as const

/** The reserved UF5 mount point: a 28×28 box at the card's top-right, empty until 5.11. */
const launchSlotStyle = {
  alignItems: 'center',
  display: 'flex',
  height: '28px',
  justifyContent: 'center',
  position: 'absolute',
  right: '6px',
  top: '6px',
  width: '28px',
} as const

/** The updating highlight fill (回流·属性级 — same tokens as the B card). */
const updatingBackground = 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))'

/**
 * The 焦点任务 selection mark (5.8): the selected node's border — the SAME
 * `--dsw-alias-link` 1.5px ui-design specifies for the focused task (从 UF3
 * 返回/挂接回流定位), so the DAG's selected node and keyboard-focused node
 * read as one visual family. `data-dsh-forge-selected` is its observation hook.
 */
const selectedBorderStyle = '1.5px solid var(--dsw-alias-link, rgb(65, 118, 230))'

const titleRowStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '6px',
  minWidth: '0',
  width: '100%',
} as const

const titleStyle = {
  fontSize: '14px',
  lineHeight: '22px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const secondRowStyle = {
  alignItems: 'baseline',
  display: 'flex',
  gap: '8px',
  minWidth: 0,
} as const

const monoSecondaryStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const shortLabelStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const badgesRowStyle = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  minWidth: 0,
} as const

/** Invisible edge anchors: top = blocker in, bottom = blocked out (styled away in the scoped sheet). */
const handleStyle = { opacity: 0 } as const

/**
 * The `taskCard` custom node. Fixed geometry (NODE_CARD_WIDTH ×
 * NODE_CARD_HEIGHT) keeps the layered layout exact; fields mirror the B card.
 */
export function TaskCardNode({ data }: NodeProps<TaskDagNode>) {
  const { task, t, updating, selected } = data
  return (
    <div
      data-dsh-forge-node-card={task.key}
      data-dsh-forge-updating={updating ? '' : undefined}
      data-dsh-forge-selected={selected ? '' : undefined}
      style={{
        ...cardStyle,
        ...(selected ? { border: selectedBorderStyle } : {}),
        ...(updating ? { backgroundColor: updatingBackground } : {}),
      }}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} style={handleStyle} />
      {/* The reserved UF5 hover-trigger mount (5.11 fills this box). */}
      <span data-dsh-forge-node-launch="" style={launchSlotStyle} />
      <span style={titleRowStyle}>
        <StateDot state={TASK_STATUS_DOT_STATE[task.status]} />
        <span title={task.title} style={titleStyle}>{task.title}</span>
      </span>
      <span style={secondRowStyle}>
        <span title={task.key} style={{ ...monoSecondaryStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.key}
        </span>
        <span style={shortLabelStyle}>{taskStatusShortLabel(task.status, t)}</span>
      </span>
      <span style={badgesRowStyle}>
        {task.branch !== null && (
          <span title={task.branch} style={{ ...monoSecondaryStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.branch}
          </span>
        )}
        <TaskBadges t={t} task={task} danglingBlockers={data.danglingBlockers} />
      </span>
      <Handle type="source" position={Position.Bottom} isConnectable={false} style={handleStyle} />
    </div>
  )
}
