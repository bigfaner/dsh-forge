// 概览 tab 框架（定位：业务——UF-1 概览 dock tab body：ov-head 折叠头 + sticky 区
// [三子 tab + 搜索 + 排序] + 子 tab 内容接线）。UF-1 placement = 右栏官方 ui-dockkit tab
// ——注册集成在 4.1（本组件 = tab 体，真实 rpc client 由 4.1 经 makeClient 注入）。
// 分层：OverviewFrame = 纯呈现帧（结构静态可测）；OverviewTab = 状态 + 装载胶水
// （filter 本地态单一来源 + useOverviewLoad 两路装载 + retry nonce）。
// 三签不动（Hard Rule）：本目录零左栏/中区/conversation.view 改动——纯右栏 tab 体。
// 排序/过滤为视图本地态（任务子 tab 三视图 = renderTasksTab 槽——3.6 注入；缺省呈现
// chips 过滤接口）；文档行点击经 props 回调上抛（dock 开 tab——4.1 接线）。
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { FeatureCard, ProposalStatus, FeatureStatus, ProposalCard, TaskStatus, TaskStats } from '@dsh-forge/contracts'
import { preloadRpcClientFactory, type RpcClientFactory } from '../../rpc/index.js'
import { ErrorBar, SkeletonRows } from '../../components/index.js'
import {
  OVERVIEW_WIDTH_DEFAULT,
  activeFeatureSlug,
  clearPhaseFilter,
  clearProposalStatusFilter,
  clearStatusFilter,
  clampOverviewWidth,
  initialOverviewFilter,
  nextSort,
  overviewHeadSummary,
  overviewWidthFromDrag,
  proposalRowKey,
  searchQueryOf,
  statusFilterParam,
  switchSubtab,
  toggleHead,
  toggleOpenRow,
  togglePhaseFilter,
  toggleProposalStatusFilter,
  toggleStatusFilter,
  type OverviewFilterState,
  type OverviewSort,
  type OverviewSubtab,
} from './overview-model.js'
import {
  overviewHeadRows,
  useOverviewLoad,
  useProposalDocs,
  type OverviewErrorInfo,
  type OverviewHeadBundle,
  type OverviewListData,
} from './overview-data.js'
import { docsRootOf, type SessionOpenRequest } from './message-format.js'
import { proposalStatusCounts } from './proposal-tab/ProposalStatusChips.js'
import { phaseCounts } from './feature-tab/PhaseChips.js'
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
  /** 无参提案列（4.6 容器 pill 双轨突击源——taskCount>0 判据；不随搜索漂移） */
  readonly proposals: readonly ProposalCard[]
  /** @ 锚文档根（帧内以 head 项目行推导填充——docsRootOf(ws, forge)；head 缺席 = 键缺席，
   *  消费方回退 `docs` 缺省锚——消息内 @ 引用按会话工作区根解析需真实文档根前缀） */
  readonly docsRoot?: string
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
  /** 面板宽度（4.6 UF-3 · Integration #6：默认 560px + 左缘拖拽——受控注入） */
  readonly width: number
  readonly onSubtabChange: (subtab: OverviewSubtab) => void
  readonly onSearchChange: (search: string) => void
  readonly onSortToggle: () => void
  readonly onToggleStatus: (status: TaskStatus) => void
  readonly onClearStatuses: () => void
  /** 提案五态 chips toggle/清空（4.6 UF-1——受控归帧侧模型） */
  readonly onToggleProposalStatus: (status: ProposalStatus) => void
  readonly onClearProposalStatuses: () => void
  /** feature 阶段 chips toggle/清空（4.6 UF-4——受控归帧侧模型） */
  readonly onTogglePhase: (phase: FeatureStatus) => void
  readonly onClearPhases: () => void
  readonly onToggleRow: (key: string) => void
  readonly onToggleHead: () => void
  /** 重试（头路 + 列路全量重装载） */
  readonly onRetry: () => void
  /** 左缘拖拽调宽（指针即左缘——clientX/viewportWidth 由帧内取 window） */
  readonly onDragWidth: (clientX: number, viewportWidth: number) => void
  /** 双击左缘复位默认宽（560px） */
  readonly onResetWidth: () => void
  /** 文档行点击（dock 开 tab——4.1 接线；缺席 = 无动作面） */
  readonly onOpenDoc?: (docRel: string) => void
  /** 任务子 tab 三视图装载槽（3.6 注入；缺省 = chips 过滤接口独占呈现） */
  readonly renderTasksTab?: (ctx: OverviewTasksContext) => ReactNode
  /** 打开新会话通道（4.6：提案/feature 行头预填——装配注入 openSessionWithPreset；缺席 = 按钮不呈现） */
  readonly onStartSession?: (request: SessionOpenRequest) => void
  /** 相对时间基准（缺省 Date.now()——测试注入固定值） */
  readonly now?: number
}

