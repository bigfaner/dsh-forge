// 概览 tab 框架（定位：业务——UF-1 概览 dock tab body：ov-head 折叠头 + sticky 区
// [三子 tab + 搜索 + 排序] + 子 tab 内容接线）。UF-1 placement = 右栏官方 ui-dockkit tab
// ——注册集成在 4.1（本组件 = tab 体，真实 rpc client 由 4.1 经 makeClient 注入）。
// 分层：OverviewFrame = 纯呈现帧（结构静态可测）；OverviewTab = 状态 + 装载胶水
// （filter 本地态单一来源 + useOverviewLoad 两路装载 + retry nonce）。
// 三签不动（Hard Rule）：本目录零左栏/中区/conversation.view 改动——纯右栏 tab 体。
// 排序/过滤为视图本地态（任务子 tab 三视图 = renderTasksTab 槽——3.6 注入；缺省呈现
// chips 过滤接口）；文档行点击经 props 回调上抛（dock 开 tab——4.1 接线）。
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { FeatureCard, TaskStatus, TaskStats } from '@dsh-forge/contracts'
import { preloadRpcClientFactory, type RpcClientFactory } from '../../rpc/index.js'
import { ErrorBar, SkeletonRows } from '../../components/index.js'
import {
  activeFeatureSlug,
  clearStatusFilter,
  initialOverviewFilter,
  nextSort,
  overviewHeadSummary,
  searchQueryOf,
  statusFilterParam,
  switchSubtab,
  toggleHead,
  toggleOpenRow,
  toggleStatusFilter,
  type OverviewFilterState,
  type OverviewSort,
  type OverviewSubtab,
} from './overview-model.js'
import {
  overviewHeadRows,
  useOverviewLoad,
  type OverviewErrorInfo,
  type OverviewHeadBundle,
  type OverviewListData,
} from './overview-data.js'
import { OverviewHead } from './ov-head.js'
import { StickyBar } from './sticky-bar.js'
import { StatusChips } from './status-chips.js'
import { ProposalsTab } from './proposal-tab.js'
import { FeaturesTab } from './feature-tab.js'
import './overview.css'

/** 任务子 tab 装载槽上下文（3.6 三视图消费——过滤接口三视图统一） */
export interface OverviewTasksContext {
  readonly projectId: string
  /** 搜索关键词原文（服务端过滤参归一归消费方） */
  readonly search: string
  readonly sort: OverviewSort
  /** chips 激活集（三视图统一过滤态） */
  readonly activeStatuses: ReadonlySet<TaskStatus>
  /** statusFilter 查询参（TASK_STATUSES 行序白名单；空 = 全部） */
  readonly statusFilter: readonly TaskStatus[]
  /** 七态计数（tasks.stats——chips 计数单源） */
  readonly stats: TaskStats | undefined
  /** 无参 feature 列（feature pill 数据源——不随搜索漂移） */
  readonly features: readonly FeatureCard[]
  readonly onToggleStatus: (status: TaskStatus) => void
  readonly onClearStatuses: () => void
}

export interface OverviewFrameProps {
  readonly projectId: string
  /** 头路信息束（缺席 = 首装在途，ov-head 不渲染） */
  readonly head: OverviewHeadBundle | undefined
  /** 子 tab 列数据（tagged；tasks 子 tab 无列装载） */
  readonly list: OverviewListData | undefined
  readonly phase: 'loading' | 'ready' | 'error'
  /** 列路在途（内容保持可见的不阻塞标注） */
  readonly busy: boolean
  readonly error: OverviewErrorInfo | undefined
  /** 视图本地态（受控注入——OverviewTab 单一来源） */
  readonly filter: OverviewFilterState
  /** ov-head 摘要会话计数（4.1 装配注入——sessions/workspaces 账本快照；缺席省略段） */
  readonly sessionCount?: number
  readonly onSubtabChange: (subtab: OverviewSubtab) => void
  readonly onSearchChange: (search: string) => void
  readonly onSortToggle: () => void
  readonly onToggleStatus: (status: TaskStatus) => void
  readonly onClearStatuses: () => void
  readonly onToggleRow: (key: string) => void
  readonly onToggleHead: () => void
  /** 重试（头路 + 列路全量重装载） */
  readonly onRetry: () => void
  /** 文档行点击（dock 开 tab——4.1 接线；缺席 = 无动作面） */
  readonly onOpenDoc?: (docRel: string) => void
  /** 任务子 tab 三视图装载槽（3.6 注入；缺省 = chips 过滤接口独占呈现） */
  readonly renderTasksTab?: (ctx: OverviewTasksContext) => ReactNode
  /** 相对时间基准（缺省 Date.now()——测试注入固定值） */
  readonly now?: number
}

