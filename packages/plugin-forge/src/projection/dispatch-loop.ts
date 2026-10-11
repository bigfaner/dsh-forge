// S7 dispatcher 会话徽标（run-tasks-host-command 1.8——proposal S7 + SC8）：会话投影键
// `forge-dispatch-loop` 的 fold unit（/plan 同构——dsh-plan-mode lib/types/types.d.ts 的
// declare-module 合并 + ProjectionDefinition 纯折叠面）。折叠既有 command/run +
// command/done 会话日志事件派生 {sourceSlug, status}——零新增记录（fold 只读，零 append）。
//
// 边界纪律（boundaries 白名单单点收口）：本模块对 @deepseek-ai/dsh-session-projection
// 仅类型面消费（declare-module 合并目标 + 定义形状 authority + 增广解析锚 import type
// ——编译擦除，运行期零 import）；devDependency 精确 pin。registry 只鸭子消费 plain
// object 的 stateSchema.parse/init/apply/wire；schema 面 = 结构同型镜像
// ForgeProjectionSchema，parse 同名同语义。装配方 = 插件 apply 期
// reflect.get('sessionProjections') 防御读取（commands/jobs/agents 同款第五先例：
// 注册表缺席 = 键不注册 fail-soft 不阻载，capability absence = key absence 上游既定语义）。
//
// 折叠语义（零新增记录的推导边界，诚实记账）：
//   - command/run{run-dag-tasks} → starting（args trim 后空/缺席 = sourceSlug null——
//     无参问询路径的日志不可知，零猜测）；
//   - 配对 command/done success → running（循环已启动）；error → failed（启动失败，
//     sourceSlug 保留——失败事实可辨）；
//   - command/run{stop-dag-tasks} 仅于活循环族（starting/running）被接受 → stopping；
//     配对 done success → stopped / error → running 回写（循环仍在）；
//   - 循环自然收口（settled）无指令事件可折叠——status 恒驻 running 直至 stop 或新启动，
//     为日志真值（零新增记录约束下的固有不精确，UI 以「循环会话」语义消费）；
//   - 他会话的 stop/run 不进本会话日志（指令事件随会话落）——折叠即会话本地真值，
//     零归属泄露（stop-dag-tasks 跨会话隔离 decisions #20 同源）。
import { RUN_DAG_TASKS_NAME, STOP_DAG_TASKS_NAME } from '../commands/index.js'
import type { SessionProjectionMap } from '@deepseek-ai/dsh-session-projection/types'

/** 投影键（SessionProjectionMap 合并键 = GUI 账本行 projectionValues 窄读键，字面量同源） */
export const FORGE_DISPATCH_LOOP_PROJECTION_KEY = 'forge-dispatch-loop'

/** 折叠语义版本（持久化投影缓存失配判据——首版 1） */
export const FORGE_DISPATCH_LOOP_STATE_VERSION = 1

/** 循环状态（指令生命周期派生词汇——GUI 徽标消费面） */
export type ForgeDispatchLoopStatus = 'idle' | 'starting' | 'running' | 'failed' | 'stopping' | 'stopped'

/** wire 值（client 可见整值——plain JSON，SessionProjectionValue = JsonValue 面内） */
export interface ForgeDispatchLoopProjection {
  /** 任务源标识（无参问询路径 = null——日志不可知） */
  readonly sourceSlug: string | null
  /** 循环状态（idle = 本会话从未派发） */
  readonly status: ForgeDispatchLoopStatus
}

