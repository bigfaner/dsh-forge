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
// mobile-remote-approval 1.2：远程状态快照窄类型（type-only——bundle 自含纪律不破；
// 解析逻辑本文件 remote-face 段结构同型镜像 views/remote/remote-status.ts）
import type { RemoteStatusSnapshot, TunnelProvider } from '../views/remote/remote-status.js'
// 1.17 'forge/progress' Chat 节点定义（纯模块零 import——bundle 自含纪律不破）
import {
  FORGE_PROGRESS_NODE_KIND,
  FORGE_PROGRESS_NODE_SLOT,
  forgeProgressDefinition,
  type ForgeUiConversationService,
} from './progress-node.js'
// 4.6 打开新会话编排器（open-session.ts = 纯模块零 import——bundle 自含纪律不破）
import {
  createOpenSessionOrchestrator,
  insertReferenceAtTail,
  openSessionPlatformFrom,
  type ComposerInputFace,
  type OpenSessionBinding,
  type OpenSessionConversation,
  type OpenSessionOrchestrator,
  type OpenSessionServices,
  type PresetSelectResult,
  type ReferenceInsertMirror,
  type ReferenceInsertServices,
} from './open-session.js'
// composer-bug-reference 1.2 Bug 引用 source 纯模型（T1——bug-source.ts 零外部 import，
// bundle 自含纪律不破；本文件做注册行 + 接线面；1.4 chip 构造单一事实源同径复用）
import { bugIdOfRef, bugReferenceInsertOf, createBugReferenceSource, type BugCardSource, type BugReferenceSource } from './bug-source.js'
// bug 4b34e5d8 chip 重建缝（纯文本草稿 → scoped 事件 span-CAS 还原）
import { watchBugChipRestore } from './chip-restore.js'

/** 插件 id（= 注册键 = Loader entry 名 = 掌舵入图 id；与 shell/boot.ts 掌舵参数同源） */
export const FORGE_CLIENT_PLUGIN_ID = '@dsh-forge/web-client'

/** 构建指纹（手工递增——运行期与源码版本对账用，2d5434d1 指纹裁决） */
export const FORGE_CLIENT_BUILD_TAG = '2026-10-17.1'

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
/** 洞名：官方 composer 区 overlay 缝（InputBar overlayAnchor——input 元素上方官方缝；
 * fix-2 worktree 封存提示通道挂载位：SealNotice 一次性 + composer 占位文案并列呈现） */
export const CONVERSATION_INPUT_OVERLAY_SLOT = 'conversation.input.overlay'
/** worktree 会话头 chip 登记 id（SESSION_HEADER_ACTIONS_SLOT list 槽行键） */
export const WORKTREE_CHIP_ENTRY_ID = 'dswf-worktree-chip'
/** worktree 会话头 chip 登记序（官方带 -30/-20/-10/20 → -60 = 产品带内居前、不与旧 pill 位冲突） */
export const WORKTREE_CHIP_ORDER = -60
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
/**
 * Bug 台账 tab 类型 kind（composer-bug-reference 1.3——`sidebar.right.pane.tab` keyed
 * body dispatch 键；与 views/bug-reference/BugPreview.tsx DSWF_BUG_TAB_KIND 字面量同源 pin）
 */
export const BUG_TAB_KIND = 'dswf-bug'
/** Bug 台账资源地址前缀（openResource 去重键 = 地址本身；与 BugPreview.tsx DSWF_BUG_ADDRESS_PREFIX 字面量同源 pin） */
export const BUG_ADDRESS_PREFIX = `dsh-resource://${BUG_TAB_KIND}/`

/** Bug tab 地址（= 去重键 contentId：同 projectId+bugId 同 tab、异地址新开；BugPreview.forgeBugAddress 同构镜像） */
export function bugAddressOf(projectId: string, bugId: string): string {
  return `${BUG_ADDRESS_PREFIX}${projectId}/${bugId}`
}

/** Bug tab 地址解析（纯函数）：前缀 + `<projectId>/<bugId>` 取 bugId 段；形状非法 → undefined */
export function bugIdOfAddress(address: string): string | undefined {
  if (!address.startsWith(BUG_ADDRESS_PREFIX)) return undefined
  const rest = address.slice(BUG_ADDRESS_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0 || slash === rest.length - 1) return undefined
  const bugId = rest.slice(slash + 1)
  return bugId === '' ? undefined : bugId
}
// 1.8/1.9 渲染链退役收口：官方预览径 md mermaid 扩展注册链（定义元数据 + keyed body 槽
// + 惰性两段注册）整体退役，sidebar md 预览回归官方 builtin；mermaid 出图改经 DOM 增强
// 器（1.9 挂接——apply 期 start，随插件 fiber 卸载级联 stop）。
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
 * 洞名：官方侧栏底行扩展槽（dsh-client-ui-sidebar SlotMap——kind list / scope root，声明
 * 语义「Optional actions beside Settings at the sidebar foot」；pin-06 探针锚同源）。
 * 产品占用一行：'dswf-remote'（手机远程入口——设置按钮同排右侧；mobile-remote-approval
 * 1.2，探针点①结论驱动——官方槽在场即用之，无自造槽位）。
 */
export const SIDEBAR_FOOTER_ACTION_SLOT = 'sidebar.footer.action'
/** 手机远程入口登记 id（list 槽行键） */
export const FORGE_REMOTE_ENTRY_ID = 'dswf-remote'
/** 手机远程入口登记序（官方设置钮为底行本体——产品行排其右，order 取 10 留序） */
export const FORGE_REMOTE_ENTRY_ORDER = 10

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
  'uiConversation',
] as const

/** 产品 locale 命名空间（官方 locale 服务词典登记键——LOCALE_IDS = zh/en） */
export const FORGE_LOCALE_NS = 'dsh-forge'

/**
 * composer 草稿缝（1.29——会话创建唯一时机 = 首条消息的意图源 + arm 后草稿搬运）：
 * sourceOf = 会话 id 经官方 `sessions.binding(id).ctx` → `conversation.input.for(actx).state`
 * 快照 store（InputState.draft 消费切片；binding 未就绪/缝缺席 = undefined fail-soft）；
 * carryDraft = arm 换会话后把已键入首条消息 `setDraft` 到产物会话（binding 物化轮询等待
 * ——open-session 适配层同配方），并 best-effort 清原会话草稿防幻影。跨 bundle 双本体
 * 注记同上（纯函数本体在 hero-picker-model——此处只做服务装配）。
 */
