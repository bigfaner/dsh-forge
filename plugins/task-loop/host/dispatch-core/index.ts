// dispatch-core barrel（S1a 可拆卸壳分层——共享派发核心面单一出口）。面向两消费者：
// 工具壳（tools/dispatch_task 面——单向依赖本面）与循环驱动器（loop/）。
// 依赖方向硬约束：核心面零 import 工具壳——本目录即工具壳下线边界（decisions #10）。
export { dispatchCore } from "./core.js";
// S1b 三段阶段面（runRound 交错点——循环驱动器逐段消费同一实现；依赖方向：loop/ → 本面单向）
export { claimForDispatch, settleClaimed, spawnClaimed, findLiveSuccessor } from "./core.js";
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
} from "./core.js";
// 模块④（code-design）：管线必备用具集 / bug 三动词跨域必备集单点导出
export { WORKER_PIPELINE_ESSENTIAL_TOOLS, WORKER_BUG_ESSENTIAL_TOOLS, WORKER_EXPERT_RELEASABLE_DENY, WORKER_GENERIC_EXECUTION_TOOLS } from "./assemble.js";
export type { DeriveWorkerToolFilterOptions } from "./assemble.js";
export { deriveTriageToolFilter, deriveWorkerToolFilter, globalToolNamesOfToolsFace, intersectAllowNames, probeIsSubdomain, reconcileWorkerReasoning, registeredToolNamesOf, workerAgentOptionsOf } from "./assemble.js";
// worker 来源任务注册表（fix-bug——recordBug 工具面 source_task_id 注入源；spawn 登记结算注销）
export { forgetWorkerSourceTask, rememberWorkerSourceTask, workerSourceTaskOf } from "./assemble.js";
// S2 分层承载：worker persona 合成单源 = composePersona（spawn 链接线——
// legacy composeWorkerPersona 族级先形已下线，防双源复活不再导出）
export { bumpSpawnFailures, clearSpawnFailures, spawnFailureStuck, HALT_THRESHOLD, HALTED_REASON } from "./guard.js";
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
  ownerActiveLoopOf,
  OwnerActiveLoopError,
  OWNER_ACTIVE_GUIDANCE,
  ownerSingleActiveRejection,
  resetExclusiveLoopSources,
  setExclusiveLoopSource,
} from "./exclusivity.js";
export type { ClaimExclusivityTarget, OwnerActiveLoopView, OwnerLoopReader } from "./exclusivity.js";
export { classifyPool, poolOf } from "./pool.js";
export type { PoolSnapshot, PoolVerdict } from "./pool.js";
export type { DispatchCoreFailure, DispatchSpawnedResult, DispatchTaskResult } from "./result.js";
export { settleWorkerRun } from "./settle.js";
// 机械③（forge-verification-hardening）——循环侧标记消费：HEAD 真解析 + 计数快照现算
export { gitHeadCommit, computeWaveSnapshot } from "./settle.js";
// AC7 结算旁挂回收（loop-recurrence-hardening §2.4——success 结算后置报告回收进卷宗）
export { createSettleReportRecovery, recoverSettleReports } from "./settle.js";
export type { SettleReportRecoveryDeps } from "./settle.js";
export type { CommitLandingVerifier, LastSettlementView, SettleSettlementsFace, WorkerSettlement } from "./settle.js";
// T3 同缝拦截守卫（loop-recurrence-hardening——claim 面软拒绝消费 + 驱动器 add-fix vars 现查）
export {
  ERR_RECURRENCE_ESCALATION_REQUIRED,
  RECURRENCE_ESCALATION_THRESHOLD,
  REJECTION_LIST_LIMIT,
  isBlindFixDispatch,
  isModelingPending,
  recurrenceCandidateLines,
  recurrenceCountOf,
  recurrenceEscalationGuard,
  rejectionFailureOf,
  sameSeamCountOf,
} from "./claim.js";
export type {
  ModelingReportPresentFace,
  RecurrenceEscalationRejection,
  SameSeamRecurrenceFace,
} from "./claim.js";
// recurrence 生产装配面工厂（loop-recurrence-hardening——bug 0db72bcb 断链修复：两只读 face 单一构造口）
export { createRecurrenceFaces } from "./recurrence-faces.js";
export type { RecurrenceBugsFace, RecurrenceFaces, RecurrenceFacesDeps } from "./recurrence-faces.js";
export type { SpawnWorker, SpawnWorkerHandle, SpawnWorkerRequest } from "./spawn.js";
