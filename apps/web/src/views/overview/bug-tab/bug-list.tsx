// Bug 子 tab 列表视图（定位：业务——fix-bug 概览第 4 子 tab；行样式对齐提案行体系
// （dswf-ov-item/parent——标题左 + 状态圆点色区分[无状态文字] + error_type chip 右靠，
// 时间不呈现）；行不展开——点击整行上抛 onOpenBug（详情弹框）。chips 三态计数 0 计数
// disabled（同任务 chips 语义）；搜索/排序控件归 sticky-bar（帧侧统一），本组件仅承载
// chips 过滤 + 行集呈现。
// Hard Rule「搜索过滤服务端承载」：本组件零本地过滤——bugs 行集即服务端过滤后结果。
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { BUG_STATUSES, BUG_STATUS_LABELS, type BugCard, type BugStatus } from '@dsh-forge/contracts'
import { StateDot, Tag, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState } from '../../../components/index.js'
import { hasActiveStatusFilter, isChipDisabled } from '../overview-model.js'

/** BugStatus → 官方 StateDot 语义（open 待修复 = error；fixed 已修复 = done；unresolved 无法复现 = idle） */
export const BUG_STATUS_DOT_STATE: Readonly<Record<BugStatus, StateDotState>> = {
  open: 'error',
  fixed: 'done',
  unresolved: 'idle',
}

export interface BugStatusChipsProps {
  /** 三态计数（无参全量行投影——0 计数禁用） */
  readonly counts: Readonly<Record<BugStatus, number>>
  /** 激活集（受控——帧侧 toggleBugStatusFilter） */
  readonly active: ReadonlySet<BugStatus>
  /** chip toggle 上抛 */
  readonly onToggle: (status: BugStatus) => void
  /** 清过滤上抛（任一激活时呈现入口；缺席 = 无清入口面） */
  readonly onClear?: () => void
}

/** Bug 三态状态过滤 chips（表驱动 BUG_STATUSES 行序；0 计数 disabled 同任务 chips 语义） */
export function BugStatusChips({ counts, active, onToggle, onClear }: BugStatusChipsProps): ReactNode {
  const hasFilter = hasActiveStatusFilter(active)
  return (
    <div className="dswf-ov-stchips" role="group" aria-label="状态过滤" data-dswf-ov-bschips="">
      {BUG_STATUSES.map((status) => {
        const count = counts[status] ?? 0
        const disabled = isChipDisabled(count)
        const on = active.has(status)
        const cls = ['dswf-ov-stchip', on ? 'is-on' : '', disabled ? 'is-zero' : ''].filter(Boolean).join(' ')
        return (
          <button
            key={status}
            type="button"
            className={cls}
            data-dswf-ov-bschip={status}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => {
              onToggle(status)
            }}
          >
            <StateDot state={BUG_STATUS_DOT_STATE[status]} size={8} />
            <span className="dswf-ov-stchip-label">{BUG_STATUS_LABELS[status].zh}</span>
            <span className="dswf-ov-stchip-count">{count}</span>
          </button>
        )
      })}
      {hasFilter && onClear !== undefined ? (
        <button
          type="button"
          className="dswf-ov-stchip dswf-ov-stchip-clear"
          data-dswf-ov-bschip-clear=""
          onClick={onClear}
        >
          ✕ 重置
        </button>
      ) : null}
    </div>
  )
}

/** 单 Bug 行（提案行同构——dswf-ov-item/parent flex：状态点[色区分状态] + summary 标题
 *  靠左 + error_type chip 右靠；无展开/无状态文字/无时间。onOpenBug 在场 = 整行可点
 *  role=button 键盘可达，点击上抛开详情弹框；缺席 = 静态呈现。onAddBugToSession 在场 =
 *  行内纯增「添加到会话中」控件（composer-bug-reference 1.4——stopPropagation 不触发
 *  行点击；缺席 = 行语言零变化） */
