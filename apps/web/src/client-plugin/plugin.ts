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
//     相位锚 + hero 面板驱动 + 知识模式右栏联动面 + 派发任务悬浮面板宿主[m3.1 D5/D6：
//     会话头挂接 pill 自 conversation.session.header.actions 槽位卸载退役——监视面迁
//     对话列内浮层，经 ShellHost 常驻树直挂]）。
//   - `settings.section` 'dswf-forge-settings'（官方 ui-settings SettingsRoot 分区 roster
//     ——list 槽：4.7 Integration #4，UF-2 Forge设置 分区[通用设置正下方 order 5]；分区
//     本体 = 4.5 组件经壳 bundle 发布面递达，打开/关闭/Esc 生命周期恒归官方对话框）。
// 契约依据（上游 0.2.0-rc.2 源码核实）：ui-slots SlotCore——single 槽 priority 升序最低者
// 渲染（lowest renders），同 priority 再注册即抛（官方占用者缺省 0 → 产品行 -100 影子）；
// keyed 槽按 key 唯一；list 槽按 (id, priority) 唯一、order 升序。SlotRegistry.inject(key, cb)：
// 洞位声明在场（或入座时）装 cb 效果，随本插件 fiber 卸载级联回收。
// 运行期锚（e2e 实证，2.7）：插件长活依赖 profile 置停 client-hmr——其全图 sync 会以宿主
// 最新图对账掉壳掌舵追加的本行，见 apps/host profile cordis.patch.yml 的 client-hmr 行。
import type { ModuleLoaderFacade } from '../shell/dsh-globals.js'
// 4.6 打开新会话编排器（open-session.ts = 纯模块零 import——bundle 自含纪律不破）
import {
  createOpenSessionOrchestrator,
  openSessionPlatformFrom,
  type ComposerInputFace,
  type OpenSessionBinding,
  type OpenSessionConversation,
  type OpenSessionOrchestrator,
  type OpenSessionServices,
  type PresetSelectResult,
} from './open-session.js'

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
/**
 * 洞名：官方右栏 tab 体 keyed 槽（ui-sidebar-right seat——dispatch 键 = tab 类型定义
 * id）。产品占用两键：'dswf-overview' / 'dswf-doc'（4.1 两段注册的第二段；第一段 =
 * sidebarRightTabs 服务面类型定义——见 registerDockTabs）。
 */
export const SIDEBAR_RIGHT_PANE_TAB_SLOT = 'sidebar.right.pane.tab'
/** 概览 tab 类型 kind = keyed body 键（= tab 定义 id；与 workbench/dock-tabs DSWF_OVERVIEW_TAB_KIND 字面量同源 pin） */
export const OVERVIEW_TAB_KIND = 'dswf-overview'
/** 文档 tab 类型 kind = keyed body 键（multiple + address 去重；与 dock-tabs DSWF_DOC_TAB_KIND 同源 pin） */
export const DOC_TAB_KIND = 'dswf-doc'
/** 文档 tab 资源地址前缀（dsh-resource:// 资源面——openResource 去重键 = 地址本身；与 dock-tabs DSWF_DOC_ADDRESS_PREFIX 同源 pin） */
export const DOC_ADDRESS_PREFIX = 'dsh-resource://dswf-doc/'
/** 影子优先级（single 槽 lowest renders；官方占用者缺省 0 → -100 = 产品面板替换占用者） */
export const SIDEBAR_SHADOW_PRIORITY = -100
/** 产品页签登记 id（知识召回——UF-4 三页签之三；轨迹 = 官方 'trajectory' 直用，fix-29） */
export const RECALL_VIEW_ID = 'dswf-recall'
/**
 * 洞名：官方会话头标题邻位动作带（ConversationSessionHeader headerActions——list 槽，
 * scope session）。m3.1 D5：产品挂接 pill 登记退役（会话头零挂件——官方动作带其它占用者
 * 不动；派发任务监视面迁对话列内悬浮面板，经 ShellHost 常驻树挂载）。常量保留 = 卸载
 * 断言锚（plugin.test D5 零登记 pin + e2e 会话头零产品 pill）。
 */
export const SESSION_HEADER_ACTIONS_SLOT = 'conversation.session.header.actions'
/**
 * 洞名：官方设置对话框分区 roster（ui-settings SettingsRoot nav 列 + 内容列 only 消费
 * ——list 槽 scope root；4.7 Integration #4）。分区本体自带容器/标题（4.5 组件注入即整节）
 * ——注册零平台 fork（打开/关闭/Esc 生命周期恒归官方对话框）。
 */
export const SETTINGS_SECTION_SLOT = 'settings.section'
/** Forge设置 分区登记 id（nav 行键 = 官方 only 过滤键——「通用设置」= 官方 'general'） */
export const FORGE_SETTINGS_SECTION_ID = 'dswf-forge-settings'
/**
 * 分区登记序（list 槽 order 升序）：官方分区 general=0 / models=10 / plugins=15（上游
 * ui-settings-{general,models,plugins} client.js 源码核实）→ 5 = 通用设置正下方、
 * 模型之上（ui-design UF-2 Placement「通用设置分区下方」；DOM 序 = nav 行升序直出）。
 */
