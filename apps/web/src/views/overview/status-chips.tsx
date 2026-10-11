// 状态过滤 chips（定位：业务——UF-1：TASK_STATUSES 行序 chips，toggle 过滤 + 0 计数
// disabled 淡化；三视图统一过滤接口——3.6 任务子 tab 消费同组件同状态）。
// 状态点/标签单源 = contracts（StateDot 官方语义映射）；计数 = 头路 tasks.stats
// byStatus（0 计数禁用——不可点出空态）。受控件：active 集合与 toggle 上抛归帧侧模型。
// S3（run-tasks-host-command）：词汇七态 → 八态（+interrupted——表驱动，chips/泳道/
// 转移菜单自动覆盖新态；仅语义映射表需显式补行）。
import type { ReactNode } from 'react'
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from '@dsh-forge/contracts'
import { StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import { hasActiveStatusFilter, isChipDisabled } from './overview-model.js'
import './overview.css'

/** 状态 → 官方 StateDot 语义（done/warning/ongoing/error/idle；原型 ST_DOT 对齐）。
 *  S3 interrupted = warning（与 suspended 同族——暂停等待恢复，非错误态） */
export const STATUS_DOT_STATE: Readonly<Record<TaskStatus, StateDotState>> = {
  pending: 'idle',
  in_progress: 'ongoing',
  completed: 'done',
  blocked: 'error',
  suspended: 'warning',
  interrupted: 'warning',
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

/** 状态过滤 chips（AC5：toggle + 0 计数 disabled——过滤接口三视图统一；表驱动 TASK_STATUSES
 *  行序——S3 interrupted 自动呈现「已中断」chip） */
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
          // D37：状态筛选 chips 控件自释零气泡——zh 标签已在 chip 面；禁用态说明
          // 「无此状态任务」由 0 计数淡化自释（D30 机械化包裹残差退役——tipwrap 随之）
          <button
            key={status}
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
        )
      })}
      {hasFilter && onClear !== undefined ? (
        <button
          type="button"
          className="dswf-ov-stchip dswf-ov-stchip-clear"
          data-dswf-ov-stchip-clear=""
          onClick={onClear}
        >
          ✕ 重置
        </button>
      ) : null}
    </div>
  )
}
