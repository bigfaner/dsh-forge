// child 侧诊断事件 relay（app-observability 1.2——进程间管道层「进程内 cordis 事件、
// 进程间管道」的 child 半边）：child 侧 `diag/log` 事件经桥 diag 消息以结构化 JSON 行
// 回 main，main 转译为 main 侧诊断事件（appender 唯一订阅者，process 保持 'child'）。
// 序列化在订阅回调内同步完成（ALS 上下文只在同步栈内可见——评审 Note-1）；relay 自身
// 绝不抛（emit 同步把 listener 异常落回业务 emit 点，破红线①）。
import type { Context } from '@deepseek-ai/cordis'
import { DIAG_EVENT, type DiagEventPayload } from './diag-events.js'
import type { DiagContextStore } from './diag-context.js'

/** relay 行标记（main 侧 parseDiagRelayLine 判据——非本形态行回落既有纯文本链） */
const RELAY_MARKER = '__diag'

/** child 侧装配：`diag/log` 事件 → 结构化 JSON 行经 send 送 main（trace_id 随行显式携带）。 */
export function relayDiagOverBridge(
  ctx: Context,
  send: (line: string) => void,
  als?: DiagContextStore,
): () => boolean {
  const dispose = ctx.on(DIAG_EVENT, (payload) => {
    try {
      const store = als?.getStore()
      const traceId = payload.traceId ?? store?.traceId
      const context = store === undefined ? {} : store
      send(JSON.stringify({ [RELAY_MARKER]: { ...payload, ...(traceId !== undefined ? { traceId } : {}), ...context } }))
    } catch {
      // relay 失败静默（诊断面不反压业务——红线①同构）
    }
  })
  return dispose
}

/**
 * main 侧转译：桥 diag 行 → 诊断事件负载（结构化 relay 行）；纯文本行（既有 [pair-diag]
 * 决策链等）→ undefined 落回 harness.log 既有链。畸形 JSON 静默 undefined。
 */
export function parseDiagRelayLine(line: string): DiagEventPayload | undefined {
  if (!line.startsWith(`{"${RELAY_MARKER}"`)) return undefined
  try {
    const parsed: unknown = JSON.parse(line)
    const inner = (parsed as Record<string, unknown> | null)?.[RELAY_MARKER]
    if (typeof inner !== 'object' || inner === null) return undefined
    const p = inner as Record<string, unknown>
    if (
      (p.level !== 'info' && p.level !== 'warn' && p.level !== 'error') ||
      (p.process !== 'main' && p.process !== 'child' && p.process !== 'renderer') ||
      typeof p.event !== 'string' ||
      typeof p.message !== 'string'
    ) {
      return undefined
    }
    return {
      level: p.level,
      process: p.process,
      event: p.event,
      message: p.message,
      ...(typeof p.stack === 'string' ? { stack: p.stack } : {}),
      ...(typeof p.projectId === 'string' ? { projectId: p.projectId } : {}),
      ...(typeof p.sessionId === 'string' ? { sessionId: p.sessionId } : {}),
      ...(typeof p.cwd === 'string' ? { cwd: p.cwd } : {}),
      ...(typeof p.traceId === 'string' ? { traceId: p.traceId } : {}),
      ...(typeof p.repeat === 'number' ? { repeat: p.repeat } : {}),
    }
  } catch {
    return undefined
  }
}
