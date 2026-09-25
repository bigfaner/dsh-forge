// tests/e2e/specs/task-dispatch-execution-loop/harness — the journey's corpus
// worlds (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/
// contracts/step-{1..7}-*.md (fixture_spec entities per step are served by the
// worlds below; see each step spec's header for the outcome mapping).
//
// Worlds:
//   main     — feature `disp-loop` at status in-progress (contract step-2
//              artifacts-complete fixture), docKinds [prd, design], stage
//              asset stages/design.md (element ② anchor), tasks:
//                0 in_progress        — the in-progress artifacts row satisfier
//                                       + single-executor contrast + blocker
//                1..3 pending zero-dep — the parallel trio (distinct types)
//                4 pending deps [0]    — the deps-unmet occupant (0 not terminal)
//                5 pending zero-dep    — the second-dispatch / failure-leg rider
//   missing   — feature `disp-missing` at status tasks, docKinds [prd] only,
//              stage asset stages/prd.md — the artifacts-missing warning corpus
//              (SC4 shape: exactly one missing item design/).
//   restricted — feature `disp-restricted` at status tasks, docKinds
//              [prd, design], stage asset prd.md, one pending `eval.contract`
//              task — the type-not-dispatchable corpus (DISPATCH_RESTRICTED_*
//              member; templates.ts:2204).

import { buildKernelWorld, type KernelWorld, type TaskSpec } from '../_lib/journey-world.ts'

export const FEATURE = 'disp-loop'
export const MISSING_FEATURE = 'disp-missing'
export const RESTRICTED_FEATURE = 'disp-restricted'

export const TASK_0 = `${FEATURE}/0`
export const TASK_1 = `${FEATURE}/1`
export const TASK_2 = `${FEATURE}/2`
export const TASK_3 = `${FEATURE}/3`
export const TASK_4 = `${FEATURE}/4`
export const TASK_5 = `${FEATURE}/5`
export const MISSING_TASK = `${MISSING_FEATURE}/1`
export const RESTRICTED_TASK = `${RESTRICTED_FEATURE}/1`

const MAIN_TASKS: readonly TaskSpec[] = [
  { stem: '0-x', localId: '0', title: '占用任务(disp-loop 单执行者对照,已在执行)', status: 'in_progress', type: 'coding.feature', dependencies: [] },
  { stem: '1-x', localId: '1', title: '并行任务一(disp-loop,coding.feature 协议)', status: 'pending', type: 'coding.feature', dependencies: [] },
  { stem: '2-x', localId: '2', title: '并行任务二(disp-loop,coding.fix 协议)', status: 'pending', type: 'coding.fix', dependencies: [] },
  { stem: '3-x', localId: '3', title: '并行任务三(disp-loop,coding.enhancement 协议)', status: 'pending', type: 'coding.enhancement', dependencies: [] },
  { stem: '4-x', localId: '4', title: '依赖未满足任务(disp-loop,blocker = 任务 0 未终态)', status: 'pending', type: 'coding.feature', dependencies: ['0'] },
  { stem: '5-x', localId: '5', title: '二次派发任务(disp-loop,coding.feature 协议)', status: 'pending', type: 'coding.feature', dependencies: [] },
]

/** The protocol sentences the three distinct types route to (element ① anchors). */
export const PROTOCOL_SENTENCES: Readonly<Record<string, string>> = {
  [TASK_1]: 'You are a focused task executor implementing a new feature.',
  [TASK_2]: 'You are a focused task executor fixing compilation errors, test failures, and verification issues.',
  [TASK_3]: 'You are a focused task executor enhancing an existing feature.',
}

/** The main world (artifacts-complete at in-progress; the parallel trio). */
export async function buildMainWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, {
    feature: { slug: FEATURE, status: 'in-progress', docKinds: ['prd', 'design'] },
    tasks: MAIN_TASKS,
    stageAssets: [{ stage: 'design', goal: 'disp-loop 目标锚点 — 并行派发执行闭环旅程的目标(要素②载体)', summaryMark: 'disp-loop 摘要锚点 — 看板派发 / 预合成 / 审批 / 回流四链验收。' }],
  })
}

/** The artifacts-missing world (design/ absent ⇒ exactly one missing item). */
export async function buildMissingWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, {
    feature: { slug: MISSING_FEATURE, status: 'tasks', docKinds: ['prd'] },
    tasks: [{ stem: '1-x', localId: '1', title: '警告不阻断腿任务(disp-missing,coding.feature 协议)', status: 'pending', type: 'coding.feature', dependencies: [] }],
    stageAssets: [{ stage: 'prd', goal: 'disp-missing 目标锚点 — 警告门旅程的目标', summaryMark: 'disp-missing 摘要锚点。' }],
  })
}

/** The restricted-type world (eval.contract — dispatch-restricted member). */
export async function buildRestrictedWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, {
    feature: { slug: RESTRICTED_FEATURE, status: 'tasks', docKinds: ['prd', 'design'] },
    tasks: [{ stem: '1-x', localId: '1', title: '受限类型任务(disp-restricted,eval.contract 协议)', status: 'pending', type: 'eval.contract', dependencies: [] }],
    stageAssets: [{ stage: 'prd', goal: 'disp-restricted 目标锚点', summaryMark: 'disp-restricted 摘要锚点。' }],
  })
}
