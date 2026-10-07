// 任务子 tab 组装（定位：业务——4.6 交付面：OverviewFrame renderTasksTab 槽注入体）。
// 工具栏 v22 布局（ui-design ㉟–㊵）：容器 pill（双轨——features 远征点 ∪ 有任务突击提案
// 琥珀点[container-pill 4.4]）+ 视图下拉（ViewDropdown 4.4——pill 右侧）+ 右簇 [诊断]+[派发]
// 固定最右端同行不换行 + 七态 chips（StatusChips 复用）+ 三视图分派 + 三态面。
// 诊断两路之一（feature 子图）：「诊断」按钮（仅 feature 容器——validateFeatureTasks 为
// feature 域校验）→ RPC 只读校验 → DiagToast 双档（成功 1s/失败 5s + 发送给 agent →
// formatDiagMessage 自动发送·远征）。任务失败诊断（blocked/rejected）= 抽屉内「诊断失败」
// 按钮（drawer 4.6 接线——同 toast 同发送机制）。派发按钮（DispatchButton 4.4）：终态判定
// stats 单源 + 双路由（runDispatchRoute——执行中在场跳转既有派发会话[taskDetail.sessions
// link 源末位]；否则新开容器对应模式 + autosend「/run-tasks <标识>」单行·v23）。
// Hard Rule（v22 ㊳）：无单任务直接执行入口——行/详情零「执行」动作。
// 容器选中：受控注入（4.2 taskFocus featureSlug）优先，否则本地切换；数据装载归
// useTasksTabLoad（source 容器参数路由——AC5）。
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  FEATURE_STATUS_LABELS,
  type FeatureCard,
  type Mode,
  type ProposalCard,
  type SessionTaskLinkCard,
  type TaskStatus,
} from '@dsh-forge/contracts'
import { Menu, Pill, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState, ErrorBar, SkeletonRows } from '../../../components/index.js'
import { preloadRpcClientFactory, type ForgeRpcClient, type RpcClientFactory } from '../../../rpc/index.js'
import { activeFeatureSlug, hasActiveStatusFilter, searchQueryOf, type OverviewSort } from '../overview-model.js'
import { formatDiagMessage, type MessageContainer, type SessionOpenRequest } from '../message-format.js'
import { StatusChips } from '../status-chips.js'
import { useTasksTabLoad, type TasksTabLoadState } from './task-tab-data.js'
import {
  featureRatioLabel,
  resolveContainer,
  containerKeyOf,
  containerMenuSelect,
  containerPillChip,
  containerCountNote,
  taskCountNote,
  tasksEmptyView,
  type TaskContainerSel,
  type TaskViewMode,
} from './task-tab-model.js'
import {
  containerHasSubgraphDiag,
  containerMenuMark,
  taskContainerOptions,
  type TaskContainerOption,
} from './container-pill.js'
import { ListView } from './list-view.js'
import { DagView } from './dag-view.js'
import { SwimlaneView } from './swimlane-view.js'
import { ViewDropdown } from './ViewDropdown.js'
import { DispatchButton, dispatchCommandOf, dispatchRouteOf, latestDispatchSessionOf } from './DispatchButton.js'
import { runningTaskOf } from './terminal-state.js'
import {
  DiagToast,
  diagServiceError,
  subgraphDiagFail,
  subgraphDiagOk,
  type DiagToastResult,
  type DiagToastSendPayload,
} from './DiagToast.js'
import './task-tab.css'