export const FORGE_SETTINGS_SECTION_ORDER = 5

/**
 * 插件依赖的服务名（cordis inject——apply 等待八服务在场；与官方 ui-workspace 同型先例）。
 * sidebarRight（fix-23）：官方 ui-sidebar-right 服务——知识模式右栏隐藏/恢复联动窄面。
 * layout（fix-25）：官方 ui-layout 服务——面板选择窄面（selectPanel：知识/hero 面板互换 +
 * 官方 openSession 同径 null 收口回会话）。
 * locale（fix-33 ⑧）：官方 dsh-client-locale 服务——行 label 走 locale NS（官方
 * ui-trajectory 同径先例：register(NS, {zh,en}) + bind(NS) + label thunk）。
 * sidebarRightTabs（4.1）：官方右栏 tab 类型注册表（两段注册第一段——tech-design
 * Integration #3；「adding a type is a registration, never an edit」官方口径）。
 */
export const FORGE_CLIENT_INJECT = [
  'slots',
  'sessions',
  'uiWorkspace',
  'workspaces',
  'sidebarRight',
  'sidebarRightTabs',
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
 * 回会话面板——历史恢复经此驱动）。fix-42：项目行尾「新会话」钮 = uiWorkspace.startSession
 * （reuse-or-create blank + 呈现一体——官方 WorkspaceBrowser 同径动作面）。
 * m3.1 D6：openSession 增地址形态入参（官方 SessionTarget——上游 ui-subagent openChild
 * 同径：子会话经 {parentSessionId, childSessionId, mode} 打开，面包屑/只读 composer 等
 * subagent 呈现随官方 selection.subagentAddress 到场）。
 */
export interface ForgeUiWorkspaceService {
  /** 选择会话为当前并呈现其会话面（官方导航动作面；子会话 = SubagentAddress 形态） */
  openSession(target: string | ForgeSubagentOpenAddress): void
  /** 工作区新会话流（官方 UiWorkspaceService.startSession——复用/新建空白会话并打开） */
  startSession(workspaceId?: string): void
}

/**
 * 官方子会话打开地址（上游 SubagentAddress 消费切片——mode 'unknown' = 读取子历史时
 * 解析；上游 dsh-subagent/control-types 契约）。m3.1 D6：悬浮面板 ⟞ 打开 worker 执行
 * 子会话的载荷形态（官方 ui-subagent openChild 同径）。
 */
export interface ForgeSubagentOpenAddress {
  readonly parentSessionId: string
  readonly childSessionId: string
  readonly mode: 'unknown'
}

/**
 * 会话行父会话判读（纯函数——m3.1 D6 ⟞ 开面）：账本快照窄读 byId[sessionId].parentId
 * （形状漂移/缺席/异常 = undefined 走平开）。子会话在场 = 地址形态打开（官方 openChild
 * 同径），顶层会话 = 平开（e2e 合成执行会话等非子会话径）。
 */
export function sessionParentIdOf(list: unknown, sessionId: string): string | undefined {
  if (typeof list !== 'object' || list === null) return undefined
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return undefined
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return undefined
  }
  if (typeof snapshot !== 'object' || snapshot === null) return undefined
  const row = (snapshot as { byId?: Record<string, { parentId?: unknown }> }).byId?.[sessionId]
  return typeof row?.parentId === 'string' ? row.parentId : undefined
}

/** ⟞ 打开目标推导（纯函数）：父会话在场 = 地址形态；缺席 = 平开会话 id */
export function workerOpenTarget(
  parentId: string | undefined,
  childSessionId: string,
): string | ForgeSubagentOpenAddress {
  return parentId === undefined
    ? childSessionId
    : { parentSessionId: parentId, childSessionId, mode: 'unknown' }
}

/** dsh workspace 服务窄面（IWorkspaces 消费切片：归属快照源） */
export interface ForgeWorkspacesService {
  readonly list: unknown
}

/**
 * dsh 右栏服务窄面（ui-sidebar-right ISidebarRight 消费切片，fix-23）。知识模式右栏
 * 隐藏/恢复联动的官方动作面（收展态本体 = 官方 per-session store 自持——产品不落地副本）。
 * 4.2 增导航面 openTab（挂接 pill 点击 → dock 开概览 tab——openTab 自带 reveal 列）。
 * m3.1 D21/D23 增 openResource（官方导航控制器资源面——ShellHost 弹窗参考 chip 开文档
 * tab：服务面直达在屏会话右栏，官方 placeResource 列展开一体）。
 */
export interface ForgeSidebarRightService {
  /** 右栏当前展开态（collapsed 或无在场面 = false） */
  isExpanded(): boolean
  /** 收起 ↔ 展开并聚焦活动窗格（官方导航动作面；无在场面抛错——调用面守卫） */
  toggleExpanded(): void
  /**
   * 按类型开出页型 tab（官方导航面——展开列 + reveal 去重 + 记录导航；无在场面抛错，
   * 调用面 fail-soft）。4.2 消费：openTab('dswf-overview')——UF-3 流程 7 dock 开概览。
   */
  openTab(kind: string): void
  /**
   * 按地址开出资源 tab（官方导航控制器——claim/place/reveal 一体；非 dsh-resource://
   * 地址或无类型认领抛错，调用面 fail-soft）。m3.1 消费：ShellHost 弹窗参考 chip。
   */
  openResource(address: string, options?: { readonly kind?: string }): void
}

