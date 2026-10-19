// 诊断事件域（app-observability 方案 1）：埋点归一单面——所有诊断埋点 = 一次
// cordis `ctx.emit`，承载于官方事件总线（复用优先纪律：不自造事件总线）。
// emit 侧零对 appender 的静态依赖；appender 为 `diag/log` 事件域的唯一订阅者
// （attachDiagAppender）。新增错误源 = 新增 emit 点，订阅侧零改动。
import type { Context } from '@deepseek-ai/cordis'

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
}

// cordis 官方 Events 接口扩充（官方事件总线的类型化注册缝——诊断事件域类型单源）
declare module '@deepseek-ai/cordis' {
  interface Events {
    'diag/log'(payload: DiagEventPayload): void
  }
}

/**
 * 诊断埋点（fire-and-forget 语义由订阅侧保证——ctx.emit 同步分发，订阅回调
 * 自身绝不抛，业务 emit 点零反压）。
 */
export function emitDiag(ctx: Context, payload: DiagEventPayload): void {
  ctx.emit(DIAG_EVENT, payload)
}
