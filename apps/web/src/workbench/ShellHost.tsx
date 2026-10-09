// 产品壳宿主（定位：装配——官方 shell.overlay 槽位常驻件，fix-25 架构重排）。
// 动机：main.conversation 影子退役后，产品需要一颗不随面板互换卸载的常驻装配树承载：
//   - UF-3 流程宿主（AddProjectFlow 模态——官方 Modal 自 portal body，宿主仅持有
//     onRegistered 重拉锚）；
//   - 相位推导（sessionZonePhase——零项目 hero 判据）与 e2e/走查锚（data-dswf-workbench
//     + data-dswf-phase + data-dswf-view——官方 layout.activePanelId 的产品视图镜像）；
//   - UF-2 hero 面板驱动（boot 期零项目 → 选中产品 hero 面板；注册成功 → 回官方会话面板
//     ——官方 layout.selectPanel 径，驱动一次性守卫防导航争用）。
//   - 任务详情弹窗宿主（m3.1 D21/D23：挂载独立于 dock——桥 drawerTaskId 受控条件挂载，
//     对话中不经概览 tab 直接打开；弹窗几何逐开本地态随条件挂载弃置 = 不记忆；转移
//     对话框随弹窗同宿主——任意面板态可用）。
// 官方缝：shell.overlay（ui-layout AppFrame root 五子槽之一，list/root——常驻不随 main
// 面板互换卸载）；标准 props 面 = root 作用域观察钩子（useWorkspaces/usePanelInfo）。
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AddProjectFlow } from '../flows/add-project/AddProjectFlow.js'
import type { KitSelectorHook } from '../views/session/ConversationViews.js'
import { TaskDrawer, useTaskDetail } from '../views/overview/drawer/index.js'
import { TransitionDialog } from '../views/overview/drawer/transition-dialog.js'
import { forgeDocAddress, nextTaskFocusApply, type TransitionTarget } from './dock-tabs.js'
import type { SessionOpenRequest } from '../views/overview/message-format.js'
import { useProjectDocsRoot } from '../views/overview/overview-data.js'
import type { OpenSessionOrchestrator } from '../client-plugin/open-session.js'
import { MainSessionAnchor, useAnchoredProjects } from './anchored-projects.js'
import {
  HERO_PANEL_KEY,
  anchoredOverviewContext,
  centerViewOf,
  nextLastReadyCount,
  rightbarViewPlan,
  sessionZonePhase,
} from './panel-model.js'
import type { ForgeOverviewContext, WorkbenchBridge } from './workbench-bridge.js'
import './workbench.css'

/** 官方面板选择窄面（插件 inject face 携带——layout.selectPanel 的结构同型镜像） */
export interface ForgeSelectPanelFace {
  /** 选中官方 main 面板（null = 回官方会话面板——ConversationRoot 缺省） */
  selectPanel(panelId: string | null): void
}

/** 官方右栏收展窄面（ui-sidebar-right ISidebarRight 消费切片——知识模式联动驱动） */
export interface RightbarFace {
  /** 右栏当前展开态（无会话面 = false） */
  isExpanded(): boolean
  /** 收起 ↔ 展开并聚焦（官方导航动作面） */
  toggleExpanded(): void
}