function composerDraftFace(
  ctx: ForgeClientCtx,
  sessions: ForgeSessionsService,
): {
  sourceOf: (sessionId: string) => { getSnapshot?: () => unknown; subscribe?: (cb: () => void) => () => void } | undefined
  carryDraft: (sessionId: string, text: string, previousSessionId?: string) => Promise<boolean>
} {
  const bindingCtxOf = (sessionId: string): { ctx?: unknown } | null | undefined =>
    (sessions as unknown as { binding?: (id: string) => unknown }).binding?.(sessionId) as
      | { ctx?: unknown }
      | null
      | undefined
  const inputFaceOf = (actx: unknown): Record<string, unknown> | undefined => {
    const resolved = (asRecord(reflectServiceGet(ctx, 'conversation'))?.['input'] as
      | { for?: (a: unknown) => unknown }
      | undefined)?.['for']?.(actx)
    return asRecord(resolved)
  }
  return {
    sourceOf: (sessionId) => {
      try {
        const actx = bindingCtxOf(sessionId)?.ctx
        if (actx === undefined || actx === null) return undefined
        const state = inputFaceOf(actx)?.['state']
        if (state === undefined || typeof (state as { getSnapshot?: unknown })?.getSnapshot !== 'function') return undefined
        return state as { getSnapshot?: () => unknown; subscribe?: (cb: () => void) => () => void }
      } catch {
        return undefined
      }
    },
    carryDraft: async (sessionId, text, previousSessionId) => {
      // binding 物化轮询等待（open-session 适配层同配方——会话作用域 fiber 容错），超时
      // 5s = false（草稿留在原会话不丢）
      const deadline = Date.now() + 5_000
      const writeDraft = (id: string, value: string): boolean => {
        try {
          const actx = bindingCtxOf(id)?.ctx
          if (actx === undefined || actx === null) return false
          const face = inputFaceOf(actx)
          const setDraft = face?.['setDraft']
          if (typeof setDraft !== 'function') return false
          setDraft.call(face, value)
          return true
        } catch {
          return false
        }
      }
      // A6 重读面：会话当前草稿快照（缝缺席/漂移 = undefined——调用方退触发时快照）
      const draftTextOf = (id: string): string | undefined => {
        try {
          const actx = bindingCtxOf(id)?.ctx
          if (actx === undefined || actx === null) return undefined
          const state = inputFaceOf(actx)?.['state']
          const draft = (state as { getSnapshot?: () => unknown } | undefined)?.getSnapshot?.() as
            | { draft?: unknown }
            | undefined
          return typeof draft?.draft === 'string' ? draft.draft : undefined
        } catch {
          return undefined
        }
      }
      while (Date.now() < deadline) {
        if (writeDraft(sessionId, text)) {
          // A6 增量搬运（落笔前重读）：重读原会话当前草稿为准——官方发送清空草稿时重读
          // 空串 = 已发送文本不回填（双发根因消除）；重读不可得退回触发时快照。
          const reread = previousSessionId !== undefined ? draftTextOf(previousSessionId) : undefined
          void writeDraft(sessionId, carryDraftTextOf(text, reread))
          // 原会话草稿清退（best-effort——防切回旧 blank 会话见幻影草稿；失败不回滚搬运）
          if (previousSessionId !== undefined) writeDraft(previousSessionId, '')
          return true
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      return false
    },
  }
}

/**
 * 1.26 编排默认账本读面（activeSessionCwdOf / blankSessionIdByCwdOf / worktreeCwdKey）。
 * 跨 bundle 双本体注记：forge-client = classic script 自含 bundle（含 import/export 即
 * 构建失败——2026-10-17 实证），不得 import app bundle 模块；同一组纯函数的 app 侧本体
 * 在 views/session/hero-picker-model.ts（hero worktree mount 消费），两侧行为由各自
 * 单测 pin（plugin.test 账本读面 describe / hero-picker-model.test）。
 */

/**
 * worktree 路径归一键（1.21/1.24 口径——账本 cwd 与清单行 path 跨源比对单源）：
 * 反斜杠→正斜杠 + 去尾斜杠 + 小写。
 */
export function worktreeCwdKey(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}

/** 账本快照窄读单步（getSnapshot 调用 + byId 取行——快照缺席/形状漂移 = undefined fail-soft） */
function ledgerRowsOf(list: unknown): Record<string, unknown> | undefined {
  if (typeof list !== 'object' || list === null) return undefined
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return undefined
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return undefined
  }
  const byId = (snapshot as { byId?: unknown } | null)?.byId
  return typeof byId === 'object' && byId !== null ? (byId as Record<string, unknown>) : undefined
}

/**
 * 主视图在留会话 cwd 解析（1.26 编排默认 arm 去重判定——activeSessionIdOf 同判据
 * `retainedBy.mainView > 0`，加读 cwd 字段）。快照缺席/形状漂移/无在留行 = undefined。
 */
export function activeSessionCwdOf(list: unknown): string | undefined {
  for (const row of Object.values(ledgerRowsOf(list) ?? {})) {
    const mainView = (row as { retainedBy?: { mainView?: unknown } } | null)?.retainedBy?.mainView
    const cwd = (row as { cwd?: unknown } | null)?.cwd
    if (typeof mainView === 'number' && mainView > 0 && typeof cwd === 'string' && cwd !== '') return cwd
  }
  return undefined
}

/**
 * 按 cwd 反查空白会话 id（arm reuse-or-create 判定——编排默认重复消费不重复建会话）。
 * G4 官方四件套（reuseOrCreateBlank 源码核销 2026-10-17）：blank ∧ cwd 归一命中 ∧
 * workspace 归属（workspace.sessionIds 含 id）∧ 非归档（archivedSessionIds 不含 id）。
 * workspaces 快照缺席/漂移 = fail-closed 不复用（宁可走 host sessionCreate 互斥面重用产物，
 * 不误复用他树会话）。
 */
export function blankSessionIdByCwdOf(list: unknown, cwd: string, workspaces?: unknown): string | undefined {
  const key = worktreeCwdKey(cwd)
  const snapshot = asRecord(workspaces)
  const archived = Array.isArray(snapshot?.['archivedSessionIds']) ? (snapshot['archivedSessionIds'] as readonly unknown[]) : undefined
  const items = Array.isArray(snapshot?.['items']) ? (snapshot['items'] as readonly unknown[]) : undefined
  if (archived === undefined || items === undefined) return undefined
  const workspace = items.find((row) => {
    const path = asRecord(row)?.['path']
    return typeof path === 'string' && worktreeCwdKey(path) === key
  })
  const members = Array.isArray(asRecord(workspace)?.['sessionIds']) ? (asRecord(workspace)?.['sessionIds'] as readonly unknown[]) : undefined
  if (members === undefined) return undefined
  for (const [id, row] of Object.entries(ledgerRowsOf(list) ?? {})) {
    if (id === '') continue
    if ((row as { blank?: unknown } | null)?.blank !== true) continue
    const rowCwd = (row as { cwd?: unknown } | null)?.cwd
    if (typeof rowCwd !== 'string' || worktreeCwdKey(rowCwd) !== key) continue
    if (!members.includes(id) || archived.includes(id)) continue
    return id
  }
  return undefined
}

/** 官方 workspaces.list 快照窄读（G4 归属/归档两件数据源；快照缺席 = undefined fail-closed） */
function workspacesSnapshotOf(list: unknown): unknown {
  try {
    return (list as { getSnapshot?: () => unknown } | null | undefined)?.getSnapshot?.()
  } catch {
    return undefined
  }
}

/**
 * A6 carryDraft 增量搬运落笔值（纯函数单源）：落笔前重读原会话草稿——重读可得即以重读为
 * 准（官方发送清空草稿 → 重读空串 = 已发送文本不回填，双发根因消除）；重读不可得（缝
 * 缺席/快照漂移）退回触发时快照。
 */
export function carryDraftTextOf(text: string, reread: string | undefined): string {
  if (typeof reread !== 'string') return text.trim()
  return reread.trim()
}

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

/**
 * 账本行在场判定（纯函数——D6 修复面）：byId[sessionId] 行是否存在。行在场 → parentId
 * 判读一次即定（有无都定——顶层/子会话均不重拉）；行缺席（in-process worker 的 added
 * 广播未达/丢失——真实派发径的常见态：worker 创建与 dispose 的广播均不保证到达，而宿主
 * 重启后的全量 list 读盘恒含持久子会话行）→ 需 refresh 全量基线后重判读。形状漂移/异常
 * = false（与 sessionParentIdOf 同防御口径）。
 */
export function sessionRowInLedger(list: unknown, sessionId: string): boolean {
  if (typeof list !== 'object' || list === null) return false
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return false
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return false
  }
  if (typeof snapshot !== 'object' || snapshot === null) return false
  return (snapshot as { byId?: Record<string, unknown> }).byId?.[sessionId] !== undefined
}

/**
 * 账本父反查子会话（纯函数——⟞ 进行中 worker 兜底面）：byId 扫描 row.parentId ===
 * parentSessionId 的子行。taskKey 在场时优先按 displayTitle 前缀 `${taskKey} · ` 命中
 * 目标任务的子行（spawn 标签 = `${taskKey} · ${任务名}` 落账本 displayTitle——同父多
 * worker 判别单源）；无键命中（标签漂移/旧数据/缺省）回退 updatedAt 择新（字符串 ISO
 * 字典序防御窄读；全体缺席/非串回退枚举末位）。零命中/形状漂移/快照异常 = undefined
 * （调用面 no-op fail-soft）。
 * Root cause（bug 661bce2b）：原实现任务键无关、恒取同父最新子行——一父多 worker 时
 * 进行中任务的 ⟞ 打开的是别的任务的子会话。
 */
export function workerChildSessionOf(list: unknown, parentSessionId: string, taskKey?: string): string | undefined {
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
  const byId = (snapshot as { byId?: Record<string, { readonly parentId?: unknown; readonly updatedAt?: unknown; readonly displayTitle?: unknown }> }).byId
  if (typeof byId !== 'object' || byId === null) return undefined
  const keyPrefix = taskKey === undefined ? undefined : `${taskKey} · `
  let bestId: string | undefined
  let bestUpdatedAt: string | undefined
  let keyedId: string | undefined
  for (const [sessionId, row] of Object.entries(byId)) {
    if (typeof row !== 'object' || row === null || row.parentId !== parentSessionId) continue
    const updatedAt = typeof row.updatedAt === 'string' ? row.updatedAt : undefined
    const newer =
      updatedAt !== undefined && (bestUpdatedAt === undefined || updatedAt > bestUpdatedAt)
    if (bestId === undefined || newer || (updatedAt === undefined && bestUpdatedAt === undefined)) {
      bestId = sessionId
      bestUpdatedAt = updatedAt
    }
    if (keyPrefix !== undefined && keyedId === undefined) {
      const title = row.displayTitle
      if (typeof title === 'string' && title.startsWith(keyPrefix)) keyedId = sessionId
    }
  }
  return keyedId ?? bestId
}

/**
 * 父反查 worker 子会话解析（纯异步面——⟞ 兜底径）：首扫账本；miss（in-process worker 的
 * added 广播未达——D6 修复面同款场景）→ refresh 全量基线一次后重扫（宿主 session.list
 * 读盘上报持久子会话行）；仍 miss / refresh 缺席或抛错 = undefined fail-soft
 * （openSessionWithLedgerAddress refresh 兜底同刻度）。
 */
export async function resolveWorkerChildSession(
  services: Pick<ForgeSessionsService, 'list' | 'refresh'>,
  parentSessionId: string,
  taskKey?: string,
): Promise<string | undefined> {
  const first = workerChildSessionOf(services.list, parentSessionId, taskKey)
  if (first !== undefined) return first
  const refresh = services.refresh
  if (refresh === undefined) return undefined
  try {
    await refresh()
  } catch {
    return undefined
  }
  return workerChildSessionOf(services.list, parentSessionId, taskKey)
}

/**
 * 会话名解析（纯函数——task-ui-info-density-blitz S1 通道）：账本快照窄读
 * byId[sessionId].displayTitle。命中（非空串）= 返回标题；行缺席（归档/旧会话/快照
 * 缺行）/形状漂移/快照异常/非串/空串 = undefined（调用方回退显示 sessionId——fail-soft
 * 口径与 sessionParentIdOf 同源）。
 */
export function sessionTitleOf(list: unknown, sessionId: string): string | undefined {
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
  const title = (snapshot as { byId?: Record<string, { displayTitle?: unknown }> }).byId?.[sessionId]
    ?.displayTitle
  return typeof title === 'string' && title !== '' ? title : undefined
}

/**
 * 会话名解析器组装（S1 通道——shell.overlay inject face 递达 ShellHost → 任务弹窗组件
 * 的闭包面）：账本快照源（sessions.list）单源，缺省 undefined 回退归调用方。
 */
export function makeSessionTitleResolver(
  sessions: ForgeSessionsService,
): (sessionId: string) => string | undefined {
  return (sessionId: string): string | undefined => sessionTitleOf(sessions.list, sessionId)
}

/**
 * 活跃会话解析（纯函数——1.4 Bug 快速路径「有活跃会话」判读；bug 15faa6f0 修正）：
 * 官方 SessionListState 无 current 字段（view selection 在 Controller 之外）——当前会话
 * 正本 = ui-session publishMain 同径：byId 行 `retainedBy.mainView > 0` 即主视图在留
 * （该会话因已被 retain，sessions.binding(id) 按「borrow an already-retained binding」
 * 语义可用）。快照缺席/形状漂移/无在留行 = undefined（调用方走无活跃会话兜底：开新会话预填）。
 */
// Root cause: 实现者虚构了快照 current 字段（官方类型无此成员），活跃判读恒 undefined。
export function activeSessionIdOf(list: unknown): string | undefined {
  if (typeof list !== 'object' || list === null) return undefined
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return undefined
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return undefined
  }
  const byId = (snapshot as { byId?: unknown } | null)?.byId
  if (typeof byId !== 'object' || byId === null) return undefined
  for (const row of Object.values(byId as Record<string, unknown>)) {
    const id = (row as { id?: unknown } | null)?.id
    const mainView = (row as { retainedBy?: { mainView?: unknown } } | null)?.retainedBy?.mainView
    if (typeof id === 'string' && id !== '' && typeof mainView === 'number' && mainView > 0) return id
  }
  return undefined
}
/**
 * 打开会话（判读式统一径——D6 修复面）：显式父（库侧权威——任务挂接双源卡的 link 派发
 * 会话 = worker 的 durable 父）仅在账本缺行时直接 SubagentAddress 形态打开（进行中
 * worker 的账本行/盘上日志均未落的场景恒可得——98189bf 径）；账本行在场 = 宿主持久化
 * 父子关系为权威，按行自身 parentId 判读（合成挂接/非官方父子域的显式父不再强制
 * SubagentAddress——官方校验拒亲子关系即 subagent/unauthorized 历史加载失败横幅，
 * m2 tsl :173/:538 fixture 实证）。无显式父 → 账本 parentId 判读 → 子会话 = 官方地址
 * 形态（openChild 同径——树零联动），顶层 = 平开。账本缺行（worker 的 added 广播未达/
 * 丢失）→ refresh 全量基线后重判读一次（宿主 session.list 读盘上报持久子会话行——
 * header parentSession 在场）；refresh 缺席/失败/仍缺行 = 平开（顶层会话常态径）。
 * 行在场路径零异步（同步判读同步开——高频顶层径不加拍）。官方面异常 fail-soft 不外溢。
 * 悬浮面板 ⟞ 与任务详情执行会话 pill 两消费面共用。
 */