/** 概览纯呈现帧（结构静态可测——ov-head + sticky + 内容区分派） */
export function OverviewFrame({
  projectId,
  head,
  list,
  phase,
  busy,
  error,
  filter,
  sessionCount,
  onSubtabChange,
  onSearchChange,
  onSortToggle,
  onToggleStatus,
  onClearStatuses,
  onToggleRow,
  onToggleHead,
  onRetry,
  onOpenDoc,
  renderTasksTab,
  now,
}: OverviewFrameProps): ReactNode {
  const openDoc = onOpenDoc ?? (() => {})
  const searchActive = searchQueryOf(filter.search) !== undefined
  const tasksCtx: OverviewTasksContext = {
    projectId,
    search: filter.search,
    sort: filter.sort,
    activeStatuses: filter.activeStatuses,
    statusFilter: statusFilterParam(filter.activeStatuses),
    stats: head?.stats,
    features: head?.features ?? [],
    onToggleStatus,
    onClearStatuses,
  }

  // 内容区分派（纯函数面）：tasks = 槽/chips；首装 = 骨架；错误无旧内容 = 错误条；
  // 有内容 = （列路错误条）+ 列表（旧行保持——缓存先行）
  let content: ReactNode
  if (filter.subtab === 'tasks') {
    content =
      renderTasksTab !== undefined ? (
        renderTasksTab(tasksCtx)
      ) : (
        <StatusChips counts={head?.stats.byStatus ?? emptyCounts()} active={filter.activeStatuses} onToggle={onToggleStatus} onClear={onClearStatuses} />
      )
  } else if (list === undefined && phase !== 'error') {
    content = <SkeletonRows className="dswf-ov-skeleton" rowClassName="dswf-ov-skeleton-row" rows={6} anchor="data-dswf-ov-skeleton" />
  } else if (list === undefined) {
    content = (
      <ErrorBar className="dswf-ov-error" message={`概览装载失败：${error?.message ?? ''}`} retryClassName="dswf-ov-retry" onRetry={onRetry} anchor="data-dswf-ov-error" retryAnchor="data-dswf-ov-retry" />
    )
  } else if (filter.subtab === 'proposals' && list.kind === 'proposals') {
    content = (
      <>
        {listErrorBar(error, onRetry)}
        <ProposalsTab
          proposals={list.proposals}
          features={head?.features ?? []}
          openRows={filter.openRows}
          onToggleRow={onToggleRow}
          onOpenDoc={openDoc}
          emptyTitle={searchActive ? `无匹配「${filter.search.trim()}」的提案` : undefined}
          now={now}
        />
      </>
    )
  } else {
    content = (
      <>
        {listErrorBar(error, onRetry)}
        <FeaturesTab
          features={list.kind === 'features' ? list.features : []}
          proposals={list.kind === 'features' ? list.proposals : []}
          openRows={filter.openRows}
          onToggleRow={onToggleRow}
          onOpenDoc={openDoc}
          emptyTitle={searchActive ? `无匹配「${filter.search.trim()}」的 feature` : undefined}
          now={now}
        />
      </>
    )
  }

  return (
    <div className="dswf-ov-panel" data-dswf-ov-panel="">
      {error !== undefined && error.uiState === 'banner' ? (
        <ErrorBar
          className="dswf-ov-banner"
          message={`工作区不可用：${error.message}`}
          retryClassName="dswf-ov-retry"
          onRetry={onRetry}
          anchor="data-dswf-ov-banner"
          retryAnchor="data-dswf-ov-retry"
        />
      ) : null}
      {head === undefined ? null : (
        <OverviewHead
          projectName={head.projectName}
          summary={overviewHeadSummary({
            activeFeature: activeFeatureSlug(head.features),
            sessionCount,
            completedCount: head.stats.byStatus.completed ?? 0,
          })}
          rows={overviewHeadRows(head)}
          open={filter.headOpen}
          onToggle={onToggleHead}
        />
      )}
      <StickyBar
        subtab={filter.subtab}
        onSubtabChange={onSubtabChange}
        search={filter.search}
        onSearchChange={onSearchChange}
        sort={filter.sort}
        onSortToggle={onSortToggle}
      />
      <div className="dswf-ov-content" data-dswf-ov-content="" aria-busy={busy}>
        {content}
      </div>
    </div>
  )
}

/** 列路错误条（非横幅错误且旧行在场——失败可重试，内容保持） */
function listErrorBar(error: OverviewErrorInfo | undefined, onRetry: () => void): ReactNode {
  if (error === undefined || error.uiState === 'banner') return null
  return (
    <ErrorBar
      className="dswf-ov-error"
      message={`列表装载失败：${error.message}`}
      retryClassName="dswf-ov-retry"
      onRetry={onRetry}
      anchor="data-dswf-ov-error"
      retryAnchor="data-dswf-ov-retry"
    />
  )
}

