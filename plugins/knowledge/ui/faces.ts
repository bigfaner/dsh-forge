// knowledge 族三面注册面（knowledge-plugin-migration 1.4 子提交 b——自 project 包
// ui/knowledge-face.ts git mv 随迁本插件，注册归插件域 fix-13 模式；project 注册行同批退役
// ——杜绝双写源）。三面：① main keyed 'dswf-knowledge'（知识视图面板——inject 携 workbench
// 桥）；② sidebar.panellist 行 'dswf-knowledge'（官方 PanelRow 行——label 经本插件 NS 词典
// thunk）；③ conversation.view 'dswf-recall'（知识召回页签——ui-trajectory 同型先例）。
//
// 门控语义（提案门控缝修正）：knowledgeGateOf 双门控取或——
//   G-A dsh-forge 集成态：壳发布 __DSH_FORGE_HOST_PLUGINS__.knowledge（壳 bootShell 于就绪门
//       放行前发布，apply 期同步可读）——壳缝优先读（行为等价）；
//   G-B 官方宿主态：壳缝缺席 → whileServed 现查 ctx.reflect.get('knowledge')（AGENTS §1.6
//       消费点现查禁 memoize——装卸序列下读数即刻翻转；键与 host KNOWLEDGE_SERVICE_NAME
//       = 'knowledge' 源码级一致）。门控失效两故障形态均可红：fail-open（服务缺席面虚挂）、
//       fail-closed（服务在场门恒 false）。
// knowledge 缺席/false = 整组知识面零登记零异常；单面注册异常 = fail-soft 降级不阻宿主。
//
// 桥消费（fix-25 知识抽屉缝随迁）：知识面板 inject 面消费 workbench 桥（壳 apply 期经
// createWorkbenchBridge 创建并发布页内全局 __DSH_FORGE_WORKBENCH__）——inject 期现读页内缝
// （缺席 = undefined 递达，面板联动面 fail-soft；桥本体 = 壳 C 类域不随迁；类型切片 =
// shared/workbench-bridge.ts 下沉件）。bundle 自含纪律：keyed-section / locale / 小件均本包
// 自含副本或镜像（mirrors-pin 对账）。
import { registerKeyedSection, type SectionSlotsFace } from './keyed-section.js'
import { FORGE_KNOWLEDGE_LOCALE_DICTS, FORGE_KNOWLEDGE_LOCALE_NS, type LocaleServiceFace } from './locale.js'
import { ForgeKnowledgeGlyph } from './KnowledgeGlyph.js'
import { ForgeKnowledgePanel } from './KnowledgePanel.js'
import { ForgeRecallView } from './RecallTab.js'
import type { WorkbenchBridgeMirror } from '../shared/workbench-bridge.js'

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

/** 宿主插件位门页内缝（壳 bootShell 发布；缺席 = 走 whileServed 分支） */
interface HostPluginsSeam {
  readonly knowledge?: boolean
}

/** knowledge 服务 whileServed 现查消费切片（ctx.reflect.get('knowledge')） */
interface KnowledgeReflectSeam {
  readonly reflect?: { readonly get?: (key: string) => unknown }
}

/**
 * 双门控纯函数（G-A 壳缝优先读 ∪ G-B whileServed 现查）：壳缝 true = true（集成态行为
 * 等价）；壳缝缺席/false = 服务现查裁决（非 undefined 且对象形状 = 在场）。检测每调用
 * 现查禁 memoize（AGENTS §1.6——装卸序列下读数即刻翻转）；reflect 异常 = fail-closed false。
 */
