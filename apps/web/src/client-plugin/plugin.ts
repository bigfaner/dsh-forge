// 产品 client 插件本体（定位：装配——可测纯面；入口 index.ts 零导出保 classic script 形状）。
// 2.7：槽位路线 A —— 替换官方 ui-sidebar 壳 sidebar.workspaces 洞位（tech-design
// Integration）与品牌行内容洞位（sidebar.brand.mark/name）；壳级几何/收展/新会话/快捷键
// 全部白拿（AC1）。组件本体不进本 bundle（classic script 自含纪律 + React 单例）——经壳
// bundle 发布面 __DSH_FORGE_VIEWS__ 递达（缺席 = 装配断裂 fail-loud）。
// fix-25 架构重排（官方头部链点亮）：main.conversation 影子退役——官方 ConversationRoot
// 渲染中区，官方头部链（conversation.header → session.header → lineage/actions/
// utilities「打开方式」+「⋯」/corner 官方 ExpandButton）与官方页签行/内容面全部白拿
// （slot runtime 的 renderSlot 授权按占用者注册行自声明 children 发放、子槽声明全局
// 唯一——产品影子恒拿不到官方子座渲染权，fix-23 探针实证；官方占用者自带声明即恒亮）。
// 产品面降位官方缝（本插件的全部登记）：
//   - `main` keyed 'dswf-hero' / 'dswf-knowledge'（ui-layout 官方全局面板径——先例
//     ui-plugin-manager/ui-schedule）：UF-2 零项目 hero 引导 + UF-5 知识视图；
//   - `sidebar.panellist` 'dswf-knowledge'（官方 PanelRow 行语言——知识入口）；
//   - `conversation.view` 'dswf-recall'（官方页签 roster——ui-trajectory 同型先例）：
//     UF-4 知识召回页签（对话 = 官方 'chat' 直用；轨迹 = 官方 'trajectory' 直用——fix-29
//     退役产品 'dswf-trajectory' 复刻，同名册双『轨迹』页签冲突随降位显形）；
//   - `shell.overlay` 'dswf-host'（AppFrame root 五子槽之一——常驻壳宿主：UF-3 流程 +
//     相位锚 + hero 面板驱动 + 知识模式右栏联动面）。
// 契约依据（上游 0.2.0-rc.2 源码核实）：ui-slots SlotCore——single 槽 priority 升序最低者
// 渲染（lowest renders），同 priority 再注册即抛（官方占用者缺省 0 → 产品行 -100 影子）；
// keyed 槽按 key 唯一；list 槽按 (id, priority) 唯一、order 升序。SlotRegistry.inject(key, cb)：
// 洞位声明在场（或入座时）装 cb 效果，随本插件 fiber 卸载级联回收。
// 运行期锚（e2e 实证，2.7）：插件长活依赖 profile 置停 client-hmr——其全图 sync 会以宿主
// 最新图对账掉壳掌舵追加的本行，见 apps/host profile cordis.patch.yml 的 client-hmr 行。
import type { ModuleLoaderFacade } from '../shell/dsh-globals.js'

/** 插件 id（= 注册键 = Loader entry 名 = 掌舵入图 id；与 shell/boot.ts 掌舵参数同源） */
export const FORGE_CLIENT_PLUGIN_ID = '@dsh-forge/web-client'

/** 洞名：官方 sidebar 壳的工作区浏览区（本项目树 + 会话列表占用此洞——AC1 替换目标） */
export const SIDEBAR_WORKSPACES_SLOT = 'sidebar.workspaces'
/** 洞名：品牌行字标 / 字名（壳拥有品牌行；内容洞位 = 产品品牌件） */
export const SIDEBAR_BRAND_MARK_SLOT = 'sidebar.brand.mark'
export const SIDEBAR_BRAND_NAME_SLOT = 'sidebar.brand.name'
/**
 * 洞名：ui-layout AppFrame root 五子槽——keyed main 面板 roster（官方全局面板径）。
 * 产品占用：'dswf-hero'（零项目引导）/ 'dswf-knowledge'（知识视图）；key 字面量与
 * workbench/panel-model.ts 的 HERO_PANEL_KEY/KNOWLEDGE_PANEL_KEY 同源（plugin.test pin）。
 */
