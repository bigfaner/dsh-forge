// loop barrel（S1b/S1c 宿主派发循环驱动器单一出口——状态机/登记表/生命周期入口/处置钩子
// 接口/第三层裁决挂钩实装）。消费者：S2 指令层（/run-dag-tasks·/stop-dag-tasks handler）、
// 装配方（triage/escalation 注入）与单测。依赖方向：本面 → dispatch-core / notify / contracts
// 单向；零工具壳 import（可拆卸壳纪律，decisions #10）。
export {
  backoffDelayMs,
  LOOP_BACKOFF_BASE_MS,
  LOOP_INSTRUCTION_ALL_DONE,
  LOOP_PATIENCE_MAX_WAIT_ROUNDS,
  LOOP_PATIENCE_PAUSE_MS,
  LOOP_STOP_TRANSITION_REASON,
  LOOP_TRIAGE_MAX_ATTEMPTS,
  LOOP_WORKER_ABORT_MAX_RETRIES,
  createLoopDriver,
  loopInstructionOf,
} from './driver.js'
export type {
  LoopDriver,
  LoopDriverDeps,
  LoopEscalation,
  LoopEscalationHook,
  LoopStartInput,
  LoopStartResult,
  LoopStopResult,
  LoopTriageDecision,
  LoopTriageHook,
  LoopTriageInput,
} from './driver.js'
// S1c 第三层人工裁决挂钩（userQuestions 面实装——问询材料纯函数 + fail-soft 投递 + 裁决回执）
export { askOption, createUserQuestionsEscalation, renderEscalationAsk, renderEscalationReceipt } from './escalation.js'
export type {
  AskOutcome,
  EscalationAskFace,
  EscalationAskMaterial,
  EscalationAskOption,
  EscalationAskQuestion,
  UserQuestionsEscalationDeps,
} from './escalation.js'
export { createLoopRegistry } from './registry.js'
export type { LoopInFlight, LoopInstanceId, LoopRecord, LoopRegistry, LoopSourceRef } from './registry.js'
