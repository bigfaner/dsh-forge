// 左栏槽位注册件（定位：业务装配——sidebar.workspaces 洞位占用者的接线层）。
// 1.6 自 apps/web 壳侧 views/sidebar 平移本包（fix-13 模式——装配缝归插件域，官方宿主
// 不装载产品壳时本面仍随插件 bundle 自注册；AGENTS §1.3）。组合缝（三面进、面板出）：
//   1. 官方 owner share（wide / expandSidebar——ui-sidebar SidebarSectionOwnerProps 契约）；
//   2. 注册 inject face（dsh 账本快照源 + workspace 归属快照源 + openSession +
//      startSession（fix-42 新会话钮官方面，waitForWorkspacePresent 在场门单源）+ D45
//      会话行动作面（置顶/取消置顶/归档/取消归档/分叉/改名——sessionActionFaceOf 逐位
//      组装，本包 ui/session-actions.ts）——本组件 useSyncExternalStore 直读——SC2 零缓存
//      零副本：无本地快照持有，每次渲染读快照源）；
//   3. 项目 RPC（useForgeProjects——forge:projects/list，Typert 正典 ui/rpc 面；
//      变更动作经 update patch 面 + 静默重拉，fix-42）。
// 导航/变更动作经 sidebarActions 绑定（openSession/startSession/会话行动作 = dsh 面；
// 改名/归档切换 = forge:projects/update RPC 面——name patch 的 workspace 标题对齐归
// core 侧 fix-33 ⑪）。
// 「＋」入口收口（用户裁决 2026-11-12）：「＋ 添加项目」入口不在项目列表内——列表头部/
// rail 轨内零入口；唯一残存入口 = 无项目空态 CTA（onAddProject 经 phaseBody 空态消费）。
// 1.8 D 类接线：流程宿主（AddProjectFlow）随本槽位件常驻挂载——官方宿主无壳装配期，
// 页内缝 __DSH_FORGE_ADD_PROJECT_FLOW__ 由本面发布，空态 CTA 与 hero CTA 两入口直达。
import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import { AddProjectFlow, openAddProjectFlow } from '../add-project/index.js'
import { useWorkspaceProjectMap } from '../anchored-projects.js'
import { preloadRpcClientFactory } from '../rpc.js'
import { ForgeWorkspacePanel } from './ForgeWorkspacePanel.js'
import { sidebarActions } from './sidebar-actions.js'
import { useForgeProjects } from './use-forge-projects.js'
import {
  buildSidebarTree,
  type LedgerSessionsSnapshot,
  type LedgerWorkspacesSnapshot,
  type SnapshotSource,
} from './sidebar-model.js'

/** 槽位注入面（注册面 register inject 携带——sidebar-actions 的官方面源） */
export interface ForgeSidebarSlotProps {
  /** 官方壳折叠态（true = 宽面板；false = 56px rail 图标列） */
  readonly wide: boolean
  /** rail 图标请求展开（官方壳回调） */
  readonly expandSidebar: () => void
  /** dsh 会话账本快照源（ctx.sessions.list——实时读） */
  readonly sessions: SnapshotSource<LedgerSessionsSnapshot>
  /** dsh workspace 归属快照源（ctx.workspaces.list） */
  readonly workspaces: SnapshotSource<LedgerWorkspacesSnapshot>
  /** 打开 dsh 会话（官方 uiWorkspace.openSession 导航面——fix-11 修正接线） */
  readonly openSession: (sessionId: string) => void
  /** 项目行尾「新会话」钮（官方 uiWorkspace.startSession(workspaceId) 新会话流——fix-42） */
  readonly startSession: (workspaceId: string) => void
  /**
   * 置顶会话（官方 uiWorkspace.pinSession——D45；缺席 = 置顶钮/菜单项不呈现）。
   * 绑定面 = sidebarActions onSessionPinToggle（pinned 位分派 pin/unpin 官方面）。
   */
  readonly pinSession?: (sessionId: string) => Promise<void>
  /** 取消置顶（官方 uiWorkspace.unpinSession——D45；缺席 = 对应面不呈现） */
  readonly unpinSession?: (sessionId: string) => Promise<void>
  /**
   * 归档会话（官方 uiWorkspace.archiveSession——D45；缺席 = 归档钮/菜单项不呈现）。
   * 运行中会话拒绝上抛 → 面板「停止并归档」确认模态（options.stopPropagation 语义归面板）。
   */
  readonly archiveSession?: (
    sessionId: string,
    options?: { readonly stopActivity?: boolean },
  ) => Promise<void>
  /** 取消归档（官方 uiWorkspace.unarchiveSession——D45；缺席 = 对应面不呈现） */
  readonly unarchiveSession?: (sessionId: string) => Promise<void>
  /** 分叉会话（官方 uiWorkspace.forkSession——D45；缺席 = 分叉菜单项不呈现） */
  readonly forkSession?: (sessionId: string) => Promise<unknown>
  /** 会话改名（sessions.using → binding.session.rename——D45；缺席 = 改名菜单项不呈现） */
  readonly renameSession?: (sessionId: string, title: string) => Promise<void>
}

