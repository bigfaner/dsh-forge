// 概览过滤/折叠态模型（定位：业务——UF-1 概览 tab 框架的视图本地态单一来源）。
// 纯函数面（零 RPC / 零 effect）：三子 tab（用户定向顺序 提案|feature|任务）+ 搜索 + 排序 +
// 七态 chips 过滤 + 父行/ov-head 展开态。Hard Rule「搜索过滤服务端承载」：本模型只持有
// 关键词原文与过滤集合，转查询参（searchQueryOf / statusFilterParam）交数据层透传——
// 前端禁全量拉取本地过滤。排序同为服务端参（sort: 'active'|'created'——活跃优先权重
// 归 core，见 small-domains list-utils sortByActiveThenCreated）。
// 切换语义（AC3）：子 tab 切换 = 清空搜索 + 清空 chips + 收起全部展开态
// （ov-head 展开态跨子 tab 保持——路径详情与内容区正交）。
import {
  TASK_STATUSES,
  type FeatureCard,
  type TaskStatus,
} from '@dsh-forge/contracts'

/** 三子 tab（用户定向顺序：提案 | feature | 任务——ui-design UF-1 结构注记） */
export const OVERVIEW_SUBTABS = [
  { value: 'proposals', label: '提案' },
  { value: 'features', label: 'feature' },
  { value: 'tasks', label: '任务' },
] as const

export type OverviewSubtab = (typeof OVERVIEW_SUBTABS)[number]['value']

/** 排序模式（contracts ListTasksQuery/ListFeaturesQuery/ListProposalsQuery 同构参） */
export type OverviewSort = 'active' | 'created'

/** 排序 pill 标签（ui-design §排序：⇅ 活跃优先 / ⇅ 最新创建） */
export const OVERVIEW_SORT_LABELS: Readonly<Record<OverviewSort, string>> = {
  active: '活跃优先',
  created: '最新创建',
}

/** 概览视图本地态（hook 单一来源——组件均为受控件） */
export interface OverviewFilterState {
  readonly subtab: OverviewSubtab
  /** 搜索关键词原文（受控输入值；服务端过滤参经 searchQueryOf 归一） */
  readonly search: string
  readonly sort: OverviewSort
  /** 七态 chips 激活集（空 = 全部；statusFilterParam 转白名单参） */
  readonly activeStatuses: ReadonlySet<TaskStatus>
  /** 父行展开键集（prop:{id} / feat:{slug}——多开并存） */
  readonly openRows: ReadonlySet<string>
  /** ov-head 展开（默认 false——AC1 折叠） */
  readonly headOpen: boolean
}

/** 初始态（默认子 tab = 提案——用户定向顺序首位；排序默认活跃优先；ov-head 默认折叠） */
export function initialOverviewFilter(): OverviewFilterState {
  return {
    subtab: 'proposals',
    search: '',
    sort: 'active',
    activeStatuses: new Set<TaskStatus>(),
    openRows: new Set<string>(),
    headOpen: false,
  }
}

/** 子 tab 切换（AC3）：清空搜索 + 清空 chips + 收起全部展开态；同值原样返回（零重渲） */
export function switchSubtab(state: OverviewFilterState, subtab: OverviewSubtab): OverviewFilterState {
  if (state.subtab === subtab) return state
  return { ...state, subtab, search: '', activeStatuses: new Set(), openRows: new Set() }
}

/** 排序 pill 切换：活跃优先 ↔ 最新创建 */
export function nextSort(sort: OverviewSort): OverviewSort {
  return sort === 'active' ? 'created' : 'active'
}

/** 搜索参归一（Hard Rule 服务端承载）：trim 后非空 = 原样透传，空 = undefined（不带参） */
export function searchQueryOf(text: string): string | undefined {
  const trimmed = text.trim()
  return trimmed === '' ? undefined : trimmed
}

/** 搜索框占位文案（原型 ov-q placeholder 逐子 tab 口径） */
export function searchPlaceholderOf(subtab: OverviewSubtab): string {
  if (subtab === 'tasks') return '搜索标题/类型/状态(中英)…'
  if (subtab === 'features') return '搜索 feature/文档…'
  return '搜索提案/slug/状态…'
}

/** chip 禁用判据（AC5）：0 计数 disabled（不可点出空态） */
export function isChipDisabled(count: number): boolean {
  return count <= 0
}

/** chips toggle（纯集合翻转；0 计数禁用归组件按钮层——模型不携带计数） */
export function toggleStatusFilter(state: OverviewFilterState, status: TaskStatus): OverviewFilterState {
  const next = new Set(state.activeStatuses)
  if (next.has(status)) next.delete(status)
  else next.add(status)
  return { ...state, activeStatuses: next }
}

/** chips 全清（st-clear 交互） */
export function clearStatusFilter(state: OverviewFilterState): OverviewFilterState {
  return { ...state, activeStatuses: new Set() }
}

/** chips → 服务端 statusFilter 参（白名单序 = contracts TASK_STATUSES 行序；空集 = 全部） */
export function statusFilterParam(active: ReadonlySet<TaskStatus>): TaskStatus[] {
  return TASK_STATUSES.filter((status) => active.has(status))
}

/** chips 过滤在场判据（清过滤入口显隐） */
export function hasActiveStatusFilter(active: ReadonlySet<TaskStatus>): boolean {
  return active.size > 0
}

/** 父行展开键（提案行——prop:{proposalId}，原型 key 方案） */
export function proposalRowKey(proposalId: string): string {
  return `prop:${proposalId}`
}

/** 父行展开键（feature 行——feat:{slug}） */
export function featureRowKey(slug: string): string {
  return `feat:${slug}`
}

/** 父行展开 toggle（多开并存——集合翻转，不影响他行） */
export function toggleOpenRow(state: OverviewFilterState, key: string): OverviewFilterState {
  const next = new Set(state.openRows)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return { ...state, openRows: next }
}

/** ov-head 折叠 toggle */
export function toggleHead(state: OverviewFilterState): OverviewFilterState {
  return { ...state, headOpen: !state.headOpen }
}

/** 活跃 feature 判据（非终态优先，否则首行；空集 = undefined）——ov-head 摘要首位 */
export function activeFeatureSlug(features: readonly FeatureCard[]): string | undefined {
  const active = features.find((f) => f.featureStatus !== 'completed' && f.featureStatus !== 'archived')
  if (active !== undefined) return active.slug
  return features[0]?.slug
}

/** ov-head 状态摘要行（ui-design：「feature · N 会话 · N 完成」；会话计数 = 4.1 装配注入位） */
export function overviewHeadSummary(input: {
  readonly activeFeature?: string
  readonly sessionCount?: number
  readonly completedCount: number
}): string {
  const parts: string[] = [input.activeFeature ?? '—']
  if (input.sessionCount !== undefined) parts.push(`${input.sessionCount} 会话`)
  parts.push(`${input.completedCount} 完成`)
  return parts.join(' · ')
}
