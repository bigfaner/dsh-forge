// 产品 client 插件本体（定位：装配——可测纯面；入口 index.ts 零导出保 classic script 形状）。
// 2.7：槽位路线 A —— 品牌行内容洞位（sidebar.brand.mark/name）壳侧承载；sidebar.workspaces
// 顶替注册已于 1.6 随 B 类顶替①迁 @dsh-forge/project bundle（ui/sidebar-face.ts）——壳零登记。
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
//   - `settings.section`：产品占用 'dswf-forge-settings'（UF-2 Forge设置 分区）已随
//     expert-squad-default-routing AC4 退役——配置主权归 expert-squad 配置 tab；本洞位
//     仅保留于看门计数洞位清单（SETTINGS_SECTION_SLOT——官方行计入基线）。
//   - `tool.call.toolview` keyed 'dispatchTask'（官方 ui-tool 原子工具行 keyed 槽——业务
//     工具视图正径[上游 README「注册业务工具视图」，ui-skill 同型先例]：对话工具行摘要段
//     = source_slug 容器标识 + 结算后任务键后缀——2026-10-09 用户实机报障收口，官方通用
//     行 fallback 恒显种类词 proposal/feature 不可分辨）。
//   - [官方预览径 md mermaid 扩展注册链已于 1.8 渲染链退役——sidebar md 预览回归官方
//     builtin；出图改经 DOM 增强器（1.9 挂接：apply 期 start，卸载级联 stop）]。
// 契约依据（上游 0.2.0-rc.2 源码核实）：ui-slots SlotCore——single 槽 priority 升序最低者
// 渲染（lowest renders），同 priority 再注册即抛（官方占用者缺省 0 → 产品行 -100 影子）；
// keyed 槽按 key 唯一；list 槽按 (id, priority) 唯一、order 升序。SlotRegistry.inject(key, cb)：
// 洞位声明在场（或入座时）装 cb 效果，随本插件 fiber 卸载级联回收。
// 运行期锚（e2e 实证，2.7）：插件长活依赖 profile 置停 client-hmr——其全图 sync 会以宿主
// 最新图对账掉壳掌舵追加的本行，见 apps/host profile cordis.patch.yml 的 client-hmr 行。
import type { ModuleLoaderFacade } from '../shell/dsh-globals.js'
// fix-13 注记（1.40）：手机远程入口注册面 + 状态注入面（buildRemoteStatusSource 族）已迁
// @dsh-forge/project client bundle（ui/remote-entry-face.ts）——壳零残留；组件/模型源
// = plugins/project/ui/remote-entry/；壳侧 apps/web/src/views/remote/ 仅余受限单页族
// （?forgeRemote=1 独立单页直挂——main.ts 受限入口分支为 live importer 在案，disc-2
// 死面退役申请对该目录暂缓）。
// 跨入口类型面豁免（web-shell pin——runtime import 互禁仅约束值面；ShellHost inject 契约类型）
// 1.6 注记：LedgerSessionsSnapshot/SnapshotSource 类型随 sidebar 族迁 @dsh-forge/project
// （ui/sidebar/）——壳消费（ShellHost/悬浮面板 inject 契约类型）改经包窄子路径出口直供。
import type { LedgerSessionsSnapshot, SnapshotSource } from '@dsh-forge/project/client-ui/sidebar'
// fix-13 注记（1.41）：DispatchEventEntry/DispatchProgressLogSnapshot 类型 import 与
// ForgeUiConversationService 窄面已随事件折叠组注册面迁 @dsh-forge/project 退役——壳零消费。
// fix-13 注记（1.41）：事件折叠组三段注册 + progress 回放录取面已迁 @dsh-forge/project
// bundle（ui/conversation-views-face.ts + ui/event-node/progress-log-tap.ts）——壳消费
// （ShellHost inject progressLog）改经包窄子路径出口值面直供（bug-model 先例）。
import { forgeProgressLogSource } from '@dsh-forge/project/client-ui/event-tap'
// 1.9 Typert 改接：start-session wrap 树归属门 + chip 双发数据源 + W4 自证轻探三处
// 数据引用改经本窄面（官方 Typert remote face——页内锚单例现查）。
import { createForgeRpcClient } from '@dsh-forge/project/client-ui/rpc'
// fix-13 注记（1.45）：open-session 纯模块与会话动作纯函数族（编排器/Bug 快速路径/
// 判读族/改名与行动作面）随 dock tab 族注册面迁 @dsh-forge/project（ui/open-session.ts
// + ui/session-actions.ts）——壳侧消费面（shell.overlay inject 编排器与解析器）改经包窄
// 子路径出口值面直供（bug-model 先例）。1.6 注记：waitForWorkspacePresent（sidebar
// startSession 基线门）与 sessionActionFaceOf（D45 注入面）消费随 sidebar.workspaces
// 顶替注册迁 @dsh-forge/project（ui/sidebar-face.ts）——壳零消费。
import {
  buildOpenSessionOrchestrator,
  makeSessionTitleResolver,
  openSessionWithLedgerAddress,
  resolveWorkerChildSession,
  type SessionActionsCtx,
} from '@dsh-forge/project/client-ui/session-actions'
import { selectedTreeDisplay } from './selected-tree-display.js'
import { installOpenWorkspaceFace, resolveDraftShellFace, type DraftShellFace } from './open-workspace-face-install.js'
import { installWorktreeSwitchGate } from './worktree-switch-gate-install.js'
import {
  installStartSessionWrap,
  type SessionsListSlice,
  type StartSessionFace,
  type WorkspacesListSlice,
} from './start-session-wrap.js'
import { installConnectionLostBanner } from './connection-lost-banner.js'
import { runActivationSelfProbe } from './self-check-probe.js'

/** 插件 id（= 注册键 = Loader entry 名 = 掌舵入图 id；与 shell/boot.ts 掌舵参数同源） */
export const FORGE_CLIENT_PLUGIN_ID = '@dsh-forge/web-client'

/** 构建指纹（手工递增——运行期与源码版本对账用，2d5434d1 指纹裁决） */
export const FORGE_CLIENT_BUILD_TAG = '2026-10-24.1'

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
 * single/root）。1.7 注记：B 类顶替②收口——顶替注册随 hero 项目+worktree 双 select 全量
 * 顶替迁 @dsh-forge/project bundle（ui/hero-picker-face.ts apply 期自注册：priority -100
 * 影子 + inject 双面[workspaces 快照源 + openWorkspace 官方面]，组件本体 =
 * ui/worktree-picker/hero-workspace-picker.tsx）——壳零登记；本常量保留 = 零登记断言锚 +
 * e2e 选择器同源字面量（chip 触发器归官方 owner 渲染不变）。
 */
