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
  CONVERSATION_VIEW_SLOT,
  // fix-13 注记（1.41）：DISPATCH_TASK_TOOL_KEY 断言随工具行注册面迁 project bundle
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
  SESSION_HEADER_ACTIONS_SLOT,
  // fix-13 注记（1.40）：FORGE_REMOTE_ENTRY_ID/ORDER 随注册面迁 project bundle——壳零断言
  SIDEBAR_FOOTER_ACTION_SLOT,
  SHELL_OVERLAY_SLOT,
  SIDEBAR_BRAND_MARK_SLOT,
  SIDEBAR_BRAND_NAME_SLOT,
  SIDEBAR_PANELLIST_SLOT,
  SIDEBAR_RIGHT_PANE_TAB_SLOT,
  SIDEBAR_SHADOW_PRIORITY,
  SIDEBAR_WORKSPACES_SLOT,
  // fix-13 注记（1.41）：TOOL_CALL_TOOLVIEW_SLOT 断言与事件折叠组断言随注册面迁
  // @dsh-forge/project（plugin 侧 remote/conversation faces 测试）——壳测零该两族。
  forgeClientPlugin,
  moduleLoaderFacade,
  publishedViews,
  registerForgeClient,
  type ForgeClientCtx,
  type ForgeLocaleService,
  type ForgeSlotsService,
} from './plugin.js'
// fix-13 注记（1.45）：会话判读/解析纯函数族 + Bug 快速路径随 dock tab 族注册面迁
// @dsh-forge/project（ui/session-actions.ts）——改自包窄子路径 import，语义断言保持。
import {
  activeSessionIdOf,
  buildBugQuickAdder,
  docTabTitle,
  makeSessionTitleResolver,
  resolveWorkerChildSession,
  sessionParentIdOf,
  sessionRowInLedger,
  sessionTitleOf,
  workerChildSessionOf,
  workerOpenTarget,
} from '@dsh-forge/project/client-ui/session-actions'
// fix-13 注记（1.45）：DSWF_* 常量与地址编解码随 dock tab 族注册面迁
// @dsh-forge/project（ui/dock-tabs/；壳侧 workbench/dock-tabs.tsx 已退役占位）——
// 改自包窄子路径 import。
import {
  DSWF_DOC_ADDRESS_PREFIX as DOCK_DOC_PREFIX,
  DSWF_DOC_TAB_KIND as DOCK_DOC_KIND,
  DSWF_OVERVIEW_TAB_KIND as DOCK_OVERVIEW_KIND,
  forgeDocAddress,
  parseForgeDocAddress,
} from '@dsh-forge/project/client-ui/dock-tabs'
import type { ModuleLoaderFacade, ModuleLoaderRegistration } from '../shell/dsh-globals.js'
// fix-13 注记（1.41）：forge-event-node 定义对 import 随事件折叠组注册面迁
// @dsh-forge/project（plugin 侧 conversation-views-face 测试）——壳测零引用。
import { HERO_PANEL_KEY as SHELL_HERO_KEY, KNOWLEDGE_PANEL_KEY as SHELL_KNOWLEDGE_KEY } from '../workbench/panel-model.js'
// fix-13 注记（1.45）：Bug 快速路径迁 @dsh-forge/project（ui/official-seams.ts——无窄子路径
// 出口）——FORGE_BUG_SOURCE_NAME 改持字面量镜像（正本 official-seams.ts 同源 pin）。
const FORGE_BUG_SOURCE_NAME = 'dswf-bug'

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

/** tab 类型注册记录（fake sidebarRightTabs 收集面——fix-13 注记 1.45：注册面迁
 * @dsh-forge/project 后本形状仅存零调用断言的记录位） */
interface TabTypeCall {
  id: string
  kind: string
  multiple?: boolean
  patterns?: readonly string[]
  canOpen?: (address: string) => boolean
  title: (address: string) => string
  guide?: readonly { id: string; order: number; title: () => string; description?: () => string }[]
}

/** fake tab 类型注册表（4.1）：register 收定义 + 撤销记账（幂等标志）。
 * fix-13 注记（1.45）：ForgeSidebarRightTabsService 类型随注册面迁 @dsh-forge/project 后
 * 已无导出面（彼侧为未导出的 SidebarRightTabsMirror）——fake 自持结构镜像；fake 保留
 * 仅为 fakeClientCtx.get('sidebarRightTabs') 分支的零调用断言面。 */
interface SidebarRightTabsRegisterFace {
  register(definition: TabTypeCall): () => void
}

