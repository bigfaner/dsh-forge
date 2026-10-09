// client-plugin 单测 —— 产品 client 插件形状 + 槽位路线 A 注册面（2.7 AC1）+
// 官方基座降位登记族（fix-25：main 面板 roster + conversation.view 页签 roster +
// sidebar.panellist 行 + shell.overlay 常驻壳宿主）。
// 装载/激活链（掌舵 → 注册 → 物化 → Loader 激活）由 e2e（web-shell.spec / workbench-sc1.spec）自证；
// id 同源 pin（main.ts 字面量 ↔ 常量）在 tests/structure/web-shell.test.ts（node 面测试）。
// 洞名/影子优先级/注入面 = G1 契约面清单第 3 项（S2 残留 #1——2.7 清点入池）的常量 pin；
// 面板 key 字面量同源 pin = workbench/panel-model.ts（plugin 侧常量 ↔ 壳侧常量，不经
// import 共享——bundle 自含纪律，main.ts id 同源同形制）。
import { describe, expect, it, vi } from 'vitest'
import {
  CONVERSATION_VIEW_SLOT,
  DOC_ADDRESS_PREFIX,
  DOC_TAB_KIND,
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
  SETTINGS_SECTION_SLOT,
  FORGE_SETTINGS_SECTION_ID,
  FORGE_SETTINGS_SECTION_ORDER,
  SHELL_OVERLAY_SLOT,
  SIDEBAR_BRAND_MARK_SLOT,
  SIDEBAR_BRAND_NAME_SLOT,
  SIDEBAR_PANELLIST_SLOT,
  SIDEBAR_RIGHT_PANE_TAB_SLOT,
  SIDEBAR_SHADOW_PRIORITY,
  SIDEBAR_WORKSPACES_SLOT,
  sessionParentIdOf,
  workerOpenTarget,
  forgeClientPlugin,
  moduleLoaderFacade,
  publishedViews,
  registerForgeClient,
  type ForgeClientCtx,
  type ForgeLocaleService,
  type ForgeSidebarRightTabsService,
  type ForgeSlotsService,
} from './plugin.js'
import { HERO_PANEL_KEY as SHELL_HERO_KEY, KNOWLEDGE_PANEL_KEY as SHELL_KNOWLEDGE_KEY } from '../workbench/panel-model.js'
import {
  DSWF_DOC_ADDRESS_PREFIX as DOCK_DOC_PREFIX,
  DSWF_DOC_TAB_KIND as DOCK_DOC_KIND,
  DSWF_OVERVIEW_TAB_KIND as DOCK_OVERVIEW_KIND,
  forgeDocAddress,
  parseForgeDocAddress,
} from '../workbench/dock-tabs.js'
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

/** 假 ctx：slots 收集 inject/register，八服务经 get 递达 */
function fakeClientCtx(): {
  ctx: ForgeClientCtx
  registers: RegisterCall[]
  injectedKeys: string[]
  injectDisposers: Map<string, () => void>
  open: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  rightToggle: ReturnType<typeof vi.fn>
  openTab: ReturnType<typeof vi.fn>
  selectPanel: ReturnType<typeof vi.fn>
  locale: ReturnType<typeof fakeLocale>
  tabTypes: ReturnType<typeof fakeSidebarRightTabs>
  /** 账本 byId 注入面（m3.1 D6 worker ⟞ parentId 判读测试） */
  sessionsById: Record<string, { parentId?: string }>
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
  // m3.1 D6：账本快照可注入 byId（worker ⟞ 开面的 parentId 判读测试面——缺省空账本 = 平开径）
  const sessionsById: Record<string, { parentId?: string }> = {}
  const sessions = {
    list: {
      tag: 'sessions-list',
      getSnapshot: () => ({ byId: sessionsById }),
    },
  }
  const uiWorkspace = { openSession: open, startSession: start }
  const workspaces = { list: { tag: 'workspaces-list' } }
  // fix-23：官方右栏收展窄面（ISidebarRight 切片）；4.2 增 openTab 导航面（挂接 pill → dock 开概览）
  const sidebarRight = { isExpanded: () => false, toggleExpanded: rightToggle, openTab }
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
      throw new Error(`unexpected service: ${name}`)
    },
  }
  return { ctx, registers, injectedKeys, injectDisposers, open, start, rightToggle, openTab, selectPanel, locale, tabTypes, sessionsById }
}

