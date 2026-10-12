// dispatch-core barrel（S1a 可拆卸壳分层——共享派发核心面单一出口）。面向两消费者：
// 工具壳（src/tools/dispatch-task.ts——单向依赖本面）与未来的循环驱动器（src/loop/）。
// 依赖方向硬约束：核心面零 import 工具壳——本目录即未来 run-tasks skill 退役时的
// 下线边界（工具面整体移除而核心面/循环/核心单测零波及，decisions #10）。
export { dispatchCore } from './core.js'
// S1b 三段阶段面（runRound 交错点——循环驱动器逐段消费同一实现；依赖方向：loop/ → 本面单向）
export { claimForDispatch, settleClaimed, spawnClaimed } from './core.js'
export type {
  ClaimStageResult,
  ClaimedDispatch,
  DispatchChainScope,
  DispatchCoreDeps,
  DispatchCoreExec,
  HaltedOutcome,
  SettleStageInput,
  SettleStageResult,
  SpawnStageResult,
} from './core.js'
export { deriveTriageToolFilter, deriveWorkerToolFilter, reconcileWorkerReasoning, workerAgentOptionsOf } from './assemble.js'
// S2 分层承载：worker persona 合成单源 = contracts composePersona（spawn 链接线——
// legacy composeWorkerPersona 族级先形已下线，防双源复活不再导出）
export { bumpSpawnFailures, clearSpawnFailures, spawnFailureStuck, HALT_THRESHOLD, HALTED_REASON } from './guard.js'
// S1c 循环独占守卫（活循环任务源拒绝外部 dispatchTask——显式 slug 与盲选两径；登记表
// 模块级易失，驱动器 start/终态维护，claim 面消费）
export {
  clearExclusiveLoopSource,
  exclusiveLoopSourceOf,
  exclusiveScopedRejection,
  externalExclusivityGuard,
  hasExclusiveLoopSources,
  LOOP_EXCLUSIVE_GUIDANCE,
  LoopSourceExclusiveError,
  resetExclusiveLoopSources,
  setExclusiveLoopSource,
} from './exclusivity.js'
export { classifyPool, poolOf } from './pool.js'
export type { PoolSnapshot, PoolVerdict } from './pool.js'
export type { DispatchCoreFailure, DispatchSpawnedResult, DispatchTaskResult } from './result.js'
export { settleWorkerRun } from './settle.js'
export type { WorkerSettlement } from './settle.js'
export type { SpawnWorker, SpawnWorkerHandle, SpawnWorkerRequest } from './spawn.js'
