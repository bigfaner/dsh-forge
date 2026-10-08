// 右栏两 dock tab 装配体（定位：装配——4.1 Integration #4）：官方 `sidebar.right.pane.tab`
// keyed 槽两占用者（`dswf-overview` / `dswf-doc`——注册面在 client-plugin/plugin.ts 两段：
// sidebarRightTabs.register 类型定义 + 本模块组件经 product-views 发布为 keyed body）。
// 官方缝口径（上游 ui-sidebar-right 0.2.0-rc.2 源码核实）：
//   - 槽声明 inject `{ hooks: { tabInfo } }` → 占用者 props 恒收 `useTabInfo`（读取 pane/
//     tab 记录与 tab 自有动作面）；本模块经 TabInfoReader 子件消费（fix-33 ⑤ 钩子形制：
//     可选钩子经子件无条件调用）；
//   - 文档开出 = 概览 tab 自有动作 `tab.actions.openResource(address, {kind})`——落在
//     概览 tab 所在窗格（「dock 开文档 tab」ui-design 流程 5）；地址 = 去重键（同地址
//     reveal 既有 tab、异地址新开——`multiple` 类型行为）。
// 跨树缝：概览项目上下文经工作台桥（ShellHost 锚定写回 ← knowledge-anchor 裁决）；
// 抽屉（3.7）/转移对话框（3.8）/三视图（3.6）在本装配体内全链接通。
// 4.2 任务聚焦消费：桥 taskFocus（会话头挂接 pill 点击 → 插件 inject face 写回）→
// OverviewDockBody nonce 对照应用（抽屉打开 + 任务子 tab 切换 + feature 选中——UF-3
// 流程 7 全链路的右栏半段）。
// 三签不动（Hard Rule）：零左栏/中区/conversation.view 改动；概览内容禁编排逻辑（纯视图
// 组合多域读——编排归 core）。
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { TaskStatus } from '@dsh-forge/contracts'
import { EmptyState } from '../components/index.js'
import type { RpcClientFactory } from '../rpc/index.js'
import { OverviewTab, type OverviewTasksContext } from '../views/overview/OverviewTab.js'
import type { SessionOpenRequest } from '../views/overview/message-format.js'
import { useProjectDocsRoot } from '../views/overview/overview-data.js'
import type { OpenSessionOrchestrator } from '../client-plugin/open-session.js'
import { TasksTab } from '../views/overview/task-tab/task-tab.js'
import { TaskDrawer, useTaskDetail } from '../views/overview/drawer/index.js'
import { TransitionDialog, type TransitionTaskView } from '../views/overview/drawer/transition-dialog.js'
import { DocsTab } from '../views/docs/index.js'
import {
  initialOverviewContext,
  type ForgeOverviewContext,
  type ForgeTaskFocus,
  type WorkbenchBridge,
} from './workbench-bridge.js'

/** 文档 tab 类型 kind（plugin.ts DOC_TAB_KIND 结构同型镜像——plugin.test 字面量同源 pin） */
export const DSWF_DOC_TAB_KIND = 'dswf-doc'
/** 概览 tab 类型 kind（plugin.ts OVERVIEW_TAB_KIND 结构同型镜像） */
export const DSWF_OVERVIEW_TAB_KIND = 'dswf-overview'
/** 文档 tab 资源地址前缀（dsh-resource:// 资源面——plugin.ts DOC_ADDRESS_PREFIX 同源镜像） */
export const DSWF_DOC_ADDRESS_PREFIX = `dsh-resource://${DSWF_DOC_TAB_KIND}/`

/** 文档 tab 地址（= 去重键 contentId：同 projectId+docRel 同 tab、异地址新开） */
export function forgeDocAddress(projectId: string, docRel: string): string {
  return `${DSWF_DOC_ADDRESS_PREFIX}${projectId}/${docRel}`
}

/** 文档 tab 地址解析（纯函数）：前缀 + `<projectId>/<docRel>`；形状非法 → null（占位面） */
export function parseForgeDocAddress(
  address: string,
): { readonly projectId: string; readonly docRel: string } | null {
  if (!address.startsWith(DSWF_DOC_ADDRESS_PREFIX)) return null
  const rest = address.slice(DSWF_DOC_ADDRESS_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0 || slash === rest.length - 1) return null
  return { projectId: rest.slice(0, slash), docRel: rest.slice(slash + 1) }
}

