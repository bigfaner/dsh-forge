// 七态过滤 chips（定位：业务——UF-1：TASK_STATUSES 行序 chips，toggle 过滤 + 0 计数
// disabled 淡化；三视图统一过滤接口——3.6 任务子 tab 消费同组件同状态）。
// 状态点/标签单源 = contracts（StateDot 官方语义映射）；计数 = 头路 tasks.stats
// byStatus（0 计数禁用——不可点出空态）。受控件：active 集合与 toggle 上抛归帧侧模型。
import type { ReactNode } from 'react'
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from '@dsh-forge/contracts'
import { StateDot, Tooltip, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import { hasActiveStatusFilter, isChipDisabled } from './overview-model.js'
import './overview.css'

/** 七态 → 官方 StateDot 语义（done/warning/ongoing/error/idle；原型 ST_DOT 对齐） */
export const STATUS_DOT_STATE: Readonly<Record<TaskStatus, StateDotState>> = {
  pending: 'idle',
  in_progress: 'ongoing',
  completed: 'done',
  blocked: 'error',
  suspended: 'warning',
  skipped: 'idle',
  rejected: 'error',
}

export interface StatusChipsProps {
  /** 七态计数（tasks.stats byStatus——0 计数禁用） */
  readonly counts: Readonly<Record<TaskStatus, number>>
  /** 激活集（受控——帧侧 toggleStatusFilter） */
  readonly active: ReadonlySet<TaskStatus>
  /** chip toggle 上抛 */
  readonly onToggle: (status: TaskStatus) => void
  /** 清过滤上抛（任一激活时呈现入口；缺席 = 无清入口面） */
  readonly onClear?: () => void
}

/** 七态过滤 chips（AC5：toggle + 0 计数 disabled——过滤接口三视图统一） */
export function StatusChips({ counts, active, onToggle, onClear }: StatusChipsProps): ReactNode {
  const hasFilter = hasActiveStatusFilter(active)
  return (
    <div className="dswf-ov-stchips" role="group" aria-label="状态过滤" data-dswf-ov-stchips="">
      {TASK_STATUSES.map((status) => {
        const count = counts[status] ?? 0
        const disabled = isChipDisabled(count)
        const on = active.has(status)
        const cls = [
          'dswf-ov-stchip',
          on ? 'is-on' : '',
          disabled ? 'is-zero' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          // D30：原生 title 退役——官方 Tooltip（禁用态锚定 = dswf-tipwrap 包裹 span）
          <Tooltip
            key={status}
            label={disabled ? '无此状态任务' : `${TASK_STATUS_LABELS[status].zh}（${TASK_STATUS_LABELS[status].en}）`}
            portal
          >
            <span className="dswf-tipwrap">
              <button
                type="button"
                className={cls}
                data-dswf-ov-stchip={status}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => {
                  onToggle(status)
                }}
              >
                <StateDot state={STATUS_DOT_STATE[status]} size={8} />
                <span className="dswf-ov-stchip-label">{TASK_STATUS_LABELS[status].zh}</span>
                <span className="dswf-ov-stchip-count">{count}</span>
              </button>
            </span>
          </Tooltip>
        )
      })}
      {hasFilter && onClear !== undefined ? (
        <button
          type="button"
          className="dswf-ov-stchip dswf-ov-stchip-clear"
          data-dswf-ov-stchip-clear=""
          onClick={onClear}
        >
          ✕ 清过滤
        </button>
      ) : null}
    </div>
  )
}
