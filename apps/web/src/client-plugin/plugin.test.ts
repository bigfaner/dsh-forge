// client-plugin 单测 —— 产品 client 插件形状 + 槽位路线 A 注册面（2.7 AC1）+
// 官方基座降位登记族（fix-25：main 面板 roster + conversation.view 页签 roster +
// sidebar.panellist 行 + shell.overlay 常驻壳宿主）。
// 装载/激活链（掌舵 → 注册 → 物化 → Loader 激活）由 e2e（web-shell.spec / workbench-sc1.spec）自证；
// id 同源 pin（main.ts 字面量 ↔ 常量）在 tests/structure/web-shell.test.ts（node 面测试）。
// 洞名/影子优先级/注入面 = G1 契约面清单第 3 项（S2 残留 #1——2.7 清点入池）的常量 pin；
// 面板 key 字面量同源 pin = workbench/panel-model.ts（plugin 侧常量 ↔ 壳侧常量，不经
// import 共享——bundle 自含纪律，main.ts id 同源同形制）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BUG_ADDRESS_PREFIX,
  BUG_TAB_KIND,
  CONVERSATION_VIEW_SLOT,
  DISPATCH_TASK_TOOL_KEY,
  DOC_ADDRESS_PREFIX,
  DOC_TAB_KIND,
  FORGE_BUG_SOURCE_NAME,
  FORGE_BUG_SOURCE_ORDER,
  FORGE_CLIENT_INJECT,
  FORGE_CLIENT_PLUGIN_ID,
  FORGE_LOCALE_NS,
  HERO_PANEL_KEY,
  HERO_WORKSPACE_SLOT,
  KNOWLEDGE_PANEL_KEY,
  MAIN_SLOT,
  OVERVIEW_TAB_KIND,
  RECALL_VIEW_ID,
  SESSION_HEADER_ACTIONS_SLOT,
  CONVERSATION_INPUT_OVERLAY_SLOT,
  SETTINGS_SECTION_SLOT,
  FORGE_SETTINGS_SECTION_ID,
  FORGE_SETTINGS_SECTION_ORDER,
  FORGE_REMOTE_ENTRY_ID,
  FORGE_REMOTE_ENTRY_ORDER,
  SIDEBAR_FOOTER_ACTION_SLOT,
  SHELL_OVERLAY_SLOT,
  SIDEBAR_BRAND_MARK_SLOT,
  SIDEBAR_BRAND_NAME_SLOT,
  SIDEBAR_PANELLIST_SLOT,
  SIDEBAR_RIGHT_PANE_TAB_SLOT,
  SIDEBAR_SHADOW_PRIORITY,
  SIDEBAR_WORKSPACES_SLOT,
  TOOL_CALL_TOOLVIEW_SLOT,
  makeSessionTitleResolver,
  bugAddressOf,
  bugIdOfAddress,
  activeSessionIdOf,
  buildBugQuickAdder,
  resolveWorkerChildSession,
  sessionParentIdOf,
  sessionRowInLedger,
  sessionTitleOf,
  workerChildSessionOf,
  workerOpenTarget,
  forgeClientPlugin,
  installSessionCreateWrap,
  treeOf,
  unwrapRpcEnvelope,
  SESSION_CREATE_CHANNEL,
  moduleLoaderFacade,
  publishedViews,
  registerForgeClient,
  type ForgeClientCtx,
  type ForgeLocaleService,
  type ForgeSidebarRightTabsService,
  type ForgeSlotsService,
} from './plugin.js'
import type { SessionCreateWrapDeps } from './create-wrap.js'
import { FORGE_PROGRESS_NODE_KIND, FORGE_PROGRESS_NODE_SLOT, forgeProgressDefinition } from './progress-node.js'
import { HERO_PANEL_KEY as SHELL_HERO_KEY, KNOWLEDGE_PANEL_KEY as SHELL_KNOWLEDGE_KEY } from '../workbench/panel-model.js'
import {
  DSWF_DOC_ADDRESS_PREFIX as DOCK_DOC_PREFIX,
  DSWF_DOC_TAB_KIND as DOCK_DOC_KIND,
  DSWF_OVERVIEW_TAB_KIND as DOCK_OVERVIEW_KIND,
  forgeDocAddress,
  parseForgeDocAddress,
} from '../workbench/dock-tabs.js'
import {
  DSWF_BUG_ADDRESS_PREFIX as BUG_PREVIEW_BUG_ADDRESS_PREFIX,
  DSWF_BUG_TAB_KIND as BUG_PREVIEW_BUG_TAB_KIND,
  forgeBugAddress,
} from '../views/bug-reference/BugPreview.js'
import type { ModuleLoaderFacade, ModuleLoaderRegistration } from '../shell/dsh-globals.js'

/** 注册记录（fake slots 服务收集） */
interface RegisterCall {
  key: string
  options: {
    name: string
    priority?: number
    key?: string
    id?: string
    order?: number
    label?: string | (() => string)
    locale?: string
    inject?: () => object
    /** fix-24 ①：影子行不声明 children（官方登记行供养子洞——重声明即 throw）的断言面 */
    children?: unknown
  }
  component: unknown
}

/** fake locale 服务（fix-33 ⑧）：register 收词典 + 撤销记账；bind = zh 词典直查（缺席回退 key） */
function fakeLocale(): ForgeLocaleService & { disposed: boolean; registered: [string, Record<string, Record<string, string>>][] } {
  const state = {
    disposed: false,
    registered: [] as [string, Record<string, Record<string, string>>][],
  }
  return {
    get disposed() {
      return state.disposed
    },
    get registered() {
      return state.registered
    },
    register: (ns, dicts) => {
      state.registered.push([ns, structuredClone(dicts) as Record<string, Record<string, string>>])
      return () => {
        state.disposed = true
      }
    },
    bind: (ns) => (key) => {
      const entry = state.registered.find(([n]) => n === ns)
      return entry?.[1].zh?.[key] ?? key
    },
  }
}

/** tab 类型注册记录（fake sidebarRightTabs 收集面——两段注册第一段断言） */
interface TabTypeCall {
  id: string
  kind: string
  multiple?: boolean
  patterns?: readonly string[]
  canOpen?: (address: string) => boolean
  title: (address: string) => string
  guide?: readonly { id: string; order: number; title: () => string; description?: () => string }[]
}

/** fake tab 类型注册表（4.1）：register 收定义 + 撤销记账（幂等标志） */
function fakeSidebarRightTabs(): ForgeSidebarRightTabsService & {
  calls: TabTypeCall[]
  disposedIds: string[]
} {
  const calls: TabTypeCall[] = []
  const disposedIds: string[] = []
  return {
    get calls() {
      return calls
    },
    get disposedIds() {
      return disposedIds
    },
    register: (definition) => {
      calls.push(definition)
      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        disposedIds.push(definition.id)
      }
    },
  }
}

/** 假 ctx：slots 收集 inject/register，八服务经 get 递达（reflect 可注入——m3.1 D25
 *  loadModelCatalog 惰性反射面测试）。D45 sessionFaces：uiWorkspace 会话行动作面 +
 * sessions.using 可注入（缺省缺席 = 注入面键缺席——面板对应项不呈现的测试面）。 */
function fakeClientCtx(
  reflect?: { readonly get: (name: string) => unknown },
  sessionFaces?: {
    readonly uiWorkspaceExtra?: Record<string, unknown>
    readonly sessionsUsing?: (
      sessionId: string,
      options: { readonly source: string },
      operation: (reference: unknown) => unknown,
    ) => Promise<unknown>
  },
): {
  ctx: ForgeClientCtx
  registers: RegisterCall[]
  injectedKeys: string[]
  injectDisposers: Map<string, () => void>
  open: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  rightToggle: ReturnType<typeof vi.fn>
  openTab: ReturnType<typeof vi.fn>
  openResource: ReturnType<typeof vi.fn>
  selectPanel: ReturnType<typeof vi.fn>
  locale: ReturnType<typeof fakeLocale>
  tabTypes: ReturnType<typeof fakeSidebarRightTabs>
  /** 账本 byId 注入面（m3.1 D6 worker ⟞ parentId 判读测试） */
  sessionsById: Record<string, { parentId?: string; displayTitle?: string }>
  /** 账本 refresh 注入面（D6 修复面——缺行兜底重拉测试；缺省 undefined = 平开径） */
  sessionsRefresh: { current: (() => Promise<unknown>) | undefined }
  /** 1.17 uiConversation events.register 录制（forge/progress 节点定义断言） */
  eventDefinitions: unknown[]
  /** workspaces.list 换装面（bug d353536f 在场门测试——基线中途到达/缺席两态） */
  workspacesList: { current: unknown }
} {
  const registers: RegisterCall[] = []
  const injectedKeys: string[] = []
  const injectDisposers = new Map<string, () => void>()
  const open = vi.fn()
  const start = vi.fn()
  const rightToggle = vi.fn()
  const openTab = vi.fn()
  const selectPanel = vi.fn()
  const slots: ForgeSlotsService = {
    inject: (key, callback) => {
      injectedKeys.push(key)
      const dispose = callback()
      const d = dispose ?? (() => {})
      injectDisposers.set(key, d)
      return d
    },
    register: (options, component) => {
      registers.push({ key: options.name, options, component })
      return () => {}
    },
  }
  // fix-11：Session Controller 面仅账本快照源；打开动作 = uiWorkspace.openSession（官方导航面）；
  // fix-42：新会话流 = uiWorkspace.startSession（官方行动作面）
  // m3.1 D6：账本快照可注入 byId（worker ⟞ 开面的 parentId 判读测试面——缺省空账本 = 平开径）；
  // D6 修复面：refresh 可注入（缺行兜底重拉测试——getter 动态读 current，缺省 undefined）
  const sessionsById: Record<string, { parentId?: string; displayTitle?: string }> = {}
  const sessionsRefresh: { current: (() => Promise<unknown>) | undefined } = { current: undefined }
  const sessions = {
    list: {
      tag: 'sessions-list',
      getSnapshot: () => ({ byId: sessionsById }),
    },
    get refresh(): (() => Promise<unknown>) | undefined {
      return sessionsRefresh.current
    },
    // D45：using 可注入（会话改名正径测试面——缺省缺席 = renameSession 键缺席）
    ...(sessionFaces?.sessionsUsing !== undefined ? { using: sessionFaces.sessionsUsing } : {}),
  }
  const uiWorkspace = { openSession: open, startSession: start, ...sessionFaces?.uiWorkspaceExtra }
  // workspaces.list 可换装（bug d353536f 在场门测试面——基线中途到达/缺席两态模拟；
  // setter 保既有测试 `ctx.get('workspaces').list = …` 直赋写法兼容）
  const workspacesList: { current: unknown } = { current: { tag: 'workspaces-list' } }
  const workspaces = {
    get list(): unknown {
      return workspacesList.current
    },
    set list(v: unknown) {
      workspacesList.current = v
    },
  }
  // fix-23：官方右栏收展窄面（ISidebarRight 切片）；4.2 增 openTab 导航面（挂接 pill → dock 开概览）；
  // 1.3 增 openResource 资源面（Bug source openReference → Bug 台账 pane 路由）
  const openResource = vi.fn()
  const sidebarRight = { isExpanded: () => false, toggleExpanded: rightToggle, openTab, openResource }
  // 4.1：官方右栏 tab 类型注册表（两段注册第一段）
  const tabTypes = fakeSidebarRightTabs()
  // fix-25：官方面板选择窄面（LayoutController 切片）
  const layout = {
    selectPanel,
    panelInfo: {
      getSnapshot: () => ({ activePanelId: null }),
      subscribe: () => () => {},
    },
  }
  // fix-33 ⑧：官方 locale 服务切片
  const locale = fakeLocale()
  // 1.17：官方 uiConversation 事件注册表切片（events.register 录制——forge/progress 节点定义断言）
  const eventDefinitions: unknown[] = []
  const uiConversation = {
    events: {
      register: (definition: unknown) => {
        eventDefinitions.push(definition)
      },
    },
  }
  const ctx: ForgeClientCtx = {
    slots,
    get: (name) => {
      if (name === 'sessions') return sessions
      if (name === 'uiWorkspace') return uiWorkspace
      if (name === 'workspaces') return workspaces
      if (name === 'sidebarRight') return sidebarRight
      if (name === 'sidebarRightTabs') return tabTypes
      if (name === 'layout') return layout
      if (name === 'locale') return locale
      if (name === 'uiConversation') return uiConversation
      throw new Error(`unexpected service: ${name}`)
    },
    // m3.1 D25：reflect 面（ ForgeClientCtx 窄面外——插件真身经 cast 读取，同径注入）
    ...(reflect !== undefined ? { reflect } : {}),
  } as ForgeClientCtx
  return { ctx, registers, injectedKeys, injectDisposers, open, start, rightToggle, openTab, openResource, selectPanel, locale, tabTypes, sessionsById, sessionsRefresh, eventDefinitions, workspacesList }
}

/** 假 md-mermaid DOM 增强器（1.9——启停调用记账面；stop 幂等语义镜像真身——重复 stop 不重复记账） */
function fakeMermaidEnhancer(): { calls: string[]; scan: () => Promise<void>; start: () => void; stop: () => void } {
  const calls: string[] = []
  return {
    calls,
    scan: async () => {
      calls.push('scan')
    },
    start: () => {
      calls.push('start')
    },
    stop: () => {
      if (calls[calls.length - 1] !== 'stop') calls.push('stop')
    },
  }
}

/** 最近一次 publishFakeViews 挂的假增强器（1.9 挂接断言消费） */
let lastFakeEnhancer: ReturnType<typeof fakeMermaidEnhancer> | undefined