/** 概览纯呈现帧（结构静态可测——ov-head + sticky + 内容区分派 + 左缘拖拽调宽容器） */
export function OverviewFrame({
  projectId,
  head,
  list,
  phase,
  busy,
  error,
  filter,
  sessionCount,
  width,
  onSubtabChange,
  onSearchChange,
  onSortToggle,
  onToggleStatus,
  onClearStatuses,
  onToggleProposalStatus,
  onClearProposalStatuses,
  onTogglePhase,
  onClearPhases,
  onToggleRow,
  onToggleHead,
  onRetry,
  onDragWidth,
  onResetWidth,
  onOpenDoc,
  renderTasksTab,
  onStartSession,
  now,
}: OverviewFrameProps): ReactNode {
  const openDoc = onOpenDoc ?? (() => {})
  const searchActive = searchQueryOf(filter.search) !== undefined
  // @ 锚文档根（数据驱动）：head 在场 = 项目行（workspaceDir/forgeDir）推导；缺席 = 不注入
  //（四通道消费方回退 `docs` 缺省锚——首装在途不误锚）
  const docsRoot = head === undefined ? undefined : docsRootOf(head.workspaceDir, head.forgeDir)
  const tasksCtx: OverviewTasksContext = {
    projectId,
    search: filter.search,
    sort: filter.sort,
    activeStatuses: filter.activeStatuses,
    statusFilter: statusFilterParam(filter.activeStatuses),
    stats: head?.stats,
    features: head?.features ?? [],
    proposals: head?.proposals ?? [],
    ...(docsRoot !== undefined ? { docsRoot } : {}),
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
        <ProposalsTabBodySlot
          projectId={projectId}
          head={head}
          list={list}
          filter={filter}
          searchActive={searchActive}
          docsRoot={docsRoot}
          onToggleRow={onToggleRow}
          onToggleProposalStatus={onToggleProposalStatus}
          onClearProposalStatuses={onClearProposalStatuses}
          onOpenDoc={openDoc}
          onStartSession={onStartSession}
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
          docs={list.kind === 'features' ? list.docs : undefined}
          counts={head === undefined ? emptyPhaseCounts() : phaseCounts(head.features)}
          activePhases={filter.activePhases}
          onTogglePhase={onTogglePhase}
          {...(onClearPhases !== undefined ? { onClearPhases } : {})}
          openRows={filter.openRows}
          onToggleRow={onToggleRow}
          onOpenDoc={openDoc}
          {...(onStartSession !== undefined ? { onStartSession } : {})}
          {...(docsRoot !== undefined ? { docsRoot } : {})}
          emptyTitle={searchActive ? `无匹配「${filter.search.trim()}」的 feature` : undefined}
          now={now}
        />
      </>
    )
  }

  return (
    <div className="dswf-ov-wrap" data-dswf-ov-wrap="">
      <div
        className="dswf-ov-resize"
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        aria-label="拖动调整概览宽度"
        title="拖动调宽 · 双击复位"
        data-dswf-ov-resize=""
        onDoubleClick={() => {
          onResetWidth()
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if ((event.buttons & 1) === 0) return // 仅主键按住拖拽（悬停移动不触发）
          onDragWidth(event.clientX, window.innerWidth)
        }}
      />
      <div className="dswf-ov-panel" data-dswf-ov-panel="" style={{ width: `${clampOverviewWidth(width)}px` }}>
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
    </div>
  )
}

/**
 * 提案子 tab 装载位（帧内拆件——docsMap 按需装载归帧壳 useProposalDocs，对话框开合归
 * ProposalsTab 装载壳）：openRows → 展开 slug 投影（prop:{id} → slug）驱动文档重拉。
 */
