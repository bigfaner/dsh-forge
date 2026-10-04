// 产品壳宿主（定位：装配——官方 shell.overlay 槽位常驻件，fix-25 架构重排）。
// 动机：main.conversation 影子退役后，产品需要一颗不随面板互换卸载的常驻装配树承载：
//   - UF-3 流程宿主（AddProjectFlow 模态——官方 Modal 自 portal body，宿主仅持有
//     onRegistered 重拉锚）；
//   - 相位推导（sessionZonePhase——零项目 hero 判据）与 e2e/走查锚（data-dswf-workbench
//     + data-dswf-phase + data-dswf-view——官方 layout.activePanelId 的产品视图镜像）；
//   - UF-2 hero 面板驱动（boot 期零项目 → 选中产品 hero 面板；注册成功 → 回官方会话面板
//     ——官方 layout.selectPanel 径，驱动一次性守卫防导航争用）。
// 官方缝：shell.overlay（ui-layout AppFrame root 五子槽之一，list/root——常驻不随 main
// 面板互换卸载）；标准 props 面 = root 作用域观察钩子（useWorkspaces/usePanelInfo）。
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AddProjectFlow } from '../flows/add-project/AddProjectFlow.js'
import type { KitSelectorHook } from '../views/session/ConversationViews.js'
import type { LedgerWorkspacesSnapshot } from '../views/sidebar/sidebar-model.js'
import { useForgeProjects, type ProjectsPhase } from '../views/sidebar/use-forge-projects.js'
import {
  HERO_PANEL_KEY,
  centerViewOf,
  nextLastReadyCount,
  rightbarViewPlan,
  sessionZonePhase,
} from './panel-model.js'
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
  /** 官方面板信息观察钩子（activePanelId——视图镜像 + hero 驱动守卫源） */
  readonly usePanelInfo?: KitSelectorHook
  /** 官方面板选择窄面（插件 inject face 注入；缺席 = hero 驱动降级 no-op——非壳载体/单测面） */
  readonly selectPanel?: ForgeSelectPanelFace
  /**
   * 官方右栏收展窄面（插件 inject face 注入，fix-23 语义随迁：知识模式隐藏/恢复联动；
   * 缺席 = 联动降级 no-op——官方右栏自持收展态不受损）
   */
  readonly rightbar?: RightbarFace
}

/**
 * workspace 归属快照窄判定（纯函数）：dsh 归属快照最小形状（items 数组）——非壳载体/
 * 形状漂移期按 null 降级（不炸壳；SC2：只读快照身份与归属查询，不落地行内容副本）。
 */
export function isWorkspacesSnapshot(value: unknown): value is LedgerWorkspacesSnapshot {
  return typeof value === 'object' && value !== null && Array.isArray((value as { items?: unknown }).items)
}

/**
 * workspace 归属锚子件（快照只读上抛——SC2 零缓存零副本：装配侧仅持快照对象身份供
 * 重拉锚，不落地行内容派生副本；导出面 = 单测）。
 */
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
  const [workspacesSnap, setWorkspacesSnap] = useState<LedgerWorkspacesSnapshot | null>(null)
  const [projectsState, retryProjects] = useForgeProjects(workspacesSnap)
  const [lastReadyCount, setLastReadyCount] = useState<number | null>(null)
  useEffect(() => {
    setLastReadyCount((prev) => nextLastReadyCount(prev, projectsState))
  }, [projectsState])
  const phase = sessionZonePhase({
    lastReadyCount,
    failed: projectsState.phase === 'error',
  })

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

  // workspace 快照上抛窄化（形状漂移/非壳载体 → null 降级）
  const handleWorkspacesSnap = useCallback((snap: unknown) => {
    setWorkspacesSnap(isWorkspacesSnapshot(snap) ? snap : null)
  }, [])

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

  return (
    <div className="dswf-shell-host" data-dswf-workbench="" data-dswf-phase={phase} data-dswf-view={view}>
      {/* UF-3 流程宿主（模态覆盖——官方 Modal 自 portal body；mount 期发布打开缝：
          hero CTA / 项目树「＋」直达；onRegistered = 项目数即时重拉锚） */}
      <AddProjectFlow
        onRegistered={() => {
          retryProjects()
        }}
      />
      {/* workspace 归属锚（kit hook 在场才挂载——钩子于子件内无条件调用；快照上抛：
          身份变化 = 项目数重拉锚——不落地 dsh 账本行副本） */}
      {props.useWorkspaces !== undefined ? (
        <WorkspacesAnchor hook={props.useWorkspaces} onChange={handleWorkspacesSnap} />
      ) : null}
      {/* 官方面板信息锚（fix-33 ⑤：usePanelInfo 内联可选调用 → PanelInfoAnchor 子件
          无条件调用——hooks 规则合规；activePanelId 上抛驱动视图镜像与 hero 让位） */}
      {props.usePanelInfo !== undefined ? (
        <PanelInfoAnchor hook={props.usePanelInfo} onChange={setActivePanelId} />
      ) : null}
    </div>
  )
}

/** ProjectsPhase 再导出（ShellHost 消费面的类型同源——单测注入用） */
export type { ProjectsPhase }