export const MAIN_SLOT = 'main'
/** 产品 hero 面板 key（= main keyed 登记键；字面量同源 panel-model.HERO_PANEL_KEY） */
export const HERO_PANEL_KEY = 'dswf-hero'
/** 产品知识面板 key（= main keyed 登记键 = sidebar.panellist 行 id；同源 panel-model.KNOWLEDGE_PANEL_KEY） */
export const KNOWLEDGE_PANEL_KEY = 'dswf-knowledge'
/** 洞名：官方 sidebar 全局面板行 roster（官方 PanelRow 行语言——知识入口载体） */
export const SIDEBAR_PANELLIST_SLOT = 'sidebar.panellist'
/** 洞名：官方会话视图 roster（ConversationSessionHeader 页签行 + 视图区 only:id 消费） */
export const CONVERSATION_VIEW_SLOT = 'conversation.view'
/**
 * 洞名：官方新会话 hero 工作区选择/切换控件（ConversationContent heroWorkspaceRow 弹层——
 * single/root；fix-24 ① 影子占用改列项目。chip 触发器归官方 owner 渲染，文案经 core
 * 注册链 workspaces.rename 标题对齐项目名达成——非影子替换面）
 */
export const HERO_WORKSPACE_SLOT = 'conversation.hero.workspace'
/** 洞名：AppFrame root 五子槽——常驻覆盖层（壳宿主挂点，不随 main 面板互换卸载） */
export const SHELL_OVERLAY_SLOT = 'shell.overlay'
/** 影子优先级（single 槽 lowest renders；官方占用者缺省 0 → -100 = 产品面板替换占用者） */
export const SIDEBAR_SHADOW_PRIORITY = -100
/** 产品页签登记 id（知识召回——UF-4 三页签之三；轨迹 = 官方 'trajectory' 直用，fix-29） */
export const RECALL_VIEW_ID = 'dswf-recall'

/**
 * 插件依赖的服务名（cordis inject——apply 等待七服务在场；与官方 ui-workspace 同型先例）。
 * sidebarRight（fix-23）：官方 ui-sidebar-right 服务——知识模式右栏隐藏/恢复联动窄面。
 * layout（fix-25）：官方 ui-layout 服务——面板选择窄面（selectPanel：知识/hero 面板互换 +
 * 官方 openSession 同径 null 收口回会话）。
 * locale（fix-33 ⑧）：官方 dsh-client-locale 服务——行 label 走 locale NS（官方
 * ui-trajectory 同径先例：register(NS, {zh,en}) + bind(NS) + label thunk）。
 */
export const FORGE_CLIENT_INJECT = [
  'slots',
  'sessions',
  'uiWorkspace',
  'workspaces',
  'sidebarRight',
  'layout',
  'locale',
] as const

/** 产品 locale 命名空间（官方 locale 服务词典登记键——LOCALE_IDS = zh/en） */
export const FORGE_LOCALE_NS = 'dsh-forge'

/** dsh 槽位服务窄面（结构同型镜像——bundle 零外部 import） */
export interface ForgeSlotsService {
  /** 依赖洞位声明：声明在场（或入座）即装 cb；cb 返回即释放器（随 fiber 卸载级联） */
  inject(key: string, callback: () => (() => void) | undefined): () => void
  /** 注册占用者（options.name = 洞名；key = keyed 槽键；id/order = list 槽行；priority = single 槽影子序。
   * label = 字符串或 thunk（fix-33 ⑧：thunk 随 active locale 逐读——官方 SlotLabel 形状）；
   * locale = 行 label 所属命名空间（登记面声明，官方 roster 消费） */
  register(options: {
    name: string
    priority?: number
    key?: string
    id?: string
    order?: number
    label?: string | (() => string)
    locale?: string
    inject?: () => object
  }, component: unknown): () => void
}

/** dsh 会话服务窄面（ISessions 消费切片：账本快照源——Session Controller client 无 open 面） */
export interface ForgeSessionsService {
  /** 会话账本快照源（实时读——零缓存零副本的源本体） */
  readonly list: unknown
}

/**
 * dsh 工作区 UI 服务窄面（UiWorkspace 消费切片）。fix-11：会话行打开的正确官方面 =
 * uiWorkspace.openSession（内部 retain(mainView) + selection 一体 + layout.selectPanel(null)
 * 回会话面板——历史恢复经此驱动）。
 */
