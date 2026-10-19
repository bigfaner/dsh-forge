// main 兜底钩挂接面（app-observability 方案 4 + 方案 12 红线③崩溃路径豁免）：
// uncaughtException / unhandledRejection → 崩溃行经 appender 同步写确定落盘
// （appendCrashLine——appendSync，绕过异步队列；核心证据行不随进程退出丢失）。
// 挂接面以最小 ProcessLike 注入（vitest 以 EventEmitter 替身驱动——真实接线在
// main 装配轮消费 process/app 事件面，本任务只落缝与机制本体）。
import { type DiagEventPayload } from './diag-events.js'
import type { DiagAppender } from './appender.js'

/** 最小进程事件面（DI——真实 process 兼容，替身可注入） */
export interface FallbackProcessLike {
  on(event: 'uncaughtException', listener: (error: Error) => void): unknown
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown
  off(event: 'uncaughtException', listener: (error: Error) => void): unknown
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown
}

/** 兜底钩错误负载（event 类别 fallback-uncaught / fallback-unhandled） */
function crashPayload(kind: 'fallback-uncaught' | 'fallback-unhandled', error: unknown): DiagEventPayload {
  const err = error as Error | undefined
  return {
    level: 'error',
    process: 'main',
    event: kind,
    message: String(err?.message ?? error),
    stack: err?.stack,
  }
}

/**
 * 挂接 main 兜底钩：错误行同步落盘（红线③）+ 经诊断事件域 emit（订阅侧单写者
 * 语义不破——同步行与事件行会双写同文，此处只走同步面，不重复 emit 归一防线：
 * 兜底钩是事件域之外的最后豁免面，不进 ctx.emit 以防事件分发自身被崩溃态破坏）。
 * 返回退订器。
 */
export function installMainFallbackHooks(
  target: FallbackProcessLike,
  appender: DiagAppender,
): () => void {
  const onUncaught = (error: Error): void => {
    appender.appendCrashLine(crashPayload('fallback-uncaught', error))
  }
  const onUnhandled = (reason: unknown): void => {
    appender.appendCrashLine(crashPayload('fallback-unhandled', reason))
  }
  target.on('uncaughtException', onUncaught)
  target.on('unhandledRejection', onUnhandled)
  return () => {
    target.off('uncaughtException', onUncaught)
    target.off('unhandledRejection', onUnhandled)
  }
}
