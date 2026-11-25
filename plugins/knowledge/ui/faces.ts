// knowledge 族面注册面（注册归插件域单写源——project 包无本域注册行）。三面：① main keyed 'dswf-knowledge'（知识视图面板——inject 携 workbench
// 桥）；② sidebar.panellist 行 'dswf-knowledge'（官方 PanelRow 行——label 经本插件 NS 词典
// thunk）；③ conversation.view 'dswf-recall'（知识召回页签——ui-trajectory 同型先例）。
// 1.5 增第四面：④ 项目台 keyed 'project.section.knowledge-dir'「知识库目录」只读节
// （registerKnowledgeDirSection——gate 复用 + safeRegister 降级只降本节）。
//
// 门控语义（fix-3 修订——bug ad88e0f5）：knowledgeGateOf 官方形态 bundle 在场即挂载——
//   官方形态：client bundle 在场 = 挂载态本体（官方装载协议 apply 期无条件注册，inject =
//       ['slots','locale']；上游 fixture-live-client 正本核销；plugin remove 即移除 bundle，
//       卸载态无需门控感知）——壳缝缺席 → 无条件 true；
//   G-A dsh-forge 集成态：壳 bootShell 发布 __DSH_FORGE_HOST_PLUGINS__.knowledge——true
//       → true（恒 true 路径不变）；false → false（集成态显式关闭——fail-closed 路径一：
//       壳掌舵让位 + 零登记零异常）。
//   G-B 壳 boot 缝失效态：boot 缝整体缺席而壳发布面 __DSH_FORGE_VIEWS__ 在场（集成态
//       形态判别）→ false——fail-closed 路径二：集成态不宽判半挂载（零登记零异常）。
//   G-B reflect 现查分支已删除（fix-3 裁决）：官方宿主 client isolate 里 Node 侧服务经桥
//       到达、不经 cordis reflect——ctx.reflect.get('knowledge') 结构性恒 false（run3 真机
//       事实），缝选错非迟到问题；fix-2 迟到补偿订阅（internal/service 事件）随之裁撤——
//       该事件在官方宿主永不携带 Node 服务，订阅即死代码。
// 集成态显式 false = 整组知识面零登记零异常；单面注册异常 = fail-soft 降级不阻宿主
// （CT-M1 修订：官方形态无「服务缺席」分支，fail-soft 只保留 slots/locale 劣形降级）。
//
// 桥消费（fix-25 知识抽屉缝随迁）：知识面板 inject 面消费 workbench 桥（壳 apply 期经
// createWorkbenchBridge 创建并发布页内全局 __DSH_FORGE_WORKBENCH__）——inject 期现读页内缝
// （缺席 = undefined 递达，面板联动面 fail-soft；桥本体 = 壳 C 类域不随迁；类型切片 =
// shared/workbench-bridge.ts 下沉件）。bundle 自含纪律：keyed-section / locale / 小件均本包
// 自含副本或镜像（mirrors-pin 对账）。
import { registerKeyedSection, KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT, type SectionSlotsFace } from './keyed-section.js'
import { FORGE_KNOWLEDGE_LOCALE_DICTS, FORGE_KNOWLEDGE_LOCALE_NS, type LocaleServiceFace } from './locale.js'
import { ForgeKnowledgeGlyph } from './KnowledgeGlyph.js'
import { ForgeKnowledgePanel } from './KnowledgePanel.js'
import { ForgeRecallView } from './RecallTab.js'
import { KnowledgeDirSection, KNOWLEDGE_DIR_SECTION_KEY, KNOWLEDGE_DIR_SECTION_LABEL } from './knowledge-dir-section.js'
import type { WorkbenchBridgeMirror } from '../shared/workbench-bridge.js'
import { currentDefaultRpcClientFactory, installDefaultRpcClientFactory, resolveRpcClientFactory, type RpcClientFactory } from './rpc-channels.js'

/** 缺省工厂（页内缺省缝——apply 期装配分流安装；模块级常量保引用稳定） */
const defaultClientFactory: RpcClientFactory = () => currentDefaultRpcClientFactory()()

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

/** 宿主插件位门页内缝（壳 bootShell 发布；官方宿主整体缺席） */
interface HostPluginsSeam {
  readonly knowledge?: boolean
}