export function openSessionWithLedgerAddress(
  services: {
    readonly sessions: ForgeSessionsService
    readonly uiWorkspace: ForgeUiWorkspaceService
  },
  sessionId: string,
  parentSessionId?: string,
): void {
  const openWith = (parentId: string | undefined): void => {
    try {
      services.uiWorkspace.openSession(workerOpenTarget(parentId, sessionId))
    } catch {
      // fail-soft：无会话面（会话卸载瞬态）——点击不外溢
    }
  }
  if (parentSessionId !== undefined && !sessionRowInLedger(services.sessions.list, sessionId)) {
    openWith(parentSessionId)
    return
  }
  const parentId = sessionParentIdOf(services.sessions.list, sessionId)
  if (parentId !== undefined || sessionRowInLedger(services.sessions.list, sessionId)) {
    openWith(parentId)
    return
  }
  const refresh = services.sessions.refresh
  if (typeof refresh !== 'function') {
    openWith(undefined)
    return
  }
  void Promise.resolve(refresh.call(services.sessions))
    .catch(() => undefined)
    .then(() => {
      openWith(sessionParentIdOf(services.sessions.list, sessionId))
    })
}

/** dsh workspace 服务窄面（IWorkspaces 消费切片：归属快照源——快照自带 registry 级
 * archivedSessionIds/pinnedSessionIds 两集合，sidebar-model 窄镜像消费；动作面经
 * uiWorkspace 服务走（官方同径——含置顶排序/通知/归档选中清面编排）） */
export interface ForgeWorkspacesService {
  readonly list: unknown
}

/**
 * 会话改名官方面组装（D45——官方 RenameSession 适配同径）：`sessions.using` 借用
 * 会话作用域引用 → `binding.session.rename(title)`（RemoteResult 信封——!ok 抛
 * `error.message`，官方 renameSession 同判；成功 = 归一化标题已落宿主）。sessions.using
 * 缺席（上游面漂移）= 返回 undefined → 面板改名菜单项不呈现（P1：变更面缺席 = 对应项
 * 不出现）。binding.session.rename 缺席（会话未就绪/面漂移）= 调用期拒绝 → 改名模态
 * 呈现错误（官方对话框错误面同型）。
 */
export function makeSessionRenameFace(
  sessions: ForgeSessionsService,
): ((sessionId: string, title: string) => Promise<void>) | undefined {
  if (typeof sessions.using !== 'function') return undefined
  return async (sessionId: string, title: string): Promise<void> => {
    const result = (await sessions
      .using!(sessionId, { source: 'workspaceOperation' }, (reference: unknown) =>
        sessionRenameViaBinding(reference, title),
      )
      .catch((cause: unknown) => {
        throw cause instanceof Error ? cause : new Error(String(cause))
      })) as { ok: boolean; error?: { message?: string } }
    if (result === null || typeof result !== 'object' || result.ok !== true) {
      const message =
        (typeof result === 'object' && result !== null && result.error?.message) || '会话改名被拒绝'
      throw new Error(message)
    }
  }
}

/** 借用引用 → session.rename 调用（纯适配——形状漂移 = 拒绝，不静默捏造结果） */
function sessionRenameViaBinding(reference: unknown, title: string): Promise<unknown> {
  const session = (
    reference as { binding?: { session?: { rename?: (title: string) => Promise<unknown> } } } | null
  )?.binding?.session
  if (session === undefined || typeof session.rename !== 'function') {
    return Promise.reject(new Error('session.rename 缺席（上游面漂移）'))
  }
  return session.rename(title)
}

/**
 * 会话行动作注入面（D45——sidebar.workspaces 洞位 inject face 的会话行动作段）：逐位
 * 探测官方面在场性，缺席（上游面漂移）= 键缺席 → 面板对应动作钮/菜单项不呈现。归档
 * 拒绝（运行中会话 workspace/session-active）原样上抛给面板（停止并归档确认流消费）。
 */
export function sessionActionFaceOf(services: {
  readonly uiWorkspace: ForgeUiWorkspaceService
  readonly sessions: ForgeSessionsService
}): {
  archiveSession?: (sessionId: string, options?: { readonly stopActivity?: boolean }) => Promise<void>
  unarchiveSession?: (sessionId: string) => Promise<void>
  pinSession?: (sessionId: string) => Promise<void>
  unpinSession?: (sessionId: string) => Promise<void>
  forkSession?: (sessionId: string) => Promise<unknown>
  renameSession?: (sessionId: string, title: string) => Promise<void>
} {
  const face: {
    archiveSession?: (sessionId: string, options?: { readonly stopActivity?: boolean }) => Promise<void>
    unarchiveSession?: (sessionId: string) => Promise<void>
    pinSession?: (sessionId: string) => Promise<void>
    unpinSession?: (sessionId: string) => Promise<void>
    forkSession?: (sessionId: string) => Promise<unknown>
    renameSession?: (sessionId: string, title: string) => Promise<void>
  } = {}
  const { uiWorkspace } = services
  if (typeof uiWorkspace.archiveSession === 'function') {
    face.archiveSession = (sessionId, options) =>
      uiWorkspace.archiveSession!(sessionId, options)
  }
  if (typeof uiWorkspace.unarchiveSession === 'function') {
    face.unarchiveSession = (sessionId) => uiWorkspace.unarchiveSession!(sessionId)
  }
  if (typeof uiWorkspace.pinSession === 'function') {
    face.pinSession = (sessionId) => uiWorkspace.pinSession!(sessionId)
  }
  if (typeof uiWorkspace.unpinSession === 'function') {
    face.unpinSession = (sessionId) => uiWorkspace.unpinSession!(sessionId)
  }
  if (typeof uiWorkspace.forkSession === 'function') {
    face.forkSession = (sessionId) => uiWorkspace.forkSession!(sessionId)
  }
  const renameSession = makeSessionRenameFace(services.sessions)
  if (renameSession !== undefined) face.renameSession = renameSession
  return face
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
    ForgeSidebarSlot: unknown
    ForgeBrandMark: unknown
    ForgeBrandName: unknown
    ForgeShellHost: unknown
    ForgeHeroPanel: unknown
    ForgeKnowledgePanel: unknown
    ForgeKnowledgeGlyph: unknown
    ForgeRecallView: unknown
    ForgeDispatchToolRow: unknown
    ForgeProgressNode: unknown
    ForgeOverviewTab: unknown
    ForgeDocsTab: unknown
    ForgeHeroWorkspacePicker: unknown
    /** fix-2：conversation.session.header.actions 槽只读 chip（worktree 绑定展示/封存失效态） */
    ForgeSessionWorktreeChip: unknown
    /** fix-2：conversation.input.overlay 槽封存提示（notice 一次性 + composer 占位文案） */
    ForgeWorktreeSealOverlay: unknown
    /** bug 4b34e5d8：conversation.input.overlay 槽 chip 重建（零视觉效应挂载点） */
    ForgeBugChipRestoreOverlay: unknown
    ForgeSettingsSection: unknown
    ForgeRemoteEntry: unknown
    /** Bug 组行图标件（composer-bug-reference 1.2——自带 IconProps 组件居壳 bundle；缺席 = 行零 icon 键） */
    ForgeBugGlyph?: unknown
    /** Bug 台账 tab body（composer-bug-reference 1.3——sidebar.right.pane.tab keyed 'dswf-bug' 占用者） */
    ForgeBugPreview?: unknown
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
      | 'sidebarRightTabs'
      | 'layout'
      | 'locale'
      | 'conversation'
      | 'uiConversation',
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
 * D45 会话行动作面（…菜单/归档/置顶）= sessionActionFaceOf 逐位探测组装（官方面缺席 =
 * 键缺席 → 面板对应项不呈现——P1 口径沿袭）。
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
          // D45 会话行动作面（…菜单/归档/置顶钮——官方面缺席 = 键缺席 → 面板对应项不呈现）
          ...sessionActionFaceOf(services),
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
 * 即 throw——fix-23 runtime 实证；影子只取渲染位不撤官方登记，fix-14/16 原生选取链不断）
 * + dispatchTask 对话工具行（tool.call.toolview keyed 'dispatchTask'——2026-10-09 用户
 * 实机报障收口：官方通用行参数摘要取「首个字符串值」= source_kind 种类词，业务视图
 * 接管后摘要段 = source_slug 容器标识 + 结算后任务键后缀；locale 行声明本插件 NS——
 * 行内 t 座即 FORGE_LOCALE_NS）。
 */
function registerConversationViews(
  ctx: ForgeClientCtx,
  views: PublishedViews,
  bridge: PublishedBridge,
  t: (key: string) => string,
  diagnostics: { registered?: string[] },
  uiWorkspace: ForgeUiWorkspaceService,
  sessions: ForgeSessionsService,
  workspaces: ForgeWorkspacesService,
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
      {
        name: HERO_WORKSPACE_SLOT,
        priority: SIDEBAR_SHADOW_PRIORITY,
        // fix-2：worktree 挂靠编排缝。1.29 时序裁决：点选 = 纯选中态（挂载面本地闭环，
        // 零编排）；本 face 只剩 arm 消费点（会话创建唯一时机 = 首条消息）——openSession、
        // blankSessionByCwd（reuse-or-create）、sessionsList（账本活源）与 composerDraft
        // （首条消息意图源 + arm 后草稿搬运）。
        inject: () => ({
          worktree: {
            openSession: (sessionId: string): void => {
              try {
                uiWorkspace.openSession(sessionId)
              } catch {
                // 官方导航面异常（会话卸载瞬态）fail-soft 不外溢
              }
            },
            // G4 官方四件套：reuse 判据补齐 workspace 归属 + 非归档两件（官方
            // reuseOrCreateBlank 语义对齐；workspaces 快照缺席 = fail-closed 不复用）
            blankSessionByCwd: (cwd: string): string | undefined =>
              blankSessionIdByCwdOf(sessions.list, cwd, workspacesSnapshotOf(workspaces.list)),
            sessionsList: sessions.list,
            composerDraft: composerDraftFace(ctx, sessions),
          },
        }),
      },
      views.ForgeHeroWorkspacePicker,
    ),
  )
  registerSlotEntry(ctx, TOOL_CALL_TOOLVIEW_SLOT, diagnostics, () =>
    ctx.slots.register(
      // keyed 最小面：key = wire 工具名（未注册名走官方通用行——本行只接管 dispatchTask）；
      // locale = 行文案 NS（runtime 据此绑 t 座递达组件）；零 inject（行数据 = owner
      // props 自足：三相块 + 展开钩子 + inspect 回调）
      { name: TOOL_CALL_TOOLVIEW_SLOT, key: DISPATCH_TASK_TOOL_KEY, locale: FORGE_LOCALE_NS },
      views.ForgeDispatchToolRow,
    ),
  )
  registerProgressNode(ctx, views, diagnostics)
}

