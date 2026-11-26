// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 右栏两 dock tab 装配体（定位：装配——4.1 Integration #4）：官方 `sidebar.right.pane.tab`
// keyed 槽两占用者（概览 tab 键 / 文档 tab 键——键族单源 @dsh-forge/lib-ui[裁决 5]；
// 注册面在 client-plugin/plugin.ts 两段：
// sidebarRightTabs.register 类型定义 + 本模块组件经 product-views 发布为 keyed body）。
// 官方缝口径（上游 ui-sidebar-right 源码核实）：
//   - 概览 tab 占用者经 `sidebar.right.pane.tab` keyed 槽装载（inject 自解析缝——
//     overview-dock-face.ts 装配）；文档开出经具名服务缝（见 dockDocOpener 头注）。
// 2.8 文档开出退役自绘渠道（用户裁决 2026-11-24：文档打开沿用官方渠道，AGENTS 1.2 复用
// 优先）：概览/Spec 文档行点击 = `ctx.sidebarRight.openResource(地址)`——官方
// documentpreview（@deepseek-ai/dsh-client-ui-sidebar-documentpreview，patterns
// `dsh-resource://file/**` + canOpen session scope，内置 markdown/html/
// 文本/图片/pdf/office 渲染）；不点名 kind：注册表按文件后缀自动选渲染器，无专属渲染器时
// 落纯文本兜底（强制 kind 'text' = 绕过排序，图片/PDF 被按文本开；官方文件树同口径）；地址 = 官方 sessionFileAddress(sessionId, join(forgeDir,
// docRel))（@deepseek-ai/dsh-util-workspace-path 构造器单源，禁手拼字符串）；openResource
// 内部 require() 自取当前挂载会话动作面（概览 tab 在会话面板内则必成功），sessionId 取
// 服务 `mounted` 在屏会话快照。forgeDir = forgeDirs Typert facts dirKey 'forgeDir' 行
// （官方 gateway 面单源，overview-data/dir-rows 同源——点击时现查非缓存；零 preload 依赖：
// overview-dockkit-alignment 2.13 前置取数与打开动作同走 Typert 通路）。ForgeDocsTab 文档 tab body 与 DSWF_DOC_TAB_KIND 注册/打开
// 路径退役（forge:docs/read 文档 tab 读取用途随之退役）；DSWF_DOC_ADDRESS_PREFIX/
// forgeDocAddress/parseForgeDocAddress 保留 = 自宿主 legacy 壳（apps/web ShellHost
// openDocResource 路径 + 壳侧同源 pin）兼容面，官方宿主零打开径。
// 跨树缝：概览项目上下文经工作台桥（ShellHost 锚定写回 ← knowledge-anchor 裁决）；
// 抽屉（3.7）/转移对话框（3.8）/三视图（3.6）在本装配体内全链接通。
// 4.2 任务聚焦消费：桥 taskFocus（会话头挂接 pill 点击 → 插件 inject face 写回）→
// OverviewDockBody nonce 对照应用（抽屉打开 + 任务子 tab 切换 + feature 选中——UF-3
// 流程 7 全链路的右栏半段）。
// 三签不动（Hard Rule）：零左栏/中区/conversation.view 改动；概览内容禁编排逻辑（纯视图
// 组合多域读——编排归 core）。
import { useCallback, useEffect, Fragment, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { TaskStatus } from '@dsh-forge/contracts'
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import { DSWF_OVERVIEW_TAB_KEY } from '@dsh-forge/lib-ui'
import { EmptyState, ErrorBar } from '../components.js'
import type { RpcClientFactory } from './rpc-channels.js'
import { preloadDirFactsClientFactory, type DirFactsClientFactory } from './overview/dir-rows.js'
import { anchorProjectResolver } from './anchor-resolver.js'
import { KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT } from '../keyed-section.js'
import './docs/docs.css'

// 概览锚归属解析缝（模块级单例——引用稳定，useSelfAnchor effect deps 不逐帧重挂）
const SELF_ANCHOR_PROJECT_RESOLVER = anchorProjectResolver()
import { OverviewTab, type OverviewTasksContext } from './overview/OverviewTab.js'
import type { SessionOpenRequest } from './overview/message-format.js'
import type { OpenSessionOrchestrator } from '../open-session.js'
import type { BugQuickAddFn } from '../session-actions.js'
import { TasksTab } from './overview/task-tab/task-tab.js'
import type { TransitionTaskView } from './overview/drawer/transition-dialog.js'
import {
  initialOverviewContext,
  type ForgeOverviewContext,
  type ForgeTaskFocus,
  type WorkbenchBridge,
} from './bridge-mirror.js'
import { useSelfAnchor, type SelfAnchorServices } from './self-anchor.js'

/** 文档 tab 类型 kind（legacy 自宿主壳兼容镜像——apps/web 壳侧同源 pin 消费；官方宿主
 * 零注册/零打开径：文档开出改走官方 documentpreview，见 dockDocOpener 头注） */
export const DSWF_DOC_TAB_KIND = 'dswf-doc'
/** 概览 tab 类型 kind（裁决 5 键族单源改引——lib/ui DSWF_OVERVIEW_TAB_KEY 同源镜像，包内字面量退役） */
export const DSWF_OVERVIEW_TAB_KIND = DSWF_OVERVIEW_TAB_KEY
/** 文档 tab 资源地址前缀（legacy 自绘地址 scheme——同上，官方宿主零打开径） */
export const DSWF_DOC_ADDRESS_PREFIX = `dsh-resource://${DSWF_DOC_TAB_KIND}/`

/** 文档 tab 地址（legacy 自宿主壳 = 去重键 contentId：同 projectId+docRel 同 tab、异地址新开） */
export function forgeDocAddress(projectId: string, docRel: string): string {
  return `${DSWF_DOC_ADDRESS_PREFIX}${projectId}/${docRel}`
}

/** 文档 tab 地址解析（legacy 纯函数）：前缀 + `<projectId>/<docRel>`；形状非法 → null */
export function parseForgeDocAddress(
  address: string,
): { readonly projectId: string; readonly docRel: string } | null {
  if (!address.startsWith(DSWF_DOC_ADDRESS_PREFIX)) return null
  const rest = address.slice(DSWF_DOC_ADDRESS_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0 || slash === rest.length - 1) return null
  return { projectId: rest.slice(0, slash), docRel: rest.slice(slash + 1) }
}

/** 官方右栏导航服务窄面（ctx.sidebarRight ISidebarRight 消费切片——openResource +
 *  在屏会话快照 `mounted`） */
export interface DockSidebarRightMirror {
  openResource(address: string, options?: { readonly kind?: string }): void
  readonly mounted?: { readonly getSnapshot: () => string | undefined }
}

/** forge 目录 × 文档相对键 → 绝对路径（docRel 相对 forge_dir；win 反斜杠归一、尾分隔符收口） */
export function joinForgeDocPath(forgeDir: string, docRel: string): string {
  const base = forgeDir.replaceAll('\\', '/').replace(/\/+$/, '')
  const rel = docRel.replaceAll('\\', '/').replace(/^\/+/, '')
  return rel === '' ? base : `${base}/${rel}`
}

/** 官方文档资源地址（sessionFileAddress 官方构造器单源——禁手拼字符串；查看器只认
 *  session 作用域地址，故 sessionId 内嵌于地址） */
export function forgeDocFileAddress(sessionId: string, forgeDir: string, docRel: string): string {
  return sessionFileAddress(sessionId, joinForgeDocPath(forgeDir, docRel))
}

/**
 * 文档开出动作推导（官方渠道缝）：右栏导航服务与项目锚齐备 → `(docRel) => openResource(
 * forgeDocFileAddress(...))`——官方 documentpreview 打开（不点名 kind：注册表按文件
 * 后缀自动选渲染器——markdown/html/图片/PDF/Office，无专属渲染器时落纯文本兜底；
 * 与官方文件树 openResource(address) 同口径）。sessionId = 服务 `mounted` 在屏会话快照
 * （点击时点现取）；forgeDir = forgeDirs Typert facts dirKey 'forgeDir' 行（官方 gateway
 * 面唯一数据源——缺省 preloadDirFactsClientFactory 零 preload/window.dshForge 依赖，与
 * 打开动作同通路）。
 * 任一服务缺席 → undefined（概览文档行/抽屉参考 chip 非交互呈现——仅此缺席降级属 fail-soft）。
 * 调用期异常（数据路不可达/forgeDir 行缺席/openResource 抛错）不吞：经 onError 呈现可见
 * 错误条（文案含失败原因）+ console.warn 留痕（client bundle 诊断豁免面）。
 */
export function dockDocOpener(
  sidebarRight: DockSidebarRightMirror | undefined,
  projectId: string | null,
  onError?: (message: string) => void,
  makeDirFacts: DirFactsClientFactory = preloadDirFactsClientFactory,
): ((docRel: string) => void) | undefined {
  if (sidebarRight === undefined || projectId === null) return undefined
  return (docRel: string): void => {
    void (async (): Promise<void> => {
      const sessionId = sidebarRight.mounted?.getSnapshot() ?? ''
      if (sessionId === '') throw new Error('sidebarRight.mounted 缺席——无在屏会话')
      const rows = await makeDirFacts().facts(projectId)
      const forgeDir = rows.find((row) => row.dirKey === 'forgeDir')?.dir ?? ''
      if (forgeDir === '') throw new Error(`forgeDirs facts forgeDir 行缺席（projectId=${projectId}）`)
      sidebarRight.openResource(forgeDocFileAddress(sessionId, forgeDir, docRel))
    })().catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(`[dsh-forge/project] 文档开出失败（projectId=${projectId}）`, error)
      onError?.(`文档开出失败：${reason}`)
    })
  }
}

