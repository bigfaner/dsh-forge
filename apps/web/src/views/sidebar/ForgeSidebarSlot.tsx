// 左栏槽位注册件（定位：业务装配——sidebar.workspaces 洞位占用者的接线层）。
// 组合缝（三面进、面板出）：
//   1. 壳 owner share（wide / expandSidebar——上游 SidebarSectionOwnerProps 契约）；
//   2. 插件 inject face（dsh 账本快照源 + workspace 归属快照源 + openSession +
//      startSession（fix-42 新会话钮官方面）——client-plugin 经 ctx.slots.register 注入面
//      携带，本组件 useSyncExternalStore 直读——SC2 零缓存零副本：无本地快照持有，每次
//      渲染读快照源）；
//   3. 项目 RPC（useForgeProjects——forge:projects/list；变更动作经 update patch 面 +
//      静默重拉，fix-42）。
// 导航/变更动作经 sidebarActions 绑定（openSession/startSession = dsh 面；改名/归档切换 =
// forge:projects/update RPC 面——name patch 的 workspace 标题对齐归 core 侧 fix-33 ⑪；
// fix-25：知识入口迁官方 sidebar.panellist 行，产品桥视图事件退役——会话行打开即官方回
// 会话面板）。
// 本组件由产品视图发布面（product-views.ts）挂到 window.__DSH_FORGE_VIEWS__，插件
// 槽位注册以该发布件为组件本体——壳 bundle 的 React 与渲染器单例同源（平台模块表）。
import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import { openAddProjectFlow } from '../../flows/add-project/flow-open.js'
import { preloadRpcClientFactory } from '../../rpc/index.js'
import { ForgeWorkspacePanel } from './ForgeWorkspacePanel.js'
import { sidebarActions } from './sidebar-actions.js'
import {
  buildSidebarTree,
  type LedgerSessionsSnapshot,
  type LedgerWorkspacesSnapshot,
  type SnapshotSource,
} from './sidebar-model.js'
import { useForgeProjects } from './use-forge-projects.js'

/** 槽位注入面（插件侧 register inject 携带——sidebar-actions 的官方面源） */
export interface ForgeSidebarSlotProps {
  /** 壳折叠态（true = 宽面板；false = 56px rail 图标列） */
  readonly wide: boolean
  /** rail 图标请求展开（壳回调） */
  readonly expandSidebar: () => void
  /** dsh 会话账本快照源（ctx.sessions.list——实时读） */
  readonly sessions: SnapshotSource<LedgerSessionsSnapshot>
  /** dsh workspace 归属快照源（ctx.workspaces.list） */
  readonly workspaces: SnapshotSource<LedgerWorkspacesSnapshot>
  /** 打开 dsh 会话（官方 uiWorkspace.openSession 导航面——fix-11 修正接线，插件 inject face 注入） */
  readonly openSession: (sessionId: string) => void
  /** 项目行尾「新会话」钮（官方 uiWorkspace.startSession(workspaceId) 新会话流——fix-42，插件 inject face 注入） */
  readonly startSession: (workspaceId: string) => void
}

/**
 * sidebar.workspaces 占用者（接线层）：快照直读 + 项目 RPC + 动作绑定 → ForgeWorkspacePanel。
 * useSyncExternalStore 订阅/读取一律经闭包绑定（dsh 快照源 = 类方法——裸引用脱离 this 即崩，
 * e2e 探针实证 refreshSnapshot undefined）；第三参 = SSR 快照（单测面同源直读）。
 * 变更动作（改名/归档切换）= forge:projects/update + 静默重拉（silentRefresh——应用侧行
 * 改写不触发 workspace 快照锚，fix-24 注记口径；RPC 缺席期（preload 面未就绪）失败归
 * 调用面：改名模态呈现/归档 fail-soft 告警）。
 */
export function ForgeSidebarSlot({
  wide,
  expandSidebar,
  sessions,
  workspaces,
  openSession,
  startSession,
}: ForgeSidebarSlotProps): ReactNode {
  const subscribeSessions = useCallback((onChange: () => void) => sessions.subscribe(onChange), [sessions])
  const readSessions = useCallback(() => sessions.getSnapshot(), [sessions])
  const subscribeWorkspaces = useCallback((onChange: () => void) => workspaces.subscribe(onChange), [workspaces])
  const readWorkspaces = useCallback(() => workspaces.getSnapshot(), [workspaces])
  const sessionsSnap = useSyncExternalStore(subscribeSessions, readSessions, readSessions)
  const workspacesSnap = useSyncExternalStore(subscribeWorkspaces, readWorkspaces, readWorkspaces)
  const [projectsState, retryProjects, silentRefreshProjects] = useForgeProjects(workspacesSnap)
  const actions = sidebarActions({
    openSession,
    startSession,
    updateProject: (id, patch) => preloadRpcClientFactory().projects.update(id, patch),
    onProjectsMutated: silentRefreshProjects,
  })
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
      onAddProject={onAddProject}
      onSessionActivate={actions.onSessionActivate}
      onRetryProjects={retryProjects}
      onStartSession={actions.onStartSession}
      onRenameProject={actions.onRenameProject}
      onArchiveToggle={actions.onArchiveToggle}
      now={Date.now()}
    />
  )
}
