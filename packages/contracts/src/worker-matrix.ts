// M3 worker 收窄矩阵常量（tech-design §Interface 2 收窄矩阵表逐格对照——G1-20 pin 对象）。
// dispatchTask 按 claim 到的 task.taskType 查表得 toolFilter（childCtx.tools.restrict 面）：
// 任务类型族 × 工具族 ✓ 表 + 全局拒绝集（一切 worker）+ forge 面 = submitTask + addTask。
// 定位铁律：纯常量与类型，零逻辑零依赖（派生组装归 plugin-forge dispatch-task）。
import type { TaskType } from './labels.js'

/** worker 任务类型族四值（Interface 2 脚注：coding¹ / doc² / gate / 验证³） */
export const WORKER_TASK_FAMILIES = ['coding', 'doc', 'gate', 'validation'] as const

export type WorkerTaskFamily = (typeof WORKER_TASK_FAMILIES)[number]

/**
 * 任务类型 → 族 exhaustive 映射（TASK_TYPES 20 值四族分割——判别单测锚）。
 * ¹ coding：coding-feature/enhancement/cleanup/refactor/code-quality-simplify/coding-fix/
 *   test-gen 三值与 test-run；² doc：doc/doc-consolidate/doc-drift/doc-review/doc-summary；
 *   验证：validation-code/validation-ux/eval-contract/eval-journey；gate 单值成族。
 */
export const WORKER_TASK_FAMILY_BY_TYPE: Readonly<Record<TaskType, WorkerTaskFamily>> = {
  'coding-feature': 'coding',
  'coding-enhancement': 'coding',
  'coding-cleanup': 'coding',
  'coding-refactor': 'coding',
  'code-quality-simplify': 'coding',
  'coding-fix': 'coding',
  'test-run': 'coding',
  'test-gen-contracts': 'coding',
  'test-gen-journeys': 'coding',
  'test-gen-scripts': 'coding',
  doc: 'doc',
  'doc-consolidate': 'doc',
  'doc-drift': 'doc',
  'doc-review': 'doc',
  'doc-summary': 'doc',
  gate: 'gate',
  'validation-code': 'validation',
  'validation-ux': 'validation',
  'eval-contract': 'validation',
  'eval-journey': 'validation',
}

/** worker 工具族六值（Interface 2 矩阵行——fs 读写/搜索、shell、jobs、read_image、web、forge） */
export const WORKER_TOOL_FAMILIES = ['fs', 'shell', 'jobs', 'read-image', 'web', 'forge'] as const

export type WorkerToolFamily = (typeof WORKER_TOOL_FAMILIES)[number]

/**
 * 收窄矩阵本体：任务类型族 × 工具族 ✓ 表（true = 放行；false = 该族工具对 worker 收窄拒绝）。
 * Interface 2 逐格：fs 全放；shell 全放（doc 亦仓库变更）；jobs gate/验证可长跑、doc 无；
 * read_image = coding（UI 断言截图）+ 验证；web 仅验证；forge 面（submitTask + addTask）全放。
 */
export const WORKER_TOOL_MATRIX: Readonly<
  Record<WorkerTaskFamily, Readonly<Record<WorkerToolFamily, boolean>>>
> = {
  coding: { fs: true, shell: true, jobs: true, 'read-image': true, web: false, forge: true },
  doc: { fs: true, shell: true, jobs: false, 'read-image': false, web: false, forge: true },
  gate: { fs: true, shell: true, jobs: true, 'read-image': false, web: false, forge: true },
  validation: { fs: true, shell: true, jobs: true, 'read-image': true, web: true, forge: true },
}

/** 全局拒绝集（一切 worker——安全面收窄，与任务类型无关）；`skill` 不拒 */
export const WORKER_GLOBAL_DENY_TOOLS = ['ask-user', 'delegation', 'todo', 'present'] as const

/** forge 工具族的面 = 恰两动词（claimTask/queryTask/dispatchTask 不入 worker 面——SC7/SC2 断言） */
export const WORKER_FORGE_TOOLS = ['submitTask', 'addTask'] as const

/**
 * 工具名 → 工具族映射表骨架（OQ#2：具体工具名 = 实施期按当期上游工具面枚举核对 + G1 pin，
 * 逐工具名 pin 随 5.1 兑现——本表只落当前确证的 forge 面；core/plugin/web 禁重复定义）。
 */
export const WORKER_TOOL_NAME_FAMILY: Readonly<Record<string, WorkerToolFamily>> = {
  submitTask: 'forge',
  addTask: 'forge',
}
