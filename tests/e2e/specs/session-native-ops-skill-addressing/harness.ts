// tests/e2e/specs/session-native-ops-skill-addressing/harness — the journey's
// worlds (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m3/testing/session-native-ops-skill-
// addressing/contracts/step-{1..4}-*.md. The journey's 测试通道 = the preload
// bridge verb face (the tool-bridge pump's same verb face): harness 在页面
// exec 上下文直接调用 dsh 动词集(与 agent 会话调用同面),身份供给 =
// `session:<id>` actor 入参,边界态(非法 taskKey/无身份/非权威)经通道构造。
//
// Worlds:
//   main  — feature `sess-ops`(migrated):tasks
//             1 pending 零依赖(claim/submit rider)
//             2 completed(illegal-transition 靶)
//             3 pending deps[4](依赖未满足)
//             4 in_progress(3 的未终态 blocker);
//   files — 同型项目但未迁移(data_authority=files;权威闸腿)。

import { buildKernelWorld, type KernelWorld, type TaskSpec } from '../_lib/journey-world.ts'

export const SESS_FEATURE = 'sess-ops'
export const TASK_1 = `${SESS_FEATURE}/1`
export const TASK_2 = `${SESS_FEATURE}/2`
export const TASK_3 = `${SESS_FEATURE}/3`
export const TASK_4 = `${SESS_FEATURE}/4`

const TASKS: readonly TaskSpec[] = [
  { stem: '1-x', localId: '1', title: '会话操作腿任务(sess-ops,pending)', status: 'pending', type: 'coding.feature', dependencies: [] },
  { stem: '2-x', localId: '2', title: '终态任务(sess-ops,completed 靶)', status: 'completed', type: 'coding.feature', dependencies: [] },
  { stem: '3-x', localId: '3', title: '依赖未满足任务(sess-ops,blocker = 4)', status: 'pending', type: 'coding.feature', dependencies: ['4'] },
  { stem: '4-x', localId: '4', title: '进行中任务(sess-ops,in_progress blocker)', status: 'in_progress', type: 'coding.feature', dependencies: [] },
]

const SHAPE = { slug: SESS_FEATURE, status: 'tasks', docKinds: ['prd', 'design'] }

/** The migrated world (sqlite authority — the dsh tool write set's home). */
export async function buildMainWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, { feature: SHAPE, tasks: TASKS })
}

/** The files-authority world (the authority-gate leg). */
export async function buildFilesWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, { feature: SHAPE, tasks: TASKS, migrate: false })
}