export interface ForgeUiWorkspaceService {
  /** 选择会话为当前并呈现其会话面（官方导航动作面） */
  openSession(target: string): void
}

/** dsh workspace 服务窄面（IWorkspaces 消费切片：归属快照源） */
export interface ForgeWorkspacesService {
  readonly list: unknown
}

/**
 * 官方右栏服务窄面（ui-sidebar-right ISidebarRight 消费切片，fix-23）。知识模式右栏
 * 隐藏/恢复联动的官方动作面（收展态本体 = 官方 per-session store 自持——产品不落地副本）。
 */
export interface ForgeSidebarRightService {
  /** 右栏当前展开态（collapsed 或无在场面 = false） */
  isExpanded(): boolean
  /** 收起 ↔ 展开并聚焦活动窗格（官方导航动作面；无在场面抛错——调用面守卫） */
  toggleExpanded(): void
}

/** 官方面板信息快照（ui-layout layout.panelInfo 消费切片） */
export interface ForgePanelInfo {
  readonly activePanelId: string | null
}

/** 官方布局服务窄面（ui-layout LayoutController 消费切片，fix-25） */
export interface ForgeLayoutService {
  /** 选中全局 main 面板或回官方会话面板（null；未注册 id 抛错——调用面守卫） */
  selectPanel(panelId: string | null): void
  /** 中央面板选择快照源（activePanelId——知识模式联动/视图镜像源） */
  readonly panelInfo: {
    getSnapshot(): ForgePanelInfo
    subscribe(listener: () => void): () => void
  }
}

/**
 * 官方 locale 服务窄面（dsh-client-locale LocaleFace 消费切片，fix-33 ⑧——结构同型镜像）。
 * 官方 ui-trajectory 同径：register(NS, {zh,en}) 登记词典（返回撤销器）+ bind(NS) 取
 * 翻译器（缺席词条回退 en → key 本身——零字典面不炸）。
 */
export interface ForgeLocaleService {
  /** 登记命名空间词典（同 ns+locale 重复登记抛错——一次登记面）；返回撤销器 */
  register(ns: string, dicts: Readonly<Record<string, Readonly<Record<string, string>>>>): () => void
  /** 绑定命名空间翻译器（label thunk 消费——active locale 切换逐读生效） */
  bind(ns: string): (key: string) => string
}

/** 产品视图发布面窄面（product-views.ts 结构同型镜像） */
export interface ForgeViewsGlobal {
  __DSH_FORGE_VIEWS__?: {
    ForgeSidebarSlot: unknown
    ForgeBrandMark: unknown
    ForgeBrandName: unknown
    ForgeShellHost: unknown
    ForgeHeroPanel: unknown
    ForgeKnowledgePanel: unknown
    ForgeKnowledgeGlyph: unknown
    ForgeRecallView: unknown
    ForgeHeroWorkspacePicker: unknown
    createWorkbenchBridge: (nav: {
      showKnowledge(): void
      showSession(): void
    }) => {
      openKnowledgeEntry(entryId: number): void
      subscribe(listener: () => void): () => void
      getSnapshot(): { drawerEntryId: number | null }
      setDrawerEntry(entryId: number | null): void
    }
  }
}

/** 插件 apply 的 ctx 窄面（cordis Context 消费切片——get 解析注入服务） */
export interface ForgeClientCtx {
  readonly slots: ForgeSlotsService
  get(
    name: 'sessions' | 'uiWorkspace' | 'workspaces' | 'sidebarRight' | 'layout' | 'locale',
  ): unknown
}

/** cordis 插件最小结构面（免引 cordis 运行时——bundle 零外部 import，保 classic script 形状） */
export interface ForgeClientPlugin {
  readonly name: string
  readonly inject: readonly string[]
  apply(ctx: unknown): void
}

/** 槽位注册诊断（registered = 声明回调内实际落座的洞位；error = 注册链失败因——e2e/排障面） */
export interface SlotRegistrationDiagnostics {
  readonly registered?: readonly string[]
  readonly error?: string
}

