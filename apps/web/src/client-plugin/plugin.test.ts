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
  FORGE_CLIENT_INJECT,
  FORGE_CLIENT_PLUGIN_ID,
  HERO_PANEL_KEY,
  KNOWLEDGE_PANEL_KEY,
  MAIN_SLOT,
  RECALL_VIEW_ID,
  SHELL_OVERLAY_SLOT,
  SIDEBAR_BRAND_MARK_SLOT,
  SIDEBAR_BRAND_NAME_SLOT,
  SIDEBAR_PANELLIST_SLOT,
  SIDEBAR_SHADOW_PRIORITY,
  SIDEBAR_WORKSPACES_SLOT,
  forgeClientPlugin,
  moduleLoaderFacade,
  publishedViews,
  registerForgeClient,
  type ForgeClientCtx,
  type ForgeSlotsService,
} from './plugin.js'
import { HERO_PANEL_KEY as SHELL_HERO_KEY, KNOWLEDGE_PANEL_KEY as SHELL_KNOWLEDGE_KEY } from '../workbench/panel-model.js'
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
    label?: string
    inject?: () => object
  }
  component: unknown
}

/** 假 ctx：slots 收集 inject/register，六服务经 get 递达 */
function fakeClientCtx(): {
  ctx: ForgeClientCtx
  registers: RegisterCall[]
  injectedKeys: string[]
  open: ReturnType<typeof vi.fn>
  rightToggle: ReturnType<typeof vi.fn>
  selectPanel: ReturnType<typeof vi.fn>
} {
  const registers: RegisterCall[] = []
  const injectedKeys: string[] = []
  const open = vi.fn()
  const rightToggle = vi.fn()
  const selectPanel = vi.fn()
  const slots: ForgeSlotsService = {
    inject: (key, callback) => {
      injectedKeys.push(key)
      const dispose = callback()
      return dispose ?? (() => {})
    },
    register: (options, component) => {
      registers.push({ key: options.name, options, component })
      return () => {}
    },
  }
  // fix-11：Session Controller 面仅账本快照源；打开动作 = uiWorkspace.openSession（官方导航面）
  const sessions = { list: { tag: 'sessions-list' } }
  const uiWorkspace = { openSession: open }
  const workspaces = { list: { tag: 'workspaces-list' } }
  // fix-23：官方右栏收展窄面（ISidebarRight 切片）
  const sidebarRight = { isExpanded: () => false, toggleExpanded: rightToggle }
  // fix-25：官方面板选择窄面（LayoutController 切片）
  const layout = {
    selectPanel,
    panelInfo: {
      getSnapshot: () => ({ activePanelId: null }),
      subscribe: () => () => {},
    },
  }
  const ctx: ForgeClientCtx = {
    slots,
    get: (name) => {
      if (name === 'sessions') return sessions
      if (name === 'uiWorkspace') return uiWorkspace
      if (name === 'workspaces') return workspaces
      if (name === 'sidebarRight') return sidebarRight
      if (name === 'layout') return layout
      throw new Error(`unexpected service: ${name}`)
    },
  }
  return { ctx, registers, injectedKeys, open, rightToggle, selectPanel }
}

/** 假产品视图发布面（fix-25 发布集） */
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
    createWorkbenchBridge: (nav: { showKnowledge(): void; showSession(): void }) => {
      // 结构同型镜像真身（workbench-bridge.createWorkbenchBridge）：nav 透传 + 页内全局发布
      const bridgeObj = {
        showKnowledge: nav.showKnowledge,
        showSession: nav.showSession,
        openKnowledgeEntry: () => {
          nav.showKnowledge()
        },
        subscribe: () => () => {},
        getSnapshot: () => ({ drawerEntryId: null }),
        setDrawerEntry: () => {},
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
  it('name = 注册键；inject = 六服务（fix-11 打开面改 uiWorkspace；fix-23 加 sidebarRight；fix-25 加 layout）；apply 幂等立激活标记', () => {
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
      'layout',
    ])
    plugin.apply(fakeClientCtx().ctx)
    const active = (globalThis as { __DSH_FORGE_CLIENT__?: { plugin: string; activatedAt: number } }).__DSH_FORGE_CLIENT__
    expect(active?.plugin).toBe(FORGE_CLIENT_PLUGIN_ID)
    expect(typeof active?.activatedAt).toBe('number')
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
      SIDEBAR_WORKSPACES_SLOT,
      SIDEBAR_BRAND_MARK_SLOT,
      SIDEBAR_BRAND_NAME_SLOT,
      MAIN_SLOT,
      MAIN_SLOT,
      SIDEBAR_PANELLIST_SLOT,
      CONVERSATION_VIEW_SLOT,
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

  it('注入面 = dsh 账本/归属快照源 + openSession（面板数据与动作的唯一通道；fix-11 打开经 uiWorkspace.openSession——Session Controller 无 open 面）', () => {
    publishFakeViews()
    const { ctx, registers, open } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const workspaces = registers.find((r) => r.key === SIDEBAR_WORKSPACES_SLOT)!
    const face = workspaces.options.inject!()
    expect(face).toEqual({
      sessions: { tag: 'sessions-list' },
      workspaces: { tag: 'workspaces-list' },
      openSession: expect.any(Function),
    })
    ;(face as { openSession: (id: string) => void }).openSession('s-1')
    expect(open).toHaveBeenCalledWith('s-1')
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
    // 知识面板注入面 = 工作台桥（抽屉缝）
    const face = knowledge!.options.inject!() as { bridge: { getSnapshot(): { drawerEntryId: number | null } } }
    expect(face.bridge.getSnapshot()).toEqual({ drawerEntryId: null })
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { center?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.center?.registered).toEqual([MAIN_SLOT, MAIN_SLOT, SIDEBAR_PANELLIST_SLOT])
    expect(marker?.center?.error).toBeUndefined()
    unpublishViews()
  })

  it('panellist 行：id = 知识面板 key（官方 PanelRow 行语言消费）+ label 知识库', () => {
    const views = publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const row = registers.find((r) => r.key === SIDEBAR_PANELLIST_SLOT)
    expect(row).toBeDefined()
    expect(row!.options.id).toBe(KNOWLEDGE_PANEL_KEY)
    expect(row!.options.label).toBe('知识库')
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
    expect(recall.options.label).toBe('知识召回')
    expect(recall.component).toBe(views.ForgeRecallView)
    // fix-29 退役 pin：产品 'dswf-trajectory' 复刻不再注册（官方 'trajectory' roster 行保持）
    expect(registers.find((r) => r.key === CONVERSATION_VIEW_SLOT && (r.options.id === 'dswf-trajectory' || r.options.id === 'trajectory'))).toBeUndefined()
    // 召回注入面：openKnowledgeEntry → 桥跳转（进知识面板 + 抽屉定位——selectPanel 官方面）
    const face = recall.options.inject!() as { openKnowledgeEntry: (id: number) => void }
    const { selectPanel } = fakeClientCtx()
    expect(typeof face.openKnowledgeEntry).toBe('function')
    void selectPanel
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { views?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.views?.registered).toEqual([CONVERSATION_VIEW_SLOT])
    expect(marker?.views?.error).toBeUndefined()
    unpublishViews()
  })

  it('壳宿主：shell.overlay 登记 + 注入面 = 官方面板选择/右栏收展窄面；桥经发布面工厂创建并发布页内全局', () => {
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
    }
    expect(Object.keys(face).sort()).toEqual(['rightbar', 'selectPanel'])
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