/**
 * worktree 六卡挂载登记（fix-2——装配缺口承接②）：两槽位注册——
 *   · `conversation.session.header.actions` list 行 'dswf-worktree-chip'（会话头只读 chip
 *     ——绑定展示/封存失效态；sessionId 标准货币由槽 runtime 递达，job-list 同径先例）；
 *   · `conversation.input.overlay` 官方 composer 区 overlay 缝（封存提示双通道：SealNotice
 *     一次性 + composer 占位文案；均提示性视觉——硬保证在 host 发送拦截面）。
 * hero 第二 chip 挂载不占新槽位（难点 A 落法③：ForgeHeroWorkspacePicker 影子渲染面就地
 * 并列——取证见 walkthrough/hero-second-chip-decision.md，inject 编排缝在其登记行）。
 */
function registerWorktreeFaces(
  ctx: ForgeClientCtx,
  views: PublishedViews,
  diagnostics: { registered?: string[] },
): void {
  registerSlotEntry(ctx, SESSION_HEADER_ACTIONS_SLOT, diagnostics, () =>
    ctx.slots.register(
      {
        name: SESSION_HEADER_ACTIONS_SLOT,
        id: WORKTREE_CHIP_ENTRY_ID,
        order: WORKTREE_CHIP_ORDER,
      },
      views.ForgeSessionWorktreeChip,
    ),
  )
  registerSlotEntry(ctx, CONVERSATION_INPUT_OVERLAY_SLOT, diagnostics, () =>
    ctx.slots.register(
      // list 槽官方校验必带 id（Root cause: fix-2 漏 id → apply 中断静默回滚，
      // Forge 设置/dock/词典齐失——bug 判例 2026-10-16）
      { name: CONVERSATION_INPUT_OVERLAY_SLOT, id: 'dswf-worktree-seal' },
      views.ForgeWorktreeSealOverlay,
    ),
  )
  registerSlotEntry(ctx, CONVERSATION_INPUT_OVERLAY_SLOT, diagnostics, () =>
    ctx.slots.register(
      // bug 4b34e5d8：零视觉效应行——会话作用域挂载即接「纯文本草稿 → chip 重建」订阅缝
      { name: CONVERSATION_INPUT_OVERLAY_SLOT, id: BUG_CHIP_RESTORE_ENTRY_ID },
      views.ForgeBugChipRestoreOverlay,
    ),
  )
}

/** Bug chip 重建缝 overlay 登记 id（conversation.input.overlay list 槽行键） */
export const BUG_CHIP_RESTORE_ENTRY_ID = 'dswf-bug-chip-restore'

/**
 * 1.17 循环进度流内交错节点（'forge/progress' 会话事件——decisions #34）：两段注册
 * （workflow-run 同型）——① `uiConversation.events.register` 节点 Definition（每枚事件
 * 独立成节点，seq 时序天然交错；零折叠）；② `conversation.chat.node` keyed
 * 'forge-progress' body（DisclosureRow 同族折叠行——组件经发布面递达）。uiConversation
 * 缺席/异常 = 两段全跳 fail-soft 不炸（capability absence = 无节点——宿主未装配官方
 * 会话注册表的降级面）；notice 双通道零回归（本节点为非模型面事件渲染，零模型回合）。
 */
