// 工作台装配面板（定位：装配——Page Composition「工作台（单页三区）」的壳入口，2.12）。
// main.conversation 洞位占用者（client-plugin 影子注册 -100；组件源经 product-views 发布）：
// 持有壳视图态机（useShellView——三区容器唯一状态源）+ zones 槽位装配
// （SessionPanel → 会话视图槽 / KnowledgeM0 → 知识视图槽 M0 占位 / HeroEmpty → 项目数 0
// 时中区替换呈现 / dock 占位页签 → 右栏 UF-7 机制）+ 承载 UF-3 流程宿主（AddProjectFlow
// 模态 + __DSH_FORGE_ADD_PROJECT_FLOW__ 打开缝发布——hero CTA / 项目树「＋」两入口）+
// 工作台桥发布（__DSH_FORGE_WORKBENCH__——左栏导航视图切换缝）。
// 左栏 rail = 官方 ui-sidebar 壳（槽位路线 A，2.7——折叠/导航/快捷键白拿），zones rail 槽
// 保持空轨；官方会话锚跟随：会话激活（官方新会话/品牌行）→ select-session 回会话视图
// （UF-5「再次点新会话/会话行/品牌行 → 切回会话视图」的装配侧接缝）。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useShellView } from '../shell/use-shell-view.js'
import type { ShellViewState } from '../shell/view-state.js'
import { AddProjectFlow } from '../flows/add-project/AddProjectFlow.js'
import { openAddProjectFlow } from '../flows/add-project/flow-open.js'
import { SessionPanel } from '../views/session/SessionPanel.js'
import { useForgeProjects, type ProjectsPhase } from '../views/sidebar/use-forge-projects.js'
import { WorkbenchZones } from '../zones/WorkbenchZones.js'
import { globalDockTab, type DockTabSet } from '../zones/dock.js'
import { ChatSurface, ChatSurfaceAbsent, type ChatSurfaceKit, type KitFactorySlotRenderer, type KitSelectorHook } from './ChatSurface.js'
import { HeroEmpty } from './HeroEmpty.js'
import { KnowledgeM0 } from './KnowledgeM0.js'
import { publishWorkbenchBridge } from './workbench-bridge.js'
import './workbench.css'

/** main.conversation 占用者 kit 窄面（官方 PropsRuntime 消费切片；全部可选——缺席 = 降级，单测/非壳载体） */
export interface ForgeWorkbenchPanelProps {
  /** 当前会话锚（session-maybe：undefined = 无选中会话） */
  readonly sessionId?: string
  /** 会话面观察钩子（ChatSurface 相位推导） */
  readonly useSession?: KitSelectorHook
  readonly useSessions?: KitSelectorHook
  /** workspace 归属观察钩子（hero 刷新锚——外部注册 dsh create 后快照身份变化即重拉项目数） */
  readonly useWorkspaces?: KitSelectorHook
  /** 工厂槽渲染器（conversation.content 嵌入配方） */
  readonly renderFactorySlot?: KitFactorySlotRenderer
}

/** 中区会话槽相位（hero 相位 = UF-2；settling = 项目数未就绪校平；session = 会话视图） */
export type SessionZonePhase = 'settling' | 'hero' | 'session'

/**
 * 相位推导（纯函数）。Hard Rule：hero 仅由项目数驱动——**正零**才 hero（在途/失败 = 计数
 * 未知 ≠ 0，fail-soft 落默认会话视图）；就绪后在途/失败保持上一已知相位（注册成功重拉期
 * 不闪跳、不残留）。settling 仅出现在「从未就绪且在途」（防会话面/hero 首启闪现跳变）。
 */
export function sessionZonePhase(input: {
  /** 最近一次就绪的项目数（null = 尚未就绪过） */
  readonly lastReadyCount: number | null
  /** 项目数源失败（仅未就绪期参与推导——就绪后为真也不改相位） */
  readonly failed?: boolean
}): SessionZonePhase {
  if (input.lastReadyCount === 0) return 'hero'
  if (input.lastReadyCount === null && input.failed !== true) return 'settling'
  return 'session'
}