export const HERO_WORKSPACE_SLOT = 'conversation.hero.workspace'
/** 洞名：AppFrame root 五子槽——常驻覆盖层（壳宿主挂点，不随 main 面板互换卸载） */
export const SHELL_OVERLAY_SLOT = 'shell.overlay'
// fix-13 注记（1.4 收口）：conversation.input.overlay 缝三行注册（封存提示/chip 重建/
// 切换闸标记）全迁 @dsh-forge/project bundle（ui/official-seams.ts + ui/conversation-views-face.ts）
// ——壳侧槽名常量退役；禁输行为缝（installWorktreeSwitchGate）仍归壳，不经本常量。
/**
 * 洞名：官方会话头标题邻位动作带（ConversationSessionHeader headerActions——list 槽，
 * scope session）。fix-13 注记：worktree chip 登记迁 @dsh-forge/project client bundle
 * apply 期自注册（官方宿主不装载产品壳——壳侧零登记）；常量保留 = 零登记断言锚 +
 * e2e 选择器同源字面量。
 */
export const SESSION_HEADER_ACTIONS_SLOT = 'conversation.session.header.actions'
/**
 * 洞名：官方右栏 tab 体 keyed 槽（ui-sidebar-right seat——dispatch 键 = tab 类型定义
 * id）。fix-13 注记（1.45）：产品占用两键 'dswf-overview' / 'dswf-doc' 两段注册随 dock
 * tab 族迁 @dsh-forge/project bundle（ui/dock-tabs-face.ts）——壳零登记；常量保留 =
 * 零登记断言锚 + e2e 选择器同源字面量。
 */
export const SIDEBAR_RIGHT_PANE_TAB_SLOT = 'sidebar.right.pane.tab'
/** 概览 tab 类型 kind（fix-13 1.45 注册面迁 @dsh-forge/project——壳保留 = 字面量同源 pin 断言锚） */
export const OVERVIEW_TAB_KIND = 'dswf-overview'
/** 文档 tab 类型 kind（multiple + address 去重；注册面迁 @dsh-forge/project——shell.overlay openDocResource 仍消费本常量） */
export const DOC_TAB_KIND = 'dswf-doc'
/** 文档 tab 资源地址前缀（注册面迁 @dsh-forge/project；壳保留 = shell.overlay openDocResource 同源 pin） */
export const DOC_ADDRESS_PREFIX = 'dsh-resource://dswf-doc/'
// fix-13 注记：Bug 台账 tab kind/地址前缀/地址编解码（BUG_TAB_KIND/BUG_ADDRESS_PREFIX/
// bugAddressOf/bugIdOfAddress）随注册面迁 @dsh-forge/project（ui/official-seams.ts）；
// BugPreview.tsx DSWF_BUG_* 字面量镜像为同源 pin 正本。
// 1.8/1.9 渲染链退役收口：官方预览径 md mermaid 扩展注册链（定义元数据 + keyed body 槽
// + 惰性两段注册）整体退役，sidebar md 预览回归官方 builtin；mermaid 出图改经 DOM 增强
// 器（1.9 挂接——apply 期 start，随插件 fiber 卸载级联 stop）。
/** 影子优先级（single 槽 lowest renders；官方占用者缺省 0 → -100 = 产品面板替换占用者） */
export const SIDEBAR_SHADOW_PRIORITY = -100
/** 产品页签登记 id（知识召回——UF-4 三页签之三；轨迹 = 官方 'trajectory' 直用，fix-29） */
export const RECALL_VIEW_ID = 'dswf-recall'
/**
 * 洞名：官方 ui-tool 原子工具行 keyed 槽（`tool.call.toolview`——按 wire 工具名分发；
 * 未注册名走官方通用行 fallback）。产品占用一键：'dispatchTask'（2026-10-09 用户实机
 * 报障收口——官方通用行参数摘要取「首个字符串值」= source_kind 种类词，对话行恒显
 * `dispatchTask · proposal/feature` 不可分辨；业务视图接管后摘要段 = source_slug
 * 容器标识——上游 README「注册业务工具视图」正径，ui-skill 同型先例）。
 */
export const TOOL_CALL_TOOLVIEW_SLOT = 'tool.call.toolview'
/** dispatchTask 工具行 keyed 键（= plugin-forge wire 工具名——FORGE_TOOL_NAMES 单源字面量镜像） */
export const DISPATCH_TASK_TOOL_KEY = 'dispatchTask'
/**
 * 洞名：官方设置对话框分区 roster（ui-settings SettingsRoot nav 列 + 内容列 only 消费
 * ——list 槽 scope root；4.7 Integration #4）。产品占用 Forge设置 分区（worker 小节）已随
 * expert-squad-default-routing AC4 退役（配置主权归 expert-squad 配置 tab）——产品零占用，
 * 本键保留 = W4 看门计数洞位清单（官方行计入基线）。
 */
export const SETTINGS_SECTION_SLOT = 'settings.section'

/**
 * 洞名：官方侧栏底行扩展槽（dsh-client-ui-sidebar SlotMap——kind list / scope root，声明
 * 语义「Optional actions beside Settings at the sidebar foot」；pin-06 探针锚同源）。
 * fix-13 注记（1.40）：产品占用行 'dswf-remote'（手机远程入口）注册已迁 @dsh-forge/project
 * client bundle apply 期自注册（ui/remote-entry-face.ts）——壳零登记；本键保留 = 零登记
 * 断言锚 + e2e 选择器同源字面量。
 */
export const SIDEBAR_FOOTER_ACTION_SLOT = 'sidebar.footer.action'

/**
 * 插件依赖的服务名（cordis inject——apply 等待七服务在场；与官方 ui-workspace 同型先例。
 * 1.45 前为八服务——sidebarRightTabs 随 dock tab 族注册面迁 @dsh-forge/project）。
 * sidebarRight（fix-23）：官方 ui-sidebar-right 服务——知识模式右栏隐藏/恢复联动窄面。
 * layout（fix-25）：官方 ui-layout 服务——面板选择窄面（selectPanel：知识/hero 面板互换 +
 * 官方 openSession 同径 null 收口回会话）。
 * locale（fix-33 ⑧）：官方 dsh-client-locale 服务——行 label 走 locale NS（官方
 * ui-trajectory 同径先例：register(NS, {zh,en}) + bind(NS) + label thunk）。
 * fix-13 注记（1.45）：'sidebarRightTabs' 注入边随 dock tab 族注册面迁 @dsh-forge/project
 * bundle（ui/dock-tabs-face.ts——ctx.get 现查，插件侧自持激活等待边）；'sidebarRight'
 * 服务注入保留（shell.overlay 的 openResource/openTab 注入面仍消费）。
 */