/** 假产品视图发布面（fix-25 发布集 + 4.1 dock tab 两 body + 1.9 增强器工厂；m3.1 D5 会话头 pill 退役） */
function publishFakeViews() {
  lastFakeEnhancer = fakeMermaidEnhancer()
  const views = {
    ForgeSidebarSlot: 'COMP:sidebar-slot',
    ForgeBrandMark: 'COMP:brand-mark',
    ForgeBrandName: 'COMP:brand-name',
    ForgeShellHost: 'COMP:shell-host',
    ForgeHeroPanel: 'COMP:hero-panel',
    ForgeKnowledgePanel: 'COMP:knowledge-panel',
    ForgeKnowledgeGlyph: 'COMP:knowledge-glyph',
    ForgeRecallView: 'COMP:recall-view',
    ForgeDispatchToolRow: 'COMP:dispatch-tool-row',
    ForgeProgressNode: 'COMP:progress-node',
    ForgeOverviewTab: 'COMP:overview-tab',
    ForgeDocsTab: 'COMP:docs-tab',
    ForgeHeroWorkspacePicker: 'COMP:hero-picker',
    ForgeSessionWorktreeChip: 'COMP:session-worktree-chip',
    ForgeWorktreeSealOverlay: 'COMP:worktree-seal-overlay',
    ForgeSettingsSection: 'COMP:settings-section',
    ForgeRemoteEntry: 'COMP:remote-entry',
    ForgeBugGlyph: 'COMP:bug-glyph',
    ForgeBugPreview: 'COMP:bug-preview',
    createWorkbenchBridge: (nav: { showKnowledge(): void; showSession(): void }) => {
      // 结构同型镜像真身（workbench-bridge.createWorkbenchBridge）：nav 透传 + 页内全局发布
      let focusNonce = 0
      let taskFocus: { taskId: string; featureSlug: string; nonce: number } | null = null
      // m3.1 D21/D23 弹窗/转移两缝（真身快照同型镜像）
      let drawerTaskId: string | null = null
      let transitionFocus: { taskId: string; featureSlug: string; nonce: number } | null = null
      const bridgeObj = {
        showKnowledge: nav.showKnowledge,
        showSession: nav.showSession,
        openKnowledgeEntry: () => {
          nav.showKnowledge()
        },
        subscribe: () => () => {},
        getSnapshot: () => ({ drawerEntryId: null, overview: { projectId: null }, taskFocus, drawerTaskId, transitionFocus }),
        setDrawerEntry: () => {},
        setOverviewContext: () => {},
        openTaskFocus: (payload: { taskId: string; featureSlug: string }) => {
          focusNonce += 1
          taskFocus = { ...payload, nonce: focusNonce }
        },
        openTaskDrawer: (taskId: string) => {
          drawerTaskId = taskId
        },
        closeTaskDrawer: () => {
          drawerTaskId = null
        },
        openTaskTransition: (payload: { taskId: string }) => {
          focusNonce += 1
          transitionFocus = { ...payload, featureSlug: '', nonce: focusNonce }
        },
      }
      ;(globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__ = bridgeObj
      return bridgeObj
    },
    createMermaidEnhancer: () => lastFakeEnhancer!,
  }
  ;(globalThis as { __DSH_FORGE_VIEWS__?: unknown }).__DSH_FORGE_VIEWS__ = views
  return views
}

function unpublishViews(): void {
  delete (globalThis as { __DSH_FORGE_VIEWS__?: unknown }).__DSH_FORGE_VIEWS__
  delete (globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__
}

describe('forgeClientPlugin 形状（cordis 插件面）', () => {
  it('name = 注册键；inject = 八服务（fix-11 打开面改 uiWorkspace；fix-23 加 sidebarRight；4.1 加 sidebarRightTabs；fix-25 加 layout；fix-33 加 locale）；apply 幂等立激活标记', () => {
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { plugin: string } }).__DSH_FORGE_CLIENT__
    delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    const views = publishFakeViews()
    const plugin = forgeClientPlugin()
    expect(plugin.name).toBe(FORGE_CLIENT_PLUGIN_ID)
    expect(plugin.inject).toEqual([...FORGE_CLIENT_INJECT])
    expect(plugin.inject).toEqual([
      'slots',
      'sessions',
      'uiWorkspace',
      'workspaces',
      'sidebarRight',
      'sidebarRightTabs',
      'layout',
      'locale',
      'uiConversation',
    ])
    const { ctx, locale } = fakeClientCtx()
    plugin.apply(ctx)
    const active = (globalThis as { __DSH_FORGE_CLIENT__?: { plugin: string; activatedAt: number } }).__DSH_FORGE_CLIENT__
    expect(active?.plugin).toBe(FORGE_CLIENT_PLUGIN_ID)
    expect(typeof active?.activatedAt).toBe('number')
    // fix-33 ⑧：locale 词典登记（NS + zh/en 双语——官方 ui-trajectory 同径）
    expect(locale.registered).toHaveLength(1)
    expect(locale.registered[0]![0]).toBe(FORGE_LOCALE_NS)
    expect(locale.registered[0]![1].zh).toMatchObject({ 'panel.knowledge': '知识库', 'view.recall': '知识召回' })
    expect(locale.registered[0]![1].en).toMatchObject({ 'panel.knowledge': 'Knowledge', 'view.recall': 'Recall' })
    // dispatchTask 工具行词典（toolview 行内 t 座——文案对齐官方通用行用词）
    expect(locale.registered[0]![1].zh).toMatchObject({
      'tool.dispatchTask.title': '工具调用',
      'tool.dispatchTask.input': '输入',
      'tool.dispatchTask.output': '输出',
      'tool.dispatchTask.inspect': '查看',
    })
    expect(locale.registered[0]![1].en).toMatchObject({ 'tool.dispatchTask.title': 'Tool call' })
    unpublishViews()
    if (marker === undefined) delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    else (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ = marker
    void views
  })
})

describe('槽位路线 A 注册（AC1：sidebar.workspaces 替换 + 品牌行内容洞位）', () => {
  it('sidebar 三洞位经 slots.inject 声明依赖；workspaces 注册 = 发布组件 + 影子优先级；诊断回填落座', () => {
    const views = publishFakeViews()
    const { ctx, registers, injectedKeys } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(injectedKeys).toEqual([
      SIDEBAR_RIGHT_PANE_TAB_SLOT,
      SIDEBAR_RIGHT_PANE_TAB_SLOT,
      SIDEBAR_RIGHT_PANE_TAB_SLOT, // 1.3 Bug 台账 keyed body（composer-bug-reference）
      // 1.8 渲染链退役：md mermaid 预览声明等待（DOCUMENT_PREVIEW_BODY_SLOT inject）已随
      // 注册链退役——注入清单零预览槽。
      SIDEBAR_WORKSPACES_SLOT,
      SIDEBAR_BRAND_MARK_SLOT,
      SIDEBAR_BRAND_NAME_SLOT,
      SIDEBAR_FOOTER_ACTION_SLOT, // 1.2 手机远程入口（官方底行扩展槽——探针点①结论）
      MAIN_SLOT,
      MAIN_SLOT,
      SIDEBAR_PANELLIST_SLOT,
      CONVERSATION_VIEW_SLOT,
      HERO_WORKSPACE_SLOT,
      TOOL_CALL_TOOLVIEW_SLOT,
      FORGE_PROGRESS_NODE_SLOT, // 1.17 'forge/progress' keyed node body
      SESSION_HEADER_ACTIONS_SLOT, // fix-2 worktree 会话头只读 chip
      CONVERSATION_INPUT_OVERLAY_SLOT, // fix-2 封存提示 overlay（composer 区官方缝）
      CONVERSATION_INPUT_OVERLAY_SLOT, // bug 4b34e5d8 chip 重建缝（零视觉效应行）
      SETTINGS_SECTION_SLOT,
      SHELL_OVERLAY_SLOT,
    ])
    const workspaces = registers.find((r) => r.key === SIDEBAR_WORKSPACES_SLOT)
    expect(workspaces).toBeDefined()
    expect(workspaces!.options.priority).toBe(SIDEBAR_SHADOW_PRIORITY)
    expect(workspaces!.options.priority).toBeLessThan(0) // lowest renders——影子官方占用者（priority 0）
    expect(workspaces!.component).toBe(views.ForgeSidebarSlot)
    const mark = registers.find((r) => r.key === SIDEBAR_BRAND_MARK_SLOT)
    const name = registers.find((r) => r.key === SIDEBAR_BRAND_NAME_SLOT)
    expect(mark!.component).toBe(views.ForgeBrandMark)
    expect(name!.component).toBe(views.ForgeBrandName)
    // 诊断面：三洞位 + 手机远程入口落座 + 无错误（e2e 排障锚）
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { sidebar?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.sidebar?.registered).toEqual([SIDEBAR_WORKSPACES_SLOT, SIDEBAR_BRAND_MARK_SLOT, SIDEBAR_BRAND_NAME_SLOT, SIDEBAR_FOOTER_ACTION_SLOT])
    expect(marker?.sidebar?.error).toBeUndefined()
    const remoteRow = registers.find((r) => r.key === SIDEBAR_FOOTER_ACTION_SLOT)
    expect(remoteRow).toBeDefined()
    expect(remoteRow!.options.id).toBe(FORGE_REMOTE_ENTRY_ID)
    expect(remoteRow!.options.order).toBe(FORGE_REMOTE_ENTRY_ORDER)
    expect(remoteRow!.component).toBe(views.ForgeRemoteEntry)
    unpublishViews()
  })

  it('注入面 = dsh 账本/归属快照源 + openSession + startSession（面板数据与动作的唯一通道；fix-11 打开经 uiWorkspace.openSession；fix-42 新会话经 uiWorkspace.startSession）', async () => {
    publishFakeViews()
    const { ctx, registers, open, start } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const workspaces = registers.find((r) => r.key === SIDEBAR_WORKSPACES_SLOT)!
    const face = workspaces.options.inject!()
    expect(face).toEqual({
      // m3.1 D6：账本快源含 getSnapshot（worker ⟞ parentId 判读面——面板数据直读）
      sessions: { tag: 'sessions-list', getSnapshot: expect.any(Function) },
      workspaces: { tag: 'workspaces-list' },
      openSession: expect.any(Function),
      startSession: expect.any(Function),
    })
    ;(face as { openSession: (id: string) => void }).openSession('s-1')
    expect(open).toHaveBeenCalledWith('s-1')
    ;(face as { startSession: (id: string) => void }).startSession('w-1')
    // bug d353536f 同因面：startSession 经在场门（快照面不可核验 = 放行）异步委派
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith('w-1'))
    unpublishViews()
  })

  it('bug d353536f 同因面：startSession 官方基线未就位 → 等待在场后才委派官方（超时仍委派，错误面保真）', async () => {
    publishFakeViews()
    const { ctx, registers, start, workspacesList } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const workspaces = registers.find((r) => r.key === SIDEBAR_WORKSPACES_SLOT)!
    const face = workspaces.options.inject!() as { startSession: (id: string) => void }
    // 基线缺席起跑，30ms 后到达
    workspacesList.current = { getSnapshot: () => ({ items: [] as { workspaceId: string }[] }) }
    setTimeout(() => {
      workspacesList.current = { getSnapshot: () => ({ items: [{ workspaceId: 'w-late' }] }) }
    }, 30)
    face.startSession('w-late')
    expect(start).not.toHaveBeenCalled()
    // 超时兜底也会委派（错误面保真）——断言只要求「最终到达」，余量盖过满载 worker 抖动
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith('w-late'), { timeout: 5000 })
    unpublishViews()
  })

  it('D45 会话行动作面：官方面在场 = 注入面携带（⋯菜单/归档/置顶三钮数据源）——sessionActionFaceOf 逐位组装', async () => {
    publishFakeViews()
    const archive = vi.fn().mockResolvedValue(undefined)
    const unarchive = vi.fn().mockResolvedValue(undefined)
    const pin = vi.fn().mockResolvedValue(undefined)
    const unpin = vi.fn().mockResolvedValue(undefined)
    const fork = vi.fn().mockResolvedValue('child-1')
    const using = vi.fn().mockImplementation(
      (
        _sessionId: string,
        _options: { readonly source: string },
        operation: (reference: unknown) => unknown,
      ) =>
        Promise.resolve(
          operation({ binding: { session: { rename: (title: string) => Promise.resolve({ ok: true, value: { title } }) } } }),
        ),
    )
    const { ctx, registers } = fakeClientCtx(undefined, {
      uiWorkspaceExtra: { archiveSession: archive, unarchiveSession: unarchive, pinSession: pin, unpinSession: unpin, forkSession: fork },
      sessionsUsing: using,
    })
    forgeClientPlugin().apply(ctx)
    const workspaces = registers.find((r) => r.key === SIDEBAR_WORKSPACES_SLOT)!
    const face = workspaces.options.inject!() as {
      archiveSession: (id: string, options?: { readonly stopActivity?: boolean }) => Promise<void>
      unarchiveSession: (id: string) => Promise<void>
      pinSession: (id: string) => Promise<void>
      unpinSession: (id: string) => Promise<void>
      forkSession: (id: string) => Promise<unknown>
      renameSession: (id: string, title: string) => Promise<void>
    }
    expect(typeof face.archiveSession).toBe('function')
    expect(typeof face.unarchiveSession).toBe('function')
    expect(typeof face.pinSession).toBe('function')
    expect(typeof face.unpinSession).toBe('function')
    expect(typeof face.forkSession).toBe('function')
    expect(typeof face.renameSession).toBe('function')
    // 直通官方面（options 透传——停止并归档确认流）
    void face.archiveSession('s-1', { stopActivity: true })
    expect(archive).toHaveBeenCalledWith('s-1', { stopActivity: true })
    void face.forkSession('s-1')
    expect(fork).toHaveBeenCalledWith('s-1')
    // 改名正径：sessions.using(source='workspaceOperation') → binding.session.rename
    // （RemoteResult 信封——!ok 抛 error.message，官方 renameSession 适配同判）
    await expect(face.renameSession('s-1', '新标题')).resolves.toBeUndefined()
    expect(using).toHaveBeenCalledWith(
      's-1',
      { source: 'workspaceOperation' },
      expect.any(Function),
    )
    unpublishViews()
  })

  it('D45 官方面缺席 = 注入面键缺席（面板对应动作钮/菜单项不呈现——P1 口径）+ 改名拒绝上抛（RemoteResult !ok → error.message）', async () => {
    publishFakeViews()
    const usingReject = vi.fn().mockImplementation(
      (
        _sessionId: string,
        _options: { readonly source: string },
        operation: (reference: unknown) => unknown,
      ) =>
        Promise.resolve(
          operation({ binding: { session: { rename: (_title: string) => Promise.resolve({ ok: false, error: { message: '标题冲突' } }) } } }),
        ),
    )
    const { ctx, registers } = fakeClientCtx(undefined, { sessionsUsing: usingReject })
    forgeClientPlugin().apply(ctx)
    const workspaces = registers.find((r) => r.key === SIDEBAR_WORKSPACES_SLOT)!
    const face = workspaces.options.inject!() as Record<string, unknown> & {
      renameSession: (id: string, title: string) => Promise<void>
    }
    // uiWorkspace 会话行动作面缺席 = 对应键缺席（改名面在场——sessions.using 在场）
    expect(face['archiveSession']).toBeUndefined()
    expect(face['unarchiveSession']).toBeUndefined()
    expect(face['pinSession']).toBeUndefined()
    expect(face['unpinSession']).toBeUndefined()
    expect(face['forkSession']).toBeUndefined()
    // 改名拒绝 = error.message 上抛（面板改名模态呈现）
    await expect(face.renameSession('s-1', 'x')).rejects.toThrow('标题冲突')
    unpublishViews()
  })
})

