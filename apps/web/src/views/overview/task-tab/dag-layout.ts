// DAG 布局纯函数（定位：业务——AC2「布局纯函数（分层独立可测）」）。
// 算法参照原型 app.js flowSvg 已验证语义：DFS 灰→灰回边检测 → 回边剔出分层 →
// 最长路径分层（松弛迭代）→ 行主序几何 + 贝塞尔边路径。Hard Rule：SVG/DAG 自绘——
// 零第三方图形/布局库。边语义 = contracts TaskGraphEdge（taskId 依赖 prerequisiteId；
// 前置在上、箭头指向后续）。环防御：core 写动词增量环校验保证无环，但布局对历史
// 漂移数据不炸（回边剔除后分层仍可结算）。
import type { TaskCard, TaskGraphEdge } from '@dsh-forge/contracts'

/** 节点尺寸/间距（原型 renderDag 结构刻度——布局几何非视觉令牌面） */
export const DAG_NODE_W = 170
export const DAG_NODE_H = 64
export const DAG_GAP_X = 14
export const DAG_GAP_Y = 40
export const DAG_PAD = 8
/** 贝塞尔控制臂最小值（原型 my = max(12, (y2-y1)/2)） */
export const DAG_CTRL_MIN = 12

/** 布局节点（ taskId + 层号 + 画布坐标 px） */
export interface DagLayoutNode {
  readonly taskId: string
  readonly layer: number
  readonly x: number
  readonly y: number
}

/** 布局边（前置底中 → 后续顶中贝塞尔路径；done = 前置 completed 绿边标） */
export interface DagLayoutEdge {
  readonly prerequisiteId: string
  readonly taskId: string
  readonly done: boolean
  /** SVG path d 属性 */
  readonly d: string
  /** 回边（环防御剔除面——渲染仍呈现，分层不采用） */
  readonly back: boolean
}

/** 布局产物（画布尺寸 + 节点/边集） */
export interface DagLayout {
  readonly width: number
  readonly height: number
  readonly nodes: readonly DagLayoutNode[]
  readonly edges: readonly DagLayoutEdge[]
}

/** 边键（prerequisite → dependent） */
function edgeKey(prerequisiteId: string, taskId: string): string {
  return `${prerequisiteId}->${taskId}`
}

/**
 * DFS 灰→灰回边检测（flowSvg 同法）：命中入集（键 = `${prereq}->${task}`）。
 * 端点不在节点集的边不参与（可见集过滤后缺端点边）。
 */
export function detectBackEdges(
  taskIds: readonly string[],
  edges: readonly Pick<TaskGraphEdge, 'taskId' | 'prerequisiteId'>[],
): ReadonlySet<string> {
  const nodes = new Set(taskIds)
  const adj = new Map<string, { to: string; key: string }[]>()
  for (const id of taskIds) adj.set(id, [])
  for (const e of edges) {
    if (!nodes.has(e.prerequisiteId) || !nodes.has(e.taskId)) continue
    adj.get(e.prerequisiteId)!.push({ to: e.taskId, key: edgeKey(e.prerequisiteId, e.taskId) })
  }
  const back = new Set<string>()
  const color = new Map<string, 1 | 2>()
  const visit = (u: string): void => {
    color.set(u, 1)
    for (const { to, key } of adj.get(u) ?? []) {
      if (color.get(to) === 1) back.add(key)
      else if (color.get(to) === undefined) visit(to)
    }
    color.set(u, 2)
  }
  for (const id of taskIds) {
    if (color.get(id) === undefined) visit(id)
  }
  return back
}

/**
 * 最长路径分层（flowSvg 同法）：回边剔出后松弛迭代（n 轮上界——DAG 最长路径 ≤ n-1 边）。
 * 层号 = 前置最大层 + 1（无前置 = 0）；缺端点边跳过。
 */
export function layerTaskIds(
  tasks: readonly TaskCard[],
  edges: readonly Pick<TaskGraphEdge, 'taskId' | 'prerequisiteId'>[],
): Readonly<Record<string, number>> {
  const layer: Record<string, number> = {}
  for (const task of tasks) layer[task.taskId] = 0
  const back = detectBackEdges(
    tasks.map((t) => t.taskId),
    edges,
  )
  for (let round = 0; round < tasks.length; round++) {
    let changed = false
    for (const e of edges) {
      if (back.has(edgeKey(e.prerequisiteId, e.taskId))) continue
      const from = layer[e.prerequisiteId]
      const to = layer[e.taskId]
      if (from === undefined || to === undefined) continue
      if (to < from + 1) {
        layer[e.taskId] = from + 1
        changed = true
      }
    }
    if (!changed) break
  }
  return layer
}

/**
 * DAG 全布局（纯函数）：分层 → 行主序坐标（同层按输入序 = 服务端排序序）→ 画布尺寸 →
 * 边路径（前置底中 → 后续顶中三次贝塞尔；完成前置 = done 绿）。
 */
export function layoutDag(tasks: readonly TaskCard[], edges: readonly TaskGraphEdge[]): DagLayout {
  if (tasks.length === 0) {
    return { width: DAG_PAD * 2, height: DAG_PAD * 2, nodes: [], edges: [] }
  }
  const byId = new Map(tasks.map((t) => [t.taskId, t]))
  const layers = layerTaskIds(tasks, edges)
  const back = detectBackEdges(
    tasks.map((t) => t.taskId),
    edges,
  )

  // 行主序：层号 → 该层任务（输入序）
  const rows = new Map<number, TaskCard[]>()
  for (const task of tasks) {
    const layer = layers[task.taskId] ?? 0
    const row = rows.get(layer)
    if (row === undefined) rows.set(layer, [task])
    else row.push(task)
  }
  let maxLayer = 0
  for (const layer of rows.keys()) maxLayer = Math.max(maxLayer, layer)
  let maxPerRow = 1
  const nodes: DagLayoutNode[] = []
  for (const [layer, row] of rows) {
    maxPerRow = Math.max(maxPerRow, row.length)
    for (const [index, task] of row.entries()) {
      nodes.push({
        taskId: task.taskId,
        layer,
        x: DAG_PAD + index * (DAG_NODE_W + DAG_GAP_X),
        y: DAG_PAD + layer * (DAG_NODE_H + DAG_GAP_Y),
      })
    }
  }
  const width = DAG_PAD * 2 + maxPerRow * (DAG_NODE_W + DAG_GAP_X) - DAG_GAP_X
  const height = DAG_PAD * 2 + (maxLayer + 1) * (DAG_NODE_H + DAG_GAP_Y) - DAG_GAP_Y

  const pos = new Map(nodes.map((n) => [n.taskId, n]))
  const layoutEdges: DagLayoutEdge[] = []
  for (const e of edges) {
    const from = pos.get(e.prerequisiteId)
    const to = pos.get(e.taskId)
    if (from === undefined || to === undefined) continue
    const x1 = from.x + DAG_NODE_W / 2
    const y1 = from.y + DAG_NODE_H
    const x2 = to.x + DAG_NODE_W / 2
    const y2 = to.y
    const arm = Math.max(DAG_CTRL_MIN, (y2 - y1) / 2)
    layoutEdges.push({
      prerequisiteId: e.prerequisiteId,
      taskId: e.taskId,
      done: byId.get(e.prerequisiteId)?.taskStatus === 'completed',
      d: `M${x1} ${y1} C${x1} ${y1 + arm}, ${x2} ${y2 - arm}, ${x2} ${y2}`,
      back: back.has(edgeKey(e.prerequisiteId, e.taskId)),
    })
  }
  return { width, height, nodes, edges: layoutEdges }
}
