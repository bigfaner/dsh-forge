// 左栏工作区面板（定位：业务——UF-1：槽位路线 A 替换官方 sidebar 壳 sidebar.workspaces 洞位的
// 产品面板本体）。纯展示件：数据进（tree/loading/current）、回调出（导航动作），装配缝 =
// ForgeSidebarSlot（洞位注册真身，plugin 经产品视图发布面引用）。
// 形态纪律（Hard Rule 官方件复用）：项目节点 = 官方 DisclosureRow；状态点 = 官方 StateDot；
// 悬停提示 = 官方 Tooltip；头部图标钮 = 官方 Button（ghost/sm——侧栏行语言透明底 + 仅 hover
// 底，fix-13：toolbar 变体常驻底色误用退役）+ 官方图标件（fix-17：＋钮 = 官方
// IconProjectAddOutlineRegular 文件夹+加号件——原生 dsh 同款，自绘纯加号与 26px 自绘钮刻度
// 退役，同排三钮行语言一致）；过滤输入 =
// 官方 Input；视图选项弹层 = 官方 Menu（fix-6 补齐——原型 sb-head 四件基准）；
// 行语言（高 32/34、hover interactive-bg、radius md）对齐官方 sidebar 行形态
// （ui-workspace Rows 同型刻度），本文件零平行发明。
// 收起/展开（56px rail ↔ ~240px）由官方壳几何持有——本面板按 owner share 的 wide 双态渲染。
// 分层（fix-6，WorkbenchZones→WorkbenchPanel 同型）：ForgeWorkspacePanel = 过滤/视图菜单
// 态机持有者；SidebarProjectsZone = 受控展示件（过滤应用/行内空提示/相位正交的静态可测面）。
import { useState, type ReactNode } from 'react'
import {
  Button,
  DisclosureRow,
  IconDeliverDocRegular,
  IconFolderCloseRegular,
  IconProjectAddOutlineRegular,
  IconSearchOutlineRegular,
  IconSlidersTwoOutlineRegular,
  Input,
  Menu,
  StateDot,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState } from '../../components/index.js'
import {
  relativeTimeLabel,
  sessionDotState,
  sidebarFilterOf,
  type SidebarProjectNode,
} from './sidebar-model.js'
import './sidebar.css'

/** 会话加载骨架行数（行级骨架相位——账本 pending） */
const SKELETON_ROWS = 3

export interface ForgeWorkspacePanelProps {
  /** 壳折叠态（sidebar.workspaces owner share：true = 宽面板，false = 56px rail 图标列） */
  readonly wide: boolean
  /** rail 图标请求展开（壳回调；知识视图切换不需要宽面板——保留给需宽 UI 的入口） */
  readonly expandSidebar: () => void
  /** 项目树（buildSidebarTree 派生；含每项目会话行） */
  readonly tree: readonly SidebarProjectNode[]
  /** 账本未就绪（行级骨架） */
  readonly loading: boolean
  /** 当前会话 id（行高亮依据；null = 未选） */
  readonly currentSessionId: string | null
  /** 项目列表就绪（false = RPC 在途——骨架相位，防空态闪现） */
  readonly projectsPending: boolean
  /** 是否有项目（就绪且非空；空态判据 = 首用引导指向 hero UF-2） */
  readonly hasProjects: boolean
  /** 项目列表加载失败文案（在场 = 错误条相位） */
  readonly projectsError?: string
  /** 知识库入口回调（视图切换 show-knowledge——AC3） */
  readonly onOpenKnowledge?: () => void
  /** 「＋」添加项目入口（UF-3 流程打开缝——槽位层绑定 openAddProjectFlow；缺席 = 不呈现） */
  readonly onAddProject?: () => void
  /** 会话行回调（打开会话 + select-session——AC5） */
  readonly onSessionActivate?: (sessionId: string) => void
  /** 项目列表重试（错误条相位） */
  readonly onRetryProjects?: () => void
  /** 相对时间基准（注入——纯渲染可测） */
  readonly now: number
}

/** 知识库入口行（宽态：图标 + 文案；UF-1 导航项 3——P1 无待审核徽标） */
function KnowledgeEntry({ onClick }: { onClick?: () => void }): ReactNode {
  return (
    <button
      type="button"
      className="dswf-sidebar-entry"
      data-dswf-nav="knowledge"
      aria-label="知识库"
      onClick={onClick}
    >
      <IconDeliverDocRegular size={16} />
      <span className="dswf-sidebar-entry-label">知识库</span>
    </button>
  )
}