/** 激活自证面（e2e 消费；先于槽位注册立标——注册失败不断 e2e 面） */
export interface ForgeClientActiveMarker {
  readonly plugin: string
  readonly activatedAt: number
  /** sidebar 族洞位（workspaces 替换 + 品牌行内容） */
  readonly sidebar?: SlotRegistrationDiagnostics
  /** 官方 main 面板族（hero/knowledge 全局面板 + panellist 行） */
  readonly center?: SlotRegistrationDiagnostics
  /** 官方 conversation 族页签/控件（知识召回单登记 + hero 工作区控件影子——fix-24 ①） */
  readonly views?: SlotRegistrationDiagnostics
  /** 常驻壳宿主（shell.overlay——流程宿主/相位锚/联动面载体） */
  readonly shell?: SlotRegistrationDiagnostics
}

/** 洞位注册一行（注入面经 make 产出；落座后回填诊断） */
function registerSlotEntry(
  ctx: ForgeClientCtx,
  key: string,
  diagnostics: { registered?: string[] },
  make: () => (() => void) | undefined,
): void {
  ctx.slots.inject(key, () => {
    const dispose = make()
    diagnostics.registered = [...(diagnostics.registered ?? []), key]
    return dispose
  })
}

/** 取产品视图发布面（缺席 = 装配断裂：壳 bundle 未发布/被裁——fail-loud 不静默降级） */
export function publishedViews(): NonNullable<ForgeViewsGlobal['__DSH_FORGE_VIEWS__']> {
  const views = (globalThis as ForgeViewsGlobal).__DSH_FORGE_VIEWS__
  if (views === undefined) {
    throw new Error(
      'dsh-forge web-client: __DSH_FORGE_VIEWS__ 发布面缺席（main.ts product-views 未求值）——槽位替换组件源断裂',
    )
  }
  return views
}