export const FORGE_CLIENT_INJECT = [
  'slots',
  'sessions',
  'uiWorkspace',
  'workspaces',
  'sidebarRight',
  'layout',
  'locale',
  // fix-13 注记（1.41）：'uiConversation' 注入边随事件折叠组注册面迁 @dsh-forge/project
  // bundle（conversation-views-face——消费点现查 reflect，插件侧不持激活等待边）。
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
  /** 洞位 entries 快照（官方 SlotCore.entries 消费切片——W4 看门计数探针；形状漂移容忍缺席） */
  entries?(key: string): readonly unknown[]
}

/** dsh 会话服务窄面（ISessions 消费切片：账本快照源——Session Controller client 无 open 面） */
export interface ForgeSessionsService {
  /** 会话账本快照源（实时读——零缓存零副本的源本体） */
  readonly list: unknown
  /**
   * 全量重拉会话列表基线（官方 SessionsService.refresh——refreshList 同径）。D6 修复面：
   * in-process worker 子会话的 added 广播未达客户端时账本缺行 → ⟞/执行会话 pill 判读不到
   * parentId，平开子会话 id 又非官方支持径（resolveTarget 抛 unknown session）。此时主动
   * refresh 一次（宿主 session.list 读盘上报持久子会话行——header parentSession 在场）后
   * 重判读。缺席（上游面漂移）= 跳过，平开兜底。
   */
  readonly refresh?: () => Promise<unknown>
  /**
   * 借用会话作用域引用（官方 ISessions.using 消费切片——D45 会话改名正径：官方
   * RenameSession 适配同面 `using(sessionId, {source:'workspaceOperation'}, ref =>
   * ref.binding.session.rename(title))`）。缺席（上游面漂移）= 改名菜单项不呈现。
   */
  readonly using?: (
    target: string,
    options: { readonly source: string },
    operation: (reference: unknown) => unknown,
  ) => Promise<unknown>
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
  /**
   * 归档会话（官方 UiWorkspaceService.archiveSession——D45 会话行动作钮正径）。运行中
   * 会话被宿主拒（WorkspaceArchiveError `workspace/session-active`）→ 拒绝原样上抛
   * （面板停止并归档确认流消费）；`stopActivity` = 先停运行工作再归档。
   * 缺席（上游面漂移）= 归档钮/菜单项不呈现。
   */
  readonly archiveSession?: (
    sessionId: string,
    options?: { readonly stopActivity?: boolean },
  ) => Promise<void>
  /** 取消归档（官方 UiWorkspaceService.unarchiveSession——D45）。缺席 = 对应面不呈现。 */
  readonly unarchiveSession?: (sessionId: string) => Promise<void>
  /** 置顶会话（官方 UiWorkspaceService.pinSession——D45）。缺席 = 置顶钮/菜单项不呈现。 */
  readonly pinSession?: (sessionId: string) => Promise<void>
  /** 取消置顶（官方 UiWorkspaceService.unpinSession——D45）。缺席 = 对应面不呈现。 */
  readonly unpinSession?: (sessionId: string) => Promise<void>
  /**
   * 分叉会话（官方 UiWorkspaceService.forkSession——D45；子会话经宿主列表到达源行旁）。
   * 缺席 = 分叉菜单项不呈现。
   */
  readonly forkSession?: (sessionId: string) => Promise<unknown>
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

// ============================================================================
// 会话判读/解析纯函数族（sessionParentIdOf / workerOpenTarget / sessionRowInLedger /
// workerChildSessionOf / resolveWorkerChildSession / sessionTitleOf /
// makeSessionTitleResolver / activeSessionIdOf / openSessionWithLedgerAddress）——fix-13
// 迁移退役（1.45）：整体迁 @dsh-forge/project（ui/session-actions.ts——dock tab 族注册面
// 消费），壳侧消费点改经 '@dsh-forge/project/client-ui/session-actions' 值面直供。壳零残留。
// ============================================================================

/** dsh workspace 服务窄面（IWorkspaces 消费切片：归属快照源——快照自带 registry 级
 * archivedSessionIds/pinnedSessionIds 两集合，sidebar-model 窄镜像消费；动作面经
 * uiWorkspace 服务走（官方同径——含置顶排序/通知/归档选中清面编排）） */
export interface ForgeWorkspacesService {
  readonly list: unknown
}

// ============================================================================
// 会话改名/行动作面（makeSessionRenameFace / sessionRenameViaBinding / sessionActionFaceOf）
// ——fix-13 迁移退役（1.45）：随纯函数族迁 @dsh-forge/project（ui/session-actions.ts），
// 壳侧 sidebar.workspaces 消费点改经 '@dsh-forge/project/client-ui/session-actions' 值面
// 直供。壳零残留。
// ============================================================================

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

// ============================================================================
// 官方右栏 tab 类型注册表窄面（ForgeSidebarRightTabsService）与 dock tab 族两段注册
// （registerDockTabs + docTabTitle + buildOpenSessionOrchestrator + bugReferenceServicesOf
// + buildBugQuickAdder + BugQuickAddInput/Fn + 1.4 快照落缓存面）——fix-13 迁移退役
// （1.45）：整体迁 @dsh-forge/project（ui/dock-tabs-face.ts 注册面 + ui/session-actions.ts
// 编排面 + ui/dock-tabs/ 组件族 + official-seams bugSourceCacheOf 快照缝），壳零登记
// （sidebarRightTabs 注入边随之摘除；'sidebarRight' 服务注入保留——shell.overlay 的
// openResource/openTab 注入面仍消费）。
// ============================================================================

/** 官方面板信息快照（ui-layout layout.panelInfo 消费切片） */
export interface ForgePanelInfo {
  readonly activePanelId: string | null
}

/**
 * 官方布局服务窄面（ui-layout LayoutController 消费切片，fix-25） */
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

/**
 * md-mermaid DOM 增强器窄面（@dsh-forge/md-mermaid ./web 出口 enhancer 启停 API 结构
 * 同型镜像——bundle 自含禁跨 chunk import，真身经发布面递达）。1.9 挂接：apply 期
 * start（凡 .md-code-block 全 DOM 扫描增强——门控 + parse 确认 + 失败安全降级），
 * stop 随插件 fiber 卸载级联回收（overlay 洞 dispose + apply catch 两径，同 dock tab
 * 类型撤销面）。
 */
export interface ForgeMermaidEnhancer {
  /** 全量扫描（MutationObserver 回调经防抖合并后亦走此径） */
  scan(): Promise<void>
  /** 开始观察（幂等；随调用方生命周期） */
  start(): void
  /** 停止观察并取消在途防抖扫描 */
  stop(): void
}

/** 产品视图发布面窄面（product-views.ts 结构同型镜像） */
export interface ForgeViewsGlobal {
  __DSH_FORGE_VIEWS__?: {
    // 1.6 注记：ForgeSidebarSlot 发布键随 sidebar.workspaces 顶替注册迁 @dsh-forge/project
    // bundle（ui/sidebar-face.ts + ui/sidebar/）退役——壳发布面零该键。
    ForgeBrandMark: unknown
    ForgeBrandName: unknown
    ForgeShellHost: unknown
    // ForgeHeroPanel 注册在 @dsh-forge/project bundle（ui/hero-panel-face.ts）；
    // ForgeKnowledgePanel / ForgeKnowledgeGlyph / ForgeRecallView 三面注册在
    // @dsh-forge/knowledge bundle（ui/faces.ts）——组件本体随插件 bundle，
    // 均不经壳发布面递达。
    // fix-13 注记（1.41）：ForgeDispatchToolRow / ForgeEventEntries 两键随注册面迁
    // @dsh-forge/project bundle 退役——壳发布面零该两键。
    // fix-13 注记（1.43）：ForgeWorktreeSwitchMarker 发布键随切换闸标记行注册迁
    // @dsh-forge/project bundle（conversation-views-face ③）退役。
    // fix-13 注记（1.45）：ForgeOverviewTab / ForgeDocsTab 两键随 dock tab 族注册迁
    // @dsh-forge/project bundle（ui/dock-tabs-face.ts + ui/dock-tabs/）退役——壳发布面
    // 零该两键。
    // 1.7 注记：ForgeHeroWorkspacePicker 发布键随 B 类顶替②（hero 项目+worktree 双 select
    // 全量顶替）迁 @dsh-forge/project bundle（ui/hero-picker-face.ts + ui/worktree-picker/
    // hero-workspace-picker.tsx）退役——壳发布面零该键。
    // fix-13 注记（1.40）：ForgeRemoteEntry 发布项退役——组件本体与注册面均在
    // @dsh-forge/project client bundle（ui/remote-entry/），不经壳发布面递达。
    createWorkbenchBridge: (nav: {
      showKnowledge(): void
      showSession(): void
    }) => {
      subscribe(listener: () => void): () => void
      getSnapshot(): {
        drawerEntryId: number | null
        overview: { projectId: string | null }
        taskFocus: { taskId: string; featureSlug: string; nonce: number } | null
        drawerTaskId: string | null
        transitionFocus: { taskId: string; featureSlug: string; nonce: number; toStatus?: string } | null
      }
      setDrawerEntry(entryId: number | null): void
      setOverviewContext(context: { projectId: string | null }): void
      openTaskFocus(payload: { taskId: string; featureSlug: string }): void
      openTaskDrawer(taskId: string): void
      closeTaskDrawer(): void
      openTaskTransition(payload: { taskId: string; toStatus?: string }): void
    }
    /** md-mermaid DOM 增强器工厂（@dsh-forge/md-mermaid ./web——壳 bundle 单源发布） */
    createMermaidEnhancer: (options?: Record<string, unknown>) => ForgeMermaidEnhancer
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
      | 'layout'
      | 'locale'
      | 'conversation'
      | 'uiConversation',
  ): unknown
  /** cordis 事件监听缝（W4：'internal/service' 服务注销信号消费；形状漂移容忍缺席） */
  on?(name: 'internal/service', listener: (serviceName: string, value: unknown) => void): () => void
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
  /** W4 激活自证（RPC 轻探 + wrap 换芯证据——失败 fail-loud：console.error + 本面呈现） */
  readonly selfCheck?: ClientSelfCheckDiagnostics
}

/** W4 激活自证诊断面（e2e/UI 态消费——值为 'ok' 或失败因一行） */
export interface ClientSelfCheckDiagnostics {
  /** forgeProjects.list Typert 轻探：'ok' | 失败因一行（face 缺席/通路断裂 = fail-loud） */
  rpcProbe?: string
}

/**
 * W4 行存续看门健康探测面（apply 期发布 `__DSH_FORGE_HEALTH__`；壳 bundle 全局看门
 * prune-watchdog.ts 轮询消费——closure 持官方 ctx，插件 fiber 死后 slots 服务仍存活，
 * entries 计数回落 = 占用者被回收）。与 shell/prune-watchdog.ts ForgeHealthProbeGlobal
 * 结构同型镜像（bundle 自含禁跨 chunk import 同纪律）。
 */
export interface ForgeHealthProbeGlobal {
  /** forge 占用洞位 entries 计数（官方 ctx.slots.entries 求和——插件 fiber 外仍可读） */
  readonly slotCount: () => number
  /** 看门主动核查入口（internal/service 事件监听转发消费——与壳轮询共用判读核） */
  readonly check: () => void
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

/**
 * sidebar 族登记（1.6 收缩：sidebar.workspaces 顶替注册随 B 类顶替①迁 @dsh-forge/project
 * bundle——ui/sidebar-face.ts apply 期自注册，壳零登记；本子函数仅余品牌行两内容洞位
 * [行本体与新会话快捷交互归壳——AC3 品牌行点击 = 官方 startSession]。品牌件属壳本体，
 * 不属迁移面——ui-migration-scope-matrix 行 10 留壳）。
 */
function registerSidebarSlots(
  ctx: ForgeClientCtx,
  views: PublishedViews,
  diagnostics: { registered?: string[] },
): void {
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

// ============================================================================
// center 族登记（hero/knowledge 面板 + panellist 行）：hero（main 'dswf-hero'）注册在
// @dsh-forge/project bundle（ui/hero-panel-face.ts）apply 期自注册；knowledge 三面
// （main 'dswf-knowledge' + panellist 行 + 召回页签）注册在 @dsh-forge/knowledge bundle
// （ui/faces.ts——fail-closed 门控 + 桥页内缝 inject 期现读）。壳零登记。
// ============================================================================

// ============================================================================
// views 族登记——1.7 迁移退役：hero 工作区控件影子（fix-24 ① 半顶替形态）随 B 类顶替②
// 升级装配整体迁 @dsh-forge/project bundle（ui/hero-picker-face.ts——两段式声明缝 + inject
// 双面[workspaces 快照源 + openWorkspace 官方面]，官方宿主不装载产品壳时 hero 双 select
// 仍随插件 bundle 自注册）。壳零登记（views 族诊断组保留 = 断言锚，registered 恒空）。
// fix-13 注记（1.41）：dispatchTask 工具行（tool.call.toolview）与事件折叠组三段注册迁
// @dsh-forge/project bundle（ui/conversation-views-face.ts）——壳零登记。
// 召回页签（conversation.view 'dswf-recall'）注册在 @dsh-forge/knowledge bundle
// （ui/faces.ts，knowledge 族三面同批）——壳零登记。
// ============================================================================

/**
 * worktree 切换闸虚线标记登记（bug 267dcac1）——fix-13 迁移退役（1.43）：注册行迁
 * @dsh-forge/project bundle apply 期自注册（ui/conversation-views-face.ts ③）——壳零登记；
 * 禁输行为缝（installWorktreeSwitchGate）仍归壳（行为面保留）。
 */

// ─────────────────── 会话日志进度回放录取（loop-message-consolidation 1.3） ───────────────────
// fix-13 迁移退役（1.41）：录取面（FORGE_PROGRESS_LOG_TAP / forgeProgressLogSource /
// tapForgeProgressEvent / 状态机 match 旁路包装）与事件折叠组三段注册
// （registerEventEntriesNode）整体迁 @dsh-forge/project（ui/event-node/progress-log-tap.ts
// + ui/conversation-views-face.ts）。壳侧消费（ShellHost inject progressLog）改经本包
// 窄子路径出口 client-ui/event-tap 值面直供（bug-model 先例）。

// ============================================================================
// 手机远程入口注册（mobile-remote-approval 1.2/fix-3）——fix-13 迁移退役（1.40）：注册面
// （list 行登记 + 状态注入面 buildRemoteStatusSource + preload 桥私有辅助族）整体迁
// @dsh-forge/project client bundle apply 期自注册（ui/remote-entry-face.ts——官方宿主
// 不装载产品壳，注册面归插件域）。壳侧零残留。
// ============================================================================

// ============================================================================
// Bug 引用 source 注册（composer-bug-reference 1.2）——fix-13 迁移退役：注册面
// （@ source 登记 + 接线装配 + 会话→项目锚 + 地址编解码）迁 @dsh-forge/project
// client bundle apply 期自注册（ui/official-seams.ts）。fix-13 注记（1.45）：壳侧最后
// 消费面（1.4 概览快速路径——BugQuickAddFn/buildBugQuickAdder/projectBugSourceCacheOf
// 快照落缓存）随 dock tab 族注册面迁 @dsh-forge/project（ui/session-actions.ts +
// dock-tabs-face bugSourceCacheOf）——壳侧组名字面量镜像（FORGE_BUG_SOURCE_NAME）与
// 快照落缓存面一并退役，壳零残留。
// ============================================================================

// 1.9 壳侧退役收口：forge:* 数据引用全量改接 Typert 正典（@dsh-forge/project ui/rpc
// face——forgeWorktree.resolve / forgeWorktree.list / forgeProjects.list 三处自造 channels
// face 消费退役；自造通道字面量与页内传输窄缝随之删除）。

/**
 * W4 看门计数探针的洞位清单（产品占用/声明的洞名——entries 求和面）。官方占用者计入基线、
 * prune 回收 = 计数回落，检测面覆盖产品行与官方行两侧。fix-13 注记：会话头 chip 行注册
 * 迁 project bundle——壳清单摘除 SESSION_HEADER_ACTIONS_SLOT（登记面归插件，计数随官方
 * 槽 runtime，不归壳看门）。
 */
export const FORGE_HEALTH_SLOT_KEYS = [
  SIDEBAR_WORKSPACES_SLOT,
  SIDEBAR_BRAND_MARK_SLOT,
  SIDEBAR_BRAND_NAME_SLOT,
  // fix-13 注记（1.40）：SIDEBAR_FOOTER_ACTION_SLOT（手机远程行）壳清单摘除——登记面归插件。
  HERO_WORKSPACE_SLOT,
  // fix-13 注记（1.41/1.43）：TOOL_CALL_TOOLVIEW_SLOT / FORGE_EVENT_NODE_SLOT /
  // CONVERSATION_INPUT_OVERLAY_SLOT 三键注册迁 @dsh-forge/project bundle——壳清单摘除。
  // fix-13 注记（1.42/1.44）：MAIN_SLOT / SIDEBAR_PANELLIST_SLOT / CONVERSATION_VIEW_SLOT
  // 注册随 center 族与召回页签迁 @dsh-forge/knowledge bundle（ui/faces.ts）——壳清单摘除三键。
  SETTINGS_SECTION_SLOT,
  SHELL_OVERLAY_SLOT,
] as const

/** 看门计数探针（官方 ctx.slots.entries 求和——entries 面缺席[形状漂移] = 该洞零计容忍） */
export function forgeSlotCountOf(slots: ForgeSlotsService, keys: readonly string[]): number {
  let count = 0
  for (const key of keys) {
    const entries = slots.entries?.(key)
    if (Array.isArray(entries)) count += entries.length
  }
  return count
}

/** 路径归一比较键（跨源 path 匹配：反斜杠→斜杠 + 小写 + 去尾斜杠——worktree 行命中同判） */

/** 路径归一比较键（跨源 path 匹配：反斜杠→斜杠 + 小写 + 去尾斜杠——worktree 行命中同判） */
function normPathKey(value: string): string {
  const slashed = value.replaceAll('\\', '/')
  const trimmed = slashed.length > 1 && slashed.endsWith('/') ? slashed.slice(0, -1) : slashed
  return trimmed.toLowerCase()
}

// ============================================================================
// asRecord / reflectServiceGet / docTabTitle / buildOpenSessionOrchestrator /
// BugQuickAddInput / BugQuickAddFn / bugReferenceServicesOf / buildBugQuickAdder /
// registerDockTabs——fix-13 迁移退役（1.45）：整体迁 @dsh-forge/project
// （ui/session-actions.ts + ui/dock-tabs-face.ts + ui/dock-tabs/ 组件族）。壳零残留。
// ============================================================================

// ============================================================================
// 手机远程状态注入面（ForgeRemoteStatusFace / buildRemoteStatusSource / ForgePreloadBridge
// / preloadBridgeOf / rpcDataOf / remoteApprovalEnabledOf / SETTINGS 通道常量 /
// REMOTE_CHANNEL_DISCONNECT / pskTrioFaceOf / isOkEnvelope / snapshotOfReads）——fix-13
// 迁移退役（1.40）：整体迁 @dsh-forge/project（ui/remote-entry-face.ts），壳零残留。
// ============================================================================

// （snapshotOfReads / buildRemoteStatusSource 本体已随 1.40 迁 @dsh-forge/project——见上退役注记）
// （docTabTitle / buildOpenSessionOrchestrator / BugQuickAddInput / BugQuickAddFn /
//  bugReferenceServicesOf / buildBugQuickAdder / registerDockTabs 本体已随 1.45 dock tab
//  族注册面迁 @dsh-forge/project——见上退役注记）

/** 插件本体（client bundle factory 的返回值 = 模块 exports）。 */
export function forgeClientPlugin(): ForgeClientPlugin {
  return {
    name: FORGE_CLIENT_PLUGIN_ID,
    inject: [...FORGE_CLIENT_INJECT],
    apply(ctx: unknown) {
      // 构建指纹（2d5434d1 裁决）：控制台一行即可判「页面跑的是哪版」——缺席 = 陈旧页面
      console.info(`[dswf-client] build ${FORGE_CLIENT_BUILD_TAG}`)
      const sidebarDiagnostics: { registered?: string[]; error?: string } = {}
      const centerDiagnostics: { registered?: string[]; error?: string } = {}
      // 1.7 注记：views 族壳登记归零（hero 影子随 B 类顶替②迁 @dsh-forge/project）——
      // registered 预置空数组 = 断言锚（e2e/排障面零登记显形）。
      const viewsDiagnostics: { registered?: string[]; error?: string } = { registered: [] }
      const shellDiagnostics: { registered?: string[]; error?: string } = {}
      const dockDiagnostics: { registered?: string[]; error?: string } = {}
      const selfCheck: ClientSelfCheckDiagnostics = {}
      const marker: ForgeClientActiveMarker = {
        plugin: FORGE_CLIENT_PLUGIN_ID,
        activatedAt: Date.now(),
        sidebar: sidebarDiagnostics,
        center: centerDiagnostics,
        views: viewsDiagnostics,
        shell: shellDiagnostics,
        dock: dockDiagnostics,
        selfCheck,
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
        // bug 05c712a4 composer 腿收口：worktree chip 点选 = 显式传参官方 openWorkspace
        // （官方唯一创建前决策缝——立即建/复用该树 blank，主视图随之切换）。face 挂 window
        // 锚供 worktree-picker 点选链消费（安装器独立成文件——入口与共享组件禁共 import）。
        // bug 267dcac1：面返回 promise（切换闸敛棋锚）+ beforeOpen 草稿迁移。
        // 切换闸消费端：pending 窗口 → 官方 composer block（conversation.blocks——
        // 「the one way another plugin stops a session's input」，blocked 即官方 inert
        // 禁用卡 + reason 占位）对当前主会话置位，敛棋/3s 超时清退（原会话锚定）。
        installWorktreeSwitchGate({ clientCtx, uiWorkspace, warn: (message) => console.warn(message) })
        const workspaces = clientCtx.get('workspaces') as ForgeWorkspacesService
        installOpenWorkspaceFace({
          uiWorkspace,
          // bug bd7d7977 基线在场门取数源：官方 workspaces.list 快照——点选链委派前有界等
          // 基线抵达（d353536f 同因面，open-session 编排径同门随动）。
          workspacesList: workspaces.list,
          // bug 267dcac1 草稿迁移 shell 解析（官方 selectWorkspace 同语义）：sessions.binding
          // 借已 retain 绑定 → conversation.input.for 取 shell（queue dock 同径，
          // bugReferenceServicesOf 先例）；未 retain/面缺席 = undefined fail-soft 零迁移。
          resolveShell: (sessionId: string): DraftShellFace | undefined =>
            resolveDraftShellFace(clientCtx, sessions, sessionId),
          warn: (message) => console.warn(message),
        })
        const sidebarRight = clientCtx.get('sidebarRight') as ForgeSidebarRightService
        // fix-13 注记（1.45）：sidebarRightTabs 服务读取随 dock tab 族注册面迁
        // @dsh-forge/project（ui/dock-tabs-face.ts ctx.get 现查）——壳零读取。
        const layout = clientCtx.get('layout') as ForgeLayoutService
        const locale = clientCtx.get('locale') as ForgeLocaleService

        // 绑定推导制·入口锚定（binding-derivation §2.3）：官方壳「新建会话」无参
        // startSession 锚点 = currentWorkspaceId/recent，可落在树工作区而绕过 hero chip
        // 显示。wrap 按显示选中（chip 本地投影单源）解析所选树的 workspaceId（chip 双发
        // 数据源 WorktreeEntryDto.workspaceId，forgeWorktree.list Typert 正典；官方
        // workspaces.list path 匹配回退），直通官方 startSession(workspaceId)——官方
        // 内部 session.create({workspaceId}) 原生 blank 复用即路由，桌面创建零 forge 改道
        // （预铸采纳单门已随 host 退役）。判定链异常 fail-open 官方原流；
        // 撤销随桥/词典 revoke 链与 overlay 洞 dispose 两径。
        // 数据通路（1.9 Typert 正典改接）：forge RPC client（官方 Typert remote face——
        // @dsh-forge/project bundle apply 期 installForgeRemoteFace 发布页内解析缝，本副本
        // 经页内锚单例现查）。wrap 判定链异常 fail-open 官方原流；face 缺席 = 调用期诚实
        // 降级（typed error → wrap catch / selfCheck 呈现，不静默）。
        const forgeRpc = createForgeRpcClient()
        const disposeStartSessionWrap = installStartSessionWrap({
          uiWorkspace: uiWorkspace as unknown as StartSessionFace,
          sessionsList: sessions.list as SessionsListSlice,
          workspacesList: workspaces.list as WorkspacesListSlice,
          // 树归属门（forgeWorktree.resolve Typert 正典——path → 注册项目根；null = 未注册）
          resolveRoot: async (path) => {
            const data = await forgeRpc.worktree.resolve({ paths: [path] })
            const hit = data.resolved.find((entry) => entry.path === path)
            return typeof hit?.projectRoot === 'string' && hit.projectRoot !== '' ? hit.projectRoot : null
          },
                // 显示真源（selected-tree-display 模块单例——与 chip 本地投影同源；
                // bug 05c712a4 根治：创建路由不再读 host 选中记忆）
                displayedTree: () => selectedTreeDisplay.get(),
                // chip 双发数据源（WorktreeEntryDto.workspaceId——forgeWorktree.list Typert
                // 正典下发）：list 行按 path 归一命中取 workspaceId；行缺席/形状漂移 =
                // undefined（回退官方 workspaces.list path 匹配，wrap ③）。
                worktreeWorkspaceId: async (worktreePath, projectRoot) => {
                  const data = await forgeRpc.worktree.list({ projectRoot })
                  const key = normPathKey(worktreePath)
                  const hit = data.entries.find(
                    (entry) => typeof entry?.path === 'string' && normPathKey(entry.path) === key,
                  )
                  return typeof hit?.workspaceId === 'string' && hit.workspaceId !== '' ? hit.workspaceId : undefined
                },
              })

        // W4 激活自证①（RPC 试呼轻探）：forgeProjects.list Typert 正典零副作用读面——
        // remote 往返通 = 数据通路装配链通。编排 = runActivationSelfProbe（boot 竞速
        // 根治——1.2 复核欠账 R2-竞速支；fix-2 mount 事件驱动）：mount 完成前的 404/
        // 面缺席失败按竞速窗口分类静默挂起，internal/service（remote contribution mount
        // 落座）事件驱动轻探，无固定短窗；长诊断超时仅出诊断（不 fail-loud），事件缝
        // 缺席才兜底终态（不阻断激活主链）。
        runActivationSelfProbe({
          probe: () => forgeRpc.projects.list().then(() => undefined),
          onSuccess: () => {
            selfCheck.rpcProbe = 'ok'
          },
          onRacePending: () => {
            selfCheck.rpcProbe = 'pending（boot 竞速窗口——remote contribution mount 事件驱动重试中）'
          },
          onTerminalFailure: (line) => {
            console.error(line)
            selfCheck.rpcProbe = line
          },
          onDiag: (line) => {
            console.info(line)
          },
          onServiceEvent:
            typeof clientCtx.on === 'function'
              ? (fn) => clientCtx.on!('internal/service', () => fn())
              : undefined,
        })

        // W4 行存续看门探测面发布（壳 bundle 全局看门轮询消费——插件 fiber 内看门随插件
        // 同殁，检不出 prune；closure 持官方 ctx，fiber 死后 slots 服务仍存活）。
        const health: ForgeHealthProbeGlobal = {
          slotCount: () => forgeSlotCountOf(clientCtx.slots, FORGE_HEALTH_SLOT_KEYS),
          // 官方信号源（cordis `internal/service`——reflect.notify 服务注销 emit）转发：
          // sessions 注销 = prune 级联回收官方信号 → 触发壳看门主动核查（事件 + 轮询双保险）。
          check: () => {
            const hook = (globalThis as { __DSH_FORGE_PRUNE_CHECK__?: () => void }).__DSH_FORGE_PRUNE_CHECK__
            hook?.()
          },
        }
        ;(globalThis as { __DSH_FORGE_HEALTH__?: ForgeHealthProbeGlobal }).__DSH_FORGE_HEALTH__ = health
        const disposeServiceListener =
          typeof clientCtx.on === 'function'
            ? clientCtx.on('internal/service', (name, value) => {
                if (name === 'sessions' && value === undefined) health.check()
              })
            : undefined

        // 断连终态横幅（问题①——官方 connection.state 订阅，connecting 卡死 60s 升级
        // 终态条带，connected 自动撤除；服务缺席 = 零安装 fail-soft。与 host 侧死通道
        // 熔断互补——renderer 侧用户显性告知）。撤销随 revoke 链与 overlay 洞 dispose。
        const disposeConnectionBanner = installConnectionLostBanner(clientCtx)

        // fix-33 ⑧ 行 label locale 面（官方 ui-trajectory 同径）：登记产品词典 + 绑定
        // 翻译器——label thunk 逐读，active locale 切换免重注册。fix-13 注记（1.45）：
        // tab.overview / tab.bug / guide.overview.desc 三词条随 dock tab 族注册面迁
        // @dsh-forge/project 自有 NS（dsh-forge.project——ui/locale.ts），壳词典零产品行。
        const disposeLocale = locale.register(FORGE_LOCALE_NS, {
          zh: {
            // panel.knowledge / view.recall 已随 knowledge 族注册面迁 @dsh-forge/project
            // 自有 NS（dsh-forge.project——1.42）
            // tab.overview / tab.bug / guide.overview.desc 已随 dock tab 族注册面迁（1.45）
            // remote.entry 已随注册面迁 @dsh-forge/project 自有 NS（dsh-forge.project——1.40）
            // tool.dispatchTask.* 族已随工具行注册面迁 @dsh-forge/project NS（1.41）
          },
          en: {
            // panel.knowledge / view.recall 已随 knowledge 族注册面迁（1.42）
            // tab.overview / tab.bug / guide.overview.desc 已随 dock tab 族注册面迁（1.45）
            // tool.dispatchTask.* 族已随工具行注册面迁 @dsh-forge/project NS（1.41）
          },
        })
        // fix-13 注记（1.45）：locale 翻译器绑定（t）随 dock tab 族注册面迁
        // @dsh-forge/project——壳词典零产品行，绑定面退役。

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

        // fix-13 注记：Bug 引用 source 登记（inputTriggers）与 chip 重建缝页内全局发布
        // （__DSH_FORGE_BUG_CHIP_RESTORE__）迁 @dsh-forge/project bundle apply 期自注册
        // （ui/official-seams.ts）——壳零残留。1.45：壳侧最后消费面（1.4 快速路径快照落
        // 缓存）随 dock tab 族注册面同迁——__DSH_FORGE_BUG_SOURCE__ 页内缝消费归零。

        // dock tab 族两段注册（概览/文档两键）已迁 @dsh-forge/project bundle（fix-13，
        // 1.45——ui/dock-tabs-face.ts）——壳零登记零撤销面。
        // 1.9 DOM 增强器挂接：apply 期启动（@dsh-forge/md-mermaid ./web enhancer 经壳
        // bundle 发布面递达——凡 .md-code-block 全 DOM 扫描增强，门控 + parse 确认 +
        // 失败安全降级）；stop 归 overlay 洞 dispose 与 apply catch 两径（插件 fiber
        // 卸载级联回收）。
        const mermaidEnhancer = views.createMermaidEnhancer()
        mermaidEnhancer.start()
        const revokeBase = revokeBridgeAndLocale
        revokeBridgeAndLocale = (): void => {
          revokeBase()
          mermaidEnhancer.stop()
          disposeStartSessionWrap?.()
          disposeServiceListener?.()
          disposeConnectionBanner?.()
          ;(globalThis as { __DSH_FORGE_HEALTH__?: unknown }).__DSH_FORGE_HEALTH__ = undefined
        }

        // 三族登记（fix-36 按 sidebar/center/views 拆注册子函数——apply 仅编排）+ 常驻壳宿主。
        // m3.1 D5：会话头挂接 pill 登记退役（conversation.session.header.actions 零产品登记）。
        // fix-13 注记（1.40-1.44）：remote 入口/hero/工具行/事件组/切换闸标记迁
        // @dsh-forge/project bundle；知识面板族（knowledge/panellist/main）/召回页签迁
        // @dsh-forge/knowledge bundle——七组注册面壳登记仅余 sidebar 品牌行/dock 族/shell.overlay。1.7 注记：hero picker 影子随
        // B 类顶替②同迁（ui/hero-picker-face.ts）——views 族壳登记归零。
        // 1.6 注记：sidebar.workspaces 顶替注册迁 @dsh-forge/project bundle（fix-13，
        // ui/sidebar-face.ts）——壳零登记；FORGE_HEALTH_SLOT_KEYS 的 workspaces 键保留 =
        // 看门对插件侧登记行的计数消费（官方行计入基线）。
        // bug 2ffb0a82 门（knowledgeEnabled）= @dsh-forge/knowledge bundle ui/faces.ts
        // knowledgeEnabledOf——fail-closed 在彼侧读同一页内缝。
        registerSidebarSlots(clientCtx, views, sidebarDiagnostics)
        // 手机远程入口注册已迁 @dsh-forge/project bundle（fix-13，1.40）——壳零登记
        // center 族 hero 注册已迁 @dsh-forge/project bundle（fix-13，1.42）——壳零登记
        // 知识面板族（knowledge/panellist）注册已迁 @dsh-forge/knowledge bundle（fix-13，1.42）——壳零登记
        // hero 工作区控件（conversation.hero.workspace）注册已迁 @dsh-forge/project bundle
        // （1.7 B 类顶替②——ui/hero-picker-face.ts）——壳零登记（views 诊断组恒空 = 断言锚）
        // 切换闸虚线标记行注册已迁 @dsh-forge/project bundle（fix-13，1.43）——壳零登记
        // Bug 引用 source / chip / overlay 双行注册已迁 @dsh-forge/project bundle（fix-13）

        // 常驻壳宿主（shell.overlay——UF-3 流程宿主 + 相位/视图镜像锚 + hero 面板驱动 +
        // 知识模式右栏联动面 + 概览项目上下文锚定写回[4.1 经桥] + 任务详情弹窗宿主
        // [m3.1 D21/D23——drawerTaskId 受控挂载，挂载独立于 dock] + 悬浮进度流面板
        // [loop-event-delivery 1.8——行点击开 worker 子会话经 onOpenWorkerSession，数据 =
        // 账本行 projectionValues['forge-dispatch-events'] 窄读 + subscribe 实时刷新]；
        // selectPanel/rightbar/bridge/onOpenSession/openSession/openDocResource 官方窄面经 inject 递达）。
        // 卸载期顺带撤销桥发布、locale 词典与 mermaid DOM 增强器观察（1.45：dock tab
        // 类型撤销面随注册面归 @dsh-forge/project——壳链零该面）
        // + 清 __DSH_FORGE_CLIENT__
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
                // 弹窗挂接会话 pill 跳会话（官方导航动作面——dock 概览 tab 注入同径）。
                // D6 修复面：统一判读式打开——执行会话（worker 子会话）经账本 parentId →
                // 官方 SubagentAddress 形态（平开子会话 id 非官方支持径）；账本缺行 =
                // refresh 兜底后重判读（openSessionWithLedgerAddress 单源）。
                onOpenSession: (sessionId: string, parentSessionId?: string): void => {
                  openSessionWithLedgerAddress({ sessions, uiWorkspace }, sessionId, parentSessionId)
                },
                // 悬浮面板 ⟞ 打开 worker 执行子会话（m3.1 D6）：账本 parentId 判读 →
                // 子会话 = 官方 SubagentAddress 形态（openChild 同径——树零联动：worker
                // 不进左栏两级树，父会话行保持）；顶层会话平开。账本缺行（worker added
                // 广播未达/丢失）= refresh 兜底后重判读；官方面异常 fail-soft。
                // 键名 = onOpenWorkerSession（ShellHost props 契约——D6 原始实现的
                // openWorkerSession 键名错配 = ⟞ 恒 disabled 的根因，2026-10-10 报障收口）。
                onOpenWorkerSession: (childSessionId: string, parentSessionId?: string): void => {
                  openSessionWithLedgerAddress({ sessions, uiWorkspace }, childSessionId, parentSessionId)
                },
                // 打开新会话编排器（弹窗诊断「发送给 agent」——openSessionWithPreset 组合子）
                openSession: buildOpenSessionOrchestrator(
                  clientCtx as unknown as SessionActionsCtx,
                  uiWorkspace,
                  sessions,
                  workspaces,
                ),
                // 文档开出动作（弹窗参考 chip → dock 开文档 tab——官方导航控制器资源面；
                // 无在场面/地址不认领抛错 fail-soft 不外溢）
                openDocResource: (address: string): void => {
                  try {
                    sidebarRight.openResource(address, { kind: DOC_TAB_KIND })
                  } catch {
                    // fail-soft：无在场面（会话卸载瞬态）——chip 点击不外溢
                  }
                },
                // 会话名解析器（task-ui-info-density-blitz S1 通道——账本快照 displayTitle
                // 窄读；账本未命中 = undefined，调用方回退显示 sessionId fail-soft）
                sessionTitleOf: makeSessionTitleResolver(sessions),
                // 悬浮进度流面板数据源（loop-event-delivery 1.8——ctx.sessions.list 快照源
                // 直递：面板经账本行 projectionValues['forge-dispatch-events'] 窄读 + store
                // subscribe 实时刷新，零新增读取 API）
                sessions: sessions.list as SnapshotSource<LedgerSessionsSnapshot>,
                // 会话日志进度回放源（loop-message-consolidation 1.3——投影窗口截断时面板
                // 按本循环实例配对回放重建；R-Q1/R-Q2 消费侧兜底）
                progressLog: forgeProgressLogSource,
                // ⟞ worker 父反查兜底（fix：进行中任务无 record 审计行 → workerSessionOf
                // 恒空）：账本子行 parentId 扫描 + refresh 一次兜底（resolveWorkerChildSession
                // 单源）——旧载荷（无 workerSessionId）消费面。
                resolveWorkerSession: (parentSessionId: string, taskKey?: string): Promise<string | undefined> =>
                  resolveWorkerChildSession(sessions, parentSessionId, taskKey),
              }),
            },
            views.ForgeShellHost,
          )
          return () => {
            dispose()
            ;(globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__ = undefined
            ;(globalThis as { __DSH_FORGE_CLIENT__?: ForgeClientActiveMarker | undefined }).__DSH_FORGE_CLIENT__ = undefined
            disposeLocale()
            mermaidEnhancer.stop()
            disposeStartSessionWrap?.()
            disposeServiceListener?.()
            disposeConnectionBanner?.()
            ;(globalThis as { __DSH_FORGE_HEALTH__?: unknown }).__DSH_FORGE_HEALTH__ = undefined
          }
        })
      } catch (error) {
        // fix-33 ⑥：apply 中途抛错——桥/词典已发布即补撤销（死闭包不残留：桥持有官方
        // layout 闭包，插件已废而桥面仍活会路由进废 ctx；词典残留阻塞同 ns 重复登记。
        // 1.45 注记：dock tab 类型撤销面随注册面迁 @dsh-forge/project——壳 catch 链零该面）
        revokeBridgeAndLocale?.()
        const message = error instanceof Error ? error.message : String(error)
        // 诊断增强（2026-10-16）：apply 中断曾静默吞错——Forge 设置/dock/词典齐失而
        // console 无声，只能靠症状考古。回滚语义不变，补一行 loud 报错。
        console.error('[dswf-client] apply 中断（已回滚桥/词典）：', error)
        sidebarDiagnostics.error = message
        centerDiagnostics.error = message
        viewsDiagnostics.error = message
        shellDiagnostics.error = message
        dockDiagnostics.error = message
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
