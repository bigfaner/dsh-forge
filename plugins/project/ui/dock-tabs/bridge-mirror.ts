// 工作台桥消费切片镜像（1.45 随 dock tab 族注册面自 apps/web 平移本包）：桥本体 =
// 壳 C 类域（apps/web workbench/workbench-bridge.ts——ShellHost 侧真桥不随迁），本件为
// 结构同型镜像窄面（knowledge-face workbenchBridgeOf 同纪律）；TaskStatus 类型 import
// '@dsh-forge/contracts' 保持。createWorkbenchBridge/publishWorkbenchBridge 工厂镜像 =
// dock-tabs.test 单测锚（真桥写面消费——语义与壳侧正本逐字同源，漂移由两侧 pin 对账）。
import type { TaskStatus } from '@dsh-forge/contracts'

/** 官方面板导航窄面（插件侧绑定 layout.selectPanel——null = 回官方会话面板） */
export interface ForgeCenterNav {
  /** 进知识面板（官方 layout.selectPanel('dswf-knowledge')） */
  showKnowledge(): void
  /** 回会话面板（官方 layout.selectPanel(null)——官方 openSession 同径收口） */
  showSession(): void
}

/**
 * 概览项目上下文（4.1 ShellHost 锚定写回 → 右栏概览 tab 消费）：projectId = knowledge-anchor
 * 裁决（主视图会话优先 retainedBy.mainView，唯一项目兜底）；sessionCount = 锚定项目归属
 * workspace 的账本会话数（ov-head「N 会话」单源——sessions/workspaces 快照派生）；
 * workspaceId = 锚定项目归属工作区（4.6 打开新会话通道 openSessionWithPreset 入参——
 * 官方 openWorkspace 连接工作区并开会话）。
 */
export interface ForgeOverviewContext {
  /** 锚定项目（null = 无锚——多项目无会话/项目未就绪） */
  readonly projectId: string | null
  /** 锚定项目归属工作区（4.6 打开新会话编排入参；无锚 = null） */
  readonly workspaceId: string | null
  /** 锚定项目 workspace 会话数（快照缺席 = undefined → ov-head 省略段） */
  readonly sessionCount?: number
}

/**
 * 任务聚焦目标（4.2 UF-3 流程 7——会话头挂接 pill 点击 → 概览 + 抽屉全链路的跨树载荷）。
 * nonce 单调自增 = 重复聚焦判据（消费侧对照已应用 nonce——同载荷重复点击也重开抽屉）。
 */
export interface ForgeTaskFocus {
  /** 抽屉目标任务（taskId 代理主键——前端引用锚） */
  readonly taskId: string
  /** 任务子 tab feature 选中（pill 导航载荷——slug ≡ feature slug） */
  readonly featureSlug: string
  /** 聚焦序号（每次 openTaskFocus 自增） */
  readonly nonce: number
}

/** 桥快照（知识抽屉目标 + 概览项目上下文 + 任务聚焦 + 任务弹窗——跨槽树共享态的唯一载体） */
export interface ForgeWorkbenchSnapshot {
  /** 知识详情抽屉打开条目（null = 关闭） */
  readonly drawerEntryId: number | null
  /** 概览项目上下文（ShellHost 锚定写回——右栏概览 tab body 消费） */
  readonly overview: ForgeOverviewContext
  /** 任务聚焦目标（4.2 pill 点击写——右栏概览 tab body 消费；null = 无待聚焦） */
  readonly taskFocus: ForgeTaskFocus | null
  /** 任务详情弹窗打开任务（m3.1 D21/D23：弹窗挂载独立于 dock——ShellHost 常驻树消费；null = 关闭） */
  readonly drawerTaskId: string | null
  /**
   * 转移对话框聚焦目标（m3.1 D23：对话框随弹窗迁 ShellHost——任务 ⋯ 菜单跨树开窗通道；
   * nonce 单调自增 = 重复开窗判据，消费侧对照已应用 nonce——同任务重复点击也重开）。
   * toStatus = ⋯ 菜单所点预设态（对话框初选透传——抽屉径缺席 = 允许集首项）。
   */
  readonly transitionFocus: (ForgeTaskFocus & { readonly toStatus?: TaskStatus }) | null
}

/** 概览上下文缺省（ShellHost 锚定生效前/桥刚创建——无锚不猜首个） */
export function initialOverviewContext(): ForgeOverviewContext {
  return { projectId: null, workspaceId: null }
}