/** 插件本体（client bundle factory 的返回值 = 模块 exports）。 */
export function forgeClientPlugin(): ForgeClientPlugin {
  return {
    name: FORGE_CLIENT_PLUGIN_ID,
    inject: [...FORGE_CLIENT_INJECT],
    apply(ctx: unknown) {
      const sidebarDiagnostics: { registered?: string[]; error?: string } = {}
      const centerDiagnostics: { registered?: string[]; error?: string } = {}
      const viewsDiagnostics: { registered?: string[]; error?: string } = {}
      const shellDiagnostics: { registered?: string[]; error?: string } = {}
      const marker: ForgeClientActiveMarker = {
        plugin: FORGE_CLIENT_PLUGIN_ID,
        activatedAt: Date.now(),
        sidebar: sidebarDiagnostics,
        center: centerDiagnostics,
        views: viewsDiagnostics,
        shell: shellDiagnostics,
      }
      ;(globalThis as { __DSH_FORGE_CLIENT__?: ForgeClientActiveMarker }).__DSH_FORGE_CLIENT__ = marker
      const clientCtx = ctx as ForgeClientCtx
      // fix-33 ⑥ 缝族对称性：apply 中途抛错时桥/词典的补撤销面（catch 消费）——发布于
      // apply 期的资源不再只依赖 overlay 洞 dispose 撤销（apply 半途死闭包不残留）
      let revokeBridgeAndLocale: (() => void) | undefined
      try {
        const views = publishedViews()
        const sessions = clientCtx.get('sessions') as ForgeSessionsService
        const uiWorkspace = clientCtx.get('uiWorkspace') as ForgeUiWorkspaceService
        const workspaces = clientCtx.get('workspaces') as ForgeWorkspacesService
        const sidebarRight = clientCtx.get('sidebarRight') as ForgeSidebarRightService
        const layout = clientCtx.get('layout') as ForgeLayoutService
        const locale = clientCtx.get('locale') as ForgeLocaleService

        // fix-33 ⑧ 行 label locale 面（官方 ui-trajectory 同径）：登记产品词典（zh 缺省
        // 文案不变；en 补英文）+ 绑定翻译器——label thunk 逐读，active locale 切换免重注册
        const disposeLocale = locale.register(FORGE_LOCALE_NS, {
          zh: { 'panel.knowledge': '知识库', 'view.recall': '知识召回' },
          en: { 'panel.knowledge': 'Knowledge', 'view.recall': 'Recall' },
        })
        const t = locale.bind(FORGE_LOCALE_NS)

        // 工作台桥（fix-25：官方面板导航窄面 + 知识抽屉缝）。
        // publishWorkbenchBridge 双径原因（fix-33 ⑥ 注记）：发布在 apply 期（早于任何槽位
        // 入座——knowledge 面板 inject face 与召回视图跳转在挂载时即消费桥，overlay 洞
        // 物化次序不保证先于它们）；撤销随 shell.overlay 洞 dispose（本插件唯一的 fiber
        // 卸载级联回收面）+ apply catch 补撤销（半成型失败不残留死闭包——桥持有官方
        // layout 闭包，插件已废而桥面仍活会路由进废 ctx）。缺席期导航 fail-soft no-op。
        const bridge = views.createWorkbenchBridge({
          showKnowledge: (): void => {
            layout.selectPanel(KNOWLEDGE_PANEL_KEY)
          },
          showSession: (): void => {
            layout.selectPanel(null)
          },
        })
        revokeBridgeAndLocale = (): void => {
          ;(globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__ = undefined
          disposeLocale()
        }

        // 工作区洞位替换（AC1）：注入面携带 dsh 面数据源与动作（面板侧 useSyncExternalStore 直读）
        registerSlotEntry(clientCtx, SIDEBAR_WORKSPACES_SLOT, sidebarDiagnostics, () =>
          clientCtx.slots.register(
            {
              name: SIDEBAR_WORKSPACES_SLOT,
              priority: SIDEBAR_SHADOW_PRIORITY,
              inject: () => ({
                sessions: sessions.list,
                workspaces: workspaces.list,
                openSession: (sessionId: string): void => {
                  // 官方导航动作面（fix-11：uiWorkspace.openSession——会话选择+呈现一体，
                  // 内部 selectPanel(null) 回会话面板 = UF-5 切回主路径）
                  uiWorkspace.openSession(sessionId)
                },
              }),
            },
            views.ForgeSidebarSlot,
          ),
        )

        // 品牌行内容洞位（行本体与新会话快捷交互归壳——AC3 品牌行点击 = 官方 startSession）
        registerSlotEntry(clientCtx, SIDEBAR_BRAND_MARK_SLOT, sidebarDiagnostics, () =>
          clientCtx.slots.register(
            { name: SIDEBAR_BRAND_MARK_SLOT, priority: SIDEBAR_SHADOW_PRIORITY },
            views.ForgeBrandMark,
          ),
        )
        registerSlotEntry(clientCtx, SIDEBAR_BRAND_NAME_SLOT, sidebarDiagnostics, () =>
          clientCtx.slots.register(
            { name: SIDEBAR_BRAND_NAME_SLOT, priority: SIDEBAR_SHADOW_PRIORITY },
            views.ForgeBrandName,
          ),
        )

        // 官方 main 面板族（fix-25 降位载体）：hero（零项目引导——ShellHost 驱动选中/让位）+
        // knowledge（UF-5 知识视图——桥注入抽屉缝；useWorkspaces 官方 root 钩子直达）
        registerSlotEntry(clientCtx, MAIN_SLOT, centerDiagnostics, () =>
          clientCtx.slots.register(
            { name: MAIN_SLOT, key: HERO_PANEL_KEY },
            views.ForgeHeroPanel,
          ),
        )
        registerSlotEntry(clientCtx, MAIN_SLOT, centerDiagnostics, () =>
          clientCtx.slots.register(
            { name: MAIN_SLOT, key: KNOWLEDGE_PANEL_KEY, inject: () => ({ bridge }) },
            views.ForgeKnowledgePanel,
          ),
        )

        // 官方面板行（sidebar.panellist——官方 PanelRow 行语言；id = main key 同源；
        // fix-33 ⑧ label 经 locale NS thunk——active locale 切换免重注册）
        registerSlotEntry(clientCtx, SIDEBAR_PANELLIST_SLOT, centerDiagnostics, () =>
          clientCtx.slots.register(
            {
              name: SIDEBAR_PANELLIST_SLOT,
              id: KNOWLEDGE_PANEL_KEY,
              order: 20,
              locale: FORGE_LOCALE_NS,
              label: (): string => t('panel.knowledge'),
            },
            views.ForgeKnowledgeGlyph,
          ),
        )

        // 官方页签 roster（conversation.view——UF-4 知识召回单登记；对话 = 官方 'chat' 直用、
        // 轨迹 = 官方 'trajectory' 直用——fix-29 退役产品复刻，同 order 10 双『轨迹』冲突不再；
        // label 经 locale NS thunk——fix-33 ⑧）
        registerSlotEntry(clientCtx, CONVERSATION_VIEW_SLOT, viewsDiagnostics, () =>
          clientCtx.slots.register(
            {
              name: CONVERSATION_VIEW_SLOT,
              id: RECALL_VIEW_ID,
              order: 20,
              locale: FORGE_LOCALE_NS,
              label: (): string => t('view.recall'),
              inject: () => ({
                openKnowledgeEntry: (entryId: number): void => {
                  bridge.openKnowledgeEntry(entryId)
                },
              }),
            },
            views.ForgeRecallView,
          ),
        )

        // hero 工作区控件影子（fix-24 ①——single 槽 -100 lowest renders 取官方 WorkspacePicker
        // 弹层渲染位，改列 forge 项目；owner 契约（open/anchorRef/selectedId/onPick/onClose）零
        // 变化。不声明 children：官方登记行恒在场供养 conversation.hero.workspace.directoryFlow
        // 子洞（ui-slots register 对已声明子槽重声明即 throw——fix-23 runtime 实证；影子只取
        // 渲染位不撤官方登记），fix-14/16 原生选取链不断）
        registerSlotEntry(clientCtx, HERO_WORKSPACE_SLOT, viewsDiagnostics, () =>
          clientCtx.slots.register(
            { name: HERO_WORKSPACE_SLOT, priority: SIDEBAR_SHADOW_PRIORITY },
            views.ForgeHeroWorkspacePicker,
          ),
        )

        // 常驻壳宿主（shell.overlay——UF-3 流程宿主 + 相位/视图镜像锚 + hero 面板驱动 +
        // 知识模式右栏联动面；selectPanel/rightbar 官方窄面经 inject 递达）。卸载期顺带
        // 撤销桥发布与 locale 词典 + 清 __DSH_FORGE_CLIENT__ 激活标记（fix-33 ⑥ 标记
        // 卸载不清收口——本插件 fiber 卸载的唯一级联回收面；缺席期导航 fail-soft no-op）
        registerSlotEntry(clientCtx, SHELL_OVERLAY_SLOT, shellDiagnostics, () => {
          const dispose = clientCtx.slots.register(
            {
              name: SHELL_OVERLAY_SLOT,
              id: 'dswf-host',
              inject: () => ({
                selectPanel: {
                  selectPanel: (panelId: string | null): void => {
                    layout.selectPanel(panelId)
                  },
                },
                rightbar: {
                  isExpanded: (): boolean => sidebarRight.isExpanded(),
                  toggleExpanded: (): void => {
                    sidebarRight.toggleExpanded()
                  },
                },
              }),
            },
            views.ForgeShellHost,
          )
          return () => {
            dispose()
            ;(globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__ = undefined
            ;(globalThis as { __DSH_FORGE_CLIENT__?: ForgeClientActiveMarker | undefined }).__DSH_FORGE_CLIENT__ = undefined
            disposeLocale()
          }
        })
      } catch (error) {
        // fix-33 ⑥：apply 中途抛错——桥/词典已发布即补撤销（死闭包不残留：桥持有官方
        // layout 闭包，插件已废而桥面仍活会路由进废 ctx；词典残留阻塞同 ns 重复登记）
        revokeBridgeAndLocale?.()
        const message = error instanceof Error ? error.message : String(error)
        sidebarDiagnostics.error = message
        centerDiagnostics.error = message
        viewsDiagnostics.error = message
        shellDiagnostics.error = message
      }
    },
  }
}

/** 注册进 __ModuleLoader__（queue 态入待载队列、live 态直注；缺席 = 装配断裂 fail-loud）。 */
export function registerForgeClient(loader: ModuleLoaderFacade): void {
  loader.load({
    id: FORGE_CLIENT_PLUGIN_ID,
    factory: () => forgeClientPlugin() as unknown as Record<string, unknown>,
  })
}

/** 注册面读取器（测试注入 fake 用；生产面 = 页面全局 __ModuleLoader__）。 */
export function moduleLoaderFacade(): ModuleLoaderFacade {
  const loader = (globalThis as { __ModuleLoader__?: ModuleLoaderFacade }).__ModuleLoader__
  if (loader === undefined) {
    throw new Error('dsh-forge web-client: window.__ModuleLoader__ 注册面缺席（bundle 未经 boot 注入/掌舵装载）')
  }
  return loader
}