export function knowledgeGateOf(
  ctx: unknown,
  globalObject: { __DSH_FORGE_HOST_PLUGINS__?: HostPluginsSeam } = globalThis as never,
): boolean {
  if (globalObject.__DSH_FORGE_HOST_PLUGINS__?.knowledge === true) return true
  try {
    const reflect = (ctx as KnowledgeReflectSeam | undefined)?.reflect
    const service = typeof reflect?.get === 'function' ? reflect.get('knowledge') : undefined
    return typeof service === 'object' && service !== null
  } catch {
    return false
  }
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
  ctx: unknown = undefined,
): KnowledgeFacesDiagnostics {
  const registered: string[] = []
  const knowledgeEnabled = knowledgeGateOf(ctx)
  if (!knowledgeEnabled) return { registered, knowledgeEnabled }
  const t = locale.bind(FORGE_KNOWLEDGE_LOCALE_NS)
  const face = (name: string, registerFace: () => void): void => {
    try {
      registerFace()
      registered.push(name)
    } catch (error) {
      console.warn(`[dsh-forge/knowledge] knowledge face '${name}' registration failed——降级不注册`, error)
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
      locale: FORGE_KNOWLEDGE_LOCALE_NS,
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
      locale: FORGE_KNOWLEDGE_LOCALE_NS,
      label: (): string => t('view.recall'),
      component: ForgeRecallView,
    }) === undefined) throw new Error('slots face unavailable')
  })

  return { registered, knowledgeEnabled }
}

/** knowledge 词典登记（门控在场才登记——一次登记面，重复登记抛错 fail-soft 降级） */
function registerKnowledgeLocale(locale: LocaleServiceFace): void {
  if (typeof locale.register !== 'function') return
  try {
    locale.register(FORGE_KNOWLEDGE_LOCALE_NS, FORGE_KNOWLEDGE_LOCALE_DICTS)
  } catch (error) {
    console.warn('[dsh-forge/knowledge] locale dict register failed——label 回退 ns 键名呈现', error)
  }
}

/**
 * knowledge client face 组合插件对象（client-modules 装载契约——expert-squad 同型判例）：
 * apply 期自注册三面（fix-13 模式）。返回值铁律：必须返回 undefined（cordis 组合把返回值
 * 当 effect 消费）。inject = ['slots', 'locale']（cordis 装载契：声明边等待官方服务就绪，
 * 缺声明 = apply 期 `cannot get property` fiber FAILED）。
 */
export const knowledgeClient = {
  inject: ['slots', 'locale'] as string[],
  apply(ctx: unknown): void {
    // 门控 fail-closed 在前（CT-M1.O2：双门控均 false → 零登记零异常；diag info 留痕）
    if (!knowledgeGateOf(ctx)) {
      console.info('[dsh-forge/knowledge] gate=false（壳缝缺席 ∧ knowledge 服务不在场）——faces 零登记')
      return
    }
    const rec = ctx as Record<string, unknown> | undefined
    const slots = rec?.['slots'] as SectionSlotsFace | undefined
    const locale = rec?.['locale'] as LocaleServiceFace | undefined
    if (slots === undefined || typeof slots.inject !== 'function') {
      console.warn('[dsh-forge/knowledge] ctx.slots.inject absent; knowledge faces not mounted')
      return
    }
    if (locale === undefined || typeof locale.bind !== 'function') {
      console.warn('[dsh-forge/knowledge] ctx.locale absent; knowledge faces not mounted')
      return
    }
    registerKnowledgeLocale(locale)
    try {
      const kn = registerKnowledgeFaces(slots, locale, ctx)
      console.info(`[dsh-forge/knowledge] knowledge faces registered=[${kn.registered.join(', ')}] enabled=${kn.knowledgeEnabled}`)
    } catch (error) {
      console.warn('[dsh-forge/knowledge] knowledge faces registration interrupted', error)
    }
    return undefined
  },
}

/**
 * 装载器正门（client-modules 装载契约）：materialize 后的 module.exports 项本身为
 * cordis 插件面——function 或含 apply 方法的对象（expert-squad 同型判例）。
 * default 导出经 unwrapExports（__esModule → default）还原插件对象本体。
 */
export default knowledgeClient
export const apply = knowledgeClient.apply.bind(knowledgeClient)