/** 工作台桥（导航 + 抽屉缝 + 概览上下文缝 + 任务聚焦缝；快照源形状 = useSyncExternalStore 可直订） */
export interface WorkbenchBridge extends ForgeCenterNav {
  /** 快照订阅（知识面板/概览 tab 消费——抽屉目标与概览上下文/任务聚焦变更驱动） */
  subscribe(listener: () => void): () => void
    /** 当前快照（身份稳定——未变更恒同引用） */
  getSnapshot(): ForgeWorkbenchSnapshot
  /** 抽屉态写回（知识面板卡片点击/✕ 关闭——装配单向回流） */
  setDrawerEntry(entryId: number | null): void
  /** 概览项目上下文写回（4.1 ShellHost 锚定效应——右栏概览 tab 消费） */
  setOverviewContext(context: ForgeOverviewContext): void
  /**
   * 任务聚焦写回（4.2 会话头 pill 点击——插件 inject face 闭包）：dock 开概览 tab 后发布
   * 聚焦目标（任务子 tab + feature 选中——消费侧 OverviewDockBody nonce 对照应用）。
   */
  openTaskFocus(payload: { readonly taskId: string; readonly featureSlug: string }): void
  /**
   * 任务详情弹窗打开（m3.1 D21/D23：挂载独立于 dock——写方 = 三视图任务行 / 会话头 pill /
   * 悬浮面板；消费方 = ShellHost 常驻树条件挂载。切换任务原位换内容，单例语义归快照单值）。
   */
  openTaskDrawer(taskId: string): void
  /** 任务详情弹窗关闭（Esc/✕——ShellHost 装配上抛；幂等） */
  closeTaskDrawer(): void
  /**
   * 转移对话框开（m3.1 D23：任务 ⋯ 菜单 → 对话框[随弹窗挂 ShellHost]——nonce 自增重开；
   * featureSlug 载荷缺席面 = 转移通道不消费，置空占位；toStatus = 预设态透传）。
   */
  openTaskTransition(payload: { readonly taskId: string; readonly toStatus?: TaskStatus }): void
}

/** 桥的全局挂点（与 __DSH_FORGE_VIEWS__ 同族：装配 ↔ 插件两单元的页内缝） */
export interface DshForgeWorkbenchGlobal {
  __DSH_FORGE_WORKBENCH__?: WorkbenchBridge
}

/**
 * 创建并发布工作台桥（工厂镜像——单测锚；生产真桥 = 壳侧 workbench-bridge.ts 同函数，
 * nav 闭包绑定官方 layout.selectPanel）。快照源为最小 store（身份稳定；订阅同步通知）。
 * 发布与创建一体：桥的本体即页内全局。
 */
export function createWorkbenchBridge(
  nav: ForgeCenterNav,
  options?: { readonly publish?: boolean },
): WorkbenchBridge {
  let snapshot: ForgeWorkbenchSnapshot = {
    drawerEntryId: null,
    overview: initialOverviewContext(),
    taskFocus: null,
    drawerTaskId: null,
    transitionFocus: null,
  }
  let focusNonce = 0
  let transitionNonce = 0
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) listener()
  }
  const bridge: WorkbenchBridge = {
    showKnowledge: nav.showKnowledge,
    showSession: nav.showSession,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: (): ForgeWorkbenchSnapshot => snapshot,
    setDrawerEntry: (entryId: number | null): void => {
      if (snapshot.drawerEntryId === entryId) return
      snapshot = { ...snapshot, drawerEntryId: entryId }
      notify()
    },
    setOverviewContext: (context: ForgeOverviewContext): void => {
      if (
        snapshot.overview.projectId === context.projectId &&
        snapshot.overview.workspaceId === context.workspaceId &&
        snapshot.overview.sessionCount === context.sessionCount
      ) {
        return
      }
      snapshot = { ...snapshot, overview: context }
      notify()
    },
    openTaskFocus: (payload: { readonly taskId: string; readonly featureSlug: string }): void => {
      focusNonce += 1
      snapshot = { ...snapshot, taskFocus: { ...payload, nonce: focusNonce } }
      notify()
    },
    openTaskDrawer: (taskId: string): void => {
      if (snapshot.drawerTaskId === taskId) return
      snapshot = { ...snapshot, drawerTaskId: taskId }
      notify()
    },
    closeTaskDrawer: (): void => {
      if (snapshot.drawerTaskId === null) return
      snapshot = { ...snapshot, drawerTaskId: null }
      notify()
    },
    openTaskTransition: (payload: { readonly taskId: string; readonly toStatus?: TaskStatus }): void => {
      transitionNonce += 1
      snapshot = { ...snapshot, transitionFocus: { ...payload, featureSlug: '', nonce: transitionNonce } }
      notify()
    },
  }
  // publish=false：不落页内全局（无壳宿主的任务弹窗本地桥——knowledge/task-loop 读
  // 该全局取项目锚，本地桥不得冒充锚源）
  if (options?.publish !== false) {
    ;(globalThis as DshForgeWorkbenchGlobal).__DSH_FORGE_WORKBENCH__ = bridge
  }
  return bridge
}

/**
 * 撤销/发布工作台桥（undefined = 撤销；幂等）。消费面 = 测试隔离（逐例清全局）。
 */
export function publishWorkbenchBridge(bridge: WorkbenchBridge | undefined): void {
  ;(globalThis as DshForgeWorkbenchGlobal).__DSH_FORGE_WORKBENCH__ = bridge
}