/** M0 dock 页签集（机制占位：全局「开始」页签；域页签——知识文档/审核台/文档——后续里程碑经登记表接入） */
export const M0_DOCK_TABS: DockTabSet = [globalDockTab('start', '开始')]

/**
 * 官方会话锚跟随推导（纯函数）：锚出现/变更（next 有值且 ≠ prev）= select-session 事件
 * （回会话视图 + 锚定——UF-5「再次点新会话/会话行/品牌行 → 切回会话视图」）；无变化/清空 = null。
 */
export function sessionAnchorEvent(
  prev: string | undefined,
  next: string | undefined,
): { readonly type: 'select-session'; readonly sessionId: string } | null {
  if (next === undefined || next === prev) return null
  return { type: 'select-session', sessionId: next }
}

/**
 * 项目数相位计数推导（纯函数）：ready 相位取计数（含 archived——P1 无删除，计数不回落 0 =
 * 注册成功永久让位的机制面）；在途/失败保持上一已知计数（防闪跳/不残留）。
 */
export function nextLastReadyCount(prev: number | null, projects: ProjectsPhase): number | null {
  if (projects.phase !== 'ready') return prev
  return projects.projects.length
}

/**
 * ChatSurface kit 组装（纯函数）：kit 三成员（useSession/useSessions/renderFactorySlot）齐备
 * 才产出嵌入面；任一缺席 = undefined（降级占位——非壳载体/单测）。
 */
export function chatKitOf(props: ForgeWorkbenchPanelProps): ChatSurfaceKit | undefined {
  if (props.renderFactorySlot === undefined || props.useSession === undefined || props.useSessions === undefined) {
    return undefined
  }
  return {
    sessionId: props.sessionId,
    useSession: props.useSession,
    useSessions: props.useSessions,
    renderFactorySlot: props.renderFactorySlot,
  }
}

export interface WorkbenchAssemblyProps {
  /** 壳视图态（zones 容器渲染依据） */
  readonly view: ShellViewState
  /** 中区会话槽相位（sessionZonePhase 推导注入） */
  readonly phase: SessionZonePhase
  /** 对话 tab 内容（官方会话面嵌入 / 降级占位） */
  readonly chatSurface: ReactNode
  /** dock 页签集（M0 = 占位集） */
  readonly dockTabs: DockTabSet
  /** dock 收展（dispatch('toggle-right-dock') 装配绑定） */
  readonly onToggleDock: () => void
  /** hero CTA（openAddProjectFlow 装配绑定） */
  readonly onAddProject: () => void
}

/**
 * 三区槽位装配（纯渲染——相位注入，SSR 可直测）：session 槽按相位三分（hero / 校平位 /
 * SessionPanel + dock 角位常显开关——原型 conv-corner 同位），knowledge 槽 = M0 占位
 * （常挂载——keep-alive 互换零卸载），rail 槽不注入（左栏 = 官方 sidebar 壳，路线 A）。
 */
export function WorkbenchAssembly({
  view,
  phase,
  chatSurface,
  dockTabs,
  onToggleDock,
  onAddProject,
}: WorkbenchAssemblyProps): ReactNode {
  const sessionSlot =
    phase === 'hero' ? (
      <HeroEmpty onAddProject={onAddProject} />
    ) : phase === 'settling' ? (
      <div className="dswf-workbench-settling" data-dswf-settling="" aria-busy="true" />
    ) : (
      <div className="dswf-workbench-session" data-dswf-session-zone="">
        <Button
          variant="toolbar"
          size="sm"
          className="dswf-workbench-docktoggle"
          aria-label={view.rightDock ? '收起右侧栏' : '展开右侧栏'}
          title={view.rightDock ? '收起右侧栏' : '展开右侧栏'}
          onClick={onToggleDock}
        />
        <SessionPanel chatSurface={chatSurface} />
      </div>
    )
  return (
    <WorkbenchZones
      view={view}
      dockTabs={dockTabs}
      onToggleDock={onToggleDock}
      slots={{ session: sessionSlot, knowledge: <KnowledgeM0 /> }}
    />
  )
}