function fakeSidebarRightTabs(): SidebarRightTabsRegisterFace & {
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

/** 假 ctx：slots 收集 inject/register，七服务经 get 递达（fix-13 注记 1.45：
 * sidebarRightTabs 注入边随 dock tab 族注册面迁 @dsh-forge/project——本 fake 分支仅存
 * 零调用断言面）。D45 sessionFaces：uiWorkspace 会话行动作面 +
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
      // 悬浮进度流面板实时刷新缝（loop-event-delivery 1.8——useSyncExternalStore 订阅面）
      subscribe: () => () => {},
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
      // fix-13 注记（1.45）：'sidebarRightTabs' 已随注册面迁出 ForgeClientCtx.get 联合——
      // fake 分支经 string 收窄保留（零调用断言面）
      if (name === 'sessions') return sessions
      if (name === 'uiWorkspace') return uiWorkspace
      if (name === 'workspaces') return workspaces
      if (name === 'sidebarRight') return sidebarRight
      if ((name as string) === 'sidebarRightTabs') return tabTypes
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
    // 1.6 注记：ForgeSidebarSlot 发布键随 sidebar.workspaces 顶替注册迁 @dsh-forge/project
    // bundle（ui/sidebar-face.ts）退役——壳发布面零该键。
    ForgeBrandMark: 'COMP:brand-mark',
    ForgeBrandName: 'COMP:brand-name',
    ForgeShellHost: 'COMP:shell-host',
    // fix-13 注记（1.42/1.44）：ForgeHeroPanel / ForgeKnowledgePanel / ForgeKnowledgeGlyph /
    // ForgeRecallView 发布退役——注册面迁 project bundle（hero-panel-face / knowledge-face）
    // fix-13 注记（1.41）：ForgeDispatchToolRow / ForgeEventEntries 发布退役——注册面迁 project bundle
    // fix-13 注记（1.45）：ForgeOverviewTab / ForgeDocsTab 两键随 dock tab 族注册迁
    // @dsh-forge/project bundle（ui/dock-tabs-face.ts + ui/dock-tabs/）——壳发布面零该两键。
    // 1.7 注记：ForgeHeroWorkspacePicker 发布键随 B 类顶替②（hero 双 select 全量顶替）
    // 迁 @dsh-forge/project bundle（ui/hero-picker-face.ts）——壳发布面零该键。
    // fix-13 注记：chip/seal overlay/bug 三件发布退役——注册面迁 project bundle（official-seams）
    // fix-13 注记（1.43）：ForgeWorktreeSwitchMarker 发布退役——注册面迁 project bundle
    // fix-13 注记（1.40）：ForgeRemoteEntry 发布退役——注册面迁 project bundle（remote-entry-face）
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
  publishHostPlugins(true) // bug 2ffb0a82：宿主插件位页内缝（壳 boot 发布——dev 形态 knowledge 在场）
  return views
}

/** 宿主插件装载位发布（结构同型镜像 shell/boot.ts bootShell 发布面） */
function publishHostPlugins(knowledge: boolean): void {
  ;(globalThis as { __DSH_FORGE_HOST_PLUGINS__?: unknown }).__DSH_FORGE_HOST_PLUGINS__ = { knowledge }
}

function unpublishViews(): void {
  delete (globalThis as { __DSH_FORGE_VIEWS__?: unknown }).__DSH_FORGE_VIEWS__
  delete (globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__
  delete (globalThis as { __DSH_FORGE_HOST_PLUGINS__?: unknown }).__DSH_FORGE_HOST_PLUGINS__
}

describe('forgeClientPlugin 形状（cordis 插件面）', () => {
  it('name = 注册键；inject = 六服务（fix-11 打开面改 uiWorkspace；fix-23 加 sidebarRight；fix-25 加 layout；fix-33 加 locale；fix-13 1.45 摘 sidebarRightTabs；1.41 摘 uiConversation）；apply 幂等立激活标记', () => {
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
      // fix-13 注记（1.45）：'sidebarRightTabs' 注入边随 dock tab 族注册面迁
      // @dsh-forge/project bundle（ui/dock-tabs-face.ts）——壳注入清单摘除该行。
      'layout',
      'locale',
      // fix-13 注记（1.41）：'uiConversation' 注入边随事件折叠组注册面迁
      // @dsh-forge/project bundle（conversation-views-face）——壳注入清单摘除该行。
    ])
    const { ctx, locale } = fakeClientCtx()
    plugin.apply(ctx)
    const active = (globalThis as { __DSH_FORGE_CLIENT__?: { plugin: string; activatedAt: number } }).__DSH_FORGE_CLIENT__
    expect(active?.plugin).toBe(FORGE_CLIENT_PLUGIN_ID)
    expect(typeof active?.activatedAt).toBe('number')
    // fix-33 ⑧：locale 词典登记（NS + zh/en 双语——官方 ui-trajectory 同径）。
    // fix-13 注记（1.41/1.42/1.45）：tool.dispatchTask.* / panel.knowledge / view.recall /
    // tab.overview / tab.bug / guide.overview.desc 词条已分别随各注册面迁
    // @dsh-forge/project 自有 NS——壳词典零产品行（空登记面 = 词典注册缝仍在的 pin）。
    expect(locale.registered).toHaveLength(1)
    expect(locale.registered[0]![0]).toBe(FORGE_LOCALE_NS)
    expect(locale.registered[0]![1].zh).toEqual({})
    expect(locale.registered[0]![1].en).toEqual({})
    // fix-13 断言（1.45）：tab.overview / tab.bug / guide.overview.desc 随 dock tab 族
    // 注册面迁 @dsh-forge/project 自有 NS（dsh-forge.project）——壳词典不含三词条。
    expect(locale.registered[0]![1].zh?.['tab.overview']).toBeUndefined()
    expect(locale.registered[0]![1].en?.['tab.overview']).toBeUndefined()
    expect(locale.registered[0]![1].zh?.['tab.bug']).toBeUndefined()
    expect(locale.registered[0]![1].en?.['tab.bug']).toBeUndefined()
    expect(locale.registered[0]![1].zh?.['guide.overview.desc']).toBeUndefined()
    expect(locale.registered[0]![1].en?.['guide.overview.desc']).toBeUndefined()
    unpublishViews()
    if (marker === undefined) delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    else (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ = marker
    void views
  })
})

describe('槽位路线 A 注册（AC1：品牌行内容洞位；sidebar.workspaces 顶替注册已迁 @dsh-forge/project——1.6）', () => {
  it('品牌两洞位经 slots.inject 声明依赖；发布组件 + 影子优先级；诊断回填落座；sidebar.workspaces 壳零登记（fix-13 断言，1.6）', () => {
    const views = publishFakeViews()
    const { ctx, registers, injectedKeys } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(injectedKeys).toEqual([
      // 1.6 注记：SIDEBAR_WORKSPACES_SLOT 注入随 sidebar.workspaces 顶替注册迁
      // @dsh-forge/project（ui/sidebar-face.ts）——壳注入清单摘除该行。
      SIDEBAR_BRAND_MARK_SLOT,
      SIDEBAR_BRAND_NAME_SLOT,
      // fix-13 注记（1.40）：SIDEBAR_FOOTER_ACTION_SLOT（手机远程入口）注入迁 project
      // bundle——壳注入清单摘除该行。
      // fix-13 注记（1.42/1.44）：MAIN_SLOT×2 / SIDEBAR_PANELLIST_SLOT / CONVERSATION_VIEW_SLOT
      // 注入随 center 族与召回页签注册迁 project bundle——壳注入清单摘除四行。
      // 1.7 注记：HERO_WORKSPACE_SLOT 注入随 B 类顶替②（hero 双 select 全量顶替）迁
      // project bundle（ui/hero-picker-face.ts）——壳注入清单摘除该行。
      SHELL_OVERLAY_SLOT,
    ])
    // fix-13 断言（1.6）：sidebar.workspaces 顶替注册迁 @dsh-forge/project bundle
    // （ui/sidebar-face.ts——负优先级恒选胜语义 audit §6）——壳对 workspaces 洞位零登记
    // （发布面零 ForgeSidebarSlot 键 + 零注册行）。
    expect(registers.find((r) => r.key === SIDEBAR_WORKSPACES_SLOT)).toBeUndefined()
    const mark = registers.find((r) => r.key === SIDEBAR_BRAND_MARK_SLOT)
    const name = registers.find((r) => r.key === SIDEBAR_BRAND_NAME_SLOT)
    expect(mark!.component).toBe(views.ForgeBrandMark)
    expect(name!.component).toBe(views.ForgeBrandName)
    expect(mark!.options.priority).toBe(SIDEBAR_SHADOW_PRIORITY)
    // 诊断面：品牌两洞位落座 + 无错误（e2e 排障锚）。fix-13 注记（1.40）：手机远程行注册迁
    // project bundle——壳诊断零该行；1.6 注记：workspaces 行同迁——壳诊断零该行。
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { sidebar?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.sidebar?.registered).toEqual([SIDEBAR_BRAND_MARK_SLOT, SIDEBAR_BRAND_NAME_SLOT])
    expect(marker?.sidebar?.error).toBeUndefined()
    // fix-13 断言（1.40）：壳侧对 sidebar.footer.action 零登记（注册面归 project bundle）
    expect(registers.find((r) => r.key === SIDEBAR_FOOTER_ACTION_SLOT)).toBeUndefined()
    unpublishViews()
  })
})


describe('官方基座降位登记族（fix-25：main 面板 roster + panellist 行 + 页签 roster + 壳宿主）', () => {
  it('fix-13 断言（1.42/1.44）：center 族（hero/knowledge 面板 + panellist 行）注册迁 @dsh-forge/project——壳对 main/panellist 零登记', () => {
    publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(registers.find((r) => r.key === MAIN_SLOT && r.options.key === HERO_PANEL_KEY)).toBeUndefined()
    expect(registers.find((r) => r.key === MAIN_SLOT && r.options.key === KNOWLEDGE_PANEL_KEY)).toBeUndefined()
    expect(registers.find((r) => r.key === SIDEBAR_PANELLIST_SLOT)).toBeUndefined()
    // 字面量同源 pin 保持（plugin 侧常量 ↔ 壳侧 panel-model——bundle 自含不经 import）
    expect(HERO_PANEL_KEY).toBe(SHELL_HERO_KEY)
    expect(KNOWLEDGE_PANEL_KEY).toBe(SHELL_KNOWLEDGE_KEY)
    unpublishViews()
  })

  it('bug 2ffb0a82 知识门随迁注记：门读数（knowledgeEnabledOf）迁 @dsh-forge/project——壳侧零门零知识登记（回归锚）', () => {
    publishFakeViews()
    publishHostPlugins(false)
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(registers.find((r) => r.key === SIDEBAR_PANELLIST_SLOT)).toBeUndefined()
    expect(registers.find((r) => r.key === MAIN_SLOT && r.options.key === KNOWLEDGE_PANEL_KEY)).toBeUndefined()
    expect(registers.filter((r) => r.key === CONVERSATION_VIEW_SLOT)).toHaveLength(0)
    unpublishViews()
  })

  it('bug 2ffb0a82 知识门 fail-closed（页内缝缺席）随迁注记：壳侧零知识登记（回归锚）', () => {
    publishFakeViews()
    delete (globalThis as { __DSH_FORGE_HOST_PLUGINS__?: unknown }).__DSH_FORGE_HOST_PLUGINS__
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(registers.find((r) => r.key === SIDEBAR_PANELLIST_SLOT)).toBeUndefined()
    expect(registers.find((r) => r.key === MAIN_SLOT && r.options.key === KNOWLEDGE_PANEL_KEY)).toBeUndefined()
    expect(registers.filter((r) => r.key === CONVERSATION_VIEW_SLOT)).toHaveLength(0)
    unpublishViews()
  })

  it('fix-13 断言（1.42）：召回页签注册随 knowledge 族迁 @dsh-forge/project——壳对 conversation.view 零登记（fix-29 轨迹直用语义不变）', () => {
    publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(registers.filter((r) => r.key === CONVERSATION_VIEW_SLOT)).toHaveLength(0)
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { views?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.views?.registered).toEqual([]) // 1.7 注记：hero 影子随 B 类顶替②迁 project bundle（ui/hero-picker-face.ts）——views 族壳登记归零
    expect(marker?.views?.error).toBeUndefined()
    unpublishViews()
  })

  it('1.7 断言（B 类顶替②）：hero 工作区控件注册迁 @dsh-forge/project——壳对 conversation.hero.workspace 零登记（ui/hero-picker-face.ts 双段式在插件侧）', () => {
    publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(registers.filter((r) => r.key === HERO_WORKSPACE_SLOT), '壳零登记（官方 WorkspacePicker 弹层位替换归插件 bundle）').toHaveLength(0)
    const views = (globalThis as { __DSH_FORGE_VIEWS__?: Record<string, unknown> }).__DSH_FORGE_VIEWS__
    expect(views?.['ForgeHeroWorkspacePicker'], '发布面零 hero picker 组件（注册面迁插件 bundle）').toBeUndefined()
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { views?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.views?.registered).toEqual([])
    expect(marker?.views?.error).toBeUndefined()
    unpublishViews()
  })

  it('fix-13 断言（1.41）：dispatchTask 工具行与事件折叠组注册迁 @dsh-forge/project——壳对 tool.call.toolview / conversation.chat.node 零登记、uiConversation 零消费', () => {
    publishFakeViews()
    const { ctx, registers, eventDefinitions } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(registers.filter((r) => r.key === 'tool.call.toolview')).toHaveLength(0)
    expect(registers.filter((r) => r.key === 'conversation.chat.node')).toHaveLength(0)
    expect(eventDefinitions).toHaveLength(0) // 定义注册随三段注册面迁 project bundle
    unpublishViews()
  })

  it('1.17 uiConversation 缺席 = 不炸不阻载其余登记（fix-13 注记 1.41：壳侧已零消费——回归锚保持）', () => {
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
    expect(marker?.views?.registered).not.toContain('conversation.chat.node')
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
      sessions: { getSnapshot: () => unknown; subscribe: (fn: () => void) => () => void }
      progressLog: { getSnapshot: () => unknown; subscribe: (fn: () => void) => () => void }
    }
    // m3.1 D21/D23 弹窗宿主三窄面 + D6 悬浮面板 ⟞ 开面在场（ShellHost 消费）
    // + S1 会话名解析器（task-ui-info-density-blitz——账本快照 displayTitle 窄读闭包）
    // + ⟞ 父反查兜底（fix：进行中 worker 无 record 审计行 → 库侧解析恒空的修复面）
    // + 悬浮进度流面板账本源（loop-event-delivery 1.8——projectionValues 窄读 + 实时刷新）
    // + 会话日志进度回放源（loop-message-consolidation 1.3——窗口截断消费侧回放兜底）
    expect(Object.keys(face).sort()).toEqual([
      'bridge',
      'onOpenSession',
      'onOpenWorkerSession',
      'openDocResource',
      'openSession',
      'progressLog',
      'resolveWorkerSession',
      'rightbar',
      'selectPanel',
      'sessionTitleOf',
      'sessions',
    ])
    expect(typeof face.sessions.getSnapshot).toBe('function')
    expect(typeof face.sessions.subscribe).toBe('function')
    expect(typeof face.progressLog.getSnapshot).toBe('function')
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
    it('任务键无命中（标签漂移/旧数据）→ 不回退兄弟子行 = undefined（bug b87a6869：开错兄弟会话不如不开）；缺省键 → updatedAt 择新', () => {
      const list = ledger({
        'worker-1-1': { parentId: 'p', updatedAt: '2026-10-13T10:00:00Z', displayTitle: 'feat-x/1.1 · A' },
        'worker-1-2': { parentId: 'p', updatedAt: '2026-10-13T11:00:00Z', displayTitle: 'feat-x/1.2 · B' },
      })
      expect(workerChildSessionOf(list, 'p', 'feat-x/9.9')).toBeUndefined()
      expect(workerChildSessionOf(list, 'p')).toBe('worker-1-2')
    })
    it('bug b87a6869：执行中 worker 账本行未落（仅兄弟已完成任务行在账）→ undefined，不冒充目标', () => {
      const list = ledger({
        'worker-1-1': { parentId: 'p', updatedAt: '2026-10-13T10:00:00Z', displayTitle: 'feat-x/1.1 · A' },
      })
      expect(workerChildSessionOf(list, 'p', 'feat-x/1.2')).toBeUndefined()
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

// fix-13 注记（1.45）：dock tab 族两段注册（概览/文档 tab 类型定义 + keyed body + 撤销面）
// 整体迁 @dsh-forge/project bundle（ui/dock-tabs-face.ts + ui/dock-tabs/ 组件族——注册面
// 测试在彼侧 dock-tabs-face/dock-tabs 测试）——壳侧本 describe 改为「壳零登记」负向断言。
describe('dock tab 族两段注册（4.1）——fix-13 断言（1.45）：注册面迁 @dsh-forge/project，壳零登记', () => {
  it('fix-13 断言（1.45）：apply 后零 dock 登记——sidebarRightTabs.register 零调用 + sidebar.right.pane.tab 零 body + dock 诊断空 + dispose 链零 tab 类型撤销', () => {
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    publishFakeViews()
    const { ctx, registers, tabTypes, injectDisposers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    // 两段注册第一段（tab 类型定义——dswf-overview 页型 guide 入口卡 / dswf-doc 资源型
    // multiple+patterns）已迁 @dsh-forge/project：壳侧 sidebarRightTabs.register 零调用。
    expect(tabTypes.calls, 'tab 类型注册零调用（注册面迁 @dsh-forge/project）').toHaveLength(0)
    // 两段注册第二段（keyed 两 body + 概览注入面）已迁 @dsh-forge/project：壳侧零登记。
    expect(registers.filter((r) => r.key === SIDEBAR_RIGHT_PANE_TAB_SLOT), 'pane.tab keyed body 零登记（注册面迁 @dsh-forge/project）').toHaveLength(0)
    // 诊断面：dock 族零登记（registered 空/undefined + 无错误）
    const diag = (globalThis as { __DSH_FORGE_CLIENT__?: { dock?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(diag?.dock?.registered ?? []).toEqual([])
    expect(diag?.dock?.error).toBeUndefined()
    // 撤销面翻转（原 fix-33 ⑥ 对称性断言随迁）：overlay 洞 dispose 后零 tab 类型撤销
    // （撤销链归 @dsh-forge/project 自持）
    injectDisposers.get(SHELL_OVERLAY_SLOT)!()
    expect(tabTypes.disposedIds, 'dispose 链零 tab 类型撤销（撤销面随注册面迁 @dsh-forge/project）').toEqual([])
    unpublishViews()
    if (marker === undefined) delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    else (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ = marker
  })

  it('字面量同源 pin（fix-13 1.45 改跨包 import 比对）：两 kind 与地址前缀 = @dsh-forge/project DSWF_* 常量；标题末段与包内地址编码同源', () => {
    expect(OVERVIEW_TAB_KIND).toBe(DOCK_OVERVIEW_KIND)
    expect(DOC_TAB_KIND).toBe(DOCK_DOC_KIND)
    expect(DOC_ADDRESS_PREFIX).toBe(DOCK_DOC_PREFIX)
    // docTabTitle（随注册面迁 @dsh-forge/project——ui/session-actions.ts）与包内
    // forgeDocAddress 编码同源：标题 = 地址末段文件名。
    expect(docTabTitle(forgeDocAddress('p1', 'docs/proposals/m2/proposal.md'))).toBe('proposal.md')
    expect(parseForgeDocAddress(forgeDocAddress('p1', 'docs/a b/tech-design.md'))).toEqual({
      projectId: 'p1',
      docRel: 'docs/a b/tech-design.md',
    })
    // fix-13 注记：Bug 地址编解码同源 pin 迁 plugins/project ui/official-seams.test.ts
    // （注册面随迁——壳侧常量镜像已退役）
  })
})

describe('会话头挂接槽 + 悬浮面板 ⟞ 开面（m3.1 D5/D6 + fix-13 迁移收口）', () => {
  it('D5 断言（fix-13 修订）：conversation.session.header.actions 壳侧零产品登记——worktree chip 注册面迁 project bundle（官方宿主可挂）+ 发布面零 chip/bug 组件', () => {
    publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const headerRows = registers.filter((r) => r.key === SESSION_HEADER_ACTIONS_SLOT)
    expect(headerRows, '会话头动作带壳侧零登记（chip 注册迁 @dsh-forge/project official-seams）').toHaveLength(0)
    const views = (globalThis as { __DSH_FORGE_VIEWS__?: Record<string, unknown> }).__DSH_FORGE_VIEWS__
    expect(views?.['ForgeSessionWorktreeChip'], '发布面零 chip 组件（注册面迁插件 bundle）').toBeUndefined()
    expect(views?.['ForgeBugPreview'], '发布面零 Bug 台账 body（注册面迁插件 bundle）').toBeUndefined()
    expect(
      views?.['ForgeSessionTaskPills'],
      '发布面零 ForgeSessionTaskPills（随槽位卸载一并退役）',
    ).toBeUndefined()
    unpublishViews()
  })

  it('fix-13 断言（1.43）：切换闸虚线标记行注册迁 @dsh-forge/project——壳对 conversation.input.overlay 零登记（bug 2026-10-16 id 纪律回归锚在彼侧 official-seams/conversation-views-face 测试）', () => {
    publishFakeViews()
    const { ctx, registers } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    expect(registers.filter((r) => r.key === 'conversation.input.overlay')).toHaveLength(0)
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

  it('诊断面：views 族登记数组恒空（1.7 B 类顶替②：hero 影子注册迁 project bundle——fix-13 注记 1.41-1.43：页签/工具行/事件组/切换闸标记注册同彼侧）', () => {
    publishFakeViews()
    const { ctx } = fakeClientCtx()
    forgeClientPlugin().apply(ctx)
    const marker = (globalThis as { __DSH_FORGE_CLIENT__?: { views?: { registered?: string[]; error?: string } } }).__DSH_FORGE_CLIENT__
    expect(marker?.views?.registered).toEqual([])
    expect(marker?.views?.error).toBeUndefined()
    unpublishViews()
  })
})

describe('fix-33 ⑥ 缝族对称性（桥/词典/标记的发布与撤销）', () => {
  it('apply 中途抛错（首个洞位 inject 失败——fix-13 注记 1.45：dock pane.tab inject 缝已迁 @dsh-forge/project，首缝 = sidebar.workspaces）→ catch 补撤销：桥全局清空 + locale 词典撤销（死闭包不残留）', () => {
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

  it('apply 中途抛错（早期注册缝 locale.register 失败——fix-13 注记 1.45：原 dock pane.tab inject 缝已随注册面迁 @dsh-forge/project；locale 登记仍是增强器挂接前的早期壳侧缝）= 增强器未及挂接（零 start 零 stop——半成型态零死观察器）', () => {
    publishFakeViews()
    const base = fakeClientCtx()
    const ctx: ForgeClientCtx = {
      ...base.ctx, // slots 为 readonly——浅拷贝面置换 get（locale 分支抛错旁路同径）
      get: (name: string) => {
        if (name === 'locale') {
          return {
            register: (): never => {
              throw new Error('locale down')
            },
            bind: () => (key: string) => key,
          }
        }
        return (base.ctx as { get: (n: string) => unknown }).get(name)
      },
    } as ForgeClientCtx
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
    return { addBugToSession: buildBugQuickAdder(clientCtx as never, sessions as never, orchestrator as never, options?.noteInserted as never), bail: actx.bail, face, openSessionWithPreset }
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

// ── W4 装载自证 + 行存续看门（session-binding-guarantee §W4）──────────────────────────
describe('W4 激活自证（RPC 轻探）+ 看门探测面', () => {
  const g = () =>
    globalThis as {
      __DSH_FORGE_CLIENT__?: unknown
      __DSH_FORGE_HEALTH__?: { slotCount: () => number; check: () => void }
      __DSH_FORGE_PRUNE_CHECK__?: unknown
    }
  /** Typert remote 信封（ui/rpc.ts RemoteResult 投影入参形态） */
  type RemoteEnvelope = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }
  /** Typert face 页内锚（FORGE_REMOTE_FACE_ANCHOR_KEY 同键——resolver 逐调用现查） */
  function installFace(list: () => Promise<RemoteEnvelope>): void {
    ;(globalThis as Record<string, unknown>)['__dshForgeRemoteFace'] = {
      resolver: () => ({ forgeProjects: { list } }),
    }
  }

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as Record<string, unknown>).__dshForgeRemoteFace
    delete g().__DSH_FORGE_HEALTH__
    delete g().__DSH_FORGE_PRUNE_CHECK__
  })

  function augmentCtx(ctx: ForgeClientCtx): {
    listeners: Array<(name: string, value: unknown) => void>
    slotsEntries: Map<string, readonly unknown[]>
  } {
    const listeners: Array<(name: string, value: unknown) => void> = []
    const slotsEntries = new Map<string, readonly unknown[]>([
      [SHELL_OVERLAY_SLOT, ['entry-1']],
      // fix-13 注记（1.42/1.44）：MAIN_SLOT 壳看门清单摘除——求和面改 sidebar.workspaces 键承载
      [SIDEBAR_WORKSPACES_SLOT, ['entry-2', 'entry-3']],
    ])
    ;(ctx as unknown as { on: unknown }).on = (name: string, cb: (n: string, v: unknown) => void) => {
      listeners.push(cb)
      return () => {}
    }
    ;(ctx.slots as { entries?: (key: string) => readonly unknown[] }).entries = (key: string) =>
      slotsEntries.get(key) ?? []
    return { listeners, slotsEntries }
  }

  it('Typert face 缺席：竞速窗口静默挂起（零 console）→ 兜底时延重试仍缺席才 fail-loud + 看门探测面发布 + overlay dispose 对称清收', async () => {
    vi.useFakeTimers()
    const markerBefore = g().__DSH_FORGE_CLIENT__
    delete g().__DSH_FORGE_CLIENT__
    publishFakeViews()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { ctx, injectDisposers } = fakeClientCtx()
      const { listeners } = augmentCtx(ctx)
      forgeClientPlugin().apply(ctx)
      const probe = (g().__DSH_FORGE_CLIENT__ as { selfCheck?: { rpcProbe?: string } })?.selfCheck
      // 看门探测面：entries 求和（shell.overlay 1 + main 2 = 3）+ 事件转发钩接线
      const health = g().__DSH_FORGE_HEALTH__
      expect(health?.slotCount()).toBe(3)
      expect(listeners).toHaveLength(1)
      // overlay dispose = 卸载级联回收面：探测面对称清收
      injectDisposers.get(SHELL_OVERLAY_SLOT)?.()
      expect(g().__DSH_FORGE_HEALTH__).toBeUndefined()
      // 竞速窗口分类：首败静默挂起（零 console.error）
      await vi.advanceTimersByTimeAsync(0)
      expect(probe?.rpcProbe).toContain('竞速窗口')
      expect(err).not.toHaveBeenCalled()
      // 兜底时延重试仍缺席 → 恰一次终态 fail-loud
      await vi.advanceTimersByTimeAsync(2_000)
      expect(probe?.rpcProbe).toContain('轻探不通')
      expect(err.mock.calls.filter((call) => String(call[0]).includes('轻探不通'))).toHaveLength(1)
    } finally {
      err.mockRestore()
      if (markerBefore === undefined) delete g().__DSH_FORGE_CLIENT__
      else g().__DSH_FORGE_CLIENT__ = markerBefore
      unpublishViews()
    }
  })

  it('竞速窗口首败 + internal/service mount 事件先到：事件触发即时静默重试成功（rpcProbe=ok，全程零 console.error）', async () => {
    vi.useFakeTimers()
    const markerBefore = g().__DSH_FORGE_CLIENT__
    delete g().__DSH_FORGE_CLIENT__
    publishFakeViews()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      let failing = true
      ;(globalThis as Record<string, unknown>)['__dshForgeRemoteFace'] = {
        resolver: () => ({
          forgeProjects: {
            list: () =>
              failing
                ? Promise.resolve({
                    ok: false as const,
                    error: { code: 'transport', message: 'transport failure for forgeProjects/list: HTTP 404' },
                  })
                : Promise.resolve({ ok: true as const, value: [] }),
          },
        }),
      }
      const { ctx } = fakeClientCtx()
      const { listeners } = augmentCtx(ctx)
      forgeClientPlugin().apply(ctx)
      const marker = () => (g().__DSH_FORGE_CLIENT__ as { selfCheck?: { rpcProbe?: string } })?.selfCheck
      await vi.advanceTimersByTimeAsync(0)
      expect(marker()?.rpcProbe).toContain('竞速窗口')
      expect(err).not.toHaveBeenCalled()
      // remote contribution mount 落座（internal/service 事件）→ 即时静默重试
      // （探针重试监听在 apply 的 health 监听之后注册——取最后一个）
      failing = false
      listeners[listeners.length - 1]!('internal/service', undefined)
      await vi.advanceTimersByTimeAsync(0)
      expect(marker()?.rpcProbe).toBe('ok')
      expect(err).not.toHaveBeenCalled()
    } finally {
      err.mockRestore()
      if (markerBefore === undefined) delete g().__DSH_FORGE_CLIENT__
      else g().__DSH_FORGE_CLIENT__ = markerBefore
      unpublishViews()
    }
  })

  it('Typert face 在场：RPC 轻探 ok（forgeProjects.list 零副作用读面通 = 数据通路装配链通）', async () => {
    const markerBefore = g().__DSH_FORGE_CLIENT__
    delete g().__DSH_FORGE_CLIENT__
    publishFakeViews()
    const list = vi.fn(() => Promise.resolve({ ok: true as const, value: [] }))
    installFace(list)
    const { ctx } = fakeClientCtx()
    augmentCtx(ctx)
    forgeClientPlugin().apply(ctx)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const marker = g().__DSH_FORGE_CLIENT__ as { selfCheck?: { rpcProbe?: string } }
    expect(list).toHaveBeenCalledTimes(1)
    expect(marker?.selfCheck?.rpcProbe).toBe('ok')
    if (markerBefore === undefined) delete g().__DSH_FORGE_CLIENT__
    else g().__DSH_FORGE_CLIENT__ = markerBefore
    unpublishViews()
  })

  it('RPC 轻探不通 = fail-loud 呈现：selfCheck.rpcProbe 失败因 + console.error（不阻断激活主链）', async () => {
    const markerBefore = g().__DSH_FORGE_CLIENT__
    delete g().__DSH_FORGE_CLIENT__
    publishFakeViews()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      installFace(() =>
        Promise.resolve({ ok: false as const, error: { code: 'internal', message: '数据通路断裂' } }),
      )
      const { ctx } = fakeClientCtx()
      augmentCtx(ctx)
      forgeClientPlugin().apply(ctx)
      await new Promise((resolve) => setTimeout(resolve, 0))
      const marker = g().__DSH_FORGE_CLIENT__ as { selfCheck?: { rpcProbe?: string } }
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