describe('官方基座降位登记族（fix-25：main 面板 roster + panellist 行 + 页签 roster + 壳宿主）', () => {
  it('main 面板族：hero/knowledge 两 keyed 登记（官方全局面板径）+ 面板 key 字面量与壳侧 panel-model 同源', () => {
    const views = publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const hero = registers.find((r) => r.key === MAIN_SLOT && r.options.key === HERO_PANEL_KEY)
    const knowledge = registers.find((r) => r.key === MAIN_SLOT && r.options.key === KNOWLEDGE_PANEL_KEY)
    expect(hero).toBeDefined()
    expect(hero!.component).toBe(views.ForgeHeroPanel)
    expect(knowledge).toBeDefined()
    expect(knowledge!.component).toBe(views.ForgeKnowledgePanel)
    // 字面量同源 pin（plugin 侧 ↔ 壳侧 panel-model——bundle 自含不经 import）
    expect(HERO_PANEL_KEY).toBe(SHELL_HERO_KEY)
    expect(KNOWLEDGE_PANEL_KEY).toBe(SHELL_KNOWLEDGE_KEY)
    // 知识面板注入面 = 工作台桥（知识抽屉缝——m3.1 D21/D23 快照扩任务弹窗/转移两缝）
    const face = knowledge!.options.inject!() as { bridge: { getSnapshot(): { drawerEntryId: number | null; overview: { projectId: string | null }; taskFocus: unknown; drawerTaskId: string | null; transitionFocus: unknown } } }
    expect(face.bridge.getSnapshot()).toEqual({ drawerEntryId: null, overview: { projectId: null }, taskFocus: null, drawerTaskId: null, transitionFocus: null })
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { center?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.center?.registered).toEqual([MAIN_SLOT, MAIN_SLOT, SIDEBAR_PANELLIST_SLOT])
    expect(marker?.center?.error).toBeUndefined()
    unpublishViews()
  })

  it('panellist 行：id = 知识面板 key（官方 PanelRow 行语言消费）+ label = locale NS thunk（fix-33 ⑧——zh 值等值原字面量）', () => {
    const views = publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const row = registers.find((r) => r.key === SIDEBAR_PANELLIST_SLOT)
    expect(row).toBeDefined()
    expect(row!.options.id).toBe(KNOWLEDGE_PANEL_KEY)
    expect(row!.options.locale).toBe(FORGE_LOCALE_NS)
    expect(typeof row!.options.label).toBe('function')
    expect((row!.options.label as () => string)()).toBe('知识库')
    expect(row!.options.order).toBe(20)
    expect(row!.component).toBe(views.ForgeKnowledgeGlyph)
    unpublishViews()
  })

  it('页签 roster：知识召回单登记（fix-29：轨迹 = 官方 trajectory 直用——产品复刻退役零登记）+ 召回注入面 = 跳转缝', () => {
    const views = publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const viewRegisters = registers.filter((r) => r.key === CONVERSATION_VIEW_SLOT)
    expect(viewRegisters, 'conversation.view 恰一登记（三签 = 官方 chat + 官方 trajectory + 产品召回）').toHaveLength(1)
    const recall = viewRegisters[0]!
    expect(recall.options.id).toBe(RECALL_VIEW_ID)
    expect(recall.options.order).toBe(20)
    expect(recall.options.locale).toBe(FORGE_LOCALE_NS)
    expect(typeof recall.options.label).toBe('function') // fix-33 ⑧ locale thunk
    expect((recall.options.label as () => string)()).toBe('知识召回')
    expect(recall.component).toBe(views.ForgeRecallView)
    // fix-29 退役 pin：产品 'dswf-trajectory' 复刻不再注册（官方 'trajectory' roster 行保持）
    expect(registers.find((r) => r.key === CONVERSATION_VIEW_SLOT && (r.options.id === 'dswf-trajectory' || r.options.id === 'trajectory'))).toBeUndefined()
    // 召回注入面：openKnowledgeEntry → 桥跳转（进知识面板 + 抽屉定位——selectPanel 官方面）
    const face = recall.options.inject!() as { openKnowledgeEntry: (id: number) => void }
    const { selectPanel } = fakeClientCtx()
    expect(typeof face.openKnowledgeEntry).toBe('function')
    void selectPanel
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { views?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.views?.registered).toEqual([CONVERSATION_VIEW_SLOT, HERO_WORKSPACE_SLOT, TOOL_CALL_TOOLVIEW_SLOT, FORGE_PROGRESS_NODE_SLOT, SESSION_HEADER_ACTIONS_SLOT, CONVERSATION_INPUT_OVERLAY_SLOT, CONVERSATION_INPUT_OVERLAY_SLOT]) // fix-24 ① hero 影子；1.17 progress 节点；fix-2 封存提示；bug 4b34e5d8 chip 重建效应行
    expect(marker?.views?.error).toBeUndefined()
    unpublishViews()
  })

  it('hero 工作区控件影子（fix-24 ①）：conversation.hero.workspace single 影子登记——发布组件 + -100 优先级 + 零 children + 零 inject（数据面组件自源 RPC）', () => {
    const views = publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const heroRegisters = registers.filter((r) => r.key === HERO_WORKSPACE_SLOT)
    expect(heroRegisters, 'conversation.hero.workspace 恰一登记（single 槽影子——官方 WorkspacePicker 保持在场）').toHaveLength(1)
    const hero = heroRegisters[0]!
    expect(hero.options.priority).toBe(SIDEBAR_SHADOW_PRIORITY)
    expect(hero.options.priority).toBeLessThan(0) // lowest renders——影子官方占用者（priority 0）
    expect(hero.component).toBe(views.ForgeHeroWorkspacePicker)
    // 不声明 children：官方登记行的 children 声明持续供养 directoryFlow 子洞（重声明即 throw）
    expect(hero.options.children).toBeUndefined()
    // W3 arm 退役：hero worktree face（openSession/blankSessionByCwd/sessionsList/
    // composerDraft 编排缝）随 arm 效应链退役——零 inject（点选纯选中态组件自源 RPC，
    // 会话创建走官方 create 调用点 wrap 改道预铸）
    expect(hero.options.inject).toBeUndefined()
    expect(hero.options.id).toBeUndefined()
    expect(hero.options.key).toBeUndefined()
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { views?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.views?.registered).toEqual([CONVERSATION_VIEW_SLOT, HERO_WORKSPACE_SLOT, TOOL_CALL_TOOLVIEW_SLOT, FORGE_PROGRESS_NODE_SLOT, SESSION_HEADER_ACTIONS_SLOT, CONVERSATION_INPUT_OVERLAY_SLOT, CONVERSATION_INPUT_OVERLAY_SLOT]) // bug 4b34e5d8 起双 overlay 登记口径
    expect(marker?.views?.error).toBeUndefined()
    unpublishViews()
  })

  it('dispatchTask 对话工具行（2026-10-09 报障收口）：tool.call.toolview keyed 登记恰一——key = wire 工具名 + locale NS + 发布组件；keyed 最小面（零 label/id/order/priority/children/inject——行数据 = owner props 自足）', () => {
    const views = publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const toolviews = registers.filter((r) => r.key === TOOL_CALL_TOOLVIEW_SLOT)
    expect(toolviews, 'tool.call.toolview 恰一登记（只接管 dispatchTask——其余工具名走官方通用行）').toHaveLength(1)
    const row = toolviews[0]!
    expect(row.options.name).toBe(TOOL_CALL_TOOLVIEW_SLOT)
    expect(row.options.key).toBe(DISPATCH_TASK_TOOL_KEY)
    expect(row.options.key).toBe('dispatchTask') // plugin-forge FORGE_TOOL_NAMES wire 名同源
    expect(row.options.locale).toBe(FORGE_LOCALE_NS) // 行内 t 座绑定面
    expect(row.component).toBe(views.ForgeDispatchToolRow)
    // keyed 槽最小登记面：行语言字段全部缺席（list/single 槽语义字段不入 keyed 注册）
    expect(row.options.label).toBeUndefined()
    expect(row.options.id).toBeUndefined()
    expect(row.options.order).toBeUndefined()
    expect(row.options.priority).toBeUndefined()
    expect(row.options.children).toBeUndefined()
    expect(row.options.inject).toBeUndefined()
    unpublishViews()
  })

  it("1.17 forge/progress 节点（decisions #34 流内交错）：events.register 定义恰一 + conversation.chat.node keyed 'forge-progress' body（发布组件 + locale NS）——非模型面渲染（notice 双通道零回归）", () => {
    const views = publishFakeViews()
    const { ctx, registers, eventDefinitions } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    // 第一段：uiConversation.events.register 节点 Definition 恰一
    expect(eventDefinitions).toHaveLength(1)
    expect(eventDefinitions[0]).toBe(forgeProgressDefinition)
    // 第二段：keyed node body 恰一——key = 节点 kind（buildViewNode.kind 字面量同源）
    const bodies = registers.filter((r) => r.key === FORGE_PROGRESS_NODE_SLOT)
    expect(bodies, 'conversation.chat.node 恰一登记（只接管 forge-progress kind）').toHaveLength(1)
    const body = bodies[0]!
    expect(body.options.key).toBe(FORGE_PROGRESS_NODE_KIND)
    expect(body.options.key).toBe('forge-progress')
    expect(body.options.locale).toBe(FORGE_LOCALE_NS)
    expect(body.component).toBe(views.ForgeProgressNode)
    unpublishViews()
  })

  it('1.17 uiConversation 缺席 = 两段全跳 fail-soft（capability absence = 无节点——不炸不阻载其余登记）', () => {
    publishFakeViews()
    const base = fakeClientCtx()
    const ctx = {
      ...base.ctx, // slots 为 readonly——浅拷贝面置换 get（惰性假体旁路同径）
      get: (name: string) => {
        if (name === 'uiConversation') throw new Error('unexpected service: uiConversation')
        return (base.ctx as { get: (n: string) => unknown }).get(name)
      },
    } as ForgeClientCtx
    forgeClientPlugin().apply(ctx)
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { views?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.views?.error).toBeUndefined()
    expect(marker?.views?.registered).not.toContain(FORGE_PROGRESS_NODE_SLOT)
    unpublishViews()
  })

  it('壳宿主：shell.overlay 登记 + 注入面 = 官方面板选择/右栏收展/桥（概览上下文写回缝——4.1）+ 弹窗三窄面（m3.1 D21/D23——跳会话/新会话编排/文档开出）+ 悬浮面板 ⟞ 开面（m3.1 D6）+ ⟞ 父反查兜底（fix：进行中 worker 无 record 审计行）；桥经发布面工厂创建并发布页内全局', async () => {
    const views = publishFakeViews()
    const { ctx, registers, selectPanel, rightToggle, sessionsById } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const host = registers.find((r) => r.key === SHELL_OVERLAY_SLOT)
    expect(host).toBeDefined()
    expect(host!.options.id).toBe('dswf-host')
    expect(host!.component).toBe(views.ForgeShellHost)
    const face = host!.options.inject!() as {
      selectPanel: { selectPanel(id: string | null): void }
      rightbar: { isExpanded(): boolean; toggleExpanded(): void }
      bridge: unknown
      onOpenSession: (sessionId: string) => void
      openSession: { openSessionWithPreset(request: unknown): Promise<unknown> }
      openDocResource: (address: string) => void
      onOpenWorkerSession: (childSessionId: string) => void
      sessionTitleOf: (sessionId: string) => string | undefined
      resolveWorkerSession: (parentSessionId: string, taskKey?: string) => Promise<string | undefined>
    }
    // m3.1 D21/D23 弹窗宿主三窄面 + D6 悬浮面板 ⟞ 开面在场（ShellHost 消费）
    // + S1 会话名解析器（task-ui-info-density-blitz——账本快照 displayTitle 窄读闭包）
    // + ⟞ 父反查兜底（fix：进行中 worker 无 record 审计行 → 库侧解析恒空的修复面）
    expect(Object.keys(face).sort()).toEqual([
      'bridge',
      'onOpenSession',
      'onOpenWorkerSession',
      'openDocResource',
      'openSession',
      'resolveWorkerSession',
      'rightbar',
      'selectPanel',
      'sessionTitleOf',
    ])
    expect(typeof face.onOpenSession).toBe('function')
    // D6 键名契约 pin：face 键 = onOpenWorkerSession（ShellHost props 契约——错配 = ⟞ 恒 disabled）
    expect(typeof face.onOpenWorkerSession).toBe('function')
    expect(typeof face.openSession.openSessionWithPreset).toBe('function')
    expect(typeof face.openDocResource).toBe('function')
    // S1 会话名解析器（task-ui-info-density-blitz）：账本快照命中 = displayTitle；未命中 = undefined
    sessionsById['s-title'] = { displayTitle: '登录修复' }
    expect(face.sessionTitleOf('s-title')).toBe('登录修复')
    expect(face.sessionTitleOf('s-miss')).toBeUndefined()
    // ⟞ 父反查兜底（fix）：账本子行 parentId 命中 = 该子会话；零命中 = undefined（no-op 面）
    sessionsById['w-child'] = { parentId: 's-dispatch' }
    await expect(face.resolveWorkerSession('s-dispatch')).resolves.toBe('w-child')
    await expect(face.resolveWorkerSession('s-none')).resolves.toBeUndefined()
    // 桥面注入 = 页内全局同桥单例（4.1：ShellHost 锚定写回与召回跳转共用）
    expect(face.bridge).toBe((globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__)
    face.selectPanel.selectPanel('dswf-knowledge')
    expect(selectPanel).toHaveBeenCalledWith('dswf-knowledge')
    expect(face.rightbar.isExpanded()).toBe(false)
    face.rightbar.toggleExpanded()
    expect(rightToggle).toHaveBeenCalledTimes(1)
    // 桥发布在页内全局（e2e/召回跳转消费——nav 绑定官方 selectPanel）
    const bridge = (globalThis as { __DSH_FORGE_WORKBENCH__?: { showKnowledge(): void; showSession(): void } }).__DSH_FORGE_WORKBENCH__
    expect(bridge).toBeDefined()
    bridge!.showSession()
    expect(selectPanel).toHaveBeenCalledWith(null)
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { shell?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.shell?.registered).toEqual([SHELL_OVERLAY_SLOT])
    expect(marker?.shell?.error).toBeUndefined()
    unpublishViews()
  })

  // ── ⟞ worker 父反查兜底（fix：进行中 worker 无 record 审计行 → 库侧 workerSessionOf 恒空）──

  describe('workerChildSessionOf 账本父反查（byId parentId 扫描——updatedAt 择新）', () => {
    const ledger = (byId: Record<string, unknown>): unknown => ({ getSnapshot: () => ({ byId }) })
    it('parentId === 父的子行命中；多子 updatedAt 择新（进行中 worker = 最新子会话近似）', () => {
      const list = ledger({
        'dispatch-1': { parentId: 'top' },
        'worker-old': { parentId: 'dispatch-1', updatedAt: '2026-10-13T10:00:00Z' },
        'worker-new': { parentId: 'dispatch-1', updatedAt: '2026-10-13T11:00:00Z' },
        unrelated: { parentId: 'other' },
      })
      expect(workerChildSessionOf(list, 'dispatch-1')).toBe('worker-new')
    })
    it('bug：同父多 worker（displayTitle = 任务键 · 任务名）→ 按任务键命中目标任务，非 updatedAt 择新', () => {
      const list = ledger({
        'dispatch-1': { parentId: 'top' },
        'worker-1-1': { parentId: 'dispatch-1', updatedAt: '2026-10-13T10:00:00Z', displayTitle: 'feat-x/1.1 · Implement A' },
        'worker-1-2': { parentId: 'dispatch-1', updatedAt: '2026-10-13T11:00:00Z', displayTitle: 'feat-x/1.2 · Implement B' },
      })
      expect(workerChildSessionOf(list, 'dispatch-1', 'feat-x/1.1')).toBe('worker-1-1')
      expect(workerChildSessionOf(list, 'dispatch-1', 'feat-x/1.2')).toBe('worker-1-2')
    })
    it('任务键无命中（标签漂移/旧数据）或缺省 → 回退 updatedAt 择新', () => {
      const list = ledger({
        'worker-1-1': { parentId: 'p', updatedAt: '2026-10-13T10:00:00Z', displayTitle: 'feat-x/1.1 · A' },
        'worker-1-2': { parentId: 'p', updatedAt: '2026-10-13T11:00:00Z', displayTitle: 'feat-x/1.2 · B' },
      })
      expect(workerChildSessionOf(list, 'p', 'feat-x/9.9')).toBe('worker-1-2')
      expect(workerChildSessionOf(list, 'p')).toBe('worker-1-2')
    })
    it('updatedAt 缺席回退枚举末位；无命中/形状漂移/快照异常 = undefined', () => {
      expect(workerChildSessionOf(ledger({ 'w-1': { parentId: 'p' } }), 'p')).toBe('w-1')
      expect(workerChildSessionOf(ledger({ 'w-1': { parentId: 'x' } }), 'p')).toBeUndefined()
      expect(workerChildSessionOf(ledger({}), 'p')).toBeUndefined()
      expect(workerChildSessionOf(undefined, 'p')).toBeUndefined()
      expect(workerChildSessionOf({ tag: 'x' }, 'p')).toBeUndefined()
      expect(workerChildSessionOf({ getSnapshot: () => 'garbage' }, 'p')).toBeUndefined()
      expect(
        workerChildSessionOf(
          {
            getSnapshot: () => {
              throw new Error('shape drift')
            },
          },
          'p',
        ),
      ).toBeUndefined()
    })
  })

  describe('resolveWorkerChildSession（miss → refresh 兜底一次 → 重扫；缺席/失败 = undefined）', () => {
    it('首扫命中 → 不 refresh', async () => {
      let refreshed = 0
      const list = { getSnapshot: () => ({ byId: { 'w-1': { parentId: 'p-1' } } }) }
      await expect(resolveWorkerChildSession({ list, refresh: async () => (refreshed += 1) }, 'p-1')).resolves.toBe('w-1')
      expect(refreshed).toBe(0)
    })
    it('首扫 miss → refresh 一次后重扫命中（added 广播未达兜底）；仍 miss = undefined', async () => {
      let byId: Record<string, unknown> = {}
      const list = { getSnapshot: () => ({ byId }) }
      const refresh = async (): Promise<unknown> => {
        byId = { 'w-9': { parentId: 'p-1', updatedAt: '2026-10-13T12:00:00Z' } }
        return undefined
      }
      await expect(resolveWorkerChildSession({ list, refresh }, 'p-1')).resolves.toBe('w-9')
      await expect(
        resolveWorkerChildSession({ list: { getSnapshot: () => ({ byId: {} }) }, refresh: async () => undefined }, 'p-1'),
      ).resolves.toBeUndefined()
    })
    it('taskKey 透传：键命中优先于 updatedAt 择新（⟞ 进行中任务判别面）', async () => {
      const list = {
        getSnapshot: () => ({
          byId: {
            'w-old': { parentId: 'p-1', updatedAt: '2026-10-13T10:00:00Z', displayTitle: 'feat-x/1.1 · A' },
            'w-new': { parentId: 'p-1', updatedAt: '2026-10-13T11:00:00Z', displayTitle: 'feat-x/1.2 · B' },
          },
        }),
      }
      await expect(resolveWorkerChildSession({ list }, 'p-1', 'feat-x/1.1')).resolves.toBe('w-old')
      await expect(resolveWorkerChildSession({ list }, 'p-1', 'feat-x/1.2')).resolves.toBe('w-new')
    })
    it('refresh 缺席/抛错 = fail-soft undefined（不炸调用面）', async () => {
      const empty = { getSnapshot: () => ({ byId: {} }) }
      await expect(resolveWorkerChildSession({ list: empty }, 'p-1')).resolves.toBeUndefined()
      await expect(
        resolveWorkerChildSession(
          {
            list: empty,
            refresh: async () => {
              throw new Error('boom')
            },
          },
          'p-1',
        ),
      ).resolves.toBeUndefined()
    })
  })

  it('main.conversation 影子登记缺席（fix-25：官方 ConversationRoot 渲染中区——官方头部链白拿）', () => {
    publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(registers.find((r) => r.key === 'main.conversation')).toBeUndefined()
    unpublishViews()
  })
})

describe('dock tab 族两段注册（4.1 AC1-3 + G1-16 镜像面）', () => {
  it('第一段 sidebarRightTabs.register 两类型：dswf-overview 页型 + guide 入口卡 order 0（官方 10/20/30 前——排最前）+ locale thunk 标题', () => {
    publishFakeViews()
    const { ctx, tabTypes, locale } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(tabTypes.calls).toHaveLength(3)
    const overview = tabTypes.calls.find((c) => c.id === OVERVIEW_TAB_KIND)!
    expect(overview.kind).toBe(OVERVIEW_TAB_KIND)
    expect(overview.patterns).toBeUndefined() // 页型（按 kind 开——无地址识别）
    expect(overview.guide).toHaveLength(1)
    const entry = overview.guide![0]!
    expect(entry.id).toBe('overview')
    expect(entry.order).toBe(0) // 官方 files/terminal/browser = 10/20/30 → 升序最前（AC2）
    expect(entry.title()).toBe('项目概览') // zh 词典（fix-33 ⑧ 同径）
    expect(entry.description?.()).toBe('feature · 任务 · 提案与文档——管线接管工作台')
    expect(overview.title('sidebar://dswf-overview')).toBe('项目概览') // chip 标题逐读
    expect(locale.registered[0]![1].en).toMatchObject({ 'tab.overview': 'Overview' })
    unpublishViews()
  })

  it('第一段 dswf-doc 资源型：multiple + patterns 整地址 glob + canOpen 前缀防御 + 标题 = 末段文件名（与 dock-tabs 地址编解码同源）', () => {
    publishFakeViews()
    const { ctx, tabTypes } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const doc = tabTypes.calls.find((c) => c.id === DOC_TAB_KIND)!
    expect(doc.kind).toBe(DOC_TAB_KIND)
    expect(doc.multiple).toBe(true) // 异地址各自成 tab（AC3）
    expect(doc.patterns).toEqual([`${DOC_ADDRESS_PREFIX}**`])
    expect(doc.guide).toBeUndefined() // 文档行开出——不上开始页
    expect(doc.canOpen?.(`${DOC_ADDRESS_PREFIX}p1/docs/features/x/proposal.md`)).toBe(true)
    expect(doc.canOpen?.('sidebar://guide')).toBe(false) // 前缀外防御拒绝
    expect(doc.title(`${DOC_ADDRESS_PREFIX}p1/docs/features/x/proposal.md`)).toBe('proposal.md')
    unpublishViews()
  })

  it('第二段 sidebar.right.pane.tab keyed 两 body：dispatch 键 = 定义 id + 发布组件；概览注入面 = 桥 + 跳会话（uiWorkspace.openSession）', () => {
    const views = publishFakeViews()
    const { ctx, registers, open } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const bodies = registers.filter((r) => r.key === SIDEBAR_RIGHT_PANE_TAB_SLOT)
    expect(bodies).toHaveLength(3)
    const overview = bodies.find((r) => r.options.key === OVERVIEW_TAB_KIND)!
    const doc = bodies.find((r) => r.options.key === DOC_TAB_KIND)!
    const bugBody = bodies.find((r) => r.options.key === BUG_TAB_KIND)!
    expect(overview.component).toBe(views.ForgeOverviewTab)
    expect(doc.component).toBe(views.ForgeDocsTab)
    expect(bugBody.component).toBe(views.ForgeBugPreview) // composer-bug-reference 1.3
    const face = overview.options.inject!() as {
      bridge: unknown
      onOpenSession: (sessionId: string) => void
      addBugToSession: (bug: { bugId: string; summary: string }, workspaceId: string | null) => Promise<void>
    }
    expect(face.bridge).toBe((globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__)
    face.onOpenSession('s-9')
    expect(open).toHaveBeenCalledWith('s-9')
    // composer-bug-reference 1.4：Bug 快速路径动作面在场（Bug 子 tab 行按钮消费）
    expect(typeof face.addBugToSession).toBe('function')
    expect(doc.options.inject).toBeUndefined() // 文档 body 自足（useTabInfo 由 seat 声明递达）
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { dock?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.dock?.registered).toEqual([
      OVERVIEW_TAB_KIND,
      DOC_TAB_KIND,
      BUG_TAB_KIND,
      SIDEBAR_RIGHT_PANE_TAB_SLOT,
      SIDEBAR_RIGHT_PANE_TAB_SLOT,
      SIDEBAR_RIGHT_PANE_TAB_SLOT,
    ])
    // 1.8 渲染链退役：预览注册链零改动面——dock 诊断 error 恒缺席（零 absent 记账）
    expect(marker?.dock?.error).toBeUndefined()
    unpublishViews()
  })

  it('第一段 Bug 台账资源型（composer-bug-reference 1.3）：multiple + patterns 整地址 glob + canOpen 前缀防御 + 标题 = Bug <bugId>', () => {
    publishFakeViews()
    const { ctx, tabTypes } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const bugType = tabTypes.calls.find((c) => c.id === BUG_TAB_KIND)!
    expect(bugType.kind).toBe(BUG_TAB_KIND)
    expect(bugType.multiple).toBe(true) // 异地址各自成 tab（同 dswf-doc 资源型先例）
    expect(bugType.patterns).toEqual([`${BUG_ADDRESS_PREFIX}**`])
    expect(bugType.guide).toBeUndefined() // openReference 路由开出——不上开始页
    expect(bugType.canOpen?.(bugAddressOf('p1', 'b-42'))).toBe(true)
    expect(bugType.canOpen?.('dsh-resource://dswf-doc/p1/a.md')).toBe(false) // 前缀外防御拒绝
    expect(bugType.title(bugAddressOf('p1', 'b-42'))).toBe('Bug b-42')
    expect(bugType.title(BUG_ADDRESS_PREFIX)).toBe('Bug 台账') // 形状漂移兜底（locale 词条）
    unpublishViews()
  })

  it('字面量同源 pin（bundle 自含不经 import）：两 kind 与地址前缀 = workbench/dock-tabs 常量；标题末段与 dock-tabs 编码同源', () => {
    expect(OVERVIEW_TAB_KIND).toBe(DOCK_OVERVIEW_KIND)
    expect(DOC_TAB_KIND).toBe(DOCK_DOC_KIND)
    expect(DOC_ADDRESS_PREFIX).toBe(DOCK_DOC_PREFIX)
    publishFakeViews()
    const { ctx, tabTypes } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const doc = tabTypes.calls.find((c) => c.id === DOC_TAB_KIND)!
    expect(doc.title(forgeDocAddress('p1', 'docs/proposals/m2/proposal.md'))).toBe('proposal.md')
    expect(parseForgeDocAddress(forgeDocAddress('p1', 'docs/a b/tech-design.md'))).toEqual({
      projectId: 'p1',
      docRel: 'docs/a b/tech-design.md',
    })
    // composer-bug-reference 1.3：Bug 地址编解码同源（plugin.ts 镜像 ↔ BugPreview.tsx 正本）
    expect(BUG_TAB_KIND).toBe(BUG_PREVIEW_BUG_TAB_KIND)
    expect(BUG_ADDRESS_PREFIX).toBe(BUG_PREVIEW_BUG_ADDRESS_PREFIX)
    expect(bugAddressOf('p1', 'b-42')).toBe(forgeBugAddress('p1', 'b-42'))
    expect(bugIdOfAddress(forgeBugAddress('p1', 'b-42'))).toBe('b-42')
    expect(bugIdOfAddress('dsh-resource://dswf-bug/p1/')).toBeUndefined()
    unpublishViews()
  })

  it('类型注册撤销面：overlay 洞 dispose 即撤销两类型（fix-33 ⑥ 对称性——官方注册表 kind 不残留）', () => {
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    publishFakeViews()
    const { ctx, injectDisposers, tabTypes } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(tabTypes.disposedIds).toEqual([])
    injectDisposers.get(SHELL_OVERLAY_SLOT)!()
    expect([...tabTypes.disposedIds].sort()).toEqual([BUG_TAB_KIND, DOC_TAB_KIND, OVERVIEW_TAB_KIND])
    unpublishViews()
    if (marker === undefined) delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    else (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ = marker
  })
})

describe('会话头挂接槽卸载 + 悬浮面板 ⟞ 开面（m3.1 D5/D6）', () => {
  it('D5 断言（fix-2 修订）：conversation.session.header.actions 唯一产品登记 = worktree chip（旧 pill 退役零残留）+ 发布面零 pill 组件', () => {
    publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const headerRows = registers.filter((r) => r.key === SESSION_HEADER_ACTIONS_SLOT)
    expect(headerRows, '会话头动作带唯一产品登记（旧挂接 pill 退役；fix-2 起 = worktree 只读 chip）').toHaveLength(1)
    expect(headerRows[0]!.options.id).toBe('dswf-worktree-chip')
    expect(
      (globalThis as { __DSH_FORGE_VIEWS__?: Record<string, unknown> }).__DSH_FORGE_VIEWS__?.['ForgeSessionTaskPills'],
      '发布面零 ForgeSessionTaskPills（随槽位卸载一并退役）',
    ).toBeUndefined()
    unpublishViews()
  })

  it('bug 2026-10-16：list 槽 register 必带 id——conversation.input.overlay 行携 dswf-worktree-seal + dswf-bug-chip-restore（官方校验 requires options.id，缺 id 即 apply 中断回滚）', () => {
    publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const overlayRows = registers.filter((r) => r.key === CONVERSATION_INPUT_OVERLAY_SLOT)
    expect(overlayRows, 'overlay 槽两登记（封存提示 + bug 4b34e5d8 chip 重建）').toHaveLength(2)
    expect(overlayRows[0]!.options.id).toBe('dswf-worktree-seal')
    expect(overlayRows[1]!.options.id).toBe('dswf-bug-chip-restore')
    unpublishViews()
  })

  it('bug 4b34e5d8：chip 重建缝发布——页面全局 restorer 在场；binding 有但 state 窄面缺席 = no-op（fail-soft）', () => {
    publishFakeViews()
    const { ctx, sessionsById } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const restore = (globalThis as { __DSH_FORGE_BUG_CHIP_RESTORE__?: (sessionId: string) => (() => void) | void })
      .__DSH_FORGE_BUG_CHIP_RESTORE__
    expect(restore, '重建闭包已发布').toBeTypeOf('function')
    sessionsById['s-live'] = {}
    const dispose = restore?.('s-live')
    expect(dispose, '缝缺席 = no-op disposer（函数——可安全解绑）').toBeTypeOf('function')
    dispose?.()
    // 摘除对称性随 fix-33 ⑥ revokeBridgeAndLocale 链（apply catch + overlay 洞 dispose 两径）
    unpublishViews()
  })

  it('D6 ⟞ 开面：onOpenWorkerSession → 账本 parentId 在场 = 官方 SubagentAddress 形（openChild 同径）；缺席 = 平开会话 id', () => {
    publishFakeViews()
    const { ctx, registers, sessionsById, open } = fakeClientCtx()
    sessionsById['worker-child'] = { parentId: 'dispatch-parent' }
    forgeClientPlugin().apply(ctx)
    const host = registers.find((r) => r.key === SHELL_OVERLAY_SLOT)!
    const face = host.options.inject!() as { onOpenWorkerSession: (childSessionId: string) => void }
    face.onOpenWorkerSession('worker-child')
    face.onOpenWorkerSession('top-level')
    expect(open).toHaveBeenNthCalledWith(1, { parentSessionId: 'dispatch-parent', childSessionId: 'worker-child', mode: 'unknown' })
    expect(open).toHaveBeenNthCalledWith(2, 'top-level')
    unpublishViews()
  })

  // ── D6 修复面：账本缺行（worker added 广播未达/丢失）的判读式打开统一径 ──
  it('D6 修复面：显式父（库侧权威）优先直接地址形态开——零 refresh 零判读（进行中 worker 账本缺行场景）', () => {
    publishFakeViews()
    const { ctx, registers, open, sessionsRefresh } = fakeClientCtx()
    const refreshCalls: number[] = []
    sessionsRefresh.current = async () => {
      refreshCalls.push(1)
      return undefined
    }
    forgeClientPlugin().apply(ctx)
    const host = registers.find((r) => r.key === SHELL_OVERLAY_SLOT)!
    const face = host.options.inject!() as {
      onOpenWorkerSession: (childSessionId: string, parentSessionId?: string) => void
      onOpenSession: (sessionId: string, parentSessionId?: string) => void
    }
    // 账本空（byId 零行）+ 显式父在场 = 直接地址形态（不 refresh 不判读——同步开）
    face.onOpenWorkerSession('worker-live', 'dispatch-parent')
    expect(open).toHaveBeenCalledWith({ parentSessionId: 'dispatch-parent', childSessionId: 'worker-live', mode: 'unknown' })
    face.onOpenSession('worker-live-2', 'dispatch-parent')
    expect(open).toHaveBeenCalledWith({ parentSessionId: 'dispatch-parent', childSessionId: 'worker-live-2', mode: 'unknown' })
    expect(refreshCalls, '显式父径零 refresh（库侧权威直达）').toHaveLength(0)
    unpublishViews()
  })

  it('D6 修复面：账本缺行 + refresh 兜底 → 重判读到 parentId = 地址形态开（⟞ 与执行会话 pill 两面同径）', async () => {
    publishFakeViews()
    const { ctx, registers, open, sessionsRefresh } = fakeClientCtx()
    const refreshCalls: number[] = []
    sessionsRefresh.current = async () => {
      refreshCalls.push(1)
      return undefined
    }
    forgeClientPlugin().apply(ctx)
    const host = registers.find((r) => r.key === SHELL_OVERLAY_SLOT)!
    const face = host.options.inject!() as {
      onOpenWorkerSession: (childSessionId: string) => void
      onOpenSession: (sessionId: string) => void
    }
    // byId 缺行（真实派发径常见态）：refresh 期注入 parentId → 重判读 = 地址形态
    const ledger = (ctx.get('sessions') as { list: { getSnapshot: () => { byId: Record<string, { parentId?: string }> } } })
    const injectRow = (id: string): void => {
      ledger.list.getSnapshot().byId[id] = { parentId: 'dispatch-parent' }
    }
    // refresh 内同步注入（refreshList 完成即 summaries 已替换的时序模拟）
    sessionsRefresh.current = async () => {
      refreshCalls.push(1)
      injectRow('worker-lost')
      return undefined
    }
    face.onOpenWorkerSession('worker-lost')
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledWith({ parentSessionId: 'dispatch-parent', childSessionId: 'worker-lost', mode: 'unknown' })
    })
    // 执行会话 pill（onOpenSession face）同径：缺行 worker 子会话 → refresh → 地址形态
    open.mockClear()
    sessionsRefresh.current = async () => {
      refreshCalls.push(1)
      injectRow('worker-pill')
      return undefined
    }
    face.onOpenSession('worker-pill')
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledWith({ parentSessionId: 'dispatch-parent', childSessionId: 'worker-pill', mode: 'unknown' })
    })
    expect(refreshCalls.length, '缺行径每次点击恰好一次 refresh 兜底').toBeGreaterThanOrEqual(2)
    unpublishViews()
  })

  it('D6 修复面：refresh 后仍缺行 / refresh 拒绝 → 平开兜底；行在场径零 refresh（顶层会话常态不加拍）', async () => {
    publishFakeViews()
    const { ctx, registers, sessionsById, open, sessionsRefresh } = fakeClientCtx()
    const refreshCalls: number[] = []
    sessionsRefresh.current = async () => {
      refreshCalls.push(1)
      throw new Error('rpc down')
    }
    forgeClientPlugin().apply(ctx)
    const host = registers.find((r) => r.key === SHELL_OVERLAY_SLOT)!
    const face = host.options.inject!() as { onOpenWorkerSession: (childSessionId: string) => void }
    // refresh 拒绝 → 平开（不炸——官方 retain 对缺行 id 的报错在 face 层不外溢）
    face.onOpenWorkerSession('never-known')
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledWith('never-known')
    })
    // 行在场（无论有无 parentId）→ 同步开 + 零 refresh
    open.mockClear()
    refreshCalls.length = 0
    sessionsRefresh.current = async () => {
      refreshCalls.push(1)
      return undefined
    }
    sessionsById['top-known'] = {}
    face.onOpenWorkerSession('top-known')
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('top-known')
    expect(refreshCalls, '行在场径零 refresh（不加拍）').toHaveLength(0)
    unpublishViews()
  })

  it('D6 显式父让位账本（fix-7）：行在场 = 账本自身父域权威——合成挂接父域 ≠ 官方亲子 → 平开（subagent/unauthorized 拒历史加载收口）', () => {
    publishFakeViews()
    const { ctx, registers, sessionsById, open, sessionsRefresh } = fakeClientCtx()
    const refreshCalls: number[] = []
    sessionsRefresh.current = async () => {
      refreshCalls.push(1)
      return undefined
    }
    forgeClientPlugin().apply(ctx)
    const host = registers.find((r) => r.key === SHELL_OVERLAY_SLOT)!
    const face = host.options.inject!() as {
      onOpenWorkerSession: (childSessionId: string, parentSessionId?: string) => void
      onOpenSession: (sessionId: string, parentSessionId?: string) => void
    }
    // 行在场 + 无父域（tsl 合成挂接 fixture：真实顶层会话 × link 表父域）→ 平开（转录照载）
    sessionsById['synth-exec'] = {}
    face.onOpenWorkerSession('synth-exec', 'link-parent')
    expect(open, '行在场父域缺席 = 顶层平开（不强制 SubagentAddress）').toHaveBeenCalledWith('synth-exec')
    // 行在场 + 父域在场 → 账本父域权威（官方 SubagentAddress 校验以宿主账本为准）
    sessionsById['ledger-child'] = { parentId: 'ledger-parent' }
    face.onOpenWorkerSession('ledger-child', 'link-parent')
    expect(open, '⟞ 面：账本父域胜出（link 显式父非官方亲子）').toHaveBeenCalledWith({
      parentSessionId: 'ledger-parent',
      childSessionId: 'ledger-child',
      mode: 'unknown',
    })
    face.onOpenSession('ledger-child', 'ledger-parent')
    expect(open, '执行会话 pill 面同径（openSessionWithLedgerAddress 单源）').toHaveBeenCalledWith({
      parentSessionId: 'ledger-parent',
      childSessionId: 'ledger-child',
      mode: 'unknown',
    })
    // 缺行径回退照旧：显式父直达（98189bf 进行中 worker 场景保持）
    face.onOpenWorkerSession('worker-live', 'dispatch-parent')
    expect(open, '账本缺行 = 显式父直达（零 refresh）').toHaveBeenCalledWith({
      parentSessionId: 'dispatch-parent',
      childSessionId: 'worker-live',
      mode: 'unknown',
    })
    expect(refreshCalls, '三径全零 refresh（行在场同步判读 + 缺行显式父直达）').toHaveLength(0)
    unpublishViews()
  })

  it('workerOpenTarget / 账本判读纯面：parentId 缺席/形状漂移 → 平开；官方面异常 fail-soft（不外溢）', () => {
    expect(workerOpenTarget(undefined, 's-1')).toBe('s-1')
    expect(workerOpenTarget('p-1', 's-1')).toEqual({ parentSessionId: 'p-1', childSessionId: 's-1', mode: 'unknown' })
    // 账本判读（sessionParentIdOf）：非对象/无 getSnapshot/快照异常/parentId 非串 → undefined
    expect(sessionParentIdOf(undefined, 's-1')).toBeUndefined()
    expect(sessionParentIdOf({ tag: 'x' }, 's-1')).toBeUndefined()
    expect(
      sessionParentIdOf(
        {
          getSnapshot: () => {
            throw new Error('shape drift')
          },
        },
        's-1',
      ),
    ).toBeUndefined()
    expect(sessionParentIdOf({ getSnapshot: () => ({ byId: { 's-1': { parentId: 42 } } }) }, 's-1')).toBeUndefined()
    expect(sessionParentIdOf({ getSnapshot: () => ({ byId: { 's-1': { parentId: 'p-9' } } }) }, 's-1')).toBe('p-9')
    // 账本行在场判定（sessionRowInLedger——D6 修复面）：形状漂移/异常 = false；行在场 = true
    expect(sessionRowInLedger(undefined, 's-1')).toBe(false)
    expect(sessionRowInLedger({ tag: 'x' }, 's-1')).toBe(false)
    expect(
      sessionRowInLedger(
        {
          getSnapshot: () => {
            throw new Error('shape drift')
          },
        },
        's-1',
      ),
    ).toBe(false)
    expect(sessionRowInLedger({ getSnapshot: () => ({ byId: {} }) }, 's-1')).toBe(false)
    expect(sessionRowInLedger({ getSnapshot: () => ({ byId: { 's-1': {} } }) }, 's-1')).toBe(true)
    // S1 会话名解析（sessionTitleOf）：命中 = displayTitle；行缺席/非串/空串/形状漂移/快照异常 → undefined
    expect(sessionTitleOf({ getSnapshot: () => ({ byId: { 's-1': { displayTitle: '索引重建' } } }) }, 's-1')).toBe('索引重建')
    expect(sessionTitleOf(undefined, 's-1')).toBeUndefined()
    expect(sessionTitleOf({ tag: 'x' }, 's-1')).toBeUndefined()
    expect(sessionTitleOf({ getSnapshot: () => ({ byId: {} }) }, 's-1')).toBeUndefined()
    expect(sessionTitleOf({ getSnapshot: () => ({ byId: { 's-1': {} } }) }, 's-1')).toBeUndefined()
    expect(sessionTitleOf({ getSnapshot: () => ({ byId: { 's-1': { displayTitle: 42 } } }) }, 's-1')).toBeUndefined()
    expect(sessionTitleOf({ getSnapshot: () => ({ byId: { 's-1': { displayTitle: '' } } }) }, 's-1')).toBeUndefined()
    expect(
      sessionTitleOf(
        {
          getSnapshot: () => {
            throw new Error('shape drift')
          },
        },
        's-1',
      ),
    ).toBeUndefined()
    // 解析器组装（makeSessionTitleResolver）：闭包持账本快照源——命中/缺席两态
    const ledger = { getSnapshot: () => ({ byId: { 's-2': { displayTitle: '派发会话' } } }) }
    const resolver = makeSessionTitleResolver({ list: ledger })
    expect(resolver('s-2')).toBe('派发会话')
    expect(resolver('s-x')).toBeUndefined()
    // 官方面异常 fail-soft：openSession 抛错不外溢（会话卸载瞬态）
    publishFakeViews()
    const base = fakeClientCtx()
    const ctx: ForgeClientCtx = {
      ...base.ctx,
      get: (name) => {
        if (name === 'uiWorkspace') {
          return {
            openSession: () => {
              throw new Error('no surface')
            },
            startSession: () => {},
          }
        }
        return base.ctx.get(name)
      },
    }
    forgeClientPlugin().apply(ctx)
    const host = base.registers.find((r) => r.key === SHELL_OVERLAY_SLOT)!
    const face = host.options.inject!() as { onOpenWorkerSession: (childSessionId: string) => void }
    expect(() => face.onOpenWorkerSession('s-1')).not.toThrow()
    unpublishViews()
  })

  it('诊断面：views 族登记数组 = 页签 + hero 影子 + worktree chip/双 overlay（fix-2 封存提示 + bug 4b34e5d8 chip 重建）', () => {
    publishFakeViews()
    const { ctx } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { views?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.views?.registered).toEqual([CONVERSATION_VIEW_SLOT, HERO_WORKSPACE_SLOT, TOOL_CALL_TOOLVIEW_SLOT, FORGE_PROGRESS_NODE_SLOT, SESSION_HEADER_ACTIONS_SLOT, CONVERSATION_INPUT_OVERLAY_SLOT, CONVERSATION_INPUT_OVERLAY_SLOT])
    expect(marker?.views?.error).toBeUndefined()
    unpublishViews()
  })
})

