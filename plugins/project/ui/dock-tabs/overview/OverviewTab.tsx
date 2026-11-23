// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 概览 tab 框架（定位：业务——UF-1 概览 dock tab body：ov-head 折叠头 + sticky 区
// [三子 tab + 搜索 + 排序] + 子 tab 内容接线）。UF-1 placement = 右栏官方 ui-dockkit tab
// ——注册集成在 4.1（本组件 = tab 体，真实 rpc client 由 4.1 经 makeClient 注入）。
// 分层：OverviewFrame = 纯呈现帧（结构静态可测）；OverviewTab = 状态 + 装载胶水
// （filter 本地态单一来源 + useOverviewLoad 两路装载 + retry nonce）。
// 三签不动（Hard Rule）：本目录零左栏/中区/conversation.view 改动——纯右栏 tab 体。
// 排序/过滤为视图本地态（任务子 tab 三视图 = renderTasksTab 槽——3.6 注入；缺省呈现
// chips 过滤接口）；文档行点击经 props 回调上抛（dock 开 tab——4.1 接线）。
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { BugCard, BugStatus, DirFactRow, FeatureCard, TaskStatus, TaskStats } from '@dsh-forge/contracts'
import { type RpcClientFactory } from '../rpc-channels.js'
import { overviewRpcClientFactory } from './overview-client.js'
import { useDirFactRows } from './dir-rows.js'
import { ErrorBar, SkeletonRows } from '../../components.js'
import {
  bugStatusFilterParam,
  clearBugStatusFilter,
  clearStatusFilter,
  initialOverviewFilter,
  nextSort,
  searchQueryOf,
  statusFilterParam,
  switchSubtab,
  toggleHead,
  toggleOpenRow,
  toggleBugStatusFilter,
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
import { docsRootOf, type SessionOpenRequest } from './message-format.js'
import { OverviewHead } from './ov-head.js'
import { StickyBar } from './sticky-bar.js'
import { StatusChips } from './status-chips.js'
import { BugList, bugChainGroups } from './bug-tab/bug-list.js'
import { BugDialog } from './bug-tab/index.js'
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
  /** 基本信息区五行目录事实（forgeDirs Typert 下发——独立路 fail-soft；缺席 = 行「—」） */
  readonly dirRows?: readonly DirFactRow[]
  /** 视图本地态（受控注入——OverviewTab 单一来源） */
  readonly filter: OverviewFilterState
  readonly onSubtabChange: (subtab: OverviewSubtab) => void
  readonly onSearchChange: (search: string) => void
  readonly onSortToggle: () => void
  readonly onToggleStatus: (status: TaskStatus) => void
  readonly onClearStatuses: () => void
  /** Bug 三态 chips toggle/清空（fix-bug——受控归帧侧模型） */
  readonly onToggleBugStatus: (status: BugStatus) => void
  readonly onClearBugStatuses: () => void
  readonly onToggleRow: (key: string) => void
  readonly onToggleHead: () => void
  /** 重试（头路 + 列路全量重装载） */
  readonly onRetry: () => void
  /** Bug 行点击 → 详情弹框（fix-bug 收尾——选中即开，帧侧透传 BugList；缺席 = 行静态呈现） */
  readonly onOpenBug?: (bugId: string) => void
  /** Bug 行「添加到会话中」（composer-bug-reference 1.4——装配注入；缺席 = 按钮不呈现，行语言零变化） */
  readonly onAddBugToSession?: (bug: BugCard) => void
  /** 文档行点击（dock 开 tab——装配传参兼容保留；feature 子 tab 退役后消费面归零，
   *  spec 子 tab 打开入口归 G3 接线） */
  readonly onOpenDoc?: (docRel: string) => void
  /** 任务子 tab 三视图装载槽（3.6 注入；缺省 = chips 过滤接口独占呈现） */
  readonly renderTasksTab?: (ctx: OverviewTasksContext) => ReactNode
  /** 打开新会话通道（装配注入 openSessionWithPreset——feature 子 tab 退役后消费面归零；
   *  spec 行头预填归 G3 接线；缺席 = 按钮不呈现） */
  readonly onStartSession?: (request: SessionOpenRequest) => void
  /** 相对时间基准（缺省 Date.now()——测试注入固定值） */
  readonly now?: number
}

