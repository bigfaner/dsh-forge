// 诊断事件域 + 统一日志汇（app-observability 1.1）——telemetry 域出口单面。
export {
  DIAG_EVENT,
  emitDiag,
  type DiagEventPayload,
  type DiagLevel,
  type DiagProcess,
} from './diag-events.js'
export {
  createDiagContextStore,
  runWithDiagContext,
  type DiagContext,
  type DiagContextStore,
} from './diag-context.js'
export {
  DiagAppender,
  attachDiagAppender,
  defaultAppenderDriver,
  logFileNameFor,
  type AppenderCounters,
  type AppenderDriver,
  type AppenderOptions,
  type DiagLine,
} from './appender.js'
export { LineFolder, foldKeyOf, type FoldedLine, type LineFolderOptions } from './line-folder.js'
export { installMainFallbackHooks, type FallbackProcessLike } from './fallback.js'
export { relayDiagOverBridge, parseDiagRelayLine } from './child-relay.js'
export { attachGatewayFoldDiag, isFoldedInternalError, withCauseStack, type GatewayFoldFace, type GatewayFoldEmit, type GatewayFoldOptions } from './gateway-fold.js'
export { attachHostTelemetry, type HostTelemetry } from './host-wiring.js'