/** 门控读入的全局面（boot 缝 + 壳发布面两页内缝——纯读不缓存） */
export interface KnowledgeGateGlobal {
  readonly __DSH_FORGE_HOST_PLUGINS__?: HostPluginsSeam
  readonly __DSH_FORGE_VIEWS__?: unknown
}

/**
 * 门控纯函数：壳缝在场以壳缝为终裁——knowledge:false（集成态显式关闭）→ false（唯一
 * fail-closed 分支）；knowledge:true/缺省 → true（恒 true 路径不变）。壳缝整体缺席时按
 * 形态判别：集成态（壳发布面 __DSH_FORGE_VIEWS__ 在场而 boot 缝缺席 = 壳 boot 缝失效）
 * → fail-closed false（集成态不宽判半挂载）；官方宿主（无壳页内缝族）→ true——client
 * bundle 在场即挂载态本体，apply 期无条件注册。纯读页内缝、无缓存、无 ctx 依赖。
 */
export function knowledgeGateOf(
  globalObject: KnowledgeGateGlobal = globalThis as never,
): boolean {
  const seam = globalObject.__DSH_FORGE_HOST_PLUGINS__
  if (seam !== undefined) return seam.knowledge !== false
  return globalObject.__DSH_FORGE_VIEWS__ === undefined
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
 * knowledge 族三面注册（apply 编排）：门控 fail-closed 在前（集成态显式 false = 零登记
 * 零异常）；逐面 try/catch fail-soft。桥经页内缝 inject 期现读（壳在场时联动面可用；官方
 * 宿主无壳 = 桥缺席，面板本体不依赖桥渲染）。
 */
export function registerKnowledgeFaces(
  slots: SectionSlotsFace,
  locale: LocaleServiceFace,
  globalObject: KnowledgeGateGlobal = globalThis as never,
  makeClient: RpcClientFactory = defaultClientFactory,
): KnowledgeFacesDiagnostics {
  const registered: string[] = []
  const knowledgeEnabled = knowledgeGateOf(globalObject)
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

  // ① 知识视图面板（main keyed——inject 携桥 + 运输面 factory：抽屉缝联动面缺席 fail-soft；
  // makeClient = fix-9 装配期分流选定面——connection 在场走官方 connection.rpc，缺席回落
  // preload，消费面签名不动）
  face(KNOWLEDGE_PANEL_KEY, () => {
    if (registerKeyedSection(slots, {
      slot: MAIN_SLOT,
      key: KNOWLEDGE_PANEL_KEY,
      inject: () => ({ bridge: workbenchBridgeOf(), makeClient }),
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

  // ③ 知识召回页签（conversation.view list 行——ui-trajectory 同型先例；inject 携运输面 factory）
  face(RECALL_VIEW_ID, () => {
    if (registerKeyedSection(slots, {
      slot: CONVERSATION_VIEW_SLOT,
      id: RECALL_VIEW_ID,
      order: RECALL_VIEW_ORDER,
      locale: FORGE_KNOWLEDGE_LOCALE_NS,
      label: (): string => t('view.recall'),
      inject: () => ({ makeClient }),
      component: ForgeRecallView,
    }) === undefined) throw new Error('slots face unavailable')
  })

  return { registered, knowledgeEnabled }
}

/**
 * 项目台「知识库目录」只读节注册（knowledge-plugin-migration 1.5 提案项 4——单向零写面）：
 * 官方缝 = project.section.knowledge-dir（槽名/行协议自 plugins/project/ui keyed-section.ts
 * 正本读源核销后落座——只插孔纪律；bundle 自含副本逐字 pin = mirrors-pin）。门控复用
 * knowledgeGateOf（fix-3 官方形态 bundle 在场即挂载——集成态显式 false 与壳 boot 缝失效
 * 形态判别为两条 fail-closed 关断分支）；
 * 降级 = registerKeyedSection 内 safeRegisterSection 单行守卫——异常只降本节，不阻宿主不阻
 * 其余三面；缺席路径（gate false / slots 劣形 / 同 cell 占用）diag 留痕不静默（AGENTS §7）。
 */
export function registerKnowledgeDirSection(
  slots: SectionSlotsFace,
  globalObject: KnowledgeGateGlobal = globalThis as never,
  makeClient: RpcClientFactory = defaultClientFactory,
): { registered: boolean; knowledgeEnabled: boolean } {
  const knowledgeEnabled = knowledgeGateOf(globalObject)
  if (!knowledgeEnabled) {
    console.info('[dsh-forge/knowledge] knowledge-dir section gate=false——零登记（缺席路径 diag 可观测）')
    return { registered: false, knowledgeEnabled }
  }
  const dispose = registerKeyedSection(slots, {
    slot: KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT,
    key: KNOWLEDGE_DIR_SECTION_KEY,
    label: KNOWLEDGE_DIR_SECTION_LABEL,
    // fix-9：inject 携运输面 factory——projects.list 经装配期分流选定面送达（消费面签名不动）
    inject: () => ({ makeClient }),
    component: KnowledgeDirSection,
  })
  if (dispose === undefined) {
    console.warn('[dsh-forge/knowledge] knowledge-dir section not mounted——slots face unavailable / register 降级（fail-soft 只降本节）')
    return { registered: false, knowledgeEnabled }
  }
  return { registered: true, knowledgeEnabled }
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

/** faces 注册本体（gate=true 路径：词典登记 + 三面 + 项目台知识目录节） */
function applyKnowledgeFaces(ctx: unknown): void {
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
    // fix-9 装配期运输面分流（一次求值——ctx.connection.rpc 在场走 connection 面，
    // 缺席回落 preload 面）：选定 factory ① 安装页内缺省缝（anchored-projects 镜像
    // pin 逐字面签名不动——useForgeProjects 缺省参经缝换面）；② inject 递达各数据
    // 消费面（面板/召回/目录节——bridge 注入同型先例，消费面签名不动）。
    const makeClient = resolveRpcClientFactory(ctx)
    installDefaultRpcClientFactory(makeClient)
    try {
      const kn = registerKnowledgeFaces(slots, locale, undefined, makeClient)
      console.info(`[dsh-forge/knowledge] knowledge faces registered=[${kn.registered.join(', ')}] enabled=${kn.knowledgeEnabled}`)
    } catch (error) {
      console.warn('[dsh-forge/knowledge] knowledge faces registration interrupted', error)
    }
    // ④ 项目台知识目录只读节（1.5 提案项 4——project.section.knowledge-dir 官方缝；
    // 注册异常 = fail-soft 降级只降本节，缺席 diag 留痕不静默）
    try {
      const kd = registerKnowledgeDirSection(slots, undefined, makeClient)
      console.info(`[dsh-forge/knowledge] knowledge-dir section registered=${kd.registered} enabled=${kd.knowledgeEnabled}`)
    } catch (error) {
      console.warn('[dsh-forge/knowledge] knowledge-dir section registration interrupted', error)
    }
}

/**
 * knowledge client face 组合插件对象（client-modules 装载契约——expert-squad 同型判例）：
 * apply 期自注册三面（官方装载协议形态）。返回值铁律：必须返回 undefined（cordis 组合把返回值
 * 当 effect 消费）。inject = ['slots', 'locale']（cordis 装载契：声明边等待官方服务就绪，
 * 缺声明 = apply 期 `cannot get property` fiber FAILED）。门控（fix-3）：官方形态 bundle
 * 在场即挂载——壳缝缺席 = 无条件注册；集成态壳缝显式 false = 零登记零异常（唯一
 * fail-closed 分支，无迟到补偿——fix-2 internal/service 订阅随 G-B reflect 分支一并裁撤）。
 */
export const knowledgeClient = {
  // fix-9 增 'connection' 声明边（官方 dsh-client-connection client 插件 ctx.provide
  // ('connection')——上游正本核销；dsh-forge 官方 client 内核同源两宿主恒在场，裁决记
  // rpc-channels.ts 双运输面段）。声明边等待服务就绪（cordis 装载契），apply 期仍做
  // 面形状现查分流——缺席宿主回落 preload 面（劣形 fail-soft 不炸 apply）。
  inject: ['slots', 'locale', 'connection'] as string[],
  apply(ctx: unknown): void {
    // 门控 fail-closed 在前（集成态壳缝 false → 零登记零异常，diag info 留痕；
    // 官方形态壳缝缺席 → 无条件注册——bundle 在场即挂载态本体）
    if (!knowledgeGateOf()) {
      console.info('[dsh-forge/knowledge] gate=false（集成态壳缝 knowledge:false）——faces 零登记（壳掌舵让位同源 fail-closed）')
      return
    }
    applyKnowledgeFaces(ctx)
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
