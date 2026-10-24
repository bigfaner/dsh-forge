/**
 * 会话日志缓存同步（自 main.ts 提取——行为等价移植）：
 * 每会话一份 durable 历史快照（api.history 尾窗），chat/tasks/worker 投影单一数据源。
 * SSE 帧只做失效信号：scheduleRefresh 600ms 节流重拉；重拉完成后经 deps.notify 通知
 * frameListeners（引擎监听器据 seq 单调尾序增量外推，不重不漏）。
 */
import type { WireEvent } from './wire.ts'

export interface LogSyncTimers {
  readonly setTimeout: (fn: () => void, ms: number) => unknown
  readonly clearTimeout: (handle: unknown) => void
}

export interface LogSyncDeps {
  readonly history: (sessionId: string, limit: number) => Promise<unknown>
  /** 历史窗口形状收敛（main.ts 注入 coerceHistoryWindow——core 不依赖 views） */
  readonly coerce: (raw: unknown, limit: number) => { readonly entries: readonly WireEvent[] }
  readonly notify: () => void
  readonly limit?: number
  readonly throttleMs?: number
  readonly timers?: LogSyncTimers
}

export interface LogSync {
  get(sessionId: string): readonly WireEvent[]
  refresh(sessionId: string): Promise<void>
  schedule(sessionId: string): void
}

export function createLogSync(deps: LogSyncDeps): LogSync {
  const limit = deps.limit ?? 500
  const throttleMs = deps.throttleMs ?? 600
  const timers = deps.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
  }
  const cache = new Map<string, readonly WireEvent[]>()
  const refreshTimers = new Map<string, unknown>()

  const refresh = async (sessionId: string): Promise<void> => {
    try {
      const raw = await deps.history(sessionId, limit)
      // Root cause: 帧到达瞬间的 emitFrames 读到的是旧缓存——重拉完成后必须补一次通知，
      // 否则显示恒滞后一拍，末帧之后的重拉（最终回复/turn-end）永不传播到视图。
      cache.set(sessionId, deps.coerce(raw, limit).entries)
      deps.notify()
    } catch {
      /* 历史拉取失败保持旧快照（轮询/帧腿下轮重试） */
    }
  }

  return {
    get: (sessionId) => cache.get(sessionId) ?? [],
    refresh,
    schedule: (sessionId) => {
      if (refreshTimers.has(sessionId)) return
      refreshTimers.set(
        sessionId,
        timers.setTimeout(() => {
          refreshTimers.delete(sessionId)
          void refresh(sessionId)
        }, throttleMs),
      )
    },
  }
}
