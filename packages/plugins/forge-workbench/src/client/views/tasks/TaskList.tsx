/**
 * The UF2 view C 列表 (task 5.5, ui-design — 2026-09-22 原型修订含分支列):
 * the flat table — 任务号(mono) | 标题 | 状态 | feature | 分支(mono) |
 * worktree | 来源 | 更新时间 — over the shared TaskListRow. 列宽适配: fixed
 * budgets on the mono/enum columns, the title column absorbs the slack; the
 * scale side of the 500-task budget rides per-row progressive rendering
 * (content-visibility), inert in jsdom, effective in the Chromium host.
 *
 * Read-only discipline: rows carry navigation only (the selection seam);
 * there is no per-row control of any other kind (BIZ-task-ops-001).
 */
import type { TaskSummary } from '../../ipc-types'
import type { WorkbenchKey } from '../../locale/en'
import { TaskListRow } from './TaskRow'

/** Inputs of {@link TaskList}. */
export interface TaskListProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The post-filter, post-sort tasks (the page owns filtering — Hard Rule). */
  tasks: readonly TaskSummary[]
  /** key → dangling LOCAL blockers, computed against the FULL task set. */
  danglingByTask: ReadonlyMap<string, readonly string[]>
  /** The task keys currently carrying the 回流 updating highlight. */
  updatingKeys: ReadonlySet<string>
  /** The 5.7 selection seam — a row activation hands the task over (navigation only). */
  onSelect?: ((task: TaskSummary) => void) | undefined
}

const wrapStyle = {
  minWidth: '0',
  overflowX: 'auto',
  paddingBottom: '8px',
} as const

const tableStyle = {
  borderCollapse: 'collapse',
  width: '100%',
} as const

const headCellStyle = {
  borderBottom: '1px solid var(--dsh-border-color, CanvasText)',
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '18px',
  padding: '6px 10px',
  textAlign: 'left',
  whiteSpace: 'nowrap',
} as const

/** The C column budget: fixed on mono/enum columns, auto (the slack) on the title. */
const COLUMN_WIDTHS: Record<string, string | undefined> = {
  key: '150px',
  title: undefined,
  status: '140px',
  feature: '140px',
  branch: '170px',
  worktree: '110px',
  source: '100px',
  updatedAt: '140px',
}

/** The header row's locale keys, in ui-design column order. */
const COLUMN_KEYS = [
  'tasks.column.key',
  'tasks.column.title',
  'tasks.column.status',
  'tasks.column.feature',
  'tasks.column.branch',
  'tasks.column.worktree',
  'tasks.column.source',
  'tasks.column.updatedAt',
] as const satisfies readonly WorkbenchKey[]

/** The column ids (stable, th↔width pairing). */
const COLUMN_IDS = Object.keys(COLUMN_WIDTHS)

/**
 * The flat list. `data-dsh-forge-task-list` is the observation hook;
 * `scope="col"` heads carry the width budget (列宽适配).
 */
export function TaskList(props: TaskListProps) {
  return (
    <div data-dsh-forge-task-list="" style={wrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {COLUMN_KEYS.map((key, index) => {
              const id = COLUMN_IDS[index] as string
              return (
                <th
                  key={id}
                  scope="col"
                  aria-label={props.t(key)}
                  data-dsh-forge-task-column={id}
                  style={{ ...headCellStyle, width: COLUMN_WIDTHS[id] }}
                >
                  {props.t(key)}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {props.tasks.map(task => (
            <TaskListRow
              key={task.key}
              t={props.t}
              task={task}
              danglingBlockers={props.danglingByTask.get(task.key) ?? []}
              updating={props.updatingKeys.has(task.key)}
              onSelect={props.onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