/** 会话行（dsh 行语言：状态点 + 标题 + 相对时间；官方 sessionRow 同型刻度） */
function SessionRow({
  row,
  selected,
  now,
  onActivate,
}: {
  row: SidebarProjectNode['sessions'][number]
  selected: boolean
  now: number
  onActivate?: (sessionId: string) => void
}): ReactNode {
  return (
    <button
      type="button"
      className="dswf-sidebar-session"
      data-dswf-session={row.sessionId}
      data-selected={selected || undefined}
      onClick={onActivate === undefined ? undefined : () => { onActivate(row.sessionId) }}
    >
      <span className="dswf-sidebar-session-dot">
        <StateDot state={sessionDotState(row.status)} size={10} />
      </span>
      <span className="dswf-sidebar-session-title">{row.title}</span>
      <span className="dswf-sidebar-session-time">{relativeTimeLabel(row.updatedAt, now)}</span>
    </button>
  )
}

/** 一个项目块：官方 DisclosureRow 节点 + 会话行列表（空会话行内占位——文案随过滤态切换：
 * 无过滤「暂无会话」/ 过滤中「无匹配会话」，原型 sess-empty-note 同型） */
function ProjectBlock({
  node,
  expanded,
  onToggle,
  currentSessionId,
  now,
  onSessionActivate,
  emptyNote,
}: {
  node: SidebarProjectNode
  expanded: boolean
  onToggle: () => void
  currentSessionId: string | null
  now: number
  onSessionActivate?: (sessionId: string) => void
  readonly emptyNote: string
}): ReactNode {
  return (
    <div className="dswf-sidebar-project" data-dswf-project={node.projectId} data-archived={node.archived || undefined}>
      <DisclosureRow
        icon={<IconFolderCloseRegular size={16} />}
        title={node.name}
        open={expanded}
        expandable={node.sessions.length > 0}
        onToggle={onToggle}
        className="dswf-sidebar-project-row"
        titleClassName="dswf-sidebar-project-title"
      >
        <div className="dswf-sidebar-sessions" role="list">
          {node.sessions.map((row) => (
            <SessionRow
              key={row.sessionId}
              row={row}
              selected={row.sessionId === currentSessionId}
              now={now}
              onActivate={onSessionActivate}
            />
          ))}
        </div>
      </DisclosureRow>
      {node.sessions.length === 0 ? <div className="dswf-sidebar-no-session">{emptyNote}</div> : null}
    </div>
  )
}

/** 行级骨架（账本 pending 相位——UF-1 States「会话加载中」） */
function SkeletonRows(): ReactNode {
  return (
    <div className="dswf-sidebar-skeleton" data-dswf-skeleton aria-hidden="true">
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className="dswf-sidebar-skeleton-row" />
      ))}
    </div>
  )
}

/** 过滤行（fix-6：官方 Input 受控件——前导检索图标；占位/aria 文案对齐原型 sb-searchrow；
 * Esc 收起并清空 = 原型 S.pj 交互语义；autoFocus = 展开即聚焦，原型 toggle 后 focus 同型） */
export interface SidebarFilterRowProps {
  /** 过滤查询（受控——态机单一来源在面板层） */
  readonly query: string
  /** 查询变更（原样上抛——过滤即时生效经 sidebarFilterOf 纯函数） */
  readonly onQueryChange: (query: string) => void
  /** 收起过滤行（Esc——收起即清空查询，原型语义） */
  readonly onCollapse: () => void
}

/** 过滤行本体（官方 Input——零自绘输入控件） */
export function SidebarFilterRow({ query, onQueryChange, onCollapse }: SidebarFilterRowProps): ReactNode {
  return (
    <div className="dswf-sidebar-searchrow" data-dswf-searchrow="">
      <Input
        icon={<IconSearchOutlineRegular size={14} />}
        className="dswf-sidebar-search"
        type="text"
        placeholder="过滤项目名 / 会话标题…"
        aria-label="项目与会话过滤"
        autoFocus
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCollapse()
        }}
      />
    </div>
  )
}

/** 视图选项菜单项（P1 占位形态——AC：呈现「按项目树」当前项 + 后续里程碑说明，不做实际排列逻辑） */
export const SIDEBAR_VIEW_MENU_ITEMS: readonly MenuEntry[] = [
  { id: 'tree', label: '按项目树' },
  { type: 'separator', id: 'view-sep' },
  { type: 'label', id: 'view-note', text: '更多排列选项归后续里程碑' },
]

/** 视图选项当前项（P1 唯一排列形态——原型基准确立，实际排列归后续里程碑） */
export const SIDEBAR_VIEW_MENU_SELECTED_ID = 'tree'

