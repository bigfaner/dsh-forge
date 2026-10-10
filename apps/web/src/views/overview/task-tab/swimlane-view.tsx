// 泳道视图（定位：业务——AC3：七态横向列[0 计数列 = 等高窄列头——仅状态+计数；
// D36 ③ 折叠窄头变体退役——列头同形同高 26px 横向头] +
// 卡片[键 + 标题 + foot 含 ⏱实际耗时[completed]] + 卡片点击 → 抽屉回调）。
// 列序 = contracts TASK_STATUSES 单源（swimColumnsOf 投影）；卡片双载体（onOpenTask
// 在场 = 可点 role=button；缺席 = 静态）。
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  TASK_STATUS_LABELS,
  type TaskCard,
  type TaskStatus,
} from '@dsh-forge/contracts'
import { StateDot, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { STATUS_DOT_STATE } from '../status-chips.js'
import { formatActualDuration, taskKeyLabel } from '../drawer/detail-model.js'
import { swimColumnsOf, taskHoverLabel } from './task-tab-model.js'
import './task-tab.css'

export interface SwimlaneViewProps {
  /** vis 集（服务端过滤/排序后——列内卡序 = 服务端排序序） */
  readonly cards: readonly TaskCard[]
  /** 卡片点击 → 抽屉回调（缺席 = 静态呈现） */
  readonly onOpenTask?: (taskId: string) => void
  /** 抽屉开着的任务（卡片高亮） */
  readonly activeTaskId?: string
}

/** 单卡片（键 + 标题 + foot：类型 / ⏱实际耗时[completed] / ⟞挂接计数 / fix chip） */
function SwimCard({
  card,
  active,
  onOpenTask,
}: {
  readonly card: TaskCard
  readonly active: boolean
  readonly onOpenTask: ((taskId: string) => void) | undefined
}): ReactNode {
  const duration = card.taskStatus === 'completed' ? formatActualDuration(card.actualDurationMs) : undefined
  const handleKey = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (onOpenTask !== undefined) onOpenTask(card.taskId)
    }
  }
  return (
    // D30：原生 title 退役——官方 Tooltip（portal 逃逸泳道横向滚动裁剪容器）；
    // D36 ⑥：label = 键·标题全名兜底 + 非可见位增量注（零可见字面复读——DAG 同形位
    // 保留原样 = 超长全名兜底记账豁免，不随本位联动）
    <Tooltip label={taskHoverLabel(card, `${taskKeyLabel(card.slug, card.localId)} · ${card.title}`)} portal>
      <div
        className={active ? 'dswf-tt-card is-open' : 'dswf-tt-card'}
        data-dswf-tt-card={card.taskId}
        {...(onOpenTask !== undefined
          ? { role: 'button', tabIndex: 0, onClick: () => onOpenTask(card.taskId), onKeyDown: handleKey }
          : {})}
      >
        <div className="dswf-tt-card-key">
          {card.localId}
          {card.sourceTask !== undefined ? <span className="dswf-tt-fixchip">fix</span> : null}
        </div>
        <div className="dswf-tt-card-title">{card.title}</div>
        <div className="dswf-tt-card-foot">
          <span className="dswf-tt-card-type">{card.taskType}</span>
          {duration !== undefined ? <span className="dswf-tt-card-time">⏱ {duration}</span> : null}
          {card.sessionCount > 0 ? <span className="dswf-tt-card-links">{`⟞${card.sessionCount}`}</span> : null}
        </div>
      </div>
    </Tooltip>
  )
}

/** 泳道视图（纯渲染体——静态全相位可测） */
export function SwimlaneView({ cards, onOpenTask, activeTaskId }: SwimlaneViewProps): ReactNode {
  const columns = swimColumnsOf(cards)
  return (
    <div className="dswf-tt-swim" data-dswf-tt-swim="">
      {columns.map((column) => {
        const empty = column.cards.length === 0
        return (
          <div
            className={empty ? 'dswf-tt-col is-empty' : 'dswf-tt-col'}
            data-dswf-tt-col={column.status}
            key={column.status}
          >
            <Tooltip
              label={empty ? '无此状态任务' : `${TASK_STATUS_LABELS[column.status].zh}（${TASK_STATUS_LABELS[column.status].en}）`}
              portal
            >
              <div className="dswf-tt-col-head">
                <StateDot state={STATUS_DOT_STATE[column.status as TaskStatus]} size={8} />
                <span>{TASK_STATUS_LABELS[column.status].zh}</span>
                <span className="dswf-tt-col-count">{column.cards.length}</span>
              </div>
            </Tooltip>
            {empty
              ? null
              : column.cards.map((card) => (
                  <SwimCard
                    key={card.taskId}
                    card={card}
                    active={activeTaskId === card.taskId}
                    onOpenTask={onOpenTask}
                  />
                ))}
          </div>
        )
      })}
    </div>
  )
}