/** 官方 tab 记录动作面窄面（SidebarRightTabActions 消费切片——结构同型镜像） */
export interface DockTabActionsMirror {
  /** 从本 tab 开资源（dock 开文档 tab——落在本 tab 所在窗格；kind 具名开） */
  openResource(address: string, options?: { readonly kind?: string }): void
}

/** 官方 tab 记录窄面（TabRecord 消费切片——contentId = 资源地址） */
export interface DockTabRecordMirror {
  readonly kind: string
  readonly contentId: string
  readonly actions?: DockTabActionsMirror
}

/** useTabInfo 钩子窄面（UseSidebarRightTabInfo 消费切片——seat inject 递达物） */
export interface UseDockTabInfoMirror {
  (): { readonly tab: DockTabRecordMirror }
}

/**
 * tabInfo 读取子件（fix-33 ⑤ 钩子形制：可选 tabInfo 钩子经子件无条件调用——在场性
 * 中途变化不漂移；渲染面 = children 渲染递_props）。导出面 = 单测。
 */
export function TabInfoReader({
  hook,
  children,
}: {
  readonly hook: UseDockTabInfoMirror
  readonly children: (info: { readonly tab: DockTabRecordMirror }) => ReactNode
}): ReactNode {
  const info = hook()
  return children(info)
}

/**
 * 文档开出动作推导（纯函数面）：tab 动作面与项目锚齐备 → `(docRel) => openResource(
 * forgeDocAddress, {kind})`（同地址去重 reveal、异地址新开——官方资源面缺省）；任一
 * 缺席 → undefined（概览文档行/抽屉参考 chip 非交互呈现）。官方动作面异常 fail-soft。
 */
export function dockDocOpener(
  tabActions: DockTabActionsMirror | undefined,
  projectId: string | null,
): ((docRel: string) => void) | undefined {
  if (tabActions === undefined || projectId === null) return undefined
  return (docRel: string): void => {
    try {
      tabActions.openResource(forgeDocAddress(projectId, docRel), { kind: DSWF_DOC_TAB_KIND })
    } catch {
      // fail-soft：无在场面（会话卸载瞬态）——官方 openResource 抛错不外溢
    }
  }
}

/** 转移对话框目标（TaskDetail 投影——task + allowedTransitions 唯一源） */
export interface TransitionTarget {
  readonly task: TransitionTaskView
  readonly allowedTransitions: readonly TaskStatus[]
}

/**
 * 任务聚焦应用判定（纯函数，4.2 UF-3 流程 7）：桥聚焦 nonce 未曾应用 → 应用该聚焦；
 * 已应用 nonce（或无聚焦）→ null（effect 仅落点——逻辑归纯面直测）。同载荷重复点击 =
 * nonce 恒新 → 恒重应用（重复聚焦重开抽屉）。
 */
export function nextTaskFocusApply(appliedNonce: number, focus: ForgeTaskFocus | null): ForgeTaskFocus | null {
  if (focus === null || focus.nonce === appliedNonce) return null
  return focus
}