/** 概览纯呈现帧（结构静态可测——ov-head + sticky + 内容区分派；M3.1 D12 面板弹性填满整 tab） */
export function OverviewFrame({
  projectId,
  head,
  list,
  phase,
  busy,
  error,
  dirRows,
  filter,
  onSubtabChange,
  onSearchChange,
  onSortToggle,
  onToggleStatus,
  onClearStatuses,
  onToggleBugStatus,
  onClearBugStatuses,
  onToggleHead,
  onRetry,
  onOpenBug,
  onAddBugToSession,
  renderTasksTab,
  // onToggleRow/now 保留 props 装配传参兼容（行展开与时间基准——spec 子 tab 本体
  // 归 G3 接线消费；feature 子 tab 退役后帧面暂零消费，故不解构入参）
}: OverviewFrameProps): ReactNode {
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
  } else if (filter.subtab === 'bugs' && list.kind === 'bugs') {
    content = (
      <>
        {listErrorBar(error, onRetry)}
        <BugList
          bugs={list.bugs}
          counts={list.counts}
          activeStatuses={filter.activeBugStatuses}
          onToggleStatus={onToggleBugStatus}
          onClearStatuses={onClearBugStatuses}
          {...(onOpenBug !== undefined ? { onOpenBug } : {})}
          {...(onAddBugToSession !== undefined ? { onAddBugToSession } : {})}
          emptyTitle={searchActive ? `无匹配「${filter.search.trim()}」的 Bug` : undefined}
        />
      </>
    )
  } else {
    // spec 子 tab：本体（chips 行 + 列表行 + 展开元数据）由 G3 任务交付——本任务只归一
    // 子 tab 结构，占位骨架零通道调用（列路 spec 短路 null → 骨架自然承接）
    content = <SkeletonRows className="dswf-ov-skeleton" rowClassName="dswf-ov-skeleton-row" rows={6} anchor="data-dswf-ov-skeleton" />
  }

  return (
    <div className="dswf-ov-wrap" data-dswf-ov-wrap="">
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
            rows={overviewHeadRows(head, dirRows)}
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
    interrupted: 0,
    skipped: 0,
    rejected: 0,
  }
}

/** Bug 弹框开合投影（纯函数）：选中 bugId 在 bugs 列表命中 → 卡片；无选中/列表缺席/
 *  非 bugs 列表/未命中 → undefined（onClose 复位 = 无选中不渲染）。 */
export function openBugCardOf(list: OverviewListData | undefined, openBugId: string | null): BugCard | undefined {
  if (openBugId === null || list === undefined || list.kind !== 'bugs') return undefined
  return list.bugs.find((bug) => bug.bugId === openBugId)
}

/** Bug 弹框挂载位（OverviewTab 装配体——bug 子 tab 行点击开合；无选中 = 不渲染）。
 *  注入面 sessionTitleOf/onOpenSession = ShellHost 递达缝（任务抽屉同缝——键缺席
 *  fail-soft 不递达）；projectId/makeClient = fixed 证据变更文件拉取面（缺席 = 控件不
 *  呈现）；Escape 关闭径随 BugDialog 内 useTaskDrawerEscape（同款）。 */
export interface OverviewBugDialogMountProps {
  readonly list: OverviewListData | undefined
  readonly openBugId: string | null
  readonly onClose: () => void
  readonly onOpenSession?: (sessionId: string) => void
  readonly sessionTitleOf?: (sessionId: string) => string | undefined
  readonly projectId?: string
  readonly makeClient?: RpcClientFactory
}

export function OverviewBugDialogMount({ list, openBugId, onClose, onOpenSession, sessionTitleOf, projectId, makeClient }: OverviewBugDialogMountProps): ReactNode {
  const bug = openBugCardOf(list, openBugId)
  if (bug === undefined) return null
  // 链注入（bug-recurrence-chain——bugs 行集链投影递达弹框；孤条 = chain 缺席零链区）
  const { chains, memberRootOf } = bugChainGroups(list !== undefined && list.kind === 'bugs' ? list.bugs : [])
  const rootBugId = memberRootOf.get(bug.bugId)
  const chain = rootBugId !== undefined ? chains.get(rootBugId) : undefined
  return (
    <BugDialog
      bug={bug}
      onClose={onClose}
      {...(chain !== undefined ? { chain } : {})}
      {...(onOpenSession !== undefined ? { onOpenSession } : {})}
      {...(sessionTitleOf !== undefined ? { sessionTitleOf } : {})}
      {...(projectId !== undefined ? { projectId } : {})}
      {...(makeClient !== undefined ? { makeClient } : {})}
    />
  )
}

