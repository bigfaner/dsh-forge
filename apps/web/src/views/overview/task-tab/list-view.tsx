// 列表视图（定位：业务——AC1 两行布局：主行[localId 键 + 标题 + 中文状态 tag + ⋯] +
// 副行[类型/优先级/实际耗时[completed]/前置/挂接/fix 源标] + 分组标签[执行中/其余]）。
// 行点击 → onOpenTask 抽屉回调（AC——双载体：回调在场 = 可点 role=button 键盘可达；
// 缺席 = 静态呈现）。⋯ 菜单 = 官方 Menu 门户面（查看详情 + 转移预设——3.8 对话框接线位）；
// 行集/选中映射经 rowMenuItems/rowMenuSelect 纯函数直测（开面归 4.1/5.2 e2e——
// SessionTaskPills 同口径）。身份双轨：taskId = 锚/key，slug/localId = 展示。
import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskCard,
  type TaskStatus,
} from '@dsh-forge/contracts'
import { Button, Menu, Tag, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { taskKeyLabel } from '../drawer/detail-model.js'
import { listGroupsOf, taskStatusTagTone, taskSubRowParts } from './task-tab-model.js'
import './task-tab.css'

/** ⋯ 菜单行 id 派发（open:{taskId} → 抽屉 / trans:{taskId}:{toStatus} → 转移入口；
 * 未知 id = 无派发——sessionPillMenuActivated 同形制纯动作面） */
export function rowMenuSelect(
  id: string,
  handlers: {
    readonly onOpenTask: ((taskId: string) => void) | undefined
    readonly onTransition: ((taskId: string, toStatus: TaskStatus) => void) | undefined
  },
): void {
  if (id.startsWith('open:')) {
    handlers.onOpenTask?.(id.slice('open:'.length))
    return
  }
  const transMatch = /^trans:([^:]+):([a-z_]+)$/.exec(id)
  const transTaskId = transMatch?.[1]
  const transStatus = transMatch?.[2]
  if (transTaskId !== undefined && transStatus !== undefined) {
    handlers.onTransition?.(transTaskId, transStatus as TaskStatus)
  }
}

/** ⋯ 菜单行集（查看详情 + 转移预设七态 − 当前态——from≠to 机械排除自身） */
export function rowMenuItems(
  card: TaskCard,
  opts: { readonly onTransition: boolean },
): readonly MenuEntry[] {
  const items: MenuEntry[] = [
    {
      id: `open:${card.taskId}`,
      label: <span className="dswf-tt-mrow">查看详情</span>,
    },
  ]
  if (opts.onTransition) {
    for (const status of TASK_STATUSES) {
      if (status === card.taskStatus) continue
      items.push({
        id: `trans:${card.taskId}:${status}`,
        label: (
          <span className="dswf-tt-mrow" data-dswf-tt-mtrans={`${card.taskId}:${status}`}>
            {`转 ${TASK_STATUS_LABELS[status].zh}`}
          </span>
        ),
      })
    }
  }
  return items
}

/** 单任务两行卡（主行 + 副行；双载体——onOpenTask 在场 = 整卡可点） */
function TaskItem({
  card,
  active,
  onOpenTask,
  onTransition,
  menuOpen,
  onMenuOpenChange,
}: {
  readonly card: TaskCard
  readonly active: boolean
  readonly onOpenTask: ((taskId: string) => void) | undefined
  readonly onTransition: ((taskId: string) => void) | undefined
  readonly menuOpen: boolean
  readonly onMenuOpenChange: (taskId: string | null) => void
}): ReactNode {
  const key = taskKeyLabel(card.slug, card.localId)
  const hasMenu = onOpenTask !== undefined || onTransition !== undefined
  const sub = taskSubRowParts(card).join(' · ')
  const handleKey = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (onOpenTask !== undefined) onOpenTask(card.taskId)
    }
  }
  return (
    <div
      className={active ? 'dswf-tt-item is-open' : 'dswf-tt-item'}
      data-dswf-tt-item={card.taskId}
      {...(onOpenTask !== undefined
        ? { role: 'button', tabIndex: 0, onClick: () => onOpenTask(card.taskId), onKeyDown: handleKey }
        : {})}
    >
      <div className="dswf-tt-row">
        <span className="dswf-tt-key" title={key}>
          {card.localId}
        </span>
        <span className="dswf-tt-title" title={card.title}>
          {card.title}
        </span>
        <Tag tone={taskStatusTagTone(card.taskStatus)} className="dswf-tt-tag">
          {TASK_STATUS_LABELS[card.taskStatus].zh}
        </Tag>
        {hasMenu ? (
          <Menu
            open={menuOpen}
            portal
            side="bottom"
            items={rowMenuItems(card, { onTransition: onTransition !== undefined })}
            selectedId={undefined}
            selection="fill"
            listClassName="dswf-tt-menu"
            onClose={() => {
              onMenuOpenChange(null)
            }}
            onSelect={(id) => {
              onMenuOpenChange(null)
              rowMenuSelect(id, {
                onOpenTask,
                // 转移预设快捷入口——目标态选择归 3.8 对话框（allowedTransitions 所见即所得）
                onTransition:
                  onTransition === undefined
                    ? undefined
                    : (taskId) => {
                        onTransition(taskId)
                      },
              })
            }}
            anchor={
              <Button
                variant="toolbar"
                size="sm"
                className="dswf-tt-more"
                data-dswf-tt-more={card.taskId}
                title="行操作"
                aria-label="行操作"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={(event) => {
                  event.stopPropagation()
                  onMenuOpenChange(menuOpen ? null : card.taskId)
                }}
              >
                ⋯
              </Button>
            }
          />
        ) : null}
      </div>
      <div className="dswf-tt-sub" data-dswf-tt-sub={card.taskId} title={sub}>
        {sub}
      </div>
    </div>
  )
}