/** 空计数（stats 在途 = chips 全 0 全禁用——首装在途不可点出空态；3.5 帧同口径） */
function emptyTaskCounts(): Record<TaskStatus, number> {
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

/** 容器菜单行集（双轨：slug + 突击标记（突击提案）+ chip——feature 完成比 / 突击任务数） */
export function containerMenuItems(
  options: readonly TaskContainerOption[],
  features: readonly FeatureCard[],
): readonly MenuEntry[] {
  return options.map((option) => ({
    id: containerKeyOf(option),
    label: (
      <span className="dswf-tt-mrow" data-dswf-tt-mcont={containerKeyOf(option)}>
        <span className="dswf-tt-mkey">{`${option.slug}${containerMenuMark(option)}`}</span>
        <span className="dswf-tt-mchip">
          {option.kind === 'feature'
            ? (() => {
                const card = features.find((f) => f.slug === option.slug)
                return card === undefined ? `${option.taskCount} 任务` : featureRatioLabel(card)
              })()
            : `${option.taskCount} 任务`}
        </span>
      </span>
    ),
  }))
}

/** 派发双路由执行输入（AC4——runDispatchRoute 数据面） */
export interface DispatchRouteRunInput {
  readonly projectId: string
  readonly container: TaskContainerOption
  readonly client: ForgeRpcClient
}

/** 派发双路由出口（jump = 跳既有派发会话；new = 新开 + autosend 指令单行） */
export interface DispatchRouteSinks {
  readonly onJump: (sessionId: string, taskKey: string) => void
  readonly onNew: (mode: Mode, command: string) => void
}

/**
 * 派发双路由执行（图 13 · AC4）：容器全集 listTasks（无过滤——runningTaskOf 判据输入
 * 纪律）→ 执行中在场 → taskDetail 水化 sessions（link 源 = 派发挂接）→ dispatchRouteOf
 * 分支（jump / new）。RPC 失败 fail-soft 回退 new（claim 原子性兜底——双 dispatcher
 * 不双派发；指令直达 agent 由 run-tasks 技能再判定）。
 */
export async function runDispatchRoute(input: DispatchRouteRunInput, sinks: DispatchRouteSinks): Promise<void> {
  const fallbackNew = (): void => {
    sinks.onNew(input.container.mode, dispatchCommandOf(input.container.slug))
  }
  try {
    const cards = await input.client.tasks.list({
      projectId: input.projectId,
      source: { kind: input.container.kind, slug: input.container.slug },
    })
    const running = runningTaskOf(cards)
    let sessions: readonly SessionTaskLinkCard[] = []
    if (running !== undefined) {
      const detail = await input.client.tasks.detail({ projectId: input.projectId, taskId: running.taskId })
      sessions = detail.sessions
    }
    const route = dispatchRouteOf({
      ...(running !== undefined ? { runningTask: { taskId: running.taskId, slug: running.slug, localId: running.localId } } : {}),
      ...(running !== undefined ? { latestDispatchSession: latestDispatchSessionOf(sessions) } : {}),
      containerMode: input.container.mode,
      containerSlug: input.container.slug,
    })
    if (route.kind === 'jump') {
      sinks.onJump(route.sessionId, route.taskKey)
      return
    }
    sinks.onNew(route.mode, route.command)
  } catch {
    fallbackNew()
  }
}

export interface TasksTabBodyProps {
  // ── 概览帧 ctx 消费面（4.1 renderTasksTab 闭包注入——过滤/搜索态帧侧单一来源） ──
  readonly search: string
  readonly activeStatuses: ReadonlySet<TaskStatus>
  /** 容器选项集（双轨并集——taskContainerOptions(features, proposals) 投影） */
  readonly options: readonly TaskContainerOption[]
  /** 无参 feature 列（菜单 chip 完成比查找源——不随搜索漂移） */
  readonly features: readonly FeatureCard[]
  readonly onToggleStatus: (status: TaskStatus) => void
  readonly onClearStatuses: () => void
  // ── task-tab 本地态（装载壳注入——受控面） ──
  readonly container: TaskContainerOption | undefined
  readonly view: TaskViewMode
  readonly containerMenuOpen: boolean
  readonly viewMenuOpen: boolean
  readonly onContainerSelect: (option: TaskContainerOption) => void
  readonly onViewChange: (view: TaskViewMode) => void
  readonly onContainerMenuOpenChange: (open: boolean) => void
  readonly onViewMenuOpenChange: (open: boolean) => void
  readonly load: TasksTabLoadState
  readonly onRetry: () => void
  // ── 诊断两路之一（feature 子图——AC3） ──
  /** 当前诊断结果（undefined = 不呈现——受控整体替换 = 零陈旧滞留） */
  readonly diagResult: DiagToastResult | undefined
  /** 「诊断」触发（validateFeatureTasks RPC——装载壳持有） */
  readonly onDiagnose: () => void
  readonly onDiagDismiss: () => void
  /** 「发送给 agent」（fail 档动作——缺席 = 无动作钮） */
  readonly onDiagSend?: (payload: DiagToastSendPayload) => void
  // ── 派发（AC3——终态判定 + 双路由） ──
  /** 派发反馈 toast（jump/new 两档 ok 提示；undefined = 不呈现） */
  readonly dispatchNotice: DiagToastResult | undefined
  readonly onDispatchNoticeDismiss: () => void
  readonly onDispatch: () => void
  // ── 装配回调（4.1 接线） ──
  /** 行/节点/卡片点击 → 抽屉（缺席 = 非交互呈现） */
  readonly onOpenTask?: (taskId: string) => void
  /** ⋯ 转移预设 → 3.8 对话框（缺席 = 菜单仅查看详情） */
  readonly onTransition?: (taskId: string) => void
  /** 抽屉开着的任务（三视图高亮） */
  readonly activeTaskId?: string
}

/** 任务子 tab 纯渲染体（v22 工具栏 + chips + 三视图分派 + 三态面——静态全相位可测） */
export function TasksTabBody({
  search,
  activeStatuses,
  options,
  features,
  onToggleStatus,
  onClearStatuses,
  container,
  view,
  containerMenuOpen,
  viewMenuOpen,
  onContainerSelect,
  onViewChange,
  onContainerMenuOpenChange,
  onViewMenuOpenChange,
  load,
  onRetry,
  diagResult,
  onDiagnose,
  onDiagDismiss,
  onDiagSend,
  dispatchNotice,
  onDispatchNoticeDismiss,
  onDispatch,
  onOpenTask,
  onTransition,
  activeTaskId,
}: TasksTabBodyProps): ReactNode {
  const searchActive = searchQueryOf(search) !== undefined
  const hasStatusFilter = hasActiveStatusFilter(activeStatuses)

  // 无容器：容器空态（无 taskbar——feature ∪ 有任务突击提案两域无行可选）
  if (container === undefined) {
    return (
      <EmptyState
        className="dswf-tt-empty"
        title="暂无任务容器"
        description="feature 与有任务的突击提案在此列出——feature 目录经注册发现面扫描建行"
      />
    )
  }

  const cards = load.cards
  const stats = load.stats
  const featureCard = container.kind === 'feature' ? features.find((f) => f.slug === container.slug) : undefined
  const pillChip = containerPillChip(
    container,
    stats === undefined
      ? undefined
      : `${featureCard === undefined ? '' : `${FEATURE_STATUS_LABELS[featureCard.featureStatus].zh} `}${stats.byStatus.completed ?? 0}/${stats.total}`,
  )
  const countNote = containerCountNote(
    container,
    stats === undefined ? undefined : taskCountNote(searchActive, cards?.length ?? 0, stats.total),
  )

  // 内容区分派：骨架（首装/清场）→ 错误（无旧内容）→ DAG graph 在途 → 空态 → 三视图
  let content: ReactNode
  if (cards === undefined && load.phase !== 'error') {
    content = (
      <SkeletonRows
        className="dswf-tt-skeleton"
        rowClassName="dswf-tt-skeleton-row"
        rows={6}
        anchor="data-dswf-tt-skeleton"
      />
    )
  } else if (cards === undefined) {
    content = (
      <ErrorBar
        className="dswf-tt-error"
        message={`任务装载失败：${load.error?.message ?? ''}`}
        retryClassName="dswf-tt-retry"
        onRetry={onRetry}
        anchor="data-dswf-tt-error"
        retryAnchor="data-dswf-tt-retry"
      />
    )
  } else if (view === 'dag' && load.graph === undefined && load.phase !== 'error') {
    content = (
      <SkeletonRows
        className="dswf-tt-skeleton"
        rowClassName="dswf-tt-skeleton-row"
        rows={6}
        anchor="data-dswf-tt-skeleton"
      />
    )
  } else {
    const empty = tasksEmptyView({
      cards,
      total: stats?.total ?? cards.length,
      searchActive,
      search,
      hasStatusFilter,
    })
    if (empty !== undefined) {
      content = <EmptyState className="dswf-tt-empty" title={empty.title} description={empty.description} />
    } else if (view === 'dag') {
      content = (
        <DagView cards={cards} graph={load.graph as NonNullable<TasksTabLoadState['graph']>} onOpenTask={onOpenTask} activeTaskId={activeTaskId} />
      )
    } else if (view === 'swim') {
      content = <SwimlaneView cards={cards} onOpenTask={onOpenTask} activeTaskId={activeTaskId} />
    } else {
      content = (
        <ListView
          cards={cards}
          onOpenTask={onOpenTask}
          activeTaskId={activeTaskId}
          {...(onTransition !== undefined ? { onTransition } : {})}
        />
      )
    }
  }

  return (
    <div className="dswf-tt" data-dswf-tt="">
      <div className="dswf-tt-taskbar" data-dswf-tt-taskbar="">
        <Menu
          open={containerMenuOpen}
          portal
          side="bottom"
          items={containerMenuItems(options, features)}
          selectedId={containerKeyOf(container)}
          selection="fill"
          listClassName="dswf-tt-menu"
          onClose={() => {
            onContainerMenuOpenChange(false)
          }}
          onSelect={(id) => {
            onContainerMenuOpenChange(false)
            const option = containerMenuSelect(options, id)
            if (option !== undefined) onContainerSelect(option)
          }}
          anchor={
            <Pill
              className="dswf-tt-featpill"
              data-dswf-tt-contpill={containerKeyOf(container)}
              title={`任务容器：${container.slug}（${container.kind === 'feature' ? 'feature · 远征' : '突击提案 · 突击'}）`}
              aria-haspopup="menu"
              aria-expanded={containerMenuOpen}
              onClick={() => {
                onContainerMenuOpenChange(!containerMenuOpen)
              }}
            >
              <span className="dswf-tt-contdot" data-mode={container.mode} aria-hidden="true" />
              <span className="dswf-tt-featname">{container.slug}</span>
              <span className="dswf-tt-featchip">{pillChip}</span>
              <span aria-hidden="true">▾</span>
            </Pill>
          }
        />
        {countNote !== undefined ? (
          <span className="dswf-tt-count" data-dswf-tt-count="">
            {countNote}
          </span>
        ) : null}
        <ViewDropdown view={view} open={viewMenuOpen} onViewChange={onViewChange} onOpenChange={onViewMenuOpenChange} />
        <span className="dswf-tt-spacer" />
        <div className="dswf-tt-rightbar" data-dswf-tt-rightbar="">
          {containerHasSubgraphDiag(container) ? (
            <span className="dswf-tt-diagwrap" data-dswf-tt-diagwrap="">
              <DiagToast result={diagResult} onDismiss={onDiagDismiss} {...(onDiagSend !== undefined ? { onSend: onDiagSend } : {})} />
              <button
                type="button"
                className="dswf-tt-diagbtn"
                data-dswf-tt-diag=""
                title="诊断——validateFeatureTasks 只读校验当前 feature 子图（五类检查）"
                onClick={() => {
                  onDiagnose()
                }}
              >
                诊断
              </button>
            </span>
          ) : null}
          <span className="dswf-tt-diagwrap">
            <DiagToast result={dispatchNotice} onDismiss={onDispatchNoticeDismiss} />
            <DispatchButton stats={stats} onDispatch={onDispatch} />
          </span>
        </div>
      </div>
      <StatusChips
        counts={stats?.byStatus ?? emptyTaskCounts()}
        active={activeStatuses}
        onToggle={onToggleStatus}
        onClear={onClearStatuses}
      />
      {load.error !== undefined && cards !== undefined ? (
        <ErrorBar
          className="dswf-tt-error"
          message={`任务重取失败：${load.error.message}`}
          retryClassName="dswf-tt-retry"
          onRetry={onRetry}
          anchor="data-dswf-tt-error"
          retryAnchor="data-dswf-tt-retry"
        />
      ) : null}
      <div className="dswf-tt-content" aria-busy={load.busy}>
        {content}
      </div>
    </div>
  )
}

export interface TasksTabProps {
  // ── OverviewTasksContext 面（4.1 renderTasksTab 闭包注入） ──
  readonly projectId: string
  readonly search: string
  readonly sort: OverviewSort
  readonly activeStatuses: ReadonlySet<TaskStatus>
  /** statusFilter 白名单参（帧侧 statusFilterParam——装载查询参） */
  readonly statusFilter: readonly TaskStatus[]
  readonly features: readonly FeatureCard[]
  /** 无参提案列（4.6 容器 pill 双轨突击源——head 无参 proposals） */
  readonly proposals: readonly ProposalCard[]
  readonly onToggleStatus: (status: TaskStatus) => void
  readonly onClearStatuses: () => void
  // ── 装配注入（4.1 接线） ──
  /** 受控 feature 选中（UF-3 pill 导航载荷——4.2 注入；否则活跃容器缺省 + 本地切换） */
  readonly featureSlug?: string
  /** 用户容器菜单切换通知（4.2——装配侧释放聚焦覆盖，恢复本地切换优先） */
  readonly onFeatureUserSwitch?: () => void
  /** 行/节点/卡片点击 → 抽屉回调 */
  readonly onOpenTask?: (taskId: string) => void
  /** ⋯ 转移预设 → 3.8 对话框 */
  readonly onTransition?: (taskId: string) => void
  /** 抽屉开着的任务（三视图高亮） */
  readonly activeTaskId?: string
  /** 打开新会话通道（4.6：诊断发送/派发指令——装配注入 openSessionWithPreset autosend） */
  readonly onStartSession?: (request: SessionOpenRequest) => void
  /** 跳转既有会话（4.6 派发 jump 路由——uiWorkspace.openSession；缺席 = 跳转降级 no-op） */
  readonly onOpenSession?: (sessionId: string) => void
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

/**
 * 任务子 tab 装载壳：本地态 = 容器选中（受控注入优先）+ 视图 + 两菜单开合 + 诊断/派发
 * toast 态；数据装载归 useTasksTabLoad（source 容器参数路由 + 事件重取）；诊断/派发
 * 动作面（RPC + 双路由 + 自动发送）在本壳编排。
 */
export function TasksTab({
  projectId,
  search,
  sort,
  activeStatuses,
  statusFilter,
  features,
  proposals,
  onToggleStatus,
  onClearStatuses,
  featureSlug: controlledFeature,
  onFeatureUserSwitch,
  onOpenTask,
  onTransition,
  activeTaskId,
  onStartSession,
  onOpenSession,
  makeClient = preloadRpcClientFactory,
}: TasksTabProps): ReactNode {
  const options = useMemo(() => taskContainerOptions(features, proposals), [features, proposals])
  const [localContainer, setLocalContainer] = useState<TaskContainerSel | undefined>(undefined)
  const [view, setView] = useState<TaskViewMode>('list')
  const [containerMenuOpen, setContainerMenuOpen] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [diagResult, setDiagResult] = useState<DiagToastResult | undefined>(undefined)
  const [dispatchNotice, setDispatchNotice] = useState<DiagToastResult | undefined>(undefined)
  const resolved = resolveContainer(
    options,
    localContainer ?? (controlledFeature !== undefined ? { kind: 'feature', slug: controlledFeature } : undefined),
    activeFeatureSlug(features),
  )
  const source = resolved === undefined ? undefined : { kind: resolved.kind, slug: resolved.slug }
  const [load, { retry }] = useTasksTabLoad(projectId, source, view, statusFilter, search, sort, makeClient)

  const handleContainerSelect = useCallback(
    (option: TaskContainerOption): void => {
      setLocalContainer({ kind: option.kind, slug: option.slug })
      onFeatureUserSwitch?.() // 4.2：用户显式切换——装配侧释放聚焦覆盖（受控让位本地）
    },
    [onFeatureUserSwitch],
  )
  const handleViewChange = useCallback((mode: TaskViewMode): void => {
    setView(mode)
  }, [])

  // 诊断两路之一（feature 子图）：重跑即重现零陈旧滞留 = 整体替换 result（新诊断新计时）
  const handleDiagnose = useCallback(async (): Promise<void> => {
    if (resolved === undefined || resolved.kind !== 'feature') return
    try {
      const report = await makeClient().tasks.validateFeatureTasks({ projectId, featureSlug: resolved.slug })
      if (report.violations.length === 0) {
        setDiagResult(subgraphDiagOk())
        return
      }
      const card = features.find((f) => f.slug === resolved.slug)
      const diagContainer: MessageContainer = {
        kind: 'feature',
        slug: resolved.slug,
        title: card?.title ?? resolved.title,
        ...(card?.summary !== undefined ? { summary: card.summary } : {}),
        ...(card !== undefined ? { phase: card.featureStatus } : {}),
      }
      setDiagResult(subgraphDiagFail(diagContainer, report.violations))
    } catch (error) {
      setDiagResult(diagServiceError(error instanceof Error ? error.message : String(error)))
    }
  }, [resolved, features, projectId, makeClient])
  const handleDiagDismiss = useCallback((): void => {
    setDiagResult(undefined)
  }, [])
  const handleDiagSend = useCallback(
    (payload: DiagToastSendPayload): void => {
      // 子图诊断恒 feature 容器 → 远征（validateFeatureTasks 为 feature 域校验）；错误直达修复 = autosend
      onStartSession?.({ mode: 'expedition', prefill: formatDiagMessage(payload), autosend: true })
    },
    [onStartSession],
  )

  const handleDispatch = useCallback(async (): Promise<void> => {
    if (resolved === undefined) return
    await runDispatchRoute(
      { projectId, container: resolved, client: makeClient() },
      {
        onJump: (sessionId, taskKey): void => {
          setDispatchNotice({ tier: 'ok', title: '已跳转派发会话', subtitle: `执行中 ${taskKey} · 不新建不重发` })
          onOpenSession?.(sessionId)
        },
        onNew: (mode, command): void => {
          setDispatchNotice({
            tier: 'ok',
            title: '已开派发会话',
            subtitle: `${mode === 'blitz' ? '突击' : '远征'}模式 · 指令已发送（按 DAG 顺序领取执行）`,
          })
          onStartSession?.({ mode, prefill: command, autosend: true })
        },
      },
    )
  }, [resolved, projectId, makeClient, onOpenSession, onStartSession])
  const handleDispatchNoticeDismiss = useCallback((): void => {
    setDispatchNotice(undefined)
  }, [])

  return (
    <TasksTabBody
      search={search}
      activeStatuses={activeStatuses}
      options={options}
      features={features}
      onToggleStatus={onToggleStatus}
      onClearStatuses={onClearStatuses}
      container={resolved}
      view={view}
      containerMenuOpen={containerMenuOpen}
      viewMenuOpen={viewMenuOpen}
      onContainerSelect={handleContainerSelect}
      onViewChange={handleViewChange}
      onContainerMenuOpenChange={setContainerMenuOpen}
      onViewMenuOpenChange={setViewMenuOpen}
      load={load}
      onRetry={retry}
      diagResult={diagResult}
      onDiagnose={() => {
        void handleDiagnose()
      }}
      onDiagDismiss={handleDiagDismiss}
      {...(onStartSession !== undefined ? { onDiagSend: handleDiagSend } : {})}
      dispatchNotice={dispatchNotice}
      onDispatchNoticeDismiss={handleDispatchNoticeDismiss}
      onDispatch={() => {
        void handleDispatch()
      }}
      {...(onOpenTask !== undefined ? { onOpenTask } : {})}
      {...(onTransition !== undefined ? { onTransition } : {})}
      {...(activeTaskId !== undefined ? { activeTaskId } : {})}
    />
  )
}