/**
 * 官方设置分区序 pin（上游 0.2.0-rc.2 dsh-client-ui-settings-{general,models,plugins}
 * client.js 源码核实：SettingsRoot nav 行按 order 升序映射直出——DOM 序 = 排序结果；
 * 上游升带漂移时本 pin 先红）。分区面 = list 槽 scope root（ui-settings contract/slots
 * 的 settings.section——owner share close 由壳递达）。
 */
const OFFICIAL_SETTINGS_SECTION_ORDERS: Readonly<Record<string, number>> = {
  general: 0,
  models: 10,
  plugins: 15,
}

describe('设置分区登记（4.7 AC1/AC3/AC4 + Integration #4：settings.section list 槽）', () => {
  it('list 槽登记：id dswf-forge-settings + order 5 + locale NS label thunk（zh 值 Forge设置）+ 发布组件；零 children/priority/key——生命周期归官方设置对话框（Hard Rule 非 fork）；inject = 模型目录装载器（m3.1 D25）', () => {
    const views = publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const sections = registers.filter((r) => r.key === SETTINGS_SECTION_SLOT)
    expect(sections, 'settings.section 恰一登记（官方 general/models/plugins 行保持在场）').toHaveLength(1)
    const forge = sections[0]!
    expect(forge.options.id).toBe(FORGE_SETTINGS_SECTION_ID)
    expect(forge.options.id).toBe('dswf-forge-settings')
    expect(forge.options.order).toBe(FORGE_SETTINGS_SECTION_ORDER)
    expect(forge.options.order).toBe(5)
    expect(forge.options.locale).toBe(FORGE_LOCALE_NS)
    expect(typeof forge.options.label).toBe('function') // fix-33 ⑧ locale thunk（官方分区 nav 行同径）
    expect((forge.options.label as () => string)()).toBe('Forge设置')
    expect(forge.component).toBe(views.ForgeSettingsSection)
    // Hard Rule 非 fork 纪律：list 槽行语言最小面——无 children 声明（无子洞）、无 priority
    // （single 槽语义）、无 key；打开/关闭/Esc 全部官方设置对话框自持。
    // m3.1 D25（blitz 1.2 结果性承接）：inject face = loadModelCatalog（remote.session
    // .modelCatalog 惰性反射装载器——Provider/Model 选项值 =「设置>模型」目录）；
    // settings get/set 数据面主体仍 preload RPC 单门自足
    expect(forge.options.children).toBeUndefined()
    expect(forge.options.priority).toBeUndefined()
    expect(forge.options.key).toBeUndefined()
    const face = forge.options.inject?.() as { loadModelCatalog: () => Promise<unknown> }
    expect(typeof face?.loadModelCatalog).toBe('function')
    unpublishViews()
  })

  it('loadModelCatalog inject face：modelCatalog 信封 groups → [{provider, models}]；remote 嵌套双径；缺席/!ok/拒绝 = undefined（组件面静态目录回退）', async () => {
    const envelopeOk = {
      ok: true,
      value: {
        groups: [
          {
            id: 'zai-coding-cn',
            models: [
              { id: 'glm-5.3', reasoning: { efforts: [{ id: 'low' }, { id: 'high' }, { id: 'max' }] } },
              { id: 'glm-5.3-flash' },
            ],
          },
          { id: 'dsh-openai', models: [{ id: 'glm-5.3' }] },
        ],
      },
    }
    const expected = [
      {
        provider: 'zai-coding-cn',
        models: ['glm-5.3', 'glm-5.3-flash'],
        modelEfforts: { 'glm-5.3': ['low', 'high', 'max'] },
      },
      { provider: 'dsh-openai', models: ['glm-5.3'] },
    ]
    const faceOf = (reflectGet: (name: string) => unknown): { loadModelCatalog: () => Promise<unknown> } => {
      publishFakeViews()
      const run = fakeClientCtx({ get: reflectGet })
      forgeClientPlugin().apply(run.ctx)
      const forge = run.registers.find((r) => r.key === SETTINGS_SECTION_SLOT)
      if (forge === undefined) throw new Error('settings.section 登记缺席（发布面/装载面断裂）')
      return forge.options.inject!() as { loadModelCatalog: () => Promise<unknown> }
    }
    // 成功：remote.session 直达 → groups 解包（reasoning.efforts[].id 透传 modelEfforts——档位兼容能力面）
    await expect(
      faceOf((name) => (name === 'remote.session' ? { modelCatalog: () => Promise.resolve(envelopeOk) } : undefined)).loadModelCatalog(),
    ).resolves.toEqual(expected)
    // 成功：'remote' 嵌套 session 双径（反射配方同 buildOpenSessionOrchestrator agentPresets）
    await expect(
      faceOf((name) => (name === 'remote' ? { session: { modelCatalog: () => Promise.resolve(envelopeOk) } } : undefined)).loadModelCatalog(),
    ).resolves.toEqual(expected)
    // 服务缺席（reflect 全 undefined）→ undefined
    await expect(faceOf(() => undefined).loadModelCatalog()).resolves.toBeUndefined()
    // 信封 !ok（RemoteError 面）→ undefined
    await expect(
      faceOf((name) =>
        name === 'remote.session'
          ? { modelCatalog: () => Promise.resolve({ ok: false, error: { code: 'session/x', message: 'y' } }) }
          : undefined,
      ).loadModelCatalog(),
    ).resolves.toBeUndefined()
    // 调用拒绝 → undefined（静默回退，不炸设置分区装载）
    await expect(
      faceOf((name) => (name === 'remote.session' ? { modelCatalog: () => Promise.reject(new Error('boom')) } : undefined)).loadModelCatalog(),
    ).resolves.toBeUndefined()
    unpublishViews()
  })

  it('loadModelCatalog 档位兼容能力面：efforts 缺席/畸形/空集 = 不记该模型能力（组件面不过滤不判）', async () => {
    const envelope = {
      ok: true,
      value: {
        groups: [
          {
            id: 'p1',
            models: [
              { id: 'm-no-reasoning' },
              { id: 'm-bad-efforts', reasoning: { efforts: 'not-array' } },
              { id: 'm-empty-efforts', reasoning: { efforts: [] } },
              { id: 'm-bad-ids', reasoning: { efforts: [{ id: 42 }, { name: 'x' }] } },
              { id: 'm-ok', reasoning: { efforts: [{ id: 'high' }] } },
            ],
          },
        ],
      },
    }
    publishFakeViews()
    const run = fakeClientCtx({ get: (name) => (name === 'remote.session' ? { modelCatalog: () => Promise.resolve(envelope) } : undefined) })
    forgeClientPlugin().apply(run.ctx)
    const forge = run.registers.find((r) => r.key === SETTINGS_SECTION_SLOT)!
    const face = forge.options.inject!() as { loadModelCatalog: () => Promise<unknown> }
    await expect(face.loadModelCatalog()).resolves.toEqual([
      {
        provider: 'p1',
        models: ['m-no-reasoning', 'm-bad-efforts', 'm-empty-efforts', 'm-bad-ids', 'm-ok'],
        modelEfforts: { 'm-ok': ['high'] },
      },
    ])
    unpublishViews()
  })

  it('位置断言（DOM 序）：官方分区序 pin 下 Forge设置 行在 通用设置(general) 之下、模型(models) 之上（nav 行升序直出）', () => {
    publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const forge = registers.find((r) => r.key === SETTINGS_SECTION_SLOT)!
    // 官方 SettingsRoot sections store 同式：entries → {id, order, label} → order 升序排序 →
    // navList DOM 行序（ui-settings-general client.js sections.getSnapshot 镜像）
    const rows = [
      ...Object.entries(OFFICIAL_SETTINGS_SECTION_ORDERS).map(([id, order]) => ({ id, order })),
      { id: forge.options.id!, order: forge.options.order! },
    ].sort((a, b) => a.order - b.order)
    const indexOf = (id: string): number => rows.findIndex((row) => row.id === id)
    expect(rows.map((row) => row.id)).toEqual(['general', FORGE_SETTINGS_SECTION_ID, 'models', 'plugins'])
    expect(indexOf('general'), '通用设置分区下方（AC1 DOM 序）').toBeLessThan(indexOf(FORGE_SETTINGS_SECTION_ID))
    expect(indexOf(FORGE_SETTINGS_SECTION_ID), '通用设置正下方——模型之上（ui-design UF-2 Placement）').toBeLessThan(indexOf('models'))
    unpublishViews()
  })

  it('诊断面 + locale 词典：settings 族登记数组含 settings.section 洞位；词典含 settings.forge zh/en 双语', () => {
    publishFakeViews()
    const { ctx, locale } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { settings?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.settings?.registered).toEqual([SETTINGS_SECTION_SLOT])
    expect(marker?.settings?.error).toBeUndefined()
    expect(locale.registered[0]![1].zh).toMatchObject({ 'settings.forge': 'Forge设置' })
    expect(locale.registered[0]![1].en).toMatchObject({ 'settings.forge': 'Forge Settings' })
    unpublishViews()
  })
})

