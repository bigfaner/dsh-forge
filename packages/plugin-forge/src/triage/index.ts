// triage barrel（S1c 第二层处置代理单一出口——决策解析/提示词/钩子实装）。
// 消费者：装配方（deps.triage 注入循环驱动器）与单测。依赖方向：本面 → loop / dispatch-core
// / contracts 单向（驱动器零 import 本面——钩子接口在 loop/driver.ts，注入即解耦）。
export { extractDecisionJson, parseTriageDecision, TriageDecisionInvalidError } from './decision.js'
export { composeTriagePrompt } from './prompt.js'
export type { TriagePromptInput } from './prompt.js'
export { createTriageHook } from './triage.js'
export type { TriageHookDeps } from './triage.js'
