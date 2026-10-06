// 任务子 tab 组装（定位：业务——3.6 交付面：OverviewFrame renderTasksTab 槽注入体）。
// 结构 = ov-taskbar（feature pill + 计数注记 + 三视图 seg——排序 pill 归 3.5 sticky 区，
// ui-design §排序 v8 裁决：搜索行右端固定，不在 taskbar 重复）+ 七态 chips（StatusChips
// 复用——计数 = feature 域 tasks.stats 单源）+ 三视图分派（list/dag/swim）+ 三态面
// （骨架/错误/空态）。数据 = useTasksTabLoad（chips 过滤/搜索/排序服务端承载 + DAG
// 增拉 taskGraph + 写推送事件静默重取）；行/节点/卡片点击 → onOpenTask 抽屉回调
// （4.1 接线——TaskDrawer taskId 面）；⋯ 转移预设 → onTransition（3.8 对话框）。
// feature 选中态：受控注入（UF-3 pill 导航载荷——4.2 注入 featureSlug）优先，
// 否则活跃 feature 缺省 + pill 菜单本地切换。
import { useCallback, useState, type ReactNode } from 'react'
import {
  FEATURE_STATUS_LABELS,
  type FeatureCard,
  type TaskStatus,
} from '@dsh-forge/contracts'
import { Menu, Pill, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState, ErrorBar, SkeletonRows } from '../../../components/index.js'
import type { RpcClientFactory } from '../../../rpc/index.js'
import type { OverviewSort } from '../overview-model.js'
import { StatusChips } from '../status-chips.js'
import { hasActiveStatusFilter, searchQueryOf } from '../overview-model.js'
import { useTasksTabLoad, type TasksTabLoadState } from './task-tab-data.js'
import {
  TASK_VIEWS,
  featureRatioLabel,
  resolveFeatureSlug,
  taskCountNote,
  tasksEmptyView,
  type TaskViewMode,
} from './task-tab-model.js'
import { ListView } from './list-view.js'
import { DagView } from './dag-view.js'
import { SwimlaneView } from './swimlane-view.js'
import './task-tab.css'

/** feature pill 菜单行集（行 = feature slug + 状态完成比——feature 卡 byStatus 聚合） */
export function featureMenuItems(features: readonly FeatureCard[]): readonly MenuEntry[] {
  return features.map((feature) => ({
    id: feature.slug,
    label: (
      <span className="dswf-tt-mrow" data-dswf-tt-mfeat={feature.slug}>
        <span className="dswf-tt-mkey">{feature.slug}</span>
        <span className="dswf-tt-mchip">{featureRatioLabel(feature)}</span>
      </span>
    ),
  }))
}

/** 菜单行 id → feature slug（未知 id = undefined 不派发） */
export function featureMenuSelect(features: readonly FeatureCard[], id: string): string | undefined {
  return features.find((feature) => feature.slug === id)?.slug
}

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

export interface TasksTabBodyProps {
  // ── 概览帧 ctx 消费面（4.1 renderTasksTab 闭包注入——过滤/搜索态帧侧单一来源） ──
  readonly search: string
  readonly activeStatuses: ReadonlySet<TaskStatus>
  readonly features: readonly FeatureCard[]
  readonly onToggleStatus: (status: TaskStatus) => void
  readonly onClearStatuses: () => void
  // ── task-tab 本地态（装载壳注入——受控面） ──
  readonly featureSlug: string | undefined
  readonly view: TaskViewMode
  readonly featureMenuOpen: boolean
  readonly onFeatureSelect: (slug: string) => void
  readonly onViewChange: (view: TaskViewMode) => void
  readonly onFeatureMenuOpenChange: (open: boolean) => void
  readonly load: TasksTabLoadState
  readonly onRetry: () => void
  // ── 装配回调（4.1 接线） ──
  /** 行/节点/卡片点击 → 抽屉（缺席 = 非交互呈现） */
  readonly onOpenTask?: (taskId: string) => void
  /** ⋯ 转移预设 → 3.8 对话框（缺席 = 菜单仅查看详情） */
  readonly onTransition?: (taskId: string) => void
  /** 抽屉开着的任务（三视图高亮） */
  readonly activeTaskId?: string
}

