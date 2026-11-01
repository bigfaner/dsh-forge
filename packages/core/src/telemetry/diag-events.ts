// 诊断事件域单源（app-observability 方案 1）：埋点归一单面——所有诊断埋点 = 一次
// cordis `ctx.emit`，承载于官方事件总线（复用优先纪律：不自造事件总线）。
// emit 侧零对 appender 的静态依赖；appender 为 `diag/log` 事件域的唯一订阅者
// （host attachDiagAppender）。新增错误源 = 新增 emit 点，订阅侧零改动。
//
// core 不依赖 cordis 编译期包（既有设计决策——ctx 以结构化最小面消费）：
// emitDiag 收结构化 emit 面，cordis Context 结构兼容、调用零适配。
// cordis Events 接口的类型化扩充（declare module）留在 host 侧（唯一 augmentation 点）。
//
// DIAG_EVENT / DiagLevel / DiagProcess / DiagEventPayload 单源在 @dsh-forge/contracts
// （bug 5f7d7ebd——本文件只保留 re-export 兼容面与 emit/兜底逻辑）。

export { DIAG_EVENT, type DiagLevel, type DiagProcess, type DiagEventPayload } from '@dsh-forge/contracts'
import { DIAG_EVENT, type DiagEventPayload } from '@dsh-forge/contracts'

/** 结构化 emit 最小面（cordis Context.emit 的结构子集——core 免 cordis 编译期依赖） */
export interface DiagEmitFace {
  emit(event: string, payload: DiagEventPayload): unknown
}

/**
 * 诊断埋点（fire-and-forget 语义由订阅侧保证——ctx.emit 同步分发，订阅回调
 * 自身绝不抛，业务 emit 点零反压）。
 */
export function emitDiag(ctx: DiagEmitFace, payload: DiagEventPayload): void {
  ctx.emit(DIAG_EVENT, payload)
}

/** console 兜底行格式（装配期诊断缝注释文案单源——前缀事件类别，后接原消息） */
function diagConsoleLine(payload: Pick<DiagEventPayload, 'event' | 'message'>): string {
  return `[${payload.event}] ${payload.message}`
}

/**
 * console 兜底（按级分流——diag-face-consolidation 统一口径，expert-squad index.ts:207-211
 * 同径）：error → console.error、其余 → console.warn。取代 core 旧「缝缺席 = 零 emit」
 * 语义——诊断不静默吞掉。
 */
export function diagConsoleFallback(payload: Omit<DiagEventPayload, 'process'>): void {
  const line = diagConsoleLine(payload)
  if (payload.level === 'error') console.error(line)
  else console.warn(line)
}

/**
 * 注入式诊断缝发射（装配期闭包缝——core 业务侧统一消费口）：缝在场 → 透传（process 进程位
 * 由装配桥接层补齐）；缝缺席或发射失败 → 按级分流 console 兜底。fire-and-forget——兜底自身
 * 永不抛（诊断面零反压业务）。
 */
export function emitDiagOrFallback(
  onDiag: ((payload: Omit<DiagEventPayload, 'process'>) => void) | undefined,
  payload: Omit<DiagEventPayload, 'process'>,
): void {
  if (onDiag !== undefined) {
    try {
      onDiag(payload)
      return
    } catch {
      // 发射失败 → 兜底（诊断不静默）
    }
  }
  diagConsoleFallback(payload)
}
