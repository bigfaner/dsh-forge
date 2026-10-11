// loop barrel（S1b 宿主派发循环驱动器单一出口——状态机/登记表/生命周期入口/处置钩子接口）。
// 消费者：S2 指令层（/run-dag-tasks·/stop-dag-tasks handler）与单测。依赖方向：本面 →
// dispatch-core / notify / contracts 单向；零工具壳 import（可拆卸壳纪律，decisions #10）。
export {
  LOOP_BACKOFF_BASE_MS,
  LOOP_INSTRUCTION_ALL_DONE,
  LOOP_PATIENCE_MAX_WAIT_ROUNDS,
  LOOP_PATIENCE_PAUSE_MS,
  LOOP_STOP_TRANSITION_REASON,
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
export { createLoopRegistry } from './registry.js'
export type { LoopInFlight, LoopInstanceId, LoopRecord, LoopRegistry, LoopSourceRef } from './registry.js'
