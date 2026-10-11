// dispatch-core · worker persona 合成（S2 分层承载——worker-lean-execution 提案）。
// 承载通道：合成产出的 personaText → SpawnWorkerRequest.persona → 上游
// SubagentStartRequest.persona（optionalString 无长度上限）→ 子会话 scoped
// 'deployment:persona-prefix' 段遮蔽部署人格（dsh-subagent applyChildComposition 源码级
// 验证）。上游 persona 严格 {{}} 插值 → 本合成禁产裸 '{{'（单测锚）。任务面/人格面分层：
// persona 只装 agent 级（专家身份 + 工作流 + 门纪律），任务规格仍独走 dispatchPrompt——
// personaText 不进 prompt（AC-4）。本文本 = 通道落地的最小 persona（族路由 + 复杂度分级
// 骨架）；S2a 完整组成矩阵（核心段①-⑧ + 20 类型变体表）在本单点扩写——路由面已按
// taskType + complexity 参数化，扩写零改消费者。
import type { TaskComplexity, TaskType } from '@dsh-forge/contracts'
import { WORKER_TASK_FAMILY_BY_TYPE, type WorkerTaskFamily } from '@dsh-forge/contracts'

/** 类型族 → 专家身份（S2a 变体段首行的族级先形——类型级细分由 S2a 矩阵扩写） */
const FAMILY_IDENTITY: Readonly<Record<WorkerTaskFamily, string>> = {
  coding: '你是资深交付工程师：以最小改动把任务规格落成可交付代码，尊重现状、克制扩张。',
  doc: '你是技术作家：以读者视角落笔，结构与准确性并重，不虚构未核实的细节。',
  gate: '你是质量门守卫：只认全绿证据，不放行任何红灯，如实报告门结果。',
  validation: '你是验证员：证据导向，只记发现与判读，不越权修改代码。',
}

/** 复杂度 → 门纪律分级（S2a 变体段第二维的先形：low 裁剪保底、medium/high 全门） */
const COMPLEXITY_GATE: Readonly<Record<TaskComplexity, string>> = {
  low: '质量门（分级·low）：改动文件的 lint + 改动包的类型检查 + 改动模块定向单测，一次修全后复跑一次。',
  medium: '质量门（分级·medium）：受影响包类型检查 + 改动文件 lint + 改动包定向单测，一次修全后复跑一次。',
  high: '质量门（分级·high）：受影响包类型检查 + 改动文件 lint + 改动包定向单测，按类型门纪律表全走，一次修全后复跑一次。',
}

/**
 * worker persona 合成（纯函数零 IO）：claimed.task 的 taskType + complexity → personaText。
 * 一切类型产出非空文本（上游 persona 段遮蔽部署人格——空串会被 optionalString 判缺席，
 * 分层承载退化为父格人格，故 fail-loud 由类型穷尽性保证）。
 */
export function composeWorkerPersona(taskType: TaskType, complexity: TaskComplexity): string {
  const identity = FAMILY_IDENTITY[WORKER_TASK_FAMILY_BY_TYPE[taskType]]
  return [identity, COMPLEXITY_GATE[complexity], '先思考定方案与改动范围再动手；失败先分诊（简单故障内联修 ≤3 次，复发即 blocked），如实上报，不越权。'].join('\n')
}