/**
 * 工作台装配面板（main.conversation 占用者本体）。效应面：桥发布（mount/unmount）、
 * 官方会话锚跟随（sessionId 变更 → select-session）、项目数源（mount + workspace 归属
 * 快照身份 + 注册成功回调三锚重拉）。data-dswf-phase = e2e/走查相位锚。
 */
export function ForgeWorkbenchPanel(props: ForgeWorkbenchPanelProps): ReactNode {
  const [view, dispatch] = useShellView()

  // 工作台桥发布（左栏导航视图切换缝——sidebar-actions 读取消费）
  useEffect(() => {
    publishWorkbenchBridge({ dispatch })
    return () => {
      publishWorkbenchBridge(undefined)
    }
  }, [dispatch])

  // 官方会话锚跟随：会话激活（官方新会话/品牌行/会话打开）→ select-session 回会话视图
  // （推导 = sessionAnchorEvent 纯函数——重渲染不重放；无会话 → 有会话 / 会话间切换均回会话视图）
  const sessionId = props.sessionId
  const lastSessionRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const event = sessionAnchorEvent(lastSessionRef.current, sessionId)
    lastSessionRef.current = sessionId
    if (event !== null) dispatch(event)
  }, [sessionId, dispatch])

  // hero 项目数源（三刷新锚）：mount 首拉 + workspace 归属快照身份变化（外部注册后 dsh
  // create 即触发——与左栏面板同锚口径）+ 注册成功回调（UI 流程即时重拉）
  const [workspacesAnchor, setWorkspacesAnchor] = useState<unknown>(null)
  const [projectsState, retryProjects] = useForgeProjects(workspacesAnchor)
  const [lastReadyCount, setLastReadyCount] = useState<number | null>(null)
  useEffect(() => {
    setLastReadyCount((prev) => nextLastReadyCount(prev, projectsState))
  }, [projectsState])
  const phase = sessionZonePhase({
    lastReadyCount,
    failed: projectsState.phase === 'error',
  })

  // 对话 tab 官方会话面（kit 组装 = chatKitOf 纯函数——任一成员缺席 = 降级占位）
  const chatKit = chatKitOf(props)

  return (
    <div className="dswf-workbench" data-dswf-workbench="" data-dswf-phase={phase}>
      <WorkbenchAssembly
        view={view}
        phase={phase}
        chatSurface={chatKit !== undefined ? <ChatSurface kit={chatKit} /> : <ChatSurfaceAbsent />}
        dockTabs={M0_DOCK_TABS}
        onToggleDock={() => {
          dispatch({ type: 'toggle-right-dock' })
        }}
        onAddProject={() => {
          openAddProjectFlow()
        }}
      />
      {/* UF-3 流程宿主（模态覆盖中区；mount 期发布打开缝——hero CTA / 项目树「＋」直达） */}
      <AddProjectFlow
        onRegistered={() => {
          retryProjects()
        }}
      />
      {/* workspace 归属锚（kit hook 在场才挂载——钩子于子件内无条件调用；身份变化上抛刷新锚） */}
      {props.useWorkspaces !== undefined ? (
        <WorkspacesAnchor hook={props.useWorkspaces} onChange={setWorkspacesAnchor} />
      ) : null}
    </div>
  )
}

/** workspace 归属锚子件（快照身份只读上抛——SC2 零缓存零副本：不落地快照内容；导出面 = 单测） */
export function WorkspacesAnchor({
  hook,
  onChange,
}: {
  readonly hook: KitSelectorHook
  readonly onChange: (snap: unknown) => void
}): ReactNode {
  const snap = hook((s) => s)
  useEffect(() => {
    onChange(snap)
  }, [snap, onChange])
  return null
}