/** 项目区受控展示缝（fix-6 抽出——过滤应用/空提示/相位正交的静态可测面） */
export interface SidebarProjectsZoneProps {
  /** 项目树（buildSidebarTree 派生；含每项目会话行） */
  readonly tree: readonly SidebarProjectNode[]
  /** 账本未就绪（行级骨架） */
  readonly loading: boolean
  /** 当前会话 id（行高亮依据；null = 未选——过滤不改变选中态，锚由本入参持有） */
  readonly currentSessionId: string | null
  /** 项目列表就绪（false = RPC 在途——骨架相位） */
  readonly projectsPending: boolean
  /** 是否有项目（就绪且非空；空态判据 = 首用引导指向 hero UF-2） */
  readonly hasProjects: boolean
  /** 项目列表加载失败文案（在场 = 错误条相位） */
  readonly projectsError?: string
  /** 「＋」添加项目入口（缺席 = 不呈现；既有锚 data-dswf-nav 不动） */
  readonly onAddProject?: () => void
  /** 会话行回调（打开会话 + select-session） */
  readonly onSessionActivate?: (sessionId: string) => void
  /** 项目列表重试（错误条相位） */
  readonly onRetryProjects?: () => void
  /** 相对时间基准（注入——纯渲染可测） */
  readonly now: number
  /** 过滤行展开态（受控——态机在面板层） */
  readonly searchOpen: boolean
  /** 过滤行展开/收起切换（收起即清空查询——原型语义，由态机持有者执行） */
  readonly onSearchToggle: () => void
  /** 过滤查询（受控——sidebarFilterOf 纯函数即时生效；空串 = 不过滤） */
  readonly query: string
  /** 查询变更（原样上抛） */
  readonly onQueryChange: (query: string) => void
  /** 视图选项菜单开合态（受控） */
  readonly viewMenuOpen: boolean
  /** 视图选项菜单开合切换（官方 Menu onClose/onSelect 同归此缝） */
  readonly onViewMenuOpenChange: (open: boolean) => void
}

/**
 * 项目区本体（受控展示件）：头部四件（label + 搜索钮 + 视图选项钮 + ＋）+ 过滤行 +
 * 相位主体。相位：项目错误条 > 骨架（账本 pending / 项目 RPC 在途——防空态闪现）>
 * 首用空态（无项目 → 引导指向 hero UF-2）> 项目树（过滤态下 = 过滤树 / 行内空提示）。
 * 过滤与相位正交：错误/骨架/首用空态不受查询影响；树相位下过滤无结果 = 行内
 * 「无匹配项目/会话」提示（UF-1 States 过滤无结果）。项目块展开态是本件内部纯视图
 * 微观态（缺省全展开——与过滤态互不触碰，清过滤即恢复可见）。
 */