/** shell.overlay 占用者 kit 窄面（官方 root 作用域标准 props 消费切片；可选——缺席 = 降级） */
export interface ForgeShellHostProps {
  /** workspace 归属观察钩子（hero 刷新锚——外部注册 dsh create 后快照身份变化即重拉项目数） */
  readonly useWorkspaces?: KitSelectorHook
  /** 会话账本观察钩子（主视图会话读取——概览项目上下文锚定输入，4.1；root 标准 props 自动递达） */
  readonly useSessions?: KitSelectorHook
  /** 官方面板信息观察钩子（activePanelId——视图镜像 + hero 驱动守卫源） */
  readonly usePanelInfo?: KitSelectorHook
  /** 官方面板选择窄面（插件 inject face 注入；缺席 = hero 驱动降级 no-op——非壳载体/单测面） */
  readonly selectPanel?: ForgeSelectPanelFace
  /**
   * 官方右栏收展窄面（插件 inject face 注入，fix-23 语义随迁：知识模式隐藏/恢复联动；
   * 缺席 = 联动降级 no-op——官方右栏自持收展态不受损）
   */
  readonly rightbar?: RightbarFace
  /**
   * 工作台桥（插件 inject face 注入，4.1）：概览项目上下文写回缝 + 任务弹窗受控态读面
   * （m3.1 D21/D23——drawerTaskId 订阅 + closeTaskDrawer 上抛；ShellHost 锚定经桥递达
   * 右栏概览 tab body——两棵独立槽位树的既有通道）；缺席 = 概览上下文不发布 + 弹窗不开
   */
  readonly bridge?: Pick<WorkbenchBridge, 'setOverviewContext' | 'subscribe' | 'getSnapshot' | 'closeTaskDrawer'>
  /** 挂接会话 pill 跳会话（插件 inject face——uiWorkspace.openSession；缺席 = 非交互呈现） */
  readonly onOpenSession?: (sessionId: string) => void
  /** 打开新会话编排器（插件 inject face——openSessionWithPreset 组合子；缺席 = 诊断发送入口不呈现） */
  readonly openSession?: OpenSessionOrchestrator
  /**
   * 文档开出动作（插件 inject face——官方 sidebarRight.openResource 服务面窄镜；缺席 =
   * 弹窗参考 chip 非交互呈现）。消费面组地址 = forgeDocAddress(projectId, docRel)。
   */
  readonly openDocResource?: (address: string) => void
}

/**
 * panelInfo 快照 → activePanelId 窄读（纯函数）：官方 layout.panelInfo 快照形状漂移/
 * 缺省 → null（官方会话面板缺省——centerViewOf 同口径）。
 */
export function readActivePanelId(hook: KitSelectorHook): string | null {
  return hook((s) => (s as { activePanelId?: string | null } | undefined)?.activePanelId ?? null) as string | null
}

/**
 * 官方面板信息锚子件（fix-33 ⑤ 钩子形制：原 ForgeShellHost 内联 `props.usePanelInfo?.(…)`
 * 可选调用违反 hooks 规则——kit 在场性中途变化即漂移；抽子件无条件调用，WorkspacesAnchor
 * 同形制）。读取 activePanelId 经效应上抛宿主状态（SSR 首帧保持 null 缺省；效应驱动更新
 * 归 e2e）；导出面 = 单测。
 */
export function PanelInfoAnchor({
  hook,
  onChange,
}: {
  readonly hook: KitSelectorHook
  readonly onChange: (activePanelId: string | null) => void
}): ReactNode {
  const activePanelId = readActivePanelId(hook)
  useEffect(() => {
    onChange(activePanelId)
  }, [activePanelId, onChange])
  return null
}

/**
 * hero 面板驱动效应推导（纯函数，fix-25——单测直测）：
 *   - 相位 hero 且当前在官方会话面板（activePanelId null）且未驱动过 → 进 hero 面板
 *     （boot 期零项目引导；一次性守卫——不与用户导航争用）；
 *   - 相位离 hero（注册成功）且当前在 hero 面板 → 回官方会话面板（首项目落地即让位）；
 *   - 其余 = null（不动面板）。
 */
export function heroPanelDrive(
  phase: 'settling' | 'hero' | 'session',
  activePanelId: string | null,
  driven: boolean,
): { readonly panelId: string | null } | null {
  if (phase === 'hero' && activePanelId === null && !driven) return { panelId: HERO_PANEL_KEY }
  if (phase !== 'hero' && activePanelId === HERO_PANEL_KEY) return { panelId: null }
  return null
}