/** 假产品视图发布面（fix-25 发布集 + 4.1 dock tab 两 body；m3.1 D5 会话头 pill 退役） */
function publishFakeViews() {
  const views = {
    ForgeSidebarSlot: 'COMP:sidebar-slot',
    ForgeBrandMark: 'COMP:brand-mark',
    ForgeBrandName: 'COMP:brand-name',
    ForgeShellHost: 'COMP:shell-host',
    ForgeHeroPanel: 'COMP:hero-panel',
    ForgeKnowledgePanel: 'COMP:knowledge-panel',
    ForgeKnowledgeGlyph: 'COMP:knowledge-glyph',
    ForgeRecallView: 'COMP:recall-view',
    ForgeOverviewTab: 'COMP:overview-tab',
    ForgeDocsTab: 'COMP:docs-tab',
    ForgeHeroWorkspacePicker: 'COMP:hero-picker',
    ForgeSettingsSection: 'COMP:settings-section',
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
      SIDEBAR_WORKSPACES_SLOT,
      SIDEBAR_BRAND_MARK_SLOT,
      SIDEBAR_BRAND_NAME_SLOT,
      MAIN_SLOT,
      MAIN_SLOT,
      SIDEBAR_PANELLIST_SLOT,
      CONVERSATION_VIEW_SLOT,
      HERO_WORKSPACE_SLOT,
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
    // 诊断面：三洞位落座 + 无错误（e2e 排障锚）
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { sidebar?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.sidebar?.registered).toEqual([SIDEBAR_WORKSPACES_SLOT, SIDEBAR_BRAND_MARK_SLOT, SIDEBAR_BRAND_NAME_SLOT])
    expect(marker?.sidebar?.error).toBeUndefined()
    unpublishViews()
  })

  it('注入面 = dsh 账本/归属快照源 + openSession + startSession（面板数据与动作的唯一通道；fix-11 打开经 uiWorkspace.openSession；fix-42 新会话经 uiWorkspace.startSession）', () => {
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
    expect(start).toHaveBeenCalledWith('w-1')
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
    expect(marker?.views?.registered).toEqual([CONVERSATION_VIEW_SLOT, HERO_WORKSPACE_SLOT]) // fix-24 ① 后 views 族含 hero 影子；m3.1 D5 会话头 pill 卸载
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
    expect(hero.options.inject).toBeUndefined() // owner share + root 标准 useWorkspaces 即全部输入
    expect(hero.options.id).toBeUndefined()
    expect(hero.options.key).toBeUndefined()
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { views?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.views?.registered).toEqual([CONVERSATION_VIEW_SLOT, HERO_WORKSPACE_SLOT])
    expect(marker?.views?.error).toBeUndefined()
    unpublishViews()
  })

  it('壳宿主：shell.overlay 登记 + 注入面 = 官方面板选择/右栏收展/桥（概览上下文写回缝——4.1）+ 弹窗三窄面（m3.1 D21/D23——跳会话/新会话编排/文档开出）+ 悬浮面板 ⟞ 开面（m3.1 D6）；桥经发布面工厂创建并发布页内全局', () => {
    const views = publishFakeViews()
    const { ctx, registers, selectPanel, rightToggle } = fakeClientCtx()
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
      openWorkerSession: (childSessionId: string) => void
    }
    // m3.1 D21/D23 弹窗宿主三窄面 + D6 悬浮面板 ⟞ 开面在场（ShellHost 消费）
    expect(Object.keys(face).sort()).toEqual(['bridge', 'onOpenSession', 'openDocResource', 'openSession', 'openWorkerSession', 'rightbar', 'selectPanel'])
    expect(typeof face.onOpenSession).toBe('function')
    expect(typeof face.openSession.openSessionWithPreset).toBe('function')
    expect(typeof face.openDocResource).toBe('function')
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
    expect(tabTypes.calls).toHaveLength(2)
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
    expect(bodies).toHaveLength(2)
    const overview = bodies.find((r) => r.options.key === OVERVIEW_TAB_KIND)!
    const doc = bodies.find((r) => r.options.key === DOC_TAB_KIND)!
    expect(overview.component).toBe(views.ForgeOverviewTab)
    expect(doc.component).toBe(views.ForgeDocsTab)
    const face = overview.options.inject!() as {
      bridge: unknown
      onOpenSession: (sessionId: string) => void
    }
    expect(face.bridge).toBe((globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__)
    face.onOpenSession('s-9')
    expect(open).toHaveBeenCalledWith('s-9')
    expect(doc.options.inject).toBeUndefined() // 文档 body 自足（useTabInfo 由 seat 声明递达）
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { dock?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.dock?.registered).toEqual([
      OVERVIEW_TAB_KIND,
      DOC_TAB_KIND,
      SIDEBAR_RIGHT_PANE_TAB_SLOT,
      SIDEBAR_RIGHT_PANE_TAB_SLOT,
    ])
    expect(marker?.dock?.error).toBeUndefined()
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
    unpublishViews()
  })

  it('类型注册撤销面：overlay 洞 dispose 即撤销两类型（fix-33 ⑥ 对称性——官方注册表 kind 不残留）', () => {
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    publishFakeViews()
    const { ctx, injectDisposers, tabTypes } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(tabTypes.disposedIds).toEqual([])
    injectDisposers.get(SHELL_OVERLAY_SLOT)!()
    expect([...tabTypes.disposedIds].sort()).toEqual([DOC_TAB_KIND, OVERVIEW_TAB_KIND])
    unpublishViews()
    if (marker === undefined) delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    else (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ = marker
  })
})

