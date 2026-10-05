// 知识面板（定位：装配——官方 main 面板 roster 的产品全局面板，fix-25 架构重排）。
// UF-5 中区知识视图的降位载体：官方 `main` keyed 槽 key='dswf-knowledge' 占用者
// （root 作用域——无会话依赖，会话缺席可达 = 原 zones 互换语义保持）；入口 = 官方
// sidebar.panellist 行（PanelRow 官方行语言）+ 召回视图跳转（桥 openKnowledgeEntry）；
// 回会话 = 官方 openSession（selectPanel(null) 同径收口）或桥 showSession。
// UF-6 浏览面本体 = KnowledgeView（3.8 装配壳——browse + drawer 原样挂载）；抽屉目标
// （openEntryId）自工作台桥订阅（召回视图跨树跳转缝——两棵独立槽位树的唯一通道）。
// 项目锚（fix-bug 多项目）：主视图会话读取（root 标准props useSessions——官方
// retainedBy.mainView 口径，DocumentTitle 同型先例）→ projectAnchorOf 会话锚定分支
// （会话归属 workspace 名下项目）；无保留会话 → 唯一项目兜底；多项目无会话 = null
// （不猜首个保持）——空态文案由 unanchoredProjectCount 分流说实话（不再谎称未注册）。
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
  /** 会话账本观察钩子（主视图会话读取——多项目锚定输入；root 标准props 自动递达） */
  readonly useSessions?: KitSelectorHook
  /** 工作台桥（插件 inject face 注入——抽屉目标缝；缺席 = 抽屉态本地自持降级） */
  readonly bridge?: Pick<WorkbenchBridge, 'subscribe' | 'getSnapshot' | 'setDrawerEntry'>
}

/**
 * 主视图会话纯读（官方口径）：byId 中 retainedBy.mainView > 0 的会话行 id（官方
 * ui-layout DocumentTitle / ui-workspace 同型 find——主视图唯一保留会话）；形状漂移/
 * 缺省 → null（fail-soft——非壳载体降级为无会话锚）。选择器返回原语（store 稳定面）。
 */
export function readMainSessionId(hook: KitSelectorHook): string | null {
  return hook((s) => {
    const byId = (s as { byId?: Record<string, { id?: string; retainedBy?: { mainView?: number } }> } | undefined)
      ?.byId
    if (byId === undefined || typeof byId !== 'object') return null
    const current = Object.values(byId).find((row) => (row?.retainedBy?.mainView ?? 0) > 0)
    return current?.id ?? null
  }) as string | null
}

/**
 * 主视图会话锚子件（PanelInfoAnchor 同形制——fix-33 ⑤ 钩子形制：可选 kit hook 经子件
 * 无条件调用，效应上抛宿主状态；SSR 首帧保持 null 缺省，效应驱动更新归 e2e）。导出面 = 单测。
 */
export function MainSessionAnchor({
  hook,
  onChange,
}: {
  readonly hook: KitSelectorHook
  readonly onChange: (sessionId: string | null) => void
}): ReactNode {
  const sessionId = readMainSessionId(hook)
  useEffect(() => {
    onChange(sessionId)
  }, [sessionId, onChange])
  return null
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
  // 主视图会话（fix-bug 多项目锚定）：锚子件效应上抛——首帧 null（SSR/非壳载体降级同径）
  const [mainSessionId, setMainSessionId] = useState<string | null>(null)
  const projectId = projectAnchorOf({
    sessionId: mainSessionId,
    workspaces,
    projects: projectsState.phase === 'ready' ? projectsState.projects : [],
  })
  // 无锚空态分流输入：多项目（≥2）= 说实话文案；缺省/零/一 = 引导空态原文案
  const unanchoredProjectCount =
    projectId === null && projectsState.phase === 'ready' ? projectsState.projects.length : undefined

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
        unanchoredProjectCount={unanchoredProjectCount}
        openEntryId={drawerEntryId}
        onOpenEntryChange={setDrawerEntry}
      />
      {workspacesAnchor}
      {props.useSessions === undefined ? null : (
        <MainSessionAnchor hook={props.useSessions} onChange={setMainSessionId} />
      )}
    </div>
  )
}
