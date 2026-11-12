// knowledge 族三面注册面（定位：装配——1.42 自 apps/web 壳侧 plugin.ts
// registerCenterPanels/registerConversationViews 的 knowledge 两登记 + 召回页签迁入本包，
// fix-13 模式：注册归插件域）。三面：① main keyed 'dswf-knowledge'（知识视图面板——
// inject 携 workbench 桥）；② sidebar.panellist 行 'dswf-knowledge'（官方 PanelRow 行——
// label 经 locale NS thunk）；③ conversation.view 'dswf-recall'（知识召回页签——
// ui-trajectory 同型先例）。
//
// 门控语义（bug 2ffb0a82 随迁）：宿主插件位门 __DSH_FORGE_HOST_PLUGINS__（壳 bootShell
// 于就绪门放行前发布，apply 期同步可读；单源 = boot manifest.knowledgePlugin = child 按
// profile 树包在场探测）。knowledge 缺席/false = 整组知识面零登记；页内缝缺席 =
// fail-closed 隐藏（不虚报在场）——官方宿主无此缝时知识面不呈现（knowledge 域数据链
// 另案，本面只随插件位门呈现）。
//
// 桥消费（fix-25 知识抽屉缝随迁）：知识面板 inject 面消费 workbench 桥（壳 apply 期经
// createWorkbenchBridge 创建并发布页内全局 __DSH_FORGE_WORKBENCH__）——本注册面 inject
// 期现读页内缝（缺席 = undefined 递达，面板联动面 fail-soft；桥本体 = 壳 C 类域，
// 不随本面迁移）。bundle 自含纪律：桥 = 结构同型镜像窄面。
import { registerKeyedSection, type SectionSlotsFace } from './keyed-section.js'
import { FORGE_PROJECT_LOCALE_NS, type LocaleServiceFace } from './locale.js'
import { ForgeKnowledgeGlyph } from './knowledge/KnowledgeGlyph.js'
import { ForgeKnowledgePanel } from './knowledge/KnowledgePanel.js'
import { ForgeRecallView } from './knowledge/RecallTab.js'

/** 官方 main 面板 keyed 槽名（ui-layout AppFrame root——官方全局面板径） */
export const MAIN_SLOT = 'main'
/** 产品知识面板 key（= main keyed 登记键 = sidebar.panellist 行 id；壳 panel-model 同源字面量） */
export const KNOWLEDGE_PANEL_KEY = 'dswf-knowledge'
/** 官方 sidebar 全局面板行 roster（官方 PanelRow 行语言——知识入口载体） */
export const SIDEBAR_PANELLIST_SLOT = 'sidebar.panellist'
/** 官方会话视图 roster（页签行 + 视图区 only:id 消费） */
export const CONVERSATION_VIEW_SLOT = 'conversation.view'
/** 产品知识召回页签登记 id（order 20——官方 chat/trajectory 之后） */
export const RECALL_VIEW_ID = 'dswf-recall'
/** 召回页签登记序 */
export const RECALL_VIEW_ORDER = 20
/** panellist 行登记序 */
export const KNOWLEDGE_PANEL_ROW_ORDER = 20

/** 宿主插件位门页内缝（壳 bootShell 发布；缺席 = knowledge fail-closed） */
interface HostPluginsSeam {
  readonly knowledge?: boolean
}

/** workbench 桥窄面（壳 createWorkbenchBridge 产物结构同型镜像——消费切片） */
export interface WorkbenchBridgeMirror {
  subscribe(listener: () => void): () => void
  getSnapshot(): Record<string, unknown>
  setDrawerEntry(entryId: number | null): void
  setOverviewContext(context: { projectId: string | null }): void
  openTaskFocus(payload: { taskId: string; featureSlug: string }): void
  openTaskDrawer(taskId: string): void
  closeTaskDrawer(): void
  openTaskTransition(payload: { taskId: string; featureSlug: string; nonce: number; toStatus?: string }): void
}

