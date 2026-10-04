// 知识面板（定位：装配——官方 main 面板 roster 的产品全局面板，fix-25 架构重排）。
// UF-5 中区知识视图的降位载体：官方 `main` keyed 槽 key='dswf-knowledge' 占用者
// （root 作用域——无会话依赖，会话缺席可达 = 原 zones 互换语义保持）；入口 = 官方
// sidebar.panellist 行（PanelRow 官方行语言）+ 召回视图跳转（桥 openKnowledgeEntry）；
// 回会话 = 官方 openSession（selectPanel(null) 同径收口）或桥 showSession。
// UF-6 浏览面本体 = KnowledgeView（3.8 装配壳——browse + drawer 原样挂载）；抽屉目标
// （openEntryId）自工作台桥订阅（召回视图跨树跳转缝——两棵独立槽位树的唯一通道）。
// 项目锚（root 作用域无会话锚——projectAnchorOf 恒走唯一项目兜底线；多项目知识锚定
// 降级为 P1 已知边界，见 panel-model.projectAnchorOf 注记）。
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { KnowledgeView } from '../views/knowledge/KnowledgeView.js'
import type { KitSelectorHook } from '../views/session/ConversationViews.js'
import { useAnchoredProjects } from './anchored-projects.js'
import { projectAnchorOf } from './panel-model.js'
import type { WorkbenchBridge } from './workbench-bridge.js'
import './workbench.css'

/** main keyed 'dswf-knowledge' 占用者 kit 窄面（root 标准props + 插件 inject；可选 = 降级） */
export interface ForgeKnowledgePanelProps {
  /** workspace 归属观察钩子（项目锚推导输入——归属快照） */
  readonly useWorkspaces?: KitSelectorHook
  /** 工作台桥（插件 inject face 注入——抽屉目标缝；缺席 = 抽屉态本地自持降级） */
  readonly bridge?: Pick<WorkbenchBridge, 'subscribe' | 'getSnapshot' | 'setDrawerEntry'>
}

/**
 * 知识面板（main keyed 'dswf-knowledge' 占用者）。根锚 data-dswf-view="knowledge" =
 * e2e 中区知识视图锚（fix-25 前 .dswf-zones[data-dswf-view] 锚随面板迁移——语义不变）。
 * 面板激活即浏览面 active（挂载 = 激活——官方 keyed 面板非选中不挂载，keep-alive
 * 语义由官方面板机制承载）。
 */
export function ForgeKnowledgePanel(props: ForgeKnowledgePanelProps): ReactNode {
  // 项目锚推导输入：workspace 归属快照 + 项目台账（useAnchoredProjects 共享 hook——与
  // ShellHost/召回视图/hero 弹层同锚口径，fix-36 收敛）
  const { projects: projectsState, workspaces, anchor: workspacesAnchor } = useAnchoredProjects(
    props.useWorkspaces,
  )
  const projectId = projectAnchorOf({
    sessionId: null,
    workspaces,
    projects: projectsState.phase === 'ready' ? projectsState.projects : [],
  })

  // 抽屉目标（桥订阅——召回视图跳转驱动；桥缺席 = 本地自持面）
  const bridge = props.bridge
  const [localDrawer, setLocalDrawer] = useState<number | null>(null)
  const subscribeDrawer = useCallback(
    (onChange: () => void) => (bridge === undefined ? () => {} : bridge.subscribe(onChange)),
    [bridge],
  )
  const readDrawer = useCallback(
    () => (bridge === undefined ? { drawerEntryId: localDrawer } : bridge.getSnapshot()),
    [bridge, localDrawer],
  )
  const drawerEntryId = useSyncExternalStore(
    subscribeDrawer,
    readDrawer,
    readDrawer,
  ).drawerEntryId
  const setDrawerEntry = useCallback(
    (entryId: number | null): void => {
      if (bridge === undefined) {
        setLocalDrawer(entryId)
        return
      }
      bridge.setDrawerEntry(entryId)
    },
    [bridge],
  )
  // 面板卸载期清桥面抽屉态（再入不残留上次跳转目标——关闭语义归抽屉自持）
  useEffect(() => () => bridge?.setDrawerEntry(null), [bridge])

  return (
    <div className="dswf-knowledge-panel" data-dswf-view="knowledge">
      <KnowledgeView
        projectId={projectId}
        openEntryId={drawerEntryId}
        onOpenEntryChange={setDrawerEntry}
      />
      {workspacesAnchor}
    </div>
  )
}
