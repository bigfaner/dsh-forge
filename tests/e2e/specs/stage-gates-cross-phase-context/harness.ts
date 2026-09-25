// tests/e2e/specs/stage-gates-cross-phase-context/harness — the journey's
// worlds (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-
// context/contracts/step-{1..7}-*.md. Worlds:
//   main  — feature `gate-loop` at tasks(中间阶段;docKinds [prd, design]
//           ⇒ 派发产物齐),stage asset prd.md(先行阶段锚 = 注入的旧锚),
//           stages/tasks.md 缺席 ⇒ 门 pending 语料;tasks:
//             1 pending(警告/推进前骑手)
//             2 pending(推进后新阶段注入骑手)
//             3 in_progress(单执行者对照 + in-progress 产物行满足者);
//   early — feature `gate-early` at prd(早期阶段,零 stages/ ⇒ asset-empty)。

import { buildKernelWorld, type KernelWorld, type TaskSpec } from '../_lib/journey-world.ts'

export const GATE_FEATURE = 'gate-loop'
export const EARLY_FEATURE = 'gate-early'

export const TASK_1 = `${GATE_FEATURE}/1`
export const TASK_2 = `${GATE_FEATURE}/2`

/** 逐字锚点(资产内容一致断言)。 */
export const PRD_GOAL = 'gate-loop 先行阶段(prd)目标锚点'
export const TASKS_GOAL = 'gate-loop tasks 阶段目标锚点 — 阶段门验收旅程(拒绝/生成/推进/注入/偏离)'
export const TASKS_SUMMARY_MARK = 'gate-loop tasks 摘要锚点 — 门校验、资产面板与新阶段注入三链路。'

const MAIN_TASKS: readonly TaskSpec[] = [
  { stem: '1-x', localId: '1', title: '阶段门骑手任务一(gate-loop)', status: 'pending', type: 'coding.feature', dependencies: [] },
  { stem: '2-x', localId: '2', title: '新阶段注入骑手任务二(gate-loop)', status: 'pending', type: 'coding.feature', dependencies: [] },
  { stem: '3-x', localId: '3', title: '进行中对照任务三(gate-loop,单执行者)', status: 'in_progress', type: 'coding.feature', dependencies: [] },
]

/** The main world (gate-pending at tasks; the prd asset = the OLD injection anchor). */
export async function buildMainWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, {
    feature: { slug: GATE_FEATURE, status: 'tasks', docKinds: ['prd', 'design'] },
    tasks: MAIN_TASKS,
    stageAssets: [{ stage: 'prd', goal: PRD_GOAL, summaryMark: 'gate-loop prd 摘要锚点。' }],
  })
}

/** The early world (prd stage, zero stage assets — the asset-empty leg). */
export async function buildEarlyWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, {
    feature: { slug: EARLY_FEATURE, status: 'prd', docKinds: [] },
    tasks: [{ stem: '1-x', localId: '1', title: '早期占位任务(gate-early)', status: 'pending', type: 'coding.feature', dependencies: [] }],
  })
}