/** 概览 dock 装配体 props（纯渲染面——全部状态经 props 注入，静态全相位可测） */
export interface OverviewDockAssemblyProps {
  /** 锚定项目（null = 无锚空态——不猜首个） */
  readonly projectId: string | null
  /** ov-head 会话计数（快照缺席 = undefined → 省略段） */
  readonly sessionCount?: number
  /** 文档开出（缺席 = 文档行/参考 chip 非交互） */
  readonly onOpenDoc?: (docRel: string) => void
  /** 挂接会话 pill 跳会话（缺席 = 非交互呈现） */
  readonly onOpenSession?: (sessionId: string) => void
  /** 打开新会话通道（4.6：行头预填/诊断发送/派发指令——openSessionWithPreset 组合子闭包；缺席 = 入口不呈现） */
  readonly onStartSession?: (request: SessionOpenRequest) => void
  /** 抽屉开着的任务（null = 关） */
  readonly drawerTaskId: string | null
  readonly onOpenTask: (taskId: string) => void
  readonly onCloseDrawer: () => void
  /** 转移对话框目标（null = 关；加载在途 = null——装载壳效应细节） */
  readonly transitionTarget: TransitionTarget | null
  readonly onOpenTransition: (taskId: string) => void
  readonly onCloseTransition: () => void
  /** 待应用任务聚焦（4.2 pill 点击——feature 选中受控注入 + 任务子 tab 切换 nonce；null/undefined = 无） */
  readonly taskFocus?: ForgeTaskFocus | null
  /** feature 选中释放（4.2——用户 pill 菜单切换即释放聚焦覆盖，恢复本地切换） */
  readonly onFeatureUserSwitch?: () => void
  /** 任务失败诊断 @ 锚文档根（OverviewDockBody fail-soft 装载注入——useProjectDocsRoot
   *  项目行推导；缺席 = TaskDrawer 回退 `docs` 缺省锚） */
  readonly docsRoot?: string
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

/**
 * 概览 dock 装配体（纯渲染）：无锚空态 | OverviewTab（renderTasksTab 槽 = TasksTab 全
 * 接线[onOpenTask/onTransition/activeTaskId/featureSlug 聚焦/proposals 双轨/会话通道]）+
 * TaskDrawer（onOpenDoc/onOpenSession/onTransition/onStartSession 诊断发送）+
 * TransitionDialog（allowedTransitions 唯一源直喂）。
 * 任务行/DAG 节点/泳道卡片/⋯ 菜单四途径经 TasksTab onOpenTask/onTransition 汇于本装配体；
 * 会话头挂接 pill（4.2）经 taskFocus 注入（feature 选中 + 子 tab 切换 nonce + 抽屉）。
 */
export function OverviewDockAssembly({
  projectId,
  sessionCount,
  onOpenDoc,
  onOpenSession,
  onStartSession,
  drawerTaskId,
  onOpenTask,
  onCloseDrawer,
  transitionTarget,
  onOpenTransition,
  onCloseTransition,
  taskFocus,
  onFeatureUserSwitch,
  docsRoot,
  makeClient,
}: OverviewDockAssemblyProps): ReactNode {
  if (projectId === null) {
    return (
      <div data-dswf-ov-unanchored="">
        <EmptyState
          className="dswf-ov-dock-empty"
          title="未锚定项目"
          description="概览随主视图会话锚定项目——多项目时打开任一项目会话即锚定；尚未注册项目时从左侧添加首个项目。"
        />
      </div>
    )
  }
  const renderTasksTab = (ctx: OverviewTasksContext): ReactNode => (
    <TasksTab
      projectId={ctx.projectId}
      search={ctx.search}
      sort={ctx.sort}
      activeStatuses={ctx.activeStatuses}
      statusFilter={ctx.statusFilter}
      features={ctx.features}
      proposals={ctx.proposals}
      onToggleStatus={ctx.onToggleStatus}
      onClearStatuses={ctx.onClearStatuses}
      onOpenTask={onOpenTask}
      onTransition={onOpenTransition}
      activeTaskId={drawerTaskId ?? undefined}
      {...(taskFocus !== null && taskFocus !== undefined ? { featureSlug: taskFocus.featureSlug } : {})}
      {...(onFeatureUserSwitch !== undefined ? { onFeatureUserSwitch } : {})}
      {...(ctx.docsRoot !== undefined ? { docsRoot: ctx.docsRoot } : {})}
      {...(onStartSession !== undefined ? { onStartSession } : {})}
      {...(onOpenSession !== undefined ? { onOpenSession } : {})}
      makeClient={makeClient}
    />
  )
  return (
    <>
      <OverviewTab
        projectId={projectId}
        sessionCount={sessionCount}
        onOpenDoc={onOpenDoc}
        renderTasksTab={renderTasksTab}
        focusTasksNonce={taskFocus?.nonce}
        {...(onStartSession !== undefined ? { onStartSession } : {})}
        makeClient={makeClient}
      />
      <TaskDrawer
        projectId={projectId}
        taskId={drawerTaskId}
        onClose={onCloseDrawer}
        onOpenDoc={onOpenDoc}
        onOpenSession={onOpenSession}
        onTransition={onOpenTransition}
        {...(onStartSession !== undefined ? { onStartSession } : {})}
        {...(docsRoot !== undefined ? { docsRoot } : {})}
        makeClient={makeClient}
      />
      {transitionTarget !== null ? (
        <TransitionDialog
          projectId={projectId}
          task={transitionTarget.task}
          allowedTransitions={transitionTarget.allowedTransitions}
          onCancel={onCloseTransition}
          onDone={() => {
            onCloseTransition() // 快照呈现归事件订阅重取（transition 写 → emitTasksChanged）
          }}
          makeClient={makeClient}
        />
      ) : null}
    </>
  )
}

/** 概览 tab body（状态壳）：桥订阅读锚定上下文 + 任务聚焦应用 + 抽屉/对话框受控态 + 对话框目标拉取。 */
export interface OverviewDockBodyProps {
  /** 锚定上下文（缺省无锚——桥缺席/单测面） */
  readonly overview: ForgeOverviewContext
  /** 桥任务聚焦（4.2 pill 点击写回——nonce 对照应用；null = 无待聚焦） */
  readonly taskFocus: ForgeTaskFocus | null
  /** 本 tab 动作面（TabInfoReader 递达；缺席 = 文档行非交互） */
  readonly tabActions?: DockTabActionsMirror
  /** 挂接会话 pill 跳会话（插件 inject face——uiWorkspace.openSession 闭包；缺席 = 非交互） */
  readonly onOpenSession?: (sessionId: string) => void
  /** 打开新会话编排器（4.6 插件 inject face——openSessionWithPreset 组合子；缺席 = 入口不呈现） */
  readonly openSession?: OpenSessionOrchestrator
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

export function OverviewDockBody({
  overview,
  taskFocus,
  tabActions,
  onOpenSession,
  openSession,
  makeClient,
}: OverviewDockBodyProps): ReactNode {
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null)
  const [transitionTaskId, setTransitionTaskId] = useState<string | null>(null)
  // 任务聚焦应用（4.2 UF-3 流程 7）：桥聚焦 nonce 未曾应用 → 抽屉打开 + 聚焦注入
  //（feature 选中 + 任务子 tab 切换经 assembly 递达）；用户 feature 菜单切换 = 释放
  // 聚焦覆盖恢复本地切换（抽屉保持——抽屉任务域与 feature 选中正交）
  const [appliedFocus, setAppliedFocus] = useState<ForgeTaskFocus | null>(null)
  const appliedNonceRef = useRef(-1)
  useEffect(() => {
    const apply = nextTaskFocusApply(appliedNonceRef.current, taskFocus)
    if (apply === null) return
    appliedNonceRef.current = apply.nonce
    setAppliedFocus(apply)
    setDrawerTaskId(apply.taskId)
  }, [taskFocus])
  const handleFeatureUserSwitch = useCallback((): void => {
    setAppliedFocus(null)
  }, [])
  // 对话框目标拉取（3.7 useTaskDetail 复用：taskId 变更骨架重置 + 事件静默重取同口径；
  // 抽屉同任务并存 = 各自拉取一份只读详情，互不干扰）
  const [dialogLoad] = useTaskDetail(overview.projectId ?? '', transitionTaskId, makeClient)
  const transitionTarget: TransitionTarget | null =
    transitionTaskId !== null && dialogLoad.detail !== undefined
      ? { task: dialogLoad.detail, allowedTransitions: dialogLoad.detail.allowedTransitions }
      : null

