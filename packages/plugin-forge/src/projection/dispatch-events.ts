// loop-event-delivery 1.6——悬浮进度流投影键 `forge-dispatch-events` 的 fold unit
// （src/projection/dispatch-loop.ts 同构六字段：key/stateVersion/stateSchema/init/apply/wire）。
// 折叠 'forge/progress' 会话事件（写入即落日志——运行期 registry 逐事件驱动 fold，
// 面板实时刷新；checkpoint 冷读链 = stateSchema 种子重放还原）。零新增记录（fold 只读）。
//
// 边界纪律（dispatch-loop 同款）：本模块对 @deepseek-ai/dsh-session-projection 仅类型面
// 消费（declare-module 合并 + import type 编译擦除）；registry 只鸭子消费 plain object。
// 载荷守卫复用 progress/index.ts 的 isForgeProgressData（单一事实源——新可选字段追加时
// 守卫与 fold 同步演化，零散落第二份形状表）。装配方 = 插件 apply 期
// reflect.get('sessionProjections') 防御读取（commands/jobs/agents 同款第五先例）。
//
// 折叠语义：
//   - 仅 'forge/progress' 事件入折叠；他类型同引用返回（registry Object.is 零下游工作）；
//   - 载荷经 isForgeProgressData 守卫——他形/畸形载荷同引用原样（不猜不弃行）；
//   - state 规模上界：entries 只保留最近 N=200 条 + total 全量计数（更早历史本次不回看，
//     proposal 边界 6——日志恒为权威）；
//   - view = { entries 窗口, total 总数 }（client 可见整值，plain JSON）。
import { FORGE_PROGRESS_EVENT_TYPE, isForgeProgressData } from '../progress/index.js'
import type { ForgeProgressEventData } from '../progress/index.js'
import type { SessionProjectionMap } from '@deepseek-ai/dsh-session-projection/types'

/** 投影键（SessionProjectionMap 合并键 = GUI 账本行 projectionValues 窄读键，字面量同源） */
export const FORGE_DISPATCH_EVENTS_PROJECTION_KEY = 'forge-dispatch-events'

/** 折叠语义版本（持久化投影缓存失配判据——首版 1） */
export const FORGE_DISPATCH_EVENTS_STATE_VERSION = 1

/** state/view 窗口上界（proposal 边界 6：最近 N=200 条） */
export const FORGE_DISPATCH_EVENTS_WINDOW_SIZE = 200

/** 窗口内单条进度事件条目（载荷切片——plain JSON 透传，字段语义见 ForgeProgressEventData） */
export type ForgeDispatchEventEntry = ForgeProgressEventData

/** wire 值（client 可见整值——plain JSON，SessionProjectionValue = JsonValue 面内） */
export interface ForgeDispatchEventsProjection {
  /** 最近事件窗口（时序追加序——尾部最新，规模上界 N=200） */
  readonly entries: readonly ForgeDispatchEventEntry[]
  /** 本会话进度事件总数（窗口外历史仍计数——面板「窗口 + 总数」承载） */
  readonly total: number
  /** 池级待执行计数（1.16 用户裁决②——最近一枚携 counts 事件的 pending 快照；缺席 = 旧缓存/旧载荷，消费面不呈现该项） */
  readonly pending?: number
}

/** host 折叠态（SessionProjectionStateMap 合并键——plain JSON，持久化缓存前置条件） */
export interface ForgeDispatchEventsUnitState {
  /** 最近事件窗口（时序追加序，规模上界 = FORGE_DISPATCH_EVENTS_WINDOW_SIZE） */
  readonly entries: readonly ForgeDispatchEventEntry[]
  /** 事件总数（全量计数，窗口裁剪不减） */
  readonly total: number
  /** 池级待执行计数（最近一枚携 counts 事件的 pending 快照；缺席 = 尚无 counts 事件） */
  readonly pending?: number
}

/** zod ZodType 消费切片（registry 唯一调用位 = parse——结构同型镜像，零上游运行时 import） */
export interface ForgeProjectionSchema<T> {
  parse(value: unknown): T
}

/** 会话事件窄形状（官方 SessionEvent 消费切片——fold 只读 type/data） */
export interface ForgeProjectionEvent {
  readonly type: string
  readonly data?: unknown
}

/** 投影定义（官方 ProjectionDefinition 结构同型镜像——registry 鸭子消费的 plain object） */
export interface ForgeDispatchEventsProjectionDefinition {
  readonly key: typeof FORGE_DISPATCH_EVENTS_PROJECTION_KEY
  readonly stateVersion: typeof FORGE_DISPATCH_EVENTS_STATE_VERSION
  readonly stateSchema: ForgeProjectionSchema<ForgeDispatchEventsUnitState>
  init(header: unknown, inheritedEventCount: number): ForgeDispatchEventsUnitState
  apply(state: ForgeDispatchEventsUnitState, event: ForgeProjectionEvent): ForgeDispatchEventsUnitState
  readonly wire: {
    readonly viewSchema: ForgeProjectionSchema<ForgeDispatchEventsProjection>
    view(state: ForgeDispatchEventsUnitState): ForgeDispatchEventsProjection
  }
}

