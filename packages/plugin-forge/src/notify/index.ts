// notify barrel（S4 叙述通知模块单一出口——模板/骨架机械/双通道/长内容落盘/组装面）。
// 纯模块：零循环依赖、零上游运行时 import（通道/目录解析均由装配方注入结构化最小面）。
export {
  findMechanismWords,
  line,
  MECHANISM_WORDS,
  nextActionLine,
  NEXT_ACTION_NONE,
  NEXT_ACTION_PATTERN,
  nextActionPromptUser,
  REASON_SUMMARY_MAX_CHARS,
  sanitizeValue,
  summarizeReason,
  typeLine,
  validateNarrative,
} from './skeleton.js'
export type { NextAction } from './skeleton.js'
export {
  blockedAskUser,
  blockedAutoFixed,
  blockedPool,
  blockedWaitExternal,
  blockedWithFix,
  claim,
  claimInterrupted,
  completed,
  finishedAll,
  finishedTimeout,
  renderNarrative,
  SCENARIOS,
  spawnFailedHalted,
  spawnFailedRetry,
  startupFromScratch,
  startupResumeInFlight,
  startupResumeStopped,
  stoppedByCommand,
  workerAbortedRetry,
} from './templates.js'
export type {
  BlockedAskUserPayload,
  BlockedAutoFixedPayload,
  BlockedPoolItem,
  BlockedPoolPayload,
  BlockedWaitExternalPayload,
  BlockedWithFixPayload,
  ClaimInterruptedPayload,
  ClaimPayload,
  CompletedPayload,
  FinishedAllPayload,
  FinishedTimeoutPayload,
  NarrativePayloadMap,
  NarrationRoute,
  ScenarioId,
  SpawnFailedHaltedPayload,
  SpawnFailedRetryPayload,
  StoppedByCommandPayload,
  StartupFromScratchPayload,
  StartupResumeInFlightPayload,
  StartupResumeStoppedPayload,
  WorkerAbortedRetryPayload,
} from './templates.js'
export { failSoftNarrationChannel } from './channel.js'
export type { NarrationChannel } from './channel.js'
export {
  createIncidentStore,
  INCIDENT_ERROR_FILE,
  INCIDENT_SETTLEMENT_FILE,
  INCIDENT_TRIAGE_FILE,
  incidentDirNameOf,
  incidentRelPathOf,
  sanitizeIncidentSegment,
} from './incident-log.js'
export type { IncidentContent, IncidentInput, IncidentStore, IncidentStoreDeps } from './incident-log.js'
export { createNarrator } from './narrator.js'
export type { BlockedEmitMeta, BlockedFields, BlockedScenarioId, Narrator, NarratorDeps } from './narrator.js'
