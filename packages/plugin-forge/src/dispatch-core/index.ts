// dispatch-core barrel（S1a 可拆卸壳分层——共享派发核心面单一出口）。面向两消费者：
// 工具壳（src/tools/dispatch-task.ts——单向依赖本面）与未来的循环驱动器（src/loop/）。
// 依赖方向硬约束：核心面零 import 工具壳——本目录即未来 run-tasks skill 退役时的
// 下线边界（工具面整体移除而核心面/循环/核心单测零波及，decisions #10）。
export { dispatchCore } from './core.js'
export type { DispatchCoreArgs, DispatchCoreDeps, DispatchCoreExec } from './core.js'
export { deriveWorkerToolFilter, reconcileWorkerReasoning, workerAgentOptionsOf } from './assemble.js'
export { bumpSpawnFailures, clearSpawnFailures, spawnFailureStuck, HALT_THRESHOLD, HALTED_REASON } from './guard.js'
export { classifyPool, poolOf } from './pool.js'
export type { PoolSnapshot, PoolVerdict } from './pool.js'
export type { DispatchCoreFailure, DispatchSpawnedResult, DispatchTaskResult } from './result.js'
export { settleWorkerRun } from './settle.js'
export type { WorkerSettlement } from './settle.js'
export type { SpawnWorker, SpawnWorkerHandle, SpawnWorkerRequest } from './spawn.js'
