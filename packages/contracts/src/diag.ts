// 诊断事件域契约（bug 5f7d7ebd——DIAG_EVENT 单源下沉）：`diag/log` 通道名 +
// DiagLevel / DiagProcess / DiagEventPayload 基础类型。core telemetry
// （packages/core/src/telemetry/diag-events.ts）与 plugin-forge faces 共同引此单源，
// 防无护栏双份字面量漂移（漂移症状 = 运行期静默丢事件）。纯常量 + 接口，零逻辑，
// 符合 contracts 定位；cordis Events 接口的类型化扩充（declare module）仍留 host 侧。
// emit 侧零对 appender 的静态依赖——appender 为 `diag/log` 事件域的唯一订阅者
// （host attachDiagAppender）。新增错误源 = 新增 emit 点，订阅侧零改动。

/** 诊断事件通道名（诊断事件域唯一事件——类别经 payload.event 区分） */
export const DIAG_EVENT = 'diag/log' as const

/** 日志级别（proposal 定版：warn/error/info 三级） */
export type DiagLevel = 'info' | 'warn' | 'error'

/** 进程标签（JSONL 行 process 字段——main/child/renderer 三进程单源） */
export type DiagProcess = 'main' | 'child' | 'renderer'

/**
 * 诊断事件负载（emit 侧就地可得的字段——timestamp/trace_id 由订阅侧 appender
 * 补齐，不经 emit 面传递）。
 */
export interface DiagEventPayload {
  level: DiagLevel
  process: DiagProcess
  /** 诊断事件类别（gateway-fold / fail-open / ipc-handler / fallback 等） */
  event: string
  message: string
  /** 完整错误栈（可用时携带——折叠点/兜底钩/IPC 埋点面） */
  stack?: string
  projectId?: string
  sessionId?: string
  cwd?: string
  /** trace_id 显式携带（1.2 跨进程链——child relay/bridge 显式传递；缺省由订阅侧 ALS 读） */
  traceId?: string
  /** 计数类上下文（就地可得即携带——如 project-sort 批量写面覆盖的项目数） */
  projectCount?: number
  /** 同文重复折叠计数（12③ 噪音治理——被折叠掉的重复行数；首次行/未折叠缺席） */
  repeat?: number
  /** 通道名（ipc-rpc-slow 慢 RPC 诊断——bug 2a284e9d） */
  channel?: string
  /** handler 执行时长 ms（ipc-rpc-slow 慢 RPC 诊断） */
  durationMs?: number
  /** renderer→main 排队时延 ms（ipc-rpc-slow——sentAt 缺席时缺席） */
  hopMs?: number
}
