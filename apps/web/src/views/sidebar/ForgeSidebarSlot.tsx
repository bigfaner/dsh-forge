// 左栏槽位注册件（定位：业务装配——sidebar.workspaces 洞位占用者的接线层）。
// 组合缝（三面进、面板出）：
//   1. 壳 owner share（wide / expandSidebar——上游 SidebarSectionOwnerProps 契约）；
//   2. 插件 inject face（dsh 账本快照源 + workspace 归属快照源 + openSession——
//      client-plugin 经 ctx.slots.register 注入面携带，本组件 useSyncExternalStore 直读
//      ——SC2 零缓存零副本：无本地快照持有，每次渲染读快照源）；
//   3. 项目 RPC（useForgeProjects——forge:projects/list）。
// 导航动作经 sidebar-actions 绑定（openSession = dsh 面；视图事件 = 工作台桥）。
// 本组件由产品视图发布面（product-views.ts）挂到 window.__DSH_FORGE_VIEWS__，插件
// 槽位注册以该发布件为组件本体——壳 bundle 的 React 与渲染器单例同源（平台模块表）。
import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import { openAddProjectFlow } from '../../flows/add-project/flow-open.js'
import { ForgeWorkspacePanel } from './ForgeWorkspacePanel.js'
import { sidebarActions } from './sidebar-actions.js'
import {
  buildSidebarTree,
  type LedgerSessionsSnapshot,
  type LedgerWorkspacesSnapshot,
  type SnapshotSource,
} from './sidebar-model.js'
import { useForgeProjects } from './use-forge-projects.js'

/** 槽位注入面（插件侧 register inject 携带——sidebar-actions 的 openSession 源） */
export interface ForgeSidebarSlotProps {
  /** 壳折叠态（true = 宽面板；false = 56px rail 图标列） */
  readonly wide: boolean
  /** rail 图标请求展开（壳回调） */
  readonly expandSidebar: () => void
  /** dsh 会话账本快照源（ctx.sessions.list——实时读） */
  readonly sessions: SnapshotSource<LedgerSessionsSnapshot>
  /** dsh workspace 归属快照源（ctx.workspaces.list） */
  readonly workspaces: SnapshotSource<LedgerWorkspacesSnapshot>
  /** 打开 dsh 会话（ctx.sessions.open） */
  readonly openSession: (sessionId: string) => void
}

/**
 * sidebar.workspaces 占用者（接线层）：快照直读 + 项目 RPC + 动作绑定 → ForgeWorkspacePanel。
 * useSyncExternalStore 订阅/读取一律经闭包绑定（dsh 快照源 = 类方法——裸引用脱离 this 即崩，
 * e2e 探针实证 refreshSnapshot undefined）；第三参 = SSR 快照（单测面同源直读）。
 */
export function ForgeSidebarSlot({
  wide,
  expandSidebar,
  sessions,
  workspaces,
  openSession,
}: ForgeSidebarSlotProps): ReactNode {
  const subscribeSessions = useCallback((onChange: () => void) => sessions.subscribe(onChange), [sessions])
  const readSessions = useCallback(() => sessions.getSnapshot(), [sessions])
  const subscribeWorkspaces = useCallback((onChange: () => void) => workspaces.subscribe(onChange), [workspaces])
  const readWorkspaces = useCallback(() => workspaces.getSnapshot(), [workspaces])
  const sessionsSnap = useSyncExternalStore(subscribeSessions, readSessions, readSessions)
  const workspacesSnap = useSyncExternalStore(subscribeWorkspaces, readWorkspaces, readWorkspaces)
  const [projectsState, retryProjects] = useForgeProjects(workspacesSnap)
  const actions = sidebarActions(openSession)
  // 「＋」入口 → 添加项目流程打开缝（跨单元直达流程宿主；缺席 fail-soft warn——2.12 装配前 no-op）
  const onAddProject = useCallback(() => {
    openAddProjectFlow()
  }, [])
  const { tree, loading, currentSessionId } = buildSidebarTree({
    projects: projectsState.phase === 'ready' ? projectsState.projects : [],
    sessions: sessionsSnap,
    workspaces: workspacesSnap,
  })
  return (
    <ForgeWorkspacePanel
      wide={wide}
      expandSidebar={expandSidebar}
      tree={tree}
      loading={loading}
      currentSessionId={currentSessionId}
      projectsPending={projectsState.phase !== 'ready'}
      hasProjects={projectsState.phase === 'ready' && projectsState.projects.length > 0}
      projectsError={projectsState.phase === 'error' ? projectsState.message : undefined}
      onOpenKnowledge={actions.onOpenKnowledge}
      onAddProject={onAddProject}
      onSessionActivate={actions.onSessionActivate}
      onRetryProjects={retryProjects}
      now={Date.now()}
    />
  )
}