/** 空计数（stats 缺席时 chips 全 0 = 全禁用——首装在途不可点出空态） */
function emptyCounts(): Record<TaskStatus, number> {
  return {
    pending: 0,
    in_progress: 0,
    completed: 0,
    blocked: 0,
    suspended: 0,
    skipped: 0,
    rejected: 0,
  }
}

export interface OverviewTabProps {
  /** 当前项目（4.1 ShellHost 锚定注入——knowledge-anchor 裁决） */
  readonly projectId: string
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面——rpc 经 mock 注入） */
  readonly makeClient?: RpcClientFactory
  /** ov-head 摘要会话计数（4.1 装配注入） */
  readonly sessionCount?: number
  /** 文档行点击（dock 开 tab——4.1 接线） */
  readonly onOpenDoc?: (docRel: string) => void
  /** 任务子 tab 三视图装载槽（3.6 注入） */
  readonly renderTasksTab?: (ctx: OverviewTasksContext) => ReactNode
  /** 任务聚焦 nonce（4.2 pill 点击——变更即切任务子 tab；switchSubtab 语义 = 清搜索/清 chips/收展开） */
  readonly focusTasksNonce?: number
  /** 相对时间基准（缺省 Date.now()——测试注入固定值） */
  readonly now?: number
}

/** 概览 tab body（状态 + 装载胶水——filter 本地态单一来源；effect 编排归 useOverviewLoad） */
export function OverviewTab({
  projectId,
  makeClient = preloadRpcClientFactory,
  sessionCount,
  onOpenDoc,
  renderTasksTab,
  focusTasksNonce,
  now,
}: OverviewTabProps): ReactNode {
  // 初始态（4.2）：挂载即带任务聚焦（pill 点击 → dock 首开概览 tab）= 任务子 tab 起步；
  // 否则提案子 tab 缺省（用户定向顺序首位）
  const [filter, setFilter] = useState<OverviewFilterState>(() =>
    focusTasksNonce === undefined ? initialOverviewFilter() : switchSubtab(initialOverviewFilter(), 'tasks'),
  )
  const [nonce, setNonce] = useState(0)
  const load = useOverviewLoad(projectId, filter.subtab, filter.search, filter.sort, nonce, makeClient)

  // 任务聚焦子 tab 切换（4.2 pill 点击链尾）：nonce 变更（已开概览后的后续点击）→
  // switchSubtab('tasks')（清搜索/清 chips/收展开——子 tab 切换语义同源；同值原样返回零重渲）
  useEffect(() => {
    if (focusTasksNonce === undefined) return
    setFilter((prev) => switchSubtab(prev, 'tasks'))
  }, [focusTasksNonce])

  const handleSubtabChange = useCallback((subtab: OverviewSubtab): void => {
    setFilter((prev) => switchSubtab(prev, subtab))
  }, [])
  const handleSearchChange = useCallback((search: string): void => {
    setFilter((prev) => ({ ...prev, search }))
  }, [])
  const handleSortToggle = useCallback((): void => {
    setFilter((prev) => ({ ...prev, sort: nextSort(prev.sort) }))
  }, [])
  const handleToggleStatus = useCallback((status: TaskStatus): void => {
    setFilter((prev) => toggleStatusFilter(prev, status))
  }, [])
  const handleClearStatuses = useCallback((): void => {
    setFilter((prev) => clearStatusFilter(prev))
  }, [])
  const handleToggleRow = useCallback((key: string): void => {
    setFilter((prev) => toggleOpenRow(prev, key))
  }, [])
  const handleToggleHead = useCallback((): void => {
    setFilter((prev) => toggleHead(prev))
  }, [])
  const handleRetry = useCallback((): void => {
    setNonce((n) => n + 1)
  }, [])

  return (
    <OverviewFrame
      projectId={projectId}
      head={load.head}
      list={load.list}
      phase={load.phase}
      busy={load.busy}
      error={load.error}
      filter={filter}
      sessionCount={sessionCount}
      onSubtabChange={handleSubtabChange}
      onSearchChange={handleSearchChange}
      onSortToggle={handleSortToggle}
      onToggleStatus={handleToggleStatus}
      onClearStatuses={handleClearStatuses}
      onToggleRow={handleToggleRow}
      onToggleHead={handleToggleHead}
      onRetry={handleRetry}
      onOpenDoc={onOpenDoc}
      renderTasksTab={renderTasksTab}
      now={now}
    />
  )
}
