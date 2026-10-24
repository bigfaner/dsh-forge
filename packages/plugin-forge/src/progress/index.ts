// 1.17 循环进度流内交错（decisions #34——'forge/progress' 会话事件形态；proposal
// run-tasks-host-command）：循环进度以会话事件append进 owner 会话日志，客户端经
// uiConversation.events.register 匹配渲染 DisclosureRow 同族折叠行——seq 时序天然交错。
//
// 三缝核实结论（上游 0.2.0-rc.2 源码取证，执行记录同步）：
//   ① merge-extensible：@deepseek-ai/dsh-session lib/types/types.d.ts L250「The
//      merge-extensible, append-only source of truth」+ L433「SessionEventType =
//      keyof SessionEventMap, plugin-merged extensions included」——declare-module
//      合并插件事件类型 'forge/progress' 即得 append 类型位；
//   ② append 权限链：agents 注册表（ctx.reflect.get('agents')——S2 防御读取第五先例）
//      → agent.session（@deepseek-ai/dsh-agent lib/types/runtime-types.d.ts L143
//      「readonly session: Session」）→ Session.append（dsh-session index.d.ts L246
//      「append<T extends SessionEventType>(type, data)」公开方法）。鸭子消费零上游
//      运行时 import（faces.ts 同纪律）；会话无活根 / append 面缺席 = fail-soft 跳过
//      （R4 叙述通道同径——进度非循环正确性依赖）；
//   ③ 非模型面：SurfaceEventType = 固定五元集（types.d.ts L441 'system/message' |
//      'developer/message' | 'user/message' | 'assistant/message' | 'tool/result'）——
//      'forge/progress' 不在其列 → isSurfaceEligibleType 恒 false → deriveEventMessage
//      恒 null → 不进模型上下文、零回合唤醒不可能（#28 红线保持）；SurfaceIntent 仅
//      SurfaceEventType 必填（append 签名条件元组），本类型无 marker 义务；
//      @messageProjection（surface.d.ts L25）仅约束「改写既有消息内容」的插件事件——
//      本事件纯新增节点，零声明义务；typert types.ts:518 的 declare module 为上游
//      事件族自家增广，插件侧仅需本文件合并，无上游同步义务。
//
// 数据形状（AC：任务键/动词结果/状态/计数/时间戳）——纯 JSON（Session.append 契约
// 「MUST be JSON-serializable」）。纪律：既有 notice 双通道零回归（notice = 模型面
// user/message 照旧）；渲染端无机制词（#24 同源）。
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'
import type { AgentLookupFace } from '../faces.js'

/** 会话事件类型键（SessionEventMap 合并键 = 客户端 match 判别字面量，双侧同源） */
export const FORGE_PROGRESS_EVENT_TYPE = 'forge/progress'

/** 池计数（折叠摘要行的进度段——claim 时点快照，可选） */
export interface ForgeProgressCounts {
  readonly pending: number
  readonly running: number
  readonly done: number
}

/**
 * 场景码单源常量表（loop-event-delivery 事件清单——22 值）：编码 = `{major}/{minor}`
 * 纯英文 + 中划线，major = 场景族分组 / minor = 组内细分。载荷 scenario 字段值域、
 * 路由消费与 GUI 场景章映射的单一来源（驱动器发射点全部经本表取值，零散落字面量）。
 */
export const FORGE_PROGRESS_SCENARIOS = [
  // 启动族（①-③）
  'startup/from-scratch',
  'startup/resume-stopped',
  'startup/resume-inflight',
  // 领取族（④⑤）
  'claim/new',
  'claim/interrupted',
  // 任务族（⑥）
  'task/complete',
  // 阻塞族（⑦⑧⑧b⑨⑩）
  'blocked/with-fix',
  'blocked/auto-fixed',
  'blocked/split',
  'blocked/wait-external',
  'blocked/ask-user',
  // 重试族（⑪⑫）
  'retry/spawn-failed',
  'retry/worker-aborted',
  // 循环族（⑬⑭⑮⑯⑰）
  'loop/halt',
  'loop/blocked-pool',
  'loop/timeout',
  'loop/finish-all',
  'loop/stopped',
  // 静默挂起族（⑱-㉑）
  'suspend/spawn-rate-limited',
  'suspend/worker-rate-limited',
  'suspend/abort-over-limit',
  'suspend/landing-rejected',
] as const

