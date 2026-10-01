/**
 * The 依赖图 tab's 泳道图 mode (M4 task 2.4, layout §4.6 + 裁决 #21): the
 * M2 tasks.html board-cols pane form — the 7-态 status vocabulary as
 * horizontal lanes (pending / in_progress / completed / blocked / suspended /
 * skipped / rejected, the canonical TASK_STATUSES order — ONE order,
 * everywhere), each 列头 = 状态点 + 名称 + 计数, an empty lane showing 「无此
 * 状态任务」. The node cards are the SAME DepNodeCard the DAG renders (AC4
 * 两模式复用 — 状态点/标题/ID/「会话中」pill, 点击开任务抽屉).
 */
import type { ReactNode } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskStatus, TaskSummary } from '../../ipc-types'
import { TASK_STATUSES, TASK_STATUS_DOT_STATE, taskStatusLabel } from '../../i18n/task-status'
import type { WorkbenchKey } from '../../locale/en'
import { DepNodeCard } from './DagView'

/** One lane's derived grouping (the pure model's output row). */
export interface DepLane {
  readonly status: TaskStatus
  readonly tasks: readonly TaskSummary[]
}

/**
 * Group one feature's tasks into the SEVEN lanes (PURE, exported for the
 * unit matrix): every lane is present in canonical order — the empty ones
 * render the 「无此状态任务」 placeholder, they never disappear (the M2
 * board-cols contract).
 */
export function groupDepLanes(tasks: readonly TaskSummary[]): readonly DepLane[] {
  return TASK_STATUSES.map(status => ({
    status,
    tasks: tasks.filter(task => task.status === status),
  }))
}

/** The horizontal scroller carrying the lane row (七态横向列). */
const lanesStyle = {
  display: 'flex',
  flex: '1 1 auto',
  gap: '10px',
  minWidth: 0,
  overflowX: 'auto',
} as const

/** One lane column: fixed width, internally scrolling. */
const laneStyle = {
  border: '0.5px solid var(--dsh-border-color, rgba(128, 128, 128, 0.35))',
  borderRadius: '10px',
  display: 'flex',
  flexDirection: 'column',
  flex: '0 0 auto',
  gap: '6px',
  maxHeight: '100%',
  minWidth: 0,
  overflowY: 'auto',
  padding: '8px',
  width: '232px',
} as const

/** The 列头: 状态点 + 名称 + 计数. */
const laneHeadStyle = {
  alignItems: 'center',
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  display: 'flex',
  flex: '0 0 auto',
  fontSize: '12px',
  gap: '6px',
  lineHeight: '18px',
  padding: '2px 2px 4px',
} as const

const laneCountStyle = {
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '8px',
  flex: '0 0 auto',
  fontSize: '11px',
  lineHeight: '16px',
  marginLeft: 'auto',
  padding: '0 6px',
  whiteSpace: 'nowrap',
} as const

/** The 空列 placeholder (「无此状态任务」). */
const laneEmptyStyle = {
  color: 'var(--dsw-alias-label-tertiary, rgb(129, 133, 140))',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
  padding: '6px 2px',
} as const

/** What the swimlane mode consumes (the SAME inputs the DAG mode rides). */
export interface SwimlaneViewProps {
  /** The locale seat (the plugin's bound `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** The selected feature's tasks. */
  readonly tasks: readonly TaskSummary[]
  /** taskKey → its ACTIVE session link id (the 会话中 pill source). */
  readonly activeLinks: ReadonlyMap<string, string>
  /** The 节点点击 → 任务详情 dock seam. */
  readonly onOpenTask: (taskKey: string) => void
}

/**
 * The 泳道图: seven status lanes side by side, the shared node cards inside,
 * the count pill per lane head.
 */
export function SwimlaneView(props: SwimlaneViewProps): ReactNode {
  const t = props.t
  const lanes = groupDepLanes(props.tasks)
  return (
    <div data-dsh-forge-depgraph-lanes="" style={lanesStyle}>
      {lanes.map(lane => (
        <div
          key={lane.status}
          data-dsh-forge-depgraph-lane={lane.status}
          role="group"
          aria-label={taskStatusLabel(lane.status, t)}
          style={laneStyle}
        >
          <div data-dsh-forge-depgraph-lane-head={lane.status} style={laneHeadStyle}>
            <StateDot state={TASK_STATUS_DOT_STATE[lane.status]} />
            <span>{taskStatusLabel(lane.status, t)}</span>
            <span style={laneCountStyle}>{lane.tasks.length}</span>
          </div>
          {lane.tasks.length === 0 && (
            <p data-dsh-forge-depgraph-lane-empty={lane.status} style={laneEmptyStyle}>
              {t('rightbar.depgraph.lane.empty')}
            </p>
          )}
          {lane.tasks.map(task => (
            <DepNodeCard
              key={task.key}
              t={t}
              task={task}
              activeSessionId={props.activeLinks.get(task.key)}
              onOpenTask={props.onOpenTask}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