/** 页内桥缝读取（inject 期现查不缓存——缺席/劣形 = undefined fail-soft） */
function workbenchBridgeOf(): WorkbenchBridgeMirror | undefined {
  const bridge = (globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__
  if (typeof bridge !== 'object' || bridge === null) return undefined
  const record = bridge as Record<string, unknown>
  return typeof record['subscribe'] === 'function' && typeof record['getSnapshot'] === 'function'
    ? (bridge as WorkbenchBridgeMirror)
    : undefined
}

/** 宿主插件位门读取（apply 期同步读页内缝——缺席 = false fail-closed） */
export function knowledgeEnabledOf(globalObject: { __DSH_FORGE_HOST_PLUGINS__?: HostPluginsSeam } = globalThis as never): boolean {
  return globalObject.__DSH_FORGE_HOST_PLUGINS__?.knowledge === true
}

/** 注册面诊断（registered = 实际落座面） */
export interface KnowledgeFacesDiagnostics {
  readonly registered: string[]
  /** 门控读数（e2e/排障锚——false 时 registered 恒空） */
  readonly knowledgeEnabled: boolean
}

/**
 * knowledge 族三面注册（apply 编排）：门控 fail-closed 在前（false = 零登记零异常）；
 * 逐面 try/catch fail-soft。桥经页内缝 inject 期现读（壳在场时联动面可用；官方宿主
 * 无壳 = 桥缺席，面板本体不依赖桥渲染）。
 */
export function registerKnowledgeFaces(
  slots: SectionSlotsFace,
  locale: LocaleServiceFace,
): KnowledgeFacesDiagnostics {
  const registered: string[] = []
  const knowledgeEnabled = knowledgeEnabledOf()
  if (!knowledgeEnabled) return { registered, knowledgeEnabled }
  const t = locale.bind(FORGE_PROJECT_LOCALE_NS)
  const face = (name: string, registerFace: () => void): void => {
    try {
      registerFace()
      registered.push(name)
    } catch (error) {
      console.warn(`[dsh-forge/project] knowledge face '${name}' registration failed——降级不注册`, error)
    }
  }

  // ① 知识视图面板（main keyed——inject 携桥：抽屉缝联动面，缺席 fail-soft）
  face(KNOWLEDGE_PANEL_KEY, () => {
    if (registerKeyedSection(slots, {
      slot: MAIN_SLOT,
      key: KNOWLEDGE_PANEL_KEY,
      inject: () => ({ bridge: workbenchBridgeOf() }),
      component: ForgeKnowledgePanel,
    }) === undefined) throw new Error('slots face unavailable')
  })

  // ② 左栏知识入口行（官方 PanelRow 行语言——label locale thunk）
  face(`panellist:${KNOWLEDGE_PANEL_KEY}`, () => {
    if (registerKeyedSection(slots, {
      slot: SIDEBAR_PANELLIST_SLOT,
      id: KNOWLEDGE_PANEL_KEY,
      order: KNOWLEDGE_PANEL_ROW_ORDER,
      locale: FORGE_PROJECT_LOCALE_NS,
      label: (): string => t('panel.knowledge'),
      component: ForgeKnowledgeGlyph,
    }) === undefined) throw new Error('slots face unavailable')
  })

  // ③ 知识召回页签（conversation.view list 行——ui-trajectory 同型先例）
  face(RECALL_VIEW_ID, () => {
    if (registerKeyedSection(slots, {
      slot: CONVERSATION_VIEW_SLOT,
      id: RECALL_VIEW_ID,
      order: RECALL_VIEW_ORDER,
      locale: FORGE_PROJECT_LOCALE_NS,
      label: (): string => t('view.recall'),
      component: ForgeRecallView,
    }) === undefined) throw new Error('slots face unavailable')
  })

  return { registered, knowledgeEnabled }
}