/** 场景码值域类型（= FORGE_PROGRESS_SCENARIOS 成员并集） */
export type ForgeProgressScenario = (typeof FORGE_PROGRESS_SCENARIOS)[number]

/**
 * 'forge/progress' 事件数据（SessionEventMap 合并值——纯 JSON）。
 * verb = 循环动词（用户视角动作词，无机制词）；scenario = 场景码（精确场景，新消费面
 * 以此为准——verb 保留向后兼容，旧事件流可读）。
 */
export interface ForgeProgressEventData {
  /** 任务源标识（/run-dag-tasks 绑定语义同源值） */
  readonly sourceSlug: string
  /**
   * 循环动词：claim=领取 / claim-resume=恢复领取 / settle=结算 / stop=停止 /
   * suspend=挂起待处置 / startup=启动 / retry=自动重试 / halt=受阻终局 /
   * timeout=超时终局 / finish-all=全部完成终局 / loop=循环级状态（无专属动词族）
   */
  readonly verb:
    | 'claim'
    | 'claim-resume'
    | 'settle'
    | 'stop'
    | 'suspend'
    | 'startup'
    | 'retry'
    | 'halt'
    | 'timeout'
    | 'finish-all'
    | 'loop'
  /** 结果状态（running=进行中 / completed=已完成 / blocked=阻塞 / interrupted=已中断） */
  readonly status: 'running' | 'completed' | 'blocked' | 'interrupted'
  /** 任务键（`slug/localId`——领取/结算/停止的归属任务；缺席 = 循环级事件） */
  readonly taskKey?: string
  /** 任务标题（人类视角行展示——领取/结算/停止等携带任务的事件在列） */
  readonly taskTitle?: string
  /** worker 子会话 id（行点击跳转锚——spawn 成功后的事件在列） */
  readonly workerSessionId?: string
  /** 场景码（{major}/{minor}——值域 = FORGE_PROGRESS_SCENARIOS 单源 22 值；缺席 = 旧载荷兼容） */
  readonly scenario?: ForgeProgressScenario
  /** 叙述注记（阻塞/挂起原因摘要等——用户/agent 双端可见） */
  readonly note?: string
  /** 池计数快照（claim 时点——可选） */
  readonly counts?: ForgeProgressCounts
  /** 时间戳（epoch 毫秒——驱动器发射点打点） */
  readonly at: number
}

const SCENARIO_SET: ReadonlySet<string> = new Set(FORGE_PROGRESS_SCENARIOS)

/** 事件数据守卫（客户端 match 前的形状防御——他形不猜；新字段缺省容忍） */
export function isForgeProgressData(value: unknown): value is ForgeProgressEventData {
  if (typeof value !== 'object' || value === null) return false
  const raw = value as Record<string, unknown>
  if (typeof raw['sourceSlug'] !== 'string' || raw['sourceSlug'] === '') return false
  if (
    raw['verb'] !== 'claim' &&
    raw['verb'] !== 'claim-resume' &&
    raw['verb'] !== 'settle' &&
    raw['verb'] !== 'stop' &&
    raw['verb'] !== 'suspend' &&
    raw['verb'] !== 'startup' &&
    raw['verb'] !== 'retry' &&
    raw['verb'] !== 'halt' &&
    raw['verb'] !== 'timeout' &&
    raw['verb'] !== 'finish-all' &&
    raw['verb'] !== 'loop'
  )
    return false
  if (raw['status'] !== 'running' && raw['status'] !== 'completed' && raw['status'] !== 'blocked' && raw['status'] !== 'interrupted') return false
  if (raw['taskKey'] !== undefined && typeof raw['taskKey'] !== 'string') return false
  if (raw['taskTitle'] !== undefined && typeof raw['taskTitle'] !== 'string') return false
  if (raw['workerSessionId'] !== undefined && typeof raw['workerSessionId'] !== 'string') return false
  if (raw['scenario'] !== undefined && (typeof raw['scenario'] !== 'string' || !SCENARIO_SET.has(raw['scenario']))) return false
  if (raw['note'] !== undefined && typeof raw['note'] !== 'string') return false
  if (typeof raw['at'] !== 'number' || !Number.isFinite(raw['at'])) return false
  return true
}

