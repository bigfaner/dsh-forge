// DAG 视图（定位：业务——AC2：SVG 贝塞尔连线 + 箭头 marker[完成边绿] + 节点[状态点 +
// 键 + 标题 + ⏱实际耗时[completed]] + 节点点击 → 抽屉回调）。Hard Rule：SVG 自绘零
// 第三方库——几何/分层归 dag-layout 纯函数；本组件 = 组装面：SVG 边层（defs 双 marker
// + path）+ HTML 节点层（原型同构——绝对定位卡片承载富内容）+ 图例。节点双载体
// （onOpenTask 在场 = 可点 role=button；缺席 = 静态）。
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { TASK_STATUS_LABELS, type TaskCard, type TaskGraph } from '@dsh-forge/contracts'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { STATUS_DOT_STATE } from '../status-chips.js'
import { formatActualDuration, taskKeyLabel } from '../drawer/detail-model.js'
import { dagVisibleSet } from './task-tab-model.js'
import { DAG_NODE_H, DAG_NODE_W, layoutDag } from './dag-layout.js'
import './task-tab.css'

/** 箭头 marker 常量 id（普通 = 边框色；完成 = 绿） */
export const DAG_ARROW_ID = 'dswf-dag-arrow'
export const DAG_ARROW_DONE_ID = 'dswf-dag-arrow-done'

export interface DagViewProps {
  /** vis 集（服务端过滤/排序后——层内序 = 服务端排序序） */
  readonly cards: readonly TaskCard[]
  /** feature 全子图拓扑（taskGraph——边集源） */
  readonly graph: TaskGraph
  /** 节点点击 → 抽屉回调（缺席 = 静态呈现） */
  readonly onOpenTask?: (taskId: string) => void
  /** 抽屉开着的任务（节点高亮） */
  readonly activeTaskId?: string
}

/** DAG 视图（纯渲染体——几何输入纯函数化，静态全相位可测） */
export function DagView({ cards, graph, onOpenTask, activeTaskId }: DagViewProps): ReactNode {
  const vis = dagVisibleSet(cards, graph)
  const layout = layoutDag(vis.nodes, vis.edges)
  const byId = new Map(vis.nodes.map((task) => [task.taskId, task]))

  const handleKey = (task: TaskCard) => (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (onOpenTask !== undefined) onOpenTask(task.taskId)
    }
  }

  return (
    <div className="dswf-tt-dag" data-dswf-tt-dag="">
      <div className="dswf-tt-dagwrap">
        <div
          className="dswf-tt-dagcanvas"
          data-dswf-tt-dagcanvas=""
          style={{ width: `${layout.width}px`, height: `${layout.height}px` }}
        >
          <svg
            className="dswf-tt-dagsvg"
            data-dswf-tt-dagsvg=""
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id={DAG_ARROW_ID}
                viewBox="0 0 8 8"
                refX={7}
                refY={4}
                markerWidth={6}
                markerHeight={6}
                orient="auto"
              >
                <path d="M0 0L8 4L0 8z" className="dswf-tt-arrow" />
              </marker>
              <marker
                id={DAG_ARROW_DONE_ID}
                viewBox="0 0 8 8"
                refX={7}
                refY={4}
                markerWidth={6}
                markerHeight={6}
                orient="auto"
              >
                <path d="M0 0L8 4L0 8z" className="dswf-tt-arrow-done" />
              </marker>
            </defs>
            {layout.edges.map((edge) => (
              <path
                key={`${edge.prerequisiteId}->${edge.taskId}`}
                className={edge.done ? 'dswf-tt-edge is-done' : 'dswf-tt-edge'}
                d={edge.d}
                marker-end={edge.done ? `url(#${DAG_ARROW_DONE_ID})` : `url(#${DAG_ARROW_ID})`}
              />
            ))}
          </svg>
          {layout.nodes.map((node) => {
            const task = byId.get(node.taskId)
            if (task === undefined) return null
            const duration =
              task.taskStatus === 'completed' ? formatActualDuration(task.actualDurationMs) : undefined
            const completed = task.taskStatus === 'completed'
            const cls = [
              'dswf-tt-node',
              completed ? 'is-completed' : '',
              activeTaskId === task.taskId ? 'is-open' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <div
                key={node.taskId}
                className={cls}
                data-dswf-tt-node={task.taskId}
                style={{ left: `${node.x}px`, top: `${node.y}px`, width: `${DAG_NODE_W}px`, height: `${DAG_NODE_H}px` }}
                title={`${taskKeyLabel(task.slug, task.localId)} · ${task.title}`}
                {...(onOpenTask !== undefined
                  ? { role: 'button', tabIndex: 0, onClick: () => onOpenTask(task.taskId), onKeyDown: handleKey(task) }
                  : {})}
              >
                <div className="dswf-tt-node-top">
                  <StateDot
                    state={STATUS_DOT_STATE[task.taskStatus]}
                    size={8}
                    aria-label={TASK_STATUS_LABELS[task.taskStatus].zh}
                  />
                  <span className="dswf-tt-node-key">{task.localId}</span>
                  {task.sourceTask !== undefined ? <span className="dswf-tt-fixchip">fix</span> : null}
                </div>
                <div className="dswf-tt-node-title">{task.title}</div>
                {duration !== undefined ? (
                  <div className="dswf-tt-node-time" data-dswf-tt-node-time={task.taskId}>
                    ⏱ {duration}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      <div className="dswf-tt-daglegend" data-dswf-tt-daglegend="">
        <span>前置在上 · 箭头指向后续</span>
        <span>
          <StateDot state="done" size={8} /> 完成
        </span>
        <span>
          <StateDot state="ongoing" size={8} /> 执行中
        </span>
        <span>
          <StateDot state="error" size={8} /> 阻塞
        </span>
      </div>
    </div>
  )
}
