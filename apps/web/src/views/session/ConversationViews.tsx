// 会话视图槽占用者族（定位：业务装配——官方 conversation.view roster 的产品页签，fix-25）。
// 官方缝（ui-trajectory 同型先例）：`conversation.view` list/session 槽登记项——官方
// ConversationSessionHeader 页签行与 DefaultConversationViews 视图区（renderSlot only:id
// ——激活即挂载）消费。fix-25 登记：
//   - 'dswf-recall'（知识召回，order 20）→ RecallTab（UF-4 召回数据面；激活即挂载 =
//     每次选中重拉——AC4 即时累积语义由官方 only:id 挂载机制承载）。
// 对话 tab = 官方 'chat' 登记项直用；轨迹 tab = 官方 'trajectory' 登记项直用（fix-29：
// 产品 'dswf-trajectory' 复刻退役——官方名册同 order 10 双『轨迹』页签冲突，且官方
// trajectory 自带富数据管线（历史加载/折叠回合/图片子槽），转录映射（transcript.ts +
// TranscriptAnchor + TrajectoryLedger）只为自绘台账而设、无其他消费面，一并退役）。
import { useCallback, useState, type ReactNode } from 'react'
import { RecallTab } from './RecallTab.js'
import { projectAnchorOf } from '../../workbench/panel-model.js'
import { WorkspacesAnchor, isWorkspacesSnapshot } from '../../workbench/ShellHost.js'
import type { LedgerWorkspacesSnapshot } from '../sidebar/sidebar-model.js'
import { useForgeProjects } from '../sidebar/use-forge-projects.js'
import './session.css'

/** 官方 kit 观察钩子窄面（上游 SnapshotSelectorHook 消费切片——结构同型镜像，禁 import 上游运行期包） */
export type KitSelectorHook = (selector: (state: never) => unknown) => unknown

/** 召回视图占用者 props（标准 props + 插件 inject face 消费切片） */
export interface ForgeRecallViewProps {
  /** 当前 dsh 会话锚（session 作用域标准 prop） */
  readonly sessionId?: string
  /** workspace 归属观察钩子（项目锚推导输入——会话归属 → 项目） */
  readonly useWorkspaces?: KitSelectorHook
  /** 召回行跳转（插件 inject face——桥 openKnowledgeEntry：知识面板 + 抽屉定位） */
  readonly openKnowledgeEntry?: (entryId: number) => void
}

/**
 * 召回视图（conversation.view 'dswf-recall' 占用者）。数据面 = RecallTab 原样
 * （visible 恒 true——官方 only:id 挂载即激活，AC4 即时累积由挂载机制承载）。
 * data-dswf-pane="recall" 锚保持。
 */
export function ForgeRecallView(props: ForgeRecallViewProps): ReactNode {
  const [workspacesSnap, setWorkspacesSnap] = useState<LedgerWorkspacesSnapshot | null>(null)
  const [projectsState] = useForgeProjects(workspacesSnap)
  const handleWorkspacesSnap = useCallback((snap: unknown) => {
    setWorkspacesSnap(isWorkspacesSnapshot(snap) ? snap : null)
  }, [])
  const projectId = projectAnchorOf({
    sessionId: props.sessionId ?? null,
    workspaces: workspacesSnap,
    projects: projectsState.phase === 'ready' ? projectsState.projects : [],
  })
  return (
    <div className="dswf-session-pane dswf-view-pane" data-dswf-pane="recall">
      <RecallTab
        projectId={projectId}
        sessionId={props.sessionId ?? null}
        visible
        onOpenEntry={props.openKnowledgeEntry}
      />
      {props.useWorkspaces !== undefined ? (
        <WorkspacesAnchor hook={props.useWorkspaces} onChange={handleWorkspacesSnap} />
      ) : null}
    </div>
  )
}