/** 循环进度 append 面（驱动器依赖——宿主会话 append 的收窄消费面） */
export interface ProgressAppendFace {
  /** 向 owner 会话 append 一枚 'forge/progress' 事件（同步 fire-and-forget，fail-soft） */
  append(ownerSessionId: string, data: ForgeProgressEventData): void
}

/**
 * 适配层：agents 注册表 → 进度 append 面（第二缝唯一落点）。链 = agents.get(id) →
 * agent.session.append('forge/progress', data)；链上任一环缺席（会话无活根/面漂移/
 * get 抛错）或 append 抛错 = 静默跳过告警——进度事件零循环正确性依赖（fail-soft）。
 */
export function adaptSessionProgressAppend(agents: AgentLookupFace | undefined): ProgressAppendFace | undefined {
  if (agents === undefined || typeof agents.get !== 'function') return undefined
  return {
    append(ownerSessionId: string, data: ForgeProgressEventData): void {
      let agent: unknown
      try {
        agent = agents.get(ownerSessionId)
      } catch {
        return // 无活根（会话已关闭/删除）——静默跳过（faces.adaptAgentNarrationChannel 同径）
      }
      const session = (agent as { session?: { append?: (type: string, data: unknown) => unknown } } | null | undefined)
        ?.session
      const append = session?.append
      if (typeof append !== 'function') return // append 面缺席（面漂移/窄面测试）——跳过
      try {
        append.call(session, FORGE_PROGRESS_EVENT_TYPE, data)
      } catch (cause) {
        console.warn(
          `forge progress append failed (${ownerSessionId}): ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
    },
  }
}

// ① merge-extensible（dsh-session types.d.ts L250/L433 同源语义）：键合并进官方
// SessionEventMap——宿主 append 调用点与客户端事件窄读即得类型。仅类型面（编译期合并
// + import type 随编译擦除——运行期零 import；projection/dispatch-loop.ts declare-module
// 同款型法：顶部 import type 为增广在本包程序内的解析锚）。
import type { SessionEventMap } from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** forge 循环进度（1.17——非模型面：不在 SurfaceEventType 集内，零回合唤醒）。 */
    'forge/progress': import('./index.js').ForgeProgressEventData
  }
}

/** 表键身份锚（编译期断言：合并失败 = never 显形即编译错——dispatch-loop 同款） */
export type ForgeProgressEventKeyAssertion = Extract<
  keyof SessionEventMap,
  typeof FORGE_PROGRESS_EVENT_TYPE
>

// ② 读侧词汇注册（#35 定罪修复——2026-10-11 真机）：持久化读路径对「构建未知且无
// ignorable 标记」的事件类型拒绝解读整本日志（known-event-types.ts:10-14 + 存量校验
// `validateStoredEvents`），而 session.append 的信封构造（dsh-session index.ts:744-750）
// 无 ignorable 设置口 → append 落盘的事件无标记 → owner 会话日志被毒化（历史加载失败）。
// 修复=激活时向官方导出的词汇表运行时注册（公开导出 Set 的追加，零 dsh 源码修改）：
// 本构建确实理解该类型（宿主 append、客户端节点渲染双侧在位），注册即把事实告知词汇表。
// 副作用自愈：已毒化的存量日志在注册后的构建中恢复可观测（类型已知 → 不再拒读）。
// 非模型面边界不因注册改变（MESSAGE_PROJECTION_EVENT_TYPES 不含本类型）。
export function registerProgressEventVocabulary(): void {
  // 运行期依赖（boundaries 白名单成员——#35）：激活即同步注册。幂等（Set.add）。
  // 上游类型刻意 ReadonlySet（first-party 目录禁手编纪律），运行时实为可变 Set——
  // 插件注册是就地追加语义，定点按真实形状断言。
  ;(KNOWN_SESSION_EVENT_TYPES as Set<string>).add(FORGE_PROGRESS_EVENT_TYPE)
}