describe('fix-33 ⑥ 缝族对称性（桥/词典/标记的发布与撤销）', () => {
  it('apply 中途抛错（首个洞位 inject 失败）→ catch 补撤销：桥全局清空 + locale 词典撤销（死闭包不残留）', () => {
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    publishFakeViews()
    const base = fakeClientCtx()
    const { locale } = base
    const origInject = base.ctx.slots.inject.bind(base.ctx.slots)
    let first = true
    const ctx: ForgeClientCtx = {
      ...base.ctx, // slots 为 readonly——不改原对象，浅拷贝面置换 inject
      slots: {
        ...base.ctx.slots,
        inject: (key: string, callback: () => (() => void) | undefined) => {
          if (first) {
            first = false
            throw new Error('inject down')
          }
          return origInject(key, callback)
        },
      },
    }
    expect(() => forgeClientPlugin().apply(ctx)).not.toThrow() // 诊断面承接，不重抛
    // 桥已创建（发布面工厂先行）→ catch 补撤销：全局回 undefined
    expect((globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__).toBeUndefined()
    expect(locale.disposed).toBe(true) // 词典同步撤销（残留会阻塞同 ns 重复登记）
    // 诊断面仍记录失败因（e2e 排障锚不受影响）
    const after = (globalThis as { __DSH_FORGE_CLIENT__?: { sidebar?: { error?: string } } }).__DSH_FORGE_CLIENT__
    expect(after?.sidebar?.error).toMatch(/inject down/)
    unpublishViews()
    if (marker === undefined) delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    else (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ = marker
  })

  it('overlay 洞 dispose：桥全局 + __DSH_FORGE_CLIENT__ 标记 + locale 词典三清（卸载不留残留）', () => {
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    publishFakeViews()
    const { ctx, injectDisposers, locale } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect((globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__).toBeDefined()
    expect((globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__).toBeDefined()
    const disposeOverlay = injectDisposers.get(SHELL_OVERLAY_SLOT)
    expect(disposeOverlay).toBeDefined()
    disposeOverlay!()
    expect((globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__).toBeUndefined()
    expect((globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__).toBeUndefined() // fix-33 ⑥ 标记清理
    expect(locale.disposed).toBe(true)
    unpublishViews()
    if (marker === undefined) delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    else (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ = marker
  })
})

describe('DOM 增强器挂接（1.9：md-mermaid enhancer apply 期启动 + 卸载级联回收）', () => {
  it('apply 期 start 恰一（@dsh-forge/md-mermaid ./web enhancer 经发布面递达——凡 .md-code-block 全 DOM 扫描增强）', () => {
    publishFakeViews()
    const { ctx } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(lastFakeEnhancer!.calls).toEqual(['start'])
    unpublishViews()
  })

  it('overlay 洞 dispose = enhancer.stop（插件 fiber 卸载级联回收——start/stop 对称；dispose 幂等不重复记账）', () => {
    publishFakeViews()
    const { ctx, injectDisposers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(lastFakeEnhancer!.calls).toEqual(['start'])
    const disposeOverlay = injectDisposers.get(SHELL_OVERLAY_SLOT)!
    disposeOverlay()
    expect(lastFakeEnhancer!.calls).toEqual(['start', 'stop'])
    disposeOverlay()
    expect(lastFakeEnhancer!.calls).toEqual(['start', 'stop'])
    unpublishViews()
  })

  it('apply 中途抛错（dock tab 首个 pane.tab inject 失败）= 增强器未及挂接（零 start 零 stop——半成型态零死观察器）', () => {
    publishFakeViews()
    const base = fakeClientCtx()
    const origInject = base.ctx.slots.inject.bind(base.ctx.slots)
    let first = true
    const ctx: ForgeClientCtx = {
      ...base.ctx,
      slots: {
        ...base.ctx.slots,
        inject: (key: string, callback: () => (() => void) | undefined) => {
          if (first) {
            first = false
            throw new Error('inject down')
          }
          return origInject(key, callback)
        },
      },
    }
    expect(() => forgeClientPlugin().apply(ctx)).not.toThrow()
    expect(lastFakeEnhancer!.calls).toEqual([])
    unpublishViews()
  })
})

it('1.8/1.9 退役收口 pin：dswf-md-mermaid 预览注册链零残留（keyed body / documentPreviews 惰性注册零登记——sidebar md 预览回归官方 builtin 下拉）', () => {
  publishFakeViews()
  const { ctx, registers, injectedKeys } = fakeClientCtx()
  forgeClientPlugin().apply(ctx)
  expect(
    registers.filter((r) => r.key.includes('dswf-md-mermaid') || (r.options.key ?? '').includes('dswf-md-mermaid')),
    '零 dswf-md-mermaid 预览注册（官方 builtin 独占 md 预览）',
  ).toEqual([])
  expect(injectedKeys.filter((k) => k.includes('dswf-md-mermaid'))).toEqual([])
  expect(
    (globalThis as { __DSH_FORGE_VIEWS__?: Record<string, unknown> }).__DSH_FORGE_VIEWS__?.['ForgeMdPreviewBody'],
    '发布面零 ForgeMdPreviewBody（1.8 渲染链退役收口）',
  ).toBeUndefined()
  unpublishViews()
})

it('发布面缺席 → 诊断面记录（激活不炸——标记仍在，错误可查；publishedViews 直调仍 fail-loud）', () => {
  const marker = (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
  unpublishViews()
  expect(() => publishedViews()).toThrow(/__DSH_FORGE_VIEWS__/)
  forgeClientPlugin().apply(fakeClientCtx().ctx)
  const after = (globalThis as { __DSH_FORGE_CLIENT__?: { sidebar?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
  expect(after?.sidebar?.error).toMatch(/__DSH_FORGE_VIEWS__/)
  expect(after?.sidebar?.registered).toBeUndefined()
  if (marker === undefined) delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
  else (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ = marker
})

describe('注册面', () => {
  it('registerForgeClient 经 __ModuleLoader__.load 提交工厂（id = 插件名）', () => {
    const registrations: ModuleLoaderRegistration[] = []
    const facade: ModuleLoaderFacade = {
      mode: 'live',
      pendingQueue: [],
      load: (registration) => {
        registrations.push(registration)
      },
      create: () => {
        throw new Error('unexpected')
      },
    }
    registerForgeClient(facade)
    expect(registrations).toHaveLength(1)
    expect(registrations[0]!.id).toBe(FORGE_CLIENT_PLUGIN_ID)
    const exports = registrations[0]!.factory(() => {
      throw new Error('插件组件源走发布面——工厂零外部 require')
    }) as { name: string }
    expect(exports.name).toBe(FORGE_CLIENT_PLUGIN_ID)
  })
  it('moduleLoaderFacade 缺席即 fail-loud；在场透传', () => {
    const prev = (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__
    delete (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__
    expect(() => moduleLoaderFacade()).toThrow(/__ModuleLoader__/)
    const fake = { mode: 'live', pendingQueue: [], load: () => {}, create: () => {} }
    ;(globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__ = fake
    expect(moduleLoaderFacade()).toBe(fake)
    if (prev === undefined) delete (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__
    else (globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__ = prev
  })
  it('publishedViews 在场透传', () => {
    const views = publishFakeViews()
    expect(publishedViews()).toBe(views)
    unpublishViews()
  })
})

// ============================================================================
// Bug 引用 source 注册（composer-bug-reference 1.2）：官方 inputTriggers 挂 T1
// Bug source（trigger '@' / 组名 'dswf-bug' 唯一 / order 30 = 官方 reference 组后）。
// 接线面 pin：reflect 惰性 fail-soft 取法 · bugs.list RPC 递达（projectId = 会话↔workspace
// 绑定锚）· 状态面包屑 drill 切 status 口径 · bug 图标件（发布面 ForgeBugGlyph）·
// lexicon/subscribeLexicon 缺席（纯 chip 形态——@<name> 纯文本装饰零参与）。
// ============================================================================

/** Bug 组测试夹具：reflect 带 inputTriggers 注册收集器 + 页内 dshForge 传输替身 */
function bugFixture(routes: Partial<Record<string, (payload?: unknown) => unknown>> = {}): {
  registered: unknown[]
  calls: { channel: string; payload?: unknown }[]
  reflect: { get: (name: string) => unknown }
  unstub: () => void
} {
  const registered: unknown[] = []
  const calls: { channel: string; payload?: unknown }[] = []
  const svc = {
    registerSource: (src: unknown) => {
      registered.push(src)
      return () => {}
    },
  }
  ;(globalThis as { dshForge?: unknown }).dshForge = {
    invoke: (channel: string, payload?: unknown) => {
      calls.push({ channel, payload })
      const route = routes[channel]
      return Promise.resolve(route === undefined ? { ok: false, error: { code: 'NO_ROUTE', message: 'no route' } } : route(payload))
    },
  }
  return {
    registered,
    calls,
    reflect: { get: (name: string) => (name === 'inputTriggers' ? svc : undefined) },
    unstub: () => {
      delete (globalThis as { dshForge?: unknown }).dshForge
    },
  }
}

const BUG_FIXTURE_PROJECTS = [
  { id: 'p1', workspaceId: 'w1' },
  { id: 'p2', workspaceId: 'w2' },
]
const BUG_FIXTURE_NOW = '2026-10-14T00:00:00.000Z'
const BUG_FIXTURE_BUGS = [
  { bugId: 'b-2', summary: '已修一条', bugStatus: 'fixed', bugDesc: 'd', triggerDesc: 't', expected: 'e', actual: 'a', reporter: 'r', createdAt: BUG_FIXTURE_NOW, updatedAt: BUG_FIXTURE_NOW },
  { bugId: 'b-1', summary: '在修一条', bugStatus: 'open', bugDesc: 'd', triggerDesc: 't', expected: 'e', actual: 'a', reporter: 'r', createdAt: BUG_FIXTURE_NOW, updatedAt: BUG_FIXTURE_NOW },
]
const BUG_SIGNAL = new AbortController().signal
/** 微任务排干（fire-and-forget RPC 链落地——注册期/预热期 projects 缓存就绪） */
async function bugFlush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}
/** 注册一次 Bug source 并返回（接线面测试的公共前置） */
function appliedBugSource(
  routes: Partial<Record<string, (payload?: unknown) => unknown>> = {},
  opts?: { readonly omitGlyph?: boolean },
): { source: Record<string, unknown>; calls: { channel: string; payload?: unknown }[]; unstub: () => void } {
  const views = publishFakeViews()
  if (opts?.omitGlyph === true) delete (views as Record<string, unknown>)['ForgeBugGlyph']
  const fx = bugFixture(routes)
  const { ctx } = fakeClientCtx(fx.reflect)
  ;(ctx.get('workspaces') as { list: unknown }).list = {
    getSnapshot: () => ({ items: [{ workspaceId: 'w1', sessionIds: ['s1'] }] }),
  }
  forgeClientPlugin().apply(ctx)
  void views
  return { source: fx.registered[0] as Record<string, unknown>, calls: fx.calls, unstub: fx.unstub }
}

describe('Bug 引用 source 注册（composer-bug-reference 1.2）', () => {
  it('注册行 pin：apply 经 reflect.get(\'inputTriggers\') 恰挂一 source——trigger \'@\' / name \'dswf-bug\' / order 30（官方 reference 组缺省 0 之后）/ candidates·header·onPick·codec 方法面在位 / lexicon·subscribeLexicon 缺席', () => {
    const { source, unstub } = appliedBugSource()
    expect(source['trigger']).toBe('@')
    expect(source['name']).toBe(FORGE_BUG_SOURCE_NAME)
    expect(source['name']).toBe('dswf-bug')
    expect(source['order']).toBe(FORGE_BUG_SOURCE_ORDER)
    expect(source['order']).toBe(30)
    expect(typeof source['candidates']).toBe('function')
    expect(typeof source['header']).toBe('function')
    expect(typeof source['onPick']).toBe('function')
    const codec = source['codec'] as Record<string, unknown>
    expect(typeof codec?.['clipboardText']).toBe('function')
    expect(typeof codec?.['serialize']).toBe('function')
    // 共存约束②：不实现 lexicon/subscribeLexicon（引用只以原子 chip 形态存在）
    expect(source['lexicon']).toBeUndefined()
    expect(source['subscribeLexicon']).toBeUndefined()
    unstub()
  })

  it('inputTriggers 缺席（reflect 无此名）/ reflect 缺席 / registerSource throw：均不注册不报错，其余登记行不受累', () => {
    publishFakeViews()
    // reflect 在场但服务缺席
    const a = fakeClientCtx({ get: () => undefined })
    expect(() => forgeClientPlugin().apply(a.ctx)).not.toThrow()
    // reflect 缺席
    const b = fakeClientCtx()
    expect(() => forgeClientPlugin().apply(b.ctx)).not.toThrow()
    // duplicate throw（官方守卫）——apply 吞掉不炸
    const c = fakeClientCtx({
      get: (name: string) => (name === 'inputTriggers' ? { registerSource: () => { throw new Error('duplicate trigger/name') } } : undefined),
    })
    expect(() => forgeClientPlugin().apply(c.ctx)).not.toThrow()
    expect(c.registers.find((r) => r.key === SHELL_OVERLAY_SLOT)).toBeDefined()
    unpublishViews()
  })

  it('candidates 递达 bugs.list：projectId 沿会话↔workspace 绑定锚解析，query 透传 search 入参，open 优先排序', async () => {
    const { source, calls, unstub } = appliedBugSource({
      'forge:projects/list': () => ({ ok: true, data: BUG_FIXTURE_PROJECTS }),
      // 服务端 search 语义替身：summary 命中过滤（产品侧零前端全量筛——透传即口径）
      'forge:bugs/list': (payload) => ({
        ok: true,
        data: BUG_FIXTURE_BUGS.filter((b) => b.summary.includes((payload as { search?: string }).search ?? '')),
      }),
    })
    await bugFlush()
    const rows = (await (source['candidates'] as (session: unknown, req: { query: string; position: 'inline'; drilled: boolean; signal: AbortSignal }) => Promise<{ name: string }[]>)(
      { sessionId: 's1' },
      { query: '在修', position: 'inline', drilled: false, signal: BUG_SIGNAL },
    )) as { name: string }[]
    expect(rows.map((r) => r.name)).toEqual(['b-1']) // search 服务端命中（'在修' ∈ summary）
    expect(
      calls.some((c) => c.channel === 'forge:bugs/list' && JSON.stringify(c.payload) === JSON.stringify({ projectId: 'p1', search: '在修' })),
      'bugs.list 透传：projectId=会话锚所属项目 + search=查询串',
    ).toBe(true)
    unstub()
  })

  it('状态面包屑：header 四 crumb（全部/open/fixed/unresolved，current 标当前）；crumb pick 经 onPick action:\'drill\' 切口径后 candidates 以 status 入参重拉（一次 RPC 一口径）', async () => {
    const { source, unstub } = appliedBugSource({
      'forge:projects/list': () => ({ ok: true, data: BUG_FIXTURE_PROJECTS }),
      'forge:bugs/list': (payload) => {
        const status = (payload as { status?: string[] }).status
        return { ok: true, data: status === undefined ? BUG_FIXTURE_BUGS : BUG_FIXTURE_BUGS.filter((b) => status.includes(b.bugStatus)) }
      },
    })
    await bugFlush()
    const header = source['header'] as (session: unknown, req: { query: string; drilled: boolean }) => readonly { label: string; value: string; current?: boolean }[]
    const crumbs = header({ sessionId: 's1' }, { query: '', drilled: false })
    expect(crumbs.map((c) => c.label)).toEqual(['全部', 'open', 'fixed', 'unresolved'])
    expect(crumbs.find((c) => c.label === '全部')?.current).toBe(true)
    const outcome = (source['onPick'] as (pick: unknown) => unknown)({
      candidate: { name: 'scope:fixed', value: crumbs.find((c) => c.label === 'fixed')!.value },
      session: { sessionId: 's1' },
      position: 'inline',
      via: 'menu',
      action: 'drill',
    })
    expect(outcome).toBe('handled')
    // 切口径后：current=fixed；重拉以 status 入参（一次 RPC 一口径——search 未变不带脏键）
    expect(header({ sessionId: 's1' }, { query: '', drilled: true }).find((c) => c.label === 'fixed')?.current).toBe(true)
    const rows = (await (source['candidates'] as (session: unknown, req: { query: string; position: 'leading'; drilled: boolean; signal: AbortSignal }) => Promise<{ name: string }[]>)(
      { sessionId: 's1' },
      { query: '', position: 'leading', drilled: true, signal: BUG_SIGNAL },
    )) as { name: string }[]
    expect(rows.map((r) => r.name)).toEqual(['b-2']) // status=['fixed'] 子集
    unstub()
  })

  it('fail-soft：@" 引号态空候选（bugs.list 零调用）；无 dshForge（传输缺席）→ 零候选不抛', async () => {
    // 引号态：文件路径专属语义——T1 source quoted=true 短路
    const quoted = appliedBugSource({
      'forge:projects/list': () => ({ ok: true, data: BUG_FIXTURE_PROJECTS }),
      'forge:bugs/list': () => ({ ok: true, data: BUG_FIXTURE_BUGS }),
    })
    await bugFlush()
    const quotedRows = (await (quoted.source['candidates'] as (session: unknown, req: { query: string; quoted?: boolean; position: 'inline'; drilled: boolean; signal: AbortSignal }) => Promise<readonly unknown[]>)(
      { sessionId: 's1' },
      { query: '任意', quoted: true, position: 'inline', drilled: false, signal: BUG_SIGNAL },
    )) as unknown[]
    expect(quotedRows).toEqual([])
    quoted.unstub()
    // 无 dshForge（非 Electron 载体）：登记期零传输可达——candidates 零候选不抛
    const noTransport = appliedBugSource()
    const rows = (await (noTransport.source['candidates'] as (session: unknown, req: { query: string; position: 'inline'; drilled: boolean; signal: AbortSignal }) => Promise<readonly unknown[]>)(
      { sessionId: 's1' },
      { query: '', position: 'inline', drilled: false, signal: BUG_SIGNAL },
    )) as unknown[]
    expect(rows).toEqual([])
    noTransport.unstub()
  })

  it('bug 图标件：发布面 ForgeBugGlyph 递达 → 候选行 icon = 发布件；发布面缺席 → 行零 icon 键（官方 icon set 无 bug 几何——自带 IconProps 组件居壳 bundle）', async () => {
    const withGlyph = appliedBugSource({
      'forge:projects/list': () => ({ ok: true, data: [{ id: 'p1', workspaceId: 'w1' }] }),
      'forge:bugs/list': () => ({ ok: true, data: BUG_FIXTURE_BUGS }),
    })
    await bugFlush()
    const withGlyphRows = (await (withGlyph.source['candidates'] as (session: unknown, req: { query: string; position: 'inline'; drilled: boolean; signal: AbortSignal }) => Promise<{ name: string; icon?: unknown }[]>)(
      { sessionId: 's1' },
      { query: '', position: 'inline', drilled: false, signal: BUG_SIGNAL },
    )) as { name: string; icon?: unknown }[]
    expect(withGlyphRows).toHaveLength(2)
    expect(withGlyphRows.every((r) => r.icon === 'COMP:bug-glyph')).toBe(true)
    withGlyph.unstub()
    // 发布面缺席（形状漂移/旧壳）= 行零 icon 键——菜单无图标呈现，不炸
    const noGlyph = appliedBugSource({
      'forge:projects/list': () => ({ ok: true, data: [{ id: 'p1', workspaceId: 'w1' }] }),
      'forge:bugs/list': () => ({ ok: true, data: BUG_FIXTURE_BUGS }),
    }, { omitGlyph: true })
    await bugFlush()
    const noGlyphRows = (await (noGlyph.source['candidates'] as (session: unknown, req: { query: string; position: 'inline'; drilled: boolean; signal: AbortSignal }) => Promise<{ name: string; icon?: unknown }[]>)(
      { sessionId: 's1' },
      { query: '', position: 'inline', drilled: false, signal: BUG_SIGNAL },
    )) as { name: string; icon?: unknown }[]
    expect(noGlyphRows.every((r) => !('icon' in r))).toBe(true)
    noGlyph.unstub()
  })

  it('warm：scope 出生预热——projects.list 先落缓存随后 bugs.list 预取（fire-and-forget，锚定项目口径）', async () => {
    const { source, calls, unstub } = appliedBugSource({
      'forge:projects/list': () => ({ ok: true, data: [{ id: 'p9', workspaceId: 'w9' }] }),
      'forge:bugs/list': () => ({ ok: true, data: [] }),
    })
    const warmSource = source as unknown as { warm?: (session: { sessionId: string }) => void }
    expect(typeof warmSource.warm).toBe('function')
    warmSource.warm!({ sessionId: 's9' })
    await bugFlush()
    expect(
      calls.some((c) => c.channel === 'forge:bugs/list' && JSON.stringify(c.payload) === JSON.stringify({ projectId: 'p9' })),
      'warm 预取：projects 缓存就绪后一次 bugs.list（锚定项目口径）',
    ).toBe(true)
    unstub()
  })

  it('openReference（1.3）：bug ref → sidebarRight.openResource 开 Bug 台账 pane（地址 = 会话锚项目 + bugId，kind dswf-bug）→ true；非 bug 引用 → false 零路由；官方面抛错 → false', async () => {
    const views = publishFakeViews()
    const fixture = bugFixture({
      'forge:projects/list': () => ({ ok: true, data: [{ id: 'p1', workspaceId: 'w1' }] }),
      'forge:bugs/list': () => ({ ok: true, data: BUG_FIXTURE_BUGS }),
    })
    const { ctx, openResource } = fakeClientCtx(fixture.reflect)
    ;(ctx.get('workspaces') as { list: unknown }).list = {
      getSnapshot: () => ({ items: [{ workspaceId: 'w1', sessionIds: ['s1'] }] }),
    }
    forgeClientPlugin().apply(ctx)
    await bugFlush() // 注册期 warm 落 projects 缓存（openReference 会话锚解析前提）
    const src = fixture.registered[0] as Record<string, unknown>
    const openRef = src['openReference'] as (session: { sessionId: string }, ref: { ref: string }) => boolean
    expect(typeof openRef).toBe('function')
    // ① bug ref：会话锚解析项目 → openResource（地址 = 去重键，kind 具名）
    expect(openRef({ sessionId: 's1' }, { ref: 'bug:b-42' })).toBe(true)
    expect(openResource).toHaveBeenCalledTimes(1)
    expect(openResource).toHaveBeenCalledWith('dsh-resource://dswf-bug/p1/b-42', { kind: BUG_TAB_KIND })
    // ② 非 bug 引用（官方文件/会话组 ref 误路由）→ false：官方手势不被拦截
    expect(openRef({ sessionId: 's1' }, { ref: 'file:src/a.ts' })).toBe(false)
    expect(openRef({ sessionId: 's1' }, { ref: '' })).toBe(false)
    expect(openResource).toHaveBeenCalledTimes(1)
    // ③ 官方面异常（无在场面抛错）→ false fail-soft 不外溢
    openResource.mockImplementationOnce(() => {
      throw new Error('no active pane')
    })
    expect(openRef({ sessionId: 's1' }, { ref: 'bug:b-42' })).toBe(false)
    void views
    fixture.unstub()
  })
})

// ─────────── Bug 快速路径（composer-bug-reference 1.4） ───────────

describe('activeSessionIdOf（官方快照形状——retainedBy.mainView 锚，bug 15faa6f0 修正）', () => {
  /** 官方 SessionListState 真形：ids/byId/phase/projectionsBySession——无 current 字段 */
  function ledger(rows: Record<string, unknown>): unknown {
    return {
      getSnapshot: () => ({
        ids: Object.keys(rows),
        byId: rows,
        phase: 'ready',
        projectionsBySession: {},
      }),
    }
  }
  const row = (mainView: number): { id: string; retainedBy: { mainView: number } } => ({
    id: 'x',
    retainedBy: { mainView },
  })

  it('mainView 在留行命中（官方 publishMain 同径）：首个 retainedBy.mainView>0 行的 id', () => {
    const sLive = { ...row(1), id: 's-live' }
    const sBg = { ...row(0), id: 's-bg' }
    expect(activeSessionIdOf(ledger({ 's-bg': sBg, 's-live': sLive }))).toBe('s-live')
  })

  it('无 mainView 在留行 / 空账本 = undefined（走开新会话兜底）', () => {
    expect(activeSessionIdOf(ledger({ 's-a': { ...row(0), id: 's-a' } }))).toBeUndefined()
    expect(activeSessionIdOf(ledger({}))).toBeUndefined()
  })

  it('快照缺席/形状漂移/读取抛错 = undefined', () => {
    expect(activeSessionIdOf(undefined)).toBeUndefined()
    expect(activeSessionIdOf({ getSnapshot: () => null })).toBeUndefined()
    expect(activeSessionIdOf({ getSnapshot: () => ({ ids: [], byId: 'drift' }) })).toBeUndefined()
    expect(
      activeSessionIdOf({
        getSnapshot: () => {
          throw new Error('drift')
        },
      }),
    ).toBeUndefined()
  })

  it('行 id 非串/空串或 mainView 非数 = 跳过不命中（防御漂移行）', () => {
    expect(activeSessionIdOf(ledger({ a: { retainedBy: { mainView: 2 } } }))).toBeUndefined()
    expect(activeSessionIdOf(ledger({ a: { id: '', retainedBy: { mainView: 2 } } }))).toBeUndefined()
    expect(activeSessionIdOf(ledger({ a: { id: 's-x', retainedBy: { mainView: '2' } } }))).toBeUndefined()
  })
})

describe('buildBugQuickAdder（1.4——有活跃会话 scoped 插入 / 无活跃会话开新会话预填）', () => {
  const BUG = { bugId: 'b-42', summary: '修复双开对话框' }
  const CLIP = '@[修复双开对话框](bug:b-42)'

  function fixture(options?: { active?: string; bailResult?: unknown; faceState?: { draft: string; draftRev: number }; noteInserted?: (bug: unknown) => void }) {
    const face = {
      focus: vi.fn(),
      ...(options?.faceState !== undefined ? { state: { getSnapshot: () => options.faceState! } } : {}),
    }
    const actx = {
      bail: vi.fn(() => (options !== undefined && 'bailResult' in options ? options.bailResult : true)),
    }
    const clientCtx = {
      reflect: {
        get: (name: string) => (name === 'conversation' ? { input: { for: () => face } } : undefined),
      },
    } as unknown as ForgeClientCtx
    const rows: Record<string, unknown> = options?.active !== undefined
      ? { [options.active]: { id: options.active, retainedBy: { mainView: 1 } }, 's-other': { id: 's-other', retainedBy: {} } }
      : { 's-other': { id: 's-other', retainedBy: {} } }
    const sessions = {
      list: { getSnapshot: () => ({ ids: Object.keys(rows), byId: rows, phase: 'ready', projectionsBySession: {} }) },
      binding: (sessionId: string) => (sessionId === options?.active ? { ctx: actx } : undefined),
    }
    const openSessionWithPreset = vi.fn(() =>
      Promise.resolve({ ok: true as const, sessionId: 's-new', presetApplied: false, sent: false }),
    )
    const orchestrator = { openSessionWithPreset, openExistingSession: vi.fn() }
    return { addBugToSession: buildBugQuickAdder(clientCtx, sessions as never, orchestrator as never, options?.noteInserted as never), bail: actx.bail, face, openSessionWithPreset }
  }

  it('有活跃会话 + bail true：scoped 事件收 T1 同构 reference + 末尾 span-CAS，聚焦 composer，不走编排器', async () => {
    const f = fixture({ active: 's-live', faceState: { draft: '/fix-bug ', draftRev: 5 } })
    await f.addBugToSession(BUG, 'ws-1')
    expect(f.bail).toHaveBeenCalledWith(
      expect.objectContaining({ bail: f.bail }),
      'slash/input-insert-reference',
      {
        reference: { source: FORGE_BUG_SOURCE_NAME, ref: 'bug:b-42', label: BUG.summary, clipboardText: CLIP },
        span: { start: 9, end: 9, draftRev: 5 },
      },
    )
    expect(f.face.focus).toHaveBeenCalledTimes(1)
    expect(f.openSessionWithPreset).not.toHaveBeenCalled()
  })

  it('无活跃会话：既有 open-session 编排器开新会话，首条草稿预填引用剪贴板投影', async () => {
    const f = fixture()
    await f.addBugToSession(BUG, 'ws-1')
    expect(f.openSessionWithPreset).toHaveBeenCalledWith({ workspaceId: 'ws-1', prefill: CLIP })
    expect(f.bail).not.toHaveBeenCalled()
  })

  it('插入未获应用（bail 拒）→ 兜底开新会话预填（韧性同 open-session 兜底裁决刻度）', async () => {
    const f = fixture({ active: 's-live', faceState: { draft: 'x', draftRev: 1 }, bailResult: undefined })
    await f.addBugToSession(BUG, 'ws-1')
    expect(f.openSessionWithPreset).toHaveBeenCalledWith({ workspaceId: 'ws-1', prefill: CLIP })
  })

  it('noteInserted（bug 27ab222b）：按钮径插入时以完整入参落快照（dock 递达 BugCard 全字段透传）', async () => {
    const noteInserted = vi.fn()
    const f = fixture({ active: 's-live', faceState: { draft: '', draftRev: 1 }, noteInserted })
    const fullCard = {
      ...BUG,
      bugDesc: '完整描述',
      triggerDesc: '步骤',
      expected: '期望',
      actual: '实际',
      bugStatus: 'open',
      reporter: 'faner',
      createdAt: '',
      updatedAt: '',
    }
    await f.addBugToSession(fullCard, 'ws-1')
    expect(noteInserted).toHaveBeenCalledWith(fullCard)
  })

  it('无活跃会话且 workspaceId 缺席（null = 无锚）：fail-soft no-op 不外溢', async () => {
    const f = fixture()
    await f.addBugToSession(BUG, null)
    expect(f.openSessionWithPreset).not.toHaveBeenCalled()
    expect(f.bail).not.toHaveBeenCalled()
  })
})

// ============================================================================
// W3 sessions.create wrap（体验层主径——资格门矩阵 + fail-open 出口 + dispose 恢复）。
// 三铁律钉：内部零触碰（只有整调用改道/透传）、判定逐次独立（项目行逐次现查零缓存）、
// fail-open 透传（original 永不落改道 try 域——官方自身错误原样上抛不吞不重调）。
// ============================================================================
describe('installSessionCreateWrap（W3：sessions.create 资格门分流 + fail-open）', () => {
  const WS = 'ws-git'
  const WS_PATH = 'C:/repo'

  /** 项目行 fixture（ProjectSummary 消费切片：id/workspaceId/wsPath/archived） */
  function rowsFixture(rows: Array<{ workspaceId?: string; wsPath?: string; archived?: boolean }>): unknown[] {
    return rows.map((row, i) => ({
      id: `p-${i}`,
      workspaceId: row.workspaceId ?? 'ws-other',
      name: `n-${i}`,
      wsPath: row.wsPath ?? 'C:/elsewhere',
      archived: row.archived ?? false,
    }))
  }

  /** wrap 装配 harness：官方 create spy + 项目行现查 spy + sessionCreate RPC spy */
  function fixture(options?: {
    rows?: unknown[] | (() => unknown[] | Promise<unknown[]>) | Error
    sessionCreate?: (tree: string) => Promise<string>
    create?: (opts?: { sessionId?: string; workspaceId?: string; cwd?: string }) => Promise<string>
  }) {
    const original = options?.create ?? vi.fn(() => Promise.resolve('X-official'))
    const sessions = { create: original } as { create: unknown }
    const projectRows = vi.fn(() => {
      if (options?.rows instanceof Error) return Promise.reject(options.rows)
      const value = typeof options?.rows === 'function' ? options.rows() : (options?.rows ?? [])
      return Promise.resolve(value)
    })
    const sessionCreate = options?.sessionCreate ?? vi.fn(() => Promise.resolve('Y-precast'))
    const deps: SessionCreateWrapDeps = {
      sessionCreate: sessionCreate as (tree: string) => Promise<string>,
      projectRows: projectRows as unknown as SessionCreateWrapDeps['projectRows'],
      warn: vi.fn(),
    }
    const dispose = installSessionCreateWrap(
      sessions as unknown as Parameters<typeof installSessionCreateWrap>[0],
      deps,
    )
    return {
      sessions: sessions as { create: (opts?: Record<string, string>) => Promise<string> },
      original: original as ReturnType<typeof vi.fn>,
      projectRows,
      sessionCreate,
      deps,
      dispose,
    }
  }

  it('① adopt 径直通：带 sessionId = 官方复用采纳，零判定零改道（original 透传、零 RPC）', async () => {
    const f = fixture({ rows: rowsFixture([{ workspaceId: WS, wsPath: WS_PATH }]) })
    const out = await f.sessions.create({ sessionId: 's-adopt', workspaceId: WS })
    expect(out).toBe('X-official')
    expect(f.original).toHaveBeenCalledTimes(1)
    expect(f.projectRows).not.toHaveBeenCalled()
    expect(f.sessionCreate).not.toHaveBeenCalled()
  })

  it('② 资格门命中（workspaceId → 注册项目 ws_path）：改道预铸返回 Y，官方 create 零调用', async () => {
    const f = fixture({ rows: rowsFixture([{ workspaceId: WS, wsPath: WS_PATH }]) })
    const out = await f.sessions.create({ workspaceId: WS })
    expect(out).toBe('Y-precast')
    expect(f.sessionCreate).toHaveBeenCalledTimes(1)
    expect(f.sessionCreate).toHaveBeenCalledWith(WS_PATH)
    expect(f.original).not.toHaveBeenCalled()
  })

  it('② 资格门命中（cwd 命中注册行 ws_path）：改道预铸（跨源反斜杠/大小写归一命中）', async () => {
    const f = fixture({ rows: rowsFixture([{ workspaceId: WS, wsPath: 'C:\\Repo\\' }]) })
    const out = await f.sessions.create({ cwd: 'c:/repo' })
    expect(out).toBe('Y-precast')
    expect(f.sessionCreate).toHaveBeenCalledWith('c:/repo')
    expect(f.original).not.toHaveBeenCalled()
  })

  it('② 资格门不命中矩阵：未注册 workspaceId / 归档行 / cwd 未注册 / 双缺（零参）→ 官方原流零介入', async () => {
    const rows = rowsFixture([
      { workspaceId: WS, wsPath: WS_PATH },
      { workspaceId: 'ws-arch', wsPath: 'C:/arch', archived: true },
    ])
    for (const opts of [
      { workspaceId: 'ws-unknown' },
      { workspaceId: 'ws-arch' },
      { cwd: 'C:/not-registered' },
      {},
      undefined,
    ]) {
      const f = fixture({ rows })
      const out = await f.sessions.create(opts as Record<string, string> | undefined)
      expect(out).toBe('X-official')
      expect(f.sessionCreate).not.toHaveBeenCalled()
      expect(f.original).toHaveBeenCalledTimes(1)
    }
  })

  it('② 判定逐次独立（零缓存）：两次创建各现查项目行恰一次（首次未注册原流、次次注册改道）', async () => {
    let call = 0
    const f = fixture({
      rows: () => {
        call += 1
        return call === 1 ? [] : rowsFixture([{ workspaceId: WS, wsPath: WS_PATH }])
      },
    })
    await f.sessions.create({ workspaceId: WS })
    expect(f.original).toHaveBeenCalledTimes(1)
    expect(f.sessionCreate).not.toHaveBeenCalled()
    await f.sessions.create({ workspaceId: WS })
    expect(f.sessionCreate).toHaveBeenCalledTimes(1)
    expect(f.projectRows).toHaveBeenCalledTimes(2)
  })

  it('④ typed 拒绝码 ERR_WORKTREE_CAPABILITY_ABSENT：单独放行拒绝呈现——不 fail-open、不回 official、零 warn（W2 fail-closed）', async () => {
    const typed = Object.assign(new Error('git 绑定能力缺席（W2 fail-closed 显式拒绝）'), {
      name: 'RpcClientError',
      code: 'ERR_WORKTREE_CAPABILITY_ABSENT',
    })
    const f = fixture({
      rows: rowsFixture([{ workspaceId: WS, wsPath: WS_PATH }]),
      sessionCreate: () => Promise.reject(typed),
    })
    await expect(f.sessions.create({ workspaceId: WS })).rejects.toBe(typed)
    expect(f.original).not.toHaveBeenCalled() // 确定性拒绝不透传 original（不落主树）
    expect(f.deps.warn).not.toHaveBeenCalled()
  })

  it('④ 瞬态异常维持 fail-open：typed 判定只放行能力缺席码——其余 code / 普通异常照常透传官方原流', async () => {
    for (const cause of [
      Object.assign(new Error('其他 typed 拒绝'), { name: 'RpcClientError', code: 'ERR_TASK_NOT_FOUND' }),
      new Error('host 判非 git'),
      '非 Error 异常值',
    ] as const) {
      const f = fixture({
        rows: rowsFixture([{ workspaceId: WS, wsPath: WS_PATH }]),
        sessionCreate: () => Promise.reject(cause),
      })
      const out = await f.sessions.create({ workspaceId: WS })
      expect(out).toBe('X-official')
      expect(f.original).toHaveBeenCalledTimes(1)
      expect(f.deps.warn).toHaveBeenCalled()
    }
  })

  it('unwrapRpcEnvelope typed !ok 信封：RpcClientError 形态保真（code/message/data 透传——typed 拒绝码可达 wrap ④ 判定点）', async () => {
    const fail = Promise.resolve({
      ok: false,
      error: { code: 'ERR_WORKTREE_CAPABILITY_ABSENT', message: 'git 绑定能力缺席', data: { k: 1 } },
    })
    const caught = await unwrapRpcEnvelope(fail).then(
      () => null,
      (e: unknown) => e,
    )
    expect(caught).toBeInstanceOf(Error)
    const typed = caught as Error & { code?: unknown; data?: unknown }
    expect(typed.name).toBe('RpcClientError')
    expect(typed.code).toBe('ERR_WORKTREE_CAPABILITY_ABSENT')
    expect(typed.message).toBe('git 绑定能力缺席')
    expect(typed.data).toEqual({ k: 1 })
  })

  it('④ fail-open（RPC 拒/产物缺 sessionId/项目行现查异常）：全部回退官方原流 + warn 一行', async () => {
    for (const overrides of [
      { sessionCreate: () => Promise.reject(new Error('host 判非 git')) },
      { sessionCreate: () => Promise.resolve(undefined as unknown as string) },
    ] as const) {
      const f = fixture({ rows: rowsFixture([{ workspaceId: WS, wsPath: WS_PATH }]), ...overrides })
      const out = await f.sessions.create({ workspaceId: WS })
      expect(out).toBe('X-official')
      expect(f.original).toHaveBeenCalledTimes(1)
      expect(f.deps.warn).toHaveBeenCalled()
    }
    // 项目行现查异常（列表 RPC 失败）→ fail-open 透传（② 出口）
    const f = fixture({ rows: new Error('list 拉取失败') })
    const out = await f.sessions.create({ workspaceId: WS })
    expect(out).toBe('X-official')
    expect(f.original).toHaveBeenCalledTimes(1)
    expect(f.sessionCreate).not.toHaveBeenCalled()
  })

  it('三铁律①②：original 永不落改道 try 域——官方自身抛错原样上抛（不吞、不双调）', async () => {
    const boom = new Error('官方 create 自身错误')
    const f = fixture({
      rows: rowsFixture([{ workspaceId: WS, wsPath: WS_PATH }]),
      create: vi.fn(() => Promise.reject(boom)),
      sessionCreate: vi.fn(() => Promise.reject(new Error('host 判非 git'))),
    })
    await expect(f.sessions.create({ sessionId: 's-adopt' })).rejects.toBe(boom)
    await expect(f.sessions.create({ workspaceId: 'ws-unknown' })).rejects.toBe(boom)
    await expect(f.sessions.create({ workspaceId: WS })).rejects.toBe(boom) // 改道径异常回退 → original 错误上抛
    expect(f.original).toHaveBeenCalledTimes(3) // 每次恰一调（无 catch 吞后重调）
  })

  it('dispose 恢复原方法（host interceptRequiredBinding 同配方）且幂等；缺席 create 面 = no-op 安装', async () => {
    const f = fixture()
    f.dispose()
    f.dispose()
    expect(f.sessions.create).toBe(f.original)
    // 缺席 create 面（上游面漂移）= 零安装零抛
    const bare = {} as Parameters<typeof installSessionCreateWrap>[0]
    expect(() => installSessionCreateWrap(bare, f.deps)).not.toThrow()
  })

  it('SESSION_CREATE_CHANNEL 通道字面量同源（contracts WORKTREE_CHANNELS.sessionCreate 镜像）', () => {
    expect(SESSION_CREATE_CHANNEL).toBe('forge:worktree/session-create')
  })

  it('treeOf 纯函数矩阵（行正规化：非对象/缺键剔除；archived 排除）', async () => {
    const rows = [
      null,
      42,
      { workspaceId: WS }, // 缺 wsPath
      { wsPath: WS_PATH }, // 缺 workspaceId
      { workspaceId: WS, wsPath: WS_PATH, archived: true },
      { workspaceId: WS, wsPath: WS_PATH },
    ]
    expect(await treeOf({ workspaceId: WS }, rows)).toBe(WS_PATH)
    expect(await treeOf({ workspaceId: WS }, [])).toBeNull()
    expect(await treeOf(undefined, rows)).toBeNull()
    expect(await treeOf({ sessionId: 's' }, rows)).toBeNull()
  })

  // 移动端语义契约钉（mobile-ui 一致逻辑——提案 §移动端一致逻辑：判定单源在 host，
  // 两端共享的只有语义契约与 API 协议，非代码共享）。钉双语义：
  //   ① 预铸优先：命中资格即首选 forge:worktree/session-create 预铸（worktreePath 显式树）；
  //   ② fail-open 回退：预铸链任何失败 → 回退官方原流（桌面 = original，移动端 = 官方
  //      /api/rpc session.create——同④出口语义）；无绑定产物由 host guard 首条消息兜底。
  // 本用例即共享契约的断言单源：mobile-ui 侧契约测试须钉同两条（通道字面量
  // forge:worktree/session-create + 失败回退），实现归 mobile-ui 工程。
  it('移动端 hero 预铸优先 + fail-open 回退——语义契约钉（与桌面 wrap ④ 出口同语义）', async () => {
    // ① 预铸优先：资格命中 = sessionCreate 恰一调先行，官方原流零调用
    const prefer = fixture({ rows: rowsFixture([{ workspaceId: WS, wsPath: WS_PATH }]) })
    expect(await prefer.sessions.create({ workspaceId: WS })).toBe('Y-precast')
    expect(prefer.sessionCreate).toHaveBeenCalledTimes(1)
    expect(prefer.sessionCreate).toHaveBeenCalledWith(WS_PATH)
    expect(prefer.original).not.toHaveBeenCalled()
    // ② fail-open 回退：预铸失败 = 官方原流（回退语义与④出口同源）
    const rejectSessionCreate = vi.fn((_tree: string) => Promise.reject(new Error('预铸失败')))
    const fallback = fixture({
      rows: rowsFixture([{ workspaceId: WS, wsPath: WS_PATH }]),
      sessionCreate: rejectSessionCreate,
    })
    expect(await fallback.sessions.create({ workspaceId: WS })).toBe('X-official')
    expect(fallback.original).toHaveBeenCalledTimes(1)
    // 协议钉：改道载荷 = {worktreePath: 显式树}（移动端透传同协议）；通道字面量上方已钉
    expect(rejectSessionCreate.mock.calls[0]![0]!).toBe(WS_PATH)
  })
})

// ── W4 装载自证 + 行存续看门（session-binding-guarantee §W4）──────────────────────────
describe('W4 激活自证（RPC 轻探 + wrap 换芯证据）+ 看门探测面', () => {
  const g = () =>
    globalThis as {
      dshForge?: unknown
      __DSH_FORGE_CLIENT__?: unknown
      __DSH_FORGE_HEALTH__?: { slotCount: () => number; check: () => void }
      __DSH_FORGE_PRUNE_CHECK__?: unknown
    }
  const WORKTREE_LIST_CHANNEL = 'forge:worktree/list'

  afterEach(() => {
    delete g().dshForge
    delete g().__DSH_FORGE_HEALTH__
    delete g().__DSH_FORGE_PRUNE_CHECK__
  })

  function fakeInvoke(): ReturnType<typeof vi.fn> {
    const invoke = vi.fn((channel: string) => {
      if (channel === WORKTREE_LIST_CHANNEL) {
        return Promise.resolve({ ok: true, data: { isGit: false, entries: [] } })
      }
      return Promise.resolve({ ok: true, data: [] }) // forge:projects/list 等读面
    })
    g().dshForge = { invoke }
    return invoke
  }

  function augmentCtx(ctx: ForgeClientCtx): {
    listeners: Array<(name: string, value: unknown) => void>
    slotsEntries: Map<string, readonly unknown[]>
  } {
    const listeners: Array<(name: string, value: unknown) => void> = []
    const slotsEntries = new Map<string, readonly unknown[]>([
      [SHELL_OVERLAY_SLOT, ['entry-1']],
      [MAIN_SLOT, ['entry-2', 'entry-3']],
    ])
    ;(ctx as unknown as { on: unknown }).on = (name: string, cb: (n: string, v: unknown) => void) => {
      listeners.push(cb)
      return () => {}
    }
    ;(ctx.slots as { entries?: (key: string) => readonly unknown[] }).entries = (key: string) =>
      slotsEntries.get(key) ?? []
    return { listeners, slotsEntries }
  }

  it('零传输（非 Electron 载体）：自证缺席面呈现（不 fail）+ 看门探测面发布 + overlay dispose 对称清收', () => {
    const markerBefore = g().__DSH_FORGE_CLIENT__
    delete g().__DSH_FORGE_CLIENT__
    publishFakeViews()
    const { ctx, injectDisposers } = fakeClientCtx()
    const { listeners } = augmentCtx(ctx)
    forgeClientPlugin().apply(ctx)
    const marker = g().__DSH_FORGE_CLIENT__ as { selfCheck?: { wrap?: string; rpcProbe?: string } }
    expect(marker?.selfCheck?.wrap).toBe('absent（非 Electron 载体零安装）')
    expect(marker?.selfCheck?.rpcProbe).toBe('absent（非 Electron 载体）')
    // 看门探测面：entries 求和（shell.overlay 1 + main 2 = 3）+ 事件转发钩接线
    const health = g().__DSH_FORGE_HEALTH__
    expect(health?.slotCount()).toBe(3)
    expect(listeners).toHaveLength(1)
    // overlay dispose = 卸载级联回收面：探测面对称清收
    injectDisposers.get(SHELL_OVERLAY_SLOT)?.()
    expect(g().__DSH_FORGE_HEALTH__).toBeUndefined()
    // 恢复外层标记
    if (markerBefore === undefined) delete g().__DSH_FORGE_CLIENT__
    else g().__DSH_FORGE_CLIENT__ = markerBefore
    unpublishViews()
  })

  it('传输在场：wrap 换芯证据 verified（sessions.create 已换）+ RPC 轻探 ok', async () => {
    const markerBefore = g().__DSH_FORGE_CLIENT__
    delete g().__DSH_FORGE_CLIENT__
    publishFakeViews()
    const invoke = fakeInvoke()
    const { ctx } = fakeClientCtx()
    augmentCtx(ctx)
    const sessions = ctx.get('sessions') as { create?: unknown }
    const original = (): Promise<string> => Promise.resolve('X-official')
    sessions.create = original
    forgeClientPlugin().apply(ctx)
    const marker = g().__DSH_FORGE_CLIENT__ as { selfCheck?: { wrap?: string; rpcProbe?: string } }
    expect(marker?.selfCheck?.wrap).toBe('verified')
    expect(sessions.create).not.toBe(original) // 换芯读回（host verifySendGuardInstalled 同判）
    expect(invoke).toHaveBeenCalledWith(WORKTREE_LIST_CHANNEL, { projectRoot: '' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(marker?.selfCheck?.rpcProbe).toBe('ok')
    if (markerBefore === undefined) delete g().__DSH_FORGE_CLIENT__
    else g().__DSH_FORGE_CLIENT__ = markerBefore
    unpublishViews()
  })

  it('wrap 未换芯 = fail-loud：console.error + selfCheck 失败因 + apply catch 全族 error UI 态（回滚）', () => {
    const markerBefore = g().__DSH_FORGE_CLIENT__
    delete g().__DSH_FORGE_CLIENT__
    publishFakeViews()
    fakeInvoke()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { ctx } = fakeClientCtx()
      augmentCtx(ctx)
      // sessions.create 装配前在场但写不进（getter 替身——属性替换被吞）→ 读回 = 原引用
      // = 未换芯（installSessionCreateWrap 写面失效的替身建模）
      const sessions = ctx.get('sessions') as Record<string, unknown>
      const original = (): Promise<string> => Promise.resolve('X-official')
      Object.defineProperty(sessions, 'create', { get: () => original, set: () => {}, configurable: true })
      forgeClientPlugin().apply(ctx)
      const marker = g().__DSH_FORGE_CLIENT__ as {
        selfCheck?: { wrap?: string }
        sidebar?: { error?: string }
      }
      expect(marker?.selfCheck?.wrap).toContain('未换芯')
      expect(marker?.sidebar?.error).toContain('未换芯') // apply catch 全族 error = UI 态
      expect(err.mock.calls.some((call) => String(call[0]).includes('未换芯'))).toBe(true)
    } finally {
      err.mockRestore()
      if (markerBefore === undefined) delete g().__DSH_FORGE_CLIENT__
      else g().__DSH_FORGE_CLIENT__ = markerBefore
      unpublishViews()
    }
  })

  it('RPC 轻探不通 = fail-loud 呈现：selfCheck.rpcProbe 失败因 + console.error（不阻断激活主链）', async () => {
    const markerBefore = g().__DSH_FORGE_CLIENT__
    delete g().__DSH_FORGE_CLIENT__
    publishFakeViews()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const invoke = vi.fn((channel: string) =>
        channel === WORKTREE_LIST_CHANNEL
          ? Promise.reject(new Error('IPC 链断裂'))
          : Promise.resolve({ ok: true, data: [] }),
      )
      g().dshForge = { invoke }
      const { ctx } = fakeClientCtx()
      augmentCtx(ctx)
      const sessions = ctx.get('sessions') as { create?: unknown }
      sessions.create = (): Promise<string> => Promise.resolve('X')
      forgeClientPlugin().apply(ctx)
      await new Promise((resolve) => setTimeout(resolve, 0))
      const marker = g().__DSH_FORGE_CLIENT__ as { selfCheck?: { rpcProbe?: string; wrap?: string } }
      expect(marker?.selfCheck?.wrap).toBe('verified') // 主链不受累
      expect(marker?.selfCheck?.rpcProbe).toContain('轻探不通')
      expect(err.mock.calls.some((call) => String(call[0]).includes('轻探不通'))).toBe(true)
    } finally {
      err.mockRestore()
      if (markerBefore === undefined) delete g().__DSH_FORGE_CLIENT__
      else g().__DSH_FORGE_CLIENT__ = markerBefore
      unpublishViews()
    }
  })

  it('internal/service 事件（sessions 注销 = prune 官方信号）转发看门核查钩；他服务/在场值不转发', () => {
    const markerBefore = g().__DSH_FORGE_CLIENT__
    delete g().__DSH_FORGE_CLIENT__
    publishFakeViews()
    const { ctx } = fakeClientCtx()
    const { listeners } = augmentCtx(ctx)
    forgeClientPlugin().apply(ctx)
    const hook = vi.fn()
    g().__DSH_FORGE_PRUNE_CHECK__ = hook
    const health = g().__DSH_FORGE_HEALTH__!
    const emit = listeners[0]!
    emit('other', undefined)
    emit('sessions', { alive: true })
    expect(hook).not.toHaveBeenCalled()
    emit('sessions', undefined) // 官方注销信号（reflect.notify value undefined）
    expect(hook).toHaveBeenCalledTimes(1)
    health.check() // 事件转发入口 = 探测面 check
    expect(hook).toHaveBeenCalledTimes(2)
    if (markerBefore === undefined) delete g().__DSH_FORGE_CLIENT__
    else g().__DSH_FORGE_CLIENT__ = markerBefore
    unpublishViews()
  })
})