/** host 折叠态（SessionProjectionStateMap 合并键——plain JSON，持久化缓存前置条件） */
export interface ForgeDispatchLoopUnitState {
  /** 在途启动（commandId 配对键 + 启动参） */
  readonly running: { readonly commandId: string; readonly sourceSlug: string | null } | null
  /** 在途停止（commandId 配对键） */
  readonly stopping: { readonly commandId: string } | null
  /** 最近一次启动的任务源（failed 保留——事实可辨） */
  readonly sourceSlug: string | null
  /** 循环状态 */
  readonly status: ForgeDispatchLoopStatus
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

/** 投影定义（官方 ProjectionDefinition 结构同型镜像——registry 鸭子消费的 plain object；
 *  init 签名 = 官方 (header, inheritedEventCount) 原形——本 unit 空态与元数据无关，双参弃读） */
export interface ForgeDispatchLoopProjectionDefinition {
  readonly key: typeof FORGE_DISPATCH_LOOP_PROJECTION_KEY
  readonly stateVersion: typeof FORGE_DISPATCH_LOOP_STATE_VERSION
  readonly stateSchema: ForgeProjectionSchema<ForgeDispatchLoopUnitState>
  init(header: unknown, inheritedEventCount: number): ForgeDispatchLoopUnitState
  apply(state: ForgeDispatchLoopUnitState, event: ForgeProjectionEvent): ForgeDispatchLoopUnitState
  readonly wire: {
    readonly viewSchema: ForgeProjectionSchema<ForgeDispatchLoopProjection>
    view(state: ForgeDispatchLoopUnitState): ForgeDispatchLoopProjection
  }
}

/** 状态词表（schema 判别面单源） */
const STATUSES: ReadonlySet<string> = new Set(['idle', 'starting', 'running', 'failed', 'stopping', 'stopped'])

/** 活循环族（stop-dag-tasks 的接受判据——idle/stopped/failed 的 stop = no-op 同引用） */
const LOOP_ACTIVE_STATUSES: ReadonlySet<ForgeDispatchLoopStatus> = new Set(['starting', 'running'])

/** 结构校验失败即抛（registry parse 契约——抛错 = 弃行/弃值回退重折） */
function fail(message: string): never {
  throw new Error(`forge-dispatch-loop projection: ${message}`)
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label} must be a string`)
  return value
}

function assertNullableString(value: unknown, label: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') fail(`${label} must be a string or null`)
  return value
}

/** state 纯 JSON 严格校验（restore 种子面——外来形状拒绝回退重折） */
const stateSchema: ForgeProjectionSchema<ForgeDispatchLoopUnitState> = {
  parse(value: unknown): ForgeDispatchLoopUnitState {
    if (typeof value !== 'object' || value === null) fail('state must be an object')
    const raw = value as Record<string, unknown>
    const keys = Object.keys(raw).sort()
    if (keys.join(',') !== 'running,sourceSlug,status,stopping') fail(`unexpected state keys ${keys.join(',')}`)
    const running = raw['running'] as unknown
    let runningPair: { commandId: string; sourceSlug: string | null } | null = null
    if (running !== null) {
      if (typeof running !== 'object') fail('running must be an object or null')
      const pair = running as Record<string, unknown>
      if (Object.keys(pair).sort().join(',') !== 'commandId,sourceSlug') fail('unexpected running keys')
      runningPair = { commandId: assertString(pair['commandId'], 'running.commandId'), sourceSlug: assertNullableString(pair['sourceSlug'], 'running.sourceSlug') }
    }
    const stopping = raw['stopping'] as unknown
    let stoppingRef: { commandId: string } | null = null
    if (stopping !== null) {
      if (typeof stopping !== 'object') fail('stopping must be an object or null')
      const ref = stopping as Record<string, unknown>
      if (Object.keys(ref).sort().join(',') !== 'commandId') fail('unexpected stopping keys')
      stoppingRef = { commandId: assertString(ref['commandId'], 'stopping.commandId') }
    }
    const status = assertString(raw['status'], 'status')
    if (!STATUSES.has(status)) fail(`unknown status ${status}`)
    return { running: runningPair, stopping: stoppingRef, sourceSlug: assertNullableString(raw['sourceSlug'], 'sourceSlug'), status: status as ForgeDispatchLoopStatus }
  },
}

/** wire 整值校验（离场前最后一道——schema-validated output 契约） */
const viewSchema: ForgeProjectionSchema<ForgeDispatchLoopProjection> = {
  parse(value: unknown): ForgeDispatchLoopProjection {
    if (typeof value !== 'object' || value === null) fail('view must be an object')
    const raw = value as Record<string, unknown>
    if (Object.keys(raw).sort().join(',') !== 'sourceSlug,status') fail('unexpected view keys')
    const status = assertString(raw['status'], 'status')
    if (!STATUSES.has(status)) fail(`unknown status ${status}`)
    return { sourceSlug: assertNullableString(raw['sourceSlug'], 'sourceSlug'), status: status as ForgeDispatchLoopStatus }
  },
}

/** command/run 事件数据窄读（官方 command/run 载荷：commandId + name + args?） */
function commandRunData(event: ForgeProjectionEvent): { commandId: string; name: string; args?: string | undefined } | undefined {
  const data = event.data as Record<string, unknown> | undefined
  if (typeof data !== 'object' || data === null) return undefined
  const commandId = data['commandId']
  const name = data['name']
  if (typeof commandId !== 'string' || typeof name !== 'string') return undefined
  const args = data['args']
  return { commandId, name, ...(typeof args === 'string' ? { args } : {}) }
}

/** command/done 事件数据窄读（官方载荷：commandId + kind success|error） */
function commandDoneData(event: ForgeProjectionEvent): { commandId: string; kind: 'success' | 'error' } | undefined {
  const data = event.data as Record<string, unknown> | undefined
  if (typeof data !== 'object' || data === null) return undefined
  const commandId = data['commandId']
  const kind = data['kind']
  if (typeof commandId !== 'string') return undefined
  if (kind !== 'success' && kind !== 'error') return undefined
  return { commandId, kind }
}

/**
 * 构造 forge-dispatch-loop 投影 unit（装配方唯一入口——registry.register 消费的
 * plain object；/plan planProjectionDefinition 同构形状）。
 */
export function createForgeDispatchLoopProjection(): ForgeDispatchLoopProjectionDefinition {
  return {
    key: FORGE_DISPATCH_LOOP_PROJECTION_KEY,
    stateVersion: FORGE_DISPATCH_LOOP_STATE_VERSION,
    stateSchema,
    init: () => ({ running: null, stopping: null, sourceSlug: null, status: 'idle' }),
    apply: (state, event) => {
      if (event.type === 'command/run') {
        const data = commandRunData(event)
        if (data === undefined) return state
        if (data.name === RUN_DAG_TASKS_NAME) {
          const sourceSlug = data.args !== undefined && data.args.trim() !== '' ? data.args.trim() : null
          return { running: { commandId: data.commandId, sourceSlug }, stopping: null, sourceSlug, status: 'starting' }
        }
        if (data.name === STOP_DAG_TASKS_NAME && LOOP_ACTIVE_STATUSES.has(state.status)) {
          return { ...state, stopping: { commandId: data.commandId }, status: 'stopping' }
        }
        return state
      }
      if (event.type === 'command/done') {
        const data = commandDoneData(event)
        if (data === undefined) return state
        if (state.running !== null && state.running.commandId === data.commandId) {
          return {
            ...state,
            running: null,
            status: data.kind === 'success' ? 'running' : 'failed',
          }
        }
        if (state.stopping !== null && state.stopping.commandId === data.commandId) {
          return {
            ...state,
            stopping: null,
            status: data.kind === 'success' ? 'stopped' : 'running',
          }
        }
        return state
      }
      return state
    },
    wire: {
      viewSchema,
      view: (state) => ({ sourceSlug: state.sourceSlug, status: state.status }),
    },
  }
}

// /plan 同构（dsh-plan-mode lib/types/types.d.ts 同款）：键合并进官方可扩展类型表——
// 宿主 registry 泛型约束、client 快照/缓存读面与 GUI useProjection 的键字面量即得类型。
// 仅类型面（编译期合并 + import type 随编译擦除——运行期零 import，registry 消费本模块
// 产出的 plain object）；顶部 import type 为增广在本包程序内的解析锚（目标模块入程序，
// TS2664 消失——plan-mode types.d.ts 同款型法）。
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** dispatcher 派发循环会话徽标（S7——折叠 command/run+command/done 派生 {sourceSlug, status}）。 */
    'forge-dispatch-loop': import('./dispatch-loop.js').ForgeDispatchLoopProjection
  }
  interface SessionProjectionStateMap {
    /** host 折叠态（plain JSON——持久化投影缓存前置条件）。 */
    'forge-dispatch-loop': import('./dispatch-loop.js').ForgeDispatchLoopUnitState
  }
}

/** 表键身份锚（编译期断言：declare-module 合并已把键写进官方可扩展类型表——
 *  合并失败 = never 显形即编译错；运行期测试以本类型承载键常量完成同断言） */
export type ForgeDispatchLoopTableKeyAssertion = Extract<
  keyof SessionProjectionMap,
  typeof FORGE_DISPATCH_LOOP_PROJECTION_KEY
>