  // 任务失败诊断 @ 锚文档根（fail-soft 装载：projects.get 项目行推导——抽屉在概览头路
  // 之外渲染，独立装载；失败/缺席 = undefined 不阻断，TaskDrawer 回退 `docs` 缺省锚）
  const docsRoot = useProjectDocsRoot(overview.projectId, makeClient)

  // 打开新会话通道（4.6）：锚定 workspaceId + openSessionWithPreset 组合子（失败留场归
  // 阶段化错误——编排器各阶段 fail-soft 不炸壳；预填不发送/诊断与派发 autosend 语义归请求）
  const handleStartSession = useCallback(
    (request: SessionOpenRequest): void => {
      if (overview.workspaceId === null || openSession === undefined) return
      void openSession.openSessionWithPreset({
        workspaceId: overview.workspaceId,
        ...(request.mode !== undefined ? { mode: request.mode } : {}),
        prefill: request.prefill,
        ...(request.autosend === true ? { autosend: true } : {}),
      })
    },
    [overview.workspaceId, openSession],
  )

  const handleOpenTask = useCallback((taskId: string): void => {
    setDrawerTaskId(taskId)
  }, [])
  const handleCloseDrawer = useCallback((): void => {
    setDrawerTaskId(null)
  }, [])
  const handleOpenTransition = useCallback((taskId: string): void => {
    setTransitionTaskId(taskId)
  }, [])
  const handleCloseTransition = useCallback((): void => {
    setTransitionTaskId(null)
  }, [])
  const onOpenDoc = dockDocOpener(tabActions, overview.projectId)

