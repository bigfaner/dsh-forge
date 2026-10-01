// 左栏工作区面板（定位：业务——UF-1：槽位路线 A 替换官方 sidebar 壳 sidebar.workspaces 洞位的
// 产品面板本体）。纯展示件：数据进（tree/loading/current）、回调出（导航动作），装配缝 =
// ForgeSidebarSlot（洞位注册真身，plugin 经产品视图发布面引用）。
// 形态纪律（Hard Rule 官方件复用）：项目节点 = 官方 DisclosureRow；状态点 = 官方 StateDot；
// 悬停提示 = 官方 Tooltip；行语言（高 32/34、hover interactive-bg、radius md）对齐官方
// sidebar 行形态（ui-workspace Rows 同型刻度），本文件零平行发明。
// 收起/展开（56px rail ↔ ~240px）由官方壳几何持有——本面板按 owner share 的 wide 双态渲染。
import { useState, type ReactNode } from 'react'
import {
  DisclosureRow,
  IconDeliverDocRegular,
  IconFolderCloseRegular,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState } from '../../components/index.js'
import {
  relativeTimeLabel,
  sessionDotState,
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

/** 一个项目块：官方 DisclosureRow 节点 + 会话行列表（空项目行内「暂无会话」占位） */
function ProjectBlock({
  node,
  expanded,
  onToggle,
  currentSessionId,
  now,
  onSessionActivate,
}: {
  node: SidebarProjectNode
  expanded: boolean
  onToggle: () => void
  currentSessionId: string | null
  now: number
  onSessionActivate?: (sessionId: string) => void
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
      {node.sessions.length === 0 ? <div className="dswf-sidebar-no-session">暂无会话</div> : null}
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

/**
 * 产品工作区面板（sidebar.workspaces 占用者本体）。
 * 宽态：知识库入口行 + 项目区（section 标签 + 项目块列表）；rail 态：知识库图标（悬停提示）。
 * 相位：项目错误条 > 骨架（账本 pending / 项目 RPC 在途——防空态闪现）>
 * 首用空态（无项目 → 引导指向 hero UF-2）> 项目树。
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
  onSessionActivate,
  onRetryProjects,
  now,
}: ForgeWorkspacePanelProps): ReactNode {
  // 展开态（折叠集合——缺省全展开，P1 最简；展开态是纯视图态，不属 SC2 副本纪律）。
  // useState 先于 rail 早退分支（hook 顺序稳定——wide 翻转不重挂）。
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
      <div className="dswf-sidebar-projects">
        <div className="dswf-sidebar-sectionlabel">项目</div>
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
        ) : (
          tree.map((node) => (
            <ProjectBlock
              key={node.projectId}
              node={node}
              expanded={isExpanded(node.projectId)}
              onToggle={() => { toggleProject(node.projectId) }}
              currentSessionId={currentSessionId}
              now={now}
              onSessionActivate={onSessionActivate}
            />
          ))
        )}
      </div>
    </div>
  )
}