export function SidebarProjectsZone({
  tree,
  loading,
  currentSessionId,
  projectsPending,
  hasProjects,
  projectsError,
  onAddProject,
  onSessionActivate,
  onRetryProjects,
  now,
  searchOpen,
  onSearchToggle,
  query,
  onQueryChange,
  viewMenuOpen,
  onViewMenuOpenChange,
}: SidebarProjectsZoneProps): ReactNode {
  // 展开态（折叠集合——缺省全展开，P1 最简；展开态是纯视图态，不属 SC2 副本纪律）
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set())
  const isExpanded = (projectId: string): boolean => !collapsedIds.has(projectId)
  const toggleProject = (projectId: string): void => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }
  // 过滤应用（纯函数投影——数据源不变；选中锚 currentSessionId 与过滤正交）
  const filterActive = query.trim() !== ''
  const visibleTree = sidebarFilterOf(query, tree)
  return (
    <div className="dswf-sidebar-projects">
      <div className="dswf-sidebar-sectionhead">
        <div className="dswf-sidebar-sectionlabel">项目</div>
        <Button
          variant="ghost"
          size="sm"
          className="dswf-sidebar-headbtn"
          data-dswf-search-toggle=""
          aria-label="搜索项目与会话"
          aria-pressed={searchOpen}
          title="搜索（项目名 + 会话标题）"
          onClick={onSearchToggle}
        >
          <IconSearchOutlineRegular size={14} />
        </Button>
        <Menu
          className="dswf-sidebar-headmenu"
          open={viewMenuOpen}
          onClose={() => {
            onViewMenuOpenChange(false)
          }}
          onSelect={() => {
            onViewMenuOpenChange(false)
          }}
          items={SIDEBAR_VIEW_MENU_ITEMS}
          selectedId={SIDEBAR_VIEW_MENU_SELECTED_ID}
          portal
          anchor={
            <Button
              variant="ghost"
              size="sm"
              className="dswf-sidebar-headbtn"
              data-dswf-view-menu=""
              aria-label="视图选项"
              aria-haspopup="menu"
              aria-expanded={viewMenuOpen}
              title="视图选项（排列：P1 按项目树）"
              onClick={() => {
                onViewMenuOpenChange(true)
              }}
            >
              <IconSlidersTwoOutlineRegular size={14} />
            </Button>
          }
        />
        {onAddProject === undefined ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="dswf-sidebar-headbtn"
            data-dswf-nav="add-project"
            aria-label="添加项目"
            title="添加项目"
            onClick={onAddProject}
          >
            <IconProjectAddOutlineRegular size={16} />
          </Button>
        )}
      </div>
      {searchOpen ? (
        <SidebarFilterRow query={query} onQueryChange={onQueryChange} onCollapse={onSearchToggle} />
      ) : null}
      {projectsError !== undefined ? (
        <div className="dswf-sidebar-error" data-dswf-error role="alert">
          <span>项目列表加载失败</span>
          {onRetryProjects !== undefined ? (
            <button type="button" className="dswf-sidebar-retry" onClick={onRetryProjects}>
              重试
            </button>
          ) : null}
        </div>
      ) : loading || projectsPending ? (
        <SkeletonRows />
      ) : !hasProjects ? (
        <EmptyState
          title="尚未注册项目"
          description="在中间引导页点击「添加项目」，注册你的第一个项目"
        />
      ) : filterActive && visibleTree.length === 0 ? (
        <div className="dswf-sidebar-filterempty" data-dswf-filterempty>无匹配项目/会话</div>
      ) : (
        visibleTree.map((node) => (
          <ProjectBlock
            key={node.projectId}
            node={node}
            expanded={isExpanded(node.projectId)}
            onToggle={() => { toggleProject(node.projectId) }}
            currentSessionId={currentSessionId}
            now={now}
            onSessionActivate={onSessionActivate}
            emptyNote={filterActive ? '无匹配会话' : '暂无会话'}
          />
        ))
      )}
    </div>
  )
}

/**
 * 产品工作区面板（sidebar.workspaces 占用者本体——过滤/视图菜单态机持有者）。
 * 宽态：知识库入口行 + 项目区（SidebarProjectsZone）；rail 态：知识库图标（悬停提示）。
 * 过滤态机（fix-6）：searchOpen/query 纯视图态；收起即清空查询（原型 S.pj 语义——
 * 过滤掉当前选中项不重置锚，清过滤即恢复可见，PRD UF-1 Validation）。
 * useState 先于 rail 早退分支（hook 顺序稳定——wide 翻转不重挂）。
 */
export function ForgeWorkspacePanel({
  wide,
  tree,
  loading,
  currentSessionId,
  projectsPending,
  hasProjects,
  projectsError,
  onOpenKnowledge,
  onAddProject,
  onSessionActivate,
  onRetryProjects,
  now,
}: ForgeWorkspacePanelProps): ReactNode {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  // 搜索钮展开/收起（Esc 同走此缝——收起即清空；展开从空查询开始）
  const onSearchToggle = (): void => {
    setSearchOpen((prev) => !prev)
    setQuery('')
  }

  // rail 态：图标列（壳已供折叠/展开/新会话图标——本面板只补知识库入口）
  if (!wide) {
    return (
      <div className="dswf-sidebar dswf-sidebar-rail" data-dswf-sidebar="rail">
        <Tooltip label="知识库" side="right" delayMs={500}>
          <button
            type="button"
            className="dswf-sidebar-railbtn"
            data-dswf-nav="knowledge"
            aria-label="知识库"
            onClick={onOpenKnowledge}
          >
            <IconDeliverDocRegular size={18} />
          </button>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="dswf-sidebar" data-dswf-sidebar="wide" aria-label="项目与会话">
      <div className="dswf-sidebar-entryrow">
        <KnowledgeEntry onClick={onOpenKnowledge} />
      </div>
      <SidebarProjectsZone
        tree={tree}
        loading={loading}
        currentSessionId={currentSessionId}
        projectsPending={projectsPending}
        hasProjects={hasProjects}
        projectsError={projectsError}
        onAddProject={onAddProject}
        onSessionActivate={onSessionActivate}
        onRetryProjects={onRetryProjects}
        now={now}
        searchOpen={searchOpen}
        onSearchToggle={onSearchToggle}
        query={query}
        onQueryChange={setQuery}
        viewMenuOpen={viewMenuOpen}
        onViewMenuOpenChange={setViewMenuOpen}
      />
    </div>
  )
}
