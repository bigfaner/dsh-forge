// 对话面工具行 + 事件折叠组注册面（定位：装配——1.41 自 apps/web 壳侧 plugin.ts
// registerConversationViews 的 toolview 行与 registerEventEntriesNode 三段注册迁入本包，
// fix-13 模式：注册归插件域，官方宿主不装载产品壳时仍随插件 bundle 自注册）。
// 三段结构（forge-event-node.ts 头注正本）：① uiConversation.events.register stream 状态机
// （match 缝经 progress-log-tap 旁路录取——回放数据通道，fold 语义零改动）② 同注册表组节点
// 定义 ③ conversation.chat.node keyed body。uiConversation 缺席/定义注册被拒 = 全跳 fail-soft。
// bundle 自含纪律：官方 uiConversation 服务 = 结构同型镜像消费切片（official-seams 同型）。
import { ForgeDispatchToolRow } from './dispatch-tool-row/DispatchToolRow.js'
import { ForgeEventEntries } from './event-node/ForgeEventEntries.js'
import { ForgeWorktreeSwitchMarker } from './worktree-picker/picker.js'
import {
  FORGE_EVENT_NODE_KIND,
  FORGE_EVENT_NODE_SLOT,
  forgeEventGroupDefinition,
  forgeEventStreamDefinition,
  setForgeEventNodeDiag,
} from './event-node/forge-event-node.js'
import { tapForgeProgressEvent } from './event-node/progress-log-tap.js'
import { registerKeyedSection, type SectionSlotsFace } from './keyed-section.js'
import { FORGE_PROJECT_LOCALE_NS } from './locale.js'
import type { OfficialSeamCtx } from './official-seams.js'

/** 官方 ui-tool 原子工具行 keyed 槽名（按 wire 工具名分发——未注册名走官方通用行 fallback） */
export const TOOL_CALL_TOOLVIEW_SLOT = 'tool.call.toolview'
/** dispatchTask 工具行 keyed 键（= plugin-forge wire 工具名——FORGE_TOOL_NAMES 单源字面量镜像） */
export const DISPATCH_TASK_TOOL_KEY = 'dispatchTask'

/** 官方 composer 区 overlay 缝名（InputBar overlayAnchor——input 元素上方官方缝） */
export const CONVERSATION_INPUT_OVERLAY_SLOT = 'conversation.input.overlay'
/** worktree 切换闸虚线标记 overlay 登记 id（bug 267dcac1——纯视觉命中锚，禁输行为归官方 conversation.blocks 缝） */
export const WORKTREE_SWITCH_ENTRY_ID = 'dswf-worktree-switch'

/** 官方 uiConversation 服务窄面（registerEventEntriesNode 消费切片——结构同型镜像） */
interface ForgeUiConversationService {
  readonly events: {
    /** 注册一个节点 Definition；重复 kind 抛错（官方注册表语义——单次注册不触） */
    register(definition: unknown): void
  }
}

/** unknown → 对象窄化（缺席/非对象 = undefined） */
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined

/** reflect 只读反射（缺席/异常 = undefined——fail-soft；official-seams 同配方） */
function reflectGet(ctx: OfficialSeamCtx, name: string, strict = true): unknown {
  try {
    return ctx.reflect?.get(name, strict)
  } catch {
    return undefined
  }
}

/** 注册面诊断（registered = 实际落座面；e2e/排障锚） */
export interface ConversationToolFacesDiagnostics {
  readonly registered: string[]
}

/**
 * 对话面注册（apply 编排）：① dispatchTask 工具行（tool.call.toolview keyed——行数据 =
 * owner props 自足：三相块 + 展开钩子 + inspect 回调，零 inject；locale = 行文案 NS）；
 * ② 事件折叠组三段（stream 状态机[match 旁路 tap] + 组节点定义 + keyed body）。
 * 逐面 try/catch fail-soft（单面异常只降本面，console.warn 留痕不炸装配）。
 */
export function registerConversationToolFaces(
  ctx: OfficialSeamCtx,
  slots: SectionSlotsFace,
): ConversationToolFacesDiagnostics {
  const registered: string[] = []
  const face = (name: string, registerFace: () => void): void => {
    try {
      registerFace()
      registered.push(name)
    } catch (error) {
      console.warn(`[dsh-forge/project] conversation tool face '${name}' registration failed——降级不注册`, error)
    }
  }

  // ① dispatchTask 对话工具行（keyed 最小面：key = wire 工具名；locale = 行文案 NS）
  face(DISPATCH_TASK_TOOL_KEY, () => {
    if (registerKeyedSection(slots, {
      slot: TOOL_CALL_TOOLVIEW_SLOT,
      key: DISPATCH_TASK_TOOL_KEY,
      locale: FORGE_PROJECT_LOCALE_NS,
      component: ForgeDispatchToolRow,
    }) === undefined) throw new Error('slots face unavailable')
  })

  // ② 事件折叠组三段（D2 fail-visible 诊断注入面——client 束豁免面 console.warn）
  face(FORGE_EVENT_NODE_KIND, () => {
    setForgeEventNodeDiag((message) => console.warn(message))
    const uiConversation = asRecord(reflectGet(ctx, 'uiConversation')) as
      | ForgeUiConversationService
      | undefined
    const events = asRecord(uiConversation?.['events'])
    const registerEvents = events?.['register']
    if (typeof registerEvents !== 'function') {
      throw new Error('ctx.uiConversation.events.register absent（capability absence = 无节点）')
    }
    // stream 状态机注册经回放录取薄包装（match 纯观察旁路——fold 语义零改动）
    const streamWithTap = {
      ...forgeEventStreamDefinition,
      match: (event: { readonly type?: unknown; readonly seq?: unknown; readonly data?: unknown }): { id: string; role: 'start' } | null => {
        tapForgeProgressEvent(event)
        return forgeEventStreamDefinition.match(event as never)
      },
    }
    registerEvents.call(events, streamWithTap)
    registerEvents.call(events, forgeEventGroupDefinition)
    if (registerKeyedSection(slots, {
      slot: FORGE_EVENT_NODE_SLOT,
      key: FORGE_EVENT_NODE_KIND,
      locale: FORGE_PROJECT_LOCALE_NS,
      component: ForgeEventEntries,
    }) === undefined) throw new Error('slots face unavailable')
  })

  // ③ worktree 切换闸虚线标记行（1.43 自壳侧迁入——bug 267dcac1：官方 cardWorkspaceTrigger
  // 同配方 dashed 规则 :has 命中宿主卡；禁输行为全归官方 conversation.blocks 缝，本行纯视觉）
  face(WORKTREE_SWITCH_ENTRY_ID, () => {
    if (registerKeyedSection(slots, {
      slot: CONVERSATION_INPUT_OVERLAY_SLOT,
      id: WORKTREE_SWITCH_ENTRY_ID,
      component: ForgeWorktreeSwitchMarker,
    }) === undefined) throw new Error('slots face unavailable')
  })

  return { registered }
}
