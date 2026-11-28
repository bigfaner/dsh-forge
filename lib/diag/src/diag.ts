// 诊断事件域发射面（lib 公共包归拢——plugin-project 1.2 双源归一）：
// core telemetry（packages/core/src/telemetry/diag-events.ts）与 git-worktree
// diag-fallback（packages/plugins/git-worktree/src/diag-fallback.ts）逐字同逻辑的
// console 兜底在此单源；DIAG_EVENT / DiagLevel / DiagProcess / DiagEventPayload
// 单源在 @dsh-forge/lib-api/diag（contracts 已归并 lib-api），本包 re-export 不复制。
// 埋点归一单面：所有诊断埋点 = 一次 cordis `ctx.emit`（复用优先纪律：不自造事件总线）；
// emit 侧零对 appender 的静态依赖——appender 为 `diag/log` 事件域的唯一订阅者。
// cordis Events 接口的类型化扩充（declare module）留在 host 侧（唯一 augmentation 点）。
import { DIAG_EVENT, type DiagEventPayload, type DiagLevel } from '@dsh-forge/lib-api/diag'

export { DIAG_EVENT, type DiagLevel, type DiagProcess, type DiagEventPayload } from '@dsh-forge/lib-api/diag'

/** 结构化 emit 最小面（cordis Context.emit 的结构子集——消费方免 cordis 编译期依赖） */
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

/** console 兜底统一分流实现（按级分流——error → console.error、其余 → console.warn） */
function emitConsoleLine(line: string, level: DiagLevel): void {
  if (level === 'error') console.error(line)
  else console.warn(line)
}

/** console 兜底行格式（装配期诊断缝注释文案单源——前缀事件类别，后接原消息） */
function diagConsoleLine(payload: Pick<DiagEventPayload, 'event' | 'message'>): string {
  return `[${payload.event}] ${payload.message}`
}

/**
 * console 兜底（payload 形态——core telemetry 原入口）：按级分流，取代旧「缝缺席 =
 * 零 emit」语义——诊断不静默吞掉。
 */
export function diagConsoleFallback(payload: Omit<DiagEventPayload, 'process'>): void {
  emitConsoleLine(diagConsoleLine(payload), payload.level)
}

/**
 * console 兜底（行形态——git-worktree diag-fallback 原入口）：站点自拼行的同分流出口，
 * 默认 warn 级。禁新增直落 console 诊断站点——一律经本包兜底面。
 */
export function consoleDiagFallback(line: string, level: DiagLevel = 'warn'): void {
  emitConsoleLine(line, level)
}

/**
 * 注入式诊断缝发射（装配期闭包缝——业务侧统一消费口）：缝在场 → 透传（process 进程位
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