describe('会话头挂接槽卸载 + 悬浮面板 ⟞ 开面（m3.1 D5/D6）', () => {
  it('D5 卸载断言：conversation.session.header.actions 零产品登记（pill 退役——官方动作带占用者不受扰）+ 发布面零 pill 组件', () => {
    publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(
      registers.filter((r) => r.key === SESSION_HEADER_ACTIONS_SLOT),
      '会话头动作带零产品登记（M2 4.2 首位注册退役——监视面迁对话列内悬浮面板）',
    ).toHaveLength(0)
    expect(
      (globalThis as { __DSH_FORGE_VIEWS__?: Record<string, unknown> }).__DSH_FORGE_VIEWS__?.['ForgeSessionTaskPills'],
      '发布面零 ForgeSessionTaskPills（随槽位卸载一并退役）',
    ).toBeUndefined()
    unpublishViews()
  })

  it('D6 ⟞ 开面：openWorkerSession → 账本 parentId 在场 = 官方 SubagentAddress 形（openChild 同径）；缺席 = 平开会话 id', () => {
    publishFakeViews()
    const { ctx, registers, sessionsById, open } = fakeClientCtx()
    sessionsById['worker-child'] = { parentId: 'dispatch-parent' }
    forgeClientPlugin().apply(ctx)
    const host = registers.find((r) => r.key === SHELL_OVERLAY_SLOT)!
    const face = host.options.inject!() as { openWorkerSession: (childSessionId: string) => void }
    face.openWorkerSession('worker-child')
    face.openWorkerSession('top-level')
    expect(open).toHaveBeenNthCalledWith(1, { parentSessionId: 'dispatch-parent', childSessionId: 'worker-child', mode: 'unknown' })
    expect(open).toHaveBeenNthCalledWith(2, 'top-level')
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
    const face = host.options.inject!() as { openWorkerSession: (childSessionId: string) => void }
    expect(() => face.openWorkerSession('s-1')).not.toThrow()
    unpublishViews()
  })

  it('诊断面：views 族登记数组 = 页签 + hero 影子（会话头带洞位随 D5 卸载不再登记）', () => {
    publishFakeViews()
    const { ctx } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { views?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.views?.registered).toEqual([CONVERSATION_VIEW_SLOT, HERO_WORKSPACE_SLOT])
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
  it('list 槽登记：id dswf-forge-settings + order 5 + locale NS label thunk（zh 值 Forge设置）+ 发布组件；零 children/priority/inject——生命周期归官方设置对话框（Hard Rule 非 fork）', () => {
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
    // （single 槽语义）、无 inject（组件数据面自足 = preload RPC 单门，owner share close 由
    // 官方壳递达）；打开/关闭/Esc 全部官方设置对话框自持
    expect(forge.options.children).toBeUndefined()
    expect(forge.options.priority).toBeUndefined()
    expect(forge.options.inject).toBeUndefined()
    expect(forge.options.key).toBeUndefined()
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