export interface ListViewBodyProps {
  /** vis 集（服务端过滤/排序后） */
  readonly cards: readonly TaskCard[]
  /** 抽屉开着的任务（行高亮） */
  readonly activeTaskId?: string
  /** 行点击 → 抽屉回调（缺席 = 静态呈现无 ⋯） */
  readonly onOpenTask?: (taskId: string) => void
  /** 转移入口（⋯ 菜单预设——3.8 对话框开；缺席 = 菜单仅查看详情） */
  readonly onTransition?: (taskId: string) => void
  /** ⋯ 菜单开合（受控——装载壳持有） */
  readonly menuTaskId: string | null
  readonly onMenuOpenChange: (taskId: string | null) => void
}

/** 列表视图纯渲染体（分组标签 + 两行卡列表——静态全相位可测） */
export function ListViewBody({
  cards,
  activeTaskId,
  onOpenTask,
  onTransition,
  menuTaskId,
  onMenuOpenChange,
}: ListViewBodyProps): ReactNode {
  const groups = listGroupsOf(cards)
  return (
    <div className="dswf-tt-list" data-dswf-tt-list="">
      {groups.map((group, index) => (
        <div className="dswf-tt-group" key={group.label ?? `group-${index}`}>
          {group.label !== undefined ? <div className="dswf-tt-group-label">{group.label}</div> : null}
          {group.tasks.map((card) => (
            <TaskItem
              key={card.taskId}
              card={card}
              active={activeTaskId === card.taskId}
              onOpenTask={onOpenTask}
              onTransition={onTransition}
              menuOpen={menuTaskId === card.taskId}
              onMenuOpenChange={onMenuOpenChange}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export interface ListViewProps {
  readonly cards: readonly TaskCard[]
  readonly activeTaskId?: string
  readonly onOpenTask?: (taskId: string) => void
  readonly onTransition?: (taskId: string) => void
}

/** 列表视图装载壳（唯一本地态 = ⋯ 菜单开合任务——单菜单互斥，cards 变更自然失效） */
export function ListView({ cards, activeTaskId, onOpenTask, onTransition }: ListViewProps): ReactNode {
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null)
  return (
    <ListViewBody
      cards={cards}
      activeTaskId={activeTaskId}
      onOpenTask={onOpenTask}
      onTransition={onTransition}
      menuTaskId={menuTaskId}
      onMenuOpenChange={setMenuTaskId}
    />
  )
}
