// loop barrel（宿主派发循环驱动器单一出口——状态机/登记表/生命周期入口/处置钩子接口/
// 第三层裁决挂钩实装）。消费者：指令层（/run-dag-tasks·/stop-dag-tasks handler）、
// 装配方（triage/escalation 注入）与单测。依赖方向：本面 → dispatch-core / notify /
// progress / domain 单向；零工具壳 import（可拆卸壳纪律）。
// slug 化类型/接口单源：driver-face.ts（工具壳/指令壳消费 seam）与 registry.ts（slug 终态）——
// 本 barrel 从单源面转出口，driver.ts 只落实装与自有类型。
export {
  backoffDelayMs,
  LOOP_BACKOFF_BASE_MS,
  LOOP_INSTRUCTION_ALL_DONE,
  LOOP_MAX_ROUNDS,
  LOOP_PATIENCE_MAX_WAIT_ROUNDS,
  LOOP_PATIENCE_PAUSE_MS,
  LOOP_QUIESCENCE_POLL_MS,
  LOOP_QUIESCENCE_WINDOW_MS,
  LOOP_RESUME_RESTORE_REASON,
  LOOP_STOP_TRANSITION_REASON,
  LOOP_TRIAGE_MAX_ATTEMPTS,
  LOOP_WORKER_ABORT_MAX_RETRIES,
  TRIAGE_EXPERT_KEY,
  TRIAGE_FIX_CHAIN_DEPTH_LIMIT,
  createLoopDriver,
  flywheelMetricsOf,
  isRateLimitFailure,
  isTriageInvalidOutput,
  loopInstructionOf,
  renderRetroInstruction,
  testBaselineBriefOf,
  triageFailureSummary,
} from "./driver.js";
export type {
  FlywheelMetrics,
  LoopCheckpointRowLite,
  LoopCheckpointSnapshot,
  LoopCheckpointsFace,
  LoopDiagPayload,
  LoopDiagSink,
  LoopDriverDeps,
  LoopTriageDecision,
  LoopTriageDecisionResult,
  LoopTriageFixChain,
  LoopTriageHook,
  LoopTriageInput,
} from "./driver.js";
// 生命周期 seam 类型（工具壳/指令壳消费单源——driver-face.ts）
export type {
  LoopDriver,
  LoopEscalation,
  LoopEscalationHook,
  LoopPauseResult,
  LoopResumeResult,
  LoopStartInput,
  LoopStartResult,
  LoopStopLoopResult,
  LoopStopResult,
  LoopToolDeps,
  TriageEscalationPayload,
} from "./driver-face.js";
// 第三层人工裁决挂钩（userQuestions 面实装——问询材料纯函数 + fail-soft 投递 + 裁决回执；
// 问询收束协议单源 = escalation-ask.ts，既有 askOption/EscalationAskFace seam 全保留）
export {
  askOption,
  createUserQuestionsEscalation,
  renderEscalationAsk,
  renderEscalationReceipt,
} from "./escalation-ask.js";
export type {
  AskOutcome,
  EscalationAskFace,
  EscalationAskMaterial,
  EscalationAskOption,
  EscalationAskQuestion,
  UserQuestionsEscalationDeps,
} from "./escalation-ask.js";
export { createLoopRegistry } from "./registry.js";
export type { LoopInFlight, LoopInstanceId, LoopRecord, LoopRegistry, LoopSourceRef, SuspendedPayload } from "./registry.js";
// 动态注入（模板正本 + section 纯投影——装配方 systemPrompt 注册消费）
export {
  FORGE_DISPATCH_LOOP_SECTION_NAME,
  FORGE_DISPATCH_LOOP_SECTION_ORDER_OFFSET,
  LOOP_REVIEW_EXPERT_KEYS,
  detectResidualPlaceholder,
  payloadOf,
  renderEndOfLoop,
  renderInjection,
  renderP1,
  renderP3,
  renderP5,
  renderP6,
  renderP7,
  renderP8,
  renderP9,
} from "./injection.js";
export type { EndOfLoopKind, InjectionPayload } from "./injection.js";
// 改进7 · e2e 红灯基线门（宿主装配面真接线——bug ca061ef6）
export {
  createE2eBaselineFace,
  E2E_BASELINE_SUITE_TIMEOUT_MS,
  attributionTaskInput,
  baselineForHead,
  issueAttributionCard,
  parseE2eRedCases,
  runE2eBaseline,
} from "./e2e-baseline.js";
export type { E2eBaselineFaceDeps, E2eBaselineCache, E2eBaselineRedList } from "./e2e-baseline.js";