/**
 * 官方右栏 tab 类型注册表窄面（ui-sidebar-right SidebarRightTabRegistry 消费切片，4.1
 * 两段注册第一段）。定义 = 纯静态面（地址识别/优先带/chip 标题/guide 入口卡）；keyed
 * body = 第二段 `sidebar.right.pane.tab` 槽注册（dispatch 键 = 定义 id）。guide 入口拾取
 * 的原位替换（replaceTab）由官方 GuideBody 承载（`tab.actions.openTab(kind,
 * {replaceTab:true})`——上游实现核实，产品零代码）。
 */
export interface ForgeSidebarRightTabsService {
  /** 注册一个 tab 类型（本插件生命周期内有效；id 冲突/同带 kind 冲突抛错） */
  register(definition: {
    /** 实现身份（跨全部注册唯一——keyed body 的 dispatch 键） */
    readonly id: string
    /** 类型判别（openTab/openResource 具名面） */
    readonly kind: string
    /** 每次开出独立内容（资源面：contentId=地址各自成 tab；缺省 = 每窗格一页） */
    readonly multiple?: boolean
    /** 资源地址 glob（含 ':' 匹配整地址）；缺省 = 按类型开的页型 */
    readonly patterns?: readonly string[]
    /** 优先带（缺省 extension——产品外类型最高带） */
    readonly priority?: 'extension' | 'builtin' | 'fallback'
    /** 地址否决（具名开时仍生效——本插件用于文档地址前缀防御） */
    readonly canOpen?: (address: string) => boolean
    /** tab chip 标题（开时捕获入布局记录；每次使用逐读——语言切换免重注册） */
    readonly title: (address: string) => string
    /** 开始页入口卡（order 升序；拾取 = 官方 GuideBody replaceTab 开出本类型） */
    readonly guide?: readonly {
      readonly id: string
      readonly order: number
      readonly title: () => string
      readonly description?: () => string
    }[]
  }): () => void
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
    ForgeOverviewTab: unknown
    ForgeDocsTab: unknown
    ForgeHeroWorkspacePicker: unknown
    ForgeSettingsSection: unknown
    createWorkbenchBridge: (nav: {
      showKnowledge(): void
      showSession(): void
    }) => {
      openKnowledgeEntry(entryId: number): void
      subscribe(listener: () => void): () => void
      getSnapshot(): {
        drawerEntryId: number | null
        overview: { projectId: string | null }
        taskFocus: { taskId: string; featureSlug: string; nonce: number } | null
        drawerTaskId: string | null
        transitionFocus: { taskId: string; featureSlug: string; nonce: number } | null
      }
      setDrawerEntry(entryId: number | null): void
      setOverviewContext(context: { projectId: string | null }): void
      openTaskFocus(payload: { taskId: string; featureSlug: string }): void
      openTaskDrawer(taskId: string): void
      closeTaskDrawer(): void
      openTaskTransition(payload: { taskId: string }): void
    }
  }
}