/** 转移对话框目标（TaskDetail 投影——task + allowedTransitions 唯一源；presetToStatus =
 *  ⋯ 菜单所点预设态——直喂 TransitionDialog 初选，抽屉径缺席 = 允许集首项） */
export interface TransitionTarget {
  readonly task: TransitionTaskView
  readonly allowedTransitions: readonly TaskStatus[]
  readonly presetToStatus?: TaskStatus
}

/**
 * 任务聚焦应用判定（纯函数，4.2 UF-3 流程 7）：桥聚焦 nonce 未曾应用 → 应用该聚焦；
 * 已应用 nonce（或无聚焦）→ null（effect 仅落点——逻辑归纯面直测）。同载荷重复点击 =
 * nonce 恒新 → 恒重应用（重复聚焦重开抽屉）。
 */
export function nextTaskFocusApply<F extends ForgeTaskFocus>(appliedNonce: number, focus: F | null): F | null {
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
  /** 打开新会话通道（行头预填/诊断发送/派发指令——openSessionWithPreset 组合子闭包；缺席 = 入口不呈现） */
  readonly onStartSession?: (request: SessionOpenRequest) => void
  /** ⟞ 打开 worker 执行子会话（S5 列表行——插件 inject face；缺席 = 按钮不呈现） */
  readonly onOpenWorkerSession?: (childSessionId: string, parentSessionId?: string) => void
  /** Bug 行「添加到会话」（composer-bug-reference 1.4——插件 inject face；缺席 = 按钮不呈现） */
  readonly onAddBugToSession?: (bug: { readonly bugId: string; readonly summary: string }) => void
  /** 弹窗开着的任务（null = 关——三视图行高亮源；弹窗本体挂载在 ShellHost[D23 挂载独立]） */
  readonly drawerTaskId: string | null
  /** 任务行/DAG 节点/泳道卡点击 → 弹窗（桥 openTaskDrawer 写面；缺席 = 非交互） */
  readonly onOpenTask?: (taskId: string) => void
  /** ⋯ 转移预设 → 对话框（桥 openTaskTransition 写面——toStatus = 预设初选透传；缺席 = 菜单无转移项） */
  readonly onOpenTransition?: (taskId: string, toStatus?: TaskStatus) => void
  /** 待应用任务聚焦（4.2 pill 点击——feature 选中受控注入 + 任务子 tab 切换 nonce；null/undefined = 无） */
  readonly taskFocus?: ForgeTaskFocus | null
  /** feature 选中释放（4.2——用户 pill 菜单切换即释放聚焦覆盖，恢复本地切换） */
  readonly onFeatureUserSwitch?: () => void
  /** RPC client 构造器（缺省 overviewRpcClientFactory Typert 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

/**
 * 概览 dock 装配体（纯渲染）：无锚空态 | OverviewTab（renderTasksTab 槽 = TasksTab 全
 * 接线[onOpenTask/onTransition/activeTaskId/featureSlug 聚焦/会话通道]）。
 * m3.1 D21/D23：任务详情弹窗与转移对话框退役于本装配体——迁 ShellHost 常驻树（挂载
 * 独立于 dock，对话中直接打开）；任务行/DAG 节点/泳道卡片三途径经 onOpenTask 汇于
 * 桥 openTaskDrawer；会话头挂接 pill（4.2）经 taskFocus 注入（feature 选中 + 子 tab 切换）。
 */
export function OverviewDockAssembly({
  projectId,
  sessionCount,
  onOpenDoc,
  onOpenSession,
  onStartSession,
  onOpenWorkerSession,
  onAddBugToSession,
  drawerTaskId,
  onOpenTask,
  onOpenTransition,
  taskFocus,
  onFeatureUserSwitch,
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
      onToggleStatus={ctx.onToggleStatus}
      onClearStatuses={ctx.onClearStatuses}
      {...(onOpenTask !== undefined ? { onOpenTask } : {})}
      {...(onOpenTransition !== undefined ? { onTransition: onOpenTransition } : {})}
      {...(drawerTaskId !== null ? { activeTaskId: drawerTaskId } : {})}
      {...(taskFocus !== null && taskFocus !== undefined ? { featureSlug: taskFocus.featureSlug } : {})}
      {...(onFeatureUserSwitch !== undefined ? { onFeatureUserSwitch } : {})}
      {...(ctx.docsRoot !== undefined ? { docsRoot: ctx.docsRoot } : {})}
      {...(onStartSession !== undefined ? { onStartSession } : {})}
      {...(onOpenSession !== undefined ? { onOpenSession } : {})}
      {...(onOpenWorkerSession !== undefined ? { onOpenWorkerSession } : {})}
      makeClient={makeClient}
    />
  )
  return (
    <OverviewTab
      projectId={projectId}
      sessionCount={sessionCount}
      onOpenDoc={onOpenDoc}
      renderTasksTab={renderTasksTab}
      focusTasksNonce={taskFocus?.nonce}
      {...(onStartSession !== undefined ? { onStartSession } : {})}
      {...(onAddBugToSession !== undefined ? { onAddBugToSession } : {})}
      makeClient={makeClient}
    />
  )
}

/** 概览 tab body（状态壳）：桥订阅读锚定上下文 + 任务聚焦应用 + 任务行 → 弹窗/对话框桥写面。 */
export interface OverviewDockBodyProps {
  /** 锚定上下文（缺省无锚——桥缺席/单测面） */
  readonly overview: ForgeOverviewContext
  /** 桥任务聚焦（4.2 pill 点击写回——nonce 对照应用；null = 无待聚焦） */
  readonly taskFocus: ForgeTaskFocus | null
  /** 弹窗开着的任务（桥快照读回——三视图行高亮源；null = 关） */
  readonly drawerTaskId: string | null
  /** 任务行 → 弹窗（桥 openTaskDrawer 写面；缺席 = 行点击非交互） */
  readonly onOpenTask?: (taskId: string) => void
  /** ⋯ 转移预设 → 对话框（桥 openTaskTransition 写面——toStatus = 预设初选透传；缺席 = 菜单无转移项） */
  readonly onOpenTransition?: (taskId: string, toStatus?: TaskStatus) => void
  /** 官方右栏导航服务（插件 inject face——文档开出缝；缺席 = 文档行非交互） */
  readonly sidebarRight?: DockSidebarRightMirror
  /** 挂接会话 pill 跳会话（插件 inject face——uiWorkspace.openSession 闭包；缺席 = 非交互） */
  readonly onOpenSession?: (sessionId: string) => void
  /** ⟞ 打开 worker 执行子会话（S5 列表行——插件 inject face；缺席 = 按钮不呈现） */
  readonly onOpenWorkerSession?: (childSessionId: string, parentSessionId?: string) => void
  /** 打开新会话编排器（插件 inject face——openSessionWithPreset 组合子；缺席 = 入口不呈现） */
  readonly openSession?: OpenSessionOrchestrator
  /** Bug 行「添加到会话」（composer-bug-reference 1.4——插件 inject face；缺席 = 按钮不呈现） */
  readonly addBugToSession?: BugQuickAddFn
  /** RPC client 构造器（缺省 overviewRpcClientFactory Typert 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

export function OverviewDockBody({
  overview,
  taskFocus,
  drawerTaskId,
  onOpenTask,
  onOpenTransition,
  sidebarRight,
  onOpenSession,
  onOpenWorkerSession,
  openSession,
  addBugToSession,
  makeClient,
}: OverviewDockBodyProps): ReactNode {
  // 任务聚焦应用（4.2 UF-3 流程 7）：桥聚焦 nonce 未曾应用 → 聚焦注入（feature 选中 +
  // 任务子 tab 切换经 assembly 递达——弹窗开面归桥 drawerTaskId[ShellHost 消费]）；
  // 用户 feature 菜单切换 = 释放聚焦覆盖恢复本地切换
  const [appliedFocus, setAppliedFocus] = useState<ForgeTaskFocus | null>(null)
  const appliedNonceRef = useRef(-1)
  useEffect(() => {
    const apply = nextTaskFocusApply(appliedNonceRef.current, taskFocus)
    if (apply === null) return
    appliedNonceRef.current = apply.nonce
    setAppliedFocus(apply)
  }, [taskFocus])
  const handleFeatureUserSwitch = useCallback((): void => {
    setAppliedFocus(null)
  }, [])

  // 打开新会话通道：锚定 workspaceId + openSessionWithPreset 组合子（失败留场归
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

  // Bug 快速路径（1.4）：锚定 workspaceId 注入 + addBugToSession 动作（scoped 插入/
  // 开新会话预填编排归插件面；失败留场 fail-soft 不炸壳）
  const handleAddBugToSession = useCallback(
    (bug: { readonly bugId: string; readonly summary: string }): void => {
      if (addBugToSession === undefined) return
      void addBugToSession(bug, overview.workspaceId)
    },
    [addBugToSession, overview.workspaceId],
  )

  // 文档开出调用期异常可见面（2.13——fail-soft 不吞数据路异常）：dockDocOpener onError
  // 写回 → ErrorBar 错误条（文案含失败原因；下一次成功开出即清）
  const [docOpenError, setDocOpenError] = useState<string | null>(null)
  const handleDocOpenError = useCallback((message: string): void => {
    setDocOpenError(message)
  }, [])

  const onOpenDoc = dockDocOpener(sidebarRight, overview.projectId, handleDocOpenError)

  return (
    <>
      {docOpenError !== null ? (
        <ErrorBar
          className="dswf-ov-error"
          message={docOpenError}
          retryClassName="dswf-ov-retry"
          anchor="data-dswf-ov-doc-error"
        />
      ) : null}
      <OverviewDockAssembly
      projectId={overview.projectId}
      sessionCount={overview.sessionCount}
      onOpenDoc={onOpenDoc}
      onOpenSession={onOpenSession}
      {...(onOpenWorkerSession !== undefined ? { onOpenWorkerSession } : {})}
      {...(openSession !== undefined ? { onStartSession: handleStartSession } : {})}
      {...(addBugToSession !== undefined ? { onAddBugToSession: handleAddBugToSession } : {})}
      drawerTaskId={drawerTaskId}
      {...(onOpenTask !== undefined ? { onOpenTask } : {})}
      {...(onOpenTransition !== undefined ? { onOpenTransition } : {})}
      taskFocus={appliedFocus}
      onFeatureUserSwitch={handleFeatureUserSwitch}
      makeClient={makeClient}
      />
    </>
  )
}

/**
 * 概览 tab body（`sidebar.right.pane.tab` keyed 概览 tab 键占用者——product-views
 * 发布件）：桥订阅锚定上下文（ShellHost 写回）→ OverviewDockBody。官方右栏导航服务
 * 缺席（inject 缝缺席/SSR 单测）= 文档开出降级（文档行非交互），概览主体照常呈现。
 */
export interface ForgeOverviewTabProps {
  /** 工作台桥（插件 inject face——锚定上下文订阅源 + 弹窗/对话框写面；缺席 = 无锚空态） */
  readonly bridge?: Pick<WorkbenchBridge, 'subscribe' | 'getSnapshot' | 'openTaskDrawer' | 'openTaskTransition'>
  /** 官方右栏导航服务（插件 inject face——文档开出缝；缺席 = 文档行非交互呈现） */
  readonly sidebarRight?: DockSidebarRightMirror
  /** 挂接会话 pill 跳会话（插件 inject face；缺席 = 非交互呈现） */
  readonly onOpenSession?: (sessionId: string) => void
  /** ⟞ 打开 worker 执行子会话（S5 列表行——插件 inject face；缺席 = 按钮不呈现） */
  readonly onOpenWorkerSession?: (childSessionId: string, parentSessionId?: string) => void
  /** 打开新会话编排器（4.6 插件 inject face；缺席 = 行头/诊断/派发入口不呈现） */
  readonly openSession?: OpenSessionOrchestrator
  /** Bug 行「添加到会话」（composer-bug-reference 1.4 插件 inject face；缺席 = 按钮不呈现） */
  readonly addBugToSession?: BugQuickAddFn
  /** RPC client 构造器（缺省 overviewRpcClientFactory Typert 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
  /** 概览锚自解析服务缝（fix-11 缺陷 A——桥缺席/桥锚 null 时插件自解析退路；缺席 = 无退路） */
  readonly selfAnchor?: SelfAnchorServices
}

export function ForgeOverviewTab(props: ForgeOverviewTabProps): ReactNode {
  return <OverviewTabWithBridge {...props} />
}

// ── 项目台插槽节宿主（fix-7——project.section.knowledge-dir 渲染消费面） ──

/** 知识库目录节 keyed 占用键（knowledge 侧 KNOWLEDGE_DIR_SECTION_KEY 同源字面——跨 bundle 契约）。 */
export const OVERVIEW_KNOWLEDGE_DIR_ENTRY_KEY = 'dswf-knowledge-dir'

/**
 * 概览 tab 子槽声明表（宿主单点声明缝——settings-unification 圆桌裁定）：knowledge 等
 * 消费方 apply 期经 slots.inject(slot) 声明缝现查本声明落座（官方 SlotCore.register
 * children 协议——声明即占有，本登记卸载级联收拢子槽）。
 */
export const OVERVIEW_SECTIONS_CHILDREN: Record<string, { readonly kind: string; readonly scope: string }> = {
  [KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT]: { kind: 'keyed', scope: 'root' },
}

/** 官方 renderSlot 消费窄面（PropsRenderSlots 非 chain 键签名——结构同型镜像）。 */
export type OverviewSectionSlots = (
  key: string,
  owner?: Record<string, unknown>,
  opts?: { readonly entryKey?: string },
) => ReactNode

/** 项目台插槽节宿主 props（概览 tab 全部 props + 框架递达的子槽渲染 share）。 */
export interface ForgeOverviewSectionHostProps extends ForgeOverviewTabProps {
  /** 子槽渲染 share（children 声明在场由官方槽 runtime 递达；缺席 = 概览主体照常）。 */
  readonly renderSlot?: OverviewSectionSlots
}

/**
 * 概览 tab 插槽节宿主（`sidebar.right.pane.tab` keyed 概览 tab 键占用者——fix-7
 * knowledge-dir）：概览主体原样呈现后，经 renderSlot 消费 keyed 槽 roster——
 * project.section.knowledge-dir（entryKey 分发 = 知识库目录节占用键）。renderSlot
 * 缺席（宿主形状漂移/SSR 面）或槽 roster 空（占用键无落座/节组件退 null）= 零节呈现，
 * 概览主体不悬空不炸。
 */
export function ForgeOverviewSectionHost({ renderSlot, ...tabProps }: ForgeOverviewSectionHostProps): ReactNode {
  const sections =
    typeof renderSlot === 'function'
      ? [renderSlot(KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT, {}, { entryKey: OVERVIEW_KNOWLEDGE_DIR_ENTRY_KEY })]
      : []
  return (
    <>
      <ForgeOverviewTab {...tabProps} />
      {sections.map((section, i) =>
        section !== null && section !== undefined ? <Fragment key={i}>{section}</Fragment> : null,
      )}
    </>
  )
}
/** 概览 tab body 桥订阅层（useSyncExternalStore 读锚定上下文 + 任务聚焦 + 弹窗受控态
 *  ——ShellHost/pill 点击写回驱动；任务行 → 弹窗/对话框经桥写面[D23 跨树通道]） */
function OverviewTabWithBridge(props: ForgeOverviewTabProps): ReactNode {
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
  const bridgeOverview = snapshot?.overview ?? initialOverviewContext()
  // 概览锚自解析补位（fix-11 缺陷 A；bug 41a19182 斩传输）：桥锚 projectId 非空 = 桥裁决
  // 优先（集成态回归零变化）；null = 插件自解析退路（官方 workspace 上下文 → 注入式归属
  // 解析缝——宿主半 project.db 归属行 + workspaceRegistry 进程内直查），解析失败维持无锚。
  // 解析缝模块级单例（引用稳定——hook effect deps 不逐帧重挂）。
  const self = useSelfAnchor(props.selfAnchor, SELF_ANCHOR_PROJECT_RESOLVER)
  const overview: ForgeOverviewContext =
    bridgeOverview.projectId === null && self !== null
      ? { projectId: self.projectId, workspaceId: self.workspaceId, sessionCount: self.sessionCount }
      : bridgeOverview
  // 任务行 → 弹窗 / ⋯ 转移 → 对话框（桥写面——弹窗与对话框挂 ShellHost[D23 挂载独立]）
  const openTask = useCallback(
    (taskId: string): void => {
      bridge?.openTaskDrawer(taskId)
    },
    [bridge],
  )
  const openTransition = useCallback(
    (taskId: string, toStatus?: TaskStatus): void => {
      bridge?.openTaskTransition({ taskId, ...(toStatus !== undefined ? { toStatus } : {}) })
    },
    [bridge],
  )
  return (
    <OverviewDockBody
      overview={overview}
      taskFocus={snapshot?.taskFocus ?? null}
      drawerTaskId={snapshot?.drawerTaskId ?? null}
      onOpenTask={openTask}
      onOpenTransition={openTransition}
      sidebarRight={props.sidebarRight}
      onOpenSession={props.onOpenSession}
      onOpenWorkerSession={props.onOpenWorkerSession}
      openSession={props.openSession}
      addBugToSession={props.addBugToSession}
      makeClient={props.makeClient}
    />
  )
}

