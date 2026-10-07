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

/**
 * 全局拒绝集（一切 worker——安全面收窄，与任务类型无关）；`skill` 不拒。
 * 语义族四门（Interface 2：ask-user / delegation / todo / present），名 = 上游 0.2.0-rc.2
 * 组合实面实名（fix-1 / drift #10：driver `tools.restrict()` 对未知名 loud 校验，族代称
 * 入表会拆一切 spawn——3.9 实跑证据 dispatch-round 附已知名表全文）：
 * ask_user_question（ask-user）· delegation 族五员 = subagent_fork / list_agents /
 * send_message / interrupt_agent / workflow（上游 delegation 组合实注册面）·
 * todo_write（todo）· present（实名恰同）。
 * 刻意不入：spawn provider 的 `subagent` 工具为惰性注册（provider 缺席即不在场——
 * dsh-tool-subagent 延迟挂载 fail-soft），入表会在其缺席环境复现 unknown-name 拆 spawn。
 */
export const WORKER_GLOBAL_DENY_TOOLS = [
  'ask_user_question',
  'subagent_fork',
  'list_agents',
  'send_message',
  'interrupt_agent',
  'workflow',
  'todo_write',
  'present',
] as const

/** forge 工具族的面 = 恰两动词（claimTask/queryTask/dispatchTask 不入 worker 面——SC7/SC2 断言） */
export const WORKER_FORGE_TOOLS = ['submitTask', 'addTask'] as const

/**
 * 工具名 → 工具族映射表（OQ#2 兑现·5.1：上游 0.2.0-rc.2 standard 预设组合实面枚举核对入表；
 * 逐名机械核对记录随 G1 pin #20 归档——tests/contract/pin-12-worker-tool-names.test.ts，
 * 上游组合演进 → pin 红 → 本表随迁。core/plugin/web 禁重复定义）。
 * 核对源（@deepseek-ai/dsh-web-app presets/standard.patch.yml 组合行 × 包内工具名）：
 *   fs   ← dsh-tool-fs（read/write/edit）+ dsh-tool-fs-search（glob/grep）
 *   shell← dsh-tool-bash（bash）+ dsh-tool-pwsh（pwsh）——平台 disabled 行恒入表（win 域二名并存）
 *   jobs ← dsh-tool-jobs（job_list/job_output/job_kill）
 *   read-image ← dsh-tool-fs 的 read_image（独立族——矩阵单独收窄）
 *   web ← dsh-tool-web（web_fetch/web_search）
 *   forge ← 我方 WORKER_FORGE_TOOLS（submitTask/addTask）
 * 不入表（非六族矩阵收窄面）：skill（恒在场不拒）/ goal 三命令 / plan-mode exit_plan_mode /
 * delegation 族与 ask-user/todo/present（= WORKER_GLOBAL_DENY_TOOLS 承载）/ subagent（惰性
 * 注册面——provider 缺席即不在场，刻意不 deny 亦不入族）。
 */
export const WORKER_TOOL_NAME_FAMILY: Readonly<Record<string, WorkerToolFamily>> = {
  // forge 面（我方——WORKER_FORGE_TOOLS 单源子集）
  submitTask: 'forge',
  addTask: 'forge',
  // fs 读写/搜索（上游 dsh-tool-fs / dsh-tool-fs-search）
  read: 'fs',
  write: 'fs',
  edit: 'fs',
  glob: 'fs',
  grep: 'fs',
  // shell（上游 dsh-tool-bash / dsh-tool-pwsh）
  bash: 'shell',
  pwsh: 'shell',
  // jobs 长跑（上游 dsh-tool-jobs）
  job_list: 'jobs',
  job_output: 'jobs',
  job_kill: 'jobs',
  // read_image（上游 dsh-tool-fs——UI 断言截图面独立成族）
  read_image: 'read-image',
  // web（上游 dsh-tool-web）
  web_fetch: 'web',
  web_search: 'web',
}