/** 插件 apply 的 ctx 窄面（cordis Context 消费切片——get 解析注入服务） */
export interface ForgeClientCtx {
  readonly slots: ForgeSlotsService
  get(
    name:
      | 'sessions'
      | 'uiWorkspace'
      | 'workspaces'
      | 'sidebarRight'
      | 'sidebarRightTabs'
      | 'layout'
      | 'locale'
      | 'conversation',
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
  /** 官方 conversation 族页签/控件（知识召回单登记 + hero 工作区控件影子——fix-24 ① + 会话头挂接 pill——4.2） */
  readonly views?: SlotRegistrationDiagnostics
  /** 常驻壳宿主（shell.overlay——流程宿主/相位锚/联动面载体） */
  readonly shell?: SlotRegistrationDiagnostics
  /** 右栏 dock tab 族（4.1：两段注册——类型定义[概览/文档两 kind] + keyed body 两键） */
  readonly dock?: SlotRegistrationDiagnostics
  /** 官方设置对话框分区族（4.7：settings.section——UF-2 Forge设置 分区） */
  readonly settings?: SlotRegistrationDiagnostics
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

/** 发布面窄名（注册子函数的组件源入参类型） */
type PublishedViews = ReturnType<typeof publishedViews>
/** 工作台桥窄名（发布面工厂产物——center/views 两族的 inject 递达物） */
type PublishedBridge = ReturnType<PublishedViews['createWorkbenchBridge']>

/**
 * sidebar 族登记（fix-36 自 apply 拆出——按域分注册子函数，apply 仅编排）：工作区洞位
 * 替换（AC1——注入面携带 dsh 账本数据源与动作，面板侧 useSyncExternalStore 直读）+
 * 品牌行两内容洞位（行本体与新会话快捷交互归壳——AC3 品牌行点击 = 官方 startSession）。
 */
function registerSidebarSlots(
  ctx: ForgeClientCtx,
  views: PublishedViews,
  services: {
    readonly sessions: ForgeSessionsService
    readonly workspaces: ForgeWorkspacesService
    readonly uiWorkspace: ForgeUiWorkspaceService
  },
  diagnostics: { registered?: string[] },
): void {
  registerSlotEntry(ctx, SIDEBAR_WORKSPACES_SLOT, diagnostics, () =>
    ctx.slots.register(
      {
        name: SIDEBAR_WORKSPACES_SLOT,
        priority: SIDEBAR_SHADOW_PRIORITY,
        inject: () => ({
          sessions: services.sessions.list,
          workspaces: services.workspaces.list,
          openSession: (sessionId: string): void => {
            // 官方导航动作面（fix-11：uiWorkspace.openSession——会话选择+呈现一体，
            // 内部 selectPanel(null) 回会话面板 = UF-5 切回主路径）
            services.uiWorkspace.openSession(sessionId)
          },
          startSession: (workspaceId: string): void => {
            // 官方新会话流（fix-42：项目行尾「新会话」钮——uiWorkspace.startSession
            // reuse-or-create blank + 呈现一体，官方 WorkspaceBrowser 行动作同径）
            services.uiWorkspace.startSession(workspaceId)
          },
        }),
      },
      views.ForgeSidebarSlot,
    ),
  )
  registerSlotEntry(ctx, SIDEBAR_BRAND_MARK_SLOT, diagnostics, () =>
    ctx.slots.register(
      { name: SIDEBAR_BRAND_MARK_SLOT, priority: SIDEBAR_SHADOW_PRIORITY },
      views.ForgeBrandMark,
    ),
  )
  registerSlotEntry(ctx, SIDEBAR_BRAND_NAME_SLOT, diagnostics, () =>
    ctx.slots.register(
      { name: SIDEBAR_BRAND_NAME_SLOT, priority: SIDEBAR_SHADOW_PRIORITY },
      views.ForgeBrandName,
    ),
  )
}

/**
 * center 族登记（fix-36 自 apply 拆出）：官方 main 面板族（fix-25 降位载体）——hero（零
 * 项目引导——ShellHost 驱动选中/让位）+ knowledge（UF-5 知识视图——桥注入抽屉缝）+
 * sidebar.panellist 官方面板行（id = main key 同源；fix-33 ⑧ label 经 locale NS thunk）。
 */
function registerCenterPanels(
  ctx: ForgeClientCtx,
  views: PublishedViews,
  bridge: PublishedBridge,
  t: (key: string) => string,
  diagnostics: { registered?: string[] },
): void {
  registerSlotEntry(ctx, MAIN_SLOT, diagnostics, () =>
    ctx.slots.register(
      { name: MAIN_SLOT, key: HERO_PANEL_KEY },
      views.ForgeHeroPanel,
    ),
  )
  registerSlotEntry(ctx, MAIN_SLOT, diagnostics, () =>
    ctx.slots.register(
      { name: MAIN_SLOT, key: KNOWLEDGE_PANEL_KEY, inject: () => ({ bridge }) },
      views.ForgeKnowledgePanel,
    ),
  )
  registerSlotEntry(ctx, SIDEBAR_PANELLIST_SLOT, diagnostics, () =>
    ctx.slots.register(
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
}

/**
 * views 族登记（fix-36 自 apply 拆出）：官方页签 roster（conversation.view——UF-4 知识
 * 召回单登记；对话 = 官方 'chat' 直用、轨迹 = 官方 'trajectory' 直用——fix-29 退役产品
 * 复刻，同 order 10 双『轨迹』冲突不再；label 经 locale NS thunk——fix-33 ⑧）+ hero
 * 工作区控件影子（fix-24 ①——不声明 children：官方登记行恒在场供养
 * conversation.hero.workspace.directoryFlow 子洞，ui-slots register 对已声明子槽重声明
 * 即 throw——fix-23 runtime 实证；影子只取渲染位不撤官方登记，fix-14/16 原生选取链不断）。
 */
function registerConversationViews(
  ctx: ForgeClientCtx,
  views: PublishedViews,
  bridge: PublishedBridge,
  t: (key: string) => string,
  diagnostics: { registered?: string[] },
): void {
  registerSlotEntry(ctx, CONVERSATION_VIEW_SLOT, diagnostics, () =>
    ctx.slots.register(
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
  registerSlotEntry(ctx, HERO_WORKSPACE_SLOT, diagnostics, () =>
    ctx.slots.register(
      { name: HERO_WORKSPACE_SLOT, priority: SIDEBAR_SHADOW_PRIORITY },
      views.ForgeHeroWorkspacePicker,
    ),
  )
}

/**
 * 设置分区登记（4.7 Integration #4——M3 UF-2）：官方 ui-settings `settings.section`
 * list 槽新增产品分区行（官方 general=0/models=10/plugins=15 → order 5 = 通用设置正
 * 下方）。占用者 ForgeSettingsSection（壳 bundle 发布件——分区容器/标题/worker 小节
 * 自带，注入即整节；owner share close 由官方壳递达、组件零消费）。组件数据面自足
 * （preload RPC client——forge:settings/get·set 单门读写 core forgeSettings）；
 * m3.1 D25（blitz 1.2 结果性承接）：inject face 递达 loadModelCatalog（Provider/Model
 * 选项值 =「设置>模型」目录）；label 经 locale NS thunk（fix-33 ⑧）。
 * Hard Rule 非 fork 纪律不变：打开/关闭/Esc 生命周期恒归官方设置对话框（仅 slot 注册，
 * 无平台对话框代码复制）。
 */
function registerSettingsSection(
  ctx: ForgeClientCtx,
  views: PublishedViews,
  t: (key: string) => string,
  diagnostics: { registered?: string[] },
): void {
  registerSlotEntry(ctx, SETTINGS_SECTION_SLOT, diagnostics, () =>
    ctx.slots.register(
      {
        name: SETTINGS_SECTION_SLOT,
        id: FORGE_SETTINGS_SECTION_ID,
        order: FORGE_SETTINGS_SECTION_ORDER,
        locale: FORGE_LOCALE_NS,
        label: (): string => t('settings.forge'),
        inject: () => ({
          // m3.1 D25：模型目录装载器（remote.session.modelCatalog 惰性反射——缺席/失败 =
          // undefined，组件面静态目录回退）；settings get/set 仍 preload RPC 单门自足
          loadModelCatalog: buildModelCatalogLoader(ctx),
        }),
      },
      views.ForgeSettingsSection,
    ),
  )
}

/** 目录条目形状（组件面 WorkerProviderEntry 结构同型——bundle 自持纪律禁跨 chunk import） */
interface ModelCatalogEntry {
  readonly provider: string
  readonly models: readonly string[]
}

/** unknown → 对象窄化（缺席/非对象 = undefined） */
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined

/** 惰性服务读取（reflect.get——未 inject 服务的官方面；缺席/异常 = undefined fail-soft；
 * 5.2 e2e 勘误配方同 buildOpenSessionOrchestrator） */
function reflectServiceGet(ctx: ForgeClientCtx, name: string): unknown {
  try {
    const reflect = (ctx as { reflect?: { get(n: string): unknown } }).reflect
    return reflect?.get(name)
  } catch {
    return undefined
  }
}

/**
 * RemoteResult 信封解包（m3.1 D25）：`{ok:true, value:{groups:[{id, models:[{id}]}]}}`
 * → `[{provider, models}]`（provider = 路由 id，官方模型选择器同源口径）；他形（!ok /
 * 缺 groups）= undefined——组件面静态目录回退。
 */
function mapModelCatalogEnvelope(envelope: unknown): readonly ModelCatalogEntry[] | undefined {
  const result = asRecord(envelope)
  if (result === undefined || result['ok'] !== true) return undefined
  const groups = asRecord(result['value'])?.['groups']
  if (!Array.isArray(groups)) return undefined
  const entries: ModelCatalogEntry[] = []
  for (const group of groups) {
    const record = asRecord(group)
    const provider = typeof record?.['id'] === 'string' ? record['id'] : undefined
    if (provider === undefined || provider === '') continue
    const models = Array.isArray(record?.['models'])
      ? record['models']
          .map((model) => {
            const id = asRecord(model)?.['id']
            return typeof id === 'string' ? id : ''
          })
          .filter((id) => id !== '')
      : []
    entries.push({ provider, models })
  }
  return entries
}

/**
 * 模型目录装载器（m3.1 D25 = blitz 1.2 结果性承接）：惰性 ctx.reflect.get('remote.session')
 * （'remote' 嵌套双径）→ modelCatalog() 解信封 → [{provider, models}]。服务缺席 / 调用
 * 拒绝 / 信封失败 = resolve(undefined)——组件面静默回退静态目录，不炸设置分区装载。
 */
function buildModelCatalogLoader(
  ctx: ForgeClientCtx,
): () => Promise<readonly ModelCatalogEntry[] | undefined> {
  return () => {
    const sessionSvc =
      asRecord(reflectServiceGet(ctx, 'remote.session')) ??
      asRecord(asRecord(reflectServiceGet(ctx, 'remote'))?.['session'])
    const modelCatalog = sessionSvc?.['modelCatalog'] as (() => Promise<unknown>) | undefined
    if (typeof modelCatalog !== 'function') return Promise.resolve(undefined)
    try {
      return Promise.resolve(modelCatalog.call(sessionSvc)).then(mapModelCatalogEnvelope, () => undefined)
    } catch {
      return Promise.resolve(undefined)
    }
  }
}

/**
 * 文档地址 → chip 标题（末段文件名——`dsh-resource://dswf-doc/<id>/<docRel>` 末段；
 * 与 workbench/dock-tabs.tsx 地址编解码同源格式，plugin.test 字面量 pin 两侧一致）。
 */
function docTabTitle(address: string): string {
  const lastSlash = address.lastIndexOf('/')
  return lastSlash === -1 || lastSlash === address.length - 1 ? address : address.slice(lastSlash + 1)
}

/**
 * 打开新会话编排器组装（4.6 Integration #5 消费面）：openSessionPlatformFrom 真实服务
 * 适配——conversation / ctx.remote.agentPresets **调用期惰性解析**（不进 inject 数组：
 * 服务名核实无误前不承激活风险；缺席 = 各阶段 fail-soft 降级——create/draft 阶段错误
 * 上报，不炸壳）。uiWorkspace.openWorkspace 经结构探测（OQ#1 核实面：reuse-or-create
 * blank + beforeOpen 回传 sessionId）。
 *
 * 5.2 e2e 实证勘误（2026-10-08，SC1 自动对齐首跑）：cordis 4.0.4 的 ctx 属性/get 面
 * 对未 inject 服务**抛错**（`cannot get property "remote" without inject`——惰性属性
 * 读取 ≠ 缺席降级）。惰性配方修正 = `ctx.reflect.get(name)`（官方面：绕过 inject 义务
 * 的只读反射，缺席 = undefined——3.4 已裁决同配方）。conversation 同缝同修。
 */
function buildOpenSessionOrchestrator(
  clientCtx: ForgeClientCtx,
  uiWorkspace: ForgeUiWorkspaceService,
  sessions: ForgeSessionsService,
): OpenSessionOrchestrator {
  const asObject = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
  /** 惰性服务读取（reflect.get——未 inject 服务的官方面；缺席/异常 = undefined fail-soft） */
  const reflectGet = (name: string): unknown => {
    try {
      const reflect = (clientCtx as { reflect?: { get(n: string): unknown } }).reflect
      return reflect?.get(name)
    } catch {
      return undefined
    }
  }
  const conversationSvc = (): Record<string, unknown> | undefined => asObject(reflectGet('conversation'))
  const agentPresetsSvc = (): Record<string, unknown> | undefined =>
    asObject(reflectGet('remote.agentPresets')) ?? asObject(asObject(reflectGet('remote'))?.['agentPresets'])
  const services: OpenSessionServices = {
    uiWorkspace: {
      openWorkspace: (workspaceId, beforeOpen) => {
        const svc = uiWorkspace as unknown as {
          openWorkspace?: (workspaceId: string, beforeOpen?: (sessionId: string) => void) => Promise<void>
        }
        if (svc.openWorkspace === undefined) {
          return Promise.reject(new Error('uiWorkspace.openWorkspace 缺席（上游面漂移）'))
        }
        return svc.openWorkspace(workspaceId, beforeOpen)
      },
      openSession: (sessionId) => {
        uiWorkspace.openSession(sessionId)
      },
    },
    agentPresets: {
      select: (sessionId, presetId) => {
        const select = agentPresetsSvc()?.['select'] as
          | ((sessionId: string, presetId: string) => Promise<unknown>)
          | undefined
        if (select === undefined) {
          return Promise.resolve({ ok: false as const, error: { message: 'ctx.remote.agentPresets.select 缺席' } })
        }
        return select(sessionId, presetId) as Promise<PresetSelectResult>
      },
    },
    sessions: {
      binding: (sessionId) =>
        (sessions as unknown as { binding?: (sessionId: string) => unknown }).binding?.(sessionId) as
          | OpenSessionBinding
          | undefined,
    },
    conversation: {
      input: {
        for: (actx: unknown): ComposerInputFace => {
          const resolved = (conversationSvc()?.['input'] as { for?: (actx: unknown) => unknown } | undefined)?.[
            'for'
          ]?.(actx)
          if (resolved === undefined || resolved === null) {
            throw new Error('conversation.input.for 缺席（会话输入缝未就绪）')
          }
          return resolved as ComposerInputFace
        },
      },
    } satisfies OpenSessionConversation,
  }
  return createOpenSessionOrchestrator(openSessionPlatformFrom(services))
}

/**
 * dock tab 族登记（4.1 两段注册，tech-design Integration #3/#4——「adding a type is a
 * registration, never an edit」官方口径）：
 *   第一段 = sidebarRightTabs.register 两类型定义——
 *     - `dswf-overview` 页型（无 patterns，按 kind 开）：guide 入口卡 order 0（官方
 *       files/terminal/browser = 10/20/30 → 排最前）；拾取由官方 GuideBody
 *       `tab.actions.openTab(kind, {replaceTab:true})` 原位替换开始 tab（上游实现核实，
 *       产品零代码——AC2 replaceTab 载体）；
 *     - `dswf-doc` 资源型：multiple（异地址各自成 tab）+ patterns 整地址 glob + canOpen
 *       前缀防御；去重 = 地址本身（contentId——同地址 reveal 既有 tab，官方资源面缺省）；
 *   第二段 = sidebar.right.pane.tab keyed 两 body（dispatch 键 = 定义 id；useTabInfo 由
 *     seat 声明 inject 恒递达；概览 body 注入面 = 桥[锚定上下文] + 跳会话动作）。
 * 类型定义撤销器随返回值上抛（归 apply catch 与 overlay 洞 dispose 两径——本插件
 * 级联回收面同桥/词典，fix-33 ⑥ 对称性）。
 */
function registerDockTabs(
  ctx: ForgeClientCtx,
  views: PublishedViews,
  bridge: PublishedBridge,
  uiWorkspace: ForgeUiWorkspaceService,
  sessions: ForgeSessionsService,
  t: (key: string) => string,
  sidebarRightTabs: ForgeSidebarRightTabsService,
  diagnostics: { registered?: string[] },
): () => void {
  const disposeOverviewType = sidebarRightTabs.register({
    id: OVERVIEW_TAB_KIND,
    kind: OVERVIEW_TAB_KIND,
    title: () => t('tab.overview'),
    guide: [
      {
        id: 'overview',
        order: 0, // 官方入口卡 10/20/30——升序排最前（ui-design：项目概览[M2 排最前]）
        title: () => t('tab.overview'),
        description: () => t('guide.overview.desc'),
      },
    ],
  })
  const disposeDocType = sidebarRightTabs.register({
    id: DOC_TAB_KIND,
    kind: DOC_TAB_KIND,
    multiple: true,
    patterns: [`${DOC_ADDRESS_PREFIX}**`],
    canOpen: (address: string): boolean => address.startsWith(DOC_ADDRESS_PREFIX),
    title: docTabTitle,
  })
  diagnostics.registered = [...(diagnostics.registered ?? []), OVERVIEW_TAB_KIND, DOC_TAB_KIND]
  registerSlotEntry(ctx, SIDEBAR_RIGHT_PANE_TAB_SLOT, diagnostics, () =>
    ctx.slots.register(
      {
        name: SIDEBAR_RIGHT_PANE_TAB_SLOT,
        key: OVERVIEW_TAB_KIND,
        inject: () => ({
          bridge,
          onOpenSession: (sessionId: string): void => {
            // 官方导航动作面（同 sidebar.workspaces openSession 注入——fix-11 口径）
            uiWorkspace.openSession(sessionId)
          },
          // 4.6 打开新会话编排器（openSessionWithPreset + 跳转姊妹出口——概览三子 tab
          // 行头预填/诊断发送/派发指令/派发跳转四渠道共源）
          openSession: buildOpenSessionOrchestrator(ctx, uiWorkspace, sessions),
        }),
      },
      views.ForgeOverviewTab,
    ),
  )
  registerSlotEntry(ctx, SIDEBAR_RIGHT_PANE_TAB_SLOT, diagnostics, () =>
    ctx.slots.register({ name: SIDEBAR_RIGHT_PANE_TAB_SLOT, key: DOC_TAB_KIND }, views.ForgeDocsTab),
  )
  return () => {
    disposeDocType()
    disposeOverviewType()
  }
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
      const dockDiagnostics: { registered?: string[]; error?: string } = {}
      const settingsDiagnostics: { registered?: string[]; error?: string } = {}
      const marker: ForgeClientActiveMarker = {
        plugin: FORGE_CLIENT_PLUGIN_ID,
        activatedAt: Date.now(),
        sidebar: sidebarDiagnostics,
        center: centerDiagnostics,
        views: viewsDiagnostics,
        shell: shellDiagnostics,
        dock: dockDiagnostics,
        settings: settingsDiagnostics,
      }
      ;(globalThis as { __DSH_FORGE_CLIENT__?: ForgeClientActiveMarker }).__DSH_FORGE_CLIENT__ = marker
      const clientCtx = ctx as ForgeClientCtx
      // fix-33 ⑥ 缝族对称性：apply 中途抛错时桥/词典/tab 类型的补撤销面（catch 消费）——
      // 发布于 apply 期的资源不再只依赖 overlay 洞 dispose 撤销（apply 半途死闭包不残留）
      let revokeBridgeAndLocale: (() => void) | undefined
      try {
        const views = publishedViews()
        const sessions = clientCtx.get('sessions') as ForgeSessionsService
        const uiWorkspace = clientCtx.get('uiWorkspace') as ForgeUiWorkspaceService
        const workspaces = clientCtx.get('workspaces') as ForgeWorkspacesService
        const sidebarRight = clientCtx.get('sidebarRight') as ForgeSidebarRightService
        const sidebarRightTabs = clientCtx.get('sidebarRightTabs') as ForgeSidebarRightTabsService
        const layout = clientCtx.get('layout') as ForgeLayoutService
        const locale = clientCtx.get('locale') as ForgeLocaleService

        // fix-33 ⑧ 行 label locale 面（官方 ui-trajectory 同径）：登记产品词典（zh 缺省
        // 文案不变；en 补英文）+ 绑定翻译器——label thunk 逐读，active locale 切换免重注册
        const disposeLocale = locale.register(FORGE_LOCALE_NS, {
          zh: {
            'panel.knowledge': '知识库',
            'view.recall': '知识召回',
            'tab.overview': '项目概览',
            'guide.overview.desc': 'feature · 任务 · 提案与文档——管线接管工作台',
            'settings.forge': 'Forge设置',
          },
          en: {
            'panel.knowledge': 'Knowledge',
            'view.recall': 'Recall',
            'tab.overview': 'Overview',
            'guide.overview.desc': 'Features, tasks, proposals and docs',
            'settings.forge': 'Forge Settings',
          },
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

        // dock tab 族（4.1 两段注册：类型定义 + keyed body；撤销面归 apply catch 与
        // overlay 洞 dispose 两径——基础撤销闭包已立在先，此处叠加 tab 类型面：半途失败
        //（首个 pane.tab inject 即断）仍撤桥与词典，步步已注册资源均可撤）
        const disposeDockTabs = registerDockTabs(
          clientCtx,
          views,
          bridge,
          uiWorkspace,
          sessions,
          t,
          sidebarRightTabs,
          dockDiagnostics,
        )
        const revokeBase = revokeBridgeAndLocale
        revokeBridgeAndLocale = (): void => {
          revokeBase()
          disposeDockTabs()
        }

        // 三族登记（fix-36 按 sidebar/center/views 拆注册子函数——apply 仅编排）+ 设置分区
        // （4.7 settings 族）+ 常驻壳宿主。m3.1 D5：会话头挂接 pill 登记退役
        // （conversation.session.header.actions 零产品登记——官方动作带不受扰）。
        registerSidebarSlots(clientCtx, views, { sessions, workspaces, uiWorkspace }, sidebarDiagnostics)
        registerCenterPanels(clientCtx, views, bridge, t, centerDiagnostics)
        registerConversationViews(clientCtx, views, bridge, t, viewsDiagnostics)
        registerSettingsSection(clientCtx, views, t, settingsDiagnostics)

        // 常驻壳宿主（shell.overlay——UF-3 流程宿主 + 相位/视图镜像锚 + hero 面板驱动 +
        // 知识模式右栏联动面 + 概览项目上下文锚定写回[4.1 经桥] + 任务详情弹窗宿主
        // [m3.1 D21/D23——drawerTaskId 受控挂载，挂载独立于 dock] + 派发任务悬浮面板
        // [m3.1 D6——行点击开弹窗经桥，⟞ 开 worker 子会话经 openWorkerSession]；
        // selectPanel/rightbar/bridge/onOpenSession/openSession/openDocResource 官方窄面经 inject 递达）。
        // 卸载期顺带撤销桥发布、locale 词典与 dock tab 类型注册 + 清 __DSH_FORGE_CLIENT__
        // 激活标记（fix-33 ⑥ 标记卸载不清收口——本插件 fiber 卸载的唯一级联回收面；
        // 缺席期导航 fail-soft no-op）
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
                // 概览上下文写回缝（4.1：ShellHost 锚定 → 桥 → 右栏概览 tab body）
                // + 弹窗受控态读写面（m3.1 D21/D23）
                bridge,
                // 弹窗挂接会话 pill 跳会话（官方导航动作面——dock 概览 tab 注入同径）
                onOpenSession: (sessionId: string): void => {
                  uiWorkspace.openSession(sessionId)
                },
                // 悬浮面板 ⟞ 打开 worker 执行子会话（m3.1 D6）：账本 parentId 判读 →
                // 子会话 = 官方 SubagentAddress 形态（openChild 同径——树零联动：worker
                // 不进左栏两级树，父会话行保持）；顶层会话平开。官方面异常 fail-soft。
                openWorkerSession: (childSessionId: string): void => {
                  const target = workerOpenTarget(sessionParentIdOf(sessions.list, childSessionId), childSessionId)
                  try {
                    uiWorkspace.openSession(target)
                  } catch {
                    // fail-soft：无会话面（会话卸载瞬态）——⟞ 点击不外溢
                  }
                },
                // 打开新会话编排器（弹窗诊断「发送给 agent」——openSessionWithPreset 组合子）
                openSession: buildOpenSessionOrchestrator(clientCtx, uiWorkspace, sessions),
                // 文档开出动作（弹窗参考 chip → dock 开文档 tab——官方导航控制器资源面；
                // 无在场面/地址不认领抛错 fail-soft 不外溢）
                openDocResource: (address: string): void => {
                  try {
                    sidebarRight.openResource(address, { kind: DOC_TAB_KIND })
                  } catch {
                    // fail-soft：无在场面（会话卸载瞬态）——chip 点击不外溢
                  }
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
            disposeDockTabs()
          }
        })
      } catch (error) {
        // fix-33 ⑥：apply 中途抛错——桥/词典/tab 类型已发布即补撤销（死闭包不残留：桥
        // 持有官方 layout 闭包，插件已废而桥面仍活会路由进废 ctx；词典残留阻塞同 ns
        // 重复登记；tab 类型残留占官方注册表 kind）
        revokeBridgeAndLocale?.()
        const message = error instanceof Error ? error.message : String(error)
        sidebarDiagnostics.error = message
        centerDiagnostics.error = message
        viewsDiagnostics.error = message
        shellDiagnostics.error = message
        dockDiagnostics.error = message
        settingsDiagnostics.error = message
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