/** 任务子 tab 纯渲染体（taskbar + chips + 三视图分派 + 三态面——静态全相位可测） */
export function TasksTabBody({
  search,
  activeStatuses,
  features,
  onToggleStatus,
  onClearStatuses,
  featureSlug,
  view,
  featureMenuOpen,
  onFeatureSelect,
  onViewChange,
  onFeatureMenuOpenChange,
  load,
  onRetry,
  onOpenTask,
  onTransition,
  activeTaskId,
}: TasksTabBodyProps): ReactNode {
  const searchActive = searchQueryOf(search) !== undefined
  const feature = features.find((f) => f.slug === featureSlug)
  const hasStatusFilter = hasActiveStatusFilter(activeStatuses)

  // 无 feature：feature 空态（无 taskbar——feature 域无行可选）
  if (featureSlug === undefined || feature === undefined) {
    return (
      <EmptyState
        className="dswf-tt-empty"
        title="暂无 feature"
        description="feature 目录经注册发现面扫描建行"
      />
    )
  }

  const cards = load.cards
  const stats = load.stats
  const pillChip =
    stats === undefined
      ? FEATURE_STATUS_LABELS[feature.featureStatus].zh
      : `${FEATURE_STATUS_LABELS[feature.featureStatus].zh} ${stats.byStatus.completed ?? 0}/${stats.total}`
  const countNote = stats === undefined ? undefined : taskCountNote(searchActive, cards?.length ?? 0, stats.total)

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
          open={featureMenuOpen}
          portal
          side="bottom"
          items={featureMenuItems(features)}
          selectedId={featureSlug}
          selection="fill"
          listClassName="dswf-tt-menu"
          onClose={() => {
            onFeatureMenuOpenChange(false)
          }}
          onSelect={(id) => {
            onFeatureMenuOpenChange(false)
            const slug = featureMenuSelect(features, id)
            if (slug !== undefined) onFeatureSelect(slug)
          }}
          anchor={
            <Pill
              className="dswf-tt-featpill"
              data-dswf-tt-featpill={featureSlug}
              title={`feature 绑定：${featureSlug}`}
              aria-haspopup="menu"
              aria-expanded={featureMenuOpen}
              onClick={() => {
                onFeatureMenuOpenChange(!featureMenuOpen)
              }}
            >
              <span className="dswf-tt-featname">{featureSlug}</span>
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
        <span className="dswf-tt-spacer" />
        <div className="dswf-tt-seg" role="group" aria-label="任务视图">
          {TASK_VIEWS.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className={view === mode.value ? 'dswf-tt-seg-btn is-active' : 'dswf-tt-seg-btn'}
              data-dswf-tt-view={mode.value}
              aria-pressed={view === mode.value}
              title={`${mode.label}视图`}
              onClick={() => {
                onViewChange(mode.value)
              }}
            >
              {mode.label}
            </button>
          ))}
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
  readonly onToggleStatus: (status: TaskStatus) => void
  readonly onClearStatuses: () => void
  // ── 装配注入（4.1 接线） ──
  /** 受控 feature 选中（UF-3 pill 导航载荷——4.2 注入；否则活跃 feature 缺省 + 本地切换） */
  readonly featureSlug?: string
  /** 行/节点/卡片点击 → 抽屉回调 */
  readonly onOpenTask?: (taskId: string) => void
  /** ⋯ 转移预设 → 3.8 对话框 */
  readonly onTransition?: (taskId: string) => void
  /** 抽屉开着的任务（三视图高亮） */
  readonly activeTaskId?: string
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

/**
 * 任务子 tab 装载壳：本地态 = 视图模式 + feature 选中（受控注入优先）+ feature 菜单
 * 开合；数据装载归 useTasksTabLoad（chips/搜索/排序服务端承载 + DAG graph + 事件重取）。
 */
export function TasksTab({
  projectId,
  search,
  sort,
  activeStatuses,
  statusFilter,
  features,
  onToggleStatus,
  onClearStatuses,
  featureSlug: controlledFeature,
  onOpenTask,
  onTransition,
  activeTaskId,
  makeClient,
}: TasksTabProps): ReactNode {
  const [localFeature, setLocalFeature] = useState<string | undefined>(undefined)
  const [view, setView] = useState<TaskViewMode>('list')
  const [featureMenuOpen, setFeatureMenuOpen] = useState(false)
  const resolved = resolveFeatureSlug(features, controlledFeature ?? localFeature)
  const [load, { retry }] = useTasksTabLoad(projectId, resolved, view, statusFilter, search, sort, makeClient)

  const handleFeatureSelect = useCallback((slug: string): void => {
    setLocalFeature(slug)
  }, [])
  const handleViewChange = useCallback((mode: TaskViewMode): void => {
    setView(mode)
  }, [])

  return (
    <TasksTabBody
      search={search}
      activeStatuses={activeStatuses}
      features={features}
      onToggleStatus={onToggleStatus}
      onClearStatuses={onClearStatuses}
      featureSlug={resolved}
      view={view}
      featureMenuOpen={featureMenuOpen}
      onFeatureSelect={handleFeatureSelect}
      onViewChange={handleViewChange}
      onFeatureMenuOpenChange={setFeatureMenuOpen}
      load={load}
      onRetry={retry}
      {...(onOpenTask !== undefined ? { onOpenTask } : {})}
      {...(onTransition !== undefined ? { onTransition } : {})}
      {...(activeTaskId !== undefined ? { activeTaskId } : {})}
    />
  )
}
