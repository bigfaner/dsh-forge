// 任务子 tab 纯模型（定位：业务——三视图共用投影：副行承重字段/列表分组/计数注记/
// DAG 可见集/泳道列/状态 tag tone/feature 解析/空态分派）。
// chips 过滤三视图统一（AC4）的数据面：tasks.list（服务端 statusFilter+search+sort）
// 结果 = 三视图共同 vis 集单源；DAG 的边集由 taskGraph 补充（graph 查询无过滤参——
// 全子图拓扑 + vis 集客户端交集，原型 vis 层同语义）。视图本地零 RPC 零 effect。
import {
  FEATURE_STATUS_LABELS,
  TASK_STATUSES,
  type FeatureCard,
  type TaskCard,
  type TaskGraph,
  type TaskGraphEdge,
  type TaskStatus,
} from '@dsh-forge/contracts'
import { activeFeatureSlug } from '../overview-model.js'
import { formatActualDuration } from '../drawer/detail-model.js'

/** 三视图 seg 词汇（列表|DAG|泳道——ui-design UF-1 ov-taskbar） */
export const TASK_VIEWS = [
  { value: 'list', label: '列表' },
  { value: 'dag', label: 'DAG' },
  { value: 'swim', label: '泳道' },
] as const

export type TaskViewMode = (typeof TASK_VIEWS)[number]['value']

/** 副行承重字段投影（AC1：类型/优先级/实际耗时[completed]/前置/挂接/fix 源标——缺省逐项省略） */
export function taskSubRowParts(card: TaskCard): readonly string[] {
  const parts: string[] = [card.taskType]
  if (card.priority !== undefined) parts.push(card.priority)
  if (card.taskStatus === 'completed') {
    const duration = formatActualDuration(card.actualDurationMs)
    if (duration !== undefined) parts.push(`实际耗时 ${duration}`)
  }
  if (card.prerequisites.length > 0) parts.push(`←${card.prerequisites.length} 前置`)
  if (card.sessionCount > 0) parts.push(`⟞${card.sessionCount} 挂接`)
  if (card.sourceTask !== undefined) parts.push(`fix→${card.sourceTask.localId}`)
  return parts
}

/** 列表分组（原型列表视图：执行中 = in_progress|blocked 前置组；其余组仅两组均在时标注） */
export interface TaskListGroup {
  readonly label: string | undefined
  readonly tasks: readonly TaskCard[]
}

export function listGroupsOf(cards: readonly TaskCard[]): readonly TaskListGroup[] {
  const running = cards.filter((t) => t.taskStatus === 'in_progress' || t.taskStatus === 'blocked')
  const rest = cards.filter((t) => t.taskStatus !== 'in_progress' && t.taskStatus !== 'blocked')
  if (running.length === 0) return [{ label: undefined, tasks: rest }]
  if (rest.length === 0) return [{ label: undefined, tasks: running }]
  return [
    { label: `执行中（${running.length}）`, tasks: running },
    { label: '其余', tasks: rest },
  ]
}

/** 计数注记（原型 task-count-note：搜索在场 = 匹配/总数；否则 = N 条） */
export function taskCountNote(searchActive: boolean, matched: number, total: number): string {
  return searchActive ? `${matched}/${total}` : `${total} 条`
}

/** DAG 可见集（AC4 统一过滤）：节点 = graph.tasks ∩ list 结果（list 序 = 服务端排序序）；边 = 两端均可见 */
export function dagVisibleSet(
  cards: readonly TaskCard[],
  graph: TaskGraph | undefined,
): { readonly nodes: readonly TaskCard[]; readonly edges: readonly TaskGraphEdge[] } {
  if (graph === undefined) return { nodes: cards, edges: [] }
  const visible = new Set(cards.map((t) => t.taskId))
  const byId = new Map(graph.tasks.map((t) => [t.taskId, t]))
  const nodes = cards.flatMap((card) => {
    const enriched = byId.get(card.taskId)
    // graph.tasks 为 feature 全集（含实际耗时等卡片字段同源）；list 卡缺省回退原卡
    return enriched === undefined ? [card] : [enriched]
  })
  const edges = graph.edges.filter((e) => visible.has(e.taskId) && visible.has(e.prerequisiteId))
  return { nodes, edges }
}

/** 泳道列投影（AC3：七态行序——TASK_STATUSES 单源；0 计数列 = 空卡列，折叠归组件） */
export interface SwimColumn {
  readonly status: TaskStatus
  readonly cards: readonly TaskCard[]
}

export function swimColumnsOf(cards: readonly TaskCard[]): readonly SwimColumn[] {
  return TASK_STATUSES.map((status) => ({
    status,
    cards: cards.filter((t) => t.taskStatus === status),
  }))
}

/** 状态 tag 官方 tone 映射（completed=success / blocked·rejected=danger / 其余 neutral） */
export function taskStatusTagTone(status: TaskStatus): 'success' | 'danger' | 'neutral' {
  if (status === 'completed') return 'success'
  if (status === 'blocked' || status === 'rejected') return 'danger'
  return 'neutral'
}

/** feature 解析（AC5：显式注入优先——pill 导航载荷；否则活跃 feature 缺省） */
export function resolveFeatureSlug(features: readonly FeatureCard[], explicit: string | undefined): string | undefined {
  if (explicit !== undefined) return explicit
  return activeFeatureSlug(features)
}

/** feature 完成比 chip 文案（feature 卡 byStatus 聚合——menu 行源；pill 用任务域 stats 单源） */
export function featureRatioLabel(feature: FeatureCard): string {
  const total = TASK_STATUSES.reduce((sum, status) => sum + (feature.byStatus[status] ?? 0), 0)
  const done = feature.byStatus.completed ?? 0
  return `${FEATURE_STATUS_LABELS[feature.featureStatus].zh} ${done}/${total}`
}

/** 空态视图（三分派：feature 总数 0 / 搜索无匹配 / 过滤组合空；有卡 = undefined 非空） */
export interface TasksEmptyInput {
  readonly cards: readonly TaskCard[]
  /** feature 域任务总数（stats.total——0 = 本 feature 无任务） */
  readonly total: number
  readonly searchActive: boolean
  readonly search: string
  readonly hasStatusFilter: boolean
}

export function tasksEmptyView(input: TasksEmptyInput): { readonly title: string; readonly description?: string } | undefined {
  if (input.cards.length > 0) return undefined
  if (input.total === 0) {
    return { title: '本 feature 暂无任务', description: '任务由 run-tasks 派发 / add_task 产生' }
  }
  if (input.searchActive) {
    return { title: `无匹配「${input.search.trim()}」的任务` }
  }
  if (input.hasStatusFilter) {
    return { title: '当前过滤组合无任务' }
  }
  return undefined
}
