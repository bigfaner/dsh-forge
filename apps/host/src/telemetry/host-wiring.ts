// main 侧诊断事件域装配（app-observability 1.2——main.ts 薄编排纪律下的装配缝下沉）：
// 轻量 cordis Context 作 diag/log 事件域总线承载（main 无 profile ctx）、appender 唯一
// 订阅、兜底钩挂接（崩溃路径同步写）、rpc-envelope 单点埋点出口 + 链 A ALS 注入、
// child stdio pipe 行转译、child relay JSON 行转译。评审 Note-3：尽早装配（早窗收口）。
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { configureRpcEnvelopeDiag } from '../ipc/rpc-envelope.js'
import {
  attachDiagAppender,
  createDiagContextStore,
  emitDiag,
  installMainFallbackHooks,
  parseDiagRelayLine,
  type DiagAppender,
  type DiagContextStore,
  type DiagEventPayload,
} from './index.js'

/** main 诊断装配面（emit = 诊断事件域出口——stderr/relay/console 三源共用单点） */
export interface HostTelemetry {
  /** main↔child bridge trace_id 携带源（链 A ALS） */
  readonly diagAls: DiagContextStore
  /** 退出前 flush（红线③） */
  readonly appender: DiagAppender
  /** 诊断事件域 emit 出口（内部吞异常——诊断面零反压业务，红线①同构） */
  readonly emit: (payload: DiagEventPayload) => void
  /** child stdio pipe 行 → 诊断事件（stderr=error 级，stdout=info 级） */
  readonly childStdioSink: (stream: 'stdout' | 'stderr', line: string) => void
  /** child relay 结构化 JSON 行 → 诊断事件负载（非 relay 行 = undefined 落回 harness.log 链） */
  readonly translateRelayLine: (line: string) => DiagEventPayload | undefined
}

/** 装配（userData = {app-data}/dsh-forge——logs 目录 = {userData}/logs） */
export function attachHostTelemetry(userData: string): HostTelemetry {
  const logsDir = join(userData, 'logs')
  try {
    mkdirSync(logsDir, { recursive: true })
  } catch {
    // 目录落地失败不阻 boot（appender 写失败走红线①计数）
  }
  const diagCtx = new Context()
  const diagAls = createDiagContextStore()
  const { appender } = attachDiagAppender(diagCtx, { dir: logsDir, als: diagAls })
  installMainFallbackHooks(process, appender) // 崩溃路径同步写（红线③豁免面）
  const emit = (payload: DiagEventPayload): void => {
    try {
      emitDiag(diagCtx, payload)
    } catch {
      // 诊断面异常不反压业务（红线①同构）
    }
  }
  configureRpcEnvelopeDiag({ als: diagAls, sink: emit }) // ipc-handler 单点埋点 + 链 A ALS
  return {
    diagAls,
    appender,
    emit,
    childStdioSink: (stream, line) => {
      emit({ level: stream === 'stderr' ? 'error' : 'info', process: 'child', event: 'child-stdio', message: line })
    },
    translateRelayLine: parseDiagRelayLine,
  }
}