/**
 * sidebar.workspaces 占用者（接线层）：快照直读 + 项目 RPC + 动作绑定 → ForgeWorkspacePanel。
 * useSyncExternalStore 订阅/读取一律经闭包绑定（dsh 快照源 = 类方法——裸引用脱离 this 即崩，
 * e2e 探针实证 refreshSnapshot undefined）；第三参 = SSR 快照（单测面同源直读）。
 * 变更动作（改名/归档切换）= forge:projects/update + 静默重拉（silentRefresh——应用侧行
 * 改写不触发 workspace 快照锚，fix-24 注记口径；RPC 缺席期失败归调用面：改名模态呈现/
 * 归档 fail-soft 告警）。
 */
export function ForgeSidebarSlot({
  wide,
  expandSidebar,
  sessions,
  workspaces,
  openSession,
  startSession,
  pinSession,
  unpinSession,
  archiveSession,
  unarchiveSession,
  forkSession,
  renameSession,
}: ForgeSidebarSlotProps): ReactNode {
  const subscribeSessions = useCallback((onChange: () => void) => sessions.subscribe(onChange), [sessions])
  const readSessions = useCallback(() => sessions.getSnapshot(), [sessions])
  const subscribeWorkspaces = useCallback((onChange: () => void) => workspaces.subscribe(onChange), [workspaces])
  const readWorkspaces = useCallback(() => workspaces.getSnapshot(), [workspaces])
  const sessionsSnap = useSyncExternalStore(subscribeSessions, readSessions, readSessions)
  const workspacesSnap = useSyncExternalStore(subscribeWorkspaces, readWorkspaces, readWorkspaces)
  const [projectsState, retryProjects, silentRefreshProjects] = useForgeProjects(workspacesSnap)
  // 工作区归属索引（bug ef8b3a45——树会话入项目分组）：加载时一次梳理——workspace 快照
  // 的全部路径经 forge:worktree/resolve 批量通道交 host 身份归并单点裁决（与 hero 编排/
  // 必绑拦截同一 resolveProject 基础设施），结果映射直喂 buildSidebarTree；客户端零仲裁。
  // 快照/项目变化才重梳；失败 fail-soft（退主工作区分组现状，树会话不入组）。
  // bug 52fc94db：effect 收敛至共享 hook（useWorkspaceProjectMap——概览锚定同源消费），
  // 行为零变化。
  const wsItems = workspacesSnap.items
  // 归属归并数据源显式传 Typert 工厂（ui/rpc face——worktree.resolve 正典通道；
  // knowledge/rpc-channels 缺省工厂 = 旧 channels face，官方宿主静默不可达不作数据源）
  const workspaceProject = useWorkspaceProjectMap(wsItems, projectsState, preloadRpcClientFactory)
  const actions = sidebarActions({
    openSession,
    startSession,
    updateProject: (id, patch) => preloadRpcClientFactory().projects.update(id, patch),
    onProjectsMutated: silentRefreshProjects,
    // D45 会话行动作官方面（…菜单/归档/置顶——inject face 注入；逐位缺席 = 对应项不呈现）
    pinSession,
    unpinSession,
    archiveSession,
    unarchiveSession,
    forkSession,
    renameSession,
  })
  // 空态「添加项目」CTA（用户裁决 2026-11-12——唯一残存添加入口；流程宿主 = 本组件
  // 常驻挂载的 AddProjectFlow 页内缝，直达不再缺席）
  const onAddProject = useCallback(() => {
    openAddProjectFlow()
  }, [])
  const { tree, loading, currentSessionId } = buildSidebarTree({
    projects: projectsState.phase === 'ready' ? projectsState.projects : [],
    sessions: sessionsSnap,
    workspaces: workspacesSnap,
    workspaceProject,
  })
  return (
    <>
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
      onSessionPinToggle={actions.onSessionPinToggle}
      onSessionArchive={actions.onSessionArchive}
      onSessionUnarchive={actions.onSessionUnarchive}
      onSessionRename={actions.onSessionRename}
      onSessionFork={actions.onSessionFork}
      onProjectsReorder={actions.onProjectsReorder}
      now={Date.now()}
      />
      {/* 1.8 D 类接线：流程宿主随本槽位件常驻挂载（官方宿主无壳装配——mount 期发布
          __DSH_FORGE_ADD_PROJECT_FLOW__ 页内缝，空态 CTA / hero CTA 经 openAddProjectFlow
          直达；数据源 = AddProjectFlow 缺省 Typert 真身；注册成功 → 静默重拉对齐列表 +
          官方 startSession(workspaceId) 会话开户——bug 84acf85c 绑定会话出生即挂账）。 */}
      <AddProjectFlow onRegistered={silentRefreshProjects} openRegisteredWorkspace={startSession} />
    </>
  )
}