  return (
    <OverviewDockAssembly
      projectId={overview.projectId}
      sessionCount={overview.sessionCount}
      onOpenDoc={onOpenDoc}
      onOpenSession={onOpenSession}
      {...(openSession !== undefined ? { onStartSession: handleStartSession } : {})}
      drawerTaskId={drawerTaskId}
      onOpenTask={handleOpenTask}
      onCloseDrawer={handleCloseDrawer}
      transitionTarget={transitionTarget}
      onOpenTransition={handleOpenTransition}
      onCloseTransition={handleCloseTransition}
      taskFocus={appliedFocus}
      onFeatureUserSwitch={handleFeatureUserSwitch}
      {...(docsRoot !== undefined ? { docsRoot } : {})}
      makeClient={makeClient}
    />
  )
}

/**
 * 概览 tab body（`sidebar.right.pane.tab` keyed 'dswf-overview' 占用者——product-views
 * 发布件）：tabInfo 钩子（seat inject 恒递达）经 TabInfoReader 解出动作面 → 桥订阅锚定
 * 上下文（ShellHost 写回）→ OverviewDockBody。useTabInfo 缺席（非壳载体/SSR 单测）=
 * 动作面降级（文档行非交互），概览主体照常呈现。
 */
export interface ForgeOverviewTabProps {
  /** 官方 tabInfo 钩子（seat inject `{hooks:{tabInfo}}` 递达——生产面恒在场） */
  readonly useTabInfo?: UseDockTabInfoMirror
  /** 工作台桥（插件 inject face——锚定上下文订阅源；缺席 = 无锚空态） */
  readonly bridge?: Pick<WorkbenchBridge, 'subscribe' | 'getSnapshot'>
  /** 挂接会话 pill 跳会话（插件 inject face；缺席 = 非交互呈现） */
  readonly onOpenSession?: (sessionId: string) => void
  /** 打开新会话编排器（4.6 插件 inject face；缺席 = 行头/诊断/派发入口不呈现） */
  readonly openSession?: OpenSessionOrchestrator
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

export function ForgeOverviewTab(props: ForgeOverviewTabProps): ReactNode {
  return props.useTabInfo === undefined ? (
    <OverviewTabWithBridge {...props} tabActions={undefined} />
  ) : (
    <TabInfoReader hook={props.useTabInfo}>
      {(info) => <OverviewTabWithBridge {...props} tabActions={info.tab.actions} />}
    </TabInfoReader>
  )
}

/** 概览 tab body 桥订阅层（useSyncExternalStore 读锚定上下文 + 任务聚焦——ShellHost/pill 点击写回驱动） */
function OverviewTabWithBridge(
  props: ForgeOverviewTabProps & { readonly tabActions?: DockTabActionsMirror },
): ReactNode {
  const bridge = props.bridge
  const subscribe = useCallback(
    (onChange: () => void): (() => void) => (bridge === undefined ? () => {} : bridge.subscribe(onChange)),
    [bridge],
  )
  const readSnapshot = useCallback(
    () => (bridge === undefined ? null : bridge.getSnapshot()),
    [bridge],
  )
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, readSnapshot)
  const overview = snapshot?.overview ?? initialOverviewContext()
  return (
    <OverviewDockBody
      overview={overview}
      taskFocus={snapshot?.taskFocus ?? null}
      tabActions={props.tabActions}
      onOpenSession={props.onOpenSession}
      openSession={props.openSession}
      makeClient={props.makeClient}
    />
  )
}

/**
 * 文档 tab body（`sidebar.right.pane.tab` keyed 'dswf-doc' 占用者）：tabInfo 读取
 * contentId（= 开出地址）→ 解析 `<projectId>/<docRel>` → DocsTab（3.9 本体）；地址
 * 形状非法（持久化布局携带陈旧地址等）= 占位空态不炸 tab。useTabInfo 缺席（非壳载体）
 * = null（生产面 seat inject 恒递达）。
 */
export interface ForgeDocsTabProps {
  /** 官方 tabInfo 钩子（seat inject 递达——contentId 读取源） */
  readonly useTabInfo?: UseDockTabInfoMirror
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

export function ForgeDocsTab({ useTabInfo, makeClient }: ForgeDocsTabProps): ReactNode {
  if (useTabInfo === undefined) return null
  return (
    <TabInfoReader hook={useTabInfo}>
      {(info) => {
        const parsed = parseForgeDocAddress(info.tab.contentId)
        return parsed === null ? (
          <div data-dswf-doc-invalid="">
            <EmptyState
              className="dswf-ov-dock-empty"
              title="文档地址无效"
              description="该 tab 携带的文档地址无法解析——关闭后从概览重新打开。"
            />
          </div>
        ) : (
          <DocsTab projectId={parsed.projectId} docRel={parsed.docRel} makeClient={makeClient} />
        )
      }}
    </TabInfoReader>
  )
}