/** 结构校验失败即抛（registry parse 契约——抛错 = 弃值回退重折） */
function fail(message: string): never {
  throw new Error(`forge-dispatch-events projection: ${message}`)
}

/** 载荷/条目守卫（isForgeProgressData 单源——失败即抛为 registry parse 契约适配） */
function assertProgressData(value: unknown): ForgeProgressEventData {
  if (!isForgeProgressData(value)) fail('entry must be a valid forge/progress payload')
  return value
}

/** 条目数组校验（state/view 双面共用——逐条 isForgeProgressData 守卫） */
function parseEntries(value: unknown): ForgeDispatchEventEntry[] {
  if (!Array.isArray(value)) fail('entries must be an array')
  return value.map((entry) => assertProgressData(entry))
}

/** 可选 pending 校验（非负整数；缺席 = undefined——旧缓存/旧载荷向后兼容） */
function parsePending(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) fail('pending must be a non-negative integer')
  return value
}

/** 键集校验（entries+total 必需、pending 可选——1.16 前旧缓存 {entries,total} 原样可读） */
function parseStateShape(raw: Record<string, unknown>): { entries: ForgeDispatchEventEntry[]; total: number; pending?: number } {
  const known = Object.keys(raw).filter((key) => key !== 'pending').sort()
  if (known.join(',') !== 'entries,total') fail(`unexpected state keys ${known.join(',')}`)
  return { entries: parseEntries(raw['entries']), total: parseTotal(raw['total']), pending: parsePending(raw['pending']) }
}

/** total 校验（非负整数） */
function parseTotal(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) fail('total must be a non-negative integer')
  return value
}

/** state 纯 JSON 严格校验（restore 种子面——外来形状拒绝回退重折） */
const stateSchema: ForgeProjectionSchema<ForgeDispatchEventsUnitState> = {
  parse(value: unknown): ForgeDispatchEventsUnitState {
    if (typeof value !== 'object' || value === null) fail('state must be an object')
    const shape = parseStateShape(value as Record<string, unknown>)
    if (shape.entries.length > FORGE_DISPATCH_EVENTS_WINDOW_SIZE) fail('entries exceed window size')
    return shape
  },
}

/** wire 整值校验（离场前最后一道——schema-validated output 契约） */
const viewSchema: ForgeProjectionSchema<ForgeDispatchEventsProjection> = {
  parse(value: unknown): ForgeDispatchEventsProjection {
    if (typeof value !== 'object' || value === null) fail('view must be an object')
    return parseStateShape(value as Record<string, unknown>)
  },
}

/**
 * 构造 forge-dispatch-events 投影 unit（装配方唯一入口——registry.register 消费的
 * plain object；dispatch-loop 同构形状）。
 */
export function createForgeDispatchEventsProjection(): ForgeDispatchEventsProjectionDefinition {
  return {
    key: FORGE_DISPATCH_EVENTS_PROJECTION_KEY,
    stateVersion: FORGE_DISPATCH_EVENTS_STATE_VERSION,
    stateSchema,
    init: () => ({ entries: [], total: 0 }),
    apply: (state, event) => {
      if (event.type !== FORGE_PROGRESS_EVENT_TYPE) return state
      const data = event.data
      if (!isForgeProgressData(data)) return state
      const entries = state.entries.length >= FORGE_DISPATCH_EVENTS_WINDOW_SIZE
        ? [...state.entries.slice(state.entries.length - FORGE_DISPATCH_EVENTS_WINDOW_SIZE + 1), data]
        : [...state.entries, data]
      // 池级 pending 快照（1.16——携 counts 事件即刷新；无 counts = 保持先前值）
      const pending = typeof data.counts?.pending === 'number' ? data.counts.pending : state.pending
      return { entries, total: state.total + 1, ...(pending !== undefined ? { pending } : {}) }
    },
    wire: {
      viewSchema,
      view: (state) => ({ entries: state.entries, total: state.total, ...(state.pending !== undefined ? { pending: state.pending } : {}) }),
    },
  }
}

// /plan 同构（dispatch-loop 同款）：键合并进官方可扩展类型表——宿主 registry 泛型约束、
// client 快照/缓存读面与 GUI useProjection 的键字面量即得类型。仅类型面（编译期合并 +
// import type 随编译擦除——运行期零 import，registry 消费本模块产出的 plain object）。
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** 循环进度事件流（loop-event-delivery 1.6——fold 'forge/progress' 派生 {entries, total}）。 */
    'forge-dispatch-events': import('./dispatch-events.js').ForgeDispatchEventsProjection
  }
  interface SessionProjectionStateMap {
    /** host 折叠态（plain JSON——持久化投影缓存前置条件）。 */
    'forge-dispatch-events': import('./dispatch-events.js').ForgeDispatchEventsUnitState
  }
}

/** 表键身份锚（编译期断言：declare-module 合并已把键写进官方可扩展类型表） */
export type ForgeDispatchEventsTableKeyAssertion = Extract<
  keyof SessionProjectionMap,
  typeof FORGE_DISPATCH_EVENTS_PROJECTION_KEY
>