export interface OverviewTabProps {
  /** 当前项目（4.1 ShellHost 锚定注入——knowledge-anchor 裁决） */
  readonly projectId: string
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面——rpc 经 mock 注入） */
  readonly makeClient?: RpcClientFactory
  /** 已退役（用户裁决 2026-11-23：头无会话统计——头摘要行随 T1-head 退役）。保留 props 形
   *  兼容既有装配传参（apps/web ShellHost 在 spec 改动范围外），消费归零。 */
  readonly sessionCount?: number
  /** 文档行点击（dock 开 tab——4.1 接线） */
  readonly onOpenDoc?: (docRel: string) => void
  /** 任务子 tab 三视图装载槽（3.6 注入） */
  readonly renderTasksTab?: (ctx: OverviewTasksContext) => ReactNode
  /** 任务聚焦 nonce（4.2 pill 点击——变更即切任务子 tab；switchSubtab 语义 = 清搜索/清 chips/收展开） */
  readonly focusTasksNonce?: number
  /** 打开新会话通道（装配注入 openSessionWithPreset——spec 行头预填归 G3 接线；缺席 = 按钮不呈现） */
  readonly onStartSession?: (request: SessionOpenRequest) => void
  /** 会话 pill 跳转（ShellHost 递达面——任务抽屉同缝；缺席 = Bug 弹框 pill 非交互） */
  readonly onOpenSession?: (sessionId: string) => void
  /** Bug 行「添加到会话中」（1.4——装配注入 addBugToSession；缺席 = 按钮不呈现） */
  readonly onAddBugToSession?: (bug: BugCard) => void
  /** 会话名解析器（dsh 账本快照 displayTitle 窄读——任务抽屉同缝；缺席 = pill 回退 id） */
  readonly sessionTitleOf?: (sessionId: string) => string | undefined
  /** 相对时间基准（缺省 Date.now()——测试注入固定值） */
  readonly now?: number
}

/** 概览 tab body（状态 + 装载胶水——filter 本地态单一来源；effect 编排归 useOverviewLoad） */
export function OverviewTab({
  projectId,
  makeClient = overviewRpcClientFactory,
  onOpenDoc,
  renderTasksTab,
  focusTasksNonce,
  onStartSession,
  onOpenSession,
  onAddBugToSession,
  sessionTitleOf,
  now,
}: OverviewTabProps): ReactNode {
  // 初始态（4.2）：挂载即带任务聚焦（pill 点击 → dock 首开概览 tab）= 任务子 tab 起步；
  // 否则缺省子 tab = 任务（initialOverviewFilter 单源）
  const [filter, setFilter] = useState<OverviewFilterState>(() =>
    focusTasksNonce === undefined ? initialOverviewFilter() : switchSubtab(initialOverviewFilter(), 'tasks'),
  )
  const [nonce, setNonce] = useState(0)
  // Bug 弹框开合态（fix-bug 收尾）：行点击选中即开，onClose 复位（无选中 = 不渲染）
  const [openBugId, setOpenBugId] = useState<string | null>(null)
  const handleOpenBug = useCallback((bugId: string): void => {
    setOpenBugId(bugId)
  }, [])
  const handleCloseBug = useCallback((): void => {
    setOpenBugId(null)
  }, [])
  // Bug chips 白名单参（受控集合引用稳定——仅 toggle 时换参；列表键含投影键 → 服务端重拉）
  const bugStatusParam = useMemo(() => bugStatusFilterParam(filter.activeBugStatuses), [filter.activeBugStatuses])
  const load = useOverviewLoad(projectId, filter.subtab, filter.search, filter.sort, nonce, makeClient, bugStatusParam)
  // 基本信息区五行目录事实（独立路 forgeDirs Typert——失败 fail-soft 全「—」，不阻断头路）
  const dirRows = useDirFactRows(projectId)

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
  const handleToggleBugStatus = useCallback((status: BugStatus): void => {
    setFilter((prev) => toggleBugStatusFilter(prev, status))
  }, [])
  const handleClearBugStatuses = useCallback((): void => {
    setFilter((prev) => clearBugStatusFilter(prev))
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
    <>
      <OverviewFrame
        projectId={projectId}
        head={load.head}
        list={load.list}
        phase={load.phase}
        busy={load.busy}
        error={load.error}
        dirRows={dirRows}
        filter={filter}
        onSubtabChange={handleSubtabChange}
        onSearchChange={handleSearchChange}
        onSortToggle={handleSortToggle}
        onToggleStatus={handleToggleStatus}
        onClearStatuses={handleClearStatuses}
        onToggleBugStatus={handleToggleBugStatus}
        onClearBugStatuses={handleClearBugStatuses}
        onToggleRow={handleToggleRow}
        onToggleHead={handleToggleHead}
        onRetry={handleRetry}
        onOpenBug={handleOpenBug}
        onOpenDoc={onOpenDoc}
        renderTasksTab={renderTasksTab}
        {...(onStartSession !== undefined ? { onStartSession } : {})}
        {...(onAddBugToSession !== undefined ? { onAddBugToSession } : {})}
        now={now}
      />
      <OverviewBugDialogMount
        list={load.list}
        openBugId={openBugId}
        onClose={handleCloseBug}
        {...(onOpenSession !== undefined ? { onOpenSession } : {})}
        {...(sessionTitleOf !== undefined ? { sessionTitleOf } : {})}
        projectId={projectId}
        {...(makeClient !== undefined ? { makeClient } : {})}
      />
    </>
  )
}