function ProposalsTabBodySlot({
  projectId,
  head,
  list,
  filter,
  searchActive,
  docsRoot,
  onToggleRow,
  onToggleProposalStatus,
  onClearProposalStatuses,
  onOpenDoc,
  onStartSession,
  now,
}: {
  readonly projectId: string
  readonly head: OverviewHeadBundle | undefined
  readonly list: Extract<OverviewListData, { kind: 'proposals' }>
  readonly filter: OverviewFilterState
  readonly searchActive: boolean
  /** @ 锚文档根（帧内 head 推导；缺席 = ProposalsTab 回退 `docs` 缺省锚） */
  readonly docsRoot?: string
  readonly onToggleRow: (key: string) => void
  readonly onToggleProposalStatus: (status: ProposalStatus) => void
  readonly onClearProposalStatuses: () => void
  readonly onOpenDoc: (docRel: string) => void
  readonly onStartSession?: (request: SessionOpenRequest) => void
  readonly now?: number
}): ReactNode {
  const openSlugs = list.proposals.filter((p) => filter.openRows.has(proposalRowKey(p.proposalId))).map((p) => p.slug)
  const docsMap = useProposalDocs(projectId, openSlugs)
  return (
    <ProposalsTab
      projectId={projectId}
      proposals={list.proposals}
      counts={head === undefined ? emptyProposalCounts() : proposalStatusCounts(head.proposals)}
      activeStatuses={filter.activeProposalStatuses}
      onToggleStatus={onToggleProposalStatus}
      onClearStatuses={onClearProposalStatuses}
      features={head?.features ?? []}
      openRows={filter.openRows}
      onToggleRow={onToggleRow}
      docsMap={docsMap}
      onOpenDoc={onOpenDoc}
      {...(onStartSession !== undefined ? { onStartSession } : {})}
      {...(docsRoot !== undefined ? { docsRoot } : {})}
      emptyTitle={searchActive ? `无匹配「${filter.search.trim()}」的提案` : undefined}
      {...(now !== undefined ? { now } : {})}
    />
  )
}

/** 空提案计数（head 缺席 = chips 全 0 全禁用——首装在途不可点出空态） */
function emptyProposalCounts(): Record<ProposalStatus, number> {
  return { draft: 0, 'under-review': 0, accepted: 0, rejected: 0, superseded: 0 }
}

/** 空阶段计数（同口径） */
function emptyPhaseCounts(): Record<FeatureStatus, number> {
  return { 'in-progress': 0, prd: 0, design: 0, tasks: 0, completed: 0, archived: 0 }
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
  /** 打开新会话通道（4.6：提案/feature 行头预填——装配注入 openSessionWithPreset；缺席 = 按钮不呈现） */
  readonly onStartSession?: (request: SessionOpenRequest) => void
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
  onStartSession,
  now,
}: OverviewTabProps): ReactNode {
  // 初始态（4.2）：挂载即带任务聚焦（pill 点击 → dock 首开概览 tab）= 任务子 tab 起步；
  // 否则提案子 tab 缺省（用户定向顺序首位）
  const [filter, setFilter] = useState<OverviewFilterState>(() =>
    focusTasksNonce === undefined ? initialOverviewFilter() : switchSubtab(initialOverviewFilter(), 'tasks'),
  )
  const [nonce, setNonce] = useState(0)
  // 面板宽度（4.6 UF-3 · Integration #6）：默认 560px；左缘拖拽钳制 400–920（中区保底 ≥580）
  const [width, setWidth] = useState(OVERVIEW_WIDTH_DEFAULT)
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
  const handleToggleProposalStatus = useCallback((status: ProposalStatus): void => {
    setFilter((prev) => toggleProposalStatusFilter(prev, status))
  }, [])
  const handleClearProposalStatuses = useCallback((): void => {
    setFilter((prev) => clearProposalStatusFilter(prev))
  }, [])
  const handleTogglePhase = useCallback((phase: FeatureStatus): void => {
    setFilter((prev) => togglePhaseFilter(prev, phase))
  }, [])
  const handleClearPhases = useCallback((): void => {
    setFilter((prev) => clearPhaseFilter(prev))
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
  const handleDragWidth = useCallback((clientX: number, viewportWidth: number): void => {
    setWidth(overviewWidthFromDrag(clientX, viewportWidth))
  }, [])
  const handleResetWidth = useCallback((): void => {
    setWidth(OVERVIEW_WIDTH_DEFAULT)
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
      width={width}
      onSubtabChange={handleSubtabChange}
      onSearchChange={handleSearchChange}
      onSortToggle={handleSortToggle}
      onToggleStatus={handleToggleStatus}
      onClearStatuses={handleClearStatuses}
      onToggleProposalStatus={handleToggleProposalStatus}
      onClearProposalStatuses={handleClearProposalStatuses}
      onTogglePhase={handleTogglePhase}
      onClearPhases={handleClearPhases}
      onToggleRow={handleToggleRow}
      onToggleHead={handleToggleHead}
      onRetry={handleRetry}
      onDragWidth={handleDragWidth}
      onResetWidth={handleResetWidth}
      onOpenDoc={onOpenDoc}
      renderTasksTab={renderTasksTab}
      {...(onStartSession !== undefined ? { onStartSession } : {})}
      now={now}
    />
  )
}