/**
 * 产品壳宿主（shell.overlay 常驻件）。根锚 = 全视口零交互舞台（官方 Modal 自 portal，
 * 本体仅承载锚点与相位镜像——pointer-events:none 不截官方 UI 命中）。
 * data-dswf-workbench/data-dswf-phase/data-dswf-view = e2e 与走查锚（fix-25 前工作台
 * 面板锚随壳宿主迁移——语义不变：phase = 项目数相位，view = 官方面板态镜像）。
 */
export function ForgeShellHost(props: ForgeShellHostProps): ReactNode {
  // hero 项目数源（三刷新锚）：mount 首拉 + workspace 归属快照身份变化（外部注册后 dsh
  // create 即触发——与左栏面板同锚口径）+ 注册成功回调（UI 流程即时重拉）。
  // fix-36：快照锚 + 项目相位经 useAnchoredProjects 共享 hook（四装配面同型收敛）。
  const { projects: projectsState, workspaces, retry: retryProjects, anchor: workspacesAnchor } = useAnchoredProjects(
    props.useWorkspaces,
  )
  const [lastReadyCount, setLastReadyCount] = useState<number | null>(null)
  useEffect(() => {
    setLastReadyCount((prev) => nextLastReadyCount(prev, projectsState))
  }, [projectsState])
  const phase = sessionZonePhase({
    lastReadyCount,
    failed: projectsState.phase === 'error',
  })

  // 概览项目上下文锚定（4.1 AC4，knowledge-anchor 裁决复用）：主视图会话锚子件上抛 →
  // anchoredOverviewContext 纯推导（会话锚定优先/唯一项目兜底 + 会话计数）→ 桥写回
  //（右栏概览 tab body 消费）。桥缺席 = 不发布（fail-soft）；效应驱动更新归 e2e。
  const [mainSessionId, setMainSessionId] = useState<string | null>(null)
  const overviewContext: ForgeOverviewContext = anchoredOverviewContext({
    mainSessionId,
    workspaces,
    projects: projectsState.phase === 'ready' ? projectsState.projects : [],
  })
  const overviewBridge = props.bridge
  useEffect(() => {
    overviewBridge?.setOverviewContext(overviewContext)
  }, [overviewContext, overviewBridge])
  // 官方面板态镜像（activePanelId——root 作用域标准观察钩子；fix-33 ⑤ 起经 PanelInfoAnchor
  // 子件读取上抛（钩子形制合规），缺席 = 会话视图缺省（SSR 首帧 null））
  const [activePanelId, setActivePanelId] = useState<string | null>(null)
  const view = centerViewOf(activePanelId)

  // hero 面板驱动（一次性守卫 + 边沿让位；面板选择窄面缺席 = 降级 no-op）
  const drivenRef = useRef(false)
  const selectPanel = props.selectPanel
  useEffect(() => {
    if (selectPanel === undefined) return
    const drive = heroPanelDrive(phase, activePanelId, drivenRef.current)
    if (drive === null) return
    if (drive.panelId === HERO_PANEL_KEY) drivenRef.current = true
    try {
      selectPanel.selectPanel(drive.panelId)
    } catch {
      // fail-soft：面板 id 尚未注册完成（装载次序瞬态）——boot 驱动让位官方缺省面板
    }
  }, [phase, activePanelId, selectPanel])

  // 知识模式右栏联动（fix-23 语义随迁，fix-25 改面板径）：官方 sidebarRight 窄面——进知识
  // 面板收起（记忆）、回会话恢复（计划 = rightbarViewPlan 纯函数，输入 = 知识面板激活态）；
  // 官方动作面异常 fail-soft（无会话面/服务缺席 = no-op）。
  const rightbarRememberedRef = useRef<boolean | null>(null)
  const rightbar = props.rightbar
  const knowledgeActive = view === 'knowledge'
  useEffect(() => {
    if (rightbar === undefined) return
    let isExpanded = false
    try {
      isExpanded = rightbar.isExpanded()
    } catch {
      return
    }
    const plan = rightbarViewPlan(knowledgeActive, rightbarRememberedRef.current, isExpanded)
    rightbarRememberedRef.current = plan.remembered
    if (plan.action === 'none') return
    try {
      rightbar.toggleExpanded()
    } catch {
      // fail-soft：官方收展动作面瞬时缺席（会话卸载瞬态）——联动让位官方自持态
    }
  }, [knowledgeActive, rightbar])

  // 任务详情弹窗（m3.1 D21/D23：挂载独立于 dock——桥 drawerTaskId 受控条件挂载；
  // 关闭即卸载 = 几何逐开本地态随壳弃置[裁决 #3 不记忆]，切换任务原位换内容）。
  // 桥缺席 = 无受控面（SSR 首帧/非壳载体）——弹窗不开（订阅/快照守卫降级）。
  const bridge = props.bridge
  const subscribeSnapshot = useCallback(
    (onChange: () => void): (() => void) => (bridge === undefined ? () => {} : bridge.subscribe(onChange)),
    [bridge],
  )
  const readSnapshot = useCallback(
    () => (bridge === undefined ? null : bridge.getSnapshot()),
    [bridge],
  )
  const snapshot = useSyncExternalStore(subscribeSnapshot, readSnapshot, readSnapshot)
  const drawerTaskId = snapshot?.drawerTaskId ?? null
  const handleCloseDrawer = useCallback((): void => {
    bridge?.closeTaskDrawer()
  }, [bridge])
  // 弹窗锚定项目：本地锚定优先（kit 钩子直读——效应写桥前即新），桥发布锚兜底（SSR/非壳
  // 载体面：写方[pill/dock]开窗时的锚定快照——生产两面恒同值）
  const anchorProjectId = overviewContext.projectId ?? snapshot?.overview.projectId ?? null

  // 转移对话框（随弹窗同宿主——「转移状态…」入口在任意面板态可用；目标拉取复用
  // useTaskDetail：taskId 变更骨架重置 + 事件静默重取同口径）。⋯ 菜单跨树开窗 =
  // 桥 transitionFocus（nonce 对照应用——nextTaskFocusApply 同判据复用）。
  const [transitionTaskId, setTransitionTaskId] = useState<string | null>(null)
  const appliedTransitionNonceRef = useRef(-1)
  const transitionFocus = snapshot?.transitionFocus ?? null
  useEffect(() => {
    const apply = nextTaskFocusApply(appliedTransitionNonceRef.current, transitionFocus)
    if (apply === null) return
    appliedTransitionNonceRef.current = apply.nonce
    setTransitionTaskId(apply.taskId)
  }, [transitionFocus])
  const [dialogLoad] = useTaskDetail(anchorProjectId ?? '', transitionTaskId)
  const transitionTarget: TransitionTarget | null =
    transitionTaskId !== null && dialogLoad.detail !== undefined
      ? { task: dialogLoad.detail, allowedTransitions: dialogLoad.detail.allowedTransitions }
      : null
  const handleOpenTransition = useCallback((taskId: string): void => {
    setTransitionTaskId(taskId)
  }, [])
  const handleCloseTransition = useCallback((): void => {
    setTransitionTaskId(null)
  }, [])

  // 任务失败诊断 @ 锚文档根（fail-soft 装载：projects.get 项目行推导；失败/缺席 = undefined
  // 不阻断，TaskDrawer 回退 `docs` 缺省锚）
  const docsRoot = useProjectDocsRoot(anchorProjectId)

  // 打开新会话通道（弹窗诊断「发送给 agent」）：锚定 workspaceId + openSessionWithPreset
  // 组合子（失败留场归阶段化错误——编排器各阶段 fail-soft 不炸壳；autosend 语义归请求）
  const handleStartSession = useCallback(
    (request: SessionOpenRequest): void => {
      if (overviewContext.workspaceId === null || props.openSession === undefined) return
      void props.openSession.openSessionWithPreset({
        workspaceId: overviewContext.workspaceId,
        ...(request.mode !== undefined ? { mode: request.mode } : {}),
        prefill: request.prefill,
        ...(request.autosend === true ? { autosend: true } : {}),
      })
    },
    [overviewContext.workspaceId, props.openSession],
  )

  // 文档开出（弹窗参考 chip → dock 开文档 tab——官方 sidebarRight.openResource 服务面；
  // 项目锚/动作面缺席 = 非交互呈现；官方面异常不外溢）
  const openDocResource = props.openDocResource
  const projectId = anchorProjectId
  const openDoc =
    openDocResource !== undefined && projectId !== null
      ? (docRel: string): void => {
          openDocResource(forgeDocAddress(projectId, docRel))
        }
      : undefined

  return (
    <div className="dswf-shell-host" data-dswf-workbench="" data-dswf-phase={phase} data-dswf-view={view}>
      {/* UF-3 流程宿主（模态覆盖——官方 Modal 自 portal body；mount 期发布打开缝：
          hero CTA / 项目树「＋」直达；onRegistered = 项目数即时重拉锚） */}
      <AddProjectFlow
        onRegistered={() => {
          retryProjects()
        }}
      />
      {/* workspace 归属锚（useAnchoredProjects 条件子件——kit hook 在场才挂载，钩子于
          子件内无条件调用；快照上抛：身份变化 = 项目数重拉锚——不落地 dsh 账本行副本） */}
      {workspacesAnchor}
      {/* 主视图会话锚（4.1 概览上下文锚定输入——MainSessionAnchor 迁自知识面板同形制；
          钩子于子件内无条件调用，retainedBy.mainView 会话上抛驱动桥写回） */}
      {props.useSessions === undefined ? null : (
        <MainSessionAnchor hook={props.useSessions} onChange={setMainSessionId} />
      )}
      {/* 官方面板信息锚（fix-33 ⑤：usePanelInfo 内联可选调用 → PanelInfoAnchor 子件
          无条件调用——hooks 规则合规；activePanelId 上抛驱动视图镜像与 hero 让位） */}
      {props.usePanelInfo !== undefined ? (
        <PanelInfoAnchor hook={props.usePanelInfo} onChange={setActivePanelId} />
      ) : null}
      {/* 任务详情弹窗（D23：挂载独立于 dock——对话中经桥直接打开，不依赖 dock 展开/
          概览选中；条件挂载承载「关闭后不记忆位置/尺寸」——几何随卸载弃置） */}
      {drawerTaskId !== null && projectId !== null ? (
        <TaskDrawer
          projectId={projectId}
          taskId={drawerTaskId}
          onClose={handleCloseDrawer}
          {...(openDoc !== undefined ? { onOpenDoc: openDoc } : {})}
          {...(props.onOpenSession !== undefined ? { onOpenSession: props.onOpenSession } : {})}
          onTransition={handleOpenTransition}
          {...(props.openSession !== undefined ? { onStartSession: handleStartSession } : {})}
          {...(docsRoot !== undefined ? { docsRoot } : {})}
        />
      ) : null}
      {/* 人工转移对话框（随弹窗同宿主——allowedTransitions 唯一源直喂；快照呈现归
          事件订阅重取[transition 写 → emitTasksChanged]） */}
      {transitionTarget !== null && projectId !== null ? (
        <TransitionDialog
          projectId={projectId}
          task={transitionTarget.task}
          allowedTransitions={transitionTarget.allowedTransitions}
          onCancel={handleCloseTransition}
          onDone={() => {
            handleCloseTransition() // 快照呈现归事件订阅重取（transition 写 → emitTasksChanged）
          }}
        />
      ) : null}
    </div>
  )
}

/** ProjectsPhase 再导出（ShellHost 消费面的类型同源——单测注入用） */
export type { ProjectsPhase } from '../views/sidebar/use-forge-projects.js'
