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
 * 'forge/progress' 事件数据（SessionEventMap 合并值——纯 JSON）。
 * verb = 循环动词（claim/claim-resume/settle/stop——用户视角动作词，无机制词）；
 * status = 结果状态四值。
 */
export interface ForgeProgressEventData {
  /** 任务源标识（/run-dag-tasks 绑定语义同源值） */
  readonly sourceSlug: string
  /** 循环动词（claim=领取 / claim-resume=恢复领取 / settle=结算 / stop=停止） */
  readonly verb: 'claim' | 'claim-resume' | 'settle' | 'stop'
  /** 结果状态（running=进行中 / completed=已完成 / blocked=阻塞 / interrupted=已中断） */
  readonly status: 'running' | 'completed' | 'blocked' | 'interrupted'
  /** 任务键（`slug/localId`——领取/结算/停止的归属任务；缺席 = 循环级事件） */
  readonly taskKey?: string
  /** 池计数快照（claim 时点——可选） */
  readonly counts?: ForgeProgressCounts
  /** 时间戳（epoch 毫秒——驱动器发射点打点） */
  readonly at: number
}

/** 事件数据守卫（客户端 match 前的形状防御——他形不猜） */
export function isForgeProgressData(value: unknown): value is ForgeProgressEventData {
  if (typeof value !== 'object' || value === null) return false
  const raw = value as Record<string, unknown>
  if (typeof raw['sourceSlug'] !== 'string' || raw['sourceSlug'] === '') return false
  if (raw['verb'] !== 'claim' && raw['verb'] !== 'claim-resume' && raw['verb'] !== 'settle' && raw['verb'] !== 'stop') return false
  if (raw['status'] !== 'running' && raw['status'] !== 'completed' && raw['status'] !== 'blocked' && raw['status'] !== 'interrupted') return false
  if (raw['taskKey'] !== undefined && typeof raw['taskKey'] !== 'string') return false
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