function registerProgressNode(ctx: ForgeClientCtx, views: PublishedViews, diagnostics: { registered?: string[] }): void {
  let uiConversation: ForgeUiConversationService | undefined
  try {
    uiConversation = ctx.get('uiConversation') as ForgeUiConversationService | undefined
  } catch {
    uiConversation = undefined
  }
  const registerEvents = uiConversation?.events?.register
  if (uiConversation === undefined || typeof registerEvents !== 'function') return
  try {
    registerEvents.call(uiConversation.events, forgeProgressDefinition)
  } catch {
    return // Definition 注册被拒（重复 kind 等）——渲染段不落半座
  }
  registerSlotEntry(ctx, FORGE_PROGRESS_NODE_SLOT, diagnostics, () =>
    ctx.slots.register(
      // keyed node body：key = 节点 kind（buildViewNode.kind 字面量同源）；locale NS
      // 声明（行内 t 座——组件自足标签暂零词条，注册面留语言归属锚）
      { name: FORGE_PROGRESS_NODE_SLOT, key: FORGE_PROGRESS_NODE_KIND, locale: FORGE_LOCALE_NS },
      views.ForgeProgressNode,
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

/**
 * 底行手机远程入口登记（mobile-remote-approval 1.2/fix-3）：官方 `sidebar.footer.action`
 * 扩展槽（探针点①结论——现成槽位，设置按钮同排）list 行 'dswf-remote'。注入面 = 状态
 * 快照源（产品自有配置 × boot manifest 双源——buildRemoteStatusSource 单源，fix-3 重启
 * 生效形态）+ 开关动作（forge:settings/set remoteApproval 分节回写）；label 经 locale NS
 * thunk（fix-33 ⑧）。配置面缺席 = 组件 fail-soft 灰态（源恒在场，快照 off）。
 */
function registerRemoteEntry(
  ctx: ForgeClientCtx,
  views: PublishedViews,
  t: (key: string) => string,
  diagnostics: { registered?: string[] },
): void {
  const remote = buildRemoteStatusSource(ctx)
  registerSlotEntry(ctx, SIDEBAR_FOOTER_ACTION_SLOT, diagnostics, () =>
    ctx.slots.register(
      {
        name: SIDEBAR_FOOTER_ACTION_SLOT,
        id: FORGE_REMOTE_ENTRY_ID,
        order: FORGE_REMOTE_ENTRY_ORDER,
        locale: FORGE_LOCALE_NS,
        label: (): string => t('remote.entry'),
        inject: () => ({
          status: remote.source,
          onToggle: (next: boolean): Promise<void> => remote.setEnabled(next).then(() => undefined),
          // fix-8（用户裁决 2026-10-14）：配对面承载改回官方 Modal dialog——fix-7 的
          // onOpenPairing 注入缝（dshForge.openPairingWindow → host 独立配对窗）整体退役，
          // 图标点击开合入口组件内 dialog（ForgeRemoteEntry 自持 open 态）
          // fix-3 挂载期初刷（重启生效形态）：重启后装配期绑定变化只能在挂载时捕获——
          // 组件 mount useEffect 消费（缺席 = 兼容旧组件面，快照保默认 off）
          refresh: (): Promise<void> => remote.refresh(),
          // fix-10：断开连接（官方锚 :1176 outline 钮——forge:remote/disconnect 撤该设备
          // 会话缝 + 即时 refresh；成功后快照回等待扫码）
          onDisconnect: (): Promise<void> => remote.disconnectDevice().then(() => undefined),
          // fix-17 ②：tab 切换重连（切互联网 tab 隧道不在线 → tunnel-toggle 触发建立 + refresh）
          onTunnelEnsure: (): Promise<void> => remote.tunnelEnsure().then(() => undefined),
          // fix-18 ②：换线（互联网 tab 换线链接 → tunnel-fallback 触发显式换线 + refresh）
          onFallback: (): Promise<void> => remote.tunnelFallback().then(() => undefined),
          // fix-18 ③：PIN 重置（PIN 方框「重置密码」→ pin-reset 触发 pinIssuer.rotate + refresh）
          onPinReset: (): Promise<void> => remote.pinReset().then(() => undefined),
          // fix-26：长效密码开关（consent checkbox/「取消长效密码」→ pin-consent 触发 setDurable + refresh）
          onPinConsent: (consent: boolean): Promise<void> => remote.pinConsent(consent).then(() => undefined),
        }),
      },
      views.ForgeRemoteEntry,
    ),
  )
}

// ============================================================================
// Bug 引用 source 注册（composer-bug-reference 1.2）：官方 input-trigger 管线挂 T1
// Bug source（trigger '@'，组名唯一，order 排在文件/会话组后）。
// ============================================================================

/** Bug 组名（@ 菜单独立组标题行——唯一性由官方 registerSource duplicate throw 硬守卫） */
export const FORGE_BUG_SOURCE_NAME = 'dswf-bug'
/** Bug 组排序（官方 @reference 组缺省 0 → 30 = 文件/会话组之后） */
export const FORGE_BUG_SOURCE_ORDER = 30

/**
 * forge RPC 通道字面量（contracts BUGS_CHANNELS.list / PROJECTS_CHANNELS.list 同源镜像
 * ——bundle 自持禁跨 chunk import：rpc/client 为壳树共享模块，rollup 会拆公共 chunk 破坏
 * forge-client.js classic script 形状[client-bundle-shape.test 同源教训]，故不走 preload
 * RPC client，经页内 dshForge.invoke 直达 + 信封拆装镜像）。
 */
export const BUGS_LIST_CHANNEL = 'forge:bugs/list'
export const PROJECTS_LIST_CHANNEL = 'forge:projects/list'

/** forge RPC 传输窄缝（rpc/transport ForgeTransport 结构同型镜像） */
export type ForgeInvokeTransport = (channel: string, payload?: unknown) => Promise<unknown>

/** 页内传输读取（window.dshForge.invoke——缺席/非函数 = undefined：非 Electron 载体 fail-soft） */
export function forgeInvokeTransport(): ForgeInvokeTransport | undefined {
  const bridge = (globalThis as { dshForge?: { invoke?: ForgeInvokeTransport } }).dshForge
  const invoke = bridge?.invoke
  return typeof invoke === 'function' ? (channel, payload) => invoke(channel, payload) : undefined
}

/** RPC 信封拆装（rpc/client.invokeRpc 结构同型镜像：RpcOk → data；!ok/形状非法 = throw——调用面 catch 消费 fail-soft） */
export async function unwrapRpcEnvelope<T>(call: Promise<unknown>): Promise<T> {
  const raw = await call
  if (raw === null || typeof raw !== 'object' || !('ok' in raw)) {
    throw new Error('dsh-forge web-client: RPC 信封形状非法（期望 contracts RpcResult 信封）')
  }
  const result = raw as { ok: boolean; data?: T }
  if (!result.ok) throw new Error('dsh-forge web-client: RPC 信封 !ok')
  return result.data as T
}

/** 项目锚行窄形状（contracts ProjectSummary 消费切片：id + 必填 workspaceId——fix-33 ⑨） */
export interface BugProjectRow {
  readonly id: string
  readonly workspaceId: string
}

/** projects.list 行集正规化（形状漂移行剔除——非对象/缺键不记） */
export function bugProjectsFromRows(rows: unknown): BugProjectRow[] {
  if (!Array.isArray(rows)) return []
  const out: BugProjectRow[] = []
  for (const row of rows) {
    const record = asRecord(row)
    const id = record?.['id']
    const workspaceId = record?.['workspaceId']
    if (typeof id === 'string' && id !== '' && typeof workspaceId === 'string' && workspaceId !== '') {
      out.push({ id, workspaceId })
    }
  }
  return out
}

/**
 * 会话 → 项目锚（workbench/panel-model.projectAnchorOf 裁决同型镜像——panel-model 为壳树
 * 共享模块禁跨 chunk import，故本文件逐字镜像裁决）：会话锚在场 → 会话归属 workspace
 * （sessionIds 成员）→ 该 workspace 名下项目；未匹配 → 唯一项目兜底（单人工作台 P1 常见
 * 无歧义相位）；多项目无锚 = undefined（不猜首个）。workspaces 快照缺席/异常 = 无锚同径。
 */
export function bugProjectIdOf(
  sessionId: string,
  workspacesSnapshot: unknown,
  projects: readonly BugProjectRow[],
): string | undefined {
  const items = asRecord(workspacesSnapshot)?.['items']
  if (sessionId !== '' && Array.isArray(items)) {
    for (const item of items) {
      const ws = asRecord(item)
      const workspaceId = ws?.['workspaceId']
      const sessionIds = ws?.['sessionIds']
      if (typeof workspaceId !== 'string' || !Array.isArray(sessionIds)) continue
      if (!sessionIds.includes(sessionId)) continue
      const match = projects.find((project) => project.workspaceId === workspaceId)
      if (match !== undefined) return match.id
    }
  }
  if (projects.length === 1) return projects[0]!.id
  return undefined
}

/** Bug source 接线依赖（注入面——测试替身/生产缺省两径） */
export interface BugSourceWiringDeps {
  readonly workspaces: ForgeWorkspacesService
  /** 页内 RPC 传输（缺省 forgeInvokeTransport()） */
  readonly invoke?: ForgeInvokeTransport
  /** 候选行图标件（发布面 ForgeBugGlyph——IconProps 组件；缺席 = 行零 icon 键） */
  readonly bugIcon?: unknown
  /** 官方右栏服务（1.3 openReference 路由——openResource 开 Bug 台账 pane；缺席 = 引用点击返回 false 不拦截官方手势） */
  readonly sidebarRight?: ForgeSidebarRightService
}

/** Bug source + warm 面（官方 InputTriggerSource warm 槽——scope 出生预热，fire-and-forget） */
export interface BugSourceWithWarm extends BugReferenceSource {
  readonly warm: (session: { readonly sessionId: string }) => void
}

/**
 * Bug source + openReference 面（1.3——官方 chip 点击路由缝）：`openReference(session,
 * {ref})` 只认本 source 的 bug ref（`bug:<bugId>`），非 bug 引用 = false（官方手势不被
 * 拦截）；命中 = 会话锚解析项目 → `sidebarRight.openResource(bugAddress, {kind})` 开
 * Bug 台账 pane（地址 = 去重键，同地址 reveal 既有 tab）→ true；官方面异常（无在场面
 * 抛错等）= false fail-soft 不外溢。
 */
export interface BugSourceWithOpenReference extends BugSourceWithWarm {
  openReference(session: { readonly sessionId: string }, ref: { readonly ref: string }): boolean
}

/**
 * Bug source 接线装配（T1 createBugReferenceSource 的运行时依赖注入面）：
 *  - projectId = 会话↔项目绑定事实（workspaces 快照成员归属 + projects.list 缓存，
 *    bugProjectIdOf 裁决）；projects 缓存经 refreshProjects 填充（登记期 + warm 期）。
 *  - listBugs = forge:bugs/list 传输递达（信封拆装镜像；传输缺席 = reject——T1 factory
 *    catch 消费为空候选 fail-soft）。
 *  - 图标件 = deps.bugIcon 投影（候选行 icon 键；缺席逐字透传不添键）。
 *  - warm = scope 出生预热：projects.list 先落缓存，随后一次 bugs.list 预取（锚定项目
 *    口径——T1 lastFetched 快照底随取随新；全程 fire-and-forget 静默）。
 */
export function buildBugReferenceSource(deps: BugSourceWiringDeps): BugSourceWithOpenReference {
  const invoke = deps.invoke ?? forgeInvokeTransport()
  let projects: readonly BugProjectRow[] = []

  const workspaceSnapshot = (): unknown => {
    try {
      const list = deps.workspaces.list as { getSnapshot?: () => unknown } | undefined
      return typeof list?.getSnapshot === 'function' ? list.getSnapshot() : undefined
    } catch {
      return undefined
    }
  }
  const projectIdOf = (sessionId?: string): string | undefined =>
    bugProjectIdOf(sessionId ?? '', workspaceSnapshot(), projects)
  const refreshProjects = (): Promise<void> => {
    if (invoke === undefined) return Promise.resolve()
    return unwrapRpcEnvelope<unknown>(invoke(PROJECTS_LIST_CHANNEL))
      .then((rows) => {
        projects = bugProjectsFromRows(rows)
      })
      .catch(() => undefined)
  }

  const source = createBugReferenceSource({
    name: FORGE_BUG_SOURCE_NAME,
    projectId: projectIdOf,
    // 跨项目有界回退（刷新后 warm 种子未落/跨项目 chip）：注册项目缓存全集——
    // refreshProjects（登记期 + warm 期）填充，serialize 锚定落空时逐项目现查
    projectIds: () => projects.map((row) => row.id),
    listBugs: (query) => {
      if (invoke === undefined) {
        return Promise.reject(new Error('dsh-forge web-client: dshForge.invoke 缺席（Bug 组 fail-soft 零候选）'))
      }
      return unwrapRpcEnvelope(invoke(BUGS_LIST_CHANNEL, query))
    },
  })

  /** 1.3 chip 点击 → Bug 台账 pane（官方 openReference 路由缝——见 BugSourceWithOpenReference） */
  const openReference = (session: { readonly sessionId: string }, ref: { readonly ref: string }): boolean => {
    const bugId = bugIdOfRef(ref?.ref ?? '')
    if (bugId === undefined || deps.sidebarRight === undefined) return false
    try {
      // 项目锚缺席 = '' 地址段（pane 现查失败呈现缺省态——不阻断点击路由）
      deps.sidebarRight.openResource(bugAddressOf(projectIdOf(session?.sessionId ?? '') ?? '', bugId), { kind: BUG_TAB_KIND })
      return true
    } catch {
      return false
    }
  }

  return {
    ...source,
    order: FORGE_BUG_SOURCE_ORDER,
    candidates: async (session, req) => {
      const rows = await source.candidates(session, req)
      return deps.bugIcon === undefined ? rows : rows.map((row) => ({ ...row, icon: deps.bugIcon }))
    },
    warm: (session) => {
      void refreshProjects()
        .then(() => {
          const projectId = projectIdOf(session.sessionId)
          if (projectId === undefined || invoke === undefined) return undefined
          // bug 476b2d3d：预取不再丢弃——全量台账种进快照（持久化还原 chip 无插入事件，
          // serialize 依赖此种子命中全卡）；行集直信传输与 deps.listBugs 同口径
          return unwrapRpcEnvelope<readonly BugCardSource[]>(invoke(BUGS_LIST_CHANNEL, { projectId }))
            .then((rows) => {
              source.seedSnapshots(Array.isArray(rows) ? rows : [])
            })
            .catch(() => undefined)
        })
        .catch(() => undefined)
    },
    openReference,
  }
}

/**
 * Bug 引用 source 登记行（apply 编排）：官方 `ctx.inputTriggers.registerSource` 挂 T1
 * Bug source——服务取法 = reflectServiceGet 惰性 fail-soft 先例（5.2 e2e 勘误配方同径）：
 * 缺席/异常 = 不注册、不报错、不影响其余登记行；duplicate throw（官方守卫）= 吞掉不炸。
 * 撤销面 = ctx.effect 级联（官方 ui-reference 同径；effect 面缺席 = 跳过——登记本身仍成立）。
 */
export function registerBugReferenceSource(
  ctx: ForgeClientCtx,
  views: PublishedViews,
  workspaces: ForgeWorkspacesService,
  sidebarRight: ForgeSidebarRightService,
  diagnostics: { registered?: string[] },
): BugSourceWithOpenReference | undefined {
  const inputTriggers = asRecord(reflectServiceGet(ctx, 'inputTriggers'))
  const registerSource = inputTriggers?.['registerSource']
  if (typeof registerSource !== 'function') return undefined
  const source = buildBugReferenceSource({ workspaces, sidebarRight, bugIcon: views.ForgeBugGlyph })
  try {
    const dispose = (registerSource as (src: unknown) => unknown).call(inputTriggers, source)
    diagnostics.registered = [...(diagnostics.registered ?? []), `input-triggers:${FORGE_BUG_SOURCE_NAME}`]
    const effect = (ctx as { effect?: (cb: () => (() => void) | undefined, label?: string) => unknown }).effect
    effect?.call(
      ctx,
      () => (typeof dispose === 'function' ? (dispose as () => void) : undefined),
      'dswf-bug: input trigger source',
    )
    // 登记期预热：projects 缓存先行（首个 @ hit 在 controller warm 前也大概率有锚——
    // 锚定会话场景仍以 scope 出生 warm 为准）
    source.warm({ sessionId: '' })
  } catch {
    // 注册被拒（duplicate 等）——fail-soft 不炸 apply；source 仍返回（快照缓存面无害：
    // 未注册的 source 无 chip 产出，cacheBugSnapshot 不可能被路由到 serialize）
  }
  return source
}

/** 目录条目形状（组件面 WorkerProviderEntry 结构同型——bundle 自持纪律禁跨 chunk import） */
interface ModelCatalogEntry {
  readonly provider: string
  readonly models: readonly string[]
  /** 模型 → 支持的推理档位 id 集（models[].reasoning.efforts[].id——档位兼容过滤能力面） */
  readonly modelEfforts?: Readonly<Record<string, readonly string[]>>
}

/** unknown → 对象窄化（缺席/非对象 = undefined） */
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined

/** 惰性服务读取（reflect.get——未 inject 服务的官方面；缺席/异常 = undefined fail-soft；
 * 5.2 e2e 勘误配方同 buildOpenSessionOrchestrator）。strict = 官方缺省（仅活性 fiber 可见）；
 * false = 非严格读（提供方 fiber apply 期 state=1 亦可见——register 的值已同步构造完整） */
function reflectServiceGet(ctx: ForgeClientCtx, name: string, strict = true): unknown {
  try {
    const reflect = (ctx as { reflect?: { get(n: string, strict?: boolean): unknown } }).reflect
    return reflect?.get(name, strict)
  } catch {
    return undefined
  }
}

/**
 * RemoteResult 信封解包（m3.1 D25）：`{ok:true, value:{groups:[{id, models:[{id}]}]}}`
 * → `[{provider, models}]`（provider = 路由 id，官方模型选择器同源口径）；他形（!ok /
 * 缺 groups）= undefined——组件面静态目录回退。
 * m3.1 逻辑修复：models[].reasoning.efforts[].id 透传为 modelEfforts（档位兼容过滤
 * 能力面——信封未携带该模型能力 = 不记该键，组件面不过滤不判）。
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
    const models: string[] = []
    const modelEfforts: Record<string, readonly string[]> = {}
    let hasEfforts = false
    if (Array.isArray(record?.['models'])) {
      for (const model of record['models']) {
        const modelRecord = asRecord(model)
        const id = modelRecord?.['id']
        if (typeof id !== 'string' || id === '') continue
        models.push(id)
        const effortsRecord = asRecord(modelRecord?.['reasoning'])
        if (Array.isArray(effortsRecord?.['efforts'])) {
          const efforts = effortsRecord['efforts'].flatMap((effort) => {
            const effortId = asRecord(effort)?.['id']
            return typeof effortId === 'string' && effortId !== '' ? [effortId] : []
          })
          if (efforts.length > 0) {
            modelEfforts[id] = efforts
            hasEfforts = true
          }
        }
      }
    }
    entries.push(hasEfforts ? { provider, models, modelEfforts } : { provider, models })
  }
  return entries
}

/**
 * 模型目录装载器（m3.1 D25 = blitz 1.2 结果性承接）：惰性 ctx.reflect.get('remote.session')
 * （'remote' 嵌套双径）→ modelCatalog() 解信封 → [{provider, models}]。服务缺席 / 调用
 * 拒绝 / 信封失败 = resolve(undefined)——组件面静默回退静态目录，不炸设置分区装载。
 */function buildModelCatalogLoader(
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
 * 手机远程状态面（fix-3 重启生效形态——用户裁决 2026-10-14）：开关改写产品自有配置
 * （forge-settings.json remoteApproval.enabled，经 preload RPC forge:settings/* 单门——
 * 官方 remote.settings 无 webserver 可写命名空间[dsh-settings volatileForm 整行排除]且
 * 上游明文拒绝运行期 rebind[dsh-web-app startup.js:40]）。快照相位 = 配置意图 × 实际
 * 绑定 host（boot manifest.remoteHost——宿主装配期读同一配置的结果面，经 ready 消息透传）
 * 双源纯派生（views/remote/remote-status.ts remoteSnapshotOf 结构同型镜像，bundle 自持
 * 禁跨 chunk import 纪律）：配置↔实况不一致 = pending（「待重启生效」提示态——不伪装
 * listening）。dshForge 桥缺席（非 Electron 载体）/调用失败/信封畸形 = fail-soft off
 * 快照（不虚报不炸装配）；setEnabled = forge:settings/set 分节覆写（只携 remoteApproval
 * 节——core 读-改-写保留 worker 段）+ 即时 refresh。
 */
export interface ForgeRemoteStatusFace {
  /** 快照源（ForgeRemoteEntry useSyncExternalStore 直连契约） */
  readonly source: {
    getSnapshot(): RemoteStatusSnapshot
    subscribe(listener: () => void): () => void
  }
  /** 重新读产品配置 + boot manifest（成功/失败均收敛为合法快照并通知订阅者） */
  refresh(): Promise<void>
  /** 开关回写（forge:settings/set remoteApproval 分节；成功 → refresh 后 true；缺席/失败 = false fail-soft） */
  setEnabled(next: boolean): Promise<boolean>
  /** fix-10：断开连接（forge:remote/disconnect 撤该设备会话 + 即时 refresh；缺席/失败 = false） */
  disconnectDevice(): Promise<boolean>
  /** fix-17 ②：tab 切换重连（dsh-forge:remote/tunnel-toggle 触发隧道建立/读数刷新 + refresh；桥缺席/失败 = false） */
  tunnelEnsure(): Promise<boolean>
  /** fix-18 ②：显式换线（dsh-forge:remote/tunnel-fallback 触发 TunnelManager.fallback + refresh；桥缺席/失败 = false） */
  tunnelFallback(): Promise<boolean>
  /** fix-18 ③：PIN 重置（dsh-forge:remote/pin-reset 触发 pinIssuer.rotate + refresh——新 PIN 随 manifest 回流；桥缺席/失败 = false） */
  pinReset(): Promise<boolean>
  /** fix-26：长效密码开关（dsh-forge:remote/pin-consent 触发 pinIssuer.setDurable + refresh——durable 面随 manifest 回流；桥缺席/失败 = false） */
  pinConsent(consent: boolean): Promise<boolean>
}

/** dshForge preload 桥窄面（结构同型镜像——bundle 自持禁跨 chunk import） */
interface ForgePreloadBridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>
  getBootManifest(): Promise<{
    url?: string
    remoteHost?: string
    remotePairUrl?: string
    remotePairExpiresAt?: number
    remoteDeviceConnected?: boolean
    tunnelUrl?: string
    tunnelProvider?: string
    tunnelExpiresAt?: number
    tunnelUnexpectedlyClosed?: boolean
    remotePin?: string
    remotePinExpiresAt?: number
    remotePinDurable?: boolean
  }>
}

/** dshForge 桥读取（缺席/形状不符 = undefined——fail-soft off 面，不炸装配） */
function preloadBridgeOf(): ForgePreloadBridge | undefined {
  const bridge = (globalThis as { dshForge?: unknown }).dshForge
  if (typeof bridge !== 'object' || bridge === null) return undefined
  const record = bridge as Record<string, unknown>
  if (typeof record['invoke'] !== 'function' || typeof record['getBootManifest'] !== 'function') {
    return undefined
  }
  return bridge as ForgePreloadBridge
}

/** RPC 信封 → 载荷（{ok:true,data} 窄判——他形 = undefined fail-soft） */
function rpcDataOf(envelope: unknown): unknown {
  if (typeof envelope !== 'object' || envelope === null) return undefined
  const record = envelope as Record<string, unknown>
  return record['ok'] === true ? record['data'] : undefined
}

/** 配置载荷 → remoteApproval.enabled 读数（键缺席/畸形 = undefined——未配置 ≠ 关？缺席
 *  按关判：宿主装配期 remoteApprovalEnabledOf 同口径严格 === true 才开） */
function remoteApprovalEnabledOf(settings: unknown): boolean | undefined {
  if (typeof settings !== 'object' || settings === null) return false
  const section = (settings as Record<string, unknown>)['remoteApproval']
  if (section === undefined) return false
  if (typeof section !== 'object' || section === null) return undefined
  const enabled = (section as Record<string, unknown>)['enabled']
  return typeof enabled === 'boolean' ? enabled : undefined
}

/** forge:settings/* 通道字面量（contracts SETTINGS_CHANNELS 同源镜像——bundle 零外部 import） */
const SETTINGS_CHANNEL_GET = 'forge:settings/get'
const SETTINGS_CHANNEL_SET = 'forge:settings/set'

/** fix-10 断开连接通道字面量（contracts REMOTE_CHANNELS.disconnect 同源镜像——bundle 零外部 import） */
const REMOTE_CHANNEL_DISCONNECT = 'forge:remote/disconnect'

/** fix-17 ② tab 重连通道字面量（host ipc/tunnel-channel.ts TUNNEL_TOGGLE_CHANNEL 同源镜像——dshForge 域外直转面） */
const TUNNEL_TOGGLE_CHANNEL = 'dsh-forge:remote/tunnel-toggle'

/** fix-18 换线通道字面量（host ipc/tunnel-channel.ts TUNNEL_FALLBACK_CHANNEL 同源镜像——dshForge 域外直转面） */
const TUNNEL_FALLBACK_CHANNEL = 'dsh-forge:remote/tunnel-fallback'

/** fix-18 PIN 重置通道字面量（host ipc/tunnel-channel.ts PIN_RESET_CHANNEL 同源镜像——dshForge 域外直转面） */
const PIN_RESET_CHANNEL = 'dsh-forge:remote/pin-reset'
/** fix-26 长效密码开关通道字面量（host ipc/tunnel-channel.ts PIN_CONSENT_CHANNEL 同源镜像——dshForge 域外直转面） */
const PIN_CONSENT_CHANNEL = 'dsh-forge:remote/pin-consent'

/** 信封 ok 判（set 返回 data 为空——ok 布尔本身即结果面） */
function isOkEnvelope(envelope: unknown): boolean {
  return typeof envelope === 'object' && envelope !== null &&
    (envelope as Record<string, unknown>)['ok'] === true
}

/**
 * 配置意图 + boot manifest 实况 → 快照（views/remote/remote-status.ts remoteSnapshotOf
 * 结构同型镜像——bundle 自持禁跨 chunk import 纪律；语义与判据见彼处注释）。
 */
function snapshotOfReads(
  enabled: boolean | undefined,
  manifest: {
    url?: string
    remoteHost?: string
    remotePairUrl?: string
    remotePairExpiresAt?: number
    remoteDeviceConnected?: boolean
    tunnelUrl?: string
    tunnelProvider?: string
    tunnelExpiresAt?: number
    tunnelUnexpectedlyClosed?: boolean
    remotePin?: string
    remotePinExpiresAt?: number
  } | undefined,
): RemoteStatusSnapshot {
  if (enabled === undefined) return { phase: 'off' }
  const exposureActive = manifest?.remoteHost === '0.0.0.0'
  const devicesConnected = manifest?.remoteDeviceConnected === true
  // fix-10（bug e7234823）：隧道面收拢镜像（remoteSnapshotOf 同口径——url 非空串 × 链路类型
  // 合法齐备才携带；缺席/畸形 = 字段不出现，互联网 tab 空态收敛不再恒 starting）
  const tunnelUrl = manifest?.tunnelUrl
  const tunnelProviderRaw = manifest?.tunnelProvider
  const tunnelProvider: TunnelProvider | undefined =
    tunnelProviderRaw === 'cloudflared' || tunnelProviderRaw === 'pinggy' ? tunnelProviderRaw : undefined
  const tunnel =
    typeof tunnelUrl === 'string' && tunnelUrl !== '' && tunnelProvider !== undefined
      ? {
          url: tunnelUrl,
          provider: tunnelProvider,
          ...(typeof manifest?.tunnelExpiresAt === 'number' &&
          Number.isFinite(manifest.tunnelExpiresAt) &&
          manifest.tunnelExpiresAt > 0
            ? { expiresAt: manifest.tunnelExpiresAt }
            : {}),
          // fix-19 ⑦：意外死亡位透传（remoteSnapshotOf 镜像口径——UI 一次性守卫自动重开单源）
          ...(manifest?.tunnelUnexpectedlyClosed === true ? { unexpectedlyClosed: true as const } : {}),
        }
      : undefined
  if (enabled !== exposureActive) return { phase: 'pending', ...(tunnel !== undefined ? { tunnel } : {}) }
  if (!enabled) return { phase: 'off' }
  // fix-7：/pair 握手成功读数抬 connected（等待扫码 → 手机已连接——remoteSnapshotOf 镜像口径）
  if (devicesConnected) return { phase: 'connected', ...(tunnel !== undefined ? { tunnel } : {}) }
  // fix-5 地址缝（remoteSnapshotOf 镜像口径）：真宿主载体自定 scheme（location.hostname
  // 非可达地址）——lanAddress 只认 manifest.remotePairUrl（宿主 /pair?token= 官方配对地址
  // 单源），缺席 = undefined（面板回退提示），不再由页面 location 自造拼接。
  const pairUrl = manifest?.remotePairUrl
  const lanAddress = typeof pairUrl === 'string' && pairUrl !== '' ? pairUrl : undefined
  // fix-6 倒计时缝（镜像口径）：token TTL 读数透传（桌面 QR 倒计时单源）。
  const expiresAt = manifest?.remotePairExpiresAt
  const pairExpiresAt =
    typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : undefined
  // fix-17 ③ PIN 缝（镜像口径）：6 位数字 × 正有限 TTL 齐备才携带（remote-status 同判）。
  const pin =
    typeof manifest?.remotePin === 'string' && /^\d{6}$/.test(manifest.remotePin) ? manifest.remotePin : undefined
  const pinExpiresAtRaw = manifest?.remotePinExpiresAt
  const pinExpiresAt =
    typeof pinExpiresAtRaw === 'number' && Number.isFinite(pinExpiresAtRaw) && pinExpiresAtRaw > 0
      ? pinExpiresAtRaw
      : undefined
  return {
    phase: 'listening',
    lanAddress,
    ...(pairExpiresAt !== undefined ? { pairExpiresAt } : {}),
    ...(tunnel !== undefined ? { tunnel } : {}),
    ...(pin !== undefined && pinExpiresAt !== undefined ? { pin, pinExpiresAt } : {}),
  }
}

/** 手机远程状态注入面构造（测试与 registerRemoteEntry 同源；快照读数细节见类型注释） */
export function buildRemoteStatusSource(_clientCtx: ForgeClientCtx): ForgeRemoteStatusFace {
  const listeners = new Set<() => void>()
  let snapshot: RemoteStatusSnapshot = { phase: 'off' }
  const publish = (): void => {
    for (const listener of listeners) listener()
  }
  const face: ForgeRemoteStatusFace = {
    source: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    refresh: () => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined) {
        snapshot = { phase: 'off' }
        publish()
        return Promise.resolve()
      }
      const readConfig = Promise.resolve()
        .then(() => bridge.invoke(SETTINGS_CHANNEL_GET))
        .then(
          (envelope) => remoteApprovalEnabledOf(rpcDataOf(envelope)),
          () => undefined,
        )
      const readManifest = Promise.resolve()
        .then(() => bridge.getBootManifest())
        .then(
          (manifest) => (typeof manifest === 'object' && manifest !== null ? manifest : undefined),
          () => undefined,
        )
      return Promise.all([readConfig, readManifest])
        .then(([enabled, manifest]) => {
          // 镜像口径（remoteSnapshotOf——views/remote/remote-status.ts，禁跨 chunk import）：
          snapshot = snapshotOfReads(enabled, manifest)
        })
        .then(publish, publish)
    },
    setEnabled: (next) => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined) return Promise.resolve(false)
      return Promise.resolve()
        .then(() => bridge.invoke(SETTINGS_CHANNEL_SET, { remoteApproval: { enabled: next } }))
        .then(
          isOkEnvelope,
          () => false,
        )
        .then((ok) => face.refresh().then(() => ok))
    },
    disconnectDevice: () => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined) return Promise.resolve(false)
      return Promise.resolve()
        .then(() => bridge.invoke(REMOTE_CHANNEL_DISCONNECT, null))
        .then(
          isOkEnvelope,
          () => false,
        )
        .then((ok) => face.refresh().then(() => ok))
    },
    // fix-17 ②：tab 切换重连（tunnel-toggle 直转——结果经 manifest 轮询单源回流；失败 = false fail-soft）
    tunnelEnsure: () => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined) return Promise.resolve(false)
      return Promise.resolve()
        .then(() => bridge.invoke(TUNNEL_TOGGLE_CHANNEL))
        .then(
          () => true,
          () => false,
        )
        .then((ok) => face.refresh().then(() => ok))
    },
    // fix-18 ②：显式换线（tunnel-fallback 直转——新链路经 tunnel 推送 + manifest 轮询单源回流）
    tunnelFallback: () => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined) return Promise.resolve(false)
      return Promise.resolve()
        .then(() => bridge.invoke(TUNNEL_FALLBACK_CHANNEL))
        .then(
          () => true,
          () => false,
        )
        .then((ok) => face.refresh().then(() => ok))
    },
    // fix-18 ③：PIN 重置（pin-reset 直转——新 PIN 经 pair 推送 + manifest 轮询单源回流）
    pinReset: () => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined) return Promise.resolve(false)
      return Promise.resolve()
        .then(() => bridge.invoke(PIN_RESET_CHANNEL))
        .then(
          () => true,
          () => false,
        )
        .then((ok) => face.refresh().then(() => ok))
    },
    // fix-26：长效密码开关（pin-consent 直转——durable 面经 pair 推送 + manifest 轮询单源回流）
    pinConsent: (consent: boolean) => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined) return Promise.resolve(false)
      return Promise.resolve()
        .then(() => bridge.invoke(PIN_CONSENT_CHANNEL, consent))
        .then(
          () => true,
          () => false,
        )
        .then((ok) => face.refresh().then(() => ok))
    },
  }
  return face
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

