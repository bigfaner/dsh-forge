// doc-convert 诊断发射面（AGENTS §7 可观测性 + diagnostic-emit-discipline 同径）：
// 成功/失败双路径均 emit——发射面缺席按级分流 console 兜底（knowledge emitStorageDiag
// 同构），不采用「缺席 = 零 emit」的静默形态。payload 结构化自持（零 @dsh-forge/*
// 依赖——faces 消费面以本形状锚定官方 DIAG_EVENT 载荷子集）。
export const DOC_CONVERT_EVENT = 'doc-convert'
export const DOC_CONVERT_FAIL_EVENT = 'doc-convert-fail'

/** 官方 diag/log 事件载荷子面（contracts DiagEventPayload 结构兼容子集） */
export interface ConvertDiagPayload {
  readonly level: 'info' | 'warn' | 'error'
  readonly event: string
  readonly message: string
  readonly process?: 'main' | 'renderer' | 'child'
  readonly cwd?: string
  readonly docRel?: string
  readonly outRel?: string
  readonly stack?: string
}

/** 官方 cordis ctx.emit 类型化发射子面（event 域固定 'diag/log'） */
export type DiagEmitFace = (event: 'diag/log', payload: ConvertDiagPayload) => void

/** 装配期注入的诊断发射面（已绑定 event 域的单参形态——插件内消费口径） */
export type DiagEmitter = (payload: ConvertDiagPayload) => void

/**
 * doc-convert 域埋点单点：emit 在场 → 类型化发射；缺席 → 按级分流 console 兜底
 * （error → console.error，其余 → console.warn——零静默失败）。
 */
export function emitConvertDiag(emit: DiagEmitter | undefined, payload: ConvertDiagPayload): void {
  if (emit !== undefined) {
    emit(payload)
    return
  }
  const line = `[${payload.event}] ${payload.message}`
  if (payload.level === 'error') console.error(line)
  else console.warn(line)
}