function BugRow({
  bug,
  onOpenBug,
  onAddBugToSession,
}: {
  readonly bug: BugCard
  readonly onOpenBug?: (bugId: string) => void
  readonly onAddBugToSession?: (bug: BugCard) => void
}): ReactNode {
  const handleKey = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpenBug?.(bug.bugId)
    }
  }
  const stop = (event: { stopPropagation(): void }): void => {
    event.stopPropagation()
  }
  return (
    <div
      className="dswf-ov-item"
      data-dswf-ov-bugrow={bug.bugId}
      {...(onOpenBug !== undefined
        ? { role: 'button', tabIndex: 0, onClick: () => onOpenBug(bug.bugId), onKeyDown: handleKey }
        : {})}
    >
      <div className="dswf-ov-parent">
        <StateDot state={BUG_STATUS_DOT_STATE[bug.bugStatus]} size={8} />
        <span className="dswf-ov-parent-title">{bug.summary}</span>
        {bug.errorType !== undefined ? (
          <span data-dswf-ov-bugrow-type={bug.errorType}>
            <Tag tone="neutral" className="dswf-ov-parent-chip">{bug.errorType}</Tag>
          </span>
        ) : null}
        {onAddBugToSession !== undefined ? (
          <button
            type="button"
            className="dswf-ov-bugrow-add"
            data-dswf-ov-bugrow-add=""
            onClick={(event) => {
              stop(event)
              onAddBugToSession(bug)
            }}
            onKeyDown={stop}
          >
            添加到会话中
          </button>
        ) : null}
      </div>
    </div>
  )
}
export interface BugListProps {
  /** Bug 行集（服务端 search/status/sort 后结果——零本地过滤） */
  readonly bugs: readonly BugCard[]
  /** 三态计数（无参全量行投影——chips 计数单源） */
  readonly counts: Readonly<Record<BugStatus, number>>
  /** 激活集（受控——帧侧模型） */
  readonly activeStatuses: ReadonlySet<BugStatus>
  readonly onToggleStatus: (status: BugStatus) => void
  readonly onClearStatuses?: () => void
  /** 行点击 → 详情弹框回调（后续切片接线；缺席 = 行静态呈现） */
  readonly onOpenBug?: (bugId: string) => void
  /** 行「添加到会话中」上抛（1.4——装配注入；缺席 = 按钮不呈现） */
  readonly onAddBugToSession?: (bug: BugCard) => void
  /** 空态标题（缺省「暂无 Bug」；搜索在场由帧侧注入「无匹配…」） */
  readonly emptyTitle?: string
}

/** Bug 子 tab 列表视图（chips 行 + 行集；空态 = EmptyState——过滤在场/缺省双标题） */
export function BugList({ bugs, counts, activeStatuses, onToggleStatus, onClearStatuses, onOpenBug, onAddBugToSession, emptyTitle }: BugListProps): ReactNode {
  const hasFilter = hasActiveStatusFilter(activeStatuses)
  return (
    <div className="dswf-ov-bugpage" data-dswf-ov-bugpage="">
      <BugStatusChips counts={counts} active={activeStatuses} onToggle={onToggleStatus} {...(onClearStatuses !== undefined ? { onClear: onClearStatuses } : {})} />
      {bugs.length === 0 ? (
        <EmptyState
          className="dswf-ov-empty"
          title={hasFilter ? '无匹配当前状态过滤的 Bug' : (emptyTitle ?? '暂无 Bug')}
          description={hasFilter ? '调整或清除过滤后重试' : 'Bug 由 fix-bug 流程经 recordBug 登记'}
        />
      ) : (
        <div className="dswf-ov-list" data-dswf-ov-bugs="">
          {bugs.map((bug) => (
            <BugRow
              key={bug.bugId}
              bug={bug}
              {...(onOpenBug !== undefined ? { onOpenBug } : {})}
              {...(onAddBugToSession !== undefined ? { onAddBugToSession } : {})}
            />
          ))}
        </div>
      )}
    </div>
  )
}