/** Bug 快速路径输入（1.4——Bug 子 tab 行「添加到会话中」；summary = chip label 主键） */
export interface BugQuickAddInput {
  readonly bugId: string
  readonly summary: string
}

/** Bug 快速路径动作面（概览 dock tab 注入面——Bug 子 tab 行按钮消费） */
export type BugQuickAddFn = (bug: BugQuickAddInput, workspaceId: string | null) => Promise<void>

/**
 * Bug 引用插入服务切片组装（scoped 事件发射三件套——sessions.binding / conversation.input.for /
 * actx.bail；1.4 快速路径与 bug 4b34e5d8 chip 重建缝共用：conversation 服务调用期惰性解析，
 * bail 面缺席 = undefined 返回 → 判未应用走各自兜底）。
 */
function bugReferenceServicesOf(clientCtx: ForgeClientCtx, sessions: ForgeSessionsService): ReferenceInsertServices {
  return {
    sessions: {
      binding: (sessionId) =>
        (sessions as unknown as { binding?: (sessionId: string) => unknown }).binding?.(sessionId) as
          | OpenSessionBinding
          | undefined,
    },
    conversation: {
      input: {
        for: (actx: unknown): ComposerInputFace => {
          const resolved = (
            asRecord(reflectServiceGet(clientCtx, 'conversation'))?.['input'] as
              | { for?: (actx: unknown) => unknown }
              | undefined
          )?.['for']?.(actx)
          if (resolved === undefined || resolved === null) {
            throw new Error('conversation.input.for 缺席（会话输入缝未就绪）')
          }
          return resolved as ComposerInputFace
        },
      },
    } satisfies OpenSessionConversation,
    // scoped 事件发射（cordis bail——actx 作主语；官方 input-trigger execute 同径；
    // bail 面缺席 = undefined 返回 → 判未应用走兜底）
    bail: (actx, name, payload) =>
      (actx as { bail?: (subject: unknown, name: string, payload: unknown) => unknown }).bail?.(
        actx,
        name,
        payload,
      ),
  }
}

/**
 * Bug 快速路径组装（composer-bug-reference 1.4）：有活跃会话（账本快照 current 锚）→
 * 官方 scoped 事件 `slash/input-insert-reference`（span-CAS 基于 InputState.draftRev +
 * 草稿末尾——insertReferenceAtTail 单源）插入 T1 同构原子引用并还焦 composer；插入未获
 * 应用（缝缺席/相位守卫拒——韧性兜底同 open-session 兜底裁决刻度）或无活跃会话 → 既有
 * open-session 编排器开新会话，首条草稿预填该引用剪贴板投影（@[摘要](bug:<bugId>)——
 * 预填走 setDraft 既有缝，chip 形态由 @ 菜单/粘贴官方链承接）。conversation 服务调用期
 * 惰性解析（buildOpenSessionOrchestrator 同配方）；workspaceId 缺席 = 无锚不编排（点击
 * fail-soft 不外溢）。
 */
export function buildBugQuickAdder(
  clientCtx: ForgeClientCtx,
  sessions: ForgeSessionsService,
  orchestrator: OpenSessionOrchestrator,
  /** 插入时快照落缓存（bug 27ab222b——dock 递达的 BugCard 全字段经此喂给 source；缺席 = 不落） */
  noteInserted?: (bug: BugQuickAddInput) => void,
): BugQuickAddFn {
  const services = bugReferenceServicesOf(clientCtx, sessions)
  return async (bug, workspaceId) => {
    // 外部插入径快照（bug 27ab222b）：dock 递达的是完整 BugCard（BugQuickAddInput 的
    // 结构超集——运行期全字段原样透传），不经 onPick 也能让 serialize 命中全卡
    noteInserted?.(bug)
    // chip 构造单一事实源（T1 bugReferenceInsertOf——@ 菜单 pick 产物同构）
    const reference: ReferenceInsertMirror = bugReferenceInsertOf(bug, FORGE_BUG_SOURCE_NAME)
    const active = activeSessionIdOf(sessions.list)
    if (active !== undefined && insertReferenceAtTail(services, active, reference)) return
    if (workspaceId === null) return
    await orchestrator.openSessionWithPreset({ workspaceId, prefill: reference.clipboardText })
  }
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
  /** Bug 引用 source 快照落缓存面（bug 27ab222b——按钮插入径喂全卡；缺席 = 不落） */
  noteBugInserted?: (bug: BugQuickAddInput) => void,
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
  // composer-bug-reference 1.3：Bug 台账资源型（multiple + 地址去重——dswf-doc 同构；
  // 地址 = `dsh-resource://dswf-bug/<projectId>/<bugId>`，openReference 路由开出）
  const disposeBugType = sidebarRightTabs.register({
    id: BUG_TAB_KIND,
    kind: BUG_TAB_KIND,
    multiple: true,
    patterns: [`${BUG_ADDRESS_PREFIX}**`],
    canOpen: (address: string): boolean => address.startsWith(BUG_ADDRESS_PREFIX),
    title: (address: string): string => {
      const bugId = bugIdOfAddress(address)
      return bugId === undefined ? t('tab.bug') : `Bug ${bugId}`
    },
  })
  diagnostics.registered = [...(diagnostics.registered ?? []), OVERVIEW_TAB_KIND, DOC_TAB_KIND, BUG_TAB_KIND]
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
          // S5 列表行 ⟞（task-ui-info-density-blitz）：worker 执行子会话打开径——显式父
          // （库侧 link 派发源）地址形态同径单源（openSessionWithLedgerAddress——ShellHost
          // ⟞ 面同径；账本缺行 refresh 兜底后重判读，官方面异常 fail-soft）
          onOpenWorkerSession: (childSessionId: string, parentSessionId?: string): void => {
            openSessionWithLedgerAddress({ sessions, uiWorkspace }, childSessionId, parentSessionId)
          },
          // 4.6 打开新会话编排器（openSessionWithPreset + 跳转姊妹出口——概览三子 tab
          // 行头预填/诊断发送/派发指令/派发跳转四渠道共源；1.4 Bug 快速路径复用同一编排器）
          openSession: buildOpenSessionOrchestrator(ctx, uiWorkspace, sessions),
          // 1.4 Bug 快速路径（Bug 子 tab 行「添加到会话中」——有活跃会话 scoped 插入/
          // 无活跃会话开新会话预填；openSession 编排器同源复用）
          addBugToSession: buildBugQuickAdder(
            ctx,
            sessions,
            buildOpenSessionOrchestrator(ctx, uiWorkspace, sessions),
            noteBugInserted,
          ),
        }),
      },
      views.ForgeOverviewTab,
    ),
  )
  registerSlotEntry(ctx, SIDEBAR_RIGHT_PANE_TAB_SLOT, diagnostics, () =>
    ctx.slots.register({ name: SIDEBAR_RIGHT_PANE_TAB_SLOT, key: DOC_TAB_KIND }, views.ForgeDocsTab),
  )
  registerSlotEntry(ctx, SIDEBAR_RIGHT_PANE_TAB_SLOT, diagnostics, () =>
    // Bug 台账 body 自足（useTabInfo 由 seat 声明递达——dswf-doc body 同径；1.3）
    ctx.slots.register({ name: SIDEBAR_RIGHT_PANE_TAB_SLOT, key: BUG_TAB_KIND }, views.ForgeBugPreview),
  )
  return () => {
    disposeBugType()
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
      // 构建指纹（2d5434d1 裁决）：控制台一行即可判「页面跑的是哪版」——缺席 = 陈旧页面
      console.info(`[dswf-client] build ${FORGE_CLIENT_BUILD_TAG}`)
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
            'tab.bug': 'Bug 台账',
            'guide.overview.desc': 'feature · 任务 · 提案与文档——管线接管工作台',
            'settings.forge': 'Forge设置',
            'remote.entry': '手机远程',
            // dispatchTask 对话工具行（toolview 行内 t 座——文案对齐官方通用行用词）
            'tool.dispatchTask.title': '工具调用',
            'tool.dispatchTask.preparing': '正在准备调用',
            'tool.dispatchTask.running': '运行中',
            'tool.dispatchTask.failed': '失败',
            'tool.dispatchTask.input': '输入',
            'tool.dispatchTask.output': '输出',
            'tool.dispatchTask.inspect': '查看',
          },
          en: {
            'panel.knowledge': 'Knowledge',
            'view.recall': 'Recall',
            'tab.overview': 'Overview',
            'tab.bug': 'Bug ledger',
            'guide.overview.desc': 'Features, tasks, proposals and docs',
            'settings.forge': 'Forge Settings',
            'remote.entry': 'Mobile Remote',
            'tool.dispatchTask.title': 'Tool call',
            'tool.dispatchTask.preparing': 'Preparing call',
            'tool.dispatchTask.running': 'Running',
            'tool.dispatchTask.failed': 'Failed',
            'tool.dispatchTask.input': 'Input',
            'tool.dispatchTask.output': 'Output',
            'tool.dispatchTask.inspect': 'Inspect',
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
          ;(globalThis as { __DSH_FORGE_BUG_CHIP_RESTORE__?: unknown }).__DSH_FORGE_BUG_CHIP_RESTORE__ = undefined
          disposeLocale()
        }

        // Bug 引用 source（composer-bug-reference 1.2）：官方 inputTriggers 挂 @ Bug 组——
        // 惰性 fail-soft（服务/传输缺席 = 零登记零报错，其余登记行不受累）。先于 dock 注册
        // （bug 27ab222b：source 快照面穿线给按钮快速路径——插入即落全卡）
        const bugSource = registerBugReferenceSource(clientCtx, views, workspaces, sidebarRight, viewsDiagnostics)

        // bug 4b34e5d8 chip 重建缝发布（页面全局缝——overlay 槽零视觉行消费；会话作用域
        // 挂载即接「纯文本草稿 → chip」订阅，撤销随桥/词典 revoke 对称摘除）
        ;(globalThis as { __DSH_FORGE_BUG_CHIP_RESTORE__?: unknown }).__DSH_FORGE_BUG_CHIP_RESTORE__ = (
          sessionId: string,
        ): (() => void) | void => watchBugChipRestore(bugReferenceServicesOf(clientCtx, sessions), sessionId)

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
          bugSource !== undefined ? (bug) => bugSource.cacheBugSnapshot(bug) : undefined,
        )
        // 1.9 DOM 增强器挂接：apply 期启动（@dsh-forge/md-mermaid ./web enhancer 经壳
        // bundle 发布面递达——凡 .md-code-block 全 DOM 扫描增强，门控 + parse 确认 +
        // 失败安全降级）；stop 归 overlay 洞 dispose 与 apply catch 两径（与 dock tab
        // 类型撤销面同刻度——插件 fiber 卸载级联回收）。
        const mermaidEnhancer = views.createMermaidEnhancer()
        mermaidEnhancer.start()
        const revokeBase = revokeBridgeAndLocale
        revokeBridgeAndLocale = (): void => {
          revokeBase()
          disposeDockTabs()
          mermaidEnhancer.stop()
        }

        // 三族登记（fix-36 按 sidebar/center/views 拆注册子函数——apply 仅编排）+ 设置分区
        // （4.7 settings 族）+ 常驻壳宿主。m3.1 D5：会话头挂接 pill 登记退役
        // （conversation.session.header.actions 零产品登记——官方动作带不受扰）。
        registerSidebarSlots(clientCtx, views, { sessions, workspaces, uiWorkspace }, sidebarDiagnostics)
        registerRemoteEntry(clientCtx, views, t, sidebarDiagnostics)
        registerCenterPanels(clientCtx, views, bridge, t, centerDiagnostics)
        registerConversationViews(clientCtx, views, bridge, t, viewsDiagnostics, uiWorkspace, sessions, workspaces)
        registerWorktreeFaces(clientCtx, views, viewsDiagnostics)
        registerSettingsSection(clientCtx, views, t, settingsDiagnostics)
        // Bug 引用 source 登记已前移至 dock 注册之前（bug 27ab222b 穿线——见上方 bugSource）

        // 常驻壳宿主（shell.overlay——UF-3 流程宿主 + 相位/视图镜像锚 + hero 面板驱动 +
        // 知识模式右栏联动面 + 概览项目上下文锚定写回[4.1 经桥] + 任务详情弹窗宿主
        // [m3.1 D21/D23——drawerTaskId 受控挂载，挂载独立于 dock] + 派发任务悬浮面板
        // [m3.1 D6——行点击开弹窗经桥，⟞ 开 worker 子会话经 openWorkerSession]；
        // selectPanel/rightbar/bridge/onOpenSession/openSession/openDocResource 官方窄面经 inject 递达）。
        // 卸载期顺带撤销桥发布、locale 词典、dock tab 类型注册与 mermaid DOM 增强器观察
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
                // 会话名解析器（task-ui-info-density-blitz S1 通道——账本快照 displayTitle
                // 窄读；账本未命中 = undefined，调用方回退显示 sessionId fail-soft）
                sessionTitleOf: makeSessionTitleResolver(sessions),
                // ⟞ worker 父反查兜底（fix：进行中任务无 record 审计行 → workerSessionOf
                // 恒空）：账本子行 parentId 扫描 + refresh 一次兜底（resolveWorkerChildSession
                // 单源）——DispatchPanel 库侧解析 miss 时经 ShellHost 递达消费。
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
            disposeDockTabs()
            mermaidEnhancer.stop()
          }
        })
      } catch (error) {
        // fix-33 ⑥：apply 中途抛错——桥/词典/tab 类型已发布即补撤销（死闭包不残留：桥
        // 持有官方 layout 闭包，插件已废而桥面仍活会路由进废 ctx；词典残留阻塞同 ns
        // 重复登记；tab 类型残留占官方注册表 kind）
        revokeBridgeAndLocale?.()
        const message = error instanceof Error ? error.message : String(error)
        // 诊断增强（2026-10-16）：apply 中断曾静默吞错——Forge 设置/dock/词典齐失而
        // console 无声，只能靠症状考古。回滚语义不变，补一行 loud 报错。
        console.error('[dswf-client] apply 中断（已回滚桥/词典/tab 类型）：', error)
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
